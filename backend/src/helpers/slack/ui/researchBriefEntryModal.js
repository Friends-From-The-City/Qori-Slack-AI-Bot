/* eslint-disable max-len */
/* eslint-disable quotes */
const { researchBriefModal } = require('./researchBriefModal');
const { loadDiscoveryArtifacts, aggregateDiscoveryVariables } = require('../../discoveryLoader');

const DEFAULT_TEAM = 'friends-lab';
function getTeamSlug() {
  return process.env.QORI_TEAM_SLUG || DEFAULT_TEAM;
}

/**
 * Synthesize pre-population values from aggregated discovery variables.
 * Returns { method, methodHint, participants, participantsHint, questions, questionsHint, outOfScope, outOfScopeHint, risksPreview }
 */
function synthesizeCascadeFields(upstream, artifacts) {
  const result = {};

  // Method — from methodology_recommendations
  const methodRecs = upstream.upstream_methodology_recommendations;
  if (methodRecs) {
    // Find most-recommended method (appears in most sources)
    const methods = methodRecs.split('\n').filter(l => l.trim().startsWith('**') || l.trim().startsWith('-'));
    if (methods.length > 0) {
      // Use first recommendation's method name
      const firstMethod = methods[0].replace(/^\*\*\d+\.\*\*\s*/, '').replace(/^-\s*/, '').split('\n')[0];
      const methodName = firstMethod.match(/method(?:_name)?:\s*(.+?)(?:,|$)/i)?.[1] || firstMethod.substring(0, 80);
      result.method = methodName.trim();
      result.methodHint = `Recommended by ${artifacts.length} discovery source${artifacts.length === 1 ? '' : 's'}`;
    }
  }

  // Research questions — from stakeholder_questions_for_users (Blocking + first Important)
  const questions = upstream.upstream_stakeholder_questions_for_users;
  if (questions) {
    const lines = questions.split('\n').filter(l => l.trim());
    // Extract question text from the formatted objects
    const questionTexts = [];
    let currentQ = '';
    for (const line of lines) {
      const qMatch = line.match(/research_question:\s*(.+)/i) || line.match(/question:\s*(.+)/i);
      if (qMatch) {
        questionTexts.push(qMatch[1].trim());
      }
    }
    if (questionTexts.length > 0) {
      result.questions = questionTexts.slice(0, 3).map((q, i) => `${i + 1}. ${q}`).join('\n');
      result.questionsHint = `Pulled from stakeholder questions for users (${Math.min(questionTexts.length, 3)} of ${questionTexts.length} selected)`;
    }
  }

  // Out of scope — items discovery already established
  const barriers = upstream.upstream_discovered_barriers;
  if (barriers) {
    const established = [];
    // Look for high-confidence barriers that are already proven
    const barrierLines = barriers.split('\n').filter(l => l.trim());
    for (const line of barrierLines) {
      const titleMatch = line.match(/title:\s*(.+)/i);
      if (titleMatch) {
        established.push(titleMatch[1].trim());
      }
    }
    if (established.length > 0) {
      result.outOfScope = established.slice(0, 2).map(e => `${e} (already established by discovery)`).join('\n');
      result.outOfScopeHint = `First items pre-populated — discovery already established these findings`;
    }
  }

  // Risks preview — from stakeholder_constraints
  const constraints = upstream.upstream_stakeholder_constraints;
  if (constraints) {
    const riskLines = [];
    const constraintBlocks = constraints.split('\n\n').filter(b => b.trim());
    for (const block of constraintBlocks.slice(0, 3)) {
      const constraintMatch = block.match(/constraint:\s*(.+)/i);
      const sourceMatch = block.match(/source(?:_role)?:\s*(.+)/i);
      if (constraintMatch) {
        const risk = constraintMatch[1].trim().substring(0, 80);
        const source = sourceMatch ? sourceMatch[1].trim() : 'Stakeholder';
        riskLines.push(`- ${risk} (${source})`);
      }
    }
    result.risksPreview = riskLines.join('\n');
  }

  return result;
}

/**
 * Build the brief entry modal for /qori-brief command.
 * Cascade-aware: auto-selects discovery, pre-populates fields with sparkle markers.
 */
async function buildBriefEntryModal(leadResearcher, channelId) {
  const modalBlocks = JSON.parse(JSON.stringify(researchBriefModal.blocks));

  // Pre-fill lead researcher if available
  if (leadResearcher) {
    const leadIdx = modalBlocks.findIndex(b => b.block_id === 'lead_researcher_block' || b.block_id === 'lead_researcher');
    if (leadIdx !== -1) {
      modalBlocks[leadIdx] = {
        ...modalBlocks[leadIdx],
        element: { ...modalBlocks[leadIdx].element, initial_value: leadResearcher },
      };
    }
  }

  // Calculate default start date (next Monday)
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilMonday);
  const defaultStartDate = nextMonday.toISOString().split('T')[0];

  const startDateIndex = modalBlocks.findIndex(b => b.block_id === 'start_date_block');
  if (startDateIndex !== -1) {
    modalBlocks[startDateIndex] = {
      ...modalBlocks[startDateIndex],
      element: { ...modalBlocks[startDateIndex].element, initial_date: defaultStartDate },
    };
  }

  // Query discovery artifacts for this team
  const team = getTeamSlug();
  let artifacts = [];
  try {
    artifacts = await loadDiscoveryArtifacts(team);
  } catch (error) {
    console.warn('⚠️ Failed to load discovery artifacts for brief modal:', error.message);
  }

  // Find the discovery placeholder blocks and replace
  const headerIdx = modalBlocks.findIndex(b => b.block_id === 'discovery_header_block');
  const statusIdx = modalBlocks.findIndex(b => b.block_id === 'discovery_status_block');

  if (headerIdx !== -1 && statusIdx !== -1) {
    if (artifacts.length === 0) {
      // No discovery — show empty state
      modalBlocks[statusIdx] = {
        type: "context",
        block_id: "discovery_status_block",
        elements: [
          {
            type: "mrkdwn",
            text: "⚠️ No discovery research available for this team yet. Run `/qori-discover` first to add organizational context, or proceed without — brief will be generated from your inputs alone.",
          },
        ],
      };
    } else {
      // Build checkbox options from artifacts — AUTO-SELECT ALL
      const checkboxOptions = artifacts.map(a => {
        const countLabel = a.label === 'stakeholder'
          ? `${a.variableCount} constraints/priorities`
          : a.label === 'survey'
            ? `${a.variableCount} themes/findings`
            : `${a.variableCount} findings`;
        return {
          text: {
            type: "mrkdwn",
            text: `${a.icon} *${a.slug}*\n      ${a.label} · ${countLabel} · ${a.date}`,
          },
          value: `${a.type}::${a.slug}`,
        };
      });

      // Status with auto-selected message
      modalBlocks[statusIdx] = {
        type: "context",
        block_id: "discovery_status_block",
        elements: [
          {
            type: "mrkdwn",
            text: `✅ ${artifacts.length} discovery source${artifacts.length === 1 ? '' : 's'} available — auto-selected`,
          },
        ],
      };

      // Checkboxes with ALL pre-selected (initial_options = all options)
      const checkboxBlock = {
        type: "input",
        block_id: "discovery_selection_block",
        optional: true,
        label: {
          type: "plain_text",
          text: "Discovery sources",
        },
        element: {
          type: "checkboxes",
          action_id: "discovery_selection",
          options: checkboxOptions,
          initial_options: checkboxOptions, // AUTO-SELECT ALL
        },
      };

      // Insert checkbox block after status
      modalBlocks.splice(statusIdx + 1, 0, checkboxBlock);

      // Aggregate variables for pre-population
      const upstream = aggregateDiscoveryVariables(artifacts);
      const cascade = synthesizeCascadeFields(upstream, artifacts);

      // Build cascade-suggests blocks
      const cascadeBlocks = [];

      cascadeBlocks.push({ type: "divider" });
      cascadeBlocks.push({
        type: "context",
        elements: [{
          type: "mrkdwn",
          text: "🤖 *Discovery suggests* — Edit any field to override. Uncheck sources above to exclude.",
        }],
      });

      // Pre-populate method field if discovery recommends one
      if (cascade.method) {
        const methodIdx = modalBlocks.findIndex(b => b.block_id === 'research_method_block');
        // Can't pre-select radio buttons dynamically in Slack easily,
        // so add a context hint instead
        cascadeBlocks.push({
          type: "context",
          elements: [{
            type: "mrkdwn",
            text: `✨ *Method:* ${cascade.method}\n      ${cascade.methodHint}`,
          }],
        });
      }

      // Pre-populate research questions (learning objectives field)
      if (cascade.questions) {
        const learningIdx = modalBlocks.findIndex(b => b.block_id === 'learning_objectives_block');
        if (learningIdx !== -1) {
          modalBlocks[learningIdx] = {
            ...modalBlocks[learningIdx],
            element: {
              ...modalBlocks[learningIdx].element,
              initial_value: cascade.questions,
            },
          };
          cascadeBlocks.push({
            type: "context",
            elements: [{
              type: "mrkdwn",
              text: `✨ *Research questions:* ${cascade.questionsHint}`,
            }],
          });
        }
      }

      // Pre-populate out of scope
      if (cascade.outOfScope) {
        const oosIdx = modalBlocks.findIndex(b => b.block_id === 'out_of_scope_block');
        if (oosIdx !== -1) {
          modalBlocks[oosIdx] = {
            ...modalBlocks[oosIdx],
            element: {
              ...modalBlocks[oosIdx].element,
              initial_value: cascade.outOfScope,
            },
          };
          cascadeBlocks.push({
            type: "context",
            elements: [{
              type: "mrkdwn",
              text: `✨ *Out of scope:* ${cascade.outOfScopeHint}`,
            }],
          });
        }
      }

      // Risks preview from constraints
      if (cascade.risksPreview) {
        cascadeBlocks.push({
          type: "context",
          elements: [{
            type: "mrkdwn",
            text: `⚠️ *Risks preview* (from stakeholder constraints):\n${cascade.risksPreview}`,
          }],
        });
      }

      // Insert all cascade blocks after the checkbox block
      const insertIdx = statusIdx + 2; // after status + checkbox
      modalBlocks.splice(insertIdx, 0, ...cascadeBlocks);
    }
  }

  return {
    ...researchBriefModal,
    blocks: modalBlocks,
    private_metadata: JSON.stringify({ channelId, source: 'qori_brief_command', team }),
  };
}

module.exports = { buildBriefEntryModal };
