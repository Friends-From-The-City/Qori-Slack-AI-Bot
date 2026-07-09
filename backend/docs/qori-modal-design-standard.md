# Qori Modal Design Standard

This document captures the design rulings for Slack Block Kit modals across the Qori application. Each ruling (R1-R10) addresses a specific aspect of modal presentation and behavior.

---

## Rulings

### R1: No Decorative Emoji

Remove all decorative emoji from modals. Emoji are permitted only when they carry semantic meaning (e.g., `:warning:` for error states). Decorative emoji (`:file_folder:`, `:bust_in_silhouette:`, `:sparkles:`, artifact icons like `📄`, `🎙️`) should be removed.

**Status:** Enforced. Applied to Research Synthesis, Analyze Session, Tickets, and Research Brief modals.

---

### R2: Action-Oriented Submit Labels

Submit button text should describe the action, not just "Submit". Examples:
- "Analyze" (for analyze modal when transcript is selected)
- "Continue" (for analyze modal cascade steps)
- "Generate" (for synthesis modal)
- "Create Brief" (for brief modal)

**Status:** Enforced.

---

### R3: No Redundant Section Headers

Remove redundant section headers when the input label is self-explanatory. For example, a "Research Study" section header followed by a "Study *" select is redundant — the label suffices.

**Status:** Enforced.

---

### R4: Domain-Accurate Terminology

Use terminology that matches the domain. "Synthesis" (not "Analysis") for cross-session synthesis methods. "Analyze" for single-session analysis.

**Status:** Enforced.

---

### R5: Researcher-Friendly Labels

Translate system labels to researcher language. Examples:
- "participant metadata" → "participant"
- "target_barriers" → "target barriers"
- Strip `_metadata` suffixes and convert `snake_case` to spaces.

**Status:** Enforced.

---

### R6: App Icon Consistency

The production app icon is canonical. The blue-book icon visible in the dev environment is a dev-environment artifact (the Qori Dev Slack app). No code change required — verify against production.

**Status:** Verified. No action needed.

---

### R7: Required/Optional Field Convention

Optional fields carry a `(optional)` suffix added by Slack's `optional: true` flag; all unmarked fields are required. No asterisks.

Required fields are enforced by submit validation (inline error on empty), not visual marking alone. A field is REQUIRED if and only if the cascade variable it populates is consumed by a downstream template, per the `emits`/`consumes` contracts in the YAML templates.

Prefill from discovery satisfies but does not alter required status.

**Before changing modal code:** Derive the required-field set from YAML contracts (see §6 Required Field Derivation).

**Status:** Pending derivation audit.

---

### R8: Grounding Context Blocks

When showing cascade context (session counts, nuggets, enrichments), use a single subordinate context block with the pattern:

```
*Using:*  1 session • 12 nuggets • 5 target barriers
```

or

```
*Analyzing against:*  3 barriers • 5 questions • Usability Testing
```

Keep grounding information compact — one line, `•` separators, no decorative emoji.

**Status:** Enforced.

---

### R9: Proper Pluralization

Use correct singular/plural forms:
- `${count} finding${count !== 1 ? 's' : ''}`
- `${count} session${count !== 1 ? 's' : ''}`
- `${count} barrier${count !== 1 ? 's' : ''}`

**Status:** Enforced.

---

### R10: Visual Hierarchy

- **Primary inputs** (study select, method select): Use `input` blocks with labels
- **Grounding/status info**: Use `context` blocks (subordinate, smaller text)
- **Section dividers**: Use sparingly, only between logical groups
- **Warnings**: Use `context` blocks with `:warning:` prefix

**Status:** Enforced.

---

## §5: Modal Inventory

| Modal File | Primary Template | Command |
|------------|------------------|---------|
| `researchBriefModal.ts` / `researchBriefEntryModal.ts` | `research_brief.yaml` | `/qori-brief` |
| `analyzeNotesModal.ts` | `session_summary.yaml` | `/qori-analyze` |
| `researchSynthesisModal.ts` | `affinity_mapping.yaml`, `journey_mapping.yaml`, etc. | `/qori-synthesis` |
| `readoutModal.ts` | `research_readout.yaml`, `designer_readout.yaml`, etc. | `/qori-readout` |
| `discussionGuideModal.ts` | `discussion_guide.yaml` | `/qori-guide` |
| `researchPlanGeneratorModal.ts` | `research_plan.yaml` | `/qori-plan` |
| `discoverTypeModals.ts` | `desk_research.yaml`, `stakeholder_synthesis.yaml`, `survey_synthesis.yaml` | `/qori-discover` |
| `projectCreationModal.ts` | (creates project, no template) | `/qori-project` |
| `addParticipantModal.ts` | (DB operation, no template) | (fieldwork) |
| `sessionNotesModal.ts` | (upload handler) | `/qori-notes` |
| `uploadNotesModal.ts` | (upload handler) | `/qori-notes` |

---

## §6: Required Field Derivation

**Status:** Audit in progress. Tables below derived from YAML contracts.

For each modal in §5, derive:
- field → cascade variable it populates → downstream consumer(s) → required Y/N
- Cite YAML file + section for each consumer claim
- Flag ambiguous contracts

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

| Modal Field | Cascade Variable | Required consumer? | R7 Required? |
|-------------|------------------|-------------------|--------------|
| `study_name` | `selected_study` (filename only) | No cascade consumer | **NO** |
| `stakeholder` | `requestor_name` (masthead only) | No cascade consumer | **NO** |
| `problem_statement` | → AI generates `business_context` | All consumers optional | **NO** |
| `learning_objectives` | → AI generates `research_objectives` | research_plan, discussion_guide | **YES** |
| `out_of_scope` | `out_of_scope` | All consumers optional | **NO** |
| `research_method` | `methodology_selection` | research_plan, discussion_guide | **YES** |
| `method_override` | (overrides methodology) | Same as research_method (override) | **NO** |
| `participant_approach` | → AI generates `participant_criteria` | research_plan | **YES** |
| `recruitment_sources` | `recruitment_sources` | No cascade consumer | **NO** |
| `start_date` | `start_date` | All consumers optional | **NO** |
| `decision_deadline` | `decision_deadline` | No cascade consumer | **NO** |
| `budget` | `budget` | No cascade consumer | **NO** |

**Ambiguous contracts (flagged for review):**

1. **`research_questions`** — AI-generated from `learning_objectives`. Required by downstream (research_plan, discussion_guide). This makes `learning_objectives` indirectly required. ✅ Already covered above.

2. **`target_barriers`** — AI-generated from `problem_statement` + discovery data. Required by downstream (research_plan, discussion_guide). Contract is ambiguous: `problem_statement` is one of multiple inputs to the AI task that generates barriers. **Recommendation:** If target_barriers must exist, then `problem_statement` should be required. Flagged for design review.

**R7 Derived Required Fields for Brief modal:**
- `learning_objectives` (populates `research_objectives`, required by research_plan/discussion_guide)
- `research_method` (populates `methodology_selection`, required by research_plan/discussion_guide)
- `participant_approach` (populates `participant_criteria`, required by research_plan)

**Fields that are currently required but R7 says should be optional:**
- `study_name` — no cascade consumer
- `stakeholder` — no cascade consumer
- `problem_statement` — ambiguous (see flag #2)
- `out_of_scope` — all consumers optional
- `start_date` — all consumers optional
- `decision_deadline` — no cascade consumer

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

**Execution testing:** Code inspection shows Slack's native validation behavior. Execution testing (submit with empty fields) requires manual testing in dev environment. The above reflects what Slack will do based on the `optional` flag presence.

---

### 6.3 Analyze Session Modal

**Consumes → field mapping:**

| Consumed variable | Source | Required? | YAML citation |
|-------------------|--------|-----------|---------------|
| `target_barriers` | research_brief | optional | `session_summary.yaml:90-94` |
| `research_questions` | research_brief | optional | `session_summary.yaml:96-100` |
| `methodology_selection` | research_brief | optional | `session_summary.yaml:102-106` |

**Field → Required derivation:**

| Modal Field | Cascade Variable | Required consumer? | R7 Required? |
|-------------|------------------|-------------------|--------------|
| `study_select` | (routing only) | N/A | **NO** (but needed for routing) |
| `session_select` | `session_id` | Required by session_summary | **YES** |
| `transcript_select` | `coded_transcript_content` | Required by session_summary | **YES** |
| `notes_select` | `notes_content` | Optional by session_summary | **NO** |

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

| Modal Field | Cascade Variable | Required consumer? | R7 Required? |
|-------------|------------------|-------------------|--------------|
| `study_select` | (routing to load nuggets) | N/A | **NO** (but needed for routing) |
| `analysis_method` | (selects template) | N/A | **YES** (determines which template runs) |

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
| etc. | ... | optional | ... |

**Field → Required derivation:**

| Modal Field | Cascade Variable | Required consumer? | R7 Required? |
|-------------|------------------|-------------------|--------------|
| `study_select` | (routing) | N/A | **NO** (routing) |
| `audience_select` | (selects template) | N/A | **YES** (determines which readout runs) |

**Note:** Readout modal selects audience and study. Required inputs are loaded from variable store. Cascade preconditions (nuggets must exist) are enforced by the handler, not modal validation.

---

### 6.6 Summary: Required Fields by R7 Derivation

| Modal | R7 Required Fields | R7 Optional Fields (currently required) |
|-------|-------------------|----------------------------------------|
| **Brief** | learning_objectives, research_method, participant_approach | study_name, stakeholder, out_of_scope, start_date, decision_deadline, problem_statement (flagged) |
| **Analyze** | session_select, transcript_select | study_select, notes_select |
| **Synthesis** | analysis_method | study_select |
| **Readout** | audience_select | study_select |

**Action items before changing code:**
1. Review flagged ambiguity: Is `problem_statement` required because `target_barriers` (AI-generated from it) is required downstream?
2. Decide if `study_name` and `stakeholder` should remain required for operational reasons (not cascade reasons)
3. Execute validation testing in dev to confirm code-inspection findings

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-07-09 | 1.1 | R6 updated (production icon canonical), R7 updated (required/optional derivation), §6 required-field tables added |
| 2026-07-09 | 1.0 | Initial document with R1-R10 rulings |
