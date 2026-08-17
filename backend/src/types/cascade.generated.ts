// AUTO-GENERATED FILE — do not edit manually
// Source: backend/config/schemas/*.yaml
// Run: npm run build:cascade

// ---------------------------------------------------------------------------
// Generated interfaces from YAML schemas
// ---------------------------------------------------------------------------

/** Generated from accessibility_ticket_candidate.yaml */
export interface AccessibilityTicketCandidate {
  /** Format: a11y-ticket-001, a11y-ticket-002, etc. */
  id: string;
  /** Compliance-focused ticket title (e.g., 'Fix VoiceOver focus management on tab navigation') */
  title: string;
  /** Accessibility issue and required compliance action */
  description: string;
  /** WCAG 2.2 success criterion violated (e.g., '2.4.3 Focus Order'). Null if unknown. */
  wcag_criterion: string;
  /** Federal Section 508 compliance impact if applicable */
  section_508_implication: string | null;
  /** Finding IDs from research_readout (finding-XX) */
  addresses_findings: string[] | null;
  /** AT user types affected (screen reader, voice control, large text, etc.) */
  affected_at_users: string[] | null;
  /** Persona IDs with assistive_technology context */
  affected_personas: string[] | null;
  /** Nugget IDs with accessibility_issue type that document this issue */
  evidence_nuggets: string[] | null;
  /** How to verify fix (specific AT setups: NVDA, JAWS, VoiceOver, etc.) */
  recommended_testing: string[] | null;
  /** P0_legal for compliance violations, P0_severe for blocking AT users */
  priority: 'P0_legal' | 'P0_severe' | 'P1' | 'P2' | 'P3';
  effort: 'High' | 'Medium' | 'Low' | null;
  /** If linked to legal/compliance timeline from upstream data */
  compliance_deadline: string | null;
  /** Could fixing this break something else for AT users? */
  regression_risk: string | null;
  /** Why this priority level (P0_severe vs P0_legal vs P1) */
  compliance_priority_rationale: string | null;
  /** Engineering ticket IDs implementing the technical fix */
  related_engineering_tickets: string[] | null;
}

/** Generated from alignment_gap.yaml */
export interface AlignmentGap {
  /** gap-001, gap-002, etc. */
  id: string | null;
  /** Short description — 'Accessibility stated P1 but sprint-deprioritized' */
  gap_description: string | null;
  /** What stakeholders say — 'All stakeholders rate accessibility P1' */
  stated_position: string | null;
  /** What actually happens — 'when push comes to shove, accessibility fixes get bumped' */
  actual_behavior: string | null;
  /** SH-XXX who acknowledged the gap */
  acknowledged_by: string | null;
  /** Direct quote revealing the gap */
  verbatim_quote: string | null;
  /** What this gap produces — '9-month-old open issue on tab bar accessibility' */
  consequence: string | null;
  /** Whether user research can help close this gap */
  addressable_in_research: boolean | null;
}

/** Generated from atomic_nugget.yaml */
export interface AtomicNugget {
  /** Unique nugget ID, e.g. nugget-PT-001-001 */
  id: string | null;
  /** Observation type classification */
  nugget_type: 'task_success' | 'task_failure' | 'pain_point' | 'workaround' | 'quote' | 'positive' | 'surprise' | 'accessibility_issue' | 'behavioral_pattern' | 'mental_model' | null;
  /** Nielsen severity scale (0=cosmetic, 4=catastrophic) */
  severity: number | null;
  /** The observation text */
  text: string | null;
  /** Direct participant quote if observation includes one — copy exactly, do not paraphrase */
  verbatim_quote: string | null;
  /** Participant ID */
  participant: string | null;
  /** Role or demographic context relevant to this specific nugget */
  participant_context: string | null;
  /** Session identifier */
  session: string | null;
  /** HH:MM:SS timestamp if available from transcript */
  timestamp: string | null;
  /** Which task scenario this observation occurred in, if applicable */
  task_context: string | null;
  /** Reference to target_barriers key, if this nugget validates/refutes a barrier */
  linked_barrier: string | null;
  /** Reference to research_questions key, if this nugget addresses a question */
  linked_question: string | null;
  /** What the participant physically DID (actions, navigation, gestures) — distinct from what they said */
  observed_behavior: string | null;
  /** What the researcher infers from the behavior — interpretation, not observation */
  inferred_meaning: string | null;
  /** Participant emotional state during observation (frustrated, confused, satisfied, etc.) */
  emotional_state: string | null;
  /** Evidence confidence for this nugget */
  confidence: 'Strong' | 'Moderate' | 'Limited' | null;
}

/** Generated from atomic_nugget_core.yaml */
export interface AtomicNuggetCore {
  /** Unique nugget ID, e.g. nugget-PT-001-001 */
  id: string;
  /** Observation type classification */
  nugget_type: 'task_success' | 'task_failure' | 'pain_point' | 'workaround' | 'quote' | 'positive' | 'surprise' | 'accessibility_issue' | 'behavioral_pattern' | 'mental_model';
  /** Nielsen severity scale (0=cosmetic, 4=catastrophic) */
  severity: number;
  /** Concise observation text */
  text: string;
  /** Participant ID */
  participant: string;
  /** Session identifier */
  session: string;
}

/** Generated from atomic_nugget_detail.yaml */
export interface AtomicNuggetDetail {
  /** Links to atomic_nugget_core.id — must match exactly */
  id: string;
  /** Participant ID — required for per-participant pool merge isolation */
  participant: string;
  /** Direct participant quote — copy exactly, do not paraphrase */
  verbatim_quote: string | null;
  /** Role or demographic context relevant to this specific nugget */
  participant_context: string | null;
  /** Which task scenario this occurred in, if applicable */
  task_context: string | null;
  /** HH:MM:SS if available from transcript */
  timestamp: string | null;
  /** Reference to target_barriers ID (e.g. TB-001) */
  linked_barrier: string | null;
  /** Reference to research_questions ID (e.g. RQ-001) */
  linked_question: string | null;
  /** What the participant physically DID (actions, navigation, gestures) */
  observed_behavior: string | null;
  /** What the researcher infers from the behavior */
  inferred_meaning: string | null;
  /** frustrated, confused, satisfied, surprised, etc. */
  emotional_state: string | null;
  /** Evidence confidence for this nugget */
  confidence: 'Strong' | 'Moderate' | 'Limited' | null;
}

/** Generated from barrier_validation.yaml */
export interface BarrierValidation {
  /** Unique validation ID, e.g. bv-PT-001-TB-001 */
  id: string | null;
  /** Reference to the target_barriers ID this validates (e.g. TB-001, TB-002) */
  barrier_ref: string | null;
  participant: string | null;
  /** true if barrier was confirmed, false if refuted */
  validated: boolean | null;
  /** What the participant did or said that validates/refutes this barrier */
  evidence: string | null;
  /** Direct participant quote supporting the validation — copy exactly */
  verbatim_evidence: string | null;
  /** Confidence in this validation judgment */
  confidence: 'Strong' | 'Moderate' | 'Limited' | null;
  /** Additional context or nuance about how this barrier manifested */
  notes: string | null;
}

/** Generated from decision_input.yaml */
export interface DecisionInput {
  /** Format: decision-01, decision-02, etc. */
  id: string;
  /** The decision the brief was meant to inform */
  decision_question: string;
  /** What the evidence supports */
  recommended_path: string;
  /** Brief summary of supporting evidence */
  evidence_summary: string | null;
  /** Finding IDs (finding-XX) supporting this recommendation */
  supporting_findings: string[] | null;
  /** Unresolved questions that may affect this decision */
  open_questions: string[] | null;
  /** Limitations or conditions on the recommendation */
  caveats: string[] | null;
}

/** Generated from design_hmw_opportunity.yaml */
export interface DesignHmwOpportunity {
  /** Format: hmw-01, hmw-02, etc. */
  id: string;
  /** Short descriptive name for the opportunity */
  hmw_title: string;
  /** Full HMW: 'How might we [verb] for [user] when [situation] so that [outcome]?' */
  hmw_statement: string;
  /** 1-2 sentence problem statement grounded in research quote */
  source_problem: string;
  /** References to atomic_nugget_core.id values */
  evidence_nuggets: string[];
  /** Evidence quality assessment */
  confidence: 'Strong' | 'Moderate' | 'Limited';
  /** PT-XXX IDs whose data supports this opportunity */
  participants_affected: string[] | null;
  /** X of Y participants format, e.g. '3 of 6' */
  participant_coverage: string | null;
  /** User impact if problem remains unsolved */
  impact: 'High' | 'Medium' | 'Low' | null;
  /** Implementation effort estimate */
  effort: 'High' | 'Medium' | 'Low' | null;
  /** General approach — NOT a specific solution */
  design_direction: string | null;
  /** Measurable outcome (e.g., 'finds feature in under 2 taps') */
  success_metric: string | null;
  /** validated_theme.id references */
  linked_themes: string[] | null;
  /** validated_job.id references if opportunity addresses a job */
  linked_jobs: string[] | null;
  /** target_barrier IDs (TB-XXX) */
  linked_barriers: string[] | null;
}

/** Generated from design_ticket_candidate.yaml */
export interface DesignTicketCandidate {
  /** Format: design-ticket-001, design-ticket-002, etc. */
  id: string;
  /** Design-focused ticket title (e.g., 'Redesign appointment scheduling navigation pattern') */
  title: string;
  /** What needs to be designed and why, in design language */
  description: string;
  /** Finding IDs from research_readout (finding-XX) */
  addresses_findings: string[];
  /** Persona IDs this design serves */
  affected_personas: string[] | null;
  /** Journey stage IDs this design intervenes in */
  affected_journey_stages: string[] | null;
  /** Design-specific success criteria */
  acceptance_criteria: string[] | null;
  /** Deliverables: mockups, prototypes, design specs, design system updates, etc. */
  design_artifacts_needed: string[] | null;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  effort: 'High' | 'Medium' | 'Low';
  /** Design hours estimate if grounded in upstream data */
  effort_estimate_design: string | null;
  /** Other teams/roles that need to be involved */
  collaboration_needed: string[] | null;
  /** Other ticket IDs that must complete first */
  blocked_by: string[] | null;
  /** What the current design looks like — context for the redesign */
  current_design_state: string | null;
  /** Specific screens or flows impacted (from journey_stages or research) */
  affected_screens: string[] | null;
  /** Engineering ticket IDs for coordinated implementation */
  related_engineering_tickets: string[] | null;
}

/** Generated from discovered_barrier.yaml */
export interface DiscoveredBarrier {
  /** barrier-001, barrier-002, etc. */
  id: string | null;
  /** Short descriptive title for the barrier */
  title: string | null;
  /** 1-2 sentence description of the barrier */
  summary: string | null;
  /** Research-method categories this barrier falls under. Array because barriers
are multi-dimensional (e.g., screen-reader navigation is BOTH ia AND accessibility).
Categories:
- ia: Information architecture, navigation, findability, mental models, labeling
- accessibility: Assistive technology, WCAG compliance, screen readers, motor/vision
- performance: Speed, latency, load times, system responsiveness
- content: Readability, comprehension, terminology, tone, information quality
- task-flow: Task completion, workflow steps, error recovery, form design
- cognitive: Mental load, decision complexity, memory demands, learning curve
- other: Escape hatch when no category genuinely applies (surfaces for manual review)
 */
  barrier_categories: 'ia' | 'accessibility' | 'performance' | 'content' | 'task-flow' | 'cognitive' | 'other'[] | null;
  /** Scope or severity — '30% QoQ increase' or '45% abandonment' */
  magnitude: string | null;
  /** Supporting metrics or verbatim quotes from source */
  evidence: string[] | null;
  /** Who is affected — '2.1M monthly users' or 'AT users (12% of sessions)' */
  affected_population: string | null;
  /** Name of the source document where this was found */
  source_document: string | null;
  confidence: 'Strong' | 'Moderate' | 'Limited' | null;
}

/** Generated from discovered_journey.yaml */
export interface DiscoveredJourney {
  /** journey-001, journey-002, etc. */
  id: string | null;
  /** Name of the task flow — 'Prescription refill' */
  journey_name: string | null;
  /** What works — 'Direct, shallow navigation works' */
  success_pattern: string | null;
  /** What breaks — 'Multi-level navigation drops users' */
  failure_pattern: string | null;
  /** Task completion rate — '92%' */
  completion_rate: string | null;
  /** Satisfaction score — '8.1/10' */
  satisfaction: string | null;
  /** Name of the source document */
  source_document: string | null;
}

/** Generated from discovered_metric.yaml */
export interface DiscoveredMetric {
  /** metric-001, metric-002, etc. */
  id: string | null;
  /** Name of the metric — 'Task abandonment rate' */
  metric_name: string | null;
  /** The measurement — '45%' or '2.1M' */
  value: string | null;
  /** What the metric means — 'Overall, with appointments at 52% and benefits at 48%' */
  context: string | null;
  /** Comparison — 'vs 92% completion for prescription refill' */
  baseline_or_target: string | null;
  /** Name of the source document */
  source_document: string | null;
}

/** Generated from engineering_ticket_candidate.yaml */
export interface EngineeringTicketCandidate {
  /** Format: eng-ticket-001, eng-ticket-002, etc. */
  id: string;
  /** Technical ticket title (e.g., 'Implement React Navigation v7 upgrade for tab focus management') */
  title: string;
  /** Technical specification of what needs to be built */
  description: string;
  /** Finding IDs from research_readout (finding-XX) */
  addresses_findings: string[];
  /** Specific technical behaviors required */
  technical_acceptance_criteria: string[] | null;
  /** Code components, files, or systems impacted */
  affected_components: string[] | null;
  /** References stakeholder_constraint IDs (constraint-XXX) that affect this implementation */
  technical_constraints: string[] | null;
  /** How to validate the implementation works */
  testing_approach: string[] | null;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  effort: 'High' | 'Medium' | 'Low';
  /** Sprint estimate if grounded in stakeholder data */
  effort_estimate_sprints: string | null;
  /** Other ticket IDs that must complete first */
  blocked_by: string[] | null;
  /** Other tickets this unblocks */
  enables: string[] | null;
  /** What's broken/wrong now — from research findings, observed behaviors */
  current_behavior: string | null;
  /** One-sentence justification for effort estimate */
  effort_rationale: string | null;
  /** Specific numeric impact from upstream (e.g., '45% task abandonment') */
  user_impact_metrics: string[] | null;
  /** Design ticket IDs for coordinated cross-team work */
  related_design_tickets: string[] | null;
  /** Accessibility ticket IDs if work overlaps */
  related_accessibility_tickets: string[] | null;
}

/** Generated from exec_summary_point.yaml */
export interface ExecSummaryPoint {
  /** Format: exec-point-001, exec-point-002, etc. */
  id: string;
  /** Executive-level statement (1-2 sentences) */
  point: string;
  category: 'risk' | 'opportunity' | 'decision_required' | 'validation' | 'recommendation' | null;
  /** Finding IDs from research_readout (finding-XX) */
  supporting_findings: string[];
  /** Why this matters at executive level */
  business_implication: string | null;
  /** What leadership should do, decide, or escalate */
  recommended_action: string | null;
  /** Resource implication summary */
  effort_summary: string | null;
}

/** Generated from journey_pain_point.yaml */
export interface JourneyPainPoint {
  /** Format: jp-01, jp-02, etc. */
  id: string;
  /** Description of the friction */
  pain_point: string;
  /** References journey_stage.id where this pain manifests */
  stage_id: string;
  /** 1-4 Nielsen severity scale */
  severity: number | null;
  /** References to atomic_nugget_core.id values */
  evidence_nuggets: string[] | null;
  /** PT-XXX IDs who experienced this */
  participants_affected: string[] | null;
  /** Potential design fix */
  intervention_opportunity: string | null;
  /** Target_barrier ID (TB-XXX) if this validates a barrier */
  linked_barrier: string | null;
}

/** Generated from journey_stage.yaml */
export interface JourneyStage {
  /** Format: journey-stage-01, journey-stage-02, etc. */
  id: string;
  /** Stage label, e.g., 'Initial App Launch', 'Navigation Discovery' */
  stage_name: string;
  /** What happens at this stage */
  description: string;
  /** What participants think/feel at this stage */
  participant_thoughts: string[] | null;
  /** What participants do at this stage */
  participant_actions: string[] | null;
  /** frustrated, confused, satisfied, curious, etc. */
  emotional_state: string | null;
  /** Barriers experienced at this stage */
  pain_points: { pain: string; evidence_nugget: string; severity: number }[] | null;
  opportunities: string[] | null;
  /** Nugget IDs that informed this stage */
  supporting_nuggets: string[];
  /** PT-XXX IDs observed at this stage */
  participants_observed: string[] | null;
  /** Persona IDs whose journeys include this stage */
  linked_personas: string[] | null;
  /** Target_barrier IDs (TB-XXX) manifesting at this stage */
  linked_barriers: string[] | null;
  /** Time spent at this stage if observed */
  duration_estimate: string | null;
  /** Is this a fork in the journey? */
  decision_point: boolean | null;
  confidence: 'Strong' | 'Moderate' | 'Limited' | null;
}

/** Generated from methodology_recommendation.yaml */
export interface MethodologyRecommendation {
  /** method-001, method-002, etc. */
  id: string | null;
  /** Recommended method — 'Card sorting + tree testing' */
  method: string | null;
  /** What this method investigates — 'Veterans mental models for organizing VA services' */
  addresses: string | null;
  /** Full sentence explaining why this method fits */
  rationale: string | null;
  /** Name of the source document recommending this */
  source_document: string | null;
}

/** Generated from participant_metadata.yaml */
export interface ParticipantMetadata {
  /** Participant ID */
  participant_id: string | null;
  /** Explicitly stated background relevant to the study (e.g., service era, prior product experience). Never inferred from speech or behavior. */
  background: string | null;
  /** Device, OS, connectivity, browser */
  tech_setup: string | null;
  /** Assistive technology observed in use, or accessibility needs the participant explicitly stated */
  accessibility: string | null;
  /** How participant was recruited (Perigean, intercept, snowball, etc.) */
  recruitment_source: string | null;
  /** Whether participant consented to session recording */
  consent_recording: boolean | null;
  /** Frequency, primary tasks */
  app_usage: string | null;
  /** Observer notes about session conditions, interruptions, technical issues */
  session_notes: string | null;
  /** One-sentence summary of what this participant uniquely surfaced */
  key_contribution: string | null;
}

/** Generated from persona.yaml */
export interface Persona {
  /** Format: persona-01, persona-02, etc. */
  id: string;
  /** Memorable archetype label, e.g., 'The Self-Reliant Veteran with Vision Impairment' */
  persona_name: string;
  /** 1-2 word categorical archetype — Pragmatist, Explorer, Survivor, etc. */
  archetype: string;
  /** 1-2 sentence persona description */
  summary: string;
  /** PT-XXX IDs that informed this persona */
  based_on_participants: string[];
  /** Single participant who most embodies this persona, if applicable */
  representative_participant: string | null;
  /** Aggregated demographic attributes */
  demographics: { age_range: string; service_era: string; tech_comfort: string } | null;
  /** Living and usage context */
  context: { device_environment: string; assistive_technology: string; usage_frequency: string } | null;
  /** What this persona is trying to accomplish with VA app */
  goals: string[] | null;
  /** Specific pain points with evidence references */
  frustrations: { frustration: string; evidence_nugget: string; verbatim_quote: string; severity: number }[] | null;
  /** Observed behavioral patterns */
  behaviors: { behavior: string; context: string; evidence_nugget: string }[] | null;
  /** How this persona compensates when app fails */
  workarounds: string[] | null;
  /** Underlying needs the design must address */
  needs: string[] | null;
  /** Validated_theme IDs this persona exemplifies */
  linked_themes: string[] | null;
  /** Target_barrier IDs (TB-XXX) that materially affect this persona */
  affected_by_barriers: string[] | null;
  /** Single most representative verbatim quote */
  representative_quote: string | null;
  /** Which participant said it (PT-XXX) */
  representative_quote_source: string | null;
  confidence: 'Strong' | 'Moderate' | 'Limited';
  /** Based on participant count, behavioral consistency, theme grounding */
  confidence_reasoning: string | null;
}

/** Generated from persona_design_implication.yaml */
export interface PersonaDesignImplication {
  /** Format: pdi-01, pdi-02, etc. */
  id: string;
  /** Links to persona.id (e.g., persona-01) */
  persona_id: string;
  /** What this persona's existence means for design decisions */
  implication: string;
  /** Specific design action this implication suggests */
  design_recommendation: string;
  priority: 'High' | 'Medium' | 'Low' | null;
  effort_estimate: 'High' | 'Medium' | 'Low' | null;
  /** Target_barrier ID (TB-XXX) this implication addresses, if applicable */
  addresses_barrier: string | null;
}

/** Generated from prioritized_finding.yaml */
export interface PrioritizedFinding {
  /** Format: finding-01, finding-02, etc. */
  id: string;
  /** The insight statement */
  finding: string;
  category: 'accessibility_barrier' | 'mental_model_mismatch' | 'navigation_failure' | 'success_pattern' | 'unexpected_pattern' | 'other' | null;
  /** 1-4 severity scale */
  severity: number;
  evidence_strength: 'Strong' | 'Moderate' | 'Limited';
  /** REQUIRED: Validated theme IDs (theme-XX) that ground this finding. Every finding must trace to themes. */
  supporting_themes: string[];
  /** Canonical evidence_construct public_ids (UUIDs) of themes supporting this finding. Required for canonical lineage. */
  supporting_theme_evidence_ids: string[] | null;
  /** REQUIRED: Nugget IDs that provide evidence. Every finding must trace to raw observations. */
  supporting_nuggets: string[];
  /** X of Y participants format */
  participant_coverage: string | null;
  /** Persona IDs affected by this finding */
  affected_personas: string[] | null;
  /** Target barrier ID (TB-XXX) validated by this finding */
  validates_barrier: string | null;
  /** Target barrier ID (TB-XXX) refuted by this finding */
  refutes_barrier: string | null;
  /** Research question ID (RQ-XXX) answered by this finding */
  addresses_question: string | null;
  /** True if not anticipated by upstream barriers */
  unexpected: boolean | null;
  /** Verbatim quote illustrating this finding */
  representative_quote: string | null;
  /** PT-XXX who said the quote */
  representative_quote_source: string | null;
  /** Recommended action for this finding */
  recommendation: string | null;
  /** Team or role responsible */
  recommended_owner: string | null;
}

/** Generated from prioritized_issue.yaml */
export interface PrioritizedIssue {
  /** Format: issue-01, issue-02, etc. */
  id: string;
  /** Specific issue name from participant language, not generic UX jargon */
  issue_title: string;
  /** Issue classification for downstream filtering */
  category: 'navigation' | 'forms' | 'search' | 'content' | 'visual_design' | 'accessibility' | 'feedback' | 'workflow' | 'error_handling';
  /** 1-4 Nielsen scale: 1=cosmetic, 2=minor, 3=major, 4=catastrophic */
  severity: number;
  /** PT-XXX IDs who experienced this issue */
  participants_affected: string[];
  /** References to atomic_nugget_core.id values documenting this issue */
  evidence_nuggets: string[];
  /** Evidence quality assessment */
  confidence: 'Strong' | 'Moderate' | 'Limited';
  /** 1-2 sentence description of what's broken and why it matters */
  issue_description: string | null;
  /** Specific screen, feature, or interface element where issue occurs */
  location: string | null;
  /** How widely observed across participant pool */
  frequency: 'all_users' | 'majority' | 'several' | 'isolated' | null;
  /** X of Y participants format, e.g. '4 of 6' */
  participant_coverage: string | null;
  /** How this affects task completion (blocks, delays, workaround needed) */
  task_impact: string | null;
  /** Primary specific, actionable fix */
  fix_recommendation: string | null;
  /** Implementation effort estimate */
  fix_complexity: 'Low' | 'Medium' | 'High' | null;
  /** True if low-effort fix with high impact */
  quick_win: boolean | null;
  /** validated_theme.id references if issue maps to a theme */
  linked_themes: string[] | null;
  /** target_barrier IDs (TB-XXX) if issue validates a barrier */
  linked_barriers: string[] | null;
}

/** Generated from prioritized_recommendation.yaml */
export interface PrioritizedRecommendation {
  /** Format: rec-01, rec-02, etc. */
  id: string;
  /** Specific action to take */
  recommendation: string;
  /** Why this recommendation matters */
  rationale: string | null;
  /** REQUIRED: Finding IDs (finding-XX) this addresses. Every recommendation must trace to findings. */
  addresses_findings: string[];
  /** Canonical evidence_construct public_ids (UUIDs) of findings this addresses. Required for canonical lineage. */
  supporting_finding_evidence_ids: string[] | null;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  effort_estimate: 'High' | 'Medium' | 'Low' | null;
  /** What changes if this is implemented */
  expected_impact: string | null;
  /** How to implement */
  implementation_notes: string | null;
  /** Target barrier ID (TB-XXX) this recommendation addresses */
  addresses_barrier: string | null;
  /** References persona_design_implication IDs if derived from personas */
  source_implications: string[] | null;
}

/** Generated from probe.yaml */
export interface Probe {
  /** Format: probe-01, probe-02, etc. */
  id: string;
  /** The follow-up question */
  probe_text: string;
  /** When to use this probe */
  context: string | null;
  /** REQUIRED: Research question ID (RQ-XXX) this probe targets. Extract from task/topic context. */
  addresses_question: string;
  /** Additional follow-up prompts if participant is unclear */
  follow_ups: string[] | null;
}

/** Generated from research_objective.yaml */
export interface ResearchObjective {
  /** Stable ID, format: OBJ-001, OBJ-002, etc. */
  id: string;
  /** What we aim to learn through this research */
  objective: string;
}

/** Generated from research_question.yaml */
export interface ResearchQuestion {
  /** Stable ID, format: RQ-001, RQ-002, etc. */
  id: string;
  /** The research question */
  question: string;
  /** Question priority level */
  priority: 'Primary' | 'Secondary' | 'Exploratory' | null;
}

/** Generated from stakeholder_constraint.yaml */
export interface StakeholderConstraint {
  /** constraint-001, constraint-002, etc. */
  id: string | null;
  type: 'Technical' | 'Policy' | 'Resource' | 'Organizational' | null;
  /** Specific constraint — 'React Navigation v6 nested navigators (4 levels deep)' */
  constraint: string | null;
  /** Quantified impact — 'Deep linking breaks, inconsistent back button behavior' */
  impact: string | null;
  /** SH-XXX identifier */
  source: string | null;
  /** Role of the stakeholder — 'Engineering Lead' */
  source_role: string | null;
  /** Team — 'OCTO Mobile Engineering' */
  source_team: string | null;
  /** Full verbatim quote from stakeholder illustrating this constraint */
  verbatim_quote: string | null;
  /** Related system or organizational pattern this constraint is part of */
  broader_pattern: string | null;
  /** What this means for study design — tasks to test, populations to recruit */
  research_implication: string | null;
  /** What this means for the build — technical boundaries, timeline constraints */
  implementation_implication: string | null;
}

/** Generated from stakeholder_priority.yaml */
export interface StakeholderPriority {
  /** priority-001, priority-002, etc. */
  id: string | null;
  /** The priority — 'Navigation overhaul' */
  priority: string | null;
  /** SH-XXX identifiers who stated this — ['SH-001', 'SH-002', 'SH-003'] */
  stated_by: string[] | null;
  /** Whether this priority directly serves users */
  aligns_with_user_need: 'Yes' | 'No' | 'Partial' | 'Unknown' | null;
  /** What's driving this priority — 'App store ratings, congressional inquiries' */
  driver: string | null;
  /** When — 'Q3 2026' */
  timeline: string | null;
  /** How much work — '6-8 sprints' */
  effort_estimate: string | null;
}

/** Generated from stakeholder_question.yaml */
export interface StakeholderQuestion {
  /** question-001, question-002, etc. */
  id: string | null;
  /** How critical this question is for decision-making */
  priority: 'Blocking' | 'Important' | 'Validation' | null;
  /** The research question — 'Do veterans struggle with finding features (IA) or recognizing navigation elements (UI)?' */
  question: string | null;
  /** SH-XXX who raised this question */
  asked_by: string | null;
  /** Context behind the question — 'those are different engineering problems' */
  stakeholder_insight: string | null;
  /** Recommended method — 'Task-based usability testing with think-aloud' */
  suggested_method: string | null;
}

/** Generated from study_deliverable.yaml */
export interface StudyDeliverable {
  /** Format: deliverable-01, deliverable-02, etc. */
  id: string;
  /** Name of the deliverable */
  deliverable_name: string;
  /** Output format — e.g., 'Markdown report', 'Slack presentation' */
  format: string;
  /** When this is due */
  due_date: string | null;
  /** Who receives this deliverable */
  audience: string | null;
  /** REQUIRED: Research objective ID (OBJ-XXX) this deliverable serves. Every deliverable must trace to an objective. */
  addresses_objective: string;
}

/** Generated from study_methodology.yaml */
export interface StudyMethodology {
  /** e.g., Moderated usability testing */
  research_type: string | null;
  /** Brief description of protocol */
  approach: string | null;
  /** Number of sessions conducted */
  session_count: number | null;
  /** e.g., 60 minutes each */
  session_duration: string | null;
  /** Number of participants */
  sample_size: number | null;
  /** Key demographics — e.g., 2 of 3 use assistive technology */
  sample_composition: string | null;
  /** Caveats about sample, methodology, or representativeness */
  limitations: string | null;
}

/** Generated from study_risk.yaml */
export interface StudyRisk {
  /** Format: risk-01, risk-02, etc. */
  id: string;
  /** The risk statement */
  risk: string;
  /** References stakeholder_constraint.id from discovery, if applicable */
  source_constraint: string | null;
  likelihood: 'High' | 'Medium' | 'Low' | null;
  impact: 'High' | 'Medium' | 'Low' | null;
  /** How to mitigate this risk */
  mitigation: string;
  /** Backup plan if mitigation fails */
  contingency: string | null;
}

/** Generated from study_timeline.yaml */
export interface StudyTimeline {
  /** Format: phase-01, phase-02, etc. */
  id: string;
  /** Phase label, e.g., 'Planning and recruitment' */
  phase_name: string;
  /** Duration description, e.g., '2 weeks' */
  duration: string;
  /** Phase start date */
  start_date: string | null;
  /** Phase end date */
  end_date: string | null;
  /** Key activities in this phase */
  activities: string[] | null;
  /** Outputs from this phase */
  deliverables: string[] | null;
  /** Who owns this phase */
  responsible_party: string | null;
}

/** Generated from survey_finding.yaml */
export interface SurveyFinding {
  /** finding-001, finding-002, etc. */
  id: string | null;
  /** The finding statement — '73% of Veterans abandoned tasks due to navigation' */
  finding: string | null;
  /** Name of the metric — 'Task Abandonment Rate' */
  metric_name: string | null;
  /** Number of respondents */
  sample_size: number | null;
  /** Who this finding affects — 'older veterans (65+)' or 'AT users' */
  affected_segment: string | null;
  /** Verbatim respondent quotes supporting this finding */
  supporting_quotes: string[] | null;
  /** Which survey question yielded this finding */
  source_question: string | null;
}

/** Generated from survey_recommendation.yaml */
export interface SurveyRecommendation {
  /** rec-001, rec-002, etc. */
  id: string | null;
  /** The recommended action */
  action: string | null;
  /** Which theme_name this recommendation addresses */
  based_on_theme: string | null;
  priority: 'High' | 'Medium' | 'Low' | null;
  /** Who should own this — team or role */
  suggested_owner: string | null;
}

/** Generated from survey_theme.yaml */
export interface SurveyTheme {
  /** theme-001, theme-002, etc. */
  id: string | null;
  /** Name of the theme — 'Accessibility Barriers' */
  theme_name: string | null;
  /** Number of responses mentioning this theme */
  frequency_count: number | null;
  /** Percentage of total responses */
  frequency_percentage: number | null;
  sentiment: 'Negative' | 'Positive' | 'Mixed' | 'Neutral' | null;
  priority: 'High' | 'Medium' | 'Low' | null;
  /** Full pattern description — what this theme means */
  pattern: string | null;
  /** Representative respondent quotes illustrating this theme */
  verbatim_quotes: { quote: string; respondent: string }[] | null;
}

/** Generated from target_barrier.yaml */
export interface TargetBarrier {
  /** Stable ID, format: TB-001, TB-002, etc. */
  id: string;
  /** The hypothesized barrier statement */
  barrier: string;
  /** Where this barrier was identified — discovery artifact, stakeholder input, or researcher hypothesis */
  source: string | null;
}

/** Generated from task_completion_record.yaml */
export interface TaskCompletionRecord {
  /** Unique record ID, e.g. task-PT-001-01 */
  id: string | null;
  participant: string | null;
  /** Task sequence number in the session protocol */
  task_number: number | null;
  /** Task name or description */
  task_name: string | null;
  /** Whether participant completed the task */
  success: boolean | null;
  /** Time to complete if measured (MM:SS or HH:MM:SS) */
  completion_time: string | null;
  /** Number of attempts before success or abandonment */
  attempts: number | null;
  /** Whether participant used an unintended path to complete */
  workaround_used: boolean | null;
  /** What happened during the task attempt */
  notes: string | null;
  /** What stopped completion if task failed — each blocker as separate item */
  blockers: string[] | null;
  /** Nugget IDs that document observations from this task */
  linked_nuggets: string[] | null;
}

/** Generated from task_scenario.yaml */
export interface TaskScenario {
  /** Format: task-01, task-02, etc. */
  id: string;
  /** Task sequence number in the session protocol */
  scenario_number: number | null;
  /** What the participant is asked to do */
  task_description: string;
  /** The underlying goal the task simulates */
  user_goal: string | null;
  /** Where the participant starts (e.g., app home screen) */
  starting_state: string | null;
  /** How to determine task completion */
  success_criteria: string;
  /** Expected time for this task */
  estimated_duration: string | null;
  /** REQUIRED: Research question IDs (RQ-XXX) this task addresses. Extract from [RQ-XXX] markers in task headers. */
  addresses_questions: string[];
  /** REQUIRED: Target barrier IDs (TB-XXX) this task is designed to elicit. Extract from [targets TB-XXX] markers in task headers. */
  validates_barriers: string[];
  /** What to watch for during this task */
  observation_focus: string[] | null;
}

/** Generated from unexpected_pattern.yaml */
export interface UnexpectedPattern {
  /** Format: unexpected-{seq}, e.g. unexpected-01 */
  id: string;
  /** What the unexpected pattern is */
  pattern: string;
  /** Why this was not anticipated — no matching target barrier */
  why_unexpected: string;
  /** References to atomic_nugget_core.id values */
  supporting_nuggets: string[];
  /** Why this matters for the research */
  significance: string | null;
}

/** Generated from validated_job.yaml */
export interface ValidatedJob {
  /** Format: job-01, job-02, etc. */
  id: string;
  /** Progress-focused name, not task-focused. Test: describable without mentioning the app */
  job_title: string;
  /** The triggering situation: 'When I [specific context from research]' */
  when_situation: string;
  /** The desired progress: 'I want to [progress, NOT a UI action]' */
  want_motivation: string;
  /** The life outcome: 'So I can [outcome, NOT app outcome]' */
  so_outcome: string;
  /** References to atomic_nugget_core.id values supporting this job */
  evidence_nuggets: string[];
  /** Evidence quality assessment */
  confidence: 'Strong' | 'Moderate' | 'Limited';
  /** Primary dimension of the job */
  job_type: 'functional' | 'emotional' | 'social' | 'composite' | null;
  /** What they're trying to accomplish (task dimension) */
  functional_need: string | null;
  /** How they want to feel (affect dimension) */
  emotional_need: string | null;
  /** How they want to be perceived (identity dimension) */
  social_need: string | null;
  /** What they 'hire' to do this job today */
  current_workaround: string | null;
  /** PT-XXX IDs who expressed this job */
  participants_observed: string[] | null;
  /** X of Y participants format, e.g. '4 of 6' */
  participant_coverage: string | null;
  /** validated_theme.id references if job maps to themes */
  linked_themes: string[] | null;
  /** target_barrier IDs (TB-XXX) if job relates to a barrier */
  linked_barriers: string[] | null;
  /** Specific implementable fix that addresses this job's pain points */
  design_opportunity: string | null;
}

/** Generated from validated_theme.yaml */
export interface ValidatedTheme {
  /** Format: theme-{seq}, e.g. theme-01 */
  id: string;
  /** Concise theme label from participant language */
  theme_name: string;
  /** 1-2 sentence theme description */
  summary: string;
  /** Full pattern explanation — what this theme reveals about user behavior or experience */
  pattern_description: string | null;
  /** References to atomic_nugget_core.id values that support this theme */
  supporting_nuggets: string[];
  /** Canonical evidence_construct public_ids (UUIDs) of nuggets supporting this theme. Required for canonical lineage. */
  supporting_evidence_ids: string[] | null;
  /** Number of nugget instances supporting this theme */
  evidence_count: number | null;
  /** PT-XXX IDs where this theme was observed */
  participants_observed: string[] | null;
  /** X of Y participants format, e.g. '5 of 8' */
  participant_coverage: string | null;
  /** Count of nuggets by severity level */
  severity_distribution: { severity_0: number; severity_1: number; severity_2: number; severity_3: number; severity_4: number } | null;
  /** Single most representative verbatim quote across the supporting nuggets */
  representative_quote: string | null;
  /** Which participant said the representative quote (PT-XXX) */
  representative_quote_source: string | null;
  /** References to target_barriers if theme validates or refutes */
  linked_barriers: string[] | null;
  /** How this theme relates to upstream barriers */
  validation_status: 'validates_barrier' | 'refutes_barrier' | 'unexpected_pattern' | null;
  /** References to research_questions if theme addresses */
  linked_questions: string[] | null;
  /** Demographics or contexts that pattern across — e.g., AT users, age 65+, iOS users */
  cross_cutting_dimensions: string[] | null;
  confidence: 'Strong' | 'Moderate' | 'Limited';
  /** Why this confidence level — participant count, severity pattern, evidence quality */
  confidence_reasoning: string | null;
}

// ---------------------------------------------------------------------------
// Variable key registry (generated portion)
// ---------------------------------------------------------------------------

/**
 * Maps cascade variable keys to their generated TypeScript types.
 * For primitive types (string, string[]), see cascade.manual.ts.
 */
export interface CascadeVariableMapGenerated {
  // accessibility_ticket_candidate → AccessibilityTicketCandidate
  // alignment_gap → AlignmentGap
  // atomic_nugget → AtomicNugget
  // atomic_nugget_core → AtomicNuggetCore
  // atomic_nugget_detail → AtomicNuggetDetail
  // barrier_validation → BarrierValidation
  // decision_input → DecisionInput
  // design_hmw_opportunity → DesignHmwOpportunity
  // design_ticket_candidate → DesignTicketCandidate
  // discovered_barrier → DiscoveredBarrier
  // discovered_journey → DiscoveredJourney
  // discovered_metric → DiscoveredMetric
  // engineering_ticket_candidate → EngineeringTicketCandidate
  // exec_summary_point → ExecSummaryPoint
  // journey_pain_point → JourneyPainPoint
  // journey_stage → JourneyStage
  // methodology_recommendation → MethodologyRecommendation
  // participant_metadata → ParticipantMetadata
  // persona → Persona
  // persona_design_implication → PersonaDesignImplication
  // prioritized_finding → PrioritizedFinding
  // prioritized_issue → PrioritizedIssue
  // prioritized_recommendation → PrioritizedRecommendation
  // probe → Probe
  // research_objective → ResearchObjective
  // research_question → ResearchQuestion
  // stakeholder_constraint → StakeholderConstraint
  // stakeholder_priority → StakeholderPriority
  // stakeholder_question → StakeholderQuestion
  // study_deliverable → StudyDeliverable
  // study_methodology → StudyMethodology
  // study_risk → StudyRisk
  // study_timeline → StudyTimeline
  // survey_finding → SurveyFinding
  // survey_recommendation → SurveyRecommendation
  // survey_theme → SurveyTheme
  // target_barrier → TargetBarrier
  // task_completion_record → TaskCompletionRecord
  // task_scenario → TaskScenario
  // unexpected_pattern → UnexpectedPattern
  // validated_job → ValidatedJob
  // validated_theme → ValidatedTheme
}
