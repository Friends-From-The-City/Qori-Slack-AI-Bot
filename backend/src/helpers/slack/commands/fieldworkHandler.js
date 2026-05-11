/**
 * /qori-fieldwork — Status dashboard with sub-modal actions (Pattern B).
 *
 * Consolidates: /qori-participants, /qori-update-participant,
 *               /qori-observe, /qori-outreach, /qori-notes
 */

const { getStudiesByUser, getResearchStudyWithRoles } = require('../../../services/research_study.service');
const studyParticipantService = require('../../../services/study_participant.service');
const sessionObserverService = require('../../../services/session_observer.service');
const { getActiveStudy, setActiveStudy } = require('../../../services/slack-user-state.service');
const { buildFieldworkDashboard, buildFieldworkStudyPicker } = require('../ui/fieldworkDashboardModal');
const { addParticipantModal } = require('../ui/addParticipantModal');
const { updateParticipantStatusModal } = require('../ui/outreach/updateParticipantStatusModal');
const { buildAddObserverModal } = require('../ui/addObserverModal');
const { participantOutreachModal } = require('../ui/outreach/participantOutreachModal');
const { buildSessionNotesView } = require('../ui/sessionNotesModal');

// ── Helpers ────────────────────────────────────────────────

/**
 * Fetch all stats needed for the dashboard and render it.
 * Used both on initial open and after sub-modal actions refresh the parent.
 */
const fetchAndRenderDashboard = async (client, viewId, study, meta) => {
  const participantStats = await studyParticipantService.getParticipantStats(study.id);
  const observerStats = await sessionObserverService.getObserverStats(study.id);

  // Outreach stats derived from participant statuses for now
  const allParticipants = await studyParticipantService.getParticipantsByStudy(study.id);
  const outreachStats = {
    total_contacted: allParticipants.length,
    awaiting_response: allParticipants.filter(p =>
      p.status_select === 'Pending' || p.status_select === 'Contacted'
    ).length,
  };

  const dashboard = buildFieldworkDashboard(study, participantStats, observerStats, outreachStats);
  dashboard.private_metadata = JSON.stringify(meta);

  await client.views.update({ view_id: viewId, view: dashboard });
};

// ── Command handler ────────────────────────────────────────

const fieldworkHandler = async ({ ack, body, client, command }) => {
  try {
    await ack();

    const userId = command.user_id;
    const channelId = command.channel_id;
    const studies = await getStudiesByUser(userId);

    if (!studies || studies.length === 0) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: 'No studies found. Create a study first with `/qori-brief`.',
      });
      return;
    }

    const activeStudyId = await getActiveStudy(userId);

    // If only one study, go straight to dashboard
    if (studies.length === 1) {
      const study = studies[0];
      await setActiveStudy(userId, study.id);

      const participantStats = await studyParticipantService.getParticipantStats(study.id);
      const observerStats = await sessionObserverService.getObserverStats(study.id);
      const allParticipants = await studyParticipantService.getParticipantsByStudy(study.id);
      const outreachStats = {
        total_contacted: allParticipants.length,
        awaiting_response: allParticipants.filter(p =>
          p.status_select === 'Pending' || p.status_select === 'Contacted'
        ).length,
      };

      const dashboard = buildFieldworkDashboard(study, participantStats, observerStats, outreachStats);
      dashboard.private_metadata = JSON.stringify({ channelId, userId, studyId: study.id, studyName: study.name });

      await client.views.open({ trigger_id: body.trigger_id, view: dashboard });
      return;
    }

    // Multiple studies — show picker, pre-select active study
    const studyOptions = studies.map(s => ({
      text: { type: 'plain_text', text: s.name },
      value: s.id.toString(),
    }));

    const picker = buildFieldworkStudyPicker(studyOptions, activeStudyId);
    picker.private_metadata = JSON.stringify({ channelId, userId });

    await client.views.open({ trigger_id: body.trigger_id, view: picker });
  } catch (error) {
    console.error('fieldworkHandler error:', error.data || error.message);
  }
};

// ── Study picker submission ────────────────────────────────

const handleFieldworkStudyPickerSubmit = async ({ ack, body, view, client }) => {
  try {
    const selectedStudyId = view.state.values.fieldwork_study_select.fieldwork_study_choice.selected_option.value;
    const meta = JSON.parse(view.private_metadata || '{}');
    const userId = meta.userId || body.user.id;

    await setActiveStudy(userId, parseInt(selectedStudyId, 10));

    const study = (await getStudiesByUser(userId)).find(s => s.id.toString() === selectedStudyId);
    if (!study) {
      await ack({ response_action: 'errors', errors: { fieldwork_study_select: 'Study not found.' } });
      return;
    }

    const participantStats = await studyParticipantService.getParticipantStats(study.id);
    const observerStats = await sessionObserverService.getObserverStats(study.id);
    const allParticipants = await studyParticipantService.getParticipantsByStudy(study.id);
    const outreachStats = {
      total_contacted: allParticipants.length,
      awaiting_response: allParticipants.filter(p =>
        p.status_select === 'Pending' || p.status_select === 'Contacted'
      ).length,
    };

    const dashboardMeta = { ...meta, studyId: study.id, studyName: study.name };
    const dashboard = buildFieldworkDashboard(study, participantStats, observerStats, outreachStats);
    dashboard.private_metadata = JSON.stringify(dashboardMeta);

    await ack({ response_action: 'update', view: dashboard });
  } catch (error) {
    console.error('handleFieldworkStudyPickerSubmit error:', error);
    await ack();
  }
};

// ── Sub-modal action dispatchers ───────────────────────────
// Each button in the dashboard pushes the corresponding sub-modal.
// On sub-modal submit, the existing handlers run, then we refresh
// the parent dashboard via views.update using the root_view_id.

/**
 * Generic wrapper: after an existing sub-modal submission handler runs,
 * refresh the parent fieldwork dashboard. Call this at the end of each
 * sub-modal submission handler that was folded from a standalone command.
 */
const refreshDashboardAfterAction = async (client, rootViewId, studyId, userId, channelId, studyName) => {
  try {
    const studies = await getStudiesByUser(userId);
    const study = studies.find(s => s.id.toString() === studyId.toString());
    if (!study) return;

    await fetchAndRenderDashboard(client, rootViewId, study, {
      channelId, userId, studyId: study.id, studyName: study.name,
    });
  } catch (error) {
    console.error('refreshDashboardAfterAction error:', error.message);
    // Non-fatal — the sub-modal action already succeeded
  }
};

// ── Sub-modal action handlers ──────────────────────────────

const handleFieldworkAddParticipant = async ({ ack, body, client }) => {
  await ack();
  try {
    const { studyId, studyName } = JSON.parse(body.actions[0].value);
    const dashboardMeta = JSON.parse(body.view.private_metadata || '{}');
    const studies = await getStudiesByUser(body.user.id);

    // Build study options and pre-select the current study
    const studyOptions = studies.map(s => ({
      text: { type: 'plain_text', text: s.name },
      value: s.id.toString(),
    }));

    let blocks = JSON.parse(JSON.stringify(addParticipantModal.blocks));
    const studyBlockIdx = blocks.findIndex(b => b.block_id === 'study_select_block');
    if (studyBlockIdx !== -1 && studyOptions.length > 0) {
      const initialOption = studyOptions.find(o => o.value === studyId.toString()) || studyOptions[0];
      blocks[studyBlockIdx] = {
        ...blocks[studyBlockIdx],
        element: { ...blocks[studyBlockIdx].element, options: studyOptions, initial_option: initialOption },
      };
    }

    await client.views.push({
      trigger_id: body.trigger_id,
      view: {
        ...addParticipantModal,
        blocks,
        private_metadata: JSON.stringify({ ...dashboardMeta, studyId, studyName, rootViewId: body.view.id }),
      },
    });
  } catch (error) {
    console.error('handleFieldworkAddParticipant error:', error.message);
  }
};

const handleFieldworkUpdateStatus = async ({ ack, body, client }) => {
  await ack();
  try {
    const { studyId, studyName } = JSON.parse(body.actions[0].value);
    const dashboardMeta = JSON.parse(body.view.private_metadata || '{}');
    const studies = await getStudiesByUser(body.user.id);

    const studyOptions = studies.map(s => ({
      text: { type: 'plain_text', text: s.name },
      value: s.id.toString(),
    }));

    let blocks = JSON.parse(JSON.stringify(updateParticipantStatusModal.blocks));
    const studyBlockIdx = blocks.findIndex(b => b.block_id === 'study_selection_block');
    if (studyBlockIdx !== -1 && studyOptions.length > 0) {
      const initialOption = studyOptions.find(o => o.value === studyId.toString()) || studyOptions[0];
      blocks[studyBlockIdx] = {
        type: 'input',
        block_id: 'study_selection_block',
        label: { type: 'plain_text', text: 'Study' },
        element: {
          type: 'static_select',
          action_id: 'update_participant_study_selection',
          placeholder: { type: 'plain_text', text: 'Select study...' },
          options: studyOptions,
          initial_option: initialOption,
        },
        optional: false,
      };
    }

    await client.views.push({
      trigger_id: body.trigger_id,
      view: {
        ...updateParticipantStatusModal,
        blocks,
        private_metadata: JSON.stringify({ ...dashboardMeta, studyId, studyName, rootViewId: body.view.id }),
      },
    });
  } catch (error) {
    console.error('handleFieldworkUpdateStatus error:', error.message);
  }
};

const handleFieldworkObserve = async ({ ack, body, client }) => {
  await ack();
  try {
    const { studyId, studyName } = JSON.parse(body.actions[0].value);
    const dashboardMeta = JSON.parse(body.view.private_metadata || '{}');
    const channelId = dashboardMeta.channelId || body.user.id;

    // Build sessions with current observer counts
    const sessions = await sessionObserverService.buildSessionsWithCounts(studyId);

    if (sessions.length === 0) {
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: 'Add a session to the study before inviting observers.',
      });
      return;
    }

    // Resolve channel display name for the CTA checkbox label
    let channelName = 'channel';
    try {
      const channelInfo = await client.conversations.info({ channel: channelId });
      channelName = channelInfo.channel?.name || 'channel';
    } catch (e) {
      // Fallback — may be a DM channel or inaccessible
    }

    const observeView = buildAddObserverModal(sessions, channelName);
    await client.views.push({
      trigger_id: body.trigger_id,
      view: {
        ...observeView,
        private_metadata: JSON.stringify({
          ...dashboardMeta,
          studyId,
          studyName,
          channelId,
          userId: body.user.id,
          rootViewId: body.view.id,
        }),
      },
    });
  } catch (error) {
    console.error('handleFieldworkObserve error:', error.message);
  }
};

const handleFieldworkOutreach = async ({ ack, body, client }) => {
  await ack();
  try {
    const { studyId, studyName } = JSON.parse(body.actions[0].value);
    const dashboardMeta = JSON.parse(body.view.private_metadata || '{}');
    const studies = await getStudiesByUser(body.user.id);

    const studyOptions = studies.map(s => ({
      text: { type: 'plain_text', text: s.name },
      value: s.name,
    }));

    let blocks = JSON.parse(JSON.stringify(participantOutreachModal.blocks));
    // Prepend study dropdown with pre-selection
    const initialOption = studyOptions.find(o => o.value === studyName) || studyOptions[0];
    blocks.unshift({
      type: 'input',
      block_id: 'study_select_block',
      label: { type: 'plain_text', text: 'Select an existing study:' },
      element: {
        type: 'static_select',
        action_id: 'study_select',
        placeholder: { type: 'plain_text', text: 'Pick a study...' },
        options: studyOptions,
        initial_option: initialOption,
      },
      optional: false,
    });

    await client.views.push({
      trigger_id: body.trigger_id,
      view: {
        ...participantOutreachModal,
        blocks,
        private_metadata: JSON.stringify({ ...dashboardMeta, studyId, studyName, rootViewId: body.view.id }),
      },
    });
  } catch (error) {
    console.error('handleFieldworkOutreach error:', error.message);
  }
};

const handleFieldworkUploadNotes = async ({ ack, body, client }) => {
  await ack();
  try {
    const { studyId, studyName } = JSON.parse(body.actions[0].value);
    const dashboardMeta = JSON.parse(body.view.private_metadata || '{}');
    const userId = body.user.id;

    // Try observer sessions first
    let sessions = await sessionObserverService.getObserverByUser(userId);
    let mode = 'observer';

    // Researcher fallback: show all study participants as uploadable sessions
    if (!sessions || sessions.length === 0) {
      const participants = await studyParticipantService.getParticipantsByStudy(studyId);

      if (!participants || participants.length === 0) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: 'No participants found for this study. Add participants first via the fieldwork dashboard.',
        });
        return;
      }

      mode = 'researcher';
      sessions = participants.map((p, idx) => ({
        id: `p_${p.id}`,
        study: p.study || { id: studyId, name: studyName },
        participant: p,
        session_id: `PT-${String(idx + 1).padStart(3, '0')}`,
      }));
    }

    const firstSession = sessions[0];
    const initialState = {
      tab: 'upload',
      mode,
      studyId,
      session: {
        id: firstSession.id,
        displayName: `${firstSession.study?.name || 'Unknown'} - ${firstSession.participant?.participant_name || 'Unknown'} (${firstSession.session_id || '?'})`,
        study: firstSession.study,
        participant: firstSession.participant,
        session_id: firstSession.session_id,
      },
      sessions,
      origin: {
        channel: dashboardMeta.channelId,
        user: userId,
      },
    };

    await client.views.push({
      trigger_id: body.trigger_id,
      view: buildSessionNotesView(initialState),
    });
  } catch (error) {
    console.error('handleFieldworkUploadNotes error:', error.message);
  }
};

module.exports = {
  fieldworkHandler,
  handleFieldworkStudyPickerSubmit,
  refreshDashboardAfterAction,
  fetchAndRenderDashboard,
  handleFieldworkAddParticipant,
  handleFieldworkUpdateStatus,
  handleFieldworkObserve,
  handleFieldworkOutreach,
  handleFieldworkUploadNotes,
};
