# Qori Modal Design Standard

This document captures the design rulings for Slack Block Kit modals across the Qori application. Each ruling (R1-R13) addresses a specific aspect of modal presentation and behavior.

> **Standing note:** Ruling numbers are frozen. New rulings get new numbers (R14, R15, etc.). Never reuse or reassign existing ruling numbers — this corrupts references across the codebase and audit artifacts.

---

## Rulings

### R1: No Decorative Emoji

Remove all decorative emoji from modals. Emoji are permitted only when they carry semantic meaning (e.g., `:warning:` for error states). Decorative emoji (`:file_folder:`, `:bust_in_silhouette:`, `:sparkles:`, artifact icons like `📄`, `🎙️`) should be removed.

**Status:** Verified by manual sweep (PR #241). Applied to Research Synthesis, Analyze Session, Tickets, and Research Brief modals.

---

### R2: Action-Oriented Submit Labels

Submit button text should describe the action, not just "Submit". Examples:
- "Analyze" (for analyze modal when transcript is selected)
- "Continue" (for analyze modal cascade steps)
- "Generate" (for synthesis modal)
- "Create Brief" (for brief modal)

**Verb table by action type:**

| Action type | Verb |
|-------------|------|
| Primary generation | "Generate", "Create", "Analyze" |
| Continue to next step | "Continue" |
| Launches a sub-modal | "Open" (see R14) |

**Status:** Verified by manual sweep (PR #241).

---

### R3: No Redundant Section Headers

Remove redundant section headers when the input label is self-explanatory. For example, a "Research Study" section header followed by a "Study *" select is redundant — the label suffices. No imperatives ("Select a..."), no colons after labels.

**Status:** Verified by manual sweep (PR #241).

---

### R4: Domain-Accurate Terminology

Use terminology that matches the domain. "Synthesis" (not "Analysis") for cross-session synthesis methods. "Analyze" for single-session analysis.

**Status:** Verified by manual sweep (PR #241).

---

### R5: Researcher-Friendly Labels

Translate system labels to researcher language. Examples:
- "participant metadata" → "participant"
- "target_barriers" → "target barriers"
- Strip `_metadata` suffixes and convert `snake_case` to spaces.

**Status:** Verified by manual sweep (PR #241).

---

### R6: App Icon Consistency

The production app icon is canonical. The blue-book icon visible in the dev environment is a dev-environment artifact (the Qori Dev Slack app). No code change required — verify against production.

**Status:** Verified. No action needed.

---

### R7: Required/Optional Field Convention

Optional fields carry a `(optional)` suffix added by Slack's `optional: true` flag; all unmarked fields are required. No asterisks.

A field is REQUIRED if and only if:

**(a) Cascade-required:** The cascade variable it populates is consumed with `required: true` by a downstream template (per `emits`/`consumes` contracts in YAML templates), OR

**(b) Operationally required:** It is routing/identity (study selection) or a workflow gate (stakeholder/approver assignment).

**(c) Primary content input:** The field(s) a content-entry surface exists to capture; where alternative inputs exist, at least one is required, enforced at handler level.

Closed list. Everything else is optional.

Prefill from discovery satisfies but does not alter required status.

**Before changing modal code:** Derive the required-field set from YAML contracts (see §6 Required Field Derivation).

**Resolved ambiguities:**

- **`study_name`** — REQUIRED under (b): routing/identity field.
- **`stakeholder`** — REQUIRED under (b): workflow gate (approver assignment).
- **`problem_statement`** — REQUIRED under (a): `target_barriers` is hard-required downstream (`research_plan.yaml:69-73`, `discussion_guide.yaml:69-73`) and AI-generated from `problem_statement` + discovery. In the empty-cascade case (no discovery selected), an empty `problem_statement` forces the AI task to generate barriers from nothing — fabricated provenance flowing into plan and discussion guide. `problem_statement` is the human grounding; required.
- **`session_date`, `session_time`, `current_status`** (Add Participant) — OPTIONAL. Not cascade-required (participant records don't feed YAML templates), not routing/identity, not workflow gates. These are operational metadata for scheduling, not required inputs.
- **`recruitment_method`** (Add Participant) — REQUIRED under (b): recruitment-source tracking supports federal research methodology auditability. Resolved 2026-08-04.
- **`race_ethnicity`, `age_range`, `education_level`, `location_type`** (Add Participant) — REQUIRED. Demographics support research quality (representative sampling documentation), participant tracker breakdowns, and DSAR completeness (federal records management). NOTE: these fields do NOT enter the cascade — `participant_metadata` is LLM-extracted from transcripts, not from DB demographics (corrected 2026-08-05; see backlog item "DB demographics as authoritative cascade source"). Every demographics dropdown includes a "Prefer not to say" option — honest data that respects data-minimization in a federal context. `race_ethnicity` is multi-select per OMB SPD-15 (2024 revision). Unfreezes §6.7 design freeze (2026-08-04).

**Status:** Derivation complete for Brief, Analyze, Synthesis, Readout, Add Participant, Session Notes. Pending: Discover modals.

---

### R8: Help Text Placement and Voice

Help text (hints) should:
- Use sentence case, not CAPS emphasis
- Use **bold** for emphasis, not CAPS or italics
- Be concise — one line preferred
- Appear below the field, not in placeholders that duplicate help text

**Status:** Pending audit.

---

### R9: Dividers

Use dividers sparingly, only between logical groups. Do not use dividers:
- Before every field
- After every field
- To create visual "boxes" around single fields

**Status:** Verified by manual sweep (PR #241).

---

### R10: Information Hierarchy

- **Primary inputs** (study select, method select): Use `input` blocks with labels
- **Grounding/status info**: Use `context` blocks (subordinate, smaller text)
- **Section dividers**: Use sparingly, only between logical groups
- **Warnings**: Use `context` blocks with `:warning:` prefix
- **One primary button per modal**: Submit is primary; secondary actions (Load, Refresh) are non-primary style

**Status:** Verified by manual sweep (PR #241).

---

### R11: Help Text Earns Its Place

Guidance only where a choice is non-obvious. No help text on self-evident fields. If the label and placeholder make the expected input clear, omit the hint.

Examples of unnecessary help text:
- "Enter the study name" on a field labeled "Study name"
- "Select a date" on a datepicker
- Help text that duplicates the placeholder text

**Status:** Pending audit.

---

### R12: Grounding Context Blocks

When showing cascade context (session counts, nuggets, enrichments), use a single subordinate context block with the pattern:

```
*Using:*  1 session • 12 nuggets • 5 target barriers
```

or

```
*Analyzing against:*  3 barriers • 5 questions • Usability Testing
```

Keep grounding information compact — one line, `•` separators, no decorative emoji.

**Status:** Verified by manual sweep (PR #241).

---

### R13: Proper Pluralization

Use correct singular/plural forms:
- `${count} finding${count !== 1 ? 's' : ''}`
- `${count} session${count !== 1 ? 's' : ''}`
- `${count} barrier${count !== 1 ? 's' : ''}`

**Status:** Verified by manual sweep (PR #241).

---

### R14: Hub Launcher Verb

Rows in a hub modal that open a sub-modal use ONE verb product-wide: **"Open"**. This applies to:
- Admin Center rows (Participant Data, Delete Study, etc.)
- Discovery launcher rows

Do not use "Start", "Launch", "View", or other verbs for sub-modal launchers.

**Status:** Pending. Discovery launcher uses "Start" (violation). Admin Center rows use "Open" (conforms).

---

### R15: Danger Styling is Exclusive

Destructive actions get Slack's `danger` (red) style. **Only** destructive actions get a filled style in a multi-action surface; all non-destructive launchers/buttons alongside them use `default` (outlined) style.

One loud thing per surface.

**Status:** Pending. Admin Center "Participant Data" row uses filled style alongside Delete Study (violation).

---

### R16: Scope — All Researcher-Facing Surfaces

This design standard governs **all** researcher-facing surfaces — modals, DMs, dashboards, ephemeral messages, and channel posts. Surfaces are not exempted by being "just a message."

**Ruling applicability by surface type:**

| Ruling | Modals | DMs / Channel posts / Ephemeral |
|--------|:------:|:-------------------------------:|
| R1 No decorative emoji | ✓ | ✓ |
| R2 Action-oriented labels | ✓ | ✓ (button text) |
| R3 No redundant headers | ✓ | N/A |
| R4 Domain-accurate terminology | ✓ | ✓ |
| R5 Researcher-friendly labels | ✓ | ✓ |
| R6 App icon | N/A | N/A |
| R7 Required/optional convention | ✓ | ✓ (input blocks in DMs) |
| R8 Help text voice | ✓ | ✓ |
| R9 Dividers | ✓ | N/A |
| R10 Information hierarchy | ✓ | N/A |
| R11 Help text earns its place | ✓ | ✓ |
| R12 Grounding context blocks | ✓ | N/A |
| R13 Proper pluralization | ✓ | ✓ |
| R14 Hub launcher verb | ✓ | N/A |
| R15 Danger styling | ✓ | ✓ (destructive buttons) |

**Status:** Ratified 2026-08-04.

---

### R17: Routing Selectors First

Routing selectors (Study, Session) are always the **first interactive element** in a modal. Mode tabs, input fields, and content blocks follow. The researcher establishes context before choosing what to do with it.

This applies to any modal that combines a routing selector with mode tabs or conditional content. Session Notes is the canonical example: Select Session appears above the Manual Notes / Upload Transcript tabs.

**Status:** Ratified 2026-08-05.

---

## §5: Conformance Checklist

Per-modal audit state. ✓ = conforms, — = violation found, ? = not audited, N/A = not applicable.

Scores reflect CURRENT code state, not intended state. A cell flips to ✓ with PR number when the fix ships.

| Modal | R1 | R2 | R3 | R4 | R5 | R6 | R7 | R8 | R9 | R10 | R11 | R12 | R13 | R14 | R15 |
|-------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:---:|:---:|:---:|:---:|:---:|
| Research Brief | ✓ | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | ? | ✓ | ✓ | ? | ✓ | ✓ | N/A | N/A |
| Analyze Session | ✓ | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | ? | ✓ | ✓ | ? | ✓ | ✓ | N/A | N/A |
| Research Synthesis | ✓ | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | ? | ✓ | ✓ | ? | ✓ | ✓ | N/A | N/A |
| Readout | ? | ? | ? | ? | ? | N/A | ? | ? | ? | ? | ? | ? | ? | N/A | N/A |
| Discussion Guide | ? | ? | ? | ? | ? | N/A | ? | ? | ? | ? | ? | ? | ? | N/A | N/A |
| Research Plan | ? | ? | ? | ? | ? | N/A | ? | ? | ? | ? | ? | ? | ? | N/A | N/A |
| Discovery Launcher | ✓ | ? | ? | ? | ? | N/A | ? | ? | ? | ? | ? | ? | ? | ✓ | N/A |
| Discover: Desk Research | ? | ? | ? | ? | ? | N/A | ✓ | ? | ? | ? | ? | ? | ? | N/A | N/A |
| Discover: Stakeholder | ? | ? | ? | ? | ? | N/A | ✓ | ? | ? | ? | ? | ? | ? | N/A | N/A |
| Discover: Survey | ? | ? | ? | ? | ? | N/A | ? | ? | ? | ? | ? | ? | ? | N/A | N/A |
| Project Creation | ? | ? | ? | ? | ? | N/A | ? | ? | ? | ? | ? | ? | ? | N/A | N/A |
| Add Participant | ✓ | ? | — | ? | ? | N/A | — | — | ? | ? | — | ? | ? | N/A | N/A |
| Update Participant | ✓ | ? | ? | ? | ? | N/A | — | ? | ? | — | ? | ? | ? | N/A | N/A |
| Add Observer | ✓ | — | ? | ? | ? | N/A | ✓ | ? | ? | ? | ? | ? | ? | N/A | N/A |
| Session Notes | ✓ | — | — | ? | ? | N/A | ? | ? | ? | — | — | ? | ? | N/A | N/A |
| Participant Outreach | ✓ | — | — | ? | ? | N/A | — | — | ? | ? | ? | ? | ? | N/A | N/A |
| Session Confirmation | ✓ | — | ? | ? | ? | N/A | — | ? | ? | ? | ? | ? | ? | N/A | N/A |
| Tickets | ✓ | ✓ | ✓ | ✓ | ✓ | N/A | ? | ? | ✓ | ✓ | ? | ✓ | ✓ | N/A | N/A |
| PII Review (transcript) | ✓ | ✓ | ✓ | ? | ? | N/A | ? | ? | ? | ? | ? | ? | ? | N/A | N/A |
| PII Review (manual notes) | — | ? | ? | ? | ? | N/A | ? | ? | ? | ? | ? | ? | ? | N/A | N/A |
| Fieldwork Dashboard | ? | ✓ | ? | ? | ? | N/A | ? | ? | ? | ? | ? | ? | ? | N/A | N/A |
| Join Observer | ✓ | ✓ | ? | ? | ? | N/A | ? | ? | ? | ? | ? | ? | ? | N/A | N/A |
| Admin Center Hub | ? | — | ? | ? | ? | N/A | ? | ? | ? | ? | ? | ? | ? | ✓ | — |
| Admin — Delete Study | ? | — | ? | ? | ? | N/A | ? | ? | ? | ? | ? | ? | ? | N/A | N/A |
| Admin — Manage Stakeholder | ? | ✓ | ? | ? | ? | N/A | ? | ? | ? | ? | ? | ? | ? | N/A | N/A |
| **Inline surfaces (R16)** | | | | | | | | | | | | | | | |
| Plan Launcher | ✓ | — | ? | ? | ? | N/A | ? | ? | ✓ | ? | ? | ? | ? | — | N/A |
| Research Plan Generator | ✓ | ? | ? | ? | ? | N/A | ? | ? | ? | ? | ? | ? | ? | N/A | N/A |
| Request Changes | ✓ | ? | ? | ? | ? | N/A | ? | ? | ? | ? | ? | ? | ? | N/A | N/A |
| Mark Changes Complete | ✓ | ? | ? | ? | ? | N/A | ? | ? | ? | ? | ? | ? | ? | N/A | N/A |
| Research Shareout | ✓ | ? | ? | ? | ? | N/A | ? | ? | ? | ? | ? | ? | ? | N/A | N/A |
| Upload Notes | ✓ | ? | ? | ? | ? | N/A | ? | ? | ? | ? | ? | ? | ? | N/A | N/A |
| Observer Guide DM | ✓ | N/A | N/A | ? | ? | N/A | N/A | ? | N/A | N/A | ? | N/A | ? | N/A | N/A |
| Study Result Blocks | ✓ | N/A | N/A | ? | ? | N/A | N/A | ? | N/A | N/A | ? | N/A | ? | N/A | N/A |
| Observer CTA (channel) | ? | ? | N/A | ? | ? | N/A | N/A | ? | N/A | N/A | ? | N/A | ? | N/A | ? |
| Generation Progress DMs | ? | N/A | N/A | ? | ? | N/A | N/A | ? | N/A | N/A | ? | N/A | ? | N/A | N/A |
| Error/Contract DMs | ? | N/A | N/A | ? | ? | N/A | N/A | ? | N/A | N/A | ? | N/A | ? | N/A | N/A |
| Observer Awareness DM | ? | N/A | N/A | ? | ? | N/A | N/A | ? | N/A | N/A | ? | N/A | ? | N/A | N/A |

**Legend:**
- ✓ Conforms
- — Violation found (see §7 for details)
- ? Not yet audited
- N/A Not applicable to this modal

**R7 scoring notes:**
- Brief R7 = —: §6.2 shows out_of_scope, start_date, decision_deadline hard-required in code but R7 says optional
- Analyze R7 = —: Uses asterisk in "Study *" label (analyzeNotesModal.ts:151) violating R7 no-asterisks rule
- Add Observer R7 = ✓: Uses `optional: true` correctly on lines 41, 69

---

## §5.1: Modal Inventory (Appendix)

> **Note:** Some surfaces are built inline in handlers, not as separate modal files. The inventory below covers `/ui/` files; inline surfaces are listed separately at the end to prevent omission in audits.

| Modal File | Primary Template | Command |
|------------|------------------|---------|
| `researchBriefModal.ts` / `researchBriefEntryModal.ts` | `research_brief.yaml` | `/qori-brief` |
| `analyzeNotesModal.ts` | `session_summary.yaml` | `/qori-analyze` |
| `researchSynthesisModal.ts` | `affinity_mapping.yaml`, `journey_mapping.yaml`, etc. | `/qori-synthesis` |
| `readoutModal.ts` | `research_readout.yaml`, `designer_readout.yaml`, etc. | `/qori-readout` |
| `discussionGuideModal.ts` | `discussion_guide.yaml` | `/qori-guide` |
| `researchPlanGeneratorModal.ts` | `research_plan.yaml` | `/qori-plan` |
| `discoverHubModal.ts` | (launcher) | `/qori-discover` |
| `discoverTypeModals.ts` | `desk_research.yaml`, `stakeholder_synthesis.yaml`, `survey_synthesis.yaml` | `/qori-discover` |
| `projectCreationModal.ts` | (creates project, no template) | `/qori-project` |
| `addParticipantModal.ts` | (DB operation, no template) | (fieldwork) |
| `sessionNotesModal.ts` | (upload handler) | `/qori-notes` |
| `uploadNotesModal.ts` | (upload handler) | `/qori-notes` |
| `addObserverModal.ts` | (DB operation, no template) | (fieldwork) |
| `outreach/*.ts` | (messaging templates) | `/qori-outreach` |

**Modals built as separate files but missing from the table above:**

| Modal File | Primary Template | Command |
|------------|------------------|---------|
| `studySetupModal.ts` | (launcher) | `/qori-plan` |
| `requestStudyChangesModal.ts` | (DB operation) | (fieldwork) |
| `markChangesCompleteModal.ts` | (DB operation) | (fieldwork) |
| `researchShareoutModal.ts` | (sharing flow) | `/qori-readout` |
| `selfJoinSessionPickerModal.ts` | (observer self-join) | (fieldwork) |

**Inline modals (built in handlers, not separate files):**

| Surface | Location | Flow |
|---------|----------|------|
| PII Review (manual notes) | `sessionNotesHandler.ts:661-700` | DM button approval (DB-held quarantine per ADR 0026) |
| Admin — Delete Study | `adminActionsHandler.ts:686-750` | Inline modal in handler |
| Admin — Manage Stakeholder | `adminActionsHandler.ts:1027-1175` | Inline modal in handler |
| Admin — DSAR sub-modals | `adminActionsHandler.ts:33-110` | Inline modals in handler |

**Non-modal researcher-facing surfaces (R16 scope):**

| Surface | Location | Type | Description |
|---------|----------|------|-------------|
| Observer Guide DM | `observerGuideDM.ts` | DM | Observer guidelines and study context |
| Study Result Blocks | `studyResultBlocks.ts` | Channel post | Study creation/fieldwork result notifications |
| Observer CTA | `addObserverHandler.ts:200-228` | Channel post | "Join as observer" button in study channel |
| Observer Awareness DM | `addObserverHandler.ts:400-404` | DM | Researcher notified when someone self-joins |
| Generation Progress DMs | Various handlers | DM | "Generating your plan..." → result messages |
| Error/Contract DMs | `slackHelpers.ts`, various | DM | TemplateContractError and API failure messages |
| PII Review DM (transcript) | `sessionNotesHandler.ts` | DM | Approve/reject buttons for quarantined transcripts |

---

## §6: Required Field Derivation

**Status:** Audit in progress. Tables below derived from YAML contracts.

For each modal in §5, derive:
- field → cascade variable it populates → downstream consumer(s) → required Y/N
- Cite YAML file + section for each consumer claim
- Flag ambiguous contracts

---

### 6.0 Cascade Loading: YAML Consumes vs Handler-Side

**Loader semantics (YAML `consumes`):**

Templates with `consumes:` blocks have their upstream variables loaded by `yamlProcessor.ts:249-289`. The enforcement point for `required: true` is at `yamlProcessor.ts:271-279`:

```typescript
for (const spec of yamlConfig.consumes) {
  if (spec.required && !upstream[spec.key]) {
    throw new TemplateContractError(
      yamlConfig.id,
      spec.key,
      `Required cascade variable '${spec.key}' is missing for template '${yamlConfig.id}'.`
```

**Brief discovery consumption — handler-side loading:**

`research_brief.yaml` has **no `consumes:` block**. Discovery is loaded manually by `briefHandler.ts` based on researcher checkbox selections. This is documented at `research_brief.yaml:67-69`:

```yaml
# Brief uses MANUAL discovery loading via briefHandler.ts (not YAML consumes).
# Researcher selects which discovery artifacts to include via modal checkboxes.
# This is intentional — researcher controls which sources inform the brief.
```

**Discovery→Brief consumption path (file+line citations):**

| Step | Location | Operation |
|------|----------|-----------|
| 1 | `briefHandler.ts:396` | Extract user's discovery checkbox selections |
| 2 | `briefHandler.ts:399` | `loadDiscoveryArtifacts(projectId)` loads all discovery artifacts from Postgres |
| 3 | `briefHandler.ts:401` | Filter to selected artifacts based on slugs |
| 4 | `briefHandler.ts:404` | `aggregateDiscoveryVariables(selectedArtifacts)` aggregates into `upstream_*` format |
| 5 | `briefHandler.ts:405` | `Object.assign(discoveryContext, upstreamVars)` merges into context |
| 6 | `briefHandler.ts:433` | `...discoveryContext` spread into `structuredTaskData` — feeds AI tasks |
| 7 | `discoveryLoader.ts:160-214` | `aggregateDiscoveryVariables()` prefixes keys with `upstream_`, merges arrays, formats as markdown |
| 8 | `research_brief.yaml:199-260` | AI tasks consume via Jinja conditionals: `{% if upstream_discovered_barriers %}` |

**Why handler-side:** Research brief is the first document in study lifecycle. Prior discovery inputs are optional enrichment selected per-brief. YAML `consumes:` would imply required dependencies; handler-side loading enables researcher control over which discovery sources inform each brief.

**Discovery provenance recording:** NOT recorded in DB. The set of discovery sources used is rendered into the brief's markdown footer (research_brief.yaml:534-543: `{{#if discovery_sources}}...{{discovery_sources}}...{{/if}}`) but not stored in any database table. Traceability exists only in the rendered document. If the generated markdown is lost or overwritten, provenance is lost.

---

### 6.0.1 Consumes Entry Audit

**session_summary.yaml lines 77-80 (verbatim):**
```yaml
  - coded_transcript_content:
      type: "hidden"
      # Handler-provided: analyzeNotesHandler.ts fetches transcript content
      # directly from notes marked transcript=true. No YAML derivation.
```

These are `input_variables`, NOT consumes entries. The consumes section starts at line 89.

**Important:** `input_variables` entries are OUTSIDE cascade contract enforcement. The loader (`yamlProcessor.ts:271-279`) only checks `consumes` entries for `required: true`. Input variables with no explicit default are handler-provided — if a handler fails to provide one, the template renders with an empty/undefined value, potentially generating malformed output. This is why R7(c) requires handler-level enforcement for primary content inputs.

**All consumes entries across all templates have explicit `required:` flags.** Sweep confirmed:
- All templates with consumes sections (session_summary, research_plan, discussion_guide, affinity_mapping, etc.) explicitly declare `required: true` or `required: false` on every entry.
- No silently degrading contracts under current loader behavior (`yamlProcessor.ts:271-279` only throws on explicit `spec.required === true`).

**Verification:** Entries without `required:` in grep output are in `emits:` sections, not `consumes:` sections.

---

### 6.0.2 Discovery Type ID Matching

**Loader identifiers** (discoveryLoader.ts:32-36):
```typescript
{ type: 'desk-research', icon: '📄', label: 'desk research' },
{ type: 'stakeholder-interviews', icon: '🎙️', label: 'stakeholder' },
{ type: 'survey-synthesis', icon: '📊', label: 'survey' },
```

**source_template values stored in DB** (from discoverHandler.ts:112-129):
- `desk_research` → writes to type `desk-research`
- `stakeholder_synthesis` → writes to type `stakeholder-interviews`
- `survey_synthesis` → writes to type `survey-synthesis`

**Mapping** (studyVariables.ts:18-29):
```typescript
const TEMPLATE_TO_DISCOVERY_TYPE: Record<string, string> = {
  'desk_research': 'desk-research',
  'stakeholder_synthesis': 'stakeholder-interviews',
  'survey_synthesis': 'survey-synthesis',
};
const DISCOVERY_TYPE_TO_TEMPLATE: Record<string, string> = {
  'desk-research': 'desk_research',
  'stakeholder-interviews': 'stakeholder_synthesis',
  'survey-synthesis': 'survey_synthesis',
};
```

**Mapping verified in code.** The mapping layer correctly translates between YAML template IDs (`desk_research`) and discovery type identifiers (`desk-research`). The near-miss "Stakeholder synthesis" (modal label) vs "stakeholder-interviews" (type identifier) is intentional — label is UI-facing, type is storage-key.

**Stored values verified (2026-07-09, dev + prod):**
```sql
SELECT DISTINCT source_template FROM study_variables WHERE scope = 'discovery';
```
```
-- Dev:
 desk_research
 stakeholder_synthesis
(2 rows)

-- Prod:
 stakeholder_synthesis
 desk_research
(2 rows)
```

No `_processor`-suffixed values exist in either environment. Stored values match current YAML template IDs exactly. ID matching confirmed.

---

### 6.1 Research Brief Modal

**Emits → Consumes chain analysis:**

| Brief emits | Required by downstream | YAML citation |
|-------------|------------------------|---------------|
| `research_objectives` | research_plan (required), discussion_guide (required) | `research_plan.yaml:54-58`, `discussion_guide.yaml:54-58` |
| `research_questions` | research_plan (required), discussion_guide (required) | `research_plan.yaml:59-63`, `discussion_guide.yaml:59-63` |
| `target_barriers` | research_plan (required), discussion_guide (required) | `research_plan.yaml:69-73`, `discussion_guide.yaml:69-73` |
| `methodology_selection` | research_plan (required), discussion_guide (required) | `research_plan.yaml:64-68`, `discussion_guide.yaml:64-68` |
| `participant_criteria` | research_plan (required) | `research_plan.yaml:74-78` |
| `participant_approach` | research_plan (optional) | `research_plan.yaml:79-83` |
| `out_of_scope` | research_plan (optional) | `research_plan.yaml:89-93` |
| `business_context` | research_plan (optional) | `research_plan.yaml:84-88` |
| `timeline_preference` | research_plan (optional) | `research_plan.yaml:94-98` |
| `start_date` | research_plan (optional) | `research_plan.yaml:99-100` |
| `decision_deadline` | (none) | — |
| `budget` | (none) | — |
| `recruitment_sources` | (none) | — |

**Field → Cascade Variable → Required derivation:**

| Modal Field | Cascade Variable | Required consumer? | R7 Required? | Rationale |
|-------------|------------------|-------------------|--------------|-----------|
| `study_name` | `selected_study` | N/A | **YES** | (b) routing/identity |
| `stakeholder` | `requestor_name` | N/A | **YES** | (b) workflow gate |
| `problem_statement` | → AI generates `target_barriers` | research_plan, discussion_guide | **YES** | (a) human grounding for required target_barriers |
| `learning_objectives` | → AI generates `research_objectives` | research_plan, discussion_guide | **YES** | (a) cascade-required |
| `out_of_scope` | `out_of_scope` | All consumers optional | **NO** | — |
| `research_method` | `methodology_selection` | research_plan, discussion_guide | **YES** | (a) cascade-required |
| `method_override` | (overrides methodology) | Same as research_method | **NO** | Override only |
| `participant_approach` | → AI generates `participant_criteria` | research_plan | **YES** | (a) cascade-required |
| `recruitment_sources` | `recruitment_sources` | No cascade consumer | **NO** | — |
| `start_date` | `start_date` | All consumers optional | **NO** | — |
| `decision_deadline` | `decision_deadline` | No cascade consumer | **NO** | — |
| `budget` | `budget` | No cascade consumer | **NO** | — |

**R7 Derived Required Fields for Brief modal:**
- `study_name` — (b) routing/identity
- `stakeholder` — (b) workflow gate
- `problem_statement` — (a) human grounding for target_barriers
- `learning_objectives` — (a) populates research_objectives
- `research_method` — (a) populates methodology_selection
- `participant_approach` — (a) populates participant_criteria

**R7 Derived Optional Fields:**
- `out_of_scope`
- `method_override`
- `recruitment_sources`
- `start_date`
- `decision_deadline`
- `budget`

---

### 6.2 Current Brief Modal Validation State (by code inspection)

Derived from `researchBriefModal.ts` — fields with `optional: true`:

| Field | Block ID | Has `optional: true` | Slack blocks on empty? |
|-------|----------|---------------------|------------------------|
| study_name | `study_name_block` | No | **YES** |
| stakeholder | `stakeholder_block` | No | **YES** |
| problem_statement | `problem_statement_block` | No | **YES** |
| learning_objectives | `learning_objectives_block` | No | **YES** |
| out_of_scope | `out_of_scope_block` | No | **YES** |
| research_method | `research_method_block` | No | **YES** |
| method_override | `method_override_block` | **Yes** (line 216) | No |
| participant_approach | `participant_approach_block` | No | **YES** |
| recruitment_sources | `recruitment_sources_block` | **Yes** (line 256) | No |
| start_date | `start_date_block` | No | **YES** |
| decision_deadline | `decision_deadline_block` | No | **YES** |
| budget | `budget_block` | **Yes** (line 322) | No |

**Gap analysis:** `out_of_scope`, `start_date`, `decision_deadline` are currently required but should be optional per R7.

---

### 6.3 Analyze Session Modal

**Consumes → field mapping:**

| Consumed variable | Source | Required? | YAML citation |
|-------------------|--------|-----------|---------------|
| `target_barriers` | research_brief | optional | `session_summary.yaml:90-94` |
| `research_questions` | research_brief | optional | `session_summary.yaml:96-100` |
| `methodology_selection` | research_brief | optional | `session_summary.yaml:102-106` |

**Field → Required derivation:**

| Modal Field | Cascade Variable | Required consumer? | R7 Required? | Rationale |
|-------------|------------------|-------------------|--------------|-----------|
| `study_select` | (routing) | N/A | **YES** | (b) routing/identity |
| `session_select` | (routing) | N/A | **YES** | (b) routing/identity — determines which session to analyze |
| `transcript_select` | (primary content) | N/A | **YES** | (c) primary content input. Enforcement: `analyzeNotesHandler.ts:246-252` returns modal error if no transcript. |
| `notes_select` | `notes_content` | Optional by session_summary | **NO** | — |

**Emits:**
- `atomic_nugget_core` → required by affinity_mapping, research_readout (`affinity_mapping.yaml:41-45`, `research_readout.yaml:66-70`)
- `atomic_nugget_detail` → required by affinity_mapping, research_readout (`affinity_mapping.yaml:47-51`, `research_readout.yaml:72-75`)
- `participant_metadata` → required by research_readout (`research_readout.yaml:76-80`)
- `task_completion_records` → optional
- `barrier_validations` → optional

---

### 6.4 Research Synthesis Modal

**Consumes:**

| Consumed variable | Source | Required? | YAML citation |
|-------------------|--------|-----------|---------------|
| `atomic_nugget_core` | session_summary | **required** | `affinity_mapping.yaml:41-45` |
| `atomic_nugget_detail` | session_summary | **required** | `affinity_mapping.yaml:47-51` |
| `target_barriers` | research_brief | optional | `affinity_mapping.yaml:53-57` |
| `research_questions` | research_brief | optional | `affinity_mapping.yaml:59-63` |
| `participant_metadata` | session_summary | optional | `affinity_mapping.yaml:65-69` |

**Field → Required derivation:**

| Modal Field | Cascade Variable | Required consumer? | R7 Required? | Rationale |
|-------------|------------------|-------------------|--------------|-----------|
| `study_select` | (routing) | N/A | **YES** | (b) routing/identity |
| `analysis_method` | (selects template) | N/A | **YES** | (b) determines which template runs |

**Note:** Synthesis modal primarily selects which synthesis method to run. The required inputs (`atomic_nugget_core`, `atomic_nugget_detail`) are loaded from the variable store, not entered via modal fields. If no session summaries exist, synthesis cannot run — this is a cascade precondition, not a modal field.

---

### 6.5 Readout Modal

**Consumes (research_readout.yaml):**

| Consumed variable | Source | Required? | YAML citation |
|-------------------|--------|-----------|---------------|
| `atomic_nugget_core` | session_summary | **required** | `research_readout.yaml:66-70` |
| `atomic_nugget_detail` | session_summary | **required** | `research_readout.yaml:72-75` |
| `participant_metadata` | session_summary | **required** | `research_readout.yaml:76-80` |
| `research_objectives` | research_brief | optional | `research_readout.yaml:44-48` |
| `research_questions` | research_brief | optional | `research_readout.yaml:49-53` |
| `target_barriers` | research_brief | optional | `research_readout.yaml:54-58` |
| `validated_themes` | affinity_mapping | optional | `research_readout.yaml:93-97` |
| `personas` | persona_generator | optional | `research_readout.yaml:103-107` |

**Field → Required derivation:**

| Modal Field | Cascade Variable | Required consumer? | R7 Required? | Rationale |
|-------------|------------------|-------------------|--------------|-----------|
| `study_select` | (routing) | N/A | **YES** | (b) routing/identity |
| `audience_select` | (selects template) | N/A | **YES** | (b) determines which readout runs |

**Note:** Readout modal selects audience and study. Required inputs are loaded from variable store. Cascade preconditions (nuggets must exist) are enforced by the handler, not modal validation.

---

### 6.6 Summary: Required Fields by R7 Derivation

| Modal | R7 Required Fields | R7 Optional Fields | Flagged (policy) |
|-------|-------------------|-------------------|------------------|
| **Brief** | study_name (b), stakeholder (b), problem_statement (a), learning_objectives (a), research_method (a), participant_approach (a) | out_of_scope, method_override, recruitment_sources, start_date, decision_deadline, budget | — |
| **Analyze** | study_select (b), session_select (b), transcript_select (c) | notes_select | — |
| **Synthesis** | study_select (b), analysis_method (b) | — | — |
| **Readout** | study_select (b), audience_select (b) | — | — |
| **Add Participant** | study_select (b), recruitment_method (b), race_ethnicity, age_range, education_level, location_type | participant_name, session_date, session_time, current_status, notes_accommodations | — |
| **Session Notes** | study_select (b), session_select (b), transcript (c, XOR) | observer_notes | — |

---

### 6.7 Add Participant Modal

**Cascade analysis:** This modal does NOT emit cascade variables. Participant records are stored in DB, not passed to YAML templates. Therefore R7(a) does not apply — no downstream consumers.

**Field → Required derivation:**

| Modal Field | R7 Required? | Rationale |
|-------------|--------------|-----------|
| `study_select` | **YES** | (b) routing/identity — determines which study the participant belongs to |
| `participant_name` | **NO** | Private alias, explicitly `optional: true` (line 66) |
| `recruitment_method` | **YES** | (b) recruitment-source tracking supports federal research methodology auditability |
| `session_date` | **NO** | Operational metadata, not cascade-required. Participant can be added before scheduling. |
| `session_time` | **NO** | Operational metadata, not cascade-required. |
| `current_status` | **NO** | Operational metadata — has default (line 123: `initial_option: statusOptions[0]`). |
| `race_ethnicity` | **YES** | Research quality + tracker breakdowns + DSAR completeness; "Prefer not to say" option present |
| `age_range` | **YES** | Research quality + tracker breakdowns + DSAR completeness; "Prefer not to say" option present |
| `education_level` | **YES** | Research quality + tracker breakdowns + DSAR completeness; "Prefer not to say" option present |
| `location_type` | **YES** | Research quality + tracker breakdowns + DSAR completeness; "Prefer not to say" option present |
| `notes_accommodations` | **NO** | Explicitly `optional: true` (line 229) |

**Demographics ruling (2026-08-04, corrected 2026-08-05):** Four demographics fields remain REQUIRED. Demographics support research quality (representative sampling documentation), participant tracker breakdowns, and DSAR completeness. NOTE: these fields do NOT enter the cascade — `participant_metadata` is LLM-extracted from transcripts, not from DB demographics. Every demographics dropdown includes a "Prefer not to say" option, providing honest data while respecting data-minimization in a federal context. `race_ethnicity` is multi-select per OMB SPD-15 (2024 revision): 7 minimum categories, select all that apply, "Prefer not to say" as exclusive alternative. Resolves previous design freeze.

**R7 Derived Required Fields:** `study_select`, `recruitment_method`, `race_ethnicity`, `age_range`, `education_level`, `location_type`.

**R7 Derived Optional Fields:** `participant_name`, `session_date`, `session_time`, `current_status`, `notes_accommodations`.

---

### 6.8 Session Notes Modal

**Cascade analysis:** `coded_transcript_content` is an `input_variable` in session_summary.yaml (lines 77-80), NOT a consumes entry. It has no cascade contract semantics — requiredness rests entirely on R7(c) with handler-level enforcement.

**Field → Required derivation:**

| Modal Field | R7 Required? | Rationale |
|-------------|--------------|-----------|
| `study_select` | **YES** | (b) routing/identity |
| `session_select` | **YES** | (b) routing/identity — determines which session transcript associates with |
| `transcript_files` (upload) | **XOR** | (c) primary content — XOR with `transcript_paste` |
| `transcript_paste` (text) | **XOR** | (c) primary content — XOR with `transcript_files` |
| `observer_notes` | **NO** | Optional supporting context |

**XOR enforcement (5f check):** Handler-level enforcement at `sessionNotesHandler.ts:438-465`:
```typescript
if (filesList.length > 0) {
  const processedFiles: ProcessedFile[] = await processSlackFiles(filesList, process.env.SLACK_BOT_TOKEN!);
  rawContent = processedFiles.map((file: ProcessedFile) => file.content).join('\n\n---\n\n');

  templateData = {
    ...templateData,
    transcript_files: filesList.map((f: { name: string }) => f.name).join(', '),
    filename: filesList[0]?.name || 'transcript_upload.md',
    folder_context: templateData.study_name || '',
    upload_date_utc: new Date().toISOString(),
    transcript_source: 'file_upload',
    manual_notes_text_or_blank: '',
  };
} else if (pastedText) {
  rawContent = pastedText;
  templateData = {
    ...templateData,
    manual_notes_text_or_blank: pastedText
  };
} else {
  await ack();
  ackCalled = true;
  await client.chat.postMessage({
    channel: body.user.id,
    text: `❌ Please either upload files or paste transcript content.`,
  });
  return;
}
```

**Check semantics:**
- `filesList.length > 0` — mere presence (array length check, does not verify file content)
- `pastedText` — truthy check (empty string `''` is falsy, so rejects empty). Does NOT trim — whitespace-only paste `"   "` would pass.

**5f design finding:** The `ack()+DM` pattern closes the modal and discards user input. `analyzeNotesHandler.ts:246-252` uses the standard `response_action: "errors"` pattern that keeps the modal open with inline field errors.

**5f fix spec (implemented, pending review):**

| Fix | Location | Change |
|-----|----------|--------|
| (a) | `sessionNotesHandler.ts:457-465` | Convert to `response_action: "errors"` — modal stays open |
| (b) | `sessionNotesHandler.ts:428` | Trim pastedText before check — whitespace-only fails |
| (c) | `sessionNotesHandler.ts:440` | Validate `rawContent.trim()` after download — empty file content fails |

**What happened TODAY with empty file:** File downloads → `rawContent = ""` → scrubTranscript runs on empty → empty transcript saved to quarantine → user sees PII review modal → if approved, empty transcript committed to Git → `/qori-analyze` generates garbage from no content. No validation existed after download.

**Retrospective audit (2026-07-09, dev + prod):**
- Dev: 8 transcripts (5 approved, 3 pending), 0 empty/whitespace content
- Prod: 0 transcripts
- Git verification: All 4 committed transcripts have 8-12KB content (verified via `gh api` file sizes)
- Note: Approved rows have `pending_content = NULL` (cleared on approval); verification used Git file sizes, not DB content
- Downstream consumers exist (affinity_mapping, research_readout, designer_readout) but derive from non-empty transcripts
- **No evidence of empty content having passed through the system**

**Ship gate:** Manual empty-submit test in dev required before merge.

---

### 6.9 Pending Derivations

| Modal | Status |
|-------|--------|
| Discover: Desk Research | Complete — topic (c) + file_upload (c) required; description optional. Already correctly wired. |
| Discover: Stakeholder Synthesis | Complete — topic (c) + file_upload (c) required; description optional. Already correctly wired. |
| Discover: Survey Synthesis | Complete — topic (c) + survey_name (c) + file_upload (c) required; question_focus optional. Already correctly wired. |
| Discover: Survey Synthesis | Pending (Section 3a) |

---

### 6.10 Backlog Items

See `docs/product-backlog.md` § "Modal design standard findings (2026-07-09)" for: structured discovery provenance, discovery naming-layer consolidation.

---

## §7: Violation Log

Track specific violations found during audit, with fix status.

| Modal | Ruling | Violation | Status |
|-------|--------|-----------|--------|
| Research Brief | R7 | out_of_scope, start_date, decision_deadline hard-required but should be optional | Pending |
| Analyze Session | R7 | "Study *" label uses asterisk (line 151) | Pending |
| Add Participant | R1 | Emoji section headers (📝🗓️📊) | Fixed (PR #241) |
| Add Participant | R3 | "Research study" → "Study" | Pending |
| Add Participant | R7 | Trailing asterisks on required fields | Pending |
| Add Participant | R8 | CAPS emphasis in help text | Pending |
| Add Participant | R11 | Duplicative help text | Pending |
| Update Participant | R1 | Emoji in labels | Fixed (PR #241) |
| Update Participant | R7 | "Update Notes* (optional)" contradiction | Pending |
| Update Participant | R10 | Two primary-style buttons | Pending |
| Add Observer | R1 | Emoji in role options (📝👁️📊🏛️) | Fixed (PR #241) |
| Add Observer | R2 | Button "Done" not action-oriented | Pending |
| Session Notes | R2 | Button "Process & Submit" not action-oriented | Pending |
| Session Notes | R3 | Nested header structure | Pending |
| Session Notes | R10 | Tab renders as green primary | Pending |
| Session Notes | R11 | Duplicative PII scrubbing help | Pending |
| Session Confirmation | R1 | Emoji in section header (📅) | Fixed (PR #241) |
| Session Confirmation | R2 | Has "Generate" but form has asterisks on labels | Pending |
| Session Confirmation | R7 | Asterisks in labels ("Session date *", "Session time *", "Meeting link *") | Pending |
| Participant Outreach | R1 | Emoji in radio options | Fixed (PR #241) |
| Participant Outreach | R2 | Button "Next" not action-oriented | Pending |
| Participant Outreach | R3 | "Select an existing study:" imperative | Pending |
| Participant Outreach | R7 | Trailing asterisk | Pending |
| Discovery Launcher | R1 | Emoji in option rows | Fixed (PR #241) |
| Discovery Launcher | R8 | Italics in help text | Fixed (B1 PR) |
| PII Review (transcript) | R1 | Decorative 🔍 header + 📄 button removed (PR #241); 🔍 DM removed (PR #240); functional ✅⚠️❌ preserved | Fixed (PR #241 + #240) |
| PII Review (manual notes) | R1 | Decorative 🔍 removed from DM; functional ✅⚠️ preserved | Fixed (PR #240) |
| Join Observer | R1 | Emoji in role options (📝👁️📊🏛️) removed from modal (PR #241) and handler (PR #240) | Fixed (PR #241 + #240) |
| Admin Center Hub | R2 | "Open" button label (lines 102, 115) not action-oriented | Pending |
| Admin — Delete Study | R2 | "Open" button label not action-oriented | Pending |
| Plan Launcher | R1 | Emoji in section rows (:clipboard: :speech_balloon:) | Fixed (PR #241) |
| Plan Launcher | R2 | Submit "Done" on launcher modal (no-op) | Fixed (PR #241) |
| Plan Launcher | R9 | Close→Cancel for consistency | Fixed (PR #241) |
| Research Plan Generator | R1 | :clipboard: in context block | Fixed (PR #241) |
| Discussion Guide Modal | R1 | :speech_balloon: in context block | Fixed (PR #241) |
| Readout Modal | R1 | Emoji in report type context and audience checkboxes (📄🎯🎨⚙️♿👔) | Fixed (PR #241) |
| Upload Notes | R1 | Emoji in submit (📤), header (📂), button (📝), section (🤖), context (📁) | Fixed (PR #241) |
| Session Notes | R1 | 💡 in tips context | Fixed (PR #241) |
| Analyze Session | R1 | 📄 in auto-selected transcript context | Fixed (PR #241) |
| Request Changes | R1 | 📝 in section header, 💡 in tip context | Fixed (PR #241) |
| Mark Changes Complete | R1 | 🐛 in GitHub section, ☑️ in notification rows | Fixed (PR #241) |
| Observer Guide DM | R1 | :book: in guidelines link | Fixed (PR #241) |
| Study Result Blocks | R1 | 🗓️ in header, 🔔 in DM text | Fixed (PR #241) |
| Research Shareout | R1 | Emoji in type options (🎯📊👥📄🏛️📐), headers (📋📑📤), tip (💡) | Fixed (PR #241) |
| Copy Email | R1 | 📄 in section text | Fixed (PR #241) |
| Email Preview | R1 | 📄 in button label | Fixed (PR #241) |
| Session Reminder | R1 | 📅 in section header | Fixed (PR #241) |
| Initial Recruitment | R1 | 📋 in section header | Fixed (PR #241) |
| Rescheduling Request | R1 | 🔄 in section header | Fixed (PR #241) |
| Discover: Desk Research | R1 | :page_facing_up: in context | Fixed (PR #241) |
| Discover: Stakeholder | R1 | :studio_microphone: in context | Fixed (PR #241) |
| Discover: Survey | R1 | :bar_chart: in context | Fixed (PR #241) |

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-08-04 | 2.1 | Block A rulings: (A1) Demographics fields REQUIRED with "Prefer not to say" options — resolves §6.7 design freeze. (A2) recruitment_method REQUIRED under R7(b) for federal methodology auditability. (A3) R16: Scope — design standard governs all researcher-facing surfaces (modals, DMs, channel posts, ephemerals). §5 checklist expanded with inline surface rows. §5.1 inventory expanded with missing modals and non-modal surfaces. §6.6/§6.7 updated to reflect resolved flags. |
| 2026-07-31 | 2.0 | R1 emoji sweep: removed all decorative emoji from ~28 modal builder files. Functional emoji (✅❌⚠️:warning:🔴🟡🟢:lock:🗑️) preserved. Plan launcher (studySetupModal): removed vestigial submit block (R2), Close→Cancel (R9). Added new violation log rows for modals found during sweep. |
| 2026-07-10 | 1.9 | Session Notes input preservation fix shipped (`37f50e43`): tab switches no longer clear typed inputs. PII scrubbing fix shipped (`15c0a49f`): participant name now correctly extracted and scrubbed. Whitespace behavior documented (`7b1f31c1`): Slack API strips leading/trailing whitespace from plain_text_input (not fixable). Merged to main as `e454740a`. |
| 2026-07-09 | 1.8 | 5f fix spec implemented in sessionNotesHandler.ts: (a) inline errors, (b) trim paste, (c) validate content after download. Pending manual test. |
| 2026-07-09 | 1.7 | §6.0.2 ID matching verified — SELECT confirms `desk_research`, `stakeholder_synthesis` only, no `_processor` values. |
| 2026-07-09 | 1.6 | §6.8 full code context (lines 438-465), check semantics (presence vs content), 5f design finding (convert ack+DM to inline errors). §6.0.2 conclusion held open pending SELECT query. §6.10 moved to product-backlog.md. |
| 2026-07-09 | 1.5 | §6.3/§6.8 corrected: transcript requiredness is R7(c) with handler enforcement, not R7(a) cascade-required. §6.0.1 input_variables note added (outside contract enforcement). 5f check documented: `sessionNotesHandler.ts:457-465` enforces XOR, `analyzeNotesHandler.ts:246-252` enforces transcript presence. §6.0.2 _processor grep: no hits. §6.10 backlog items filed (discovery provenance, naming-layer consolidation). |
| 2026-07-09 | 1.4 | R7(c) text finalized with enforcement clause. §6.0.1 consumes audit (session_summary.yaml:77-80 are input_variables, not consumes; all consumes have explicit required flags). §6.0.2 discovery type ID matching (YAML IDs → storage types mapping confirmed). Discovery provenance NOT recorded in DB (markdown-only). |
| 2026-07-09 | 1.3 | R7(c) added for primary content inputs. §6.0 cascade loading semantics with discovery→brief path citations (`briefHandler.ts:396-433`, `discoveryLoader.ts:160-214`, `yamlProcessor.ts:271-279`). §6.7 Add Participant derivation (demographics flagged for policy). §6.8 Session Notes derivation (XOR validation gap). session_date/session_time/current_status re-derived as OPTIONAL. recruitment_method flagged for policy. |
| 2026-07-09 | 1.2 | Restored §5 conformance checklist, R8-R11 original numbering, added R12-R13, R7 amendment with (a)/(b) criteria, problem_statement ruling |
| 2026-07-09 | 1.1 | R6 updated (production icon canonical), R7 updated (required/optional derivation), §6 required-field tables added |
| 2026-07-09 | 1.0 | Initial document with R1-R10 rulings |
