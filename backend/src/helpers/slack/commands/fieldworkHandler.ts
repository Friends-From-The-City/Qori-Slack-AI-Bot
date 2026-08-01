/**
 * /qori-fieldwork — Status dashboard with sub-modal actions (Pattern B).
 *
 * Consolidates: /qori-participants, /qori-update-participant,
 *               /qori-observe, /qori-outreach, /qori-notes
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction, ButtonAction } from '@slack/bolt';

import { getStudiesByUser } from '../../../services/research_study.service';
import studyParticipantService from '../../../services/study_participant.service';
import sessionObserverService from '../../../services/session_observer.service';
import { getActiveStudy, setActiveStudy } from '../../../services/slack-user-state.service';
import { buildFieldworkDashboard, buildFieldworkStudyPicker } from '../ui/fieldworkDashboardModal';
import { PARTICIPANT_STATUS } from '../../../constants/participantStatus';
import { addParticipantModal } from '../ui/addParticipantModal';
import { updateParticipantStatusModal } from '../ui/outreach/updateParticipantStatusModal';
import { buildAddObserverModal } from '../ui/addObserverModal';
import { participantOutreachModal } from '../ui/outreach/participantOutreachModal';
import { buildSessionNotesView } from '../ui/sessionNotesModal';
import type { View } from '@slack/types';
import { assertStudyAccess } from '../../../services/authorization.service';
import { postEphemeralOrDM } from '../slackHelpers';

// ── Helpers ────────────────────────────────────────────────

/**
 * Derive outreach stats and dashboard context from raw participant list.
 */
function buildDashboardContext(allParticipants: any[], study: any) {
  // Count participants with outreach sent (honest metric — we know what we sent)
  // NOTE: "responses_received" was removed (June 2026) — Qori generates outbound
  // emails but has no inbound channel, so the count was really "status changes"
  // not actual responses. Unpopulable by design.
  const outreachSent = allParticipants.filter((p) => p.outreach_sent_at).length;

  const outreachStats = {
    total_contacted: outreachSent,
  };

  // Session date range from scheduled_date fields
  const dates = allParticipants
    .map(p => p.scheduled_date)
    .filter(Boolean)
    .sort();
  const sessionDateRange = dates.length === 0
    ? null
    : dates.length === 1
      ? `Sessions ${dates[0]}`
      : `Sessions ${dates[0]} – ${dates[dates.length - 1]}`;

  // Last updated: most recent updated_at across participants, fallback to study
  const timestamps = allParticipants
    .map(p => p.updated_at || p.updatedAt)
    .filter(Boolean)
    .map(d => new Date(d).getTime());
  const lastUpdated = timestamps.length > 0
    ? new Date(Math.max(...timestamps))
    : (study.updated_at || study.updatedAt || study.created_at || study.createdAt);

  return {
    outreachStats,
    context: { sessionDateRange, lastUpdated },
  };
}

/**
 * Fetch all stats needed for the dashboard and render it.
 * Used both on initial open and after sub-modal actions refresh the parent.
 */
async function fetchAndRenderDashboard(client: any, viewId: string, study: any, meta: any) {
  const participantStats = await studyParticipantService.getParticipantStats(study.id);
  const observerStats = await sessionObserverService.getObserverStats(study.id);
  const allParticipants = await studyParticipantService.getParticipantsByStudy(study.id);
  const { outreachStats, context } = buildDashboardContext(allParticipants, study);

  const dashboard = buildFieldworkDashboard(study, participantStats, observerStats, outreachStats, context);
  dashboard.private_metadata = JSON.stringify(meta);

  await client.views.update({ view_id: viewId, view: dashboard });
}

// ── Command handler ────────────────────────────────────────

async function fieldworkHandler({ ack, body, client, command }: SlackCommandMiddlewareArgs & AllMiddlewareArgs) {
  try {
    await ack();

    const userId = command.user_id;
    const channelId = command.channel_id;
    const studies = await getStudiesByUser(userId);

    if (!studies || studies.length === 0) {
      await postEphemeralOrDM(
        client,
        channelId,
        userId,
        'No studies found. Create a study first with `/qori-brief`.',
      );
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
      const { outreachStats, context } = buildDashboardContext(allParticipants, study);

      const dashboard = buildFieldworkDashboard(study, participantStats, observerStats, outreachStats, context);
      dashboard.private_metadata = JSON.stringify({ channelId, userId, studyId: study.id, studyName: study.name });

      await client.views.open({ trigger_id: body.trigger_id, view: dashboard });
      return;
    }

    // Multiple studies — show picker, pre-select active study
    const studyOptions = studies.map((s: any) => ({
      text: { type: 'plain_text', text: s.name },
      value: s.id.toString(),
    }));

    const picker = buildFieldworkStudyPicker(studyOptions, activeStudyId);
    picker.private_metadata = JSON.stringify({ channelId, userId });

    await client.views.open({ trigger_id: body.trigger_id, view: picker });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const detail = (error as Record<string, unknown>)?.data ?? message;
    console.error('fieldworkHandler error:', detail);
  }
}

// ── Study picker submission ────────────────────────────────

async function handleFieldworkStudyPickerSubmit({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs) {
  try {
    const selectedStudyId = view.state.values.fieldwork_study_select.fieldwork_study_choice.selected_option!.value;
    const meta = JSON.parse(view.private_metadata || '{}');
    const userId = meta.userId || body.user.id;

    // Authorization check: verify user has access to this study (ADR 0024)
    await assertStudyAccess(userId, parseInt(selectedStudyId, 10), client);

    await setActiveStudy(userId, parseInt(selectedStudyId, 10));

    const study = (await getStudiesByUser(userId)).find((s: any) => s.id.toString() === selectedStudyId);
    if (!study) {
      await ack({ response_action: 'errors', errors: { fieldwork_study_select: 'Study not found.' } } as any);
      return;
    }

    const participantStats = await studyParticipantService.getParticipantStats(study.id);
    const observerStats = await sessionObserverService.getObserverStats(study.id);
    const allParticipants = await studyParticipantService.getParticipantsByStudy(study.id);
    const { outreachStats, context } = buildDashboardContext(allParticipants, study);

    const dashboardMeta = { ...meta, studyId: study.id, studyName: study.name };
    const dashboard = buildFieldworkDashboard(study, participantStats, observerStats, outreachStats, context);
    dashboard.private_metadata = JSON.stringify(dashboardMeta);

    await ack({ response_action: 'update', view: dashboard } as any);
  } catch (error) {
    console.error('handleFieldworkStudyPickerSubmit error:', error);
    await ack();
  }
}

// ── Sub-modal action dispatchers ───────────────────────────
// Each button in the dashboard pushes the corresponding sub-modal.
// On sub-modal submit, the existing handlers run, then we refresh
// the parent dashboard via views.update using the root_view_id.

/**
 * Generic wrapper: after an existing sub-modal submission handler runs,
 * refresh the parent fieldwork dashboard. Call this at the end of each
 * sub-modal submission handler that was folded from a standalone command.
 */
async function refreshDashboardAfterAction(client: any, rootViewId: string, studyId: string | number, userId: string, channelId: string, studyName: string) {
  try {
    const studies = await getStudiesByUser(userId);
    const study = studies.find((s: any) => s.id.toString() === studyId.toString());
    if (!study) return;

    await fetchAndRenderDashboard(client, rootViewId, study, {
      channelId, userId, studyId: study.id, studyName: study.name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('refreshDashboardAfterAction error:', message);
    // Non-fatal — the sub-modal action already succeeded
  }
}

// ── Sub-modal action handlers ──────────────────────────────

async function handleFieldworkAddParticipant({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs) {
  await ack();
  try {
    const { studyId, studyName } = JSON.parse((body.actions[0] as ButtonAction).value!);
    const dashboardMeta = JSON.parse(body.view?.private_metadata || '{}');
    const studies = await getStudiesByUser(body.user.id);

    // Build study options and pre-select the current study
    const studyOptions = studies.map((s: any) => ({
      text: { type: 'plain_text', text: s.name },
      value: s.id.toString(),
    }));

    const blocks = JSON.parse(JSON.stringify(addParticipantModal.blocks));
    const studyBlockIdx = blocks.findIndex((b: any) => b.block_id === 'study_select_block');
    if (studyBlockIdx !== -1 && studyOptions.length > 0) {
      const initialOption = studyOptions.find((o: any) => o.value === studyId.toString()) || studyOptions[0];
      blocks[studyBlockIdx] = {
        ...blocks[studyBlockIdx],
        element: { ...blocks[studyBlockIdx].element, options: studyOptions, initial_option: initialOption },
      };
    }

    // Update code preview since study is pre-selected (ADR 0020)
    const codePreviewIdx = blocks.findIndex((b: any) => b.block_id === 'code_preview_block');
    if (codePreviewIdx !== -1 && studyId) {
      const nextCode = await studyParticipantService.previewNextParticipantCode(studyId);
      blocks[codePreviewIdx] = {
        type: "context",
        block_id: "code_preview_block",
        elements: [{
          type: "mrkdwn",
          text: `Will be assigned: *${nextCode}*`
        }]
      };
    }

    await client.views.push({
      trigger_id: body.trigger_id,
      view: {
        ...addParticipantModal,
        blocks,
        private_metadata: JSON.stringify({ ...dashboardMeta, studyId, studyName, rootViewId: body.view?.id }),
      } as View,
    });
  } catch (error: unknown) {
    const errData = (error as Record<string, unknown>)?.data;
    const messages = (errData as Record<string, unknown>)?.response_metadata as Record<string, unknown>;
    console.error('❌ handleFieldworkAddParticipant error:');
    console.error('Error data:', JSON.stringify(errData, null, 2));
    if (messages?.messages) {
      console.error('Validation errors:', JSON.stringify(messages.messages, null, 2));
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error message:', message);
    }
  }
}

async function handleFieldworkUpdateStatus({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs) {
  await ack();
  try {
    const { studyId, studyName } = JSON.parse((body.actions[0] as ButtonAction).value!);
    const dashboardMeta = JSON.parse(body.view?.private_metadata || '{}');
    const studies = await getStudiesByUser(body.user.id);

    const studyOptions = studies.map((s: any) => ({
      text: { type: 'plain_text', text: s.name },
      value: s.id.toString(),
    }));

    let blocks = JSON.parse(JSON.stringify(updateParticipantStatusModal.blocks));
    const studyBlockIdx = blocks.findIndex((b: any) => b.block_id === 'study_selection_block');
    if (studyBlockIdx !== -1 && studyOptions.length > 0) {
      const initialOption = studyOptions.find((o: any) => o.value === studyId.toString()) || studyOptions[0];
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
        private_metadata: JSON.stringify({ ...dashboardMeta, studyId, studyName, rootViewId: body.view?.id }),
      } as View,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('handleFieldworkUpdateStatus error:', message);
  }
}

async function handleFieldworkObserve({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs) {
  await ack();
  try {
    const { studyId, studyName } = JSON.parse((body.actions[0] as ButtonAction).value!);
    const dashboardMeta = JSON.parse(body.view?.private_metadata || '{}');
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
      channelName = (channelInfo as any).channel?.name || 'channel';
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
          rootViewId: body.view?.id,
        }),
      } as View,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('handleFieldworkObserve error:', message);
  }
}

async function handleFieldworkOutreach({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs) {
  await ack();
  try {
    const { studyId, studyName } = JSON.parse((body.actions[0] as ButtonAction).value!);
    const dashboardMeta = JSON.parse(body.view?.private_metadata || '{}');
    const studies = await getStudiesByUser(body.user.id);

    const studyOptions = studies.map((s: any) => ({
      text: { type: 'plain_text', text: s.name },
      value: s.name,
    }));

    let blocks = JSON.parse(JSON.stringify(participantOutreachModal.blocks));
    // Prepend study dropdown with pre-selection
    const initialOption = studyOptions.find((o: any) => o.value === studyName) || studyOptions[0];
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
        private_metadata: JSON.stringify({ ...dashboardMeta, studyId, studyName, rootViewId: body.view?.id }),
      } as View,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('handleFieldworkOutreach error:', message);
  }
}

async function handleFieldworkUploadNotes({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs) {
  await ack();
  try {
    const { studyId, studyName } = JSON.parse((body.actions[0] as ButtonAction).value!);
    const dashboardMeta = JSON.parse(body.view?.private_metadata || '{}');
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
      // @ts-expect-error — pre-existing type mismatch from require() → import migration
      sessions = participants.map((p: any) => ({
        id: `p_${p.id}`,
        study: p.study || { id: studyId, name: studyName },
        participant: p,
        session_id: p.participant_code,
      }));
    }

    // Convert Sequelize models to plain objects so template literals work consistently
    const plainSessions = sessions.map((s: any) => ({
      id: s.id,
      study: s.study?.dataValues ? s.study.toJSON() : s.study,
      participant: s.participant?.dataValues ? s.participant.toJSON() : s.participant,
      session_id: s.session_id,
    }));

    const firstSession = plainSessions[0];
    // Build displayName matching sessionNotesModal format: "Study - PT-001 (alias)" or "Study - PT-001"
    const code = firstSession.session_id || 'Unknown';
    const alias = firstSession.participant?.participant_name;
    const sessionDisplayPart = alias ? `${code} (${alias})` : code;
    const initialState = {
      tab: 'upload',
      mode,
      studyId,
      session: {
        id: firstSession.id,
        displayName: `${firstSession.study?.name || 'Unknown Study'} - ${sessionDisplayPart}`,
        study: firstSession.study,
        participant: firstSession.participant,
        session_id: firstSession.session_id,
      },
      sessions: plainSessions,
      origin: {
        channel: dashboardMeta.channelId,
        user: userId,
      },
    };

    await client.views.push({
      trigger_id: body.trigger_id,
      view: buildSessionNotesView(initialState as any) as View,
    });
  } catch (error: unknown) {
    const errData = (error as Record<string, unknown>)?.data;
    const messages = (errData as Record<string, unknown>)?.response_metadata as Record<string, unknown>;
    console.error('❌ handleFieldworkUploadNotes error:');
    console.error('Error data:', JSON.stringify(errData, null, 2));
    if (messages?.messages) {
      console.error('Validation errors:', JSON.stringify(messages.messages, null, 2));
    }
    const message = error instanceof Error ? error.message : String(error);
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `Failed to open notes modal: ${message}`,
    }).catch(() => {});
  }
}

export {
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
