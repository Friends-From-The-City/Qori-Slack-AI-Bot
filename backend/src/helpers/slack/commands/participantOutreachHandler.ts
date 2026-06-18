import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction, ButtonAction } from '@slack/bolt';
import type { View } from '@slack/types';

import { emailModal } from "../ui/outreach/emailModal";
import { followupModal } from "../ui/outreach/followupModal";
import { initialRecruitmentModal } from "../ui/outreach/initialRecruitmentModal";
import { participantOutreachModal } from "../ui/outreach/participantOutreachModal";
import { reschedulingRequestModal } from "../ui/outreach/reschedulingRequestModal";
import { sessionConfirmationModal } from "../ui/outreach/sessionConfirmationModal";
import { sessionReminderModal } from "../ui/outreach/sessionReminderModal";
import { thankyouModal } from "../ui/outreach/thankyouModal";
import { basinInfoBlocks } from "../ui/outreach/basicInfoBlock";
import { resolveStudyFromName, getStudiesByUser } from "../../../services/research_study.service";
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } from "../../github";
import { processYamlTemplate } from "../../yamlProcessor";
import studyParticipantService from "../../../services/study_participant.service";
import { buildAddObserverModal } from "../ui/addObserverModal";
import sessionObserverService from "../../../services/session_observer.service";
import { calculatePerPersonCompensation } from '../../../utils/compensationCalculator';
import { refreshDashboardAfterAction } from './fieldworkHandler';
import { assertStudyAccess } from '../../../services/authorization.service';


async function participantOutreachHandler({ ack, body, client, command }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> {
  try {
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
      } as View,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const detail = (error as Record<string, unknown>)?.data ?? message;
    console.error("🚀 ~ participantOutreachHandler ~ error:", detail);
  }
}

async function handleParticipantOutreachSubmit({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  // Don't acknowledge yet - we'll return a response with the next view


  const values = view.state.values as any;
  const { channelId, userId } = JSON.parse(view.private_metadata || '{}');

  // Get the selected message type from the input block
  const selectedMessageType = values.message_type_block?.message_type?.selected_option;
  const selectedValue = selectedMessageType?.value;


  // Get the selected study from the dropdown (if it exists in the modal)
  // The study might be in study_select_block if it was added dynamically
  const selectedStudyOption = values.study_select_block?.study_select?.selected_option ||
                              values.study_select_block?.selected_study?.selected_option;
  const selectedStudy = selectedStudyOption?.value || selectedStudyOption?.text?.text;


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

  const resolved = await resolveStudyFromName(finalSelectedStudy);
  if (!resolved) throw new Error(`Study "${finalSelectedStudy}" not found`);
  const study = resolved.study;

  // Authorization check: verify user has access to this study (ADR 0024)
  await assertStudyAccess(userId, resolved.studyId, client);

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

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = (err as Record<string, unknown>)?.data ?? message;
    console.error("Error opening next modal:", detail);
    // Acknowledge with an error response
    await (ack as any)({
      response_action: "errors",
      errors: {
        message_type_block: "An error occurred. Please try again."
      }
    });
  }
}

async function handleInitialRecruitmentSubmit({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {

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
    const resolved = await resolveStudyFromName(study_name);
    if (!resolved) throw new Error(`Study "${study_name}" not found`);
    const study = resolved.study;
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
    const renderedYaml = await processYamlTemplate(file.content, data, study.path ?? '');

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
    } catch (updateErr) {
      // If update fails (e.g., hash mismatch), try to get the current view and update again
      const updateErrMessage = updateErr instanceof Error ? updateErr.message : String(updateErr);
      console.warn("First update attempt failed, trying without hash:", updateErrMessage);
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

  } catch (err) {
    console.error("🚨 Error handling initial recruitment modal submission:", err);
    const message = err instanceof Error ? err.message : String(err);

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
        text: `❌ Error generating message: ${message || 'Unknown error'}. Please try again.`
      });
    } catch (ackErr) {
      console.error("Error acknowledging with error:", ackErr);
    }
  }
}

async function handleReschedulingRequestSubmit({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {

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
    const resolved = await resolveStudyFromName(study_name);
    if (!resolved) throw new Error(`Study "${study_name}" not found`);
    const study = resolved.study;
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
    const renderedYaml = await processYamlTemplate(file.content, data, study.path ?? '');

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
    } catch (updateErr) {
      // If update fails (e.g., hash mismatch), try to get the current view and update again
      const updateErrMessage = updateErr instanceof Error ? updateErr.message : String(updateErr);
      console.warn("First update attempt failed, trying without hash:", updateErrMessage);
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

  } catch (err) {
    console.error("🚨 Error handling rescheduling request modal submission:", err);
    const message = err instanceof Error ? err.message : String(err);

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
        text: `❌ Error generating message: ${message || 'Unknown error'}. Please try again.`
      });
    } catch (ackErr) {
      console.error("Error acknowledging with error:", ackErr);
    }
  }
}

async function handleSessionConfirmationSubmit({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {

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
    const resolved = await resolveStudyFromName(study_name);
    if (!resolved) throw new Error(`Study "${study_name}" not found`);
    const study = resolved.study;
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
    const renderedYaml = await processYamlTemplate(file.content, data, study.path ?? '');

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
    } catch (updateErr) {
      // If update fails (e.g., hash mismatch), try to get the current view and update again
      const updateErrMessage = updateErr instanceof Error ? updateErr.message : String(updateErr);
      console.warn("First update attempt failed, trying without hash:", updateErrMessage);
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

  } catch (err) {
    console.error("🚨 Error handling session confirmation modal submission:", err);
    const message = err instanceof Error ? err.message : String(err);

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
        text: `❌ Error generating message: ${message || 'Unknown error'}. Please try again.`
      });
    } catch (ackErr) {
      console.error("Error acknowledging with error:", ackErr);
    }
  }
}

async function handleThankYouSubmit({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {

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
    const resolved = await resolveStudyFromName(study_name);
    if (!resolved) throw new Error(`Study "${study_name}" not found`);
    const study = resolved.study;
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
    const renderedYaml = await processYamlTemplate(file.content, data, study.path ?? '');

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
    } catch (updateErr) {
      // If update fails (e.g., hash mismatch), try to get the current view and update again
      const updateErrMessage = updateErr instanceof Error ? updateErr.message : String(updateErr);
      console.warn("First update attempt failed, trying without hash:", updateErrMessage);
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

  } catch (err) {
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
    } catch (updateErr) {
      console.error("Failed to update modal with error message:", updateErr);
    }
  }
}

async function handleFollowUpSubmit({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {

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
    const resolved = await resolveStudyFromName(study_name);
    if (!resolved) throw new Error(`Study "${study_name}" not found`);
    const study = resolved.study;
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
    const renderedYaml = await processYamlTemplate(file.content, data, study.path ?? '');

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
    } catch (updateErr) {
      // If update fails (e.g., hash mismatch), try to get the current view and update again
      const updateErrMessage = updateErr instanceof Error ? updateErr.message : String(updateErr);
      console.warn("First update attempt failed, trying without hash:", updateErrMessage);
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

  } catch (err) {
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
    } catch (updateErr) {
      console.error("Failed to update modal with error message:", updateErr);
    }
  }
}

async function handleSessionReminderSubmit({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {

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
    const resolved = await resolveStudyFromName(study_name);
    if (!resolved) throw new Error(`Study "${study_name}" not found`);
    const study = resolved.study;
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
    const renderedYaml = await processYamlTemplate(file.content, data, study.path ?? '');

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
    } catch (updateErr) {
      // If update fails (e.g., hash mismatch), try to get the current view and update again
      const updateErrMessage = updateErr instanceof Error ? updateErr.message : String(updateErr);
      console.warn("First update attempt failed, trying without hash:", updateErrMessage);
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

  } catch (err) {
    console.error("🚨 Error handling session reminder modal submission:", err);
    const message = err instanceof Error ? err.message : String(err);

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
        text: `❌ Error generating message: ${message || 'Unknown error'}. Please try again.`
      });
    } catch (ackErr) {
      console.error("Error acknowledging with error:", ackErr);
    }
  }
}

async function handleAddParticipantSubmit({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  await ack();

  try {
    const state = view.state.values as any;
    const meta = JSON.parse(body.view.private_metadata || '{}');
    const { channelId, userId } = meta;

    // Extract study from dropdown selection (action_id: add_participant_study_select)
    const selectedStudyOption = state.study_select_block?.add_participant_study_select?.selected_option || null;
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
    // Resolve display name for data storage, but keep userId for DM channel
    let added_by_display = userId;
    try {
      const userInfo = await client.users.info({ user: userId });
      added_by_display = userInfo.user?.profile?.display_name || userInfo.user?.real_name || userId;
    } catch {
      // Fall through with userId if API fails
    }

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
      added_by: added_by_display
    }

    const resolved = await resolveStudyFromName(study_name);
    if (!resolved) throw new Error(`Study "${study_name}" not found`);
    const study = resolved.study;

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
      study_path: study.path ?? ''
    }
    const savedParticipant = await studyParticipantService.createParticipant(participantData, fileData as any);

    // Check if this participant brings the total to 5 and send milestone message
    const milestoneCheck = await studyParticipantService.checkStudyMilestone(study.id, 5);
    const githubUrl = `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/tree/main/${study.path}/03-fieldwork/${study.name}_participant_tracker.md`;
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
      // Observer recruitment CTA posts to channel intentionally (recruiting observers)
      await client.chat.postMessage({
        channel: channelId,
        ...milestoneMessage
      });
    }

    // Send message to the researcher's DM with the GitHub link to the participant tracker
    const assignedCode = savedParticipant.participant_code;
    await client.chat.postMessage({
      channel: userId, // Use original Slack user ID for DM channel
      text: `:busts_in_silhouette: *New Participant Added*\n\n*Code:* ${assignedCode}\n*Name:* ${participant_name}\n*Study:* ${study_name}\n*Status:* ${status_select}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:busts_in_silhouette: *New Participant Added*\n\n*Code:* \`${assignedCode}\`\n*Name:* ${participant_name}\n*Study:* ${study_name}\n*Status:* ${status_select}\n*Recruitment Source:* ${recruitment_source}`
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
              text: `Added by <@${userId}> • ${current_date}`
            }
          ]
        }
      ]
    });

    // Refresh fieldwork dashboard if this modal was opened from it
    if (meta.rootViewId) {
      await refreshDashboardAfterAction(client, meta.rootViewId, study.id, userId, channelId, study_name);
    }

  } catch (error) {
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
async function handleObserverModalButton({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> {
  try {
    await ack();

    const action = body.actions[0] as ButtonAction;
    const { studyId, studyName } = JSON.parse(action.value!);
    const channelId = body.channel?.id || body.user.id;

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
      trigger_id: body.trigger_id,
      view: {
        ...observeView,
        private_metadata: JSON.stringify({
          channelId,
          userId: body.user.id,
          studyId,
          studyName,
        }),
      } as View,
    });

  } catch (error) {
    console.error("Error handling observer modal button:", error);
    await client.chat.postEphemeral({
      channel: body.channel?.id || body.user.id,
      user: body.user.id,
      text: "Sorry, there was an error opening the observer modal. Please try again.",
    });
  }
}

export {
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
