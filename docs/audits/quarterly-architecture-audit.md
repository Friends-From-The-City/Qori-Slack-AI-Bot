# Quarterly architecture audit

This is a recurring discipline document. Once per quarter (or before any significant external review — partner due diligence, security review, partner handoff), Claude Code walks this checklist and produces a written report. The report goes in `docs/audits/YYYY-QN-audit.md`.

The goal is not to find bugs. The goal is to surface architectural drift before it becomes structural debt. Bugs get fixed; drift accumulates silently and becomes harder to address the longer it sits.

If you are running this audit: read each section, answer each question concretely, and capture findings even when the answer is "no issues found." A clean audit has receipts, not just absence of complaints.

---

## How to use this document

For each section below:

1. Run the indicated queries or read the indicated files
2. Answer the questions in the audit report (don't just check boxes)
3. Note any findings that warrant follow-up
4. At the end of each section, give an overall health rating: **Clean / Minor concerns / Action needed**

The audit report should be reviewable in 15 minutes by the project owner. Detailed findings can be in appendices; the main body is the summary.

---

## Section 1: Variable cascade integrity

The variable cascade is Qori's core architecture. Producers (templates that emit variables) and consumers (templates that read them) must agree on shapes. Silent mismatches render as empty output, which is the failure mode the architectural fix was designed to surface — but it's still a regression worth catching at audit time, not document-generation time.

### Questions

**1.1 Shape compatibility check.** For each template that consumes upstream variables, list the variables it consumes and the shape it expects. For each variable, compare against what the upstream template actually emits. List any mismatches.

Where to look:
- Every template in `backend/config/prompts/*.yaml`
- The `consumes:` and `emits:` blocks in each
- The handler that processes the template (in `backend/src/helpers/slack/commands/`)

Example finding format: _"plan_handler expects research_objectives as [{id, objective}] but brief emits [string]. Currently handled via transform-on-consume per ADR 0006. No regression."_

**1.2 Orphaned variables.** List any variable emitted by a producer that is not consumed by any downstream template. This isn't necessarily bad — it might be exported for future use — but worth tracking.

**1.3 Required-but-missing contracts.** For each `consumes:` block with `required: true`, verify the variable is actually emitted somewhere upstream. A `required: true` entry with no producer is a latent error waiting for production data.

**1.4 Phantom values.** Search the codebase for status string literals, enum values, or other constants that may have been written somewhere but are never read (or read somewhere but never written). The `'Contacted'` phantom status that was checked in `fieldworkHandler.js` but never written anywhere is the canonical example.

Suggested query:
```bash
# Find string literals that look like enum values
grep -rn -E "'[A-Z][a-z]+_?[a-z]*'" backend/src/ | head -50
```

Cross-reference against the canonical enum sets.

---

## Section 2: Template system status

### Questions

**2.1 Template inventory and patterns.** Count templates by output pattern:

- **Interleaved** — Handlebars with bounded LLM slots (the target pattern from ADR 0005). Production-grade.
- **Minimal static + single LLM** — Some Handlebars frame, body is one big LLM blob. Partial conformance.
- **Pure LLM** — Output template is literally `{{ai_generated.body}}`. Pre-restructure, drift risk.

Target: 100% interleaved by v1.0. The audit tracks progress toward that.

**2.2 Test coverage per template.** For each template, count tests in `backend/src/__tests__/templates/{template}.test.js`. Target: minimum 4 tests per template, covering at least:

- Renders without throwing given valid inputs
- A specific value passed in appears in the output
- A required upstream variable being missing throws `TemplateContractError`
- A specific structural element appears (heading, table, etc.)

List templates with 0 tests. List templates with fewer than 4 tests.

**2.3 Template version inventory.** Each YAML template has a `version` field. List the version of each template. Templates still on v1.0–v5.0 are likely pre-restructure (verify against pattern check in 2.1).

**2.4 Snapshot tests.** Has Foundation 1b (snapshot tests) been implemented? If yes, list templates with snapshots. If no, note as a v1.0 prerequisite.

---

## Section 3: Service layer consistency

### Questions

**3.1 Attribute whitelists.** Find every Sequelize finder that uses an explicit `attributes:` array (e.g., `findOne({ attributes: [...] })`). For each:

- List the model
- List the columns in the whitelist
- Compare against the model's actual columns
- Flag any model column missing from the whitelist as a potential bug

This is the audit category that caught the `parsed_budget_amount` / `target_participants` bug. The default after ADR L001 is to *not* use attribute whitelists; if they exist, they need justification.

Suggested query:
```bash
grep -rn "attributes:" backend/src/services/ | grep -v "//"
```

**3.2 Handler pattern consistency.** The canonical handler pattern is:
```
ack → extract form values → build data object → processYamlTemplate → save DB record → send Slack message
```

For each handler in `backend/src/helpers/slack/commands/`:
- Confirm it follows this pattern
- Note any handler that does something materially different (e.g., bypasses the service layer, mixes concerns)

The audit's job is to track drift from the pattern; principled exceptions are fine but should be intentional.

**3.3 Error handling consistency.** For each handler, identify:
- Does it `ack()` before or after validation? (Should be before — preserves Slack's 3-second timeout)
- How does it handle `TemplateContractError`? (Should DM the researcher with a clear message)
- Are there silent catch blocks that mask errors? (`catch (err) { console.warn(...) }` without re-throw — flag for review)

**3.4 Duplicated logic.** Look for code paths that exist in multiple places. The known examples:
- Study folder creation (was duplicated in `briefHandler.js` and `createStudyHandler.js`)
- Date parsing
- Compensation calculation (if `calculatePerPersonCompensation` is called inline anywhere instead of imported)

List any new duplication discovered.

---

## Section 4: Database schema cohesion

### Questions

**4.1 Denormalization.** Find every table that stores `study_name` as a string field instead of `study_id` as a foreign key. List them. (The known set: `research_plans`, `study_notes`, `session_summaries`, `study_variables`, `created_issues`, `research_status`.) Confirm whether each has been addressed or remains deferred to v1.1.

**4.2 Missing foreign keys.** For each table, list the columns that reference other tables but are not constrained as foreign keys. These are migration risks — a delete or rename in a parent table can leave orphans.

**4.3 Type mismatches.** Find columns that store data as `STRING` when a typed column would be more appropriate:
- Dates stored as STRING (known: `scheduled_date`, `scheduled_time` on StudyParticipant)
- Numbers stored as STRING
- Booleans stored as strings or integers

**4.4 Enum constraints.** For each application-level enum (e.g., `PARTICIPANT_STATUS`), check whether the database has a corresponding CHECK constraint. After ADR 0008 the answer is "no, validation is application-level only for alpha." Confirm this is still the case and flag if any have been added (or if any should be).

**4.5 Migration health.** Review the migrations directory for:
- Migrations that ran but their corresponding schema doesn't reflect them (failed mid-way, manually patched)
- Migrations created but not run on production
- Migrations referenced in code but missing from the directory

Suggested check:
```sql
SELECT * FROM "SequelizeMeta" ORDER BY name DESC LIMIT 20;
```

Compare against the migrations directory.

---

## Section 5: Test coverage gaps

### Questions

**5.1 Test count by area.** Count tests in:
- `backend/src/__tests__/templates/`
- Any other test directories that exist

**5.2 Regression coverage.** For each significant bug fixed in the last quarter, is there a test that would catch the regression?

Known bugs to verify regression tests for:
- Comma-formatted budget parsing (`$1,000` → should return `1000`, not `1`)
- Attribute whitelist missing columns (`getResearchStudyWithRoles` returning `parsed_budget_amount`)
- Status casing mismatch between writers and readers
- Shape mismatch between brief-emitted objectives and plan-consumed objectives
- Phantom `'Contacted'` status reference

**5.3 Parser test fuzz coverage.** For any parser in the codebase (currently `parseBudget`, `parseParticipantTarget`, possibly others), list the test inputs covered. Per ADR L002, parsers should have tests covering every reasonable input variation — not just the happy path.

**5.4 End-to-end test coverage.** Per ADR L003, critical flows should have an end-to-end test that creates inputs and asserts on rendered output. List the flows that have such a test. List the flows that should but don't.

The compensation flow is the canonical example: a test that creates a study with a budgeted brief, generates a plan, asserts the rendered output contains the correct calculated compensation. If this test doesn't exist, flag it.

---

## Section 6: ADR drift

### Questions

**6.1 ADR conformance.** For each accepted ADR in `docs/architecture-decisions/`, verify the codebase still reflects the decision.

Walk through each ADR:
- Does the code match the decision?
- Has any new code been added that conflicts with it?
- Has any condition arisen that should prompt revisiting (see each ADR's "When to revisit" section)?

For each ADR, mark: **Conforms / Drift detected / Should revisit**.

**6.2 Decisions made without ADRs.** Look at significant changes in the last quarter (PRs, design decisions captured in chat, etc.). For each significant decision that doesn't have a corresponding ADR, decide whether one should be written retroactively.

A decision needs an ADR if it meets the criteria from the README:
- Affects more than one file or service
- Constrains future work
- Was non-obvious
- Future-you might forget the reasoning
- Will be questioned by a reviewer

---

## Section 7: Open-ended reflection

### Questions

**7.1 What would you redesign if starting from scratch?** Open-ended. CC answers this each quarter. The answer changes over time as the codebase evolves; the trajectory of the answer is itself a signal.

Past answers (track these to see how thinking evolves):
- 2026-Q2 (initial audit): "The output template architecture. Computed values that must be rendered exactly were being routed through a probabilistic system." (Resolved by ADR 0005.)

**7.2 What concerns you most about the current state?** Concrete: list 1-3 things that, if not addressed, will bite the project. Not a wishlist — actual risks.

**7.3 What's improved since the last audit?** Concrete: list 1-3 things that are clearly better than they were three months ago. Tracks whether discipline is working.

---

## Audit report template

The completed audit report should follow this structure:

```markdown
# Architecture audit — YYYY QN

**Date:** YYYY-MM-DD
**Auditor:** [Claude Code session ID or human name]

## Summary

[2-3 sentence summary of overall health]

**Section ratings:**
- Variable cascade integrity: [Clean / Minor concerns / Action needed]
- Template system status: [...]
- Service layer consistency: [...]
- Database schema cohesion: [...]
- Test coverage gaps: [...]
- ADR drift: [...]

## Findings requiring action

[For each Action needed item, a sentence describing what's wrong and a recommendation]

## Findings to monitor

[Things that are not yet action-required but worth watching]

## Improvements since last audit

[Specific things that are better]

## Reflection (Section 7 answers)

[The three open-ended answers]

## Appendix: Section details

[Full answers to each section's questions, for the reader who wants to drill in]
```

---

## When this audit runs

- Quarterly, on the first Monday of each quarter
- Before any partner due diligence or security review
- Before any major architectural change (the audit identifies what's stable enough to build on)

The audit takes 30-60 minutes for Claude Code. The output report goes in `docs/audits/`. Each audit is preserved historically — the trajectory of audit findings over time is itself useful information.

---

## History

A running record of completed audits. Each row links to the full audit report in `docs/audits/YYYY-QN-audit.md`.

| Quarter | Date | Major findings | ADRs prompted |
|---------|------|----------------|---------------|
| 2026 Q2 | 2026-05-13 | LLM authority over computed data; participant status casing chaos (15 strings for 9 concepts); missing FKs across 6 tables; zero meaningful template tests; attribute whitelist excluding new columns; comma-formatted budget parser bug | 0002, 0005, 0006, 0007, 0008, L001, L002, L003 |
| 2026 Q2 (post-migration) | 2026-05-18 | [Report](2026-Q2-audit-post-migration.md). Status chaos resolved (canonical enum). 110 tests (from 0). All 5 known bug classes have regression coverage. Cascade contracts enforced. Remaining: 1/27 templates has unit tests; 3 tables use study_name without FK; participant_tracker YAML status labels don't match enum. | None prompted (all ADRs conform; Bolt typing migration may warrant lightweight ADR) |

When a new audit completes, add a row here and link the report. Comparing successive audits over time reveals patterns of improvement or recurring drift.
