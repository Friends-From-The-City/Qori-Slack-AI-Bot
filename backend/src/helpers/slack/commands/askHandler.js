/**
 * /qori-ask — Knowledge layer (Pattern A).
 *
 * Free-text question → Haiku interprets → Postgres cross-study query →
 * Sonnet formats → DM response with show-more pagination.
 */

const { ChatAnthropic } = require('@langchain/anthropic');
const { getStudiesByUser } = require('../../../services/research_study.service');
const { getActiveStudy } = require('../../../services/slack-user-state.service');
const { searchVariablesAcrossStudies } = require('../../studyVariables');
const { buildAskModal } = require('../ui/askModal');

// Known variable types the LLM can map questions to
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
];

const RESULTS_PER_GROUP = 5;

// ── Command handler ────────────────────────────────────────

const askHandler = async ({ ack, body, client, command }) => {
  try {
    await ack();
    const userId = command.user_id;
    const studies = await getStudiesByUser(userId);
    const activeStudyId = await getActiveStudy(userId);

    const studyOptions = studies.map(s => ({
      text: { type: 'plain_text', text: s.name },
      value: s.id.toString(),
    }));

    const modal = buildAskModal(studyOptions, activeStudyId);
    modal.private_metadata = JSON.stringify({
      channelId: command.channel_id,
      userId,
    });

    await client.views.open({ trigger_id: body.trigger_id, view: modal });
  } catch (error) {
    console.error('askHandler error:', error.message);
  }
};

// ── Submit handler ─────────────────────────────────────────

const handleAskSubmit = async ({ ack, body, view, client }) => {
  try {
    await ack();

    const meta = JSON.parse(view.private_metadata || '{}');
    const userId = meta.userId || body.user.id;
    const question = view.state.values.ask_question?.question_text?.value;
    const scope = view.state.values.ask_scope?.scope_choice?.selected_option?.value || 'all';
    const selectedStudyId = view.state.values.ask_study_select?.ask_study_choice?.selected_option?.value;

    // Determine study name for single-study scope
    let studyName;
    if (scope === 'single' && selectedStudyId) {
      const studies = await getStudiesByUser(userId);
      const study = studies.find(s => s.id.toString() === selectedStudyId);
      studyName = study?.name;
    }

    // 1. Send placeholder DM
    const im = await client.conversations.open({ users: userId });
    const placeholder = await client.chat.postMessage({
      channel: im.channel.id,
      text: `Searching for: "${question}"...`,
    });

    // 2. Interpret query with Haiku
    const interpretation = await interpretQuery(question);

    // 3. Run cross-study search
    const { rows, total } = await searchVariablesAcrossStudies(
      interpretation.variable_keys,
      interpretation.search_terms,
      { studyName, limit: 30 },
    );

    // 4. Format results with Sonnet
    const formatted = rows.length > 0
      ? await formatResults(question, rows, total, scope, studyName)
      : null;

    // 5. Update placeholder DM with results
    if (!formatted || rows.length === 0) {
      await client.chat.update({
        channel: im.channel.id,
        ts: placeholder.ts,
        text: `No matches found for "${question}". Try broader terms or specific variable types like "quotes about X" or "findings on Y".`,
      });
      return;
    }

    // Build result blocks grouped by variable type
    const blocks = buildResultBlocks(rows, total, question, scope, studyName, formatted);

    await client.chat.update({
      channel: im.channel.id,
      ts: placeholder.ts,
      text: `Found ${total} results matching "${question}"`,
      blocks,
    });
  } catch (error) {
    console.error('handleAskSubmit error:', error);
    try {
      const meta = JSON.parse(view.private_metadata || '{}');
      const im = await client.conversations.open({ users: meta.userId || body.user.id });
      await client.chat.postMessage({
        channel: im.channel.id,
        text: `Something went wrong with your search: ${error.message}. Please try again.`,
      });
    } catch (dmErr) {
      console.error('Failed to send error DM:', dmErr.message);
    }
  }
};

// ── Show more action handler ───────────────────────────────

const handleShowMore = async ({ ack, body, client }) => {
  await ack();
  try {
    const payload = JSON.parse(body.actions[0].value);
    const { variableKeys, searchTerms, studyName, offset, question } = payload;

    const { rows, total } = await searchVariablesAcrossStudies(
      variableKeys,
      searchTerms,
      { studyName, limit: RESULTS_PER_GROUP, offset },
    );

    if (rows.length === 0) {
      await client.chat.postMessage({
        channel: body.channel.id,
        text: 'No more results to show.',
      });
      return;
    }

    const blocks = [];
    for (const row of rows) {
      const preview = extractPreview(row);
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: preview,
        },
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
      channel: body.channel.id,
      text: `${rows.length} more results for "${question}"`,
      blocks,
    });
  } catch (error) {
    console.error('handleShowMore error:', error.message);
  }
};

// ── LLM helpers ────────────────────────────────────────────

async function interpretQuery(question) {
  const haiku = new ChatAnthropic({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    modelName: 'claude-haiku-4-5-20251001',
    temperature: 0,
    maxTokens: 512,
  });

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
    const parsed = JSON.parse(response.content);
    // Validate keys
    parsed.variable_keys = (parsed.variable_keys || []).filter(k => KNOWN_VARIABLE_KEYS.includes(k));
    if (parsed.variable_keys.length === 0) {
      parsed.variable_keys = ['atomic_nugget_core', 'validated_themes', 'findings', 'recommendations'];
    }
    parsed.search_terms = (parsed.search_terms || []).filter(t => typeof t === 'string' && t.length > 0);
    return parsed;
  } catch (error) {
    console.warn('Haiku interpretation failed, using defaults:', error.message);
    // Fallback: extract words from question as search terms
    const terms = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    return {
      variable_keys: ['atomic_nugget_core', 'validated_themes', 'findings', 'recommendations'],
      search_terms: terms.slice(0, 3),
    };
  }
}

async function formatResults(question, rows, total, scope, studyName) {
  const sonnet = new ChatAnthropic({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    modelName: process.env.ANTHROPIC_MODEL_NAME || 'claude-sonnet-4-20250514',
    temperature: 0.3,
    maxTokens: 2048,
  });

  // Build concise context from rows, unwrapping array values
  const context = rows.slice(0, 20).map(row => {
    const items = Array.isArray(row.value) ? row.value : [row.value];
    return items.slice(0, 2).map(item => {
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
    return response.content;
  } catch (error) {
    console.warn('Sonnet formatting failed:', error.message);
    return null;
  }
}

// ── Block builders ─────────────────────────────────────────

/**
 * Unwrap a value that may be a singleton JSON array (e.g., [{ ... }]).
 * Many variable types store data as a single-element array in Postgres.
 */
function unwrap(val) {
  if (Array.isArray(val)) return val;
  return [val];
}

/**
 * Format a single variable row into a readable Slack mrkdwn preview.
 * Handles nuggets, findings, themes, and recommendations with their
 * actual JSONB field names.
 */
function extractPreview(row) {
  const raw = row.value;
  if (!raw) return `_${row.variable_key}_ (${row.study_name})`;

  const items = unwrap(raw);
  const studyLabel = row.study_name.replace(/-/g, ' ');
  const key = row.variable_key;

  // For array-valued rows (themes, findings), format each item
  if (items.length > 1 || (Array.isArray(raw) && items.length === 1)) {
    return items.slice(0, 3).map(item => formatItem(item, key, studyLabel, row.participant_id)).join('\n\n');
  }

  // Single object
  return formatItem(items[0], key, studyLabel, row.participant_id);
}

function formatItem(item, key, studyLabel, participantId) {
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

function buildResultBlocks(rows, total, question, scope, studyName, summary) {
  const blocks = [];

  // Summary
  if (summary) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `Found *${total}* results matching _"${question}"_:\n\n${summary}` },
    });
    blocks.push({ type: 'divider' });
  }

  // Group by variable_key
  const groups = {};
  for (const row of rows) {
    const key = row.variable_key;
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  const keyLabels = {
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

  for (const [key, groupRows] of Object.entries(groups)) {
    const label = keyLabels[key] || key.toUpperCase();
    blocks.push({
      type: 'header',
      text: { type: 'plain_text', text: `${label} (${groupRows.length})` },
    });

    // Show first RESULTS_PER_GROUP
    const shown = groupRows.slice(0, RESULTS_PER_GROUP);
    for (const row of shown) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: extractPreview(row) },
      });
    }

    // Show more button if more exist
    if (groupRows.length > RESULTS_PER_GROUP) {
      blocks.push({
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: `Show ${groupRows.length - RESULTS_PER_GROUP} more` },
          action_id: 'ask_show_more',
          value: JSON.stringify({
            variableKeys: [key],
            searchTerms: [], // already filtered
            studyName,
            offset: RESULTS_PER_GROUP,
            question,
          }),
        }],
      });
    }
  }

  // Footer
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

module.exports = {
  askHandler,
  handleAskSubmit,
  handleShowMore,
};
