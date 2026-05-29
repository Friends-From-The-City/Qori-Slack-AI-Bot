# Known Limitations

Design decisions that have known limitations, documented for future consideration.

---

## 1. Non-pool variable aggregation across discovery artifacts

**File:** `src/helpers/studyVariables.ts` — `readUpstreamDiscoveryVariables`

**Current behavior:**

When multiple discovery artifacts of the same type exist in a project (e.g., two desk_research artifacts for different topics), and a downstream template consumes a non-pool variable from that type:

- **Pool variables (arrays):** All values from all artifacts are concatenated. Correct behavior.
- **Non-pool variables (scalars/objects):** Most recent artifact wins (by `source.date`).

**Why this may be limiting:**

"Most recent wins" assumes the second artifact supersedes the first. This is true for some singletons (e.g., `sample_demographics` describing overall participant pool) but not others (e.g., context-specific findings about different cohorts that should coexist).

**Example scenario where this breaks:**

1. Project runs desk research on "veteran mobile usage" — emits `sample_demographics: {total: 50, segment: 'mobile users'}`
2. Project runs desk research on "veteran accessibility needs" — emits `sample_demographics: {total: 30, segment: 'accessibility users'}`
3. Downstream stakeholder synthesis consumes `sample_demographics`
4. Result: Only sees accessibility data (most recent), loses mobile data

**Long-term fix:**

Return array of values with source attribution for all non-pool variables from multiple artifacts, letting the downstream template decide how to handle multiplicity. This requires:
- Schema change to support multiple values per variable key
- Template updates to handle multiplicity
- Extraction logic updates

**When to revisit:**

When projects routinely accumulate multiple discovery artifacts of the same type and researchers report missing data in downstream outputs.

**Filed:** 2026-05-28, Phase B-0

---

## 2. parseParticipantTarget drops composition-only text

**File:** `src/utils/budgetParser.ts` — `parseParticipantTarget()`

**Current behavior:**

The parser extracts participant count by matching a leading integer from the `participant_approach` modal field:

```typescript
const match = rawText.trim().match(/^(\d+)\b/);
```

This works for inputs like:
- `"12-16 participants"` → 12
- `"8 Veterans"` → 8

But returns `null` for composition descriptions without a leading count:
- `"minimum 50% assistive technology users"` → null
- `"Veterans aged 55+"` → null

**Why this is limiting:**

Researchers routinely describe participant requirements by composition rather than count (e.g., "minimum 50% AT users", "mix of urban and rural veterans"). When `participant_approach` contains such text:

1. `study.target_participants` is stored as `null`
2. Research plans render blank "Sample size"
3. Compensation calculation fails (`budget ÷ null` → null)
4. Plans show generic "$50-100 per participant" instead of computed per-person amount

**Confirmed via direct parser test (2026-05-29):**

| Input | Output |
|-------|--------|
| `"12-16 participants"` | 12 |
| `"minimum 50% assistive technology users"` | null |
| `"Veterans aged 55+"` | null |

**Long-term fix:**

**(b) Split the modal into two fields: count (numeric) + composition (text)**

This is the structural fix — count becomes unambiguous numeric input, composition remains descriptive text. Downstream gets a real number; the parsing problem disappears because there's nothing to parse.

**Why not alternatives:**
- **(a) "Look for numbers anywhere"** is fragile — `"Veterans aged 55+"` would extract 55 as participant count, producing confidently wrong data (worse than blank).
- **(c) "Render 'See composition' instead of blank"** is a band-aid — hides the symptom without giving downstream templates a real count (compensation calc still fails).

**Coordination note:**

Fix via modal restructure (count + composition split) — coordinate with the modal audit rather than patching the parser. If a faster interim is needed before modal work, add a separate numeric input for count; do NOT attempt regex extraction from free text.

**When to revisit:**

When the modal audit begins, or if blank sample sizes cause confusion in stakeholder-facing plans.

**Filed:** 2026-05-29, Phase B Step 3 close-out

---

## 3. Approval flow has zero test coverage

**File:** `src/helpers/slack/requestChangesHandler.ts` — `handleApproveSubmission`

**Current behavior:**

The approval flow (brief/plan/discussion approve → `addStudyStatus` → CTA button appears) is completely untested. No unit tests, no integration tests.

**Why this is a problem:**

Migration `20260522000004` (May 21) changed `research_status` schema — added `study_id` as NOT NULL FK, removed `study_name` column. The handler writing to that table (`addStudyStatus` call in `handleApproveSubmission`) was never updated to pass `study_id`.

**Result:** Approval flow was broken for 8 days (May 21-29). Any brief/plan approval attempt would error with `null value in column "study_id" violates not-null constraint`. The breakage went undetected because nothing exercised this path.

**Fixed:** 2026-05-29, during B-0.7 verification. Handler now looks up study_id before calling `addStudyStatus`.

**Test gap remains:** Need integration test that exercises:
1. Brief approval → `addStudyStatus` called with valid `study_id` → CTA appears
2. Plan approval → same
3. Discussion approval → same (if re-enabled)

**When to address:**

Next test coverage pass, or before any future schema changes to `research_status`.

**Filed:** 2026-05-29, B-0.7 close-out

---

## 4. May 21 Migration Batch Audit (schema↔handler alignment)

**Context:** Migration `20260522000004` added `study_id` NOT NULL to `research_status`, but the writing handler (`addStudyStatus` in `requestChangesHandler.ts`) was never updated. This broke the approval flow for 8 days (May 21-29) until caught during B-0.7 verification.

**Audit question:** Were there other handlers in the same migration batch that weren't updated?

**Audit scope:** Migrations 20260522000000–20260522000007 (May 21 FK normalization batch)

| Migration | Table | Schema Change | Writer | Updated? |
|-----------|-------|---------------|--------|----------|
| 20260522000000 | `projects` | New table | `projectStartHandler` | ✅ N/A (new) |
| 20260522000001 | `research_studies` | +`project_id` NOT NULL | `addResearchStudyWithRoles` | ✅ Yes (briefHandler:294) |
| 20260522000002 | `study_variables` | +`project_id` NOT NULL, +`study_id` NULL | `writeVariablesToPostgresByContext` | ✅ Yes (lines 956, 968, 987) |
| 20260522000003 | `created_issues` | +`study_id` NOT NULL | `ticketHandler` CreatedIssue.create | ✅ Yes (line 469) |
| 20260522000004 | `research_status` | +`study_id` NOT NULL | `addStudyStatus` | ❌ **NO** → Fixed 2026-05-29 |
| 20260522000005 | `channel_config` | +`project_id` NULL | N/A | ✅ N/A (nullable) |
| 20260522000006 | `slack_user_state` | +`active_project_id` NULL | N/A | ✅ N/A (nullable) |
| 20260522000007 | `study_participants` | -`contact_details` | N/A | ✅ N/A (removal) |

**Conclusion:** `research_status` was the **only broken one**. Other handlers were correctly updated. **May 21 FK migration batch audited 2026-05-29 — all writers updated correctly except research_status (fixed). No sibling breakages.**

**Lesson:** Schema migrations that add NOT NULL constraints or remove columns need a handler audit as part of the migration PR. The "clean break, tables are empty" assumption in migration comments doesn't catch handlers that will write to those tables later.

**Filed:** 2026-05-29, B-0.7 close-out

---

## Adding new limitations

When documenting a design limitation:

1. Describe the current behavior precisely
2. Explain why it's limiting (concrete example scenario)
3. Sketch the long-term fix
4. Define the trigger for revisiting
5. Date and phase when filed
