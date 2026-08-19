/**
 * /qori-ask — Knowledge layer (Pattern A).
 *
 * Free-text question → Haiku interprets → Postgres cross-study query →
 * Sonnet formats → DM response with show-more pagination.
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';
import type { View } from '@slack/types';

import { createModel } from '../../modelProvider';
import { getStudiesByUser } from '../../../services/research_study.service';
import { getActiveStudy } from '../../../services/slack-user-state.service';
import { searchVariablesAcrossStudies } from '../../studyVariables';
import { buildAskModal } from '../ui/askModal';
import { getProjectByChannelId, getProjectsByUser } from '../../../services/project.service';
import { assertProjectAccess, assertStudyAccess } from '../../../services/authorization.service';

// ─── Constants ──────────────────────────────────────────────────────

const KNOWN_VARIABLE_KEYS = [
  'atomic_nugget_core',
  'atomic_nugget_detail',
  'validated_themes',
  'findings',
  'prioritized_findings',
  'recommendations',
  'session_summary',
  'target_barriers',
  'research_questions',
] as const;

const RESULTS_PER_GROUP = 5;

const DEFAULT_VARIABLE_KEYS = ['atomic_nugget_core', 'validated_themes', 'findings', 'recommendations'];

// ─── Types ──────────────────────────────────────────────────────────

interface Interpretation {
  variable_keys: string[];
  search_terms: string[];
}

interface VariableRow {
  variable_key: string;
  study_name: string;
  participant_id: string | null;
  value: any;
}

// ─── LLM helpers ────────────────────────────────────────────────────

async function interpretQuery(question: string): Promise<Interpretation> {
  const haiku = createModel({ tier: 'haiku', temperature: 0, maxTokens: 512, purpose: 'ask-query-interpretation' });

  const prompt = `You are a query interpreter for a research database. Given a user's question, extract:
1. variable_keys: which variable types to search (from this list: ${KNOWN_VARIABLE_KEYS.join(', ')})
2. search_terms: keywords to search within the variable values

Rules:
- "quotes" or "what did participants say" → atomic_nugget_core, atomic_nugget_detail
- "findings" → findings, prioritized_findings
- "themes" → validated_themes
- "recommendations" → recommendations
- If unclear, search atomic_nugget_core, validated_themes, findings, recommendations
- Extract 1-3 search terms from the question (nouns and adjectives, not function words)

Respond with ONLY valid JSON, no explanation:
{"variable_keys": ["..."], "search_terms": ["..."]}

User question: "${question}"`;

  try {
    const response = await haiku.invoke(prompt);
    const parsed = JSON.parse(response.content as string);
    parsed.variable_keys = (parsed.variable_keys || []).filter((k: string) => (KNOWN_VARIABLE_KEYS as readonly string[]).includes(k));
    if (parsed.variable_keys.length === 0) {
      parsed.variable_keys = DEFAULT_VARIABLE_KEYS;
    }
    parsed.search_terms = (parsed.search_terms || []).filter((t: any) => typeof t === 'string' && t.length > 0);
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Haiku interpretation failed, using defaults:', message);
    const terms = question.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
    return {
      variable_keys: DEFAULT_VARIABLE_KEYS,
      search_terms: terms.slice(0, 3),
    };
  }
}

async function formatResults(question: string, rows: VariableRow[], total: number, scope: string, studyName: string | undefined): Promise<string | null> {
  const sonnet = createModel({ tier: 'sonnet', temperature: 0.3, maxTokens: 2048, purpose: 'ask-result-formatting' });

  const context = rows.slice(0, 20).map(row => {
    const items = Array.isArray(row.value) ? row.value : [row.value];
    return items.slice(0, 2).map((item: any) => {
      if (!item || typeof item !== 'object') return String(item);
      const text = item.text || item.finding || item.theme_name || item.summary
        || item.verbatim_quote || item.recommendation || JSON.stringify(item);
      return `[${row.variable_key}] ${row.study_name} | ${row.participant_id || item.participant || '-'}: ${String(text).substring(0, 300)}`;
    }).join('\n');
  }).join('\n');

  const prompt = `You are Qori, a research knowledge assistant. A user asked: "${question}"

Here are ${rows.length} matching results (of ${total} total) from ${scope === 'all' ? 'all studies' : `study "${studyName}"`}:

${context}

Write a concise summary (2-4 sentences) of what was found, highlighting the most relevant results. Do not fabricate — only reference what appears in the results above.`;

  try {
    const response = await sonnet.invoke(prompt);
    return response.content as string;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Sonnet formatting failed:', message);
    return null;
  }
}

// ─── Block builders ─────────────────────────────────────────────────

function unwrap(val: any): any[] {
  if (Array.isArray(val)) return val;
  return [val];
}

function formatItem(item: any, key: string, studyLabel: string, participantId: string | null): string {
  if (!item || typeof item !== 'object') {
    return typeof item === 'string' ? item.substring(0, 250) : String(item);
  }

  const severity = item.severity ? `  \`severity ${item.severity}\`` : '';
  const study = `_${studyLabel}_`;

  switch (key) {
    case 'atomic_nugget_core':
    case 'atomic_nugget_detail': {
      const pid = item.participant || participantId || '';
      const quote = item.text || item.verbatim_quote || '';
      const type = item.nugget_type ? item.nugget_type.replace(/_/g, ' ') : '';
      return `> ${quote}\n${pid} · ${study}${severity}${type ? ` · ${type}` : ''}`;
    }
    case 'prioritized_findings':
    case 'findings': {
      const finding = item.finding || item.finding_text || item.text || '';
      const rec = item.recommendation ? `\n_Recommendation:_ ${item.recommendation.substring(0, 150)}` : '';
      return `*${finding}*${severity} · ${study}${rec}`;
    }
    case 'validated_themes': {
      const name = item.theme_name || item.name || '';
      const summary = item.summary || '';
      const conf = item.confidence ? ` · ${item.confidence} confidence` : '';
      return `*${name}*${conf} · ${study}\n${summary.substring(0, 200)}`;
    }
    case 'recommendations':
    case 'prioritized_recommendations': {
      const text = item.recommendation || item.recommendation_text || item.text || '';
      return `${text.substring(0, 250)}\n${study}`;
    }
    default: {
      const text = item.text || item.summary || item.finding || item.name || JSON.stringify(item).substring(0, 200);
      return `${text}\n${study}`;
    }
  }
}

function extractPreview(row: VariableRow): string {
  const raw = row.value;
  if (!raw) return `_${row.variable_key}_ (${row.study_name})`;

  const items = unwrap(raw);
  const studyLabel = row.study_name.replace(/-/g, ' ');
  const key = row.variable_key;

  if (items.length > 1 || (Array.isArray(raw) && items.length === 1)) {
    return items.slice(0, 3).map((item: any) => formatItem(item, key, studyLabel, row.participant_id)).join('\n\n');
  }

  return formatItem(items[0], key, studyLabel, row.participant_id);
}

const KEY_LABELS: Record<string, string> = {
  atomic_nugget_core: 'QUOTES',
  atomic_nugget_detail: 'QUOTE DETAILS',
  validated_themes: 'THEMES',
  findings: 'FINDINGS',
  prioritized_findings: 'FINDINGS',
  recommendations: 'RECOMMENDATIONS',
  session_summary: 'SESSION SUMMARIES',
  target_barriers: 'BARRIERS',
  research_questions: 'RESEARCH QUESTIONS',
};

function buildResultBlocks(rows: VariableRow[], total: number, question: string, scope: string, studyName: string | undefined, summary: string): any[] {
  const blocks: any[] = [];

  if (summary) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `Found *${total}* results matching _"${question}"_:\n\n${summary}` },
    });
    blocks.push({ type: 'divider' });
  }

  // Group by variable_key
  const groups: Record<string, VariableRow[]> = {};
  for (const row of rows) {
    if (!groups[row.variable_key]) groups[row.variable_key] = [];
    groups[row.variable_key].push(row);
  }

  for (const [key, groupRows] of Object.entries(groups)) {
    const label = KEY_LABELS[key] || key.toUpperCase();
    blocks.push({
      type: 'header',
      text: { type: 'plain_text', text: `${label} (${groupRows.length})` },
    });

    const shown = groupRows.slice(0, RESULTS_PER_GROUP);
    for (const row of shown) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: extractPreview(row) },
      });
    }

    if (groupRows.length > RESULTS_PER_GROUP) {
      blocks.push({
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: `Show ${groupRows.length - RESULTS_PER_GROUP} more` },
          action_id: 'ask_show_more',
          value: JSON.stringify({
            variableKeys: [key],
            searchTerms: [],
            studyName,
            offset: RESULTS_PER_GROUP,
            question,
          }),
        }],
      });
    }
  }

  const scopeText = scope === 'all' ? 'all studies' : `study "${studyName}"`;
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `Source: ${scopeText} searched. ${total} results total${total > 30 ? ' — showing top 30 by recency' : ''}.`,
    }],
  });

  return blocks;
}

// ─── Command handler ────────────────────────────────────────────────

async function askHandler({ ack, body, client, command }: SlackCommandMiddlewareArgs & AllMiddlewareArgs) {
  try {
    await ack();
    const userId = command.user_id;
    const studies = await getStudiesByUser(userId);
    const activeStudyId = await getActiveStudy(userId);

    const studyOptions = studies.map((s: any) => ({
      text: { type: 'plain_text', text: s.name },
      value: s.id.toString(),
    }));

    // @ts-expect-error — pre-existing type mismatch from require() → import migration
    const modal = buildAskModal(studyOptions, activeStudyId);
    (modal as any).private_metadata = JSON.stringify({
      channelId: command.channel_id,
      userId,
    });

    await client.views.open({ trigger_id: body.trigger_id, view: modal as unknown as View });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('askHandler error:', message);
  }
}

// ─── Submit handler ─────────────────────────────────────────────────

async function handleAskSubmit({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs) {
  try {
    await ack();

    const meta = JSON.parse(view.private_metadata || '{}');
    const userId = meta.userId || body.user.id;
    const originChannelId = meta.channelId;
    const question = view.state.values.ask_question?.question_text?.value as string;
    const scope = (view.state.values.ask_scope?.scope_choice?.selected_option?.value || 'all') as string;
    const selectedStudyId = view.state.values.ask_study_select?.ask_study_choice?.selected_option?.value as string | undefined;

    // ADR 0024: Channel-scoped search — get current project from channel binding
    const currentProject = await getProjectByChannelId(originChannelId);
    if (!currentProject) {
      // No project bound to this channel — show helpful error
      const userProjects = await getProjectsByUser(userId);
      const errorMessage = userProjects.length === 0
        ? 'No projects yet. Run `/qori-start` to create one.'
        : 'Cross-study search requires a project channel. Run this command from your project\'s dedicated channel, or use `/qori-start` to create a new project with a channel.';

      const dm = await client.conversations.open({ users: userId });
      await client.chat.postMessage({
        channel: dm.channel!.id as string,
        text: errorMessage,
      });
      return;
    }

    // Authorization check: verify user has access to this project
    await assertProjectAccess(userId, currentProject.id, client);

    // For single-study scope, verify the study is in the current project
    let studyId: number | undefined;
    let studyName: string | undefined;
    if (scope === 'single' && selectedStudyId) {
      studyId = parseInt(selectedStudyId, 10);
      // Verify study belongs to current project
      await assertStudyAccess(userId, studyId, client);
      // Get study name for display
      const studies = await getStudiesByUser(userId);
      const study = studies.find((s: any) => s.id.toString() === selectedStudyId);
      studyName = study?.name;
    }

    // Send placeholder DM
    const im = await client.conversations.open({ users: userId });
    const channelId = im.channel!.id as string;
    const placeholder = await client.chat.postMessage({
      channel: channelId,
      text: `Searching for: "${question}"...`,
    });
    const placeholderTs = placeholder.ts as string;

    // Interpret query with Haiku
    const interpretation = await interpretQuery(question);

    // Run cross-study search — scoped to current project (ADR 0024: never all studies in DB)
    const result = await searchVariablesAcrossStudies(
      interpretation.variable_keys,
      interpretation.search_terms,
      { projectId: currentProject.id, studyId, limit: 30 },
    );
    const rows = result.rows as VariableRow[];
    const { total } = result;

    // Format results with Sonnet
    const formatted = rows.length > 0
      ? await formatResults(question, rows, total, scope, studyName)
      : null;

    // Update placeholder DM with results
    if (!formatted || rows.length === 0) {
      await client.chat.update({
        channel: channelId,
        ts: placeholderTs,
        text: `No matches found for "${question}". Try broader terms or specific variable types like "quotes about X" or "findings on Y".`,
      });
      return;
    }

    const blocks = buildResultBlocks(rows, total, question, scope, studyName, formatted);

    await client.chat.update({
      channel: channelId,
      ts: placeholderTs,
      text: `Found ${total} results matching "${question}"`,
      blocks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('handleAskSubmit error:', error);
    try {
      const meta = JSON.parse(view.private_metadata || '{}');
      const im = await client.conversations.open({ users: meta.userId || body.user.id });
      await client.chat.postMessage({
        channel: im.channel!.id as string,
        text: `Something went wrong with your search: ${message}. Please try again.`,
      });
    } catch (dmErr) {
      const dmMessage = dmErr instanceof Error ? dmErr.message : String(dmErr);
      console.error('Failed to send error DM:', dmMessage);
    }
  }
}

// ─── Show more action handler ───────────────────────────────────────

async function handleShowMore({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs) {
  await ack();
  try {
    const payload = JSON.parse((body.actions![0] as any).value);
    const { variableKeys, searchTerms, studyName, offset, question } = payload;

    const result = await searchVariablesAcrossStudies(
      variableKeys,
      searchTerms,
      { studyName, limit: RESULTS_PER_GROUP, offset },
    );
    const rows = result.rows as VariableRow[];
    const { total } = result;

    if (rows.length === 0) {
      await client.chat.postMessage({
        channel: body.channel!.id,
        text: 'No more results to show.',
      });
      return;
    }

    const blocks: any[] = [];
    for (const row of rows) {
      const preview = extractPreview(row);
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: preview },
      });
    }

    const remaining = total - offset - rows.length;
    if (remaining > 0) {
      blocks.push({
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: `Show ${Math.min(remaining, RESULTS_PER_GROUP)} more` },
          action_id: 'ask_show_more',
          value: JSON.stringify({
            variableKeys,
            searchTerms,
            studyName,
            offset: offset + RESULTS_PER_GROUP,
            question,
          }),
        }],
      });
    }

    await client.chat.postMessage({
      channel: body.channel!.id,
      text: `${rows.length} more results for "${question}"`,
      blocks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('handleShowMore error:', message);
  }
}

export {
  askHandler,
  handleAskSubmit,
  handleShowMore,
};
