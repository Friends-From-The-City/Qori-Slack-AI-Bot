import type { SlashCommandContext, ViewSubmissionContext, BlockActionContext } from '../../../types/handlers';

const { emailModal } = require("../ui/outreach/emailModal");
const { followupModal } = require("../ui/outreach/followupModal");
const { initialRecruitmentModal } = require("../ui/outreach/initialRecruitmentModal");
const { participantOutreachModal } = require("../ui/outreach/participantOutreachModal");
const { reschedulingRequestModal } = require("../ui/outreach/reschedulingRequestModal");
const { sessionConfirmationModal } = require("../ui/outreach/sessionConfirmationModal");
const { sessionReminderModal } = require("../ui/outreach/sessionReminderModal");
const { thankyouModal } = require("../ui/outreach/thankyouModal");
const { basinInfoBlocks } = require("../ui/outreach/basicInfoBlock");
const { getResearchStudyWithRoles, getStudiesByUser } = require("../../../services/research_study.service");
const { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } = require("../../github");
const { processYamlTemplate } = require("../../yamlProcessor");
const studyParticipantService = require("../../../services/study_participant.service");
const { buildAddObserverModal } = require("../ui/addObserverModal");
const sessionObserverService = require("../../../services/session_observer.service");
const { calculatePerPersonCompensation } = require('../../../utils/compensationCalculator');


async function participantOutreachHandler({ ack, body, client, command }: SlashCommandContext): Promise<void> {
  try {
    console.log("🚀 ~ participantOutreachHandler ~ body:", body);
    await ack();
    const channelId = command.channel_id;
    const userId = command.user_id;
    // Fetch studies for this user
    const studies = await getStudiesByUser(userId);
    // Build study dropdown options
    let studyDropdownBlock = null;
    if (studies && studies.length > 0) {
      const studyOptions = studies.map((study: any) => ({
        text: { type: 'plain_text', text: study.name },
        value: study.name
      }));
      studyDropdownBlock = {
        type: 'input',
        block_id: 'study_select_block',
        label: { type: 'plain_text', text: 'Select an existing study:' },
        element: {
          type: 'static_select',
          action_id: 'study_select',
          placeholder: { type: 'plain_text', text: 'Pick a study or ...' },
          options: studyOptions
        },
        optional: false
      };
    }
    // Only show the dropdown at the top
    let blocks = JSON.parse(JSON.stringify(participantOutreachModal.blocks));
    if (studyDropdownBlock) {
      blocks.unshift(studyDropdownBlock);
    }
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        ...participantOutreachModal,
        blocks,
        private_metadata: JSON.stringify({ channelId, userId }),
      },
    });
  } catch (error: any) {
    console.error("🚀 ~ participantOutreachHandler ~ error:", error.data || error.message);
  }
}

async function handleParticipantOutreachSubmit({ ack, body, view, client }: ViewSubmissionContext): Promise<void> {
  // Don't acknowledge yet - we'll return a response with the next view

  console.log("🚀 ~ handleParticipantOutreachSubmit called");
  console.log("🚀 ~ view.state.values:", Object.keys(view.state.values).length, "blocks");
  console.log("🚀 ~ view.private_metadata:", view.private_metadata);

  const values = view.state.values as any;
  const { channelId, userId } = JSON.parse(view.private_metadata || '{}');

  // Get the selected message type from the input block
  const selectedMessageType = values.message_type_block?.message_type?.selected_option;
  const selectedValue = selectedMessageType?.value;

  console.log("🚀 ~ selectedMessageType:", selectedMessageType);
  console.log("🚀 ~ selectedValue:", selectedValue);

  // Get the selected study from the dropdown (if it exists in the modal)
  // The study might be in study_select_block if it was added dynamically
  const selectedStudyOption = values.study_select_block?.study_select?.selected_option ||
                              values.study_select_block?.selected_study?.selected_option;
  const selectedStudy = selectedStudyOption?.value || selectedStudyOption?.text?.text;

  console.log("🚀 ~ selectedStudyOption:", selectedStudyOption);
  console.log("🚀 ~ selectedStudy:", selectedStudy);

  if (!selectedValue || !channelId || !userId) {
    console.error("❌ No message type selected or missing required data. selectedValue:", selectedValue, "channelId:", channelId, "userId:", userId);
    await (ack as any)({
      response_action: "errors",
      errors: {
        message_type_block: "Please select a message type."
      }
    });
    return;
  }

  // Study might be in metadata if it was passed from previous step
  const studyFromMeta = view.private_metadata ? JSON.parse(view.private_metadata).studyName : null;
  const finalSelectedStudy = selectedStudy || studyFromMeta;

  console.log("🚀 ~ finalSelectedStudy:", finalSelectedStudy);

  if (!finalSelectedStudy) {
    console.error("❌ No study selected.");
    await (ack as any)({
      response_action: "errors",
      errors: {
        study_select_block: "Please select a study."
      }
    });
    return;
  }

  const study = await getResearchStudyWithRoles(finalSelectedStudy);

  let nextModal;

  switch (selectedValue) {
    case "initial_recruitment":
      nextModal = initialRecruitmentModal;
      break;
    case "session_confirmation":
      nextModal = sessionConfirmationModal;
      break;
    case "session_reminder":
      nextModal = sessionReminderModal;
      break;
    case "rescheduling_request":
      nextModal = reschedulingRequestModal;
      break;
    case "follow_up":
      nextModal = followupModal;
      break;
    case "thank_you":
      nextModal = thankyouModal;
      break;
    default:
      console.error("Invalid message type selected.");
      return;
  }

  try {
    console.log("🚀 ~ Opening next modal for:", selectedValue);

    // Load participants for the study to populate the dropdown
    const participants = await studyParticipantService.getParticipantsByStudy(study.id);
    const participantOptions = participants.length > 0
      ? participants.map((p: any) => ({
        text: { type: 'plain_text', text: p.participant_name },
        value: p.id.toString(),
      }))
      : [{ text: { type: 'plain_text', text: 'No participants — add via /qori-fieldwork' }, value: 'no_participants' }];

    // Inject participant options into the modal blocks
    const modalWithParticipants = {
      ...nextModal,
      blocks: nextModal.blocks.map((block: any) => {
        if (block.type === 'input' && block.block_id === 'participant_id_block') {
          return {
            ...block,
            element: {
              ...block.element,
              options: participantOptions,
            },
          };
        }
        return block;
      }),
    };

    await (ack as any)({
      response_action: "push",
      view: {
        ...modalWithParticipants,
        private_metadata: JSON.stringify({ channelId, userId, studyName: study.name || finalSelectedStudy, studyId: String(study.id || ''), researcher_name: study.researcher_name, researcher_email: study.researcher_email }),
      },
    });

    console.log("🚀 ~ Successfully pushed next modal");
  } catch (err: any) {
    console.error("Error opening next modal:", err.data || err.message || err);
    // Acknowledge with an error response
    await (ack as any)({
      response_action: "errors",
      errors: {
        message_type_block: "An error occurred. Please try again."
      }
    });
  }
}

async function handleInitialRecruitmentSubmit({ ack, body, view, client }: ViewSubmissionContext): Promise<void> {
  console.log("🚀 ~ handleInitialRecruitmentSubmit called");
  console.log("🚀 ~ view.state.values:", Object.keys(view.state.values).length, "blocks");

  // Store view_id for later update
  const viewId = body.view.id;

  try {
    // 1. Acknowledge with loading state to keep modal open
    await (ack as any)({
      response_action: "update",
      view: {
        type: "modal",
        title: { type: "plain_text", text: "Please wait" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "section",
            text: { type: "plain_text", text: "Generating your message, please wait..." }
          }
        ]
      }
    });

    // 2. Extract values from the view
    const state = view.state.values as any;
    const meta = JSON.parse(view.private_metadata || '{}');

    // Get participant from dropdown selection
    const participantDbId = state.participant_id_block?.participant_id?.selected_option?.value;
    const participant_id = state.participant_id_block?.participant_id?.selected_option?.text?.text || "";

    // Get study info from metadata (passed from previous modal)
    const study_name = meta.studyName || "";
    const study_id = meta.studyId || "";

    // Get researcher info from study object (since it's no longer in the modal)
    const study = await getResearchStudyWithRoles(study_name);
    const researcher_name = study?.researcher_name || meta.researcher_name || "";
    const researcher_email = study?.researcher_email || meta.researcher_email || "";

    // Get signup instructions from new block structure
    const signup_instructions = state.signup_instructions_block?.signup_instructions?.value || "";

    const user = body.user.id;

    const tone = "friendly"; // Default to friendly since it's no longer in modal
    const compAmt = calculatePerPersonCompensation(study);

    const data = {
      message_type: "initial_recruitment",
      participant_id,
      study_id,
      study_name,
      researcher_name,
      researcher_email,
      researcher_phone: "",
      contact_method: "email",
      tone,
      study_description: "",
      signup_instructions,
      incentive_amount: compAmt ? `$${compAmt}` : '',
    }
    const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "participant_outreach.yaml");
    const renderedYaml = await processYamlTemplate(file.content, data, study.path);
    console.log("🚀 ~ handleInitialRecruitmentSubmit ~ renderedYaml:", renderedYaml)

    // Record outreach event on the participant row
    if (participantDbId && participantDbId !== 'no_participants') {
      const participant = await studyParticipantService.getParticipantById(parseInt(participantDbId, 10));
      if (participant) await participant.recordOutreachSent('email');
    }

    // 3. Update the modal with the final content using views.update
    // Note: After response_action: "update", we need to use the view_id from the updated view
    // The hash will be invalid, so we'll try without it first, or get it from a subsequent call
    try {
      await client.views.update({
        view_id: viewId,
        view: emailModal({
          participantName: participant_id,
          researcherName: researcher_name,
          researcherEmail: researcher_email,
          studyName: study_name,
          tone,
          subject: `Research Opportunity: ${study_name} - Your Input Needed`,
          filePath: renderedYaml.result.path,
          fileUrl: renderedYaml.result.url,
          messageBody: renderedYaml.outputTemplate,
        }),
      });
      console.log("🚀 ~ Successfully updated view with email modal");
    } catch (updateErr: any) {
      // If update fails (e.g., hash mismatch), try to get the current view and update again
      console.warn("First update attempt failed, trying without hash:", updateErr.message);
      // The view was already updated with loading, so we can try updating again
      // Slack will provide a new hash if needed
      const currentView = await (client.views as any).info({ view_id: viewId });
      await client.views.update({
        view_id: viewId,
        hash: currentView.view.hash,
        view: emailModal({
          participantName: participant_id,
          researcherName: researcher_name,
          researcherEmail: researcher_email,
          studyName: study_name,
          tone,
          subject: `Research Opportunity: ${study_name} - Your Input Needed`,
          filePath: renderedYaml.result.path,
          fileUrl: renderedYaml.result.url,
          messageBody: renderedYaml.outputTemplate,
        }),
      });
    }

  } catch (err: any) {
    console.error("🚨 Error handling initial recruitment modal submission:", err);

    // Acknowledge with error response
    try {
      await (ack as any)({
        response_action: "errors",
        errors: {
          participant_id_block: "An error occurred. Please try again.",
        }
      });

      // Also try to send an error message
      const meta = JSON.parse(view.private_metadata || '{}');
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: `❌ Error generating message: ${err.message || 'Unknown error'}. Please try again.`
      });
    } catch (ackErr: any) {
      console.error("Error acknowledging with error:", ackErr);
    }
  }
}

async function handleReschedulingRequestSubmit({ ack, body, view, client }: ViewSubmissionContext): Promise<void> {
  console.log("🚀 ~ handleReschedulingRequestSubmit called");
  console.log("🚀 ~ view.state.values:", Object.keys(view.state.values).length, "blocks");

  // Store view_id for later update
  const viewId = body.view.id;

  try {
    // 1. Acknowledge with loading state to keep modal open
    await (ack as any)({
      response_action: "update",
      view: {
        type: "modal",
        title: { type: "plain_text", text: "Please wait" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "section",
            text: { type: "plain_text", text: "Generating your message, please wait..." }
          }
        ]
      }
    });

    // 2. Extract values from the view
    const state = view.state.values as any;
    const meta = JSON.parse(view.private_metadata || '{}');

    // Get participant from dropdown selection
    const participantDbId = state.participant_id_block?.participant_id?.selected_option?.value;
    const participant_id = state.participant_id_block?.participant_id?.selected_option?.text?.text || "";

    // Get study info from metadata (passed from previous modal)
    const study_name = meta.studyName || "";
    const study_id = meta.studyId || "";

    // Get researcher info from study object (since it's no longer in the modal)
    const study = await getResearchStudyWithRoles(study_name);
    const researcher_name = study?.researcher_name || meta.researcher_name || "";
    const researcher_email = study?.researcher_email || meta.researcher_email || "";

    // Extract fields from rescheduling section
    const original_date = state.original_date_block?.original_date?.selected_date || "";
    const new_options = state.new_options_block?.new_options?.value || "";

    const data = {
      message_type: "rescheduling_request",
      participant_id,
      study_id,
      study_name,
      researcher_name,
      researcher_email,
      original_date,
      new_options,
    }

    const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "participant_outreach.yaml");
    const renderedYaml = await processYamlTemplate(file.content, data, study.path);
    console.log("🚀 ~ handleReschedulingRequestSubmit ~ renderedYaml:", renderedYaml);

    if (participantDbId && participantDbId !== 'no_participants') {
      const participant = await studyParticipantService.getParticipantById(parseInt(participantDbId, 10));
      if (participant) await participant.recordOutreachSent('email');
    }

    // 3. Update the modal with the final content using views.update
    try {
      await client.views.update({
        view_id: viewId,
        view: emailModal({
          participantName: participant_id,
          researcherName: researcher_name,
          researcherEmail: researcher_email,
          studyName: study_name,
          tone: "friendly",
          subject: `Rescheduling Request: ${study_name}`,
          filePath: renderedYaml.result.path,
          fileUrl: renderedYaml.result.url,
          messageBody: renderedYaml.outputTemplate,
        }),
      });
      console.log("🚀 ~ Successfully updated view with email modal");
    } catch (updateErr: any) {
      // If update fails (e.g., hash mismatch), try to get the current view and update again
      console.warn("First update attempt failed, trying without hash:", updateErr.message);
      const currentView = await (client.views as any).info({ view_id: viewId });
      await client.views.update({
        view_id: viewId,
        hash: currentView.view.hash,
        view: emailModal({
          participantName: participant_id,
          researcherName: researcher_name,
          researcherEmail: researcher_email,
          studyName: study_name,
          tone: "friendly",
          subject: `Rescheduling Request: ${study_name}`,
          filePath: renderedYaml.result.path,
          fileUrl: renderedYaml.result.url,
          messageBody: renderedYaml.outputTemplate,
        }),
      });
    }

  } catch (err: any) {
    console.error("🚨 Error handling rescheduling request modal submission:", err);

    // Acknowledge with error response
    try {
      await (ack as any)({
        response_action: "errors",
        errors: {
          participant_id_block: "An error occurred. Please try again.",
        }
      });

      // Also try to send an error message
      const meta = JSON.parse(view.private_metadata || '{}');
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: `❌ Error generating message: ${err.message || 'Unknown error'}. Please try again.`
      });
    } catch (ackErr: any) {
      console.error("Error acknowledging with error:", ackErr);
    }
  }
}

async function handleSessionConfirmationSubmit({ ack, body, view, client }: ViewSubmissionContext): Promise<void> {
  console.log("🚀 ~ handleSessionConfirmationSubmit called");
  console.log("🚀 ~ view.state.values:", Object.keys(view.state.values).length, "blocks");

  // Store view_id for later update
  const viewId = body.view.id;

  try {
    // 1. Acknowledge with loading state to keep modal open
    await (ack as any)({
      response_action: "update",
      view: {
        type: "modal",
        title: { type: "plain_text", text: "Please wait" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "section",
            text: { type: "plain_text", text: "Generating your message, please wait..." }
          }
        ]
      }
    });

    // 2. Extract values from the view
    const state = view.state.values as any;
    const meta = JSON.parse(view.private_metadata || '{}');

    // Get participant from dropdown selection
    const participantDbId = state.participant_id_block?.participant_id?.selected_option?.value;
    const participant_id = state.participant_id_block?.participant_id?.selected_option?.text?.text || "";

    // Get study info from metadata (passed from previous modal)
    const study_name = meta.studyName || "";
    const study_id = meta.studyId || "";

    // Get researcher info from study object (since it's no longer in the modal)
    const study = await getResearchStudyWithRoles(study_name);
    const researcher_name = study?.researcher_name || meta.researcher_name || "";
    const researcher_email = study?.researcher_email || meta.researcher_email || "";

    // Extract session-specific fields
    const session_date = state.session_date_block?.session_date?.selected_date || "";
    const session_time = state.session_time_block?.session_time?.selected_time || "";
    const meeting_link = state.meeting_link_block?.meeting_link?.value || "";

    const data = {
      message_type: "session_confirmation",
      participant_id,
      study_id,
      study_name,
      researcher_name,
      researcher_email,
      session_date,
      session_time,
      meeting_link,
    }

    const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "participant_outreach.yaml");
    const renderedYaml = await processYamlTemplate(file.content, data, study.path);
    console.log("🚀 ~ handleSessionConfirmationSubmit ~ renderedYaml:", renderedYaml);

    if (participantDbId && participantDbId !== 'no_participants') {
      const participant = await studyParticipantService.getParticipantById(parseInt(participantDbId, 10));
      if (participant) await participant.recordOutreachSent('email');
    }

    // 3. Update the modal with the final content using views.update
    try {
      await client.views.update({
        view_id: viewId,
        view: emailModal({
          participantName: participant_id,
          researcherName: researcher_name,
          researcherEmail: researcher_email,
          studyName: study_name,
          tone: "friendly",
          subject: `Session Confirmation: ${study_name}`,
          filePath: renderedYaml.result.path,
          fileUrl: renderedYaml.result.url,
          messageBody: renderedYaml.outputTemplate,
        }),
      });
      console.log("🚀 ~ Successfully updated view with email modal");
    } catch (updateErr: any) {
      // If update fails (e.g., hash mismatch), try to get the current view and update again
      console.warn("First update attempt failed, trying without hash:", updateErr.message);
      const currentView = await (client.views as any).info({ view_id: viewId });
      await client.views.update({
        view_id: viewId,
        hash: currentView.view.hash,
        view: emailModal({
          participantName: participant_id,
          researcherName: researcher_name,
          researcherEmail: researcher_email,
          studyName: study_name,
          tone: "friendly",
          subject: `Session Confirmation: ${study_name}`,
          filePath: renderedYaml.result.path,
          fileUrl: renderedYaml.result.url,
          messageBody: renderedYaml.outputTemplate,
        }),
      });
    }

  } catch (err: any) {
    console.error("🚨 Error handling session confirmation modal submission:", err);

    // Acknowledge with error response
    try {
      await (ack as any)({
        response_action: "errors",
        errors: {
          participant_id_block: "An error occurred. Please try again.",
        }
      });

      // Also try to send an error message
      const meta = JSON.parse(view.private_metadata || '{}');
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: `❌ Error generating message: ${err.message || 'Unknown error'}. Please try again.`
      });
    } catch (ackErr: any) {
      console.error("Error acknowledging with error:", ackErr);
    }
  }
}

async function handleThankYouSubmit({ ack, body, view, client }: ViewSubmissionContext): Promise<void> {
  console.log("🚀 ~ handleThankYouSubmit called");
  console.log("🚀 ~ view.state.values:", Object.keys(view.state.values).length, "blocks");

  // Store view_id for later update
  const viewId = body.view.id;

  try {
    // 1. Acknowledge with loading state to keep modal open
    await (ack as any)({
      response_action: "update",
      view: {
        type: "modal",
        title: { type: "plain_text", text: "Please wait" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "section",
            text: { type: "plain_text", text: "Generating your message, please wait..." }
          }
        ]
      }
    });

    // 2. Extract values from the view
    const state = view.state.values as any;
    const meta = JSON.parse(view.private_metadata || '{}');

    // Get participant from dropdown selection
    const participantDbId = state.participant_id_block?.participant_id?.selected_option?.value;
    const participant_id = state.participant_id_block?.participant_id?.selected_option?.text?.text || "";

    // Get study info from metadata (passed from previous modal)
    const study_name = meta.studyName || "";
    const study_id = meta.studyId || "";

    // Get researcher info from study object (since it's no longer in the modal)
    const study = await getResearchStudyWithRoles(study_name);
    const researcher_name = study?.researcher_name || meta.researcher_name || "";
    const researcher_email = study?.researcher_email || meta.researcher_email || "";

    const compAmount = calculatePerPersonCompensation(study);
    const incentive_amount = compAmount ? `$${compAmount}` : '';

    const data = {
      message_type: "thank_you",
      participant_id,
      participant_name: participant_id, // For backward compatibility
      study_id,
      study_name,
      researcher_name,
      researcher_email,
      incentive_amount,
    }

    const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "participant_outreach.yaml");
    const renderedYaml = await processYamlTemplate(file.content, data, study.path);
    console.log("🚀 ~ handleThankYouSubmit ~ renderedYaml:", renderedYaml)

    if (participantDbId && participantDbId !== 'no_participants') {
      const participant = await studyParticipantService.getParticipantById(parseInt(participantDbId, 10));
      if (participant) await participant.recordOutreachSent('email');
    }

    // 3. Update the modal with the final content using views.update
    // Note: After response_action: "update", we need to use the view_id from the updated view
    // The hash will be invalid, so we'll try without it first, or get it from a subsequent call
    try {
      await client.views.update({
        view_id: viewId,
        view: emailModal({
          participantName: participant_id,
          studyName: study_name,
          subject: `Thank You for Participating in ${study_name}`,
          filePath: renderedYaml.result.path,
          fileUrl: renderedYaml.result.url,
          messageBody: renderedYaml.outputTemplate,
        }),
      });
      console.log("🚀 ~ Successfully updated view with email modal");
    } catch (updateErr: any) {
      // If update fails (e.g., hash mismatch), try to get the current view and update again
      console.warn("First update attempt failed, trying without hash:", updateErr.message);
      // The view was already updated with loading, so we can try updating again
      // Slack will provide a new hash if needed
      const currentView = await (client.views as any).info({ view_id: viewId });
      await client.views.update({
        view_id: viewId,
        hash: currentView.view.hash,
        view: emailModal({
          participantName: participant_id,
          studyName: study_name,
          subject: `Thank You for Participating in ${study_name}`,
          filePath: renderedYaml.result.path,
          fileUrl: renderedYaml.result.url,
          messageBody: renderedYaml.outputTemplate,
        }),
      });
    }

  } catch (err: any) {
    console.error("🚨 Error handling thank you modal submission:", err);

    // Optionally, update the modal to show an error message
    try {
      await client.views.update({
        view_id: viewId,
        view: {
          type: "modal",
          title: { type: "plain_text", text: "Error" },
          close: { type: "plain_text", text: "Close" },
          blocks: [
            {
              type: "section",
              text: { type: "plain_text", text: "An error occurred while generating your message. Please try again later." }
            }
          ]
        }
      });
    } catch (updateErr: any) {
      console.error("Failed to update modal with error message:", updateErr);
    }
  }
}

async function handleFollowUpSubmit({ ack, body, view, client }: ViewSubmissionContext): Promise<void> {
  console.log("🚀 ~ handleFollowUpSubmit called");
  console.log("🚀 ~ view.state.values:", Object.keys(view.state.values).length, "blocks");

  // Store view_id for later update
  const viewId = body.view.id;

  try {
    // 1. Acknowledge with loading state to keep modal open
    await (ack as any)({
      response_action: "update",
      view: {
        type: "modal",
        title: { type: "plain_text", text: "Please wait" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "section",
            text: { type: "plain_text", text: "Generating your message, please wait..." }
          }
        ]
      }
    });

    // 2. Extract values from the view
    const state = view.state.values as any;
    const meta = JSON.parse(view.private_metadata || '{}');

    // Get participant from dropdown selection
    const participantDbId = state.participant_id_block?.participant_id?.selected_option?.value;
    const participant_id = state.participant_id_block?.participant_id?.selected_option?.text?.text || "";

    // Get study info from metadata (passed from previous modal)
    const study_name = meta.studyName || "";
    const study_id = meta.studyId || "";

    // Get researcher info from study object (since it's no longer in the modal)
    const study = await getResearchStudyWithRoles(study_name);
    const researcher_name = study?.researcher_name || meta.researcher_name || "";
    const researcher_email = study?.researcher_email || meta.researcher_email || "";

    const data = {
      message_type: "follow_up",
      participant_id,
      participant_name: participant_id, // For backward compatibility
      study_id,
      study_name,
      researcher_name,
      researcher_email,
    }

    const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "participant_outreach.yaml");
    const renderedYaml = await processYamlTemplate(file.content, data, study.path);
    console.log("🚀 ~ handleFollowUpSubmit ~ renderedYaml:", renderedYaml)

    if (participantDbId && participantDbId !== 'no_participants') {
      const participant = await studyParticipantService.getParticipantById(parseInt(participantDbId, 10));
      if (participant) await participant.recordOutreachSent('email');
    }

    // 3. Update the modal with the final content using views.update
    // Note: After response_action: "update", we need to use the view_id from the updated view
    // The hash will be invalid, so we'll try without it first, or get it from a subsequent call
    try {
      await client.views.update({
        view_id: viewId,
        view: emailModal({
          participantName: participant_id,
          studyName: study_name,
          subject: `Follow Up: ${study_name}`,
          filePath: renderedYaml.result.path,
          fileUrl: renderedYaml.result.url,
          messageBody: renderedYaml.outputTemplate,
        }),
      });
      console.log("🚀 ~ Successfully updated view with email modal");
    } catch (updateErr: any) {
      // If update fails (e.g., hash mismatch), try to get the current view and update again
      console.warn("First update attempt failed, trying without hash:", updateErr.message);
      // The view was already updated with loading, so we can try updating again
      // Slack will provide a new hash if needed
      const currentView = await (client.views as any).info({ view_id: viewId });
      await client.views.update({
        view_id: viewId,
        hash: currentView.view.hash,
        view: emailModal({
          participantName: participant_id,
          studyName: study_name,
          subject: `Follow Up: ${study_name}`,
          filePath: renderedYaml.result.path,
          fileUrl: renderedYaml.result.url,
          messageBody: renderedYaml.outputTemplate,
        }),
      });
    }

  } catch (err: any) {
    console.error("🚨 Error handling follow-up modal submission:", err);

    // Optionally, update the modal to show an error message
    try {
      await client.views.update({
        view_id: viewId,
        view: {
          type: "modal",
          title: { type: "plain_text", text: "Error" },
          close: { type: "plain_text", text: "Close" },
          blocks: [
            {
              type: "section",
              text: { type: "plain_text", text: "An error occurred while generating your message. Please try again later." }
            }
          ]
        }
      });
    } catch (updateErr: any) {
      console.error("Failed to update modal with error message:", updateErr);
    }
  }
}

async function handleSessionReminderSubmit({ ack, body, view, client }: ViewSubmissionContext): Promise<void> {
  console.log("🚀 ~ handleSessionReminderSubmit called");
  console.log("🚀 ~ view.state.values:", Object.keys(view.state.values).length, "blocks");

  // Store view_id for later update
  const viewId = body.view.id;

  try {
    // 1. Acknowledge with loading state to keep modal open
    await (ack as any)({
      response_action: "update",
      view: {
        type: "modal",
        title: { type: "plain_text", text: "Please wait" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "section",
            text: { type: "plain_text", text: "Generating your message, please wait..." }
          }
        ]
      }
    });

    // 2. Extract values from the view
    const state = view.state.values as any;
    const meta = JSON.parse(view.private_metadata || '{}');

    // Get participant from dropdown selection
    const participantDbId = state.participant_id_block?.participant_id?.selected_option?.value;
    const participant_id = state.participant_id_block?.participant_id?.selected_option?.text?.text || "";

    // Get study info from metadata (passed from previous modal)
    const study_name = meta.studyName || "";
    const study_id = meta.studyId || "";

    // Get researcher info from study object (since it's no longer in the modal)
    const study = await getResearchStudyWithRoles(study_name);
    const researcher_name = study?.researcher_name || meta.researcher_name || "";
    const researcher_email = study?.researcher_email || meta.researcher_email || "";

    // Extract session-specific fields
    const session_date = state.session_date_block?.session_date?.selected_date || "";
    const session_time = state.session_time_block?.session_time?.selected_time || "";
    const meeting_link = state.meeting_link_block?.meeting_link?.value || "";

    const data = {
      message_type: "session_reminder",
      participant_id,
      study_id,
      study_name,
      researcher_name,
      researcher_email,
      session_date,
      session_time,
      meeting_link,
    }

    const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "participant_outreach.yaml");
    const renderedYaml = await processYamlTemplate(file.content, data, study.path);
    console.log("🚀 ~ handleSessionReminderSubmit ~ renderedYaml:", renderedYaml);

    if (participantDbId && participantDbId !== 'no_participants') {
      const participant = await studyParticipantService.getParticipantById(parseInt(participantDbId, 10));
      if (participant) await participant.recordOutreachSent('email');
    }

    // 3. Update the modal with the final content using views.update
    try {
      await client.views.update({
        view_id: viewId,
        view: emailModal({
          participantName: participant_id,
          researcherName: researcher_name,
          researcherEmail: researcher_email,
          studyName: study_name,
          tone: "friendly",
          subject: `Session Reminder: ${study_name}`,
          filePath: renderedYaml.result.path,
          fileUrl: renderedYaml.result.url,
          messageBody: renderedYaml.outputTemplate,
        }),
      });
      console.log("🚀 ~ Successfully updated view with email modal");
    } catch (updateErr: any) {
      // If update fails (e.g., hash mismatch), try to get the current view and update again
      console.warn("First update attempt failed, trying without hash:", updateErr.message);
      const currentView = await (client.views as any).info({ view_id: viewId });
      await client.views.update({
        view_id: viewId,
        hash: currentView.view.hash,
        view: emailModal({
          participantName: participant_id,
          researcherName: researcher_name,
          researcherEmail: researcher_email,
          studyName: study_name,
          tone: "friendly",
          subject: `Session Reminder: ${study_name}`,
          filePath: renderedYaml.result.path,
          fileUrl: renderedYaml.result.url,
          messageBody: renderedYaml.outputTemplate,
        }),
      });
    }

  } catch (err: any) {
    console.error("🚨 Error handling session reminder modal submission:", err);

    // Acknowledge with error response
    try {
      await (ack as any)({
        response_action: "errors",
        errors: {
          participant_id_block: "An error occurred. Please try again.",
        }
      });

      // Also try to send an error message
      const meta = JSON.parse(view.private_metadata || '{}');
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: `❌ Error generating message: ${err.message || 'Unknown error'}. Please try again.`
      });
    } catch (ackErr: any) {
      console.error("Error acknowledging with error:", ackErr);
    }
  }
}

async function handleAddParticipantSubmit({ ack, body, view, client }: ViewSubmissionContext): Promise<void> {
  await ack();

  try {
    const state = view.state.values as any;
    const meta = JSON.parse(body.view.private_metadata || '{}');
    const { channelId, userId } = meta;

    // Extract study from dropdown selection
    const selectedStudyOption = state.study_select_block?.study_select?.selected_option || null;
    const study_id = selectedStudyOption?.value || "";
    const study_name = selectedStudyOption?.text?.text || "";
    const participant_name = state.participant_name_block?.participant_name?.value || "";
    const recruitment_source = state.recruitment_method_block?.recruitment_method?.selected_option?.value || "";
    const scheduled_date = state.session_date_block?.session_date?.selected_date || "";
    const scheduled_time = state.session_time_block?.session_time?.selected_time || "";
    const status_select = state.current_status_block?.current_status?.selected_option?.value || "";
    const notes_field = state.notes_accommodations_block?.notes_accommodations?.value || "";
    // Extract demographic information from the new dropdown fields
    const race_ethnicity = state.race_ethnicity_block?.race_ethnicity?.selected_option?.value || "";
    const age_range = state.age_range_block?.age_range?.selected_option?.value || "";
    const education_level = state.education_level_block?.education_level?.selected_option?.value || "";
    const location_type = state.location_type_block?.location_type?.selected_option?.value || "";

    // Combine demographic info into a structured format
    const demographics_info = {
      race_ethnicity,
      age_range,
      education_level,
      location_type
    };

    const current_date = new Date().toISOString().split('T')[0];
    const added_by = userId;

    const data = {
      study_id,
      study_name,
      participant_name,
      recruitment_source,
      scheduled_date,
      scheduled_time,
      status_select,
      notes_field,
      demographics_info,
      current_date,
      added_by
    }
    console.log(`🚀 ~ handleAddParticipantSubmit: study=${data.study_name}, participant=${(data as any).participant_id}`);

    const study = await getResearchStudyWithRoles(study_name);

    // Snapshot per-person compensation from study budget
    const compensation = calculatePerPersonCompensation(study);

    // Save participant to database
    const participantData = {
      study_id: study.id,
      participant_name: data.participant_name,
      recruitment_source: data.recruitment_source,
      scheduled_date: data.scheduled_date,
      scheduled_time: data.scheduled_time,
      status_select: data.status_select,
      notes_field: data.notes_field,
      demographics_info: data.demographics_info,
      added_by: data.added_by,
      compensation_amount: compensation,
    };


    const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "participant_tracker.yaml");
    const fileData = {
      file: file.content,
      study_path: study.path
    }
    const savedParticipant = await studyParticipantService.createParticipant(participantData, fileData);
    console.log("🚀 ~ handleAddParticipantSubmit ~ savedParticipant:", savedParticipant);

    // Check if this participant brings the total to 3 and send milestone message
    const milestoneCheck = await studyParticipantService.checkStudyMilestone(study.id);
    const githubUrl = `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/tree/main/${study.path}/primary-research/02-participants/${study.name}_participant_tracker.md`;
    if (milestoneCheck.hasReachedMilestone) {
      // Generate a milestone message for the channel
      const milestoneMessage = {
        text: `:tada: *Milestone reached!* The study *${milestoneCheck.studyName}* now has ${milestoneCheck.currentCount} participants.`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:tada: *Milestone reached!*\n\nThe study *${milestoneCheck.studyName}* now has *${milestoneCheck.currentCount}* participants.`
            }
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `<${githubUrl}|:github: View Participant Tracker on GitHub>`,
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Request to Observe",
                  emoji: true
                },
                style: "primary",
                action_id: "open_observer_modal",
                value: JSON.stringify({
                  studyId: study.id,
                  studyName: milestoneCheck.studyName,
                  participantCount: milestoneCheck.currentCount
                })
              }
            ]
          }
        ]
      };
      await client.chat.postMessage({
        channel: channelId,
        ...milestoneMessage
      });
    }

    // Send message to the researcher's DM with the GitHub link to the participant tracker
    await client.chat.postMessage({
      channel: added_by, // Slack user ID of the researcher who added the participant
      text: `:busts_in_silhouette: *New Participant Added*\n\n*Participant:* ${participant_name}\n*Study:* ${study_name}\n*Status:* ${status_select}\n*Recruitment Source:* ${recruitment_source}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:busts_in_silhouette: *New Participant Added*\n\n*Participant:* ${participant_name}\n*Study:* ${study_name}\n*Status:* ${status_select}\n*Recruitment Source:* ${recruitment_source}`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `<${githubUrl}|:github: View Participant Tracker on GitHub>`
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Added by <@${added_by}> • ${current_date}`
            }
          ]
        }
      ]
    });

    // Close the modal with a simple success message
    // await client.views.update({
    //   view_id: body.view.id,
    //   view: {
    //     type: "modal",
    //     title: { type: "plain_text", text: "Success" },
    //     close: { type: "plain_text", text: "Close" },
    //     blocks: [
    //       {
    //         type: "section",
    //         text: {
    //           type: "mrkdwn",
    //           text: `:white_check_mark: *Participant Added Successfully!*\n\nThe participant has been added and a notification has been sent to the channel.`
    //         }
    //       }
    //     ]
    //   }
    // });

  } catch (error: any) {
    console.error("🚨 Error handling add participant modal submission:", error);

    // Show error modal
    await client.views.update({
      view_id: body.view.id,
      view: {
        type: "modal",
        title: { type: "plain_text", text: "Error" },
        close: { type: "plain_text", text: "Close" },
        blocks: [
          {
            type: "section",
            text: { type: "plain_text", text: "An error occurred while adding the participant. Please try again." }
          }
        ]
      }
    });
  }
}

// Handler for the observer modal button click (from outreach flow)
async function handleObserverModalButton({ ack, body, client }: BlockActionContext): Promise<void> {
  try {
    await ack();

    const { value } = (body as any).actions[0];
    const { studyId, studyName } = JSON.parse(value);
    const channelId = (body as any).channel?.id || body.user.id;

    // Build sessions with current observer counts
    const sessions = await sessionObserverService.buildSessionsWithCounts(studyId);

    if (sessions.length === 0) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: body.user.id,
        text: 'Add a session to the study before inviting observers.',
      });
      return;
    }

    // Resolve channel display name
    let channelName = 'channel';
    try {
      const channelInfo = await client.conversations.info({ channel: channelId });
      channelName = (channelInfo as any).channel?.name || 'channel';
    } catch (e) { /* fallback */ }

    const observeView = buildAddObserverModal(sessions, channelName);
    await client.views.open({
      trigger_id: (body as any).trigger_id,
      view: {
        ...observeView,
        private_metadata: JSON.stringify({
          channelId,
          userId: body.user.id,
          studyId,
          studyName,
        }),
      },
    });

  } catch (error: any) {
    console.error("Error handling observer modal button:", error);
    await client.chat.postEphemeral({
      channel: (body as any).channel?.id || body.user.id,
      user: body.user.id,
      text: "Sorry, there was an error opening the observer modal. Please try again.",
    });
  }
}

module.exports = {
  participantOutreachHandler,
  handleParticipantOutreachSubmit,
  handleInitialRecruitmentSubmit,
  handleReschedulingRequestSubmit,
  handleSessionConfirmationSubmit,
  handleThankYouSubmit,
  handleFollowUpSubmit,
  handleSessionReminderSubmit,
  handleAddParticipantSubmit,
  handleObserverModalButton,
};
