# Analysis and Synthesis Pipeline

The actual analysis pipeline from source material through to recommendations.

## Stage 1: Per-Session Analysis (`/qori-analyze`)

**Status:** IMPLEMENTED
**Handler:** `analyzeNotesHandler.ts`
**Template:** `session_summary.yaml`

### Input
- Approved session notes (study_notes with pii_reviewed=true)
- Study context (research_questions, target_barriers from brief cascade)
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
2. `session_summary.yaml` executed with session notes + cascade context
3. AI generates per-session analysis
4. Variable extractor runs 5 extraction schemas (all Sonnet):
   - `atomic_nugget_core` (6 fields: id, nugget_type, severity, text, participant, session)
   - `atomic_nugget_detail` (11 enrichment fields linked by id)
   - `validated_themes` (requires supporting_nuggets from nugget_core)
   - `unexpected_patterns`
   - `session_metadata`

### Output
- Session summary artifact (GitHub)
- `atomic_nugget_core` variables (pool strategy: `append_or_replace_per_participant`)
- `atomic_nugget_detail` variables (linked by nugget id)
- `validated_themes` variables
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
**Handler:** `researchSynthesisHandler.ts`

### Cascade-Aware Modal

The synthesis modal dynamically shows:
1. **Session stats:** Participant count, nugget count per participant
2. **Available enrichments:** checkboxes for optional upstream variables (themes, barriers, research_questions, personas, metadata, constraints, jobs)
3. **Analysis method selection:** determines which YAML template runs

### Analysis Methods (YAML Templates)

| Method | Template | What It Produces |
|--------|----------|-----------------|
| Affinity Mapping | `affinity_mapping.yaml` | Grouped themes from nuggets |
| Thematic Analysis | `thematic_analysis.yaml` | Coded themes with evidence |
| Cross-Session Synthesis | `cross_session_synthesis.yaml` | Cross-participant patterns |
| Usability Issues | `usability_issues.yaml` | Prioritized usability findings |
| Recommendations | `recommendations.yaml` | Actionable recommendations from findings |
| Executive Summary | `executive_summary.yaml` | High-level summary for stakeholders |

### Process
1. Researcher selects study → analysis method → enrichments
2. Template loaded, upstream variables injected (nuggets, themes, etc.)
3. AI generates synthesis
4. Variables extracted and persisted
5. Evidence constructs created (findings, recommendations, themes)
6. Artifact written to GitHub

### Recommended Analysis Order
The `/qori-synthesis` modal shows enrichment availability, implying this order:
1. Affinity Mapping or Thematic Analysis (produces themes)
2. Cross-Session Synthesis (consumes themes)
3. Usability Issues (produces prioritized issues)
4. Recommendations (consumes findings + issues)
5. Executive Summary (consumes everything)

### What Researcher Controls
- Analysis method selection
- Which enrichment variables to include (checkboxes)
- Which study to synthesize
- Cannot modify AI-generated findings/recommendations from Slack

---

## Evidence Creation Through Pipeline

```
Source Material (transcripts, notes)
    │
    ▼ /qori-analyze
Nuggets (atomic_nugget_core + detail)
    │
    ▼ /qori-synthesis
Themes → Findings → Recommendations
    │
    ▼ Evidence Layer
EvidenceConstruct records with lineage
    │
    ▼ /qori-report
Research Readout artifact
```

### Evidence Construct Types Created

| Stage | Construct Types | Derivation |
|-------|----------------|------------|
| Analysis | nugget, survey_pattern, usability_finding | model |
| Synthesis | theme, finding, recommendation, persona | model |
| Human review | finding (accepted), recommendation (accepted) | human (via UX-2B review) |

### Traceability IDs

Every evidence construct gets:
- `id` — internal PK
- `public_id` — stable UUID for external references
- `cascade_variable_key` — links to study_variables for cascade consumption
- Lineage relationships: `DERIVED_FROM`, `SYNTHESIZED_FROM`, `SUPPORTS`, `ADDRESSES`

---

## Workspace Design Notes

- Analysis → "Analyze Session" page with session picker and progress stepper
- Synthesis → "Run Synthesis" page with method selection and enrichment picker
- Findings review → finding cards with accept/reject per UX-2B (designed in finding-detail.md)
- Recommendation review → recommendation cards with accept/reject per UX-2B
- Evidence browser → designed in evidence screen spec
- Key gap: no "analysis workspace" for interactive nugget/theme manipulation — all AI-driven, researcher reviews output
