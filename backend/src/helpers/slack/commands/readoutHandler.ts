/**
 * readoutHandler.ts — /qori-report command and modal handlers
 *
 * Opens a readout modal for generating research readouts, targeted readouts
 * (multi-audience), or GitHub Issues from findings. Routes to the appropriate
 * YAML template based on report type and audience selection.
 *
 * PLAT-3: Application service is the ONLY business path.
 * Legacy fallback removed — buildSlackApplicationContext failure
 * is a hard stop (fail closed).
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';

import { buildSlackApplicationContext } from '../../../middleware/auth/slackContextBridge';
import { executeReadout, type ReadoutInput } from '../../../application/readout.app-service';
import { buildReadoutModal } from '../ui/readoutModal';
import { resolveStudyFromName, getStudiesByUser } from '../../../services/research_study.service';
import { getActiveStudy, setActiveStudy } from '../../../services/slack-user-state.service';
import { assertStudyAccess } from '../../../services/authorization.service';
import { postEphemeralOrDM } from '../slackHelpers';
import sequelize from '../../../database';
import type { StudyVariableAttributes } from '../../../types/models';

// ─── Types ──────────────────────────────────────────────────────

interface ReadoutExistenceCheck {
  exists: true;
  findingsCount: number;
}

interface ModalStudy {
  id: number | string;
  name: string;
  path?: string | null;
}

interface ModalState {
  availableStudies: ModalStudy[];
  selectedStudy: ModalStudy | null | undefined;
  selectedStudyId?: number;
  reportType: string;
  targetAudience?: string;
  teamMembers?: string;
  timeline?: string;
  hasReadout?: boolean;
  readoutStats?: string | null;
  origin?: {
    team: string;
    channel: string;
    user: string;
    ts: string;
  };
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Check if prioritized_findings exists for a study (needed for targeted readouts).
 */
async function checkReadoutExists(studyPath: string): Promise<ReadoutExistenceCheck | false> {
  try {
    const StudyVariable = sequelize.models?.StudyVariable;
    const ResearchStudy = sequelize.models?.ResearchStudy;
    if (!StudyVariable || !ResearchStudy) return false;

    // Find the study by path to get its ID
    const studySlug: string = studyPath.split('/').pop() || studyPath;
    const study = await ResearchStudy.findOne({
      where: { name: studySlug },
      attributes: ['id'],
    });

    if (!study) return false;
    const studyId = (study as unknown as { id: number }).id;

    const row = await StudyVariable.findOne({
      where: {
        study_id: studyId,
        variable_key: 'prioritized_findings',
        scope: 'study',
      },
      attributes: ['id', 'value'],
    });

    const typedRow = row as unknown as StudyVariableAttributes | null;
    if (!typedRow || !typedRow.value) return false;

    const findingsCount: number = Array.isArray(typedRow.value) ? typedRow.value.length : 0;
    return { exists: true, findingsCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('⚠️ Could not check readout existence:', message);
    return false;
  }
}

// ─── Open modal handler ─────────────────────────────────────────

const openReadoutModal = async ({ ack, body, client, command }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> => {
  try {
    await ack();

    const studies = await getStudiesByUser(body.user_id);
    const activeStudyId: number | null = await getActiveStudy(body.user_id);
    const activeStudy = activeStudyId ? studies.find((s: { id: number }) => s.id === activeStudyId) : null;

    const initialState: ModalState = {
      availableStudies: studies,
      selectedStudy: activeStudy || (studies.length > 0 ? studies[0] : null),
      reportType: 'research_readout',
      targetAudience: 'Design Team',
      teamMembers: '@team-lead',
      timeline: 'Immediate (1-2 weeks)',
      origin: {
        team: command.team_id,
        channel: command.channel_id,
        user: command.user_id,
        ts: command.trigger_id
      }
    };

    await client.views.open({
      trigger_id: command.trigger_id,
      view: buildReadoutModal(initialState)
    });

  } catch (error) {
    console.error('Error opening readout modal:', error);
    const message = error instanceof Error ? error.message : String(error);

    try {
      await postEphemeralOrDM(
        client,
        command.channel_id,
        command.user_id,
        `❌ Error opening readout modal: ${message}`
      );
    } catch (chatError) {
      console.error('Error sending error message:', chatError);
    }
  }
};

// ─── Modal interaction handler ──────────────────────────────────

const handleReadoutModalInteraction = async ({ ack, body, client, action }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    await ack();

    const currentState = JSON.parse(body.view?.private_metadata || '{}') as ModalState;
    const studies = await getStudiesByUser(body.user.id);
    const selectedStudy = currentState.selectedStudyId
      ? studies.find((s: { id: number }) => s.id === currentState.selectedStudyId)
      : null;

    let updatedState: ModalState = {
      ...currentState,
      availableStudies: studies,
      selectedStudy: selectedStudy
    };

    switch (action.action_id) {
      case 'study_selection_change': {
        const newStudyId = (action as unknown as { selected_option: { value: string } }).selected_option.value;
        const newStudy = studies.find((s: { id: number }) => s.id.toString() === newStudyId);
        updatedState.selectedStudyId = newStudy?.id || undefined;
        updatedState.selectedStudy = newStudy;

        if (newStudy?.path) {
          const readoutCheck = await checkReadoutExists(newStudy.path);
          updatedState.hasReadout = readoutCheck ? readoutCheck.exists : false;
          updatedState.readoutStats = readoutCheck ? `• ${readoutCheck.findingsCount} findings available` : null;
        }
        break;
      }

      case 'select_research_readout':
        updatedState.reportType = 'research_readout';
        break;

      case 'select_targeted_readouts': {
        updatedState.reportType = 'targeted_readouts';
        const currentStudy = updatedState.selectedStudy as { path?: string } | null;
        if (currentStudy?.path) {
          const readoutCheck = await checkReadoutExists(currentStudy.path);
          updatedState.hasReadout = readoutCheck ? readoutCheck.exists : false;
          updatedState.readoutStats = readoutCheck ? `• ${readoutCheck.findingsCount} findings available` : null;
        }
        break;
      }

      case 'audience_checkboxes':
        // Checkboxes are handled on submit, not on change
        break;

      default:
        console.log('Unknown action:', action.action_id);
        return;
    }

    const modalState: ModalState = {
      ...updatedState,
      availableStudies: studies
    };
    const updatedView = buildReadoutModal(modalState);

    await client.views.update({
      view_id: body.view!.id,
      view: updatedView
    });

  } catch (error) {
    console.error('Error handling readout modal interaction:', error);
  }
};

// ─── Modal submission handler ───────────────────────────────────

const handleReadoutModalSubmission = async ({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    await ack();

    const values = view.state.values;
    const state = JSON.parse(view.private_metadata || '{}') as ModalState;

    const selectedStudyName: string | undefined = values.study_selection?.study_selection_change?.selected_option?.text?.text;

    if (!selectedStudyName) {
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Please select a research study before generating the report.',
      });
      return;
    }

    const resolved = await resolveStudyFromName(selectedStudyName);
    if (!resolved) {
      throw new Error(`Study "${selectedStudyName}" not found`);
    }
    const selectedStudy = resolved.study;

    // Authorization check: verify user has access to this study (ADR 0024)
    await assertStudyAccess(body.user.id, resolved.studyId, client);

    if (selectedStudy) await setActiveStudy(body.user.id, selectedStudy.id);
    const folderPath: string = selectedStudy.path ?? '';
    const reportType: string = state.reportType;

    // Extract team members from form
    const selectedRoles = values.team_members?.team_members_input?.selected_options || [];
    const roleToUserMap: Record<string, string> = {};
    if (selectedStudy?.userRoles) {
      selectedStudy.userRoles.forEach((userRole) => {
        roleToUserMap[userRole.role] = userRole.user_id;
      });
    }
    const teamMemberNames: string[] = [];
    selectedRoles.forEach((roleOption: { value: string }) => {
      const role = roleOption.value;
      const userId = roleToUserMap[role];
      if (userId) {
        teamMemberNames.push(`<@${userId}>`);
      }
    });
    const teamMembers: string = teamMemberNames.join(', ') || '@team-lead';

    // ── PLAT-3: Application service is the ONLY path ──
    const displayName = body.user?.name || body.user?.id;
    const appCtx = await buildSlackApplicationContext(body.user.id, (body as any).team?.id || '', displayName);

    if (!appCtx) {
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Unable to resolve your identity. Please contact your administrator to ensure your workspace is configured.',
      });
      return;
    }

    console.log(`[PLAT-3] Readout: using application service path for user=${body.user.id}`);

    // Extract audiences for targeted readouts
    const selectedAudiences: string[] = reportType === 'targeted_readouts'
      ? (values.audience_selection?.audience_checkboxes?.selected_options?.map((o: any) => o.value) || [])
      : [];

    if (reportType === 'targeted_readouts' && selectedAudiences.length === 0) {
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Please select at least one audience for targeted readouts.',
      });
      return;
    }

    const readoutInput: ReadoutInput = {
      studyId: resolved.studyId,
      projectId: resolved.projectId,
      studyName: selectedStudyName,
      studyPath: folderPath,
      reportType: reportType as ReadoutInput['reportType'],
      targetAudiences: selectedAudiences.length > 0 ? selectedAudiences : undefined,
      teamMembers,
      createdByActorId: appCtx.actor.publicId,
    };

    if (reportType === 'targeted_readouts') {
      await client.chat.postMessage({
        channel: body.user.id,
        text: `Generating ${selectedAudiences.length} targeted readout(s) for *${selectedStudyName}*... You'll receive a notification as each completes.`,
      });
    } else {
      await client.chat.postMessage({
        channel: body.user.id,
        text: `Generating research readout for *${selectedStudyName}*... This may take a few minutes.`,
      });
    }

    try {
      const result = await executeReadout(appCtx, readoutInput);

      if (reportType === 'targeted_readouts') {
        // Send per-audience notifications
        for (const entry of result.urls) {
          if (entry.success) {
            await client.chat.postMessage({
              channel: body.user.id,
              text: `✅ *${entry.audience}* readout complete for ${selectedStudyName}`,
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `✅ *${entry.audience}* readout complete — tickets ready\n\n<${entry.url}|View on GitHub>`,
                  },
                },
              ],
            });
          } else {
            await client.chat.postMessage({
              channel: body.user.id,
              text: `❌ Error generating *${entry.audience}* readout: ${entry.error}`,
            });
          }
        }

        // Summary message
        const succeeded = result.urls.filter(r => r.success);
        const failed = result.urls.filter(r => !r.success);
        if (succeeded.length > 0) {
          const links = succeeded.map(r => `• <${r.url}|${r.audience}>`).join('\n');
          await client.chat.postMessage({
            channel: body.user.id,
            text: `*All targeted readouts complete* (${succeeded.length}/${result.urls.length})`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*All targeted readouts complete* (${succeeded.length}/${result.urls.length})\n\n${links}${failed.length > 0 ? `\n\n❌ ${failed.length} failed: ${failed.map(r => r.audience).join(', ')}` : ''}`,
                },
              },
            ],
          });
        }
      } else {
        // Research readout — single result
        const mainUrl = result.urls[0]?.url;
        await client.chat.postMessage({
          channel: body.user.id,
          text: `✅ Report generated successfully!`,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*Report ready:*\n<${mainUrl}|View Full Report on GitHub>` },
            },
            { type: 'divider' },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*Next:* Run \`/qori-report\` again and select *Targeted Readouts* to generate audience-specific reports, or \`/qori-tickets\` to create engineering issues.` },
            },
          ],
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error handling readout (app service):', error);
      await client.chat.postMessage({
        channel: body.user.id,
        text: `❌ Error generating report: ${message}`,
      });
    }

  } catch (error) {
    console.error('Error handling readout modal submission:', error);
    const message = error instanceof Error ? error.message : String(error);

    await client.chat.postMessage({
      channel: body.user.id,
      text: `❌ Error generating report: ${message}`,
    });
  }
};

export {
  openReadoutModal,
  handleReadoutModalInteraction,
  handleReadoutModalSubmission
};
