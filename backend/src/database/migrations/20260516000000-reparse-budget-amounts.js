'use strict';

/**
 * One-time data cleanup: re-parse every study's budget through the fixed
 * parseBudget() function. Fixes corrupted parsed_budget_amount values
 * caused by the comma-as-decimal bug (e.g., "$1,000" was stored as 1).
 *
 * Data source: study_variables table (variable_key = 'budget') holds the
 * free-text budget string extracted from each brief. We re-parse these
 * and update the corresponding research_studies.parsed_budget_amount.
 */

// Inline the fixed parser so the migration is self-contained
// (doesn't break if budgetParser.js changes later)
function parseBudget(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const trimmed = rawText.trim();
  if (trimmed === '') return null;
  if (/-|–|\bto\b|\bbetween\b/i.test(trimmed)) return null;
  if (/\b(around|approximately|approx|roughly|about|tbd|pending)\b/i.test(trimmed)) return null;
  if (/\+/.test(trimmed)) return null;
  const normalized = trimmed.replace(/(\d),(\d{3})/g, '$1$2');
  const match = normalized.match(/\$?(\d{1,7}(?:\.\d{1,2})?)/);
  if (!match) return null;
  const amount = parseFloat(match[1]);
  if (Number.isNaN(amount) || amount <= 0) return null;
  return amount;
}

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Read budget strings from study_variables
      const [budgetVars] = await queryInterface.sequelize.query(
        `SELECT sv.study_name, sv.value
         FROM study_variables sv
         WHERE sv.variable_key = 'budget' AND sv.scope = 'study'`,
        { transaction }
      );

      // Read current parsed_budget_amount from research_studies
      const [studies] = await queryInterface.sequelize.query(
        `SELECT name, parsed_budget_amount FROM research_studies`,
        { transaction }
      );
      const currentByName = {};
      for (const s of studies) {
        currentByName[s.name] = s.parsed_budget_amount;
      }

      let changed = 0;
      let skipped = 0;
      const changes = [];

      for (const row of budgetVars) {
        // study_variables.value is JSONB — may be a string directly or wrapped
        let budgetText = row.value;
        if (typeof budgetText === 'object' && budgetText !== null) {
          // Handle case where value is stored as a JSON string value
          budgetText = typeof budgetText === 'string' ? budgetText : JSON.stringify(budgetText);
        }
        if (typeof budgetText !== 'string') {
          skipped++;
          continue;
        }

        const newAmount = parseBudget(budgetText);
        const oldAmount = currentByName[row.study_name];
        const oldNum = oldAmount !== null && oldAmount !== undefined ? parseFloat(oldAmount) : null;

        // Only update if the value actually changed
        if (newAmount !== oldNum) {
          await queryInterface.sequelize.query(
            `UPDATE research_studies SET parsed_budget_amount = :amount, updated_at = NOW()
             WHERE name = :name`,
            { replacements: { amount: newAmount, name: row.study_name }, transaction }
          );
          changes.push({ study: row.study_name, raw: budgetText, old: oldNum, new: newAmount });
          changed++;
        } else {
          skipped++;
        }
      }

      await transaction.commit();

      console.log(`\n  [migrate] Re-parsed budget amounts: ${changed} changed, ${skipped} unchanged`);
      for (const c of changes) {
        console.log(`    ${c.study}: "${c.raw}" → old=${c.old}, new=${c.new}`);
      }
      console.log('');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down() {
    // Non-reversible data migration — old corrupted values are not worth restoring.
    // If needed, the original budget text remains in study_variables.
    console.log('\n  [migrate] Budget re-parse is non-reversible (original text preserved in study_variables)\n');
  },
};
