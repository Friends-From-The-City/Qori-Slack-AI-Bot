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
 *
 * PLAT-3: Application service is the ONLY business path.
 * Legacy fallback removed — buildSlackApplicationContext failure
 * is a hard stop (fail closed).
 */

import type { AllMiddlewareArgs, SlackActionMiddlewareArgs, SlackCommandMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';
import type { View } from '@slack/types';

import { buildSlackApplicationContext } from '../../../middleware/auth/slackContextBridge';
import { executeDiscovery, PrivacyError, type DiscoveryInput, type DiscoveryTypeKey as AppDiscoveryTypeKey } from '../../../application/discovery.app-service';
import { discoverHubModal, DISCOVERY_ARTIFACTS_BLOCK_ID } from '../ui/discoverHubModal';
import { DISCOVER_TYPE_MODALS } from '../ui/discoverTypeModals';
import { loadDiscoveryArtifacts, type DiscoveryArtifact } from '../../discoveryLoader';
import { processSlackFiles } from '../../pdfProcessor';
import { getProjectByChannelId } from '../../../services/project.service';
import { assertProjectAccess, AuthorizationError } from '../../../services/authorization.service';
import { postEphemeralOrDM } from '../slackHelpers';
import { handleSurveyUploadPhase } from './surveySubmissionHandler';

// ─── Types ──────────────────────────────────────────────────────

interface ProcessedFile {
  name: string;
  content: string;
  type: string;
  size: number;
}

interface UploadedFile {
  id: string;
  name: string;
  mimetype: string;
  url: string;
  url_private?: string;
  [key: string]: unknown;
}

interface DiscoverMeta {
  channelId?: string;
  projectId?: number;
  projectSlug?: string;
  discoveryType?: string;
}

// ─── Constants ──────────────────────────────────────────────────

interface DiscoveryTypeConfig {
  label: string;
  filetypes: string[];
}

const DISCOVERY_TYPES: Record<string, DiscoveryTypeConfig> = {
  desk_research: {
    label: 'Desk research',
    filetypes: ['pdf', 'docx', 'doc', 'txt', 'md'],
  },
  stakeholder_synthesis: {
    label: 'Stakeholder synthesis',
    filetypes: ['pdf', 'docx', 'doc', 'txt', 'md'],
  },
  survey_synthesis: {
    filetypes: ['csv'],
    label: 'Survey synthesis',
  },
};

/** Type-aware next-step guidance for success messages (D2). */
const SUCCESS_GUIDANCE: Record<string, string> = {
  desk_research: 'Run `/qori-discover` again for stakeholder interviews, or `/qori-brief` to start your study.',
  stakeholder_synthesis: 'Run `/qori-discover` for survey data, or `/qori-brief` to start your study.',
  survey_synthesis: 'Run `/qori-brief` to start your study — all discovery feeds in automatically.',
};

// ─── Helpers ────────────────────────────────────────────────────

function slugifyTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
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
  if (!discoveryType || !DISCOVERY_TYPES[discoveryType]) {
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

  const typeConfig = DISCOVERY_TYPES[discoveryType];
  const topicSlug = slugifyTopic(topic);

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

  // Process Slack files before delegating (Slack-specific: needs SLACK_BOT_TOKEN)
  const processedFiles: ProcessedFile[] = await processSlackFiles(uploadedFiles, process.env.SLACK_BOT_TOKEN!);
  const documents = processedFiles.map((file: ProcessedFile) => ({
    name: file.name,
    content: file.content,
    type: file.type,
    size: file.size,
  }));

  // ── PLAT-3: Application service is the ONLY path ──
  const displayName = body.user?.name || body.user?.id || userId;
  const ctx = await buildSlackApplicationContext(userId, (body as any).team?.id || '', displayName);

  if (!ctx) {
    await client.chat.postMessage({
      channel: userId,
      text: '❌ Unable to resolve your identity. Please contact your administrator to ensure your workspace is configured.',
    });
    return;
  }

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
    const nextStep = SUCCESS_GUIDANCE[discoveryType]
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
}

export {
  discoverHandler,
  openDiscoverTypeModal,
  handleDiscoverSubmission,
  buildArtifactDisplayText,
};
