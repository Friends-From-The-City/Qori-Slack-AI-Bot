const { addParticipantModal } = require("../ui/addParticipantModal");
const { updateParticipantStatusModal } = require("../ui/outreach/updateParticipantStatusModal");
const { getStudiesByUser } = require("../../../services/research_study.service");
const studyParticipantService = require("../../../services/study_participant.service");
const { processParticipantYamlTemplate } = require("../../../helpers/participantYamlProcessor");
const { getConfigRepo, fetchFileFromRepo } = require("../../github");

const participantHandler = async ({ ack, body, client, command }) => {
  try {
    console.log("🚀 ~ participantHandler ~ body:", body);
    await ack();

    const channelId = command.channel_id;
    const userId = command.user_id;

    // Fetch studies for this user
    const studies = await getStudiesByUser(userId);
    console.log("🚀 ~ participantHandler ~ studies:", studies)

    // Build study dropdown options
    let studyDropdownBlock = null;
    if (studies && studies.length > 0) {
      const studyOptions = studies.map(study => ({
        text: { type: 'plain_text', text: study.name },
        value: study.id.toString()
      }));

      studyDropdownBlock = {
        type: 'input',
        block_id: 'study_select_block',
        label: { type: 'plain_text', text: 'Select study:' },
        element: {
          type: 'static_select',
          action_id: 'study_select',
          placeholder: { type: 'plain_text', text: 'Pick a study...' },
          options: studyOptions
        },
        optional: false
      };
    }

    // Build the modal blocks
    let blocks = JSON.parse(JSON.stringify(addParticipantModal.blocks));

    // Find and update the study_select_block with actual studies
    const studySelectBlockIndex = blocks.findIndex(block => block.block_id === 'study_select_block');
    if (studySelectBlockIndex !== -1 && studies && studies.length > 0) {
      const studyOptions = studies.map(study => ({
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
      await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          ...addParticipantModal,
          blocks,
          private_metadata: JSON.stringify({ channelId, userId, studyId, studyName: studies[0].name }),
        },
      });
    } else {
      // No studies found - still open modal but without studies
      await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          ...addParticipantModal,
          blocks,
          private_metadata: JSON.stringify({ channelId, userId }),
        },
      });
    }
  } catch (error) {
    console.error("🚀 ~ participantHandler ~ error:", error.data || error.message);
  }
};

const updateParticipantHandler = async ({ ack, body, client, command }) => {
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
      const studyOptions = studies.map(study => ({
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
      const studyBlockIndex = blocks.findIndex(block => block.block_id === 'study_selection_block');
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
      },
    });
  } catch (error) {
    console.error("🚀 ~ updateParticipantHandler ~ error:", error.data || error.message);
  }
};

// const handleParticipantStudySelectionChange = async ({ ack, body, client, view }) => {
//   console.log("🚀 ~ handleParticipantStudySelectionChange ~ body:", body);
//   console.log("🚀 ~ handleParticipantStudySelectionChange ~ view:", view);

//   try {
//     await ack();

//     const studyId = body.actions[0].selected_option.value;
//     console.log("🚀 ~ selected studyId:", studyId);

//     // Get participants for the selected study
//     const participants = await studyParticipantService.getParticipantsByStudy(studyId);
//     console.log("🚀 ~ participants found:", participants.length);

//     // Build participant dropdown options
//     const participantOptions = participants.map(participant => ({
//       text: { type: 'plain_text', text: participant.participant_name },
//       value: participant.id.toString()
//     }));

//     console.log("🚀 ~ participantOptions:", participantOptions);

//     // Update the participant selection block
//     const updatedBlocks = view.blocks.map(block => {
//       if (block.block_id === 'participant_selection_block') {
//         console.log("🚀 ~ updating participant block:", block.block_id);
//         return {
//           ...block,
//           element: {
//             ...block.element,
//             options: participantOptions.length > 0 ? participantOptions : [
//               {
//                 text: { type: 'plain_text', text: 'No participants found' },
//                 value: 'no_participants'
//               }
//             ]
//           }
//         };
//       }
//       return block;
//     });

//     console.log("🚀 ~ updatedBlocks:", updatedBlocks);

//     // Update the modal view
//     const result = await client.views.update({
//       view_id: body.view.id,
//       view: {
//         ...view,
//         blocks: updatedBlocks
//       }
//     });

//     console.log("🚀 ~ view update result:", result);

//   } catch (error) {
//     console.error("🚀 ~ handleParticipantStudySelectionChange ~ error:", error);
//     await ack();
//   }
// };

const handleLoadParticipantsButton = async ({ ack, body, client }) => {
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
    let participants = [];
    try {
      participants = await studyParticipantService.getParticipantsByStudy(studyId);
      console.log("🚀 ~ Participants found:", participants.length);
    } catch (error) {
      console.warn("Warning: Could not fetch study participants:", error.message);
      // Continue with empty participants array
    }

    // Transform participants to the format expected by the modal
    const participantOptions = participants.map(participant => ({
      text: { type: 'plain_text', text: participant.participant_name },
      value: participant.id.toString()
    }));

    // Get the studies list to pass back to the modal
    const studies = await getStudiesByUser(body.user.id);

    // Build study dropdown options
    const studyOptions = studies.map(study => ({
      text: { type: 'plain_text', text: study.name },
      value: study.id.toString()
    }));

    // Build the modal blocks with updated participant options
    let blocks = JSON.parse(JSON.stringify(updateParticipantStatusModal.blocks));

    // Update the study selection block
    const studyBlockIndex = blocks.findIndex(block => block.block_id === 'study_selection_block');
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
    const participantBlockIndex = blocks.findIndex(block => block.block_id === 'participant_selection_block');
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
      view_id: body.view.id,
      view: {
        ...updateParticipantStatusModal,
        blocks,
        private_metadata: view.private_metadata || "{}",
      }
    });

  } catch (error) {
    console.error("Error handling load participants button:", error);

    // Send error message to user
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `❌ Error loading participants for selected study: ${error.message}`,
    });
  }
};

const handleUpdateParticipantSubmission = async ({ ack, body, view, client }) => {
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
    const updateData = {
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
      const study = await getStudiesByUser(body.user.id).then(studies =>
        studies.find(s => s.id.toString() === studyId)
      );

      if (study) {
        // Get all participants for the study to update the tracker
        const allParticipants = await studyParticipantService.getParticipantsByStudy(studyId);

        // Process the YAML template to update the tracker
        const yamlTemplateFile = await fetchFileFromRepo(getConfigRepo(), "beta-test/YAML Templates", "participant_tracker.yaml");

        if (yamlTemplateFile && yamlTemplateFile.content) {
          const templateData = {
            study_id: studyId,
            study_name: study.name,
            participant_name: participantName,
            status_select: newStatus,
            notes_field: updateNotes,
            current_date: new Date().toISOString().split('T')[0],
            added_by: body.user.username || body.user.name || body.user.id
          };

          await processParticipantYamlTemplate(yamlTemplateFile.content, templateData, study.path || '', 'primary-research', allParticipants);
          console.log("🚀 ~ Participant tracker updated successfully");
        }
      }
    } catch (yamlError) {
      console.warn("⚠️ Warning: Could not update participant tracker YAML:", yamlError.message);
      // Don't throw error here to avoid breaking the main participant update
    }

    // Send success message
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `✅ *Participant Status Updated Successfully!*\n\n*Study:* ${studyName}\n*Participant:* ${participantName}\n*New Status:* ${newStatus}${updateNotes ? `\n*Notes:* ${updateNotes}` : ''}\n\nThe participant's status has been updated in the database and participant tracker.`,
    });

  } catch (error) {
    console.error("Error handling update participant submission:", error);

    // Send error message to user
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `❌ Error updating participant status: ${error.message}`,
    });
  }
};

module.exports = {
  participantHandler,
  updateParticipantHandler,
  // handleParticipantStudySelectionChange,
  handleLoadParticipantsButton,
  handleUpdateParticipantSubmission,
}; 
