/**
 * Cascade variable types for the Qori research pipeline.
 *
 * Every variable emitted by a YAML template and stored in the study_variables
 * table has a corresponding TypeScript interface here. Types are derived from
 * the schema files at backend/config/schemas/*.yaml and the emits blocks in
 * config/prompts/*.yaml.
 *
 * Variables are either "pool" (multiple rows per variable_key, one per item)
 * or "singleton" (one row containing the full value as JSONB). Pool variables
 * have an item_key; singletons have item_key = null.
 *
 * See docs/cascade-spec/ and ADR 0007 for the cascade contract system.
 */

// ---------------------------------------------------------------------------
// Shared enums and types
// ---------------------------------------------------------------------------

export type ConfidenceLevel = 'Strong' | 'Moderate' | 'Limited';

export type NielsenSeverity = 0 | 1 | 2 | 3 | 4;

export type PoolStrategy = 'append' | 'replace' | 'append_or_replace_per_participant';

// ---------------------------------------------------------------------------
// Discovery phase — desk research
// ---------------------------------------------------------------------------

/** Schema: discovered_barrier.yaml. Emitted by desk_research, survey_synthesis. Pool. */
export interface DiscoveredBarrier {
  id: string;
  title: string;
  summary: string;
  magnitude: string | null;
  evidence: string[] | null;
  affected_population: string | null;
  source_document: string;
  confidence: ConfidenceLevel | null;
}

/** Schema: discovered_metric.yaml. Emitted by desk_research, survey_synthesis. Pool. */
export interface DiscoveredMetric {
  id: string;
  metric_name: string;
  value: string;
  context: string | null;
  baseline_or_target: string | null;
  source_document: string;
}

/** Schema: discovered_journey.yaml. Emitted by desk_research, journey_mapping. Pool. */
export interface DiscoveredJourney {
  id: string;
  journey_name: string;
  success_pattern: string | null;
  failure_pattern: string | null;
  completion_rate: string | null;
  satisfaction: string | null;
  source_document: string;
}

/** Schema: methodology_recommendation.yaml. Emitted by desk_research. Pool. */
export interface MethodologyRecommendation {
  id: string;
  method: string;
  addresses: string;
  rationale: string;
  source_document: string;
}

/** Inline schema. Emitted by desk_research, survey_synthesis. Pool. */
export interface KnowledgeGap {
  id: string;
  gap: string;
  why_matters: string | null;
  suggested_resolution: string | null;
  source_document: string;
}

/** Inline schema. Emitted by desk_research. Pool. */
export interface SourceArtifact {
  title: string;
  source_org: string;
  date: string;
  type: string | null;
  contribution: string | null;
}

// ---------------------------------------------------------------------------
// Discovery phase — stakeholder synthesis
// ---------------------------------------------------------------------------

export type ConstraintType = 'Technical' | 'Policy' | 'Resource' | 'Organizational';

/** Schema: stakeholder_constraint.yaml. Emitted by stakeholder_synthesis. Pool (replace). */
export interface StakeholderConstraint {
  id: string;
  type: ConstraintType;
  constraint: string;
  impact: string;
  source: string;
  source_role: string | null;
  source_team: string | null;
  verbatim_quote: string | null;
  broader_pattern: string | null;
  research_implication: string | null;
  implementation_implication: string | null;
}

/** Schema: stakeholder_priority.yaml. Emitted by stakeholder_synthesis. Pool (replace). */
export interface StakeholderPriority {
  id: string;
  priority: string;
  stated_by: string[];
  aligns_with_user_need: 'Yes' | 'No' | 'Partial' | 'Unknown';
  driver: string | null;
  timeline: string | null;
  effort_estimate: string | null;
}

/** Schema: alignment_gap.yaml. Emitted by stakeholder_synthesis. Pool (replace). */
export interface AlignmentGap {
  id: string;
  gap_description: string;
  stated_position: string;
  actual_behavior: string;
  acknowledged_by: string | null;
  verbatim_quote: string | null;
  consequence: string | null;
  addressable_in_research: boolean | null;
}

/** Schema: stakeholder_question.yaml. Emitted by stakeholder_synthesis. Pool (replace). */
export interface StakeholderQuestion {
  id: string;
  priority: 'Blocking' | 'Important' | 'Validation';
  question: string;
  asked_by: string;
  stakeholder_insight: string | null;
  suggested_method: string | null;
}

/** Inline schema. Emitted by stakeholder_synthesis. Pool (replace). */
export interface BackstageObservation {
  id: string;
  title: string;
  pattern_type: 'working' | 'broken' | 'organizational' | 'resource';
  observation: string;
  verbatim_quote: string | null;
  flow_description: string | null;
  source: string;
}

/** Inline schema. Emitted by stakeholder_synthesis. Pool (replace). */
export interface SystemFailureMode {
  id: string;
  flow_name: string;
  where_it_breaks: string;
  consequence: string;
  source: string;
  verbatim_quote: string | null;
  mermaid_diagram: string | null;
}

// ---------------------------------------------------------------------------
// Discovery phase — survey synthesis
// ---------------------------------------------------------------------------

export interface SurveyQuoteAttribution {
  quote: string;
  respondent: string;
}

/** Schema: survey_theme.yaml. Emitted by survey_synthesis. Pool. */
export interface SurveyTheme {
  id: string;
  theme_name: string;
  frequency_count: number;
  frequency_percentage: number;
  sentiment: 'Negative' | 'Positive' | 'Mixed' | 'Neutral';
  priority: 'High' | 'Medium' | 'Low';
  pattern: string;
  verbatim_quotes: SurveyQuoteAttribution[] | null;
}

/** Schema: survey_finding.yaml. Emitted by survey_synthesis. Pool. */
export interface SurveyFinding {
  id: string;
  finding: string;
  metric_name: string | null;
  sample_size: number | null;
  affected_segment: string | null;
  supporting_quotes: string[] | null;
  source_question: string | null;
}

/** Schema: survey_recommendation.yaml. Emitted by survey_synthesis. Pool. */
export interface SurveyRecommendation {
  id: string;
  action: string;
  based_on_theme: string;
  priority: 'High' | 'Medium' | 'Low';
  suggested_owner: string | null;
}

/** Inline schema. Emitted by survey_synthesis. Singleton. */
export interface SampleDemographics {
  total_responses: number;
  composition: string;
  response_rate: string | null;
}

// ---------------------------------------------------------------------------
// Planning phase — research brief
// ---------------------------------------------------------------------------

/** Schema: research_question.yaml. Emitted by research_brief. Singleton (array). */
export interface ResearchQuestion {
  id: string;
  question: string;
  priority: 'Primary' | 'Secondary' | 'Exploratory' | null;
}

/**
 * Schema: target_barrier.yaml. Emitted by research_brief. Singleton (array).
 * Consumed by session_summary for validation. See ADR 0006.
 */
export interface TargetBarrier {
  id: string;
  barrier: string;
  source: string | null;
}

// ---------------------------------------------------------------------------
// Planning phase — research plan
// ---------------------------------------------------------------------------

/** Schema: study_timeline.yaml. Emitted by research_plan. Singleton (array). */
export interface StudyTimelinePhase {
  id: string;
  phase_name: string;
  duration: string;
  start_date: string | null;
  end_date: string | null;
  activities: string[] | null;
  deliverables: string[] | null;
  responsible_party: string | null;
}

/** Schema: study_risk.yaml. Emitted by research_plan. Singleton (array). */
export interface StudyRisk {
  id: string;
  risk: string;
  source_constraint: string | null;
  likelihood: 'High' | 'Medium' | 'Low' | null;
  impact: 'High' | 'Medium' | 'Low' | null;
  mitigation: string;
  contingency: string | null;
}

/** Schema: study_deliverable.yaml. Emitted by research_plan. Singleton (array). */
export interface StudyDeliverable {
  id: string;
  deliverable_name: string;
  format: string;
  due_date: string | null;
  audience: string | null;
  addresses_objective: string | null;
}

// ---------------------------------------------------------------------------
// Research execution — session summary (per-participant pools)
// ---------------------------------------------------------------------------

export type NuggetType =
  | 'task_success'
  | 'task_failure'
  | 'pain_point'
  | 'workaround'
  | 'quote'
  | 'positive'
  | 'surprise'
  | 'accessibility_issue'
  | 'behavioral_pattern'
  | 'mental_model';

/**
 * Schema: atomic_nugget_core.yaml. Emitted by session_summary.
 * Pool (append_or_replace_per_participant). Per-participant.
 *
 * This is the primary unit of qualitative data in the cascade. Each nugget
 * is a single atomic observation from a research session. Downstream templates
 * (affinity_mapping, persona_generator, etc.) consume nuggets to build
 * higher-order patterns.
 */
export interface AtomicNuggetCore {
  id: string;
  nugget_type: NuggetType;
  severity: NielsenSeverity;
  text: string;
  participant: string;
  session: string;
}

/**
 * Schema: atomic_nugget_detail.yaml. Emitted by session_summary.
 * Pool (append_or_replace_per_participant). Per-participant.
 * Linked to AtomicNuggetCore by id.
 */
export interface AtomicNuggetDetail {
  id: string;
  verbatim_quote: string | null;
  participant_context: string | null;
  task_context: string | null;
  timestamp: string | null;
  linked_barrier: string | null;
  linked_question: string | null;
  observed_behavior: string | null;
  inferred_meaning: string | null;
  emotional_state: string | null;
  confidence: ConfidenceLevel | null;
}

/**
 * Schema: participant_metadata.yaml. Emitted by session_summary.
 * Pool (append_or_replace_per_participant). Per-participant.
 */
export interface ParticipantMetadata {
  participant_id: string;
  background: string;
  tech_setup: string;
  accessibility: string | null;
  recruitment_source: string | null;
  consent_recording: boolean | null;
  app_usage: string | null;
  session_notes: string | null;
  key_contribution: string;
}

/**
 * Schema: task_completion_record.yaml. Emitted by session_summary.
 * Pool (append_or_replace_per_participant). Per-participant.
 */
export interface TaskCompletionRecord {
  id: string;
  participant: string;
  task_number: number;
  task_name: string;
  success: boolean;
  completion_time: string | null;
  attempts: number | null;
  workaround_used: boolean;
  notes: string;
  blockers: string[];
  linked_nuggets: string[];
}

/**
 * Schema: barrier_validation.yaml. Emitted by session_summary.
 * Pool (append_or_replace_per_participant). Per-participant.
 * References TargetBarrier.id via barrier_ref.
 */
export interface BarrierValidation {
  id: string;
  barrier_ref: string;
  participant: string;
  validated: boolean;
  evidence: string;
  verbatim_evidence: string | null;
  confidence: ConfidenceLevel;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Synthesis — affinity mapping
// ---------------------------------------------------------------------------

export type ThemeValidationStatus =
  | 'validates_barrier'
  | 'refutes_barrier'
  | 'unexpected_pattern';

/**
 * Schema: validated_theme.yaml. Emitted by affinity_mapping.
 * Singleton (array). Study-scoped.
 *
 * Themes are the primary synthesis output — cross-participant patterns
 * grounded in atomic nuggets. Consumed by most downstream templates.
 */
export interface ValidatedTheme {
  id: string;
  theme_name: string;
  summary: string;
  supporting_nuggets: string[];
  confidence: ConfidenceLevel;
  pattern_description: string | null;
  evidence_count: number;
  participants_observed: string[];
  participant_coverage: string | null;
  severity_distribution: Record<string, number> | null;
  representative_quote: string | null;
  representative_quote_source: string | null;
  linked_barriers: string[] | null;
  validation_status: ThemeValidationStatus | null;
  linked_questions: string[] | null;
  cross_cutting_dimensions: string[] | null;
  confidence_reasoning: string | null;
}

/** Schema: unexpected_pattern.yaml. Emitted by affinity_mapping. Singleton (array). */
export interface UnexpectedPattern {
  id: string;
  pattern: string;
  why_unexpected: string;
  supporting_nuggets: string[];
  significance: string | null;
}

// ---------------------------------------------------------------------------
// Synthesis — persona generator
// ---------------------------------------------------------------------------

export interface PersonaFrustration {
  frustration: string;
  evidence_nugget: string | null;
  verbatim_quote: string | null;
  severity: NielsenSeverity | null;
}

export interface PersonaBehavior {
  behavior: string;
  context: string;
  evidence_nugget: string | null;
}

/** Schema: persona.yaml. Emitted by persona_generator. Singleton (array). */
export interface Persona {
  id: string;
  persona_name: string;
  archetype: string;
  summary: string;
  based_on_participants: string[];
  confidence: ConfidenceLevel;
  representative_participant: string | null;
  demographics: {
    age_range: string | null;
    service_era: string | null;
    tech_comfort: string | null;
  } | null;
  context: {
    device_environment: string | null;
    assistive_technology: string | null;
    usage_frequency: string | null;
  } | null;
  goals: string[];
  frustrations: PersonaFrustration[];
  behaviors: PersonaBehavior[] | null;
  workarounds: string[] | null;
  needs: string[] | null;
  linked_themes: string[] | null;
  affected_by_barriers: string[] | null;
  representative_quote: string | null;
  representative_quote_source: string | null;
  confidence_reasoning: string | null;
}

// ---------------------------------------------------------------------------
// Readout schemas
// ---------------------------------------------------------------------------

/** Schema: prioritized_finding.yaml. Used in research readout templates. */
export interface PrioritizedFinding {
  id: string;
  finding: string;
  severity: NielsenSeverity | null;
  confidence: ConfidenceLevel;
  evidence_count: number;
  participants_affected: string[];
  linked_theme: string | null;
  recommendation: string | null;
}

/** Schema: prioritized_recommendation.yaml. Used in research readout templates. */
export interface PrioritizedRecommendation {
  id: string;
  recommendation: string;
  priority: 'High' | 'Medium' | 'Low';
  effort: string | null;
  impact: string | null;
  addresses_finding: string | null;
}

/** Schema: exec_summary_point.yaml. Used in executive readout. */
export interface ExecSummaryPoint {
  id: string;
  point: string;
  supporting_data: string | null;
}

/** Schema: decision_input.yaml. Used in decision readout. */
export interface DecisionInput {
  id: string;
  decision: string;
  options: string[] | null;
  recommendation: string | null;
  evidence: string | null;
}

// ---------------------------------------------------------------------------
// Ticket candidate schemas
// ---------------------------------------------------------------------------

/** Schema: accessibility_ticket_candidate.yaml */
export interface AccessibilityTicketCandidate {
  id: string;
  title: string;
  description: string;
  severity: NielsenSeverity;
  wcag_criteria: string | null;
  affected_users: string | null;
  linked_nuggets: string[];
}

/** Schema: design_ticket_candidate.yaml */
export interface DesignTicketCandidate {
  id: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  linked_theme: string | null;
  linked_nuggets: string[];
}

/** Schema: engineering_ticket_candidate.yaml */
export interface EngineeringTicketCandidate {
  id: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  linked_constraint: string | null;
  linked_nuggets: string[];
}

// ---------------------------------------------------------------------------
// Variable storage metadata
// ---------------------------------------------------------------------------

/**
 * Represents a row in the study_variables table. This is the storage format,
 * not the domain type — the `value` field contains one of the interfaces above
 * as JSONB.
 */
export interface StudyVariableRow {
  id: number;
  study_name: string;
  variable_key: string;
  variable_type: string | null;
  item_key: string | null;
  value: unknown;
  participant_id: string | null;
  source_template: string;
  source_version: string | null;
  source_date: Date | null;
  value_hash: string | null;
  entry_count: number | null;
  is_pool: boolean;
  confidence: string | null;
  scope: string | null;
  discovery_artifact_id: string | null;
  stale: boolean;
  extracted_at: Date;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// Variable key registry — maps variable_key strings to their value types
// ---------------------------------------------------------------------------

/**
 * Maps each cascade variable_key to its TypeScript type.
 * Pool variables map to their item type (each row's value is one item).
 * Singleton variables map to their full value type (one row contains the whole value).
 */
export interface CascadeVariableMap {
  // Discovery — desk research
  discovered_barriers: DiscoveredBarrier;
  discovered_metrics: DiscoveredMetric;
  discovered_journeys: DiscoveredJourney;
  methodology_recommendations: MethodologyRecommendation;
  knowledge_gaps: KnowledgeGap;
  source_artifacts: SourceArtifact;

  // Discovery — stakeholder synthesis
  stakeholder_constraints: StakeholderConstraint;
  stakeholder_priorities: StakeholderPriority;
  alignment_gaps: AlignmentGap;
  stakeholder_questions_for_users: StakeholderQuestion;
  backstage_observations: BackstageObservation;
  system_failure_modes: SystemFailureMode;

  // Discovery — survey synthesis
  survey_themes: SurveyTheme;
  survey_findings: SurveyFinding;
  survey_recommendations: SurveyRecommendation;
  sample_demographics: SampleDemographics;

  // Planning — research brief
  research_objectives: string[];
  research_questions: ResearchQuestion[];
  target_barriers: TargetBarrier[];
  methodology_selection: string;
  participant_criteria: string;
  out_of_scope: string[];
  business_context: string;
  timeline_preference: string;
  start_date: string;
  decision_deadline: string;
  budget: string;
  participant_approach: string;

  // Planning — research plan
  study_timeline: StudyTimelinePhase[];
  risks: StudyRisk[];
  deliverables: StudyDeliverable[];

  // Research execution — session summary (per-participant)
  atomic_nugget_core: AtomicNuggetCore;
  atomic_nugget_detail: AtomicNuggetDetail;
  participant_metadata: ParticipantMetadata;
  task_completion_records: TaskCompletionRecord;
  barrier_validations: BarrierValidation;

  // Synthesis
  validated_themes: ValidatedTheme[];
  unexpected_patterns: UnexpectedPattern[];
  personas: Persona[];
}

/** All valid cascade variable keys. */
export type CascadeVariableKey = keyof CascadeVariableMap;
