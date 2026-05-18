/**
 * stakeholderHandler.ts — Stakeholder interview guide + notes upload
 *
 * Extracted from events.js. Contains four handlers:
 * - create_stakeholder_guide: opens modal with study picker + cascade readiness
 * - create_stakeholder_interview_guide: opens interview guide modal (simpler variant)
 * - upload_stakeholder_notes: opens notes upload modal
 * - upload_stakeholder_notes_modal: processes files, runs YAML template
 */

import type { BlockActionContext, ViewSubmissionContext } from '../../../../types/handlers';
import type { View } from '@slack/types';

import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } from '../../../github';
import { getResearchStudyWithRoles, getStudiesByUser } from '../../../../services/research_study.service';
import { processYamlTemplate } from '../../../yamlProcessor';
import { addStudyStatus } from '../../../../services/study-status.service';
import { sendStudyResultMessage, generateStudyResultBlocks } from '../../ui/studyResultBlocks';
import { readStudyVariables } from '../../../studyVariables';
import { buildCascadeReadiness, buildCascadeBlocks } from '../../ui/cascadeReadinessBlocks';
import { stakeholderInterviewGuideModal } from '../../ui/stakeholderInterviewGuideModal';
import { uploadStakeholderNotesModal } from '../../ui/uploadStakeholderNotesModal';
import { processSlackFiles } from '../../../pdfProcessor';
import { parseDocuments, validateDocuments } from '../../../documentParser';

// ─── Block Kit manipulation type ──────────────────────────────────

/** Loose but documented shape for dynamically manipulated modal blocks. */
interface MutableBlock {
  type: string;
  block_id?: string;
  element?: { initial_value?: string; options?: unknown[]; initial_option?: unknown; [key: string]: unknown };
  elements?: Array<{ options?: unknown[]; initial_option?: unknown; [key: string]: unknown }>;
  [key: string]: unknown;
}

// ─── Template input contract ──────────────────────────────────────

interface StakeholderGuideTemplateInput {
  selected_study: string;
  stakeholder_role: string;
  stakeholder_team: string;
  interview_focus: string;
  known_constraints: string;
  research_questions: string;
  user_findings: string;
  session_duration: string;
  stakeholder_name: string;
  study_name: string;
}

interface StakeholderNotesTemplateInput {
  selected_study: string;
  study_name: string;
  combined_file_content: string;
}

// ─── Modal opener: create_stakeholder_guide ──────────────────────

async function openStakeholderGuideModal({ ack, body, client }: BlockActionContext) {
  await ack();

  if (!('view' in body) || !body.view) {
    console.warn('Stakeholder guide opener received non-modal action context');
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
        text: '❌ Please select a study before creating a stakeholder guide.',
      });
      return;
    }

    // Fallback: default to the user's first study if metadata missing
    if (!studyName) {
      try {
        const studies = await getStudiesByUser(body.user.id);
        if (Array.isArray(studies) && studies.length > 0) {
          studyName = studies[0].name;
        }
      } catch (e) {
        const eMessage = e instanceof Error ? e.message : String(e);
        console.warn('⚠️ Could not infer studyName for stakeholder guide:', eMessage);
      }
    }

    // Clone modal blocks and auto-populate study
    const modalBlocks: MutableBlock[] = [...stakeholderInterviewGuideModal.blocks];
    const studyBlockIndex = modalBlocks.findIndex(b => b.block_id === 'study_select_block');

    if (studyBlockIndex !== -1 && studyName && modalBlocks[studyBlockIndex].element) {
      modalBlocks[studyBlockIndex] = {
        ...modalBlocks[studyBlockIndex],
        element: {
          ...modalBlocks[studyBlockIndex].element!,
          initial_value: studyName,
        },
      };
    }

    // Cascade readiness — inject upstream variable status
    try {
      const studyForCascade = await getResearchStudyWithRoles(studyName);
      if (studyForCascade?.path) {
        const studyVars = await readStudyVariables(decodeURIComponent(studyForCascade.path));
        if (Object.keys(studyVars.variables).length > 0) {
          const cascadeData = buildCascadeReadiness(studyVars, 'stakeholder_interview_guide');
          const cascadeBlocks = buildCascadeBlocks(cascadeData);
          const firstDivider = modalBlocks.findIndex(b => b.type === 'divider');
          if (firstDivider !== -1) {
            // @ts-expect-error — pre-existing type mismatch from require() → import migration
            modalBlocks.splice(firstDivider, 0, ...cascadeBlocks);
          }
        }
      }
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      console.warn('⚠️ Cascade readiness failed for stakeholder guide:', errMessage);
    }

    await client.views.push({
      trigger_id: body.trigger_id,
      view: {
        ...stakeholderInterviewGuideModal,
        blocks: modalBlocks,
        private_metadata: JSON.stringify({ ...(meta || {}), studyName, studyId, channelId: meta.channelId }),
      } as View,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = (err as Record<string, unknown>)?.data ?? message;
    console.error('Error opening stakeholder guide modal:', detail);
  }
}

// ─── Modal opener: create_stakeholder_interview_guide ────────────

async function openStakeholderInterviewGuideModal({ ack, body, client }: BlockActionContext) {
  await ack();

  if (!('view' in body) || !body.view) {
    console.warn('Stakeholder interview guide opener received non-modal action context');
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
        text: '❌ Please select a study before creating a stakeholder interview guide.',
      });
      return;
    }

    // Fallback: default to the user's first study if metadata missing
    if (!studyName) {
      try {
        const studies = await getStudiesByUser(body.user.id);
        if (Array.isArray(studies) && studies.length > 0) {
          studyName = studies[0].name;
        }
      } catch (e) {
        const eMessage = e instanceof Error ? e.message : String(e);
        console.warn('⚠️ Could not infer studyName for stakeholder interview guide:', eMessage);
      }
    }

    // Clone modal blocks and auto-populate study
    const modalBlocks: MutableBlock[] = [...stakeholderInterviewGuideModal.blocks];
    const studyBlockIndex = modalBlocks.findIndex(b => b.block_id === 'study_select_block');

    if (studyBlockIndex !== -1 && studyName && modalBlocks[studyBlockIndex].element) {
      modalBlocks[studyBlockIndex] = {
        ...modalBlocks[studyBlockIndex],
        element: {
          ...modalBlocks[studyBlockIndex].element!,
          initial_value: studyName,
        },
      };
    }

    await client.views.push({
      trigger_id: body.trigger_id,
      view: {
        ...stakeholderInterviewGuideModal,
        blocks: modalBlocks,
        private_metadata: JSON.stringify({ ...(meta || {}), studyName, studyId, channelId: meta.channelId }),
      } as View,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = (err as Record<string, unknown>)?.data ?? message;
    console.error('Error opening stakeholder interview guide modal:', detail);
  }
}

// ─── Submission handler: stakeholder_interview_guide_modal ───────

async function handleStakeholderGuideSubmission({ ack, body, view, client }: ViewSubmissionContext) {
  // Close the modal immediately to prevent going back to previous modal
  await ack({
    response_action: 'clear',
  } as any);

  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  let { channelId, studyName } = meta;

  // Get study name from study_select_block if available
  const studyInput = values.study_select_block?.selected_study?.value;
  if (studyInput) {
    studyName = studyInput || studyName;
  }

  // Fallback: get studyName from metadata if not present
  if (!studyName) {
    try {
      const userId = body.user?.id;
      const studies = await getStudiesByUser(userId);
      if (Array.isArray(studies) && studies.length > 0) {
        studyName = studies[0].name;
      }
    } catch (e) {
      const eMessage = e instanceof Error ? e.message : String(e);
      console.warn('⚠️ Could not infer studyName on submission:', eMessage);
    }
  }

  // Extract all form values
  const stakeholderRole = values.stakeholder_role_block?.stakeholder_role?.selected_option?.value || null;
  const stakeholderRoleText = values.stakeholder_role_block?.stakeholder_role?.selected_option?.text?.text || null;
  const stakeholderTeam = values.stakeholder_team_block?.stakeholder_team?.value || null;
  const sessionDuration = values.session_duration_block?.session_duration?.selected_option?.value || null;
  const sessionDurationText = values.session_duration_block?.session_duration?.selected_option?.text?.text || null;
  const stakeholderName = values.stakeholder_name_block?.stakeholder_name?.value || null;
  const focusAreas = values.interview_focus_block?.interview_focus?.selected_options?.map((opt: any) => opt.value) || [];
  const focusAreasText = values.interview_focus_block?.interview_focus?.selected_options?.map((opt: any) => opt.text?.text) || [];
  const researchQuestions = values.research_questions_block?.research_questions?.value || null;
  const userFindings = values.user_findings_block?.user_findings?.value || null;

  try {
    // Map form fields to YAML input variables
    const interviewFocus = focusAreasText.join(', ') || focusAreas.join(', ') || '';

    // Extract known_constraints if "constraints" is in focus areas
    const knownConstraints = focusAreas.includes('constraints')
      ? 'User selected constraints as a focus area. Ask about technical, policy, and resource constraints.'
      : '';

    const templateData: StakeholderGuideTemplateInput = {
      selected_study: studyName,
      stakeholder_role: stakeholderRoleText || stakeholderRole || '',
      stakeholder_team: stakeholderTeam || '',
      interview_focus: interviewFocus,
      known_constraints: knownConstraints,
      research_questions: researchQuestions || userFindings || '',
      user_findings: userFindings || '',
      session_duration: sessionDurationText || sessionDuration || '',
      stakeholder_name: stakeholderName || '',
      study_name: studyName,
    };

    console.log(`📝 Template Data: ${Object.keys(templateData).length} fields, study: ${templateData.study_name || 'unknown'}`);

    // Fetch and process YAML template
    const study = await getResearchStudyWithRoles(studyName);
    const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, 'stakeholder_interview_guide.yaml');

    const renderedYaml = await processYamlTemplate(file.content, templateData, study!.path ?? '');
    const url: string = renderedYaml.result.url;

    console.log('✅ Stakeholder Interview Guide created:', url);

    // Send result message to Slack
    const blocks = generateStudyResultBlocks(studyName, study as any, url, channelId, 'stakeholder_guide');
    await sendStudyResultMessage(client, channelId, studyName, blocks, 'stakeholder_guide');

    // Add study status for created file
    const stakeholderFileName = url.split('/').pop() || 'stakeholder_interview_guide.md';
    await addStudyStatus({
      study_name: studyName,
      path: url,
      file_name: stakeholderFileName,
      status: 'created',
      created_by: body.user?.id || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ Error processing stakeholder interview guide:', error);

    try {
      await client.chat.postMessage({
        channel: channelId || body.user.id,
        text: `❌ Failed to create stakeholder interview guide: ${message}`,
      });
    } catch (msgError) {
      console.error('Error sending error message:', msgError);
    }
  }
}

// ─── Modal opener: upload_stakeholder_notes ──────────────────────

async function openUploadStakeholderNotesModal({ ack, body, client }: BlockActionContext) {
  await ack();

  if (!('view' in body) || !body.view) {
    console.warn('Upload stakeholder notes opener received non-modal action context');
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
        text: '❌ Please select a study before uploading stakeholder notes.',
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
    const modalBlocks: MutableBlock[] = [...uploadStakeholderNotesModal.blocks];
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
        ...uploadStakeholderNotesModal,
        blocks: modalBlocks,
        private_metadata: JSON.stringify({ ...(meta || {}), studyName, studyId, channelId: meta.channelId }),
      } as View,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = (err as Record<string, unknown>)?.data ?? message;
    console.error('Error opening upload stakeholder notes modal:', detail);
  }
}

// ─── Submission handler: upload_stakeholder_notes_modal ──────────

async function handleStakeholderNotesSubmission({ ack, body, view, client }: ViewSubmissionContext) {
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

  console.log('🚀 ~ upload-stakeholder-notes submission studyName:', studyName);

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
  const uploadedFiles = values.file_upload_block?.file_upload?.files?.map((file: any) => ({
    id: file.id,
    name: file.name,
    mimetype: file.mimetype,
    url: file.url_private,
  })) || [];

  console.log(`🚀 ~ stakeholder notes: study=${studyName}, files=${uploadedFiles.length}`);

  // Validate files
  if (uploadedFiles.length === 0) {
    await client.chat.postMessage({
      channel: channelId,
      text: '❌ Please upload at least one transcript or notes file.',
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

    const stakeholderNotesData: StakeholderNotesTemplateInput = {
      selected_study: studyName,
      study_name: studyName,
      combined_file_content: formattedDocumentContent,
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

    // Fetch and process the YAML template for stakeholder notes
    const file = await fetchFileFromRepo(
      getConfigRepo(),
      YAML_TEMPLATE_PATH,
      'stakeholder_synthesis.yaml',
    );

    const renderedYaml = await processYamlTemplate(
      file.content,
      stakeholderNotesData,
      // @ts-expect-error — pre-existing type mismatch from require() → import migration
      study.path,
    );

    const url: string = renderedYaml.result.url;

    // Register in research_status so synthesis modal can discover this file
    const stakeholderSynthesisFileName = url.split('/').pop() || 'stakeholder_synthesis.md';
    await addStudyStatus({
      study_name: studyName,
      path: url,
      file_name: stakeholderSynthesisFileName,
      status: 'created',
      created_by: body.user?.id || null,
    });

    // Generate and send result message
    const blocks = generateStudyResultBlocks(studyName, study as any, url, channelId, 'stakeholder_notes');
    await sendStudyResultMessage(client, channelId, studyName, blocks, 'stakeholder_notes');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error processing stakeholder notes:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ There was an error processing your stakeholder notes: ${message}\n\nPlease try again or contact support.`,
    });
  }
}

export {
  openStakeholderGuideModal,
  openStakeholderInterviewGuideModal,
  handleStakeholderGuideSubmission,
  openUploadStakeholderNotesModal,
  handleStakeholderNotesSubmission,
};
