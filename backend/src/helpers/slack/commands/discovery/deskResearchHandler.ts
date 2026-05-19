/**
 * deskResearchHandler.ts — Desk research upload modal opener + submission
 *
 * DATA ASSEMBLY POINT for the desk research template (ADR 0005/0016 pattern).
 * The handler extracts modal fields, processes uploaded files, builds
 * mechanical document inventory data, and passes the complete data to
 * yamlProcessor for AI analysis tasks + rendering.
 *
 * This is a CASCADE-EMITTING handler: it produces discovered_barriers,
 * discovered_metrics, discovered_journeys, methodology_recommendations,
 * knowledge_gaps, and source_artifacts.
 */

import type { AllMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';
import type { View } from '@slack/types';

import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } from '../../../github';
import { getResearchStudyWithRoles, getStudiesByUser } from '../../../../services/research_study.service';
import { processYamlTemplate } from '../../../yamlProcessor';
import { sendStudyResultMessage, generateStudyResultBlocks } from '../../ui/studyResultBlocks';
import { processSlackFiles } from '../../../pdfProcessor';
import { parseDocuments, validateDocuments } from '../../../documentParser';
import { uploadDeskResearchModal } from '../../ui/uploadDeskResearchModal';

// ─── Block Kit manipulation type ──────────────────────────────────

interface MutableBlock {
  type: string;
  block_id?: string;
  element?: { options?: unknown[]; initial_option?: unknown; [key: string]: unknown };
  [key: string]: unknown;
}

// ─── Template input contract ──────────────────────────────────────

/** Data shape passed to the desk_research YAML template. Co-located with handler. */
interface DeskResearchTemplateInput {
  selected_study: string;
  topic: string;
  effective_topic: string;
  topic_slug: string;
  research_topic: string;
  description: string;
  document_content: string;
  // Mechanical data from file processing (handler-assembled, not LLM-generated)
  document_count: number;
  document_names: string[];
  document_types: string[];
}

// ─── Modal opener ─────────────────────────────────────────────────

async function openDeskResearchModal({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs) {
  await ack();

  if (!('view' in body) || !body.view) {
    console.warn('Desk research opener received non-modal action context');
    return;
  }

  try {
    const meta = JSON.parse(body.view.private_metadata || '{}');
    const selectedFromView = body.view.state?.values?.study_selection?.study_select?.selected_option || null;
    let studyName: string = selectedFromView?.text?.text || meta.studyName || meta.selectedStudy || meta.study_name || '';
    let studyId: string | null = selectedFromView?.value || meta.studyId || null;

    if (!studyName || studyId === 'loading' || studyId === 'no_studies') {
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: '❌ Please select a study before uploading desk research.',
      });
      return;
    }

    if (!studyName) {
      try {
        const studies = await getStudiesByUser(body.user.id);
        if (Array.isArray(studies) && studies.length > 0) {
          studyName = studies[0].name;
          studyId = String(studies[0].id);
        }
      } catch (e) {
        const eMessage = e instanceof Error ? e.message : String(e);
        console.warn('⚠️ Could not infer studyName for upload desk research:', eMessage);
      }
    }

    const studies = await getStudiesByUser(body.user.id);
    const studyOptions = studies.map((study: any) => ({
      text: { type: 'plain_text', text: study.name },
      value: String(study.id),
    }));

    const modalBlocks: MutableBlock[] = [...uploadDeskResearchModal.blocks];
    const studyBlockIndex = modalBlocks.findIndex(b => b.block_id === 'study_select_block');

    if (studyBlockIndex !== -1 && studyOptions.length > 0 && modalBlocks[studyBlockIndex].element) {
      modalBlocks[studyBlockIndex] = {
        ...modalBlocks[studyBlockIndex],
        element: {
          ...modalBlocks[studyBlockIndex].element!,
          options: studyOptions,
          initial_option: studyName
            ? studyOptions.find((o: any) => o.text.text === studyName) || studyOptions[0]
            : studyOptions[0],
        },
      };
    }

    await client.views.push({
      trigger_id: body.trigger_id,
      view: {
        ...uploadDeskResearchModal,
        blocks: modalBlocks,
        private_metadata: JSON.stringify({ ...(meta || {}), studyName, studyId, channelId: meta.channelId }),
      } as View,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = (err as Record<string, unknown>)?.data ?? message;
    console.error('Error opening upload desk research modal:', detail);
  }
}

// ─── Submission handler ───────────────────────────────────────────

async function handleDeskResearchSubmission({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs) {
  await ack();

  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  let { channelId, studyName } = meta;

  const selectedStudy = values.study_select_block?.selected_study?.selected_option;
  if (selectedStudy) {
    studyName = selectedStudy.text.text;
  }

  if (!studyName) {
    await client.chat.postMessage({
      channel: channelId || body.user?.id,
      text: '❌ Study name is required but could not be determined. Please ensure you have a study selected or create one with `/qori-start`.',
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

  // ── Extract modal fields (previously ignored — Bug 1 from delta) ──
  const description = (values.description_block?.description?.value || '').trim() || studyName;
  const researchTopic = (values.research_focus_block?.research_topic?.value || '').trim() || studyName;
  const topic = researchTopic;

  const uploadedFiles = values.file_upload_block?.file_upload?.files?.map((file: any) => ({
    id: file.id,
    name: file.name,
    mimetype: file.mimetype,
    url: file.url_private,
  })) || [];

  try {
    if (uploadedFiles.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: '❌ Please upload at least one file to analyze.',
      });
      return;
    }

    const processedFiles = await processSlackFiles(uploadedFiles, process.env.SLACK_BOT_TOKEN!);

    const documents = processedFiles.map((file: any) => ({
      name: file.name,
      content: file.content,
      type: file.type,
      size: file.size,
    }));

    const validation = validateDocuments(documents);
    if (!validation.isValid) {
      await client.chat.postMessage({
        channel: channelId,
        text: `❌ ${validation.message}`,
      });
      return;
    }

    const parsedDocuments = parseDocuments(documents);
    const formattedDocumentContent: string = parsedDocuments.structured_format;

    // ── Mechanical document inventory (handler-assembled, not LLM) ──
    const documentNames = processedFiles.map((f: any) => f.name as string);
    const documentTypes = processedFiles.map((f: any) => f.type as string);

    // derived_variables in YAML is documentation-only (not processed by yamlProcessor),
    // so the handler must compute these for Handlebars rendering and discovery scoping.
    const effectiveTopic = researchTopic || topic;
    const topicSlug = topic.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

    const deskResearchData: DeskResearchTemplateInput = {
      selected_study: studyName,
      topic,
      effective_topic: effectiveTopic,
      topic_slug: topicSlug,
      research_topic: researchTopic,
      description,
      document_content: formattedDocumentContent,
      document_count: processedFiles.length,
      document_names: documentNames,
      document_types: documentTypes,
    };

    console.log(`📚 Assembled desk research data: ${deskResearchData.document_count} documents, topic: "${effectiveTopic}", names: [${documentNames.join(', ')}], study: ${studyName}`);

    const study = await getResearchStudyWithRoles(studyName);

    if (!study) {
      await client.chat.postMessage({
        channel: channelId,
        text: `❌ Study "${studyName}" not found. Please verify the study name and try again.`,
      });
      return;
    }

    const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, 'desk_research.yaml');
    // @ts-expect-error — pre-existing type mismatch from require() → import migration
    const renderedYaml = await processYamlTemplate(file.content, deskResearchData, study.path, 'desk-research');

    const url: string = renderedYaml.result.url;
    const blocks = generateStudyResultBlocks(studyName, study, url, channelId, 'desk');
    await sendStudyResultMessage(client, channelId, studyName, blocks, 'desk');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error processing desk research:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ There was an error processing your desk research: ${message}\n\nPlease try again or contact support.`,
    });
  }
}

export { openDeskResearchModal, handleDeskResearchSubmission };
