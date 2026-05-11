/**
 * Dual-path observer handler:
 * 1. Curated — researcher selects people via multi_users_select
 * 2. Opportunistic — channel CTA button, self-join via session picker
 */

const sessionObserverService = require('../../../services/session_observer.service');
const studyParticipantService = require('../../../services/study_participant.service');
const { getStudiesByUser, getResearchStudyWithRoles } = require('../../../services/research_study.service');
const { sendObserverGuideDM } = require('../ui/observerGuideDM');
const { buildSelfJoinSessionPickerModal } = require('../ui/selfJoinSessionPickerModal');
const { refreshDashboardAfterAction } = require('./fieldworkHandler');
const { processObserverYamlTemplate } = require('../../observerYamlProcessor');
const { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } = require('../../github');

// ── Helpers ────────────────────────────────────────────────

/**
 * Update the GitHub participant tracker with current observer data.
 * Non-fatal — logs a warning on failure so the main flow isn't blocked.
 */
const updateObserverTracker = async (studyId, studyName, studyPath) => {
  try {
    const yamlFile = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, 'participant_tracker.yaml');
    if (!yamlFile || !yamlFile.content) return;

    const allObservers = await sessionObserverService.getObserversByStudy(studyId);
    const allParticipants = await studyParticipantService.getParticipantsByStudy(studyId);

    await processObserverYamlTemplate(
      yamlFile.content,
      { study_id: studyId, study_name: studyName, current_date: new Date().toISOString().split('T')[0] },
      studyPath || '',
      'primary-research',
      allObservers,
      allParticipants,
    );
    console.log('✅ Observer tracker updated for study:', studyName);
  } catch (err) {
    console.warn('⚠️ Could not update observer tracker:', err.message);
  }
};

const ROLE_DISPLAY = {
  note_taker: '📝 Note-taker',
  silent_observer: '👁️ Silent Observer',
  pm_observer: '📊 PM Observer',
  stakeholder: '🏛️ Stakeholder',
};

/**
 * Parse the session value from the modal (format: "PT-001|1").
 */
const parseSessionValue = (value) => {
  const [sessionId, participantIdStr] = value.split('|');
  return { sessionId, participantId: parseInt(participantIdStr, 10) };
};

/**
 * Format a date range string from participant scheduled_dates.
 */
const formatDateRange = (participants) => {
  const dates = participants
    .map(p => p.scheduled_date)
    .filter(Boolean)
    .sort();
  if (dates.length === 0) return 'TBD';
  if (dates.length === 1) return dates[0];
  return `${dates[0]} – ${dates[dates.length - 1]}`;
};

// ── Handler: Add observer modal submission ─────────────────

const handleAddObserverSubmission = async ({ ack, body, client, view }) => {
  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  const { studyId, studyName, channelId, userId, rootViewId } = meta;

  // Extract form values
  const selectedSessionValues = values.observer_sessions_block?.observer_sessions?.selected_options?.map(o => o.value) || [];
  const selectedUsers = values.observer_people_block?.observer_people?.selected_users || [];
  const selectedRole = values.observer_role_block?.observer_role?.selected_option?.value || 'silent_observer';
  const ctaChecked = (values.observer_channel_cta_block?.observer_channel_cta?.selected_options || [])
    .some(o => o.value === 'post_channel_cta');

  // Validate: at least one session
  if (selectedSessionValues.length === 0) {
    return ack({
      response_action: 'errors',
      errors: { observer_sessions_block: 'Select at least one session.' },
    });
  }

  // Validate: at least one path chosen
  if (selectedUsers.length === 0 && !ctaChecked) {
    return ack({
      response_action: 'errors',
      errors: { observer_people_block: 'Select people or check the channel invite option.' },
    });
  }

  // Atomic cap check for curated path (overall + per-role)
  if (selectedUsers.length > 0) {
    for (const sv of selectedSessionValues) {
      const { sessionId } = parseSessionValue(sv);
      const result = await sessionObserverService.canAddObserversToSession(sessionId, selectedUsers.length, selectedRole);
      if (!result.allowed) {
        const roleLabel = ROLE_DISPLAY[selectedRole] || selectedRole;
        const msg = result.reason === 'role_full'
          ? `${roleLabel} slot is full for ${sessionId}. Try a different role.`
          : `${sessionId} has ${result.slotsRemaining} slot${result.slotsRemaining === 1 ? '' : 's'} remaining. Cannot add ${selectedUsers.length} observer${selectedUsers.length === 1 ? '' : 's'}.`;
        return ack({
          response_action: 'errors',
          errors: { observer_sessions_block: msg },
        });
      }
    }
  }

  // Ack — close the modal
  await ack({ response_action: 'clear' });

  try {
    const addedUsers = [];

    // ── Curated path ────────────────────────────────────
    if (selectedUsers.length > 0) {
      for (const slackUserId of selectedUsers) {
        let userInfo;
        try {
          userInfo = await client.users.info({ user: slackUserId });
        } catch (e) {
          console.error('Failed to fetch user info for', slackUserId, e.message);
          continue;
        }
        const displayName = userInfo.user?.real_name || userInfo.user?.name || slackUserId;

        for (const sv of selectedSessionValues) {
          const { sessionId, participantId } = parseSessionValue(sv);
          const { observer, created } = await sessionObserverService.addConfirmedObserver({
            session_id: sessionId,
            study_id: studyId,
            participant_id: participantId,
            requester_id: slackUserId,
            requester_name: displayName,
            joined_via: 'researcher_add',
            role: selectedRole,
          });
          if (created) {
            await sessionObserverService.markGuidelinesSent(observer.id);
          }
        }

        // One guide DM per user, not per session
        await sendObserverGuideDM(client, slackUserId, studyName);
        addedUsers.push(displayName);
      }
    }

    // ── Channel CTA path ────────────────────────────────
    let ctaPosted = false;
    let ctaChannelName = '';
    if (ctaChecked) {
      // Resolve channel info
      const targetChannel = channelId;
      try {
        const channelInfo = await client.conversations.info({ channel: targetChannel });
        ctaChannelName = channelInfo.channel?.name || targetChannel;
      } catch (e) {
        ctaChannelName = targetChannel;
      }

      // Get researcher display name
      let researcherName = 'A researcher';
      try {
        const userInfo = await client.users.info({ user: userId });
        researcherName = userInfo.user?.real_name || userInfo.user?.name || 'A researcher';
      } catch (e) { /* use fallback */ }

      // Get date range
      const participants = await studyParticipantService.getParticipantsByStudy(studyId);
      const dateRange = formatDateRange(participants);

      // Build session labels for the CTA
      const sessionLabels = selectedSessionValues.map(sv => {
        const { sessionId } = parseSessionValue(sv);
        return sessionId;
      });

      await client.chat.postMessage({
        channel: targetChannel,
        text: `${researcherName} is running fieldwork for ${studyName}. Sessions ${dateRange}. Want to observe? Click below — you'll get a DM with the observer guide.`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${researcherName}* is running fieldwork for *${studyName}*.\nSessions ${dateRange}.\n\nWant to observe? Click below — you'll get a DM with the observer guide.`,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Join as observer' },
                style: 'primary',
                action_id: 'self_join_observer',
                value: JSON.stringify({
                  studyId,
                  studyName,
                  sessionIds: selectedSessionValues,
                }),
              },
            ],
          },
        ],
      });
      ctaPosted = true;
    }

    // ── Researcher confirmation DM ──────────────────────
    const parts = [];
    if (addedUsers.length > 0) {
      const sessionLabels = selectedSessionValues.map(sv => parseSessionValue(sv).sessionId);
      const roleLabel = ROLE_DISPLAY[selectedRole] || selectedRole;
      parts.push(`Added ${addedUsers.length} observer${addedUsers.length === 1 ? '' : 's'} (${roleLabel}) across ${sessionLabels.join(', ')}.`);
    }
    if (ctaPosted) {
      parts.push(`Posted invite to #${ctaChannelName}.`);
    }

    if (parts.length > 0) {
      await client.chat.postMessage({
        channel: userId,
        text: parts.join(' '),
      });
    }

    // ── Update participant tracker on GitHub ──────────────
    const study = await getResearchStudyWithRoles(studyName);
    await updateObserverTracker(studyId, studyName, study?.path);

    // ── Refresh dashboard ───────────────────────────────
    if (rootViewId) {
      await refreshDashboardAfterAction(client, rootViewId, studyId, userId, channelId, studyName);
    }
  } catch (error) {
    console.error('handleAddObserverSubmission error:', error.message);
  }
};

// ── Handler: Self-join CTA button click ────────────────────

const handleSelfJoinObserver = async ({ ack, body, client }) => {
  await ack();

  try {
    const { studyId, studyName, sessionIds } = JSON.parse(body.actions[0].value);

    // Build session list with current counts for the picker
    const allSessions = await sessionObserverService.buildSessionsWithCounts(studyId);
    const ctaSessions = sessionIds
      ? allSessions.filter(s => sessionIds.includes(s.id))
      : allSessions;

    if (ctaSessions.length === 0) {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: 'No sessions available for this study.',
      });
      return;
    }

    const modal = buildSelfJoinSessionPickerModal(ctaSessions, studyName);
    modal.private_metadata = JSON.stringify({
      studyId,
      studyName,
      userId: body.user.id,
      channelId: body.channel.id,
    });

    await client.views.open({
      trigger_id: body.trigger_id,
      view: modal,
    });
  } catch (error) {
    console.error('handleSelfJoinObserver error:', error.message);
  }
};

// ── Handler: Self-join session picker submission ───────────

const handleSelfJoinSubmission = async ({ ack, body, client, view }) => {
  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  const { studyId, studyName, userId: joinerUserId, channelId } = meta;

  const selectedSessionValues = values.self_join_sessions_block?.self_join_sessions?.selected_options?.map(o => o.value) || [];
  const selectedRole = values.self_join_role_block?.self_join_role?.selected_option?.value || 'silent_observer';

  if (selectedSessionValues.length === 0) {
    return ack({
      response_action: 'errors',
      errors: { self_join_sessions_block: 'Select at least one session.' },
    });
  }

  // Cap check (overall + per-role)
  for (const sv of selectedSessionValues) {
    const { sessionId } = parseSessionValue(sv);

    // Skip if already an observer
    const alreadyObserver = await sessionObserverService.isObserverForSession(sessionId, joinerUserId);
    if (alreadyObserver) continue;

    const result = await sessionObserverService.canAddObserversToSession(sessionId, 1, selectedRole);
    if (!result.allowed) {
      const roleLabel = ROLE_DISPLAY[selectedRole] || selectedRole;
      const msg = result.reason === 'role_full'
        ? `${roleLabel} slot is full for ${sessionId}. Try a different role.`
        : `${sessionId} is at capacity (${sessionObserverService.MAX_OBSERVERS_PER_SESSION}/${sessionObserverService.MAX_OBSERVERS_PER_SESSION}). Choose a different session.`;
      return ack({
        response_action: 'errors',
        errors: { self_join_sessions_block: msg },
      });
    }
  }

  await ack({ response_action: 'clear' });

  try {
    // Get joiner display name
    let joinerName = 'Someone';
    try {
      const userInfo = await client.users.info({ user: joinerUserId });
      joinerName = userInfo.user?.real_name || userInfo.user?.name || 'Someone';
    } catch (e) { /* use fallback */ }

    const joinedSessions = [];
    const skippedSessions = [];

    for (const sv of selectedSessionValues) {
      const { sessionId, participantId } = parseSessionValue(sv);

      // Idempotency: skip if already observer
      const alreadyObserver = await sessionObserverService.isObserverForSession(sessionId, joinerUserId);
      if (alreadyObserver) {
        skippedSessions.push(sessionId);
        continue;
      }

      const { observer, created } = await sessionObserverService.addConfirmedObserver({
        session_id: sessionId,
        study_id: studyId,
        participant_id: participantId,
        requester_id: joinerUserId,
        requester_name: joinerName,
        joined_via: 'channel_cta',
        role: selectedRole,
      });

      if (created) {
        await sessionObserverService.markGuidelinesSent(observer.id);
        joinedSessions.push(sessionId);
      }
    }

    // Send guide DM once (not per session)
    if (joinedSessions.length > 0) {
      await sendObserverGuideDM(client, joinerUserId, studyName);

      // Awareness DM to researcher (study creator)
      const study = await getResearchStudyWithRoles(studyName);

      if (study && study.created_by) {
        // Get participant dates for context
        const participants = await studyParticipantService.getParticipantsByStudy(studyId);

        for (const sessionId of joinedSessions) {
          const participant = participants.find(p => `PT-${String(p.id).padStart(3, '0')}` === sessionId);
          const dateStr = participant?.scheduled_date || 'TBD';

          const roleLabel = ROLE_DISPLAY[selectedRole] || selectedRole;
          await client.chat.postMessage({
            channel: study.created_by,
            text: `${joinerName} joined ${sessionId} (${dateStr}) as ${roleLabel} for ${studyName}.`,
          });
        }
      }
    }

    // Ephemeral confirmation to self-joiner
    const parts = [];
    if (joinedSessions.length > 0) {
      const roleLabel = ROLE_DISPLAY[selectedRole] || selectedRole;
      parts.push(`You've been added as ${roleLabel} for ${joinedSessions.join(', ')}. Check your DMs for the observer guide.`);
    }
    if (skippedSessions.length > 0) {
      parts.push(`You were already an observer for ${skippedSessions.join(', ')}.`);
    }

    if (parts.length > 0 && channelId) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: joinerUserId,
        text: parts.join(' '),
      });
    }

    // ── Update participant tracker on GitHub ──────────────
    if (joinedSessions.length > 0) {
      const studyForTracker = await getResearchStudyWithRoles(studyName);
      await updateObserverTracker(studyId, studyName, studyForTracker?.path);
    }
  } catch (error) {
    console.error('handleSelfJoinSubmission error:', error.message);
  }
};

module.exports = {
  handleAddObserverSubmission,
  handleSelfJoinObserver,
  handleSelfJoinSubmission,
};
