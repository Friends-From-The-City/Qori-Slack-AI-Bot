/**
 * Calculates per-person compensation from a study's budget and target.
 * Returns null if either input is missing or zero.
 */
function calculatePerPersonCompensation(study) {
  if (!study) return null;

  const budget = parseFloat(study.parsed_budget_amount);
  const target = parseInt(study.target_participants, 10);

  if (!budget || !target || target <= 0) return null;

  return Math.round((budget / target) * 100) / 100;
}

module.exports = { calculatePerPersonCompensation };
