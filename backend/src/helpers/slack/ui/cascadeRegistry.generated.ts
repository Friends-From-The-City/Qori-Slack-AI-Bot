// AUTO-GENERATED FILE — do not edit manually
// Source: config/prompts/*.yaml consumes: blocks
// Run: npm run build:cascade
//
// NOTE: This tracks YAML-declared consumption only. Some variables are consumed
// by handler code directly (e.g., briefHandler.ts for discovery variables).
// To find ALL consumers of a variable, also grep handler code for the key.
// See ADR 0021 for details.

export interface ConsumeSpec {
  key: string;
  required: boolean;
  label: string;
  source_hint: string;
}

/**
 * Consumes specifications per template, generated from YAML consumes: blocks.
 * Used by cascade readiness checks in modals.
 */
export const TEMPLATE_CONSUMES: Record<string, ConsumeSpec[]> = {
  accessibility_readout: [
    { key: 'prioritized_findings', required: true, label: 'Prioritized Findings', source_hint: 'Run research readout first' },
    { key: 'atomic_nugget_core', required: false, label: 'Atomic Nugget Core', source_hint: 'Run session summaries first' },
    { key: 'atomic_nugget_detail', required: false, label: 'Atomic Nugget Detail', source_hint: 'Run session summaries first' },
    { key: 'personas', required: false, label: 'Personas', source_hint: 'Run persona generation first' },
    { key: 'target_barriers', required: false, label: 'Target Barriers', source_hint: 'Create research brief first' },
  ],
  affinity_mapping: [
    { key: 'atomic_nugget_core', required: true, label: 'Atomic Nugget Core', source_hint: 'Run session summaries first' },
    { key: 'atomic_nugget_detail', required: true, label: 'Atomic Nugget Detail', source_hint: 'Run session summaries first' },
    { key: 'target_barriers', required: false, label: 'Target Barriers', source_hint: 'Create research brief first' },
    { key: 'research_questions', required: false, label: 'Research Questions', source_hint: 'Create research brief first' },
    { key: 'participant_metadata', required: false, label: 'Participant Metadata', source_hint: 'Run session summaries first' },
  ],
  design_opportunities: [
    { key: 'atomic_nugget_core', required: true, label: 'Atomic Nugget Core', source_hint: 'Run session summaries first' },
    { key: 'atomic_nugget_detail', required: true, label: 'Atomic Nugget Detail', source_hint: 'Run session summaries first' },
    { key: 'validated_themes', required: false, label: 'Validated Themes', source_hint: 'Run affinity mapping first' },
    { key: 'personas', required: false, label: 'Personas', source_hint: 'Run persona generation first' },
    { key: 'stakeholder_constraints', required: false, label: 'Stakeholder Constraints', source_hint: 'Run stakeholder synthesis first' },
    { key: 'validated_jobs', required: false, label: 'Validated Jobs', source_hint: 'Run jobs-to-be-done first' },
    { key: 'target_barriers', required: false, label: 'Target Barriers', source_hint: 'Create research brief first' },
    { key: 'research_questions', required: false, label: 'Research Questions', source_hint: 'Create research brief first' },
  ],
  designer_readout: [
    { key: 'prioritized_findings', required: true, label: 'Prioritized Findings', source_hint: 'Run research readout first' },
    { key: 'prioritized_recommendations', required: true, label: 'Prioritized Recommendations', source_hint: 'Run research readout first' },
    { key: 'personas', required: false, label: 'Personas', source_hint: 'Run persona generation first' },
    { key: 'journey_stages', required: false, label: 'Journey Stages', source_hint: 'Complete journey mapping first' },
    { key: 'validated_themes', required: false, label: 'Validated Themes', source_hint: 'Run affinity mapping first' },
    { key: 'target_barriers', required: false, label: 'Target Barriers', source_hint: 'Create research brief first' },
  ],
  discussion_guide: [
    { key: 'research_objectives', required: true, label: 'Research Objectives', source_hint: 'Create research brief first' },
    { key: 'research_questions', required: true, label: 'Research Questions', source_hint: 'Create research brief first' },
    { key: 'methodology_selection', required: true, label: 'Methodology Selection', source_hint: 'Create research brief first' },
    { key: 'target_barriers', required: true, label: 'Target Barriers', source_hint: 'Create research brief first' },
    { key: 'participant_criteria', required: false, label: 'Participant Criteria', source_hint: 'Create research brief first' },
  ],
  engineering_readout: [
    { key: 'prioritized_findings', required: true, label: 'Prioritized Findings', source_hint: 'Run research readout first' },
    { key: 'prioritized_recommendations', required: true, label: 'Prioritized Recommendations', source_hint: 'Run research readout first' },
    { key: 'stakeholder_constraints', required: false, label: 'Stakeholder Constraints', source_hint: 'Run stakeholder synthesis first' },
    { key: 'personas', required: false, label: 'Personas', source_hint: 'Run persona generation first' },
    { key: 'target_barriers', required: false, label: 'Target Barriers', source_hint: 'Create research brief first' },
    { key: 'methodology_selection', required: false, label: 'Methodology Selection', source_hint: 'Create research brief first' },
  ],
  jobs_to_be_done: [
    { key: 'atomic_nugget_core', required: true, label: 'Atomic Nugget Core', source_hint: 'Run session summaries first' },
    { key: 'atomic_nugget_detail', required: true, label: 'Atomic Nugget Detail', source_hint: 'Run session summaries first' },
    { key: 'validated_themes', required: false, label: 'Validated Themes', source_hint: 'Run affinity mapping first' },
    { key: 'target_barriers', required: false, label: 'Target Barriers', source_hint: 'Create research brief first' },
    { key: 'research_questions', required: false, label: 'Research Questions', source_hint: 'Create research brief first' },
  ],
  journey_mapping: [
    { key: 'atomic_nugget_core', required: true, label: 'Atomic Nugget Core', source_hint: 'Run session summaries first' },
    { key: 'atomic_nugget_detail', required: true, label: 'Atomic Nugget Detail', source_hint: 'Run session summaries first' },
    { key: 'validated_themes', required: false, label: 'Validated Themes', source_hint: 'Run affinity mapping first' },
    { key: 'personas', required: false, label: 'Personas', source_hint: 'Run persona generation first' },
    { key: 'target_barriers', required: false, label: 'Target Barriers', source_hint: 'Create research brief first' },
    { key: 'research_questions', required: false, label: 'Research Questions', source_hint: 'Create research brief first' },
  ],
  leadership_readout: [
    { key: 'prioritized_findings', required: true, label: 'Prioritized Findings', source_hint: 'Run research readout first' },
    { key: 'prioritized_recommendations', required: true, label: 'Prioritized Recommendations', source_hint: 'Run research readout first' },
    { key: 'decision_inputs', required: false, label: 'Decision Inputs', source_hint: 'Run research readout first' },
    { key: 'business_context', required: false, label: 'Business Context', source_hint: 'Create research brief first' },
    { key: 'methodology_selection', required: false, label: 'Methodology Selection', source_hint: 'Create research brief first' },
  ],
  persona_generation: [
    { key: 'atomic_nugget_core', required: true, label: 'Atomic Nugget Core', source_hint: 'Run session summaries first' },
    { key: 'atomic_nugget_detail', required: true, label: 'Atomic Nugget Detail', source_hint: 'Run session summaries first' },
    { key: 'validated_themes', required: false, label: 'Validated Themes', source_hint: 'Run affinity mapping first' },
    { key: 'participant_metadata', required: true, label: 'Participant Metadata', source_hint: 'Run session summaries first' },
    { key: 'target_barriers', required: false, label: 'Target Barriers', source_hint: 'Create research brief first' },
    { key: 'research_questions', required: false, label: 'Research Questions', source_hint: 'Create research brief first' },
  ],
  research_plan: [
    { key: 'research_objectives', required: true, label: 'Research Objectives', source_hint: 'Create research brief first' },
    { key: 'research_questions', required: true, label: 'Research Questions', source_hint: 'Create research brief first' },
    { key: 'methodology_selection', required: true, label: 'Methodology Selection', source_hint: 'Create research brief first' },
    { key: 'target_barriers', required: true, label: 'Target Barriers', source_hint: 'Create research brief first' },
    { key: 'participant_criteria', required: true, label: 'Participant Criteria', source_hint: 'Create research brief first' },
    { key: 'participant_approach', required: false, label: 'Participant Approach', source_hint: 'Create research brief first' },
    { key: 'business_context', required: false, label: 'Business Context', source_hint: 'Create research brief first' },
    { key: 'out_of_scope', required: false, label: 'Out Of Scope', source_hint: 'Create research brief first' },
    { key: 'timeline_preference', required: false, label: 'Timeline Preference', source_hint: 'Create research brief first' },
    { key: 'start_date', required: false, label: 'Start Date', source_hint: 'Create research brief first' },
    { key: 'decision_deadline', required: false, label: 'Decision Deadline', source_hint: 'Create research brief first' },
    { key: 'budget', required: false, label: 'Budget', source_hint: 'Create research brief first' },
  ],
  research_readout: [
    { key: 'research_objectives', required: false, label: 'Research Objectives', source_hint: 'Create research brief first' },
    { key: 'research_questions', required: false, label: 'Research Questions', source_hint: 'Create research brief first' },
    { key: 'target_barriers', required: false, label: 'Target Barriers', source_hint: 'Create research brief first' },
    { key: 'business_context', required: false, label: 'Business Context', source_hint: 'Create research brief first' },
    { key: 'atomic_nugget_core', required: true, label: 'Atomic Nugget Core', source_hint: 'Run session summaries first' },
    { key: 'atomic_nugget_detail', required: true, label: 'Atomic Nugget Detail', source_hint: 'Run session summaries first' },
    { key: 'participant_metadata', required: true, label: 'Participant Metadata', source_hint: 'Run session summaries first' },
    { key: 'task_completion_records', required: false, label: 'Task Completion Records', source_hint: 'Run session summaries first' },
    { key: 'barrier_validations', required: false, label: 'Barrier Validations', source_hint: 'Run session summaries first' },
    { key: 'validated_themes', required: false, label: 'Validated Themes', source_hint: 'Run affinity mapping first' },
    { key: 'prioritized_issues', required: false, label: 'Prioritized Issues', source_hint: 'Complete usability issues first' },
    { key: 'personas', required: false, label: 'Personas', source_hint: 'Run persona generation first' },
    { key: 'persona_design_implications', required: false, label: 'Persona Design Implications', source_hint: 'Run persona generation first' },
    { key: 'journey_stages', required: false, label: 'Journey Stages', source_hint: 'Complete journey mapping first' },
    { key: 'stakeholder_constraints', required: false, label: 'Stakeholder Constraints', source_hint: 'Run stakeholder synthesis first' },
    { key: 'alignment_gaps', required: false, label: 'Alignment Gaps', source_hint: 'Run stakeholder synthesis first' },
  ],
  service_blueprint: [
    { key: 'atomic_nugget_core', required: true, label: 'Atomic Nugget Core', source_hint: 'Run session summaries first' },
    { key: 'atomic_nugget_detail', required: true, label: 'Atomic Nugget Detail', source_hint: 'Run session summaries first' },
    { key: 'backstage_observations', required: false, label: 'Backstage Observations', source_hint: 'Run stakeholder synthesis first' },
    { key: 'system_failure_modes', required: false, label: 'System Failure Modes', source_hint: 'Run stakeholder synthesis first' },
    { key: 'stakeholder_constraints', required: false, label: 'Stakeholder Constraints', source_hint: 'Run stakeholder synthesis first' },
  ],
  session_summary: [
    { key: 'target_barriers', required: false, label: 'Target Barriers', source_hint: 'Create research brief first' },
    { key: 'research_questions', required: false, label: 'Research Questions', source_hint: 'Create research brief first' },
    { key: 'methodology_selection', required: false, label: 'Methodology Selection', source_hint: 'Create research brief first' },
  ],
  stakeholder_synthesis: [
    { key: 'discovered_barriers', required: false, label: 'Discovered Barriers', source_hint: 'Run /qori-discover (desk research) first' },
    { key: 'knowledge_gaps', required: false, label: 'Knowledge Gaps', source_hint: 'Run /qori-discover (desk research) first' },
  ],
  usability_issues: [
    { key: 'atomic_nugget_core', required: true, label: 'Atomic Nugget Core', source_hint: 'Run session summaries first' },
    { key: 'atomic_nugget_detail', required: true, label: 'Atomic Nugget Detail', source_hint: 'Run session summaries first' },
    { key: 'validated_themes', required: false, label: 'Validated Themes', source_hint: 'Run affinity mapping first' },
    { key: 'target_barriers', required: false, label: 'Target Barriers', source_hint: 'Create research brief first' },
    { key: 'research_questions', required: false, label: 'Research Questions', source_hint: 'Create research brief first' },
  ],
};

/**
 * Emits specifications per template, generated from YAML emits: blocks.
 * Used for cascade dependency tracking.
 */
export const TEMPLATE_EMITS: Record<string, string[]> = {
  accessibility_readout: ['accessibility_ticket_candidates'],
  affinity_mapping: ['validated_themes', 'unexpected_patterns'],
  design_opportunities: ['design_hmw_opportunities'],
  designer_readout: ['design_ticket_candidates'],
  desk_research: ['discovered_barriers', 'discovered_metrics', 'discovered_journeys', 'methodology_recommendations', 'knowledge_gaps', 'source_artifacts'],
  discussion_guide: ['task_scenarios', 'probes'],
  engineering_readout: ['engineering_ticket_candidates'],
  jobs_to_be_done: ['validated_jobs'],
  journey_mapping: ['journey_stages', 'journey_pain_points'],
  leadership_readout: ['exec_summary_points'],
  persona_generation: ['personas', 'persona_design_implications'],
  research_brief: ['research_objectives', 'research_questions', 'target_barriers', 'methodology_selection', 'participant_criteria', 'out_of_scope', 'business_context', 'timeline_preference', 'start_date', 'decision_deadline', 'budget', 'participant_approach', 'recruitment_sources'],
  research_plan: ['study_timeline', 'risks', 'deliverables'],
  research_readout: ['prioritized_findings', 'prioritized_recommendations', 'decision_inputs', 'study_methodology'],
  session_summary: ['atomic_nugget_core', 'atomic_nugget_detail', 'participant_metadata', 'task_completion_records', 'barrier_validations'],
  stakeholder_synthesis: ['stakeholder_constraints', 'stakeholder_priorities', 'alignment_gaps', 'stakeholder_questions_for_users', 'backstage_observations', 'system_failure_modes'],
  survey_synthesis: ['survey_themes', 'survey_findings', 'discovered_barriers', 'discovered_metrics', 'sample_demographics', 'knowledge_gaps'],
  usability_issues: ['prioritized_issues'],
};
