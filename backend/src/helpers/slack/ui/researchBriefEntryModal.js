/* eslint-disable max-len */
/* eslint-disable quotes */
const { researchBriefModal } = require('./researchBriefModal');
const { loadDiscoveryArtifacts } = require('../../discoveryLoader');

const DEFAULT_TEAM = 'friends-lab';
function getTeamSlug() {
  return process.env.QORI_TEAM_SLUG || DEFAULT_TEAM;
}

/**
 * Build the brief entry modal for /qori-brief command.
 * Pre-fills lead researcher from Slack profile.
 * Calculates default start date (next Monday).
 * Queries discovery artifacts and populates selection checkboxes.
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
      // No discovery — show informational message, remove header
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
      // Build checkbox options from artifacts
      const checkboxOptions = artifacts.map(a => {
        const countLabel = a.label === 'stakeholder'
          ? `${a.variableCount} variables`
          : `${a.variableCount} findings`;
        return {
          text: {
            type: "mrkdwn",
            text: `${a.icon} *${a.slug}* — ${a.label}, ${countLabel}, ${a.date}`,
          },
          value: `${a.type}::${a.slug}`,
        };
      });

      // Update status block with count
      modalBlocks[statusIdx] = {
        type: "context",
        block_id: "discovery_status_block",
        elements: [
          {
            type: "mrkdwn",
            text: `✅ Discovery available — ${artifacts.length} artifact${artifacts.length === 1 ? '' : 's'} ready to inform this brief`,
          },
        ],
      };

      // Insert checkboxes block after status
      const checkboxBlock = {
        type: "input",
        block_id: "discovery_selection_block",
        optional: true,
        label: {
          type: "plain_text",
          text: "Select discovery artifacts to include",
        },
        element: {
          type: "checkboxes",
          action_id: "discovery_selection",
          options: checkboxOptions,
        },
      };

      // Insert after status block
      modalBlocks.splice(statusIdx + 1, 0, checkboxBlock);
    }
  }

  return {
    ...researchBriefModal,
    blocks: modalBlocks,
    private_metadata: JSON.stringify({ channelId, source: 'qori_brief_command', team }),
  };
}

module.exports = { buildBriefEntryModal };
