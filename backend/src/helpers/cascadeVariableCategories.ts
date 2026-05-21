/**
 * cascadeVariableCategories.ts — Human-readable labels for cascade variable keys.
 *
 * Source of truth for how variable keys display in researcher-facing UI
 * (discovery hub artifact list, cascade summary sections, etc.).
 * When new templates emit new variables, add the mapping here.
 */

/** Map variable key → short human-readable category label. */
export const VARIABLE_CATEGORIES: Record<string, string> = {
  // Desk research emits
  discovered_barriers: 'barriers',
  discovered_metrics: 'metrics',
  discovered_journeys: 'journeys',
  methodology_recommendations: 'method recs',
  knowledge_gaps: 'gaps',
  source_artifacts: 'sources',

  // Stakeholder synthesis emits
  stakeholder_constraints: 'constraints',
  stakeholder_priorities: 'priorities',
  alignment_gaps: 'alignment gaps',
  stakeholder_questions_for_users: 'user questions',
  backstage_observations: 'backstage',
  system_failure_modes: 'failure modes',

  // Survey synthesis emits
  survey_themes: 'themes',
  survey_findings: 'findings',
  sample_demographics: 'demographics',

  // Brief emits (for downstream visibility)
  research_objectives: 'objectives',
  research_questions: 'questions',
  target_barriers: 'barriers',
  methodology_selection: 'methodology',
  participant_criteria: 'participants',
  participant_approach: 'approach',
  business_context: 'context',
  out_of_scope: 'scope boundaries',
  timeline_preference: 'timeline',
  start_date: 'start date',
  decision_deadline: 'deadline',
  budget: 'budget',
  recruitment_sources: 'recruitment',
};

/**
 * Convert a list of variable keys to a comma-separated human-readable summary.
 * Unknown keys are omitted (internal/system variables shouldn't show to researchers).
 */
export function formatVariableCategories(keys: string[]): string {
  const labels = keys
    .map(key => VARIABLE_CATEGORIES[key])
    .filter(Boolean);
  return labels.length > 0 ? labels.join(', ') : '';
}
