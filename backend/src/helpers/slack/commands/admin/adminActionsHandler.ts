/**
 * Admin Center Action Handlers
 *
 * Per ADR 0025: Handle button actions from the Admin Center modal.
 * These open sub-modals for DSAR and Delete Study flows.
 */

import type { AllMiddlewareArgs, BlockAction, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, ViewSubmitAction } from '@slack/bolt';
import type { View } from '@slack/types';
import { assertStudyOwner, isProjectOwner, AuthorizationError } from '../../../../services/authorization.service';
import { logDispositionAction, gatherStudyRecordCounts, gatherParticipantRecordCounts } from '../../../../services/audit.service';
import { exportParticipantData, deleteParticipantDSAR } from '../../../../services/dsar.service';
import { deleteStudyFolderFromGitHub } from '../../../github';
import sequelize from '../../../../database';

import type { Project } from '../../../../database/models/project';
import type { ResearchStudy } from '../../../../database/models/research_study';
import type { StudyParticipant } from '../../../../database/models/study_participant';
import type { AdminCenterMetadata, StakeholderInfo } from '../../ui/adminCenterModal';
import { setProjectStakeholder, assertProjectOwner, getProjectStakeholder } from '../../../../services/authorization.service';

const ProjectModel = sequelize.models.Project as typeof Project;
const ResearchStudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;
const StudyParticipantModel = sequelize.models.StudyParticipant as typeof StudyParticipant;

// ═══════════════════════════════════════════════════════════════════════
// DSAR FLOW (Participant Data)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Open Participant Data modal - study picker
 */
export async function handleDsarOpen({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> {
  await ack();

  const metadata: AdminCenterMetadata = JSON.parse((body as any).view?.private_metadata || '{}');

  try {
    // Get studies for this project
    const studies = await ResearchStudyModel.findAll({
      where: { project_id: metadata.projectId },
      order: [['created_at', 'DESC']],
    });

    if (studies.length === 0) {
      await client.views.push({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'admin-dsar-no-studies',
          title: { type: 'plain_text', text: 'Participant Data' },
          close: { type: 'plain_text', text: 'Back' },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: 'No studies found in this project.\n\nCreate a study first with `/qori-start`.',
              },
            },
          ],
        },
      });
      return;
    }

    const studyOptions = studies.map(s => ({
      text: { type: 'plain_text' as const, text: s.name },
      value: String(s.id),
    }));

    await client.views.push({
      trigger_id: (body as any).trigger_id,
      view: {
        type: 'modal',
        callback_id: 'admin-dsar-study-select',
        title: { type: 'plain_text', text: 'Participant Data' },
        submit: { type: 'plain_text', text: 'Next' },
        close: { type: 'plain_text', text: 'Cancel' },
        private_metadata: JSON.stringify(metadata),
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Select a study* to export or delete participant data.',
            },
          },
          {
            type: 'input',
            block_id: 'study_block',
            label: { type: 'plain_text', text: 'Study' },
            element: {
              type: 'static_select',
              action_id: 'study_select',
              placeholder: { type: 'plain_text', text: 'Select a study...' },
              options: studyOptions,
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error('[ADMIN] Error opening Participant Data modal:', error);
  }
}

/**
 * Handle study selection - show participant picker
 */
export async function handleDsarStudySelect({
  ack,
  body,
  view,
  client,
}: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  const userId = body.user.id;
  const metadata: AdminCenterMetadata = JSON.parse(view.private_metadata || '{}');
  const studyId = parseInt(
    (view.state.values as any).study_block?.study_select?.selected_option?.value || '0',
  );

  if (!studyId) {
    await ack({
      response_action: 'errors',
      errors: { study_block: 'Please select a study' },
    });
    return;
  }

  try {
    const study = await ResearchStudyModel.findByPk(studyId);
    if (!study) {
      await ack({
        response_action: 'errors',
        errors: { study_block: 'Study not found' },
      });
      return;
    }

    const participants = await StudyParticipantModel.findAll({
      where: { study_id: studyId },
      order: [['created_at', 'DESC']],
    });

    if (participants.length === 0) {
      // Use ack with response_action: 'update' to show the next modal
      await ack({
        response_action: 'update',
        view: {
          type: 'modal',
          callback_id: 'admin-dsar-no-participants',
          title: { type: 'plain_text', text: 'Participant Data' },
          close: { type: 'plain_text', text: 'Back' },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `No participants found in study *${study.name}*.\n\nAdd participants via fieldwork first.`,
              },
            },
          ],
        },
      });
      return;
    }

    const participantOptions = participants.map(p => ({
      text: {
        type: 'plain_text' as const,
        text: `${p.participant_code}${p.participant_name ? ` - ${p.participant_name}` : ''}`,
      },
      value: String(p.id),
    }));

    const extendedMetadata = {
      ...metadata,
      studyId,
      studyName: study.name,
    };

    // Use ack with response_action: 'update' to show the next modal
    await ack({
      response_action: 'update',
      view: {
        type: 'modal',
        callback_id: 'admin-dsar-participant-select',
        title: { type: 'plain_text', text: 'Participant Data' },
        submit: { type: 'plain_text', text: 'Next' },
        close: { type: 'plain_text', text: 'Cancel' },
        private_metadata: JSON.stringify(extendedMetadata),
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Study:* ${study.name}\n\nSelect a participant to export or delete their data.`,
            },
          },
          {
            type: 'input',
            block_id: 'participant_block',
            label: { type: 'plain_text', text: 'Participant' },
            element: {
              type: 'static_select',
              action_id: 'participant_select',
              placeholder: { type: 'plain_text', text: 'Select a participant...' },
              options: participantOptions,
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error('[ADMIN] Error in study select:', error);
    await ack({
      response_action: 'errors',
      errors: { study_block: 'An error occurred. Please try again.' },
    });
  }
}

/**
 * Handle participant selection - show action picker
 */
export async function handleDsarParticipantSelect({
  ack,
  body,
  view,
  client,
}: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  const userId = body.user.id;
  const metadata = JSON.parse(view.private_metadata || '{}');
  const participantId = parseInt(
    (view.state.values as any).participant_block?.participant_select?.selected_option?.value || '0',
  );

  if (!participantId) {
    await ack({
      response_action: 'errors',
      errors: { participant_block: 'Please select a participant' },
    });
    return;
  }

  try {
    const participant = await StudyParticipantModel.findByPk(participantId);
    if (!participant) {
      await ack({
        response_action: 'errors',
        errors: { participant_block: 'Participant not found' },
      });
      return;
    }

    const extendedMetadata = {
      ...metadata,
      participantId,
      participantCode: participant.participant_code,
    };

    // Check if user is owner for delete option
    const userIsOwner = await isProjectOwner(userId, metadata.projectId);

    const actionOptions = [
      {
        text: { type: 'plain_text' as const, text: 'Export data only' },
        value: 'export',
      },
    ];

    if (userIsOwner) {
      actionOptions.push({
        text: { type: 'plain_text' as const, text: 'Delete participant data' },
        value: 'delete',
      });
    }

    await ack({
      response_action: 'update',
      view: {
        type: 'modal',
        callback_id: 'admin-dsar-action-select',
        title: { type: 'plain_text', text: 'Participant Data' },
        submit: { type: 'plain_text', text: 'Continue' },
        close: { type: 'plain_text', text: 'Cancel' },
        private_metadata: JSON.stringify(extendedMetadata),
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text:
                `*Study:* ${metadata.studyName}\n*Participant:* ${participant.participant_code}\n\n` +
                'Select an action:',
            },
          },
          {
            type: 'input',
            block_id: 'action_block',
            label: { type: 'plain_text', text: 'Action' },
            element: {
              type: 'static_select',
              action_id: 'action_select',
              placeholder: { type: 'plain_text', text: 'Select action...' },
              options: actionOptions,
            },
          },
          ...(userIsOwner
            ? []
            : [
                {
                  type: 'context' as const,
                  elements: [
                    {
                      type: 'mrkdwn' as const,
                      text: '_Delete option requires project owner role._',
                    },
                  ],
                },
              ]),
        ],
      },
    });
  } catch (error) {
    console.error('[ADMIN] Error in participant select:', error);
    await ack({
      response_action: 'errors',
      errors: { participant_block: 'An error occurred. Please try again.' },
    });
  }
}

/**
 * Handle action selection - execute export or show delete confirmation
 */
export async function handleDsarActionSelect({
  ack,
  body,
  view,
  client,
}: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  const userId = body.user.id;
  const metadata = JSON.parse(view.private_metadata || '{}');
  const action = (view.state.values as any).action_block?.action_select?.selected_option?.value;

  if (!action) {
    await ack({
      response_action: 'errors',
      errors: { action_block: 'Please select an action' },
    });
    return;
  }

  if (action === 'export') {
    // Export is owner-gated (Admin Center UI only shows to owners)
    try {
      const exportData = await exportParticipantData(metadata.participantId, userId, client);

      // Log audit
      await logDispositionAction({
        action: 'export_participant',
        record_type: 'participant_record',
        target_id: metadata.participantId,
        target_identifier: metadata.participantCode,
        project_id: metadata.projectId,
        project_name: metadata.projectName,
        study_id: metadata.studyId,
        study_name: metadata.studyName,
        participant_id: metadata.participantId,
        participant_code: metadata.participantCode,
        actor_user_id: userId,
        actor_role: 'owner',
        authorization_basis: 'Project owner per ADR 0025',
        outcome: 'success',
        records_affected: exportData.summary,
      });

      // Send export to user via DM
      const im = await client.conversations.open({ users: userId });
      const dmChannelId = (im as any).channel.id;

      await client.chat.postMessage({
        channel: dmChannelId,
        text: `*Participant Data Export Complete*\n\nParticipant: ${metadata.participantCode}\nStudy: ${metadata.studyName}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text:
                `*Participant Data Export Complete*\n\n` +
                `*Participant:* ${metadata.participantCode}\n` +
                `*Study:* ${metadata.studyName}\n\n` +
                `*Records found:*\n` +
                `• ${exportData.summary.notes_count} session notes\n` +
                `• ${exportData.summary.observer_records_count} observer records\n` +
                `• ${exportData.summary.variables_count} cascade variables`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `_${exportData.known_limitation}_`,
              },
            ],
          },
        ],
        attachments: [
          {
            fallback: 'Participant Data Export',
            text: '```' + JSON.stringify(exportData, null, 2).slice(0, 2900) + '```',
          },
        ],
      });

      // Close modal with success
      await ack({
        response_action: 'update',
        view: {
          type: 'modal',
          callback_id: 'admin-dsar-complete',
          title: { type: 'plain_text', text: 'Export Complete' },
          close: { type: 'plain_text', text: 'Done' },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `:white_check_mark: Export sent to your DMs.\n\n*Participant:* ${metadata.participantCode}`,
              },
            },
          ],
        },
      });
    } catch (error) {
      console.error('[ADMIN] Export error:', error);
      await ack({
        response_action: 'update',
        view: {
          type: 'modal',
          callback_id: 'admin-dsar-error',
          title: { type: 'plain_text', text: 'Export Failed' },
          close: { type: 'plain_text', text: 'Close' },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `:x: Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            },
          ],
        },
      });
    }
  } else if (action === 'delete') {
    // Show delete confirmation
    try {
      const counts = await gatherParticipantRecordCounts(
        metadata.participantId,
        metadata.studyId,
        metadata.participantCode,
      );

      await ack({
        response_action: 'update',
        view: {
          type: 'modal',
          callback_id: 'admin-dsar-delete-confirm',
          title: { type: 'plain_text', text: 'Confirm Deletion' },
          submit: { type: 'plain_text', text: 'Delete Forever' },
          close: { type: 'plain_text', text: 'Cancel' },
          private_metadata: JSON.stringify({ ...metadata, counts }),
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text:
                  `:warning: *You are about to permanently delete:*\n\n` +
                  `*Participant:* ${metadata.participantCode}\n` +
                  `*Study:* ${metadata.studyName}\n\n` +
                  `*Records to be deleted:*\n` +
                  `• ${counts.notes} session notes\n` +
                  `• ${counts.observers} observer records\n` +
                  `• ${counts.variables} cascade variables`,
              },
            },
            { type: 'divider' },
            {
              type: 'input',
              block_id: 'confirm_block',
              label: { type: 'plain_text', text: 'Confirmation' },
              element: {
                type: 'checkboxes',
                action_id: 'confirm_checks',
                options: [
                  {
                    text: { type: 'plain_text', text: 'I understand this cannot be undone' },
                    value: 'understand',
                  },
                  {
                    text: { type: 'plain_text', text: 'I am authorized to delete this data' },
                    value: 'authorized',
                  },
                ],
              },
            },
            {
              type: 'input',
              block_id: 'code_block',
              label: { type: 'plain_text', text: `Type "${metadata.participantCode}" to confirm` },
              element: {
                type: 'plain_text_input',
                action_id: 'code_input',
                placeholder: { type: 'plain_text', text: metadata.participantCode },
              },
            },
          ],
        },
      });
    } catch (error) {
      console.error('[ADMIN] Error preparing delete confirmation:', error);
      await ack({
        response_action: 'errors',
        errors: { action_block: 'An error occurred. Please try again.' },
      });
    }
  }
}

/**
 * Handle delete confirmation
 */
export async function handleDsarDeleteConfirm({
  ack,
  body,
  view,
  client,
}: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  const userId = body.user.id;
  const metadata = JSON.parse(view.private_metadata || '{}');

  // Validate checkboxes
  const checks = (view.state.values as any).confirm_block?.confirm_checks?.selected_options || [];
  const hasUnderstand = checks.some((c: any) => c.value === 'understand');
  const hasAuthorized = checks.some((c: any) => c.value === 'authorized');

  if (!hasUnderstand || !hasAuthorized) {
    await ack({
      response_action: 'errors',
      errors: { confirm_block: 'Please check both confirmations' },
    });
    return;
  }

  // Validate typed code
  const typedCode = (view.state.values as any).code_block?.code_input?.value?.trim();
  if (typedCode !== metadata.participantCode) {
    await ack({
      response_action: 'errors',
      errors: { code_block: `Please type "${metadata.participantCode}" exactly` },
    });
    return;
  }

  // Gather context BEFORE delete
  const study = await ResearchStudyModel.findByPk(metadata.studyId);
  const project = await ProjectModel.findByPk(metadata.projectId);
  const counts = metadata.counts || (await gatherParticipantRecordCounts(
    metadata.participantId,
    metadata.studyId,
    metadata.participantCode,
  ));

  // Prepare audit entry
  const auditEntry = {
    action: 'delete_participant' as const,
    record_type: 'participant_record',
    target_id: metadata.participantId,
    target_identifier: metadata.participantCode,
    project_id: metadata.projectId,
    project_name: project?.name || metadata.projectName,
    study_id: metadata.studyId,
    study_name: study?.name || metadata.studyName,
    participant_id: metadata.participantId,
    participant_code: metadata.participantCode,
    actor_user_id: userId,
    actor_role: 'owner',
    authorization_basis: 'Project owner per ADR 0025, DSAR deletion request',
    records_affected: counts,
  };

  try {
    // Verify ownership
    await assertStudyOwner(userId, metadata.studyId);

    // Execute delete
    const result = await deleteParticipantDSAR(metadata.participantId, userId, client);

    // Log SUCCESS
    await logDispositionAction({
      ...auditEntry,
      outcome: 'success',
    });

    // Show success
    await ack({
      response_action: 'update',
      view: {
        type: 'modal',
        callback_id: 'admin-dsar-delete-complete',
        title: { type: 'plain_text', text: 'Deletion Complete' },
        close: { type: 'plain_text', text: 'Done' },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text:
                `:white_check_mark: *Participant data deleted*\n\n` +
                `*Participant:* ${metadata.participantCode}\n` +
                `*Study:* ${metadata.studyName}\n\n` +
                `*Deleted:*\n` +
                `• ${result.deleted_counts.notes} session notes\n` +
                `• ${result.deleted_counts.observer_records} observer records\n` +
                `• ${result.deleted_counts.variables} cascade variables`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `_${result.known_limitation}_`,
              },
            ],
          },
        ],
      },
    });
  } catch (error) {
    // Log ERROR
    await logDispositionAction({
      ...auditEntry,
      outcome: error instanceof AuthorizationError ? 'denied' : 'error',
      outcome_detail: error instanceof Error ? error.message : 'Unknown error',
    });

    await ack({
      response_action: 'update',
      view: {
        type: 'modal',
        callback_id: 'admin-dsar-delete-error',
        title: { type: 'plain_text', text: 'Deletion Failed' },
        close: { type: 'plain_text', text: 'Close' },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:x: Deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          },
        ],
      },
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// DELETE STUDY FLOW
// ═══════════════════════════════════════════════════════════════════════

/**
 * Open Delete Study modal - study picker
 */
export async function handleDeleteStudyOpen({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> {
  await ack();

  const metadata: AdminCenterMetadata = JSON.parse((body as any).view?.private_metadata || '{}');

  try {
    // Get studies for this project
    const studies = await ResearchStudyModel.findAll({
      where: { project_id: metadata.projectId },
      order: [['created_at', 'DESC']],
    });

    if (studies.length === 0) {
      await client.views.push({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'admin-delete-study-no-studies',
          title: { type: 'plain_text', text: 'Delete Study' },
          close: { type: 'plain_text', text: 'Back' },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: 'No studies found in this project.',
              },
            },
          ],
        },
      });
      return;
    }

    const studyOptions = studies.map(s => ({
      text: { type: 'plain_text' as const, text: s.name },
      value: String(s.id),
    }));

    await client.views.push({
      trigger_id: (body as any).trigger_id,
      view: {
        type: 'modal',
        callback_id: 'admin-delete-study-select',
        title: { type: 'plain_text', text: 'Delete Study' },
        submit: { type: 'plain_text', text: 'Continue' },
        close: { type: 'plain_text', text: 'Cancel' },
        private_metadata: JSON.stringify(metadata),
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: ':warning: *Select a study to permanently delete.*\n\nThis will remove:\n• All participants and their data\n• All session notes and transcripts\n• All cascade variables\n• All GitHub files',
            },
          },
          {
            type: 'input',
            block_id: 'study_block',
            label: { type: 'plain_text', text: 'Study' },
            element: {
              type: 'static_select',
              action_id: 'study_select',
              placeholder: { type: 'plain_text', text: 'Select a study...' },
              options: studyOptions,
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error('[ADMIN] Error opening delete study modal:', error);
  }
}

/**
 * Handle Delete Study selection - show confirmation
 */
export async function handleDeleteStudySelect({
  ack,
  body,
  view,
  client,
}: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  const userId = body.user.id;
  const metadata: AdminCenterMetadata = JSON.parse(view.private_metadata || '{}');
  const studyId = parseInt(
    (view.state.values as any).study_block?.study_select?.selected_option?.value || '0',
  );

  if (!studyId) {
    await ack({
      response_action: 'errors',
      errors: { study_block: 'Please select a study' },
    });
    return;
  }

  try {
    const study = await ResearchStudyModel.findByPk(studyId);
    if (!study) {
      await ack({
        response_action: 'errors',
        errors: { study_block: 'Study not found' },
      });
      return;
    }

    // Gather counts
    const counts = await gatherStudyRecordCounts(studyId);

    const extendedMetadata = {
      ...metadata,
      studyId,
      studyName: study.name,
      studyPath: study.path,
      counts,
    };

    await ack({
      response_action: 'update',
      view: {
        type: 'modal',
        callback_id: 'admin-delete-study-confirm',
        title: { type: 'plain_text', text: 'Confirm Deletion' },
        submit: { type: 'plain_text', text: 'Delete Forever' },
        close: { type: 'plain_text', text: 'Cancel' },
        private_metadata: JSON.stringify(extendedMetadata),
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text:
                `:warning: *You are about to permanently delete:*\n\n` +
                `*Study:* ${study.name}\n\n` +
                `*Records to be deleted:*\n` +
                `• ${counts.participants} participants\n` +
                `• ${counts.notes} session notes/transcripts\n` +
                `• ${counts.variables} cascade variables\n` +
                `• GitHub files at \`${study.path || '(no path)'}\``,
            },
          },
          { type: 'divider' },
          {
            type: 'input',
            block_id: 'confirm_block',
            label: { type: 'plain_text', text: 'Confirmation' },
            element: {
              type: 'checkboxes',
              action_id: 'confirm_checks',
              options: [
                {
                  text: { type: 'plain_text', text: 'I understand this cannot be undone' },
                  value: 'understand',
                },
                {
                  text: { type: 'plain_text', text: 'I am authorized to delete this study' },
                  value: 'authorized',
                },
              ],
            },
          },
          {
            type: 'input',
            block_id: 'name_block',
            label: { type: 'plain_text', text: `Type "${study.name}" to confirm` },
            element: {
              type: 'plain_text_input',
              action_id: 'name_input',
              placeholder: { type: 'plain_text', text: study.name },
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error('[ADMIN] Error in delete study select:', error);
    await ack({
      response_action: 'errors',
      errors: { study_block: 'An error occurred. Please try again.' },
    });
  }
}

/**
 * Handle Delete Study confirmation
 */
export async function handleDeleteStudyConfirm({
  ack,
  body,
  view,
  client,
}: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  const userId = body.user.id;
  const metadata = JSON.parse(view.private_metadata || '{}');

  // Validate checkboxes
  const checks = (view.state.values as any).confirm_block?.confirm_checks?.selected_options || [];
  const hasUnderstand = checks.some((c: any) => c.value === 'understand');
  const hasAuthorized = checks.some((c: any) => c.value === 'authorized');

  if (!hasUnderstand || !hasAuthorized) {
    await ack({
      response_action: 'errors',
      errors: { confirm_block: 'Please check both confirmations' },
    });
    return;
  }

  // Validate typed name
  const typedName = (view.state.values as any).name_block?.name_input?.value?.trim();
  if (typedName !== metadata.studyName) {
    await ack({
      response_action: 'errors',
      errors: { name_block: `Please type "${metadata.studyName}" exactly` },
    });
    return;
  }

  // Gather context BEFORE delete
  const study = await ResearchStudyModel.findByPk(metadata.studyId);
  const project = await ProjectModel.findByPk(metadata.projectId);
  const counts = metadata.counts || (await gatherStudyRecordCounts(metadata.studyId));

  // Prepare audit entry
  const auditEntry = {
    action: 'delete_study' as const,
    record_type: 'study_metadata',
    target_id: metadata.studyId,
    target_identifier: metadata.studyName,
    project_id: metadata.projectId,
    project_name: project?.name || metadata.projectName,
    study_id: metadata.studyId,
    study_name: metadata.studyName,
    actor_user_id: userId,
    actor_role: 'owner',
    authorization_basis: 'Project owner per ADR 0025',
    records_affected: counts,
  };

  try {
    // Verify ownership
    await assertStudyOwner(userId, metadata.studyId);

    // Delete from GitHub first
    if (metadata.studyPath) {
      try {
        // @ts-expect-error — pre-existing type mismatch
        await deleteStudyFolderFromGitHub(metadata.studyPath, process.env.GITHUB_REPO);
      } catch (githubError) {
        console.error('[ADMIN] GitHub deletion failed:', githubError);
        // Continue with DB deletion even if GitHub fails
      }
    }

    // Delete from database
    await study?.destroy();

    // Log SUCCESS
    await logDispositionAction({
      ...auditEntry,
      outcome: 'success',
    });

    // Show success
    await ack({
      response_action: 'update',
      view: {
        type: 'modal',
        callback_id: 'admin-delete-study-complete',
        title: { type: 'plain_text', text: 'Study Deleted' },
        close: { type: 'plain_text', text: 'Done' },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text:
                `:white_check_mark: *Study deleted*\n\n` +
                `*Study:* ${metadata.studyName}\n\n` +
                `*Deleted:*\n` +
                `• ${counts.participants} participants\n` +
                `• ${counts.notes} session notes\n` +
                `• ${counts.variables} cascade variables`,
            },
          },
        ],
      },
    });
  } catch (error) {
    // Log ERROR
    await logDispositionAction({
      ...auditEntry,
      outcome: error instanceof AuthorizationError ? 'denied' : 'error',
      outcome_detail: error instanceof Error ? error.message : 'Unknown error',
    });

    await ack({
      response_action: 'update',
      view: {
        type: 'modal',
        callback_id: 'admin-delete-study-error',
        title: { type: 'plain_text', text: 'Deletion Failed' },
        close: { type: 'plain_text', text: 'Close' },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:x: Deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          },
        ],
      },
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// STAKEHOLDER MANAGEMENT FLOW
// ═══════════════════════════════════════════════════════════════════════

interface StakeholderMetadata extends AdminCenterMetadata {
  currentStakeholderId?: string;
  currentStakeholderName?: string;
}

/**
 * Open Stakeholder Management modal
 * Shows current stakeholder (if any) and allows designate/change/clear.
 */
export async function handleStakeholderManage({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> {
  await ack();

  const userId = body.user.id;
  const metadata: AdminCenterMetadata = JSON.parse((body as any).view?.private_metadata || '{}');

  try {
    // Verify ownership (double-check, though modal should only be shown to owners)
    await assertProjectOwner(userId, metadata.projectId);

    // Get current stakeholder if any
    const currentStakeholder = await getProjectStakeholder(metadata.projectId);
    let stakeholderInfo: StakeholderInfo = null;

    if (currentStakeholder) {
      // Resolve display name
      let displayName = currentStakeholder.user_id;
      try {
        const userInfo = await client.users.info({ user: currentStakeholder.user_id });
        const user = userInfo.user as Record<string, unknown> | undefined;
        const profile = user?.profile as Record<string, unknown> | undefined;
        displayName = (user?.real_name || profile?.display_name || user?.name || currentStakeholder.user_id) as string;
      } catch {
        displayName = `<@${currentStakeholder.user_id}>`;
      }
      stakeholderInfo = { userId: currentStakeholder.user_id, displayName };
    }

    const extendedMetadata: StakeholderMetadata = {
      ...metadata,
      currentStakeholderId: stakeholderInfo?.userId,
      currentStakeholderName: stakeholderInfo?.displayName,
    };

    // Build modal based on whether stakeholder exists
    const blocks: Record<string, unknown>[] = [];

    if (stakeholderInfo) {
      // Current stakeholder exists - show them and offer change/clear
      blocks.push(
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Current Stakeholder:* ${stakeholderInfo.displayName}\n\nThe stakeholder approves research briefs for this project.`,
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Change stakeholder:*',
          },
        },
        {
          type: 'input',
          block_id: 'new_stakeholder_block',
          optional: true,
          label: { type: 'plain_text', text: 'Select new stakeholder' },
          element: {
            type: 'users_select',
            action_id: 'new_stakeholder_select',
            placeholder: { type: 'plain_text', text: 'Select a team member...' },
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Or clear stakeholder:*\n_Brief approvals will route to the project owner instead._',
          },
        },
        {
          type: 'input',
          block_id: 'clear_stakeholder_block',
          optional: true,
          label: { type: 'plain_text', text: 'Clear current stakeholder?' },
          element: {
            type: 'checkboxes',
            action_id: 'clear_stakeholder_check',
            options: [
              {
                text: { type: 'plain_text', text: 'Remove stakeholder (approvals go to owner)' },
                value: 'clear',
              },
            ],
          },
        },
      );
    } else {
      // No stakeholder - offer to designate one
      blocks.push(
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*No stakeholder designated*\n\nBrief approvals currently route to the project owner.\n\nDesignate a stakeholder to receive brief approval requests instead.',
          },
        },
        { type: 'divider' },
        {
          type: 'input',
          block_id: 'new_stakeholder_block',
          optional: false,
          label: { type: 'plain_text', text: 'Designate stakeholder' },
          element: {
            type: 'users_select',
            action_id: 'new_stakeholder_select',
            placeholder: { type: 'plain_text', text: 'Select a team member...' },
          },
        },
      );
    }

    await client.views.push({
      trigger_id: (body as any).trigger_id,
      view: {
        type: 'modal',
        callback_id: 'admin-stakeholder-submit',
        title: { type: 'plain_text', text: 'Manage Stakeholder' },
        submit: { type: 'plain_text', text: stakeholderInfo ? 'Update' : 'Designate' },
        close: { type: 'plain_text', text: 'Cancel' },
        private_metadata: JSON.stringify(extendedMetadata),
        blocks: blocks as any,
      },
    });
  } catch (error) {
    console.error('[ADMIN] Error opening stakeholder modal:', error);

    if (error instanceof AuthorizationError) {
      await client.views.push({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'admin-stakeholder-error',
          title: { type: 'plain_text', text: 'Access Denied' },
          close: { type: 'plain_text', text: 'Close' },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: ':lock: Only project owners can manage stakeholders.',
              },
            },
          ],
        },
      });
    }
  }
}

/**
 * Handle stakeholder management submission
 */
export async function handleStakeholderSubmit({
  ack,
  body,
  view,
  client,
}: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  const userId = body.user.id;
  const metadata: StakeholderMetadata = JSON.parse(view.private_metadata || '{}');

  // Parse form values
  const newStakeholderId =
    (view.state.values as any).new_stakeholder_block?.new_stakeholder_select?.selected_user || null;
  const clearChecked =
    ((view.state.values as any).clear_stakeholder_block?.clear_stakeholder_check?.selected_options || [])
      .some((opt: any) => opt.value === 'clear');

  // Validate: can't both select new and clear
  if (newStakeholderId && clearChecked) {
    await ack({
      response_action: 'errors',
      errors: { clear_stakeholder_block: 'Cannot both select a new stakeholder and clear. Choose one.' },
    });
    return;
  }

  // If no stakeholder exists and no new one selected, error
  if (!metadata.currentStakeholderId && !newStakeholderId) {
    await ack({
      response_action: 'errors',
      errors: { new_stakeholder_block: 'Please select a stakeholder' },
    });
    return;
  }

  // If stakeholder exists but neither change nor clear selected, just close
  if (metadata.currentStakeholderId && !newStakeholderId && !clearChecked) {
    await ack();
    return;
  }

  try {
    // Verify ownership
    await assertProjectOwner(userId, metadata.projectId);

    console.log(`[ADMIN] Stakeholder submit: newStakeholderId=${newStakeholderId}, clearChecked=${clearChecked}, currentStakeholder=${metadata.currentStakeholderId}`);

    if (clearChecked && metadata.currentStakeholderId) {
      // Clear stakeholder flag (doesn't affect role — owner stays owner)
      await setProjectStakeholder(metadata.projectId, null);
    } else if (newStakeholderId) {
      // Set new stakeholder (clears old, sets flag on new — doesn't affect roles)
      await setProjectStakeholder(metadata.projectId, newStakeholderId);
    }

    // Fetch updated stakeholder for confirmation display
    const updatedStakeholder = await getProjectStakeholder(metadata.projectId);
    let stakeholderInfo: StakeholderInfo = null;

    if (updatedStakeholder) {
      let displayName = updatedStakeholder.user_id;
      try {
        const userInfo = await client.users.info({ user: updatedStakeholder.user_id });
        const user = userInfo.user as Record<string, unknown> | undefined;
        const profile = user?.profile as Record<string, unknown> | undefined;
        displayName = (user?.real_name || profile?.display_name || user?.name || updatedStakeholder.user_id) as string;
      } catch {
        displayName = `<@${updatedStakeholder.user_id}>`;
      }
      stakeholderInfo = { userId: updatedStakeholder.user_id, displayName };
    }

    // Close the modal stack - change is complete
    await ack({ response_action: 'clear' });

    // Send confirmation via DM to the user who made the change
    const confirmMessage = clearChecked
      ? `Stakeholder cleared for *${metadata.projectName}*. Brief approvals will now route to the project owner.`
      : stakeholderInfo
        ? `*${stakeholderInfo.displayName}* is now the stakeholder for *${metadata.projectName}*.`
        : `Stakeholder updated for *${metadata.projectName}*.`;

    try {
      await client.chat.postMessage({
        channel: userId,
        text: `:white_check_mark: ${confirmMessage}`,
      });
    } catch {
      // DM failed, not critical
    }

    // Notify the new stakeholder (if one was assigned, not cleared)
    if (stakeholderInfo && stakeholderInfo.userId !== userId) {
      // Get the assigner's display name
      let assignerName = userId;
      try {
        const assignerInfo = await client.users.info({ user: userId });
        const assigner = assignerInfo.user as Record<string, unknown> | undefined;
        const assignerProfile = assigner?.profile as Record<string, unknown> | undefined;
        assignerName = (assigner?.real_name || assignerProfile?.display_name || assigner?.name || userId) as string;
      } catch {
        assignerName = `<@${userId}>`;
      }

      try {
        await client.chat.postMessage({
          channel: stakeholderInfo.userId,
          text: `:clipboard: *${assignerName}* assigned you as stakeholder for *${metadata.projectName}*. You'll receive brief approval requests for studies in this project.`,
        });
      } catch {
        // DM to stakeholder failed, not critical
      }
    }

    console.log(`[ADMIN] Stakeholder submit: completed, modal closed`);
  } catch (error) {
    console.error('[ADMIN] Error updating stakeholder:', error);

    await ack({
      response_action: 'update',
      view: {
        type: 'modal',
        callback_id: 'admin-stakeholder-error',
        title: { type: 'plain_text', text: 'Update Failed' },
        close: { type: 'plain_text', text: 'Close' },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:x: Failed to update stakeholder: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          },
        ],
      },
    });
  }
}
