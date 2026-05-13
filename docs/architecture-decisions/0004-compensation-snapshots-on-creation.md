# ADR 0004: Compensation snapshots on participant creation

**Status:** Accepted
**Date:** 2026-05-13
**Decision drivers:** Per-person compensation needs to surface in research plan output, outreach templates, and the participant tracker. Compensation can change mid-study (budget edits, target adjustments). Need to decide whether existing participants' compensation updates with those changes.

## Context

The research brief captures a budget (free-text field parsed to a numeric value) and a target participant count. Per-person compensation is derived: `budget ÷ target_participants`. That value needs to appear consistently across multiple surfaces.

The question is what happens when inputs change after participants already exist. If a researcher edits the brief to bump the budget from $800 to $1000 after 3 participants are already added, three possible behaviors:

1. **Live recalculation.** All existing participants' compensation updates to the new value. Clean conceptually.
2. **Snapshot at creation.** Each participant locks in the per-person amount as it was when their row was created. The first 3 keep $80, any new participants get $100.
3. **Hybrid.** Stored compensation can be edited per row, defaulting to whatever the calculation yields at creation time.

## Decision

Snapshot at creation. The `StudyParticipant.compensation_amount` column is set when the row is created and does not auto-update when the parent study's budget or target changes later.

The outreach template uses live calculation (because outreach reflects what the study is currently offering), but participant rows lock the value once written.

## Alternatives considered

**Live recalculation.** Cleaner data model — single source of truth. Rejected because it creates a real research workflow problem: a researcher who paid Jane $80 in real life shouldn't see Jane's row in Qori say `$100` because they edited the brief later. The snapshot honors what was true when each participant was added. The data shouldn't lie about history.

**Hybrid with per-row editing.** Most flexible. Rejected for alpha because the editing affordance (a modal field for overriding the snapshot) was scope creep. Filed as v1.1 candidate when researchers actually request the capability.

**No participant-level storage; always recalculate from study.** Compensation only lives on the study row, surfaced as `study.budget ÷ study.target` everywhere it appears. Rejected for the same reason as live recalculation — historical truth gets lost.

## Consequences

**Intended:** A participant's compensation reflects what they were actually paid (or expected to be paid) at the time of their participation, not the latest budget revision. Mid-study changes don't retroactively rewrite history. Data is honest about what actually happened.

**Accepted downsides:** Drift becomes possible — if a researcher edits the budget halfway through a study, the participant tracker doc shows a mix of old and new compensation values. This is technically a feature (it reflects reality) but may surprise researchers who expected the values to update together. Documentation note in the participant tracker explains the snapshot behavior. If snapshot drift becomes a recurring confusion, we revisit.

**Migration impact:** Existing participant rows did not get backfilled with compensation snapshots. Going forward, only new rows snapshot. This is intentional — retroactively setting compensation on historical participants would be guessing at values that may not match what actually happened.

## References

- `backend/src/utils/compensationCalculator.js`
- `backend/src/utils/budgetParser.js`
- Migration: `20260515000000-add-compensation-fields.js`
- Instruction document: `cc-instruction-3-compensation.md`
- Related: ADR 0006 (rendering compensation via Handlebars, not LLM)
