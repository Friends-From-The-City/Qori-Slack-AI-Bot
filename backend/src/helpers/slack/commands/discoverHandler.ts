/**
 * discoverHandler.ts — /qori-discover slash command
 *
 * v2.0: Hub-based redesign per docs/qori-discover-redesign-spec.md.
 * - Command opens a sections-with-accessories hub (no input blocks, no submit)
 * - Hub shows existing discovery artifacts + next-step guidance (D1, D2)
 * - Three "Start" buttons open type-specific modals via views.update
 * - Single submission handler reads discoveryType from private_metadata
 *
 * Discovery is pre-study research. Output lands in _discovery/{type}/
 * in the qori-studies repo (not study-scoped).
 */

import type { AllMiddlewareArgs, SlackActionMiddlewareArgs, SlackCommandMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';
import type { View } from '@slack/types';

import { buildSlackApplicationContext } from '../../../middleware/auth/slackContextBridge';
import { executeDiscovery, PrivacyError, type DiscoveryInput, type DiscoveryTypeKey as AppDiscoveryTypeKey } from '../../../application/discovery.app-service';
import { discoverHubModal, DISCOVERY_ARTIFACTS_BLOCK_ID } from '../ui/discoverHubModal';
import { DISCOVER_TYPE_MODALS } from '../ui/discoverTypeModals';
import { loadDiscoveryArtifacts, type DiscoveryArtifact } from '../../discoveryLoader';
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo, createOrUpdateFileOnGitHub, fetchFileFromRepoByPath } from '../../github';
import { format } from 'date-fns';
import { processYamlTemplate } from '../../yamlProcessor';
import { processSlackFiles } from '../../pdfProcessor';
import { parseDocuments, validateDocuments } from '../../documentParser';
import { getProjectByChannelId, getProjectById } from '../../../services/project.service';
import { assertProjectAccess, AuthorizationError } from '../../../services/authorization.service';
import type { VariableContext } from '../../studyVariables';
import { postEphemeralOrDM } from '../slackHelpers';
import { authorizeForModel, scanForPii } from '../../../services/content-governance.service';
import { handleSurveyUploadPhase } from './surveySubmissionHandler';

// ─── Types ──────────────────────────────────────────────────────

type DiscoveryTypeKey = 'desk_research' | 'stakeholder_synthesis' | 'survey_synthesis';

interface DiscoveryTypeConfig {
  yaml: string;
  type: string;      // Postgres discovery_type identifier (matches discoveryLoader.ts)
  fileSlug: string;  // Filename component: {topic}-{fileSlug}-{date}.md
  label: string;
  filetypes: string[];
}

interface ProcessedFile {
  name: string;
  content: string;
  type: string;
  size: number;
}

interface DocumentInfo {
  name: string;
  content: string;
  type: string;
  size: number;
  [key: string]: unknown;
}

interface ValidationResult {
  isValid: boolean;
  message: string;
}

interface ParsedDocuments {
  structured_format: string;
}

interface UploadedFile {
  id: string;
  name: string;
  mimetype: string;
  url: string;
  url_private?: string;
  [key: string]: unknown;
}

/** Data shape passed to discovery YAML templates. */
interface DiscoveryTemplateInput {
  topic: string;
  effective_topic: string;
  topic_slug: string;
  project_slug: string;
  project_problem_statement: string | null;
  source_intent: string | null;
  description: string;
  document_content: string;
  combined_file_content: string;
  _discovery_type: string;
  selected_study: string;
  study_name: string;
  document_count: number;
  document_names: string[];
  document_types: string[];
  survey_name?: string;
  question_focus?: string;
  survey_files?: UploadedFile[];
  study_channel?: string;
  researcher_contact?: string;
  detected_files?: string;
}

interface DiscoverMeta {
  channelId?: string;
  projectId?: number;
  projectSlug?: string;
  discoveryType?: string;
}

// ─── Constants ──────────────────────────────────────────────────

const DEFAULT_TEAM = 'friends-lab';
function getTeamSlug(): string {
  return process.env.QORI_TEAM_SLUG || DEFAULT_TEAM;
}

const DISCOVERY_TYPES: Record<DiscoveryTypeKey, DiscoveryTypeConfig> = {
  desk_research: {
    yaml: 'desk_research.yaml',
    type: 'desk-research',
    fileSlug: 'desk-research',
    label: 'Desk research',
    filetypes: ['pdf', 'docx', 'doc', 'txt', 'md'],
  },
  stakeholder_synthesis: {
    yaml: 'stakeholder_synthesis.yaml',
    type: 'stakeholder-interviews',
    fileSlug: 'stakeholder-synthesis',
    label: 'Stakeholder synthesis',
    filetypes: ['pdf', 'docx', 'doc', 'txt', 'md'],
  },
  survey_synthesis: {
    yaml: 'survey_synthesis.yaml',
    type: 'survey-synthesis',
    fileSlug: 'survey-synthesis',
    filetypes: ['csv'],
    label: 'Survey synthesis',
  },
};

/** Type-aware next-step guidance for success messages (D2). */
const SUCCESS_GUIDANCE: Record<DiscoveryTypeKey, string> = {
  desk_research: 'Run `/qori-discover` again for stakeholder interviews, or `/qori-brief` to start your study.',
  stakeholder_synthesis: 'Run `/qori-discover` for survey data, or `/qori-brief` to start your study.',
  survey_synthesis: 'Run `/qori-brief` to start your study — all discovery feeds in automatically.',
};

const DISCOVERY_README = `# Discovery Research

Pre-study discovery research that informs briefs and accumulates as organizational memory.

Discovery answers: _What do we already know? What are the open questions? Who are the stakeholders and what do they need?_

## Contents

Discovery artifacts are stored directly in this folder:

- \`desk-research-{topic}-{date}.md\` — Synthesis of background documents and prior research
- \`stakeholder-synthesis-{topic}-{date}.md\` — Synthesis of stakeholder interviews
- \`survey-synthesis-{topic}-{date}.md\` — Synthesis of survey data

Cascade variables are stored in \`.variables/discovery-variables.json\` and feed automatically into downstream briefs and plans.

*Generated by Qori*
`;

// ─── Helpers ────────────────────────────────────────────────────

function slugifyTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function scaffoldDiscoveryFolders(projectSlug: string): Promise<void> {
  const readmePath = `${projectSlug}/00-discovery/README.md`;
  try {
    // @ts-expect-error — pre-existing type mismatch from require() → import migration
    await fetchFileFromRepoByPath(process.env.GITHUB_REPO, readmePath);
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = (error as Record<string, unknown>)?.status;
    if (status === 404 || message?.includes('Not Found') || message?.includes('Could not fetch file')) {
      console.log(`📁 Scaffolding ${projectSlug}/00-discovery/ in qori-studies...`);
      await createOrUpdateFileOnGitHub(readmePath, DISCOVERY_README);
      console.log(`✅ ${readmePath} created`);
    } else {
      console.warn(`⚠️ Could not check ${readmePath}, proceeding anyway:`, message);
    }
  }
}

// ─── D1: Discovery visibility helpers ──────────────────────────

/** Format artifact list for the hub's visibility section. Max 5, trimmed to essentials. */
function buildArtifactDisplayText(artifacts: DiscoveryArtifact[]): string {
  if (artifacts.length === 0) {
    return 'No discovery research yet. Start with desk research to build your team\'s knowledge base.';
  }

  const shown = artifacts.slice(0, 5);
  const lines = shown.map(a => {
    const dateStr = a.date || '';
    return `${a.icon} ${a.slug} · ${a.label}${dateStr ? ` · ${dateStr}` : ''}`;
  });

  if (artifacts.length > 5) {
    lines.push(`...and ${artifacts.length - 5} more. These all feed into /qori-brief automatically.`);
  } else {
    lines.push('These feed into /qori-brief automatically.');
  }

  return lines.join('\n');
}

// ─── Command handler ────────────────────────────────────────────

async function discoverHandler({ ack, body, client, command }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> {
  await ack();

  const channelId = command.channel_id;
  const userId = command.user_id;

  // Phase 2D: Check channel binding for project context
  const project = await getProjectByChannelId(channelId);
  if (!project) {
    await postEphemeralOrDM(
      client,
      channelId,
      userId,
      `This channel isn't linked to a project yet.\n\n*Option 1:* Run \`/qori-start\` to create a new project with a dedicated channel, then run \`/qori-discover\` there.\n*Option 2:* Run \`/qori-discover\` in an existing project channel.`
    );
    return;
  }

  // ── GOV-1: Authorization check ──
  try {
    await assertProjectAccess(userId, project.id, client);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      console.warn(`[AUTH] Discover command denied: user=${userId} project=${project.id}`);
      await postEphemeralOrDM(client, channelId, userId, 'Access denied: you are not a member of this project.');
      return;
    }
    throw err;
  }

  try {
    // Load existing discovery artifacts for this project
    let artifacts: DiscoveryArtifact[] = [];
    try {
      artifacts = await loadDiscoveryArtifacts(project.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Could not load discovery artifacts for hub:', message);
    }

    // Build dynamic hub blocks — loose typing for Block Kit manipulation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks: any[] = [...discoverHubModal.blocks];

    // Inject D1 artifact visibility
    const artifactsIdx = blocks.findIndex(b => b.block_id === DISCOVERY_ARTIFACTS_BLOCK_ID);
    if (artifactsIdx !== -1) {
      blocks[artifactsIdx] = {
        ...blocks[artifactsIdx],
        elements: [
          {
            type: "mrkdwn",
            text: buildArtifactDisplayText(artifacts),
          },
        ],
      };
    }

    // Include project context in metadata
    const meta: DiscoverMeta = {
      channelId,
      projectId: project.id,
      projectSlug: project.slug,
    };

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        ...discoverHubModal,
        blocks,
        private_metadata: JSON.stringify(meta),
      } as View,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = (err as Record<string, unknown>)?.data ?? message;
    console.error('Error opening discover hub:', detail);
    await postEphemeralOrDM(
      client,
      channelId,
      userId,
      '❌ Failed to open the discovery hub. Please try again.'
    );
  }
}

// ─── Action handler: hub → type-specific modal ─────────────────
// GOV-1: UI transition only (hub → type modal). Auth enforced at discoverHandler (entry) and handleDiscoverSubmission (mutation).

async function openDiscoverTypeModal({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> {
  await ack();

  if (!('view' in body) || !body.view) {
    console.warn('Discovery type opener received non-modal action context');
    return;
  }

  try {
    const meta = JSON.parse(body.view.private_metadata || '{}') as DiscoverMeta;

    // Extract discovery type from the action value
    const action = (body as any).actions?.[0];
    const discoveryType: string | undefined = action?.value;

    if (!discoveryType || !DISCOVER_TYPE_MODALS[discoveryType]) {
      console.error('Unknown discovery type from action:', discoveryType);
      return;
    }

    const modal = DISCOVER_TYPE_MODALS[discoveryType];

    await client.views.update({
      view_id: body.view.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Block Kit types don't align with Slack's View type
      view: {
        ...modal,
        private_metadata: JSON.stringify({
          channelId: meta.channelId,
          projectId: meta.projectId,
          projectSlug: meta.projectSlug,
          discoveryType,
        } satisfies DiscoverMeta),
      } as any as View,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = (err as Record<string, unknown>)?.data ?? message;
    console.error('Error opening discovery type modal:', detail);
  }
}

// ─── Submission handler ─────────────────────────────────────────

async function handleDiscoverSubmission({ ack, view, body, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  await ack();

  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}') as DiscoverMeta;
  const { channelId, projectId, projectSlug, discoveryType } = meta;
  const userId: string = body.user?.id || '';

  // Validate project context (Phase 2D)
  if (!projectId || !projectSlug) {
    await client.chat.postMessage({
      channel: userId,
      text: '❌ Project context missing. Please run `/qori-discover` from a project-linked channel.',
    });
    return;
  }

  // ── GOV-1: Re-authorize at submission boundary ──
  try {
    await assertProjectAccess(userId, projectId, client);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      console.warn(`[AUTH] Discover submission denied: user=${userId} project=${projectId}`);
      await client.chat.postMessage({ channel: userId, text: 'Access denied: you are not a member of this project.' });
      return;
    }
    throw err;
  }

  // Read discovery type from private_metadata (set by action handler)
  if (!discoveryType || !DISCOVERY_TYPES[discoveryType as DiscoveryTypeKey]) {
    await client.chat.postMessage({
      channel: userId,
      text: '❌ Discovery type missing. Please try again from /qori-discover.',
    });
    return;
  }

  // Extract form values
  const topic = values.topic_block?.topic?.value?.trim() as string | undefined;
  const description = values.description_block?.description?.value?.trim() || null;
  const surveyName = values.survey_name_block?.survey_name?.value?.trim() || null;
  const questionFocus = values.question_focus_block?.question_focus?.value?.trim() || null;

  const uploadedFiles: UploadedFile[] = values.file_upload_block?.file_upload?.files?.map((file: { id: string; name: string; mimetype: string; url_private: string }) => ({
    id: file.id,
    name: file.name,
    mimetype: file.mimetype,
    url: file.url_private,
  })) || [];

  // Validate required fields
  if (!topic) {
    await client.chat.postMessage({
      channel: userId,
      text: '❌ Topic is required for discovery research.',
    });
    return;
  }

  if (!slugifyTopic(topic)) {
    await client.chat.postMessage({
      channel: userId,
      text: '❌ Topic must contain alphanumeric characters.',
    });
    return;
  }

  if (uploadedFiles.length === 0) {
    await client.chat.postMessage({
      channel: userId,
      text: '❌ Please upload at least one file to analyze.',
    });
    return;
  }

  const typeConfig = DISCOVERY_TYPES[discoveryType as DiscoveryTypeKey];
  let topicSlug = slugifyTopic(topic);

  // Survey path forks to structured ingestion handler (Survey Slice 1)
  if (discoveryType === 'survey_synthesis') {
    await handleSurveyUploadPhase(
      {
        userId,
        projectId: projectId!,
        projectSlug: projectSlug!,
        channelId: channelId || userId,
        topic: topic!,
        topicSlug,
        surveyName: surveyName || topic!,
        questionFocus: questionFocus || '',
        sourceIntent: description || topic!,
        uploadedFiles: uploadedFiles.map(f => ({
          id: f.id,
          name: f.name,
          mimetype: f.mimetype,
          url: f.url,
        })),
      },
      client,
    );
    return;
  }

  // Process Slack files before branching (Slack-specific: needs SLACK_BOT_TOKEN)
  const processedFiles: ProcessedFile[] = await processSlackFiles(uploadedFiles, process.env.SLACK_BOT_TOKEN!);
  const documents: DocumentInfo[] = processedFiles.map((file: ProcessedFile) => ({
    name: file.name,
    content: file.content,
    type: file.type,
    size: file.size,
  }));

  // ── PLAT-3: Try application service path ──
  const displayName = body.user?.name || body.user?.id || userId;
  const ctx = await buildSlackApplicationContext(userId, (body as any).team?.id || '', displayName);

  if (ctx) {
    // New path: delegate to application service
    console.log(`[PLAT-3] Discovery: using application service path for user=${userId}`);

    await client.chat.postMessage({
      channel: userId,
      text: `Running ${typeConfig.label} for "${topic}"... This may take a minute.`,
    });

    try {
      const input: DiscoveryInput = {
        projectId: projectId!,
        projectSlug: projectSlug!,
        discoveryType: discoveryType as AppDiscoveryTypeKey,
        topic: topic!,
        description,
        documents,
        createdByActorId: ctx.actor.publicId,
        surveyName: surveyName || undefined,
        questionFocus: questionFocus || undefined,
      };

      const result = await executeDiscovery(ctx, input);

      // Type-aware next-step guidance (D2)
      const nextStep = SUCCESS_GUIDANCE[discoveryType as DiscoveryTypeKey]
        || 'Run `/qori-brief` to start your study.';

      await client.chat.postMessage({
        channel: userId,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *${result.typeLabel} complete*\n\n*Topic:* ${topic}\n*Type:* ${result.typeLabel}`,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'View on GitHub' },
                style: 'primary',
                url: result.url,
                action_id: 'view_discovery_result',
              },
            ],
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Discovery artifact stored in \`${projectSlug}/00-discovery/\``,
              },
            ],
          },
          { type: 'divider' },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Next:* ${nextStep}`,
            },
          },
        ],
        text: `${result.typeLabel} complete for "${topic}". View: ${result.url}`,
      });

    } catch (error) {
      if (error instanceof PrivacyError) {
        const findingsList = error.findings.map(f => `• ${f.label}: \`${f.snippet}\``).join('\n');
        await client.chat.postMessage({
          channel: userId,
          text: `⚠️ *Privacy scan detected potential PII in your uploaded file(s)*\n\n${findingsList}\n\n` +
            'Please review and re-upload with PII removed, or contact the research lead. ' +
            'Qori cannot process files containing personal identifiers.',
        });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error processing discovery (app service):', error);
      await client.chat.postMessage({
        channel: userId,
        text: `❌ Error running ${typeConfig.label}: ${message}\n\nPlease try again or contact support.`,
      });
    }
  } else {
    // Legacy path: existing handler logic (no workspace binding)
    console.log(`[PLAT-3] Discovery: falling back to legacy path for user=${userId}`);

    // Duplicate handling — use project slug for folder path (Phase 2D)
    const dateIso: string = format(new Date(), 'yyyy-MM-dd');
    const expectedFilename = `${topicSlug}-${typeConfig.fileSlug}-${dateIso}.md`;
    const expectedPath = `${projectSlug}/00-discovery/${expectedFilename}`;
    try {
      // @ts-expect-error — pre-existing type mismatch from require() → import migration
      await fetchFileFromRepoByPath(process.env.GITHUB_REPO, expectedPath);
      const timeSuffix: string = format(new Date(), 'HHmm');
      topicSlug = `${topicSlug}-${timeSuffix}`;
      console.log(`⚠️ Discovery file exists at ${expectedPath}, using slug: ${topicSlug}`);
    } catch {
      // File doesn't exist — proceed with original slug
    }

    console.log(`🔍 Discovery: project=${projectSlug}, type=${discoveryType}, topic="${topic}", slug="${topicSlug}", files=${uploadedFiles.length}`);

    // Load project to get problem_statement for grounded gap derivation
    const project = await getProjectById(projectId);
    const projectProblemStatement = project?.problem_statement || null;

    await client.chat.postMessage({
      channel: userId,
      text: `Running ${typeConfig.label} for "${topic}"... This may take a minute.`,
    });

    try {
      await scaffoldDiscoveryFolders(projectSlug);

      const validation: ValidationResult = validateDocuments(documents);
      if (!validation.isValid) {
        await client.chat.postMessage({
          channel: userId,
          text: `❌ ${validation.message}`,
        });
        return;
      }

      const parsedDocuments: ParsedDocuments = parseDocuments(documents);
      const formattedDocumentContent: string = parsedDocuments.structured_format;

      const MIME_LABELS: Record<string, string> = {
        'application/pdf': 'PDF',
        'text/plain': 'Text',
        'text/markdown': 'Markdown',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
        'application/msword': 'Word',
      };
      const documentNames = processedFiles.map((f: ProcessedFile) => f.name);
      const documentTypes = processedFiles.map((f: ProcessedFile) => MIME_LABELS[f.type] || f.type);

      const data: DiscoveryTemplateInput = {
        topic,
        effective_topic: topic,
        topic_slug: topicSlug,
        project_slug: projectSlug,
        project_problem_statement: projectProblemStatement,
        source_intent: description,
        description: description || topic,
        document_content: formattedDocumentContent,
        combined_file_content: formattedDocumentContent,
        _discovery_type: typeConfig.type, // Postgres identifier (matches discoveryLoader.ts)
        selected_study: `discovery-${topicSlug}`,
        study_name: topic,
        document_count: processedFiles.length,
        document_names: documentNames,
        document_types: documentTypes,
      };

      // Survey-specific fields
      if (discoveryType === 'survey_synthesis') {
        data.survey_name = surveyName || undefined;
        data.question_focus = questionFocus || '';
        data.survey_files = uploadedFiles;
      }

      // Stakeholder-specific fields
      if (discoveryType === 'stakeholder_synthesis') {
        data.study_channel = channelId || userId;
        data.researcher_contact = `<@${userId}>`;
        data.detected_files = documents.map(d => d.name).join('\n- ');
        (data as any).file_list = documents.map(d => d.name);
      }

      // Privacy gate: authorize uploaded content before model access (PH-3 / ADR 0035).
      // Discovery uploads are researcher-authored documents (not participant transcripts),
      // so they use the DISCOVERY_UPLOAD policy: deterministic PII scan → auto-authorize
      // if clean, or block + notify researcher if PII detected.
      const privacyResult = authorizeForModel(
        formattedDocumentContent,
        'DISCOVERY_UPLOAD',
        { projectId, sourceId: `discovery:${discoveryType}:${topicSlug}` },
      );

      if (privacyResult.status === 'pending_review') {
        const piiFindings = scanForPii(formattedDocumentContent);
        const findingsList = piiFindings.map(f => `• ${f.label}: \`${f.snippet}\``).join('\n');
        await client.chat.postMessage({
          channel: userId,
          text: `⚠️ *Privacy scan detected potential PII in your uploaded file(s)*\n\n${findingsList}\n\n` +
            'Please review and re-upload with PII removed, or contact the research lead. ' +
            'Qori cannot process files containing personal identifiers.',
        });
        return;
      }

      if (privacyResult.status === 'denied') {
        await client.chat.postMessage({
          channel: userId,
          text: `❌ Content authorization failed: ${privacyResult.reason}`,
        });
        return;
      }

      // Use the authorized model-safe content
      data.document_content = privacyResult.modelSafeContent!;
      data.combined_file_content = privacyResult.modelSafeContent!;

      console.log(`✅ Privacy gate: ${privacyResult.policy} — ${privacyResult.reason}`);

      // PH-6B: Artifact identity context for discovery artifacts.
      // PH-6C note: No artifact→evidence attachment here. Discovery sources
      // are not yet in the canonical evidence graph (ADR 0037 limitation).
      // When discovery evidence constructs are added (future PH-5D), wire
      // attachEvidenceRefsVerified here.
      const { computeContentHash } = require('../../survey');
      const contentFingerprint = computeContentHash(privacyResult.modelSafeContent!).substring(0, 16);
      (data as unknown as Record<string, unknown>).__artifactContext = {
        projectId,
        studyId: null,
        artifactType: 'discovery',
        title: `${discoveryType.replace(/_/g, ' ')} — ${topic}`,
        canonicalUpstreamInputs: [`content:${contentFingerprint}`],
        createdBy: userId,
      };

      const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, typeConfig.yaml);

      // Variable context for discovery: projectId only (no studyId for discovery artifacts)
      const variableContext: VariableContext = { projectId };

      const renderedYaml = await processYamlTemplate(
        file.content,
        data,
        '',
        '',
        false,
        variableContext,
      );

      // CRITICAL: Await extraction to ensure cascade variables are committed before returning success.
      // Without this, downstream modals (brief) may read stale data. See ADR 0019.
      if (renderedYaml.extractionPromise) {
        const extractResult = await renderedYaml.extractionPromise;
        if (!extractResult.success) {
          throw new Error(`Cascade variable extraction failed: ${extractResult.error}. Document was saved but variables were not written.`);
        }
        console.log(`✅ Cascade variables committed: ${extractResult.variableCount} items (${extractResult.keys?.join(', ')})`);
      }

      const url: string = renderedYaml.result.url;

      // Type-aware next-step guidance (D2)
      const nextStep = SUCCESS_GUIDANCE[discoveryType as DiscoveryTypeKey]
        || 'Run `/qori-brief` to start your study.';

      await client.chat.postMessage({
        channel: userId,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *${typeConfig.label} complete*\n\n*Topic:* ${topic}\n*Type:* ${typeConfig.label}`,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'View on GitHub' },
                style: 'primary',
                url,
                action_id: 'view_discovery_result',
              },
            ],
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Discovery artifact stored in \`${projectSlug}/00-discovery/\``,
              },
            ],
          },
          { type: 'divider' },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Next:* ${nextStep}`,
            },
          },
        ],
        text: `${typeConfig.label} complete for "${topic}". View: ${url}`,
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error processing discovery:', error);
      await client.chat.postMessage({
        channel: userId,
        text: `❌ Error running ${typeConfig.label}: ${message}\n\nPlease try again or contact support.`,
      });
    }
  }
}

export {
  discoverHandler,
  openDiscoverTypeModal,
  handleDiscoverSubmission,
  buildArtifactDisplayText,
};
