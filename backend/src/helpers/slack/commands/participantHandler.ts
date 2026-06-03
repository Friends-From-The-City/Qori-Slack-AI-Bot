import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';

import { addParticipantModal } from "../ui/addParticipantModal";
import { updateParticipantStatusModal } from "../ui/outreach/updateParticipantStatusModal";
import { getStudiesByUser } from "../../../services/research_study.service";
import studyParticipantService from "../../../services/study_participant.service";
import { processParticipantYamlTemplate } from "../../../helpers/participantYamlProcessor";
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } from "../../github";
import { refreshDashboardAfterAction } from './fieldworkHandler';
import type { View } from '@slack/types';

/** Resolve Slack user ID to display name. Falls back to username, never to raw ID. */
async function resolveDisplayName(client: AllMiddlewareArgs['client'], userId: string, fallbackName?: string): Promise<string> {
  try {
    const result = await client.users.info({ user: userId });
    return result.user?.profile?.display_name || result.user?.real_name || fallbackName || 'Unknown';
  } catch {
    return fallbackName || 'Unknown';
  }
}

async function participantHandler({ ack, body, client, command }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> {
  try {
    console.log("🚀 ~ participantHandler ~ body:", body);
    await ack();

    const channelId = command.channel_id;
    const userId = command.user_id;

    // Fetch studies for this user
    const studies = await getStudiesByUser(userId);
    console.log("🚀 ~ participantHandler ~ studies:", studies)

    // Build the modal blocks
    let blocks = JSON.parse(JSON.stringify(addParticipantModal.blocks));

    // Find and update the study_select_block with actual studies
    const studySelectBlockIndex = blocks.findIndex((block: any) => block.block_id === 'study_select_block');
    if (studySelectBlockIndex !== -1 && studies && studies.length > 0) {
      const studyOptions = studies.map((study: any) => ({
        text: { type: 'plain_text', text: study.name },
        value: study.id.toString()
      }));

      blocks[studySelectBlockIndex] = {
        ...blocks[studySelectBlockIndex],
        element: {
          ...blocks[studySelectBlockIndex].element,
          options: studyOptions,
          initial_option: studyOptions[0], // Auto-select first study
        },
      };

      // Store first study ID in metadata for default
      const studyId = studies[0].id;

      // Preview the next participant code for the initially selected study
      const nextCode = await studyParticipantService.previewNextParticipantCode(studyId);
      const codePreviewBlockIndex = blocks.findIndex((block: any) => block.block_id === 'code_preview_block');
      if (codePreviewBlockIndex !== -1) {
        blocks[codePreviewBlockIndex] = {
          type: "context",
          block_id: "code_preview_block",
          elements: [
            {
              type: "mrkdwn",
              text: `🏷️ *Will be assigned:* \`${nextCode}\``
            }
          ]
        };
      }

      await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          ...addParticipantModal,
          blocks,
          private_metadata: JSON.stringify({ channelId, userId, studyId, studyName: studies[0].name }),
        } as View,
      });
    } else {
      // No studies found - still open modal but without studies
      await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          ...addParticipantModal,
          blocks,
          private_metadata: JSON.stringify({ channelId, userId }),
        } as View,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const detail = (error as Record<string, unknown>)?.data ?? message;
    console.error("🚀 ~ participantHandler ~ error:", detail);
  }
}

async function updateParticipantHandler({ ack, body, client, command }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> {
  try {
    console.log("🚀 ~ updateParticipantHandler ~ body:", body);
    await ack();

    const channelId = command.channel_id;
    const userId = command.user_id;

    // Fetch studies for this user
    const studies = await getStudiesByUser(userId);
    console.log("🚀 ~ updateParticipantHandler ~ studies:", studies);

    // Build study dropdown options
    let studyDropdownBlock = null;
    if (studies && studies.length > 0) {
      const studyOptions = studies.map((study: any) => ({
        text: { type: 'plain_text', text: study.name },
        value: study.id.toString()
      }));

      studyDropdownBlock = {
        type: 'input',
        block_id: 'study_selection_block',
        label: { type: 'plain_text', text: 'Study' },
        element: {
          type: 'static_select',
          action_id: 'update_participant_study_selection',
          placeholder: { type: 'plain_text', text: 'Select study...' },
          options: studyOptions
        },
        optional: false
      };
    }

    // Build the modal blocks
    let blocks = JSON.parse(JSON.stringify(updateParticipantStatusModal.blocks));

    // Update the study selection block if studies exist
    if (studyDropdownBlock) {
      // Find and replace the study selection block
      const studyBlockIndex = blocks.findIndex((block: any) => block.block_id === 'study_selection_block');
      if (studyBlockIndex !== -1) {
        blocks[studyBlockIndex] = studyDropdownBlock;
      }
    }

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        ...updateParticipantStatusModal,
        blocks,
        private_metadata: JSON.stringify({ channelId, userId }),
      } as View,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const detail = (error as Record<string, unknown>)?.data ?? message;
    console.error("🚀 ~ updateParticipantHandler ~ error:", detail);
  }
}

async function handleLoadParticipantsButton({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> {
  try {
    await ack();

    // For button actions, view data is in body.view
    const view = body.view;
    if (!view) {
      console.error("No view data available in button action");
      return;
    }

    // Extract the selected study ID
    if (!view.state || !view.state.values || !view.state.values.study_selection_block) {
      console.error("View state structure is not as expected:", view.state);
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `❌ Error: Unable to read study selection. Please try again.`,
      });
      return;
    }

    const selectedStudyOption = view.state.values.study_selection_block.update_participant_study_selection.selected_option;

    if (!selectedStudyOption || selectedStudyOption.value === "loading") {
      // No study selected, show error
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `❌ Please select a study first before loading participants.`,
      });
      return;
    }

    const studyId = selectedStudyOption.value;
    const studyName = selectedStudyOption.text.text;

    console.log("🚀 ~ Loading participants for study:", studyId, studyName);

    // Fetch participants for the selected study
    let participants: any[] = [];
    try {
      participants = await studyParticipantService.getParticipantsByStudy(parseInt(studyId, 10));
      console.log("🚀 ~ Participants found:", participants.length);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Warning: Could not fetch study participants:", message);
      // Continue with empty participants array
    }

    // Transform participants to the format expected by the modal
    // Display format: PT-001 (alias) or just PT-001 if no alias
    const participantOptions = participants.map((participant: any) => {
      const code = participant.participant_code;
      if (!code) {
        console.warn(`⚠️ Participant ${participant.id} missing participant_code — this should not happen after ADR 0020`);
      }
      const alias = participant.participant_name;
      const displayText = alias ? `${code || 'PT-???'} (${alias})` : (code || 'PT-???');
      return {
        text: { type: 'plain_text', text: displayText },
        value: participant.id.toString()
      };
    });

    // Get the studies list to pass back to the modal
    const studies = await getStudiesByUser(body.user.id);

    // Build study dropdown options
    const studyOptions = studies.map((study: any) => ({
      text: { type: 'plain_text', text: study.name },
      value: study.id.toString()
    }));

    // Build the modal blocks with updated participant options
    let blocks = JSON.parse(JSON.stringify(updateParticipantStatusModal.blocks));

    // Update the study selection block
    const studyBlockIndex = blocks.findIndex((block: any) => block.block_id === 'study_selection_block');
    if (studyBlockIndex !== -1) {
      blocks[studyBlockIndex] = {
        type: 'input',
        block_id: 'study_selection_block',
        label: { type: 'plain_text', text: 'Study' },
        element: {
          type: 'static_select',
          action_id: 'update_participant_study_selection',
          placeholder: { type: 'plain_text', text: 'Select study...' },
          options: studyOptions
        },
        optional: false
      };
    }

    // Update the participant selection block
    const participantBlockIndex = blocks.findIndex((block: any) => block.block_id === 'participant_selection_block');
    if (participantBlockIndex !== -1) {
      blocks[participantBlockIndex] = {
        type: 'input',
        block_id: 'participant_selection_block',
        label: { type: 'plain_text', text: 'Participant' },
        element: {
          type: 'static_select',
          action_id: 'participant_selection',
          placeholder: { type: 'plain_text', text: 'Select participant...' },
          options: participantOptions.length > 0 ? participantOptions : [
            {
              text: { type: 'plain_text', text: 'No participants found for this study' },
              value: 'no_participants'
            }
          ]
        },
        optional: false
      };
    }

    // Update the modal with the new participants
    await client.views.update({
      view_id: view.id,
      view: {
        ...updateParticipantStatusModal,
        blocks,
        private_metadata: view.private_metadata || "{}",
      } as View
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error handling load participants button:", error);

    // Send error message to user
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `❌ Error loading participants for selected study: ${message}`,
    });
  }
}

async function handleUpdateParticipantSubmission({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  try {
    await ack();

    console.log("🚀 ~ handleUpdateParticipantSubmission ~ view:", view);

    // Extract form data
    const studyId = view.state.values.study_selection_block.update_participant_study_selection.selected_option?.value;
    const participantId = view.state.values.participant_selection_block.participant_selection.selected_option?.value;
    const newStatus = view.state.values.status_update_block.status_update.selected_option?.value;
    const updateNotes = view.state.values.update_notes_block?.update_notes?.value || '';

    console.log("🚀 ~ Extracted data:", { studyId, participantId, newStatus, updateNotes });

    // Validate required fields
    if (!studyId || studyId === "loading") {
      throw new Error("No research study selected");
    }

    if (!participantId || participantId === "no_participants") {
      throw new Error("No participant selected");
    }

    if (!newStatus) {
      throw new Error("No new status selected");
    }

    // Get the selected study and participant names for display
    const studyName = view.state.values.study_selection_block.update_participant_study_selection.selected_option?.text?.text || "Unknown Study";
    const participantName = view.state.values.participant_selection_block.participant_selection.selected_option?.text?.text || "Unknown Participant";

    console.log("🚀 ~ Updating participant:", { studyName, participantName, newStatus });

    // Update the participant in the database
    const updateData: Record<string, string> = {
      status_select: newStatus
    };

    // Append notes instead of overwriting — preserve previous notes with timestamp
    if (updateNotes.trim()) {
      const existingParticipant = await studyParticipantService.getParticipantById(parseInt(participantId));
      const existingNotes = existingParticipant?.notes_field?.trim() || '';
      const timestamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      if (existingNotes) {
        updateData.notes_field = `${existingNotes}\n\n[${timestamp}] ${updateNotes}`;
      } else {
        updateData.notes_field = `[${timestamp}] ${updateNotes}`;
      }
    }

    // Update the participant using the service
    const updatedParticipant = await studyParticipantService.updateParticipant(parseInt(participantId), updateData);

    console.log("🚀 ~ Participant updated successfully:", updatedParticipant.id);

    // Optionally update the participant tracker file
    try {
      // Get the study details
      const study = await getStudiesByUser(body.user.id).then((studies: any[]) =>
        studies.find((s: any) => s.id.toString() === studyId)
      );

      if (study) {
        // Get all participants for the study to update the tracker
        const allParticipants = await studyParticipantService.getParticipantsByStudy(parseInt(studyId, 10));

        // Process the YAML template to update the tracker
        const yamlTemplateFile = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "participant_tracker.yaml");

        if (yamlTemplateFile && yamlTemplateFile.content) {
          const displayName = await resolveDisplayName(client, body.user.id, body.user.name);
          const templateData = {
            study_id: studyId,
            study_name: study.name,
            participant_name: participantName,
            status_select: newStatus,
            notes_field: updateNotes,
            current_date: new Date().toISOString().split('T')[0],
            added_by: displayName
          };

          // @ts-expect-error — pre-existing type mismatch from require() → import migration
          await processParticipantYamlTemplate(yamlTemplateFile.content, templateData, study.path || '', '', allParticipants);
          console.log("🚀 ~ Participant tracker updated successfully");
        }
      }
    } catch (yamlError) {
      const yamlMessage = yamlError instanceof Error ? yamlError.message : String(yamlError);
      console.warn("⚠️ Warning: Could not update participant tracker YAML:", yamlMessage);
      // Don't throw error here to avoid breaking the main participant update
    }

    // Send success message
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `✅ *Participant Status Updated Successfully!*\n\n*Study:* ${studyName}\n*Participant:* ${participantName}\n*New Status:* ${newStatus}${updateNotes ? `\n*Notes:* ${updateNotes}` : ''}\n\nThe participant's status has been updated in the database and participant tracker.`,
    });

    // Refresh fieldwork dashboard if this modal was opened from it
    const meta = JSON.parse(view.private_metadata || '{}');
    if (meta.rootViewId) {
      await refreshDashboardAfterAction(client, meta.rootViewId, studyId!, body.user.id, meta.channelId || body.user.id, studyName);
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error handling update participant submission:", error);

    // Send error message to user
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `❌ Error updating participant status: ${message}`,
    });
  }
}

/**
 * Handle study selection change in Add Participant modal.
 * Updates the code preview block to show the next code for the selected study.
 */
async function handleAddParticipantStudySelect({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> {
  await ack();

  try {
    const view = body.view;
    if (!view) return;

    // Get the selected study ID from the action
    const action = body.actions[0];
    if (action.type !== 'static_select' || !action.selected_option) return;

    const studyId = parseInt(action.selected_option.value, 10);
    if (isNaN(studyId)) return;

    // Preview the next participant code
    const nextCode = await studyParticipantService.previewNextParticipantCode(studyId);

    // Update the code preview block
    const blocks = JSON.parse(JSON.stringify(view.blocks));
    const codePreviewBlockIndex = blocks.findIndex((block: any) => block.block_id === 'code_preview_block');
    if (codePreviewBlockIndex !== -1) {
      blocks[codePreviewBlockIndex] = {
        type: "context",
        block_id: "code_preview_block",
        elements: [
          {
            type: "mrkdwn",
            text: `🏷️ *Will be assigned:* \`${nextCode}\``
          }
        ]
      };
    }

    // Update the modal with the new code preview
    await client.views.update({
      view_id: view.id,
      view: {
        ...addParticipantModal,
        blocks,
        private_metadata: view.private_metadata || "{}",
      } as View,
    });
  } catch (error) {
    console.error("Error updating code preview:", error);
  }
}

export {
  participantHandler,
  participantHandler as handleAddParticipantSubmit,
  updateParticipantHandler,
  handleLoadParticipantsButton,
  handleUpdateParticipantSubmission,
  handleAddParticipantStudySelect,
};
