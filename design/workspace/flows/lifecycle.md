# Flow: The Research Lifecycle (runtime-verified, PR #346)

Source of truth: docs/design-references/slack-workflow-contract/ @ dev post-#346 (researcher-journey, workflow-dependencies, evidence-pipeline, analysis-synthesis, claims-audit). Runtime beats prior design assumptions.

## The lifecycle

SET UP -> Project (/qori-start) . Discovery (optional, anytime: desk research / stakeholder synthesis / survey pipeline)
DEFINE -> Brief (/qori-brief, cascade-prefilled, discovery source picker) -> **GATE: stakeholder approval** (approve / request changes / resubmit) -> Plan (/qori-plan, 2 fields, rest inherited) . Guide (/qori-discuss, cascade-prefilled)
FIELDWORK -> Participants -> outreach -> observers -> session notes / transcript upload (quarantine) -> **GATE: PII review** (approve+attest / reject / rescrub)
ANALYZE -> Per-session analysis (/qori-analyze: study->session->notes) -> nuggets (AI-extracted; NO individual nugget review — researcher reads the session summary)
SYNTHESIZE -> /qori-synthesis, exactly six methods: affinity_mapping, journey_mapping, persona_generation, jobs_to_be_done, usability_issues, design_opportunities. Constructs created as candidate; **UX-2B review (API): candidate -> accepted/rejected, re-review allowed, overridden is governance-terminal** for theme/finding/recommendation types.
DELIVER -> Readout (/qori-report: full + targeted designer/engineering/accessibility/leadership) -> publish to GitHub . Tickets (/qori-tickets reads *_ticket_candidates from study_variables directly — CA-003)
ANYTIME -> Ask Qori, discovery, participants, guide.

CORRECTED (CA-001): thematic_analysis, cross_session_synthesis, recommendations, executive_summary templates NEVER EXISTED. "Evidence curation / promote missed text" is NOT IMPLEMENTED — all evidence creation is AI-driven; construct-level UX-2B review only.

## Gates and dependencies (runtime-enforced)

HARD: plan needs cascade readiness (research_objectives/questions/target_barriers present — brief_status itself is NOT checked at runtime; the readiness check is the effective gate) . analysis needs pii_reviewed=true notes . synthesis needs nuggets . readout needs synthesis outputs . tickets need ticket candidates.
CASCADE GATE (warn): discussion guide without objectives/questions -> readiness blocks, no submit.
SOFT: discovery before brief . affinity before other synthesis (themes enrich all) . personas before journey/design-opportunities . jobs before design-opportunities.
FREE: discovery, guide, ask, participants, observers.

Plan approval: REMOVED — brief is the only document approval gate (events.ts:462). Note: artifact-lifecycle.md still describes a plan approval mechanism; flagged as doc contradiction (gap report).

## Evidence pipeline (canonical)

source -> nugget (DERIVED_FROM) -> theme / journey_stage / persona / usability_finding (SYNTHESIZED_FROM). jobs + design_opportunities are variable-only (no construct). findings/recommendations today are ARTIFACT-ONLY inside readouts (CA-002) — no canonical finding/recommendation constructs emitted by synthesis. Fail-closed evidence-ref validation; semantic_key dedup.

## Collect once, cascade (field-master-inventory)

Problem statement (project->brief) . methodology + questions + objectives (brief->plan->guide) . start date (brief->plan) . study from URL context . lead researcher from session auth (plan may reassign — PREFILLED there). Brief has NO lead-researcher field at runtime; name falls back to authenticated user (DERIVED). Study name: none — Phase 2D single-study-per-project, study inherits project slug.

## States (UX-2B + survey)

Construct: candidate -> accepted / rejected (re-review allowed; overridden terminal). Privacy: pending / clear / redacted / restricted. Staleness is separate from review status. Artifact: workflow (pending/written/failed/approved) independent of publication (not_published/publishing/published/projection_failed).

## Blocking screens (P0)

New Project (guided) . Brief form (cascade prefill + discovery picker) . Brief approval (banner + work-queue item) . Plan form (2 fields) . Synthesis initiation (method + auto-detected enrichments panel) . PII review (viewer + gate). P1: guide form, session analysis picker, readout initiation, discovery hub. P2: participants, outreach, observers, survey pipeline (6 stages), tickets.
