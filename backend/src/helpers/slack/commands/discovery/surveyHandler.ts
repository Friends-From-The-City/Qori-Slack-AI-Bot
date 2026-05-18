/**
 * surveyHandler.ts — Survey data upload modal opener + submission
 *
 * Extracted from events.js. Handles the upload_survey_data action (opens
 * modal with study picker) and the upload_survey_data_modal submission
 * (processes uploaded files, runs YAML template).
 */

import type { BlockActionContext, ViewSubmissionContext } from '../../../../types/handlers';
import type { View } from '@slack/types';

import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } from '../../../github';
import { getResearchStudyWithRoles, getStudiesByUser } from '../../../../services/research_study.service';
import { processYamlTemplate } from '../../../yamlProcessor';
import { sendStudyResultMessage, generateStudyResultBlocks } from '../../ui/studyResultBlocks';
import { uploadSurveyDataModal } from '../../ui/uploadSurveyDataModal';
import { processSlackFiles } from '../../../pdfProcessor';
import { parseDocuments, validateDocuments } from '../../../documentParser';

// ─── Block Kit manipulation type ──────────────────────────────────

/** Loose but documented shape for dynamically manipulated modal blocks. */
interface MutableBlock {
  type: string;
  block_id?: string;
  element?: { options?: unknown[]; initial_option?: unknown; [key: string]: unknown };
  elements?: Array<{ options?: unknown[]; initial_option?: unknown; [key: string]: unknown }>;
  [key: string]: unknown;
}

// ─── Template input contract ──────────────────────────────────────

interface SurveyTemplateInput {
  selected_study: string;
  survey_name: string;
  question_focus: string;
  combined_file_content: string;
  survey_files: Array<{ id: string; name: string; mimetype: string; url: string }>;
}

// ─── Modal opener: upload_survey_data ────────────────────────────

async function openUploadSurveyDataModal({ ack, body, client }: BlockActionContext) {
  await ack();

  if (!('view' in body) || !body.view) {
    console.warn('Upload survey data opener received non-modal action context');
    return;
  }

  try {
    const meta = JSON.parse(body.view.private_metadata || '{}');
    const selectedFromView = body.view.state?.values?.study_selection?.study_select?.selected_option || null;
    let studyName: string = selectedFromView?.text?.text || meta.studyName || meta.selectedStudy || meta.study_name || '';
    const studyId: string | null = selectedFromView?.value || meta.studyId || null;

    // Validate that study is selected
    if (!studyName || studyId === 'loading' || studyId === 'no_studies') {
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: '❌ Please select a study before uploading survey data.',
      });
      return;
    }

    // Fetch studies for the user to populate dropdown
    const studies = await getStudiesByUser(body.user.id);
    const studyOptions = studies.map((study: any) => ({
      text: { type: 'plain_text', text: study.name },
      value: String(study.id),
    }));

    // Update modal with study options and auto-populate
    const modalBlocks: MutableBlock[] = [...uploadSurveyDataModal.blocks];
    const studyBlockIndex = modalBlocks.findIndex(b => b.block_id === 'study_select_block');

    if (studyBlockIndex !== -1 && studyOptions.length > 0 && modalBlocks[studyBlockIndex].elements) {
      modalBlocks[studyBlockIndex] = {
        ...modalBlocks[studyBlockIndex],
        elements: [
          {
            ...modalBlocks[studyBlockIndex].elements![0],
            options: studyOptions,
            initial_option: studyName
              ? studyOptions.find((o: any) => o.text.text === studyName) || studyOptions[0]
              : studyOptions[0],
          },
        ],
      };
    }

    await client.views.push({
      trigger_id: body.trigger_id,
      view: {
        ...uploadSurveyDataModal,
        blocks: modalBlocks,
        private_metadata: JSON.stringify({ ...(meta || {}), studyName, studyId, channelId: meta.channelId }),
      } as View,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = (err as Record<string, unknown>)?.data ?? message;
    console.error('Error opening upload survey data modal:', detail);
  }
}

// ─── Submission handler: upload_survey_data_modal ────────────────

async function handleSurveyDataSubmission({ ack, body, view, client }: ViewSubmissionContext) {
  await ack();

  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  let { channelId, studyName, studyId } = meta;

  // Get selected study from the dropdown if not in metadata
  const selectedStudy = values.study_select_block?.selected_study?.selected_option;
  if (selectedStudy) {
    studyName = selectedStudy.text.text || studyName;
    studyId = selectedStudy.value || studyId;
  }

  // Validate required fields
  if (!studyName) {
    await client.chat.postMessage({
      channel: channelId || body.user?.id,
      text: '❌ Study name is required. Please select a study and try again.',
    });
    return;
  }

  if (!channelId) {
    await client.chat.postMessage({
      channel: body.user?.id || '',
      text: '❌ Channel ID is required but could not be determined. Please try again.',
    });
    return;
  }

  // Extract form data
  const surveyName = values.survey_name_block?.survey_name?.value?.trim() || null;
  const questionFocus = values.question_focus_block?.question_focus?.value?.trim() || null;
  const uploadedFiles = values.file_upload_block?.file_upload?.files?.map((file: any) => ({
    id: file.id,
    name: file.name,
    mimetype: file.mimetype,
    url: file.url_private,
  })) || [];

  // Validate required fields
  if (!surveyName) {
    await client.chat.postMessage({
      channel: channelId,
      text: '❌ Survey name is required. Please provide a survey name and try again.',
    });
    return;
  }

  // Validate files
  if (uploadedFiles.length === 0) {
    await client.chat.postMessage({
      channel: channelId,
      text: '❌ Please upload at least one survey file.',
    });
    return;
  }

  try {
    // Process uploaded files to extract content
    const processedFiles = await processSlackFiles(uploadedFiles, process.env.SLACK_BOT_TOKEN!);

    // Prepare documents array
    const documents = processedFiles.map((file: any) => ({
      name: file.name,
      content: file.content,
      type: file.type,
      size: file.size,
    }));

    // Validate documents
    const validation = validateDocuments(documents);
    if (!validation.isValid) {
      await client.chat.postMessage({
        channel: channelId,
        text: `❌ ${validation.message}`,
      });
      return;
    }

    // Parse documents into structured format
    const parsedDocuments = parseDocuments(documents);
    const formattedDocumentContent: string = parsedDocuments.structured_format;

    const surveyData: SurveyTemplateInput = {
      selected_study: studyName,
      survey_name: surveyName,
      question_focus: questionFocus || '',
      combined_file_content: formattedDocumentContent,
      survey_files: uploadedFiles,
    };

    // Get the study
    const study = await getResearchStudyWithRoles(studyName);

    if (!study) {
      await client.chat.postMessage({
        channel: channelId,
        text: `❌ Study "${studyName}" not found. Please verify the study name and try again.`,
      });
      return;
    }

    // Fetch and process the YAML template for survey data
    const file = await fetchFileFromRepo(
      getConfigRepo(),
      YAML_TEMPLATE_PATH,
      'survey_synthesis.yaml',
    );

    const renderedYaml = await processYamlTemplate(
      file.content,
      surveyData,
      // @ts-expect-error — pre-existing type mismatch from require() → import migration
      study.path,
    );

    const url: string = renderedYaml.result.url;

    // Generate and send result message
    const blocks = generateStudyResultBlocks(studyName, study, url, channelId, 'survey_data');
    await sendStudyResultMessage(client, channelId, studyName, blocks, 'survey_data');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error processing survey data:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ There was an error processing your survey data: ${message}\n\nPlease try again or contact support.`,
    });
  }
}

export { openUploadSurveyDataModal, handleSurveyDataSubmission };
