# Evidence Pipeline: Source → Nugget → Theme → Finding → Recommendation

**Status:** IMPLEMENTED (with gaps noted)

This documents the actual implementation path from source material through to actionable research outputs. Every transition is verified against runtime code.

## Pipeline Overview

```
Source Material (transcripts, observations, survey responses)
    │
    ▼ /qori-analyze (session_summary.yaml)
Nuggets (atomic_nugget_core + atomic_nugget_detail)
    │
    ▼ /qori-synthesis (6 methods)
    ├── affinity_mapping.yaml      → validated_themes, unexpected_patterns
    ├── journey_mapping.yaml       → journey_stages, journey_pain_points
    ├── persona_generator.yaml     → personas, persona_design_implications
    ├── jobs_to_be_done.yaml       → validated_jobs
    ├── usability_issues_extractor.yaml → prioritized_issues
    └── design_opportunity_generator.yaml → design_hmw_opportunities
    │
    ▼ Evidence Layer
EvidenceConstruct records with canonical lineage
    │
    ▼ /qori-report (readout templates)
Research artifacts (GitHub projection)
```

## Stage 1: Source → Nugget

**Template:** `session_summary.yaml`
**Trigger:** `/qori-analyze`
**Handler:** `analyzeNotesHandler.ts`
**App Service:** `transcript.app-service.ts`

### Input
- Approved session notes (`study_notes` with `pii_reviewed=true`)
- Cascade context: `target_barriers`, `research_questions` (from brief)
- Researcher selects: study → session (participant) → specific notes

### Transform
- **Model:** Claude (Sonnet for extraction)
- **Process:** AI analyzes session notes against research context
- **Pre-transmission PII redaction:** Real names replaced with participant codes before any model contact

### Output — Emitted Variables

| Variable | Schema | Pool Strategy | Key Fields |
|----------|--------|---------------|------------|
| `atomic_nugget_core` | `schemas/atomic_nugget_core.yaml` | `append_or_replace_per_participant` | id, nugget_type, severity (0-4), text, participant (PT-NNN), session |
| `atomic_nugget_detail` | `schemas/atomic_nugget_detail.yaml` | `append_or_replace_per_participant` | id, verbatim_quote, participant_context, task_context, linked_barrier, linked_question, emotional_state, confidence |
| `participant_metadata` | `schemas/participant_metadata.yaml` | `append_or_replace_per_participant` | participant_id, background, tech_setup, accessibility, key_contribution |
| `task_completion_records` | `schemas/task_completion_record.yaml` | `append_or_replace_per_participant` | task_name, success, completion_time, attempts, blockers, linked_nuggets |
| `barrier_validations` | `schemas/barrier_validation.yaml` | `append_or_replace_per_participant` | barrier_ref (→ target_barrier.id), participant, validated, evidence, confidence |

### Nugget Types (nugget_type enum)
`task_success`, `task_failure`, `pain_point`, `workaround`, `quote`, `positive`, `surprise`, `accessibility_issue`, `behavioral_pattern`, `mental_model`

### Canonical Write
- `EvidenceSource` created (type: session_transcript or session_notes)
- `EvidenceConstruct` created (type: nugget) with `derivation_type: 'model'`
- Lineage: `DERIVED_FROM` relationship from source to construct

### Human Review
- **NOT IMPLEMENTED** at nugget level — nuggets are AI-proposed, not individually reviewed
- Researcher reviews the generated session summary artifact but cannot accept/reject individual nuggets from Slack
- UX-2B review contract applies to findings/recommendations, not nuggets

---

## Stage 2: Nugget → Synthesized Construct

**Templates:** Six synthesis methods (see Analysis/Synthesis section)
**Trigger:** `/qori-synthesis`
**Handler:** `researchSynthesisHandler.ts`
**App Service:** `synthesis.app-service.ts`

### Input
- All nuggets for the study (`atomic_nugget_core` + `atomic_nugget_detail`)
- Optional enrichments: `validated_themes`, `target_barriers`, `research_questions`, `personas`, `participant_metadata`, `stakeholder_constraints`, `validated_jobs`

### Transform
- **Model:** Claude (generation) + Sonnet (extraction)
- **Process:** AI synthesizes across sessions, citing nugget IDs
- **Evidence validation:** Proposed nugget references validated against canonical evidence (fail-closed)

### Output by Method

| Method | Constructs Created | Construct Type | Relationship |
|--------|-------------------|----------------|--------------|
| Affinity Mapping | Themes | `theme` | `SYNTHESIZED_FROM` nuggets |
| Journey Mapping | Journey stages | `journey_stage` | `SYNTHESIZED_FROM` nuggets |
| Persona Generation | Personas | `persona` | `SYNTHESIZED_FROM` nuggets |
| Jobs to Be Done | Jobs | (variable only — no construct type yet) | — |
| Usability Issues | Issues | `usability_finding` | `SYNTHESIZED_FROM` nuggets |
| Design Opportunities | HMW opportunities | (variable only — no construct type yet) | — |

### Canonical Write (for theme creation — affinity_mapping path)

Source: `synthesis.app-service.ts:229-304`

1. Load `validated_themes` from extraction output
2. Query existing nugget constructs: `EvidenceConstruct.findAll({ study_id, construct_type: 'nugget' })`
3. Build `SynthesizedConstructInput` per theme with `proposedEvidenceIds` (nugget public_ids)
4. Call `createSynthesizedConstructs` which:
   - Validates all proposed refs (fail-closed — any invalid ref rejects entire item)
   - Checks semantic_key for deduplication: `${constructType}:${studyId}:${displayId}:${templateVersion}:${upstreamHash}`
   - Creates `EvidenceConstruct` with `status: 'candidate'`, `derivation_type: 'model'`
   - Creates `EvidenceRelationship` per valid upstream ref: `SYNTHESIZED_FROM`
   - Sets `cascade_variable_key: 'validated_themes'`

Source: `synthesis-evidence.service.ts:163-291`

### Human Review
- **IMPLEMENTED** via UX-2B for `finding`, `recommendation`, `theme` construct types
- Constructs start as `candidate` → researcher can `accept` or `reject`
- Re-review allowed (accepted ↔ rejected) with audit record
- `overridden` is governance-terminal

---

## Stage 3: Theme/Finding → Recommendation

### Current State

**PARTIALLY IMPLEMENTED.** The pipeline from theme to finding to recommendation exists conceptually in the cascade variable chain, but:

1. **No dedicated "findings" template** — findings emerge from synthesis outputs (themes contain finding-like conclusions). The `prioritized_finding` schema exists in `backend/config/schemas/` but no synthesis method explicitly emits it as a standalone variable.

2. **No dedicated "recommendations" template** — recommendations emerge from design_opportunities (HMW → design direction). The `prioritized_recommendation` schema exists but is used only by readout templates, not emitted by synthesis.

3. **Evidence constructs of type `finding` and `recommendation`** can be created by the evidence layer but are not currently emitted by any synthesis template's `emits` block.

### What Actually Happens

The readout templates (`research_readout.yaml`, `targeted_readouts.yaml`) consume upstream themes, issues, and opportunities and generate findings/recommendations as part of the readout artifact. These are **artifact-only** — written into the rendered document but not back-projected as canonical evidence constructs.

This is the CA-002 gap: readouts read GitHub artifacts and cascade context, generate a document containing findings and recommendations, but don't persist those as canonical evidence.

---

## Evidence Validation Architecture

Source: `synthesis-evidence.service.ts:64-124`

### Fail-Closed Validation

Every proposed evidence reference is validated:

1. **DB existence** — ref must exist in `evidence_constructs` table
2. **Study match** — construct's `study_id` must equal the synthesis study
3. **Supplied check** — ref must be in the set of evidence actually fed to generation
4. **Type check** — construct's `construct_type` must match expected upstream type
5. **Status check** — construct must not be `restricted`

Any invalid ref → reject entire candidate item. Zero valid refs → reject construct entirely.

### Deduplication via Semantic Key

Format: `${constructType}:${studyId}:${displayId}:${templateVersion}:${upstreamHash}`

- `upstreamHash` = SHA-256 of sorted, deduplicated upstream evidence public_ids (first 12 chars)
- Same inputs → same semantic_key → returns existing construct (idempotent re-run)

### Lineage Relationships Created

| From | To | Relationship | When |
|------|----|-------------|------|
| EvidenceSource | Nugget (EvidenceConstruct) | `DERIVED_FROM` | Session analysis |
| Nugget | Theme (EvidenceConstruct) | `SYNTHESIZED_FROM` | Affinity mapping |
| Nugget | Usability Finding (EvidenceConstruct) | `SYNTHESIZED_FROM` | Usability issues |
| Nugget | Journey Stage (EvidenceConstruct) | `SYNTHESIZED_FROM` | Journey mapping |
| Nugget | Persona (EvidenceConstruct) | `SYNTHESIZED_FROM` | Persona generation |

---

## What Slack Exposes vs. Hides

| Pipeline Stage | Researcher Sees | Researcher Controls | Hidden |
|---------------|----------------|--------------------|---------| 
| Source ingestion | Upload/paste UI, PII review DM | File selection, PII terms | Quarantine mechanics |
| Nugget extraction | Session summary artifact (GitHub link) | Which notes to analyze | Individual nuggets, extraction schemas |
| Synthesis | Synthesis artifact (GitHub link) | Method, enrichments | Evidence construct creation, lineage |
| Theme/finding review | NOT VISIBLE in Slack | Nothing — no review UI in Slack | UX-2B review exists as API only |
| Readout | Readout artifact (GitHub link) | Readout type, audience | GitHub content aggregation |

### Critical Gap for Workspace

The Workspace needs to make visible what Slack currently hides:
- Individual nuggets (evidence browser — designed)
- Theme/finding review (finding-detail screen — designed, UX-2B API — implemented)
- Evidence lineage (traceability panel — designed)
- Synthesis enrichment selection rationale (not designed)
