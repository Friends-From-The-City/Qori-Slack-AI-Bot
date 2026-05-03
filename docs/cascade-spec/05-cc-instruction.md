# CC Instruction — Make the Target Brief Real

This is the consolidated instruction to ship the cascade-aware brief. Reference these four documents as the authoritative target spec:

- `01-target-brief-output.md` — Target output
- `02-target-brief-modal.md` — Target modal
- `03-variable-structure.md` — Required variable depth
- `04-standards-section.md` — Cascade-aware pattern (Section 8)

---

## Scope

Make the brief produce `01-target-brief-output.md` from the modal in `02-target-brief-modal.md`, supported by variable structure in `03-variable-structure.md`, following pattern in `04-standards-section.md`.

This is the reference implementation. Other cascade-consuming templates apply this pattern after this ships.

---

## Implementation phases

### Phase 1: Schema depth (foundation)

Expand the variable schemas to match `03-variable-structure.md`:

**Modify existing shared schemas:**
1. `config/schemas/discovered_barrier.yaml` — add: `id`, `title`, `summary`, `magnitude`, `evidence`, `affected_population`, `source_document`, `confidence`
2. `config/schemas/stakeholder_constraint.yaml` — add: `source_role`, `source_team`, `verbatim_quote`, `broader_pattern`, `research_implication`, `implementation_implication`
3. `config/schemas/alignment_gap.yaml` — add: `stated_position`, `actual_behavior`, `acknowledged_by`, `verbatim_quote`, `consequence`, `addressable_in_research`

**Create new shared schemas:**
4. `config/schemas/discovered_metric.yaml`
5. `config/schemas/discovered_journey.yaml`
6. `config/schemas/methodology_recommendation.yaml`
7. `config/schemas/stakeholder_priority.yaml`
8. `config/schemas/stakeholder_question.yaml`
9. `config/schemas/survey_theme.yaml`
10. `config/schemas/survey_finding.yaml`
11. `config/schemas/survey_recommendation.yaml`

Reference `03-variable-structure.md` for exact field structure.

### Phase 2: Discovery template emits update

**`config/prompts/desk_research.yaml`:**
- Add `methodology_recommendations` to emits (uses new schema)
- Update `discovered_barriers` emit to use deepened schema
- Update `discovered_metrics` emit to use new schema
- Add `discovered_journeys` emit (new)

**`config/prompts/stakeholder_synthesis.yaml`:**
- Update `stakeholder_constraints` emit to use deepened schema
- Update `alignment_gaps` emit to use deepened schema
- Add `stakeholder_priorities` emit (new schema)
- Add `stakeholder_questions_for_users` emit (new schema)
- Update existing `backstage_observations` and `system_failure_modes` to capture verbatim quotes and source attribution

**`config/prompts/survey_synthesis.yaml`:**
- Add `survey_themes` emit (new schema)
- Add `survey_findings` emit (new schema)
- Add `survey_recommendations` emit (new schema)
- Add `sample_demographics` emit (new schema)
- Update `discovered_barriers` and `discovered_metrics` to use deepened schemas

### Phase 3: Extract phase update

**`backend/src/helpers/variableExtractor.js`:**

Update the Haiku extraction prompt to instruct for fidelity. Add this paragraph to the existing extraction prompt:

```
EXTRACTION FIDELITY REQUIREMENTS

Extract with maximum semantic fidelity. For each variable instance:
- Capture verbatim quotes when present in source
- Capture source attribution with role context (not just "SH-001" but "SH-001 Product Owner, OCTO Mobile Experience")
- Capture related broader patterns from the same document
- Capture research implications and implementation implications when present in source
- Do not summarize or abbreviate

If the source document has rich content for a constraint, the extracted variable must reflect that depth across its schema fields. Thin extraction is the failure mode to avoid.

The schema defines the structure — your job is to FILL it with maximum content from the source, not minimum viable values.
```

### Phase 4: Brief consumes update

**`config/prompts/research_brief.yaml`:**

Update consumes block per `03-variable-structure.md`. Specifically:
- Add `methodology_recommendations` consumption (drives method pre-population)
- Add `stakeholder_questions_for_users` consumption (drives research questions pre-population)  
- Add `survey_themes`, `survey_findings`, `survey_recommendations` consumption
- Add `pool_aggregation: union` flag where pools span multiple discovery sources
- Update inject_as values per spec

### Phase 5: Brief modal redesign

**`backend/src/helpers/slack/ui/researchBriefModal.js`:**

Implement the modal in `02-target-brief-modal.md`. Specifically:

1. **On modal open:**
   - Load discovery artifacts via existing `loadDiscoveryArtifacts(team)`
   - Auto-select all discovery checkboxes (default checked)
   - Aggregate variables from all auto-selected artifacts
   - Pre-populate the cascade-driven fields (Method, Participants, Research questions, Out of scope, Risks preview)
   - Add ✨ sparkle markers below pre-populated fields with provenance text

2. **Pre-population logic:**
   - **Method:** Find most-recommended method across `methodology_recommendations`. Show "Recommended by N sources" hint.
   - **Participants:** Synthesize segments from accessibility evidence + stakeholder recruitment recommendations + survey demographics
   - **Research questions:** Pull `stakeholder_questions_for_users` filtered to Blocking + first 1-2 Important
   - **Out of scope:** Pull from synthesis (items discovery has established + researcher's manual additions)
   - **Risks preview:** Pull from `stakeholder_constraints` filtered to constraints affecting study execution. Display as preview cards with source attribution. Full risks generated by Sonnet during Generate.

3. **When no discovery exists:**
   - Show empty state per `02-target-brief-modal.md`
   - Collapse cascade-driven sections
   - Researcher fills everything manually

4. **Researcher-only fields stay empty:**
   - Problem statement (Sonnet enriches with discovery during Generate — labeled accordingly)
   - Decision deadline
   - Budget
   - Timeline preference

### Phase 6: Generate prompt update

**`config/prompts/research_brief.yaml` Generate prompt:**

Add the cascade-aware generation instruction from `04-standards-section.md` Section 8.5:

```
CASCADE-AWARE GENERATION

You are generating a document with access to upstream discovery variables. Your job is to SYNTHESIZE these into the document, not LIST them.

Specifically:
- Every claim sourced from upstream must carry a citation marker [D1], [S2], [V3] etc.
- Use ONLY metrics from upstream variables. Do not invent statistics.
- Reference verbatim quotes when they sharpen the prose.
- Where multiple sources support a claim, cite all (e.g., [D2, V4]).
- Where researcher input contradicts upstream, defer to upstream and flag the discrepancy.

Citation markers:
- [D1, D2...] for desk research findings, in order of first appearance
- [S1, S2...] for stakeholder synthesis findings
- [V1, V2...] for survey ("Voice of customer") findings

The bottom Discovery sources appendix maps your citation markers to source artifacts.

If a section has no upstream support, write from researcher input alone without fabricating citations.
```

### Phase 7: Brief output template update

**`config/prompts/research_brief.yaml` output template:**

Restructure to match `01-target-brief-output.md`:

1. Summary with citation markers woven in
2. Quick-stats table (method, participants, timeline, deadline, budget)
3. Problem section with cascade-enriched prose and inline citations
4. What we'll learn — questions sourced from stakeholder_questions_for_users with attribution
5. Method section with discovery-recommendation rationale
6. Participants table with segment rationale per source
7. Timeline table
8. Out of scope with rationale (discovery-established items noted)
9. Risks table with source attribution
10. Approval checklist
11. **NEW: Discovery sources appendix** — maps citation markers to source artifacts
12. Document Information footer

### Phase 8: Standards doc update

Add Section 8 to standards documentation per `04-standards-section.md`. This becomes the canonical pattern for all future cascade-aware templates.

### Phase 9: Version bump

Increment `research_brief.yaml` version from v5.0.1 → v6.0. Document the change in YAML notes section.

---

## Verification — what success looks like

After all 9 phases ship:

1. **Run `/qori-discover` three times** to generate desk_research, stakeholder_synthesis, and survey_synthesis discovery for "va-mobile-navigation" topic. Use the actual three source documents from earlier testing.

2. **Verify `study-variables.json` for each discovery is RICH** — open the JSON files and confirm each variable instance has verbatim quotes, source attribution with role context, broader patterns, and implications. Example: `stakeholder_constraints[0]` should have all 9 fields populated, not just 3.

3. **Run `/qori-brief`** for a new study. Verify modal:
   - Shows 3 discovery checkboxes auto-selected
   - Pre-populates Method as "Card sorting + tree testing" with sparkle marker showing "Recommended by 3 discovery sources"
   - Pre-populates Participants with AT user representation
   - Pre-populates Research questions from stakeholder_questions_for_users
   - Pre-populates Out of scope with discovery-established items
   - Shows Risks preview from stakeholder_constraints

4. **Submit brief without modifying pre-population.** Verify generated brief:
   - Reads as one coherent document (not researcher input + variable dump)
   - Has citation markers ([D1], [S2], [V3]) throughout
   - Has Discovery sources appendix mapping markers to sources
   - References specific verbatim quotes from stakeholder synthesis
   - Cites specific metrics from desk research
   - References specific survey findings with sample sizes

5. **Generated brief should match `01-target-brief-output.md` in structure and richness.** Some surface variation expected (different study name, different stakeholder, etc.) but the cascade behavior must match.

If verification passes — brief is shipped. Pattern is locked. Other templates apply same pattern.

If verification fails — diagnose specific gap (modal not pre-populating? Extract still thin? Generate not citing?) and fix before scaling pattern.

---

## What NOT to do in this work

- Don't apply this pattern to other templates yet. Only the brief. Once verified, we scale.
- Don't change the architectural foundation (study-variables.json structure, GET pipeline, Postgres index). All these stay as-is.
- Don't rebuild the discoveryLoader, discoverHandler, or other cascade infrastructure. Phase 5 modifies one modal, not all modals.
- Don't add staleness detection, validation CI, or other v2 features. This is brief-focused.
- Don't migrate existing discovery data. The v5.0.1 → v6.0 bump means existing studies use old behavior; new studies use new behavior.

---

## Effort estimate

| Phase | Effort | Notes |
|-------|--------|-------|
| 1. Schema depth | M (4-6 hours) | 3 expansions + 8 new schemas |
| 2. Discovery emits | M (3-4 hours) | 3 YAML files |
| 3. Extract prompt | S (30 min) | One paragraph addition |
| 4. Brief consumes | S (1 hour) | YAML edit |
| 5. Brief modal | L (6-8 hours) | Most complex single piece |
| 6. Generate prompt | S (1 hour) | Prompt addition |
| 7. Output template | M (3-4 hours) | Template restructure |
| 8. Standards doc | S (30 min) | Add Section 8 |
| 9. Version bump | XS (5 min) | YAML version update |
| **Total** | | **18-25 hours focused work** |

This is 2-3 days of CC time. After this ships and verifies, applying the pattern to other templates becomes mechanical (each template ~4-6 hours).

---

## Order of operations

Build in this order to minimize rework:

1. Schemas first (Phase 1) — everything depends on these
2. Discovery emits (Phase 2) — needed for variables to exist
3. Extract prompt (Phase 3) — needed for variables to be rich
4. Test: re-run all 3 discovery types, verify variables are rich
5. Brief consumes (Phase 4) — needed before modal can read them
6. Brief modal (Phase 5) — needed before researcher can experience cascade
7. Generate prompt (Phase 6) — needed before Sonnet writes with citations
8. Output template (Phase 7) — needed for final structure
9. Test: generate brief, verify against `01-target-brief-output.md`
10. Standards doc (Phase 8) — documentation
11. Version bump (Phase 9) — release marker

After step 4 verification — pause for Lapedra to confirm variable richness before proceeding.
After step 9 verification — pause for Lapedra to confirm brief matches target before standards/version updates.

These two checkpoints prevent compounding error.

---

## Confirm before starting

Before beginning Phase 1, confirm:

1. You have all four target spec documents accessible
2. You understand the brief is the reference implementation — not all templates yet
3. You understand the verification checkpoints (after Phase 3 and Phase 7)
4. You'll pause at checkpoints for Lapedra approval before continuing

When ready, begin Phase 1.
