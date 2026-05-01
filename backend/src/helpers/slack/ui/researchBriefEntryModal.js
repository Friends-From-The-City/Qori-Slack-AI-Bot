/* eslint-disable max-len */
/* eslint-disable quotes */
const { researchBriefModal } = require('./researchBriefModal');

/**
 * Build the brief entry modal for /qori-brief command.
 * Pre-fills lead researcher from Slack profile.
 * Calculates default start date (next Monday).
 */
function buildBriefEntryModal(leadResearcher, channelId) {
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

  return {
    ...researchBriefModal,
    blocks: modalBlocks,
    private_metadata: JSON.stringify({ channelId, source: 'qori_brief_command' }),
  };
}

module.exports = { buildBriefEntryModal };
