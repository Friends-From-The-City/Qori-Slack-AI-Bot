# Analysis and Synthesis Pipeline

The actual analysis pipeline from source material through synthesized research outputs. All methods verified against runtime code.

## Stage 1: Per-Session Analysis (`/qori-analyze`)

**Status:** IMPLEMENTED
**Handler:** `backend/src/helpers/slack/commands/analyzeNotesHandler.ts`
**Template:** `config/prompts/session_summary.yaml`
**App Service:** `backend/src/application/transcript.app-service.ts`

### Input
- Approved session notes (`study_notes` with `pii_reviewed=true`)
- Cascade context: `target_barriers`, `research_questions` (from brief)
- Researcher selects: study → session (participant) → specific notes

### Progressive Disclosure Modal

| Step | UI Label | Type | Dynamic |
|------|----------|------|---------|
| 1 | Study | static_select | Populated from user's studies |
| 2 | Session | static_select | Populated from study participants (after study selected) |
| 3 | Session notes | checkboxes | Populated from approved notes for selected session |
| Context | Barriers/questions | display only | Shows counts from cascade variables |

### Process
1. Researcher selects study → session → notes
2. Pre-transmission PII redaction: real names replaced with participant codes
3. `session_summary.yaml` executed with redacted notes + cascade context
4. AI generates per-session analysis
5. Variable extractor runs 5 extraction schemas (Sonnet):
   - `atomic_nugget_core` (6 fields: id, nugget_type, severity, text, participant, session)
   - `atomic_nugget_detail` (11 enrichment fields linked by id)
   - `participant_metadata` (participant context, setup, contributions)
   - `task_completion_records` (task success/failure with timing)
   - `barrier_validations` (validates/refutes target barriers from brief)

### Output
- Session summary artifact (GitHub)
- `atomic_nugget_core` variables (pool strategy: `append_or_replace_per_participant`)
- `atomic_nugget_detail` variables (linked by nugget id)
- `participant_metadata`, `task_completion_records`, `barrier_validations`
- Evidence sources + constructs created in evidence layer

### What Researcher Sees
- DM with GitHub link to session summary artifact
- No inline nugget review in Slack — researcher reads the artifact

### What Researcher Controls
- Which notes to include in analysis
- Cannot modify extracted nuggets from Slack

---

## Stage 2: Cross-Session Synthesis (`/qori-synthesis`)

**Status:** IMPLEMENTED
**Handler:** `backend/src/helpers/slack/commands/researchSynthesisHandler.ts`
**App Service:** `backend/src/application/synthesis.app-service.ts`
**Evidence Service:** `backend/src/services/synthesis-evidence.service.ts`

### Cascade-Aware Modal

The synthesis modal dynamically shows:
1. **Session stats:** Participant count, nugget count per participant
2. **Available enrichments:** checkboxes for optional upstream variables — shown only when corresponding cascade variables exist
3. **Analysis method selection:** determines which YAML template runs

### The Six Synthesis Methods

Source of truth: `backend/src/application/synthesis.app-service.ts:64-71` (`ANALYSIS_YAML_MAPPING`).
Modal options: `backend/src/helpers/slack/ui/researchSynthesisModal.ts:222-247`.

#### 1. Affinity Mapping

**Value:** `affinity_mapping` | **Template:** `affinity_mapping.yaml` (v7.1)
**Purpose:** Group nuggets into validated themes

| Cascade Dependency | Required | Source |
|-------------------|----------|--------|
| `atomic_nugget_core` | Yes | session_summary |
| `atomic_nugget_detail` | Yes | session_summary |
| `target_barriers` | No | research_brief |
| `research_questions` | No | research_brief |
| `participant_metadata` | No | session_summary |

**Emits:** `validated_themes` (replace, study-level), `unexpected_patterns` (replace)
**Evidence constructs:** Creates `theme` constructs with `SYNTHESIZED_FROM` lineage to nuggets
**Extraction:** Sonnet extracts from numbered theme sections

#### 2. Journey Mapping

**Value:** `journey_mapping` | **Template:** `journey_mapping.yaml` (v7.0)
**Purpose:** Map experience stages from behavioral nugget patterns

| Cascade Dependency | Required | Source |
|-------------------|----------|--------|
| `atomic_nugget_core` | Yes | session_summary |
| `atomic_nugget_detail` | Yes | session_summary |
| `validated_themes` | No | affinity_mapping |
| `personas` | No | persona_generator |
| `target_barriers` | No | research_brief |
| `research_questions` | No | research_brief |

**Emits:** `journey_stages` (replace), `journey_pain_points` (replace)
**Evidence constructs:** Creates `journey_stage` constructs with `SYNTHESIZED_FROM` lineage

#### 3. Persona Generation

**Value:** `persona_generation` | **Template:** `persona_generator.yaml` (v7.0)
**Purpose:** Create research-grounded behavioral personas

| Cascade Dependency | Required | Source |
|-------------------|----------|--------|
| `atomic_nugget_core` | Yes | session_summary |
| `atomic_nugget_detail` | Yes | session_summary |
| `participant_metadata` | Yes | session_summary |
| `validated_themes` | No | affinity_mapping |
| `target_barriers` | No | research_brief |
| `research_questions` | No | research_brief |

**Emits:** `personas` (replace), `persona_design_implications` (replace)
**Evidence constructs:** Creates `persona` constructs with `SYNTHESIZED_FROM` lineage
**Rules:** NO 1:1 mapping (3 participants → 2 personas max), archetype names only, PT-NNN codes only

#### 4. Jobs to Be Done

**Value:** `jobs_to_be_done` | **Template:** `jobs_to_be_done.yaml` (v7.0)
**Purpose:** Extract When/Want/So structured user jobs

| Cascade Dependency | Required | Source |
|-------------------|----------|--------|
| `atomic_nugget_core` | Yes | session_summary |
| `atomic_nugget_detail` | Yes | session_summary |
| `validated_themes` | No | affinity_mapping |
| `target_barriers` | No | research_brief |
| `research_questions` | No | research_brief |

**Emits:** `validated_jobs` (replace)
**Evidence constructs:** Variable-only — no evidence construct type created currently

#### 5. Usability Issues

**Value:** `usability_issues` | **Template:** `usability_issues_extractor.yaml` (v7.0)
**Purpose:** Extract and prioritize usability problems with Nielsen severity

| Cascade Dependency | Required | Source |
|-------------------|----------|--------|
| `atomic_nugget_core` | Yes | session_summary |
| `atomic_nugget_detail` | Yes | session_summary |
| `validated_themes` | No | affinity_mapping |
| `target_barriers` | No | research_brief |
| `research_questions` | No | research_brief |

**Emits:** `prioritized_issues` (replace)
**Evidence constructs:** Creates `usability_finding` constructs with `SYNTHESIZED_FROM` lineage
**Rules:** Nielsen severity scale (1-4), "EXTRACT ONLY" (no hallucination), "CITE EVERYTHING"

#### 6. Design Opportunities

**Value:** `design_opportunities` | **Template:** `design_opportunity_generator.yaml` (v7.0)
**Purpose:** Generate How Might We statements from research problems

| Cascade Dependency | Required | Source |
|-------------------|----------|--------|
| `atomic_nugget_core` | Yes | session_summary |
| `atomic_nugget_detail` | Yes | session_summary |
| `validated_themes` | No | affinity_mapping |
| `personas` | No | persona_generator |
| `validated_jobs` | No | jobs_to_be_done |
| `stakeholder_constraints` | No | stakeholder_synthesis |
| `target_barriers` | No | research_brief |
| `research_questions` | No | research_brief |

**Emits:** `design_hmw_opportunities` (replace)
**Evidence constructs:** Variable-only — no evidence construct type created currently
**Note:** Richest upstream dependency set of all six methods
**Rules:** "HMWs COME FROM PROBLEMS — NO INVENTION", NO SOLUTIONS IN HMWs

### Enrichment Availability

The modal does not enforce ordering. Enrichments appear as checkboxes only when the corresponding cascade variables exist from prior runs. This creates a natural suggested flow:

1. Run affinity_mapping first → produces `validated_themes` (consumed by all others)
2. Run persona_generation → produces `personas` (consumed by journey_mapping, design_opportunities)
3. Run jobs_to_be_done → produces `validated_jobs` (consumed by design_opportunities)
4. Other methods can run in any order

### What Researcher Controls
- Analysis method selection
- Which enrichment variables to include (checkboxes)
- Which study to synthesize
- Cannot modify AI-generated outputs from Slack

---

## Evidence Construct Creation (Synthesis Path)

Source: `backend/src/services/synthesis-evidence.service.ts:163-291`

### Flow

1. **Extract** emitted variables from YAML processing output
2. **Validate** all proposed upstream evidence refs (fail-closed)
3. **Deduplicate** via semantic_key: `${constructType}:${studyId}:${displayId}:${templateVersion}:${upstreamHash}`
4. **Create** `EvidenceConstruct` with `status: 'candidate'`, `derivation_type: 'model'`
5. **Link** via `EvidenceRelationship`: `SYNTHESIZED_FROM` per valid upstream ref
6. **Enrich** projection with evidence refs

### Evidence Types Currently Created by Synthesis

| Method | Construct Type | Created | Lineage |
|--------|---------------|---------|---------|
| affinity_mapping | `theme` | Yes | `SYNTHESIZED_FROM` nuggets |
| journey_mapping | `journey_stage` | Yes | `SYNTHESIZED_FROM` nuggets |
| persona_generation | `persona` | Yes | `SYNTHESIZED_FROM` nuggets |
| jobs_to_be_done | — | No (variable only) | — |
| usability_issues | `usability_finding` | Yes | `SYNTHESIZED_FROM` nuggets |
| design_opportunities | — | No (variable only) | — |

---

## Workspace Design Notes

- Analysis → "Analyze Session" page with progressive session picker and progress stepper
- Synthesis → "Run Synthesis" page with method selection and enrichment picker
- Evidence browser → designed in evidence screen spec — makes nuggets/themes visible
- Finding/recommendation review → finding-detail screen with UX-2B accept/reject
- Key gap: no "analysis workspace" for interactive nugget/theme manipulation — all AI-driven, researcher reviews output
- Enrichment availability is auto-detected — Workspace should show same availability indicators
