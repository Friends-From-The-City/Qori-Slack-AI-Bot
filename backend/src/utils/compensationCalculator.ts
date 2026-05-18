import type { ResearchStudyAttributes } from '../types/models';

type CompensationInput = Pick<ResearchStudyAttributes, 'parsed_budget_amount' | 'target_participants'>;

/**
 * Calculates per-person compensation from a study's budget and target.
 * Returns null if either input is missing or zero.
 */
export function calculatePerPersonCompensation(study: CompensationInput | null | undefined): number | null {
  if (!study) return null;

  const budget = study.parsed_budget_amount;
  const target = study.target_participants;

  if (!budget || !target || target <= 0) return null;

  return Math.round((budget / target) * 100) / 100;
}
