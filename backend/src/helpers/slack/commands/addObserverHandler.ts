/**
 * Dual-path observer handler:
 * 1. Curated — researcher selects people via multi_users_select
 * 2. Opportunistic — channel CTA button, self-join via session picker
 */

import type { ViewSubmissionContext, BlockActionContext } from '../../../types/handlers';
import type { View } from '@slack/types';

import sessionObserverService from '../../../services/session_observer.service';
import studyParticipantService from '../../../services/study_participant.service';
import { getStudiesByUser, getResearchStudyWithRoles } from '../../../services/research_study.service';
import { sendObserverGuideDM } from '../ui/observerGuideDM';
import { buildSelfJoinSessionPickerModal } from '../ui/selfJoinSessionPickerModal';
import { refreshDashboardAfterAction } from './fieldworkHandler';
import { processObserverYamlTemplate } from '../../observerYamlProcessor';
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } from '../../github';

// ── Helpers ────────────────────────────────────────────────

const ROLE_DISPLAY: Record<string, string> = {
  note_taker: '📝 Note-taker',
  silent_observer: '👁️ Silent Observer',
  pm_observer: '📊 PM Observer',
  stakeholder: '🏛️ Stakeholder',
};

/**
 * Update the GitHub participant tracker with current observer data.
 * Non-fatal — logs a warning on failure so the main flow isn't blocked.
 */
async function updateObserverTracker(studyId: number, studyName: string, studyPath: string | undefined): Promise<void> {
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
      // @ts-expect-error — pre-existing type mismatch from require() → import migration
      allObservers,
      allParticipants,
    );
    console.log('✅ Observer tracker updated for study:', studyName);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('⚠️ Could not update observer tracker:', message);
  }
}

/**
 * Parse the session value from the modal (format: "PT-001|1").
 */
function parseSessionValue(value: string): { sessionId: string; participantId: number } {
  const [sessionId, participantIdStr] = value.split('|');
  return { sessionId, participantId: parseInt(participantIdStr, 10) };
}

/**
 * Format a date range string from participant scheduled_dates.
 */
function formatDateRange(participants: Array<{ scheduled_date?: string }>): string {
  const dates = participants
    .map(p => p.scheduled_date)
    .filter(Boolean)
    .sort();
  if (dates.length === 0) return 'TBD';
  if (dates.length === 1) return dates[0] as string;
  return `${dates[0]} – ${dates[dates.length - 1]}`;
}

// ── Handler: Add observer modal submission ─────────────────

async function handleAddObserverSubmission({ ack, body, client, view }: ViewSubmissionContext): Promise<void> {
  const values = (view.state as any).values;
  const meta = JSON.parse(view.private_metadata || '{}');
  const { studyId, studyName, channelId, userId, rootViewId } = meta;

  // Extract form values
  const selectedSessionValues: string[] = values.observer_sessions_block?.observer_sessions?.selected_options?.map((o: any) => o.value) || [];
  const selectedUsers: string[] = values.observer_people_block?.observer_people?.selected_users || [];
  const selectedRole: string = values.observer_role_block?.observer_role?.selected_option?.value || 'silent_observer';
  const ctaChecked = (values.observer_channel_cta_block?.observer_channel_cta?.selected_options || [])
    .some((o: any) => o.value === 'post_channel_cta');

  // Validate: at least one session
  if (selectedSessionValues.length === 0) {
    return ack({
      response_action: 'errors',
      errors: { observer_sessions_block: 'Select at least one session.' },
    } as any);
  }

  // Validate: at least one path chosen
  if (selectedUsers.length === 0 && !ctaChecked) {
    return ack({
      response_action: 'errors',
      errors: { observer_people_block: 'Select people or check the channel invite option.' },
    } as any);
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
        } as any);
      }
    }
  }

  // Ack — close the modal
  await ack({ response_action: 'clear' } as any);

  try {
    const addedUsers: string[] = [];

    // ── Curated path ────────────────────────────────────
    if (selectedUsers.length > 0) {
      for (const slackUserId of selectedUsers) {
        let userInfo: any;
        try {
          userInfo = await client.users.info({ user: slackUserId });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error('Failed to fetch user info for', slackUserId, message);
          continue;
        }
        const displayName: string = userInfo.user?.real_name || userInfo.user?.name || slackUserId;

        for (const sv of selectedSessionValues) {
          const { sessionId, participantId } = parseSessionValue(sv);
          const { observer, created } = await sessionObserverService.addConfirmedObserver({
            session_id: sessionId,
            study_id: studyId,
            participant_id: participantId,
            requester_id: slackUserId,
            requester_name: displayName,
            joined_via: 'researcher_add',
            role: selectedRole as any,
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
        ctaChannelName = (channelInfo.channel as any)?.name || targetChannel;
      } catch (e) {
        ctaChannelName = targetChannel;
      }

      // Get researcher display name
      let researcherName = 'A researcher';
      try {
        const userInfo = await client.users.info({ user: userId });
        researcherName = (userInfo.user as any)?.real_name || (userInfo.user as any)?.name || 'A researcher';
      } catch (e) { /* use fallback */ }

      // Get date range
      const participants = await studyParticipantService.getParticipantsByStudy(studyId);
      const dateRange = formatDateRange(participants as any);

      // Build session labels for the CTA
      const sessionLabels = selectedSessionValues.map((sv: string) => {
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
    const parts: string[] = [];
    if (addedUsers.length > 0) {
      const sessionLabels = selectedSessionValues.map((sv: string) => parseSessionValue(sv).sessionId);
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
    // @ts-expect-error — pre-existing type mismatch from require() → import migration
    await updateObserverTracker(studyId, studyName, study?.path);

    // ── Refresh dashboard ───────────────────────────────
    if (rootViewId) {
      await refreshDashboardAfterAction(client, rootViewId, studyId, userId, channelId, studyName);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('handleAddObserverSubmission error:', message);
  }
}

// ── Handler: Self-join CTA button click ────────────────────

async function handleSelfJoinObserver({ ack, body, client }: BlockActionContext): Promise<void> {
  await ack();

  try {
    const { studyId, studyName, sessionIds } = JSON.parse((body as any).actions[0].value);

    // Build session list with current counts for the picker
    const allSessions = await sessionObserverService.buildSessionsWithCounts(studyId);
    const ctaSessions = sessionIds
      ? allSessions.filter((s: any) => sessionIds.includes(s.id))
      : allSessions;

    if (ctaSessions.length === 0) {
      await client.chat.postEphemeral({
        channel: (body as any).channel.id,
        user: body.user.id,
        text: 'No sessions available for this study.',
      });
      return;
    }

    const modal = buildSelfJoinSessionPickerModal(ctaSessions, studyName);
    // @ts-expect-error — pre-existing type mismatch from require() → import migration
    modal.private_metadata = JSON.stringify({
      studyId,
      studyName,
      userId: body.user.id,
      channelId: (body as any).channel.id,
    });

    await client.views.open({
      trigger_id: (body as any).trigger_id,
      view: modal as unknown as View,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('handleSelfJoinObserver error:', message);
  }
}

// ── Handler: Self-join session picker submission ───────────

async function handleSelfJoinSubmission({ ack, body, client, view }: ViewSubmissionContext): Promise<void> {
  const values = (view.state as any).values;
  const meta = JSON.parse(view.private_metadata || '{}');
  const { studyId, studyName, userId: joinerUserId, channelId } = meta;

  const selectedSessionValues: string[] = values.self_join_sessions_block?.self_join_sessions?.selected_options?.map((o: any) => o.value) || [];
  const selectedRole: string = values.self_join_role_block?.self_join_role?.selected_option?.value || 'silent_observer';

  if (selectedSessionValues.length === 0) {
    return ack({
      response_action: 'errors',
      errors: { self_join_sessions_block: 'Select at least one session.' },
    } as any);
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
      } as any);
    }
  }

  await ack({ response_action: 'clear' } as any);

  try {
    // Get joiner display name
    let joinerName = 'Someone';
    try {
      const userInfo = await client.users.info({ user: joinerUserId });
      joinerName = (userInfo.user as any)?.real_name || (userInfo.user as any)?.name || 'Someone';
    } catch (e) { /* use fallback */ }

    const joinedSessions: string[] = [];
    const skippedSessions: string[] = [];

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
        role: selectedRole as any,
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
          const participant = participants.find((p: any) => `PT-${String(p.id).padStart(3, '0')}` === sessionId);
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
    const parts: string[] = [];
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
      // @ts-expect-error — pre-existing type mismatch from require() → import migration
      await updateObserverTracker(studyId, studyName, studyForTracker?.path);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('handleSelfJoinSubmission error:', message);
  }
}

export {
  handleAddObserverSubmission,
  handleSelfJoinObserver,
  handleSelfJoinSubmission,
};
