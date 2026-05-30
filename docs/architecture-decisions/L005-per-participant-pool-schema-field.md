# L005: Per-participant pool schemas must include participant field

**Status:** Implemented and enforced
**Date:** 2026-05-30
**Learned from:** Gate B validation — `atomic_nugget_detail` per-participant isolation silently failed
**Implemented:** 2026-05-30 — Schema fix + enforcement test in `pattern-enforcement.test.ts`

## The failure

The `atomic_nugget_detail` pool schema declared `pool_strategy: append_or_replace_per_participant` in `session_summary.yaml`. The intent: when re-analyzing PT-001's session, only PT-001's detail rows should be deleted and replaced. PT-002 and PT-003's rows should remain untouched.

**What actually happened:** When analyzing PT-001, all three participants' rows were rewritten with identical timestamps. The per-participant isolation wasn't isolating.

Debug logging revealed the root cause:

```
🔍 [mergeVariablesByContext] Pool merge for key="atomic_nugget_detail":
   poolStrategy: append_or_replace_per_participant
   participantId extracted: null  ← BUG: No participant field to extract from
   firstItem keys: id, verbatim_quote, participant_context, task_context, ...
```

The `atomic_nugget_detail` schema had `participant_context` (a description field) but no `participant` (the ID field). The merge function extracts `participantId` from `firstItem.participant || firstItem.participant_id`. With neither field present, `participantId` was `null`.

The delete logic then silently fell through:

```typescript
if (poolStrategy === 'append_or_replace_per_participant' && participantId) {
  // This branch requires participantId to be truthy
  // With participantId = null, this branch is SKIPPED
}
```

No delete happened. New rows were inserted with `participant_id: null`. The isolation guarantee was silently broken.

## Why it went undetected

1. **Counts looked correct.** PT-001 had 8 nuggets, PT-002 had 10, PT-003 had 10 — the numbers were plausible.
2. **No hard failure.** The insert succeeded, the success message showed, the document was saved.
3. **Timestamp anomaly was subtle.** All three participants having identical `extracted_at` timestamps only surfaced under close inspection.
4. **Schema review didn't catch it.** The schema had 11 fields including `participant_context` — it looked complete.

## The lesson

**Pool schemas with `append_or_replace_per_participant` strategy MUST include a `participant` or `participant_id` field.**

Without this field:
- The merge function extracts `participantId` as `null`
- The per-participant delete clause is skipped
- Rows accumulate without cleanup, or all rows get rewritten
- The isolation guarantee fails **silently**

This is a **constraint between YAML emit declarations and schema definitions**. The YAML says "isolate by participant" but the schema must provide the participant field for that isolation to work.

## Enforcement

A pattern enforcement test now validates this constraint at CI time:

**`pattern-enforcement.test.ts` Assertion 10:**

```typescript
describe('pattern: per-participant pool schemas include participant field (L005)', () => {
  it('all append_or_replace_per_participant pool schemas have participant or participant_id field', () => {
    // For each emit with pool_strategy: append_or_replace_per_participant
    // Load the referenced schema
    // Assert 'participant' or 'participant_id' in properties
    // Fail with actionable message if missing
  });
});
```

If a developer adds a new per-participant pool emit without including the participant field in the schema, CI fails with:

```
session_summary.yaml: emit 'new_pool' uses append_or_replace_per_participant but schema
'schemas/new_pool.yaml' lacks 'participant' or 'participant_id' field — merge isolation will silently fail
```

## The fix

Two bugs were found and fixed:

### Bug 1: Missing participant field in schema

**Fix:** Added `participant` field to `atomic_nugget_detail.yaml` as required:

```yaml
required: [id, participant]
properties:
  participant:
    type: string
    pattern: "PT-###"
    description: "Participant ID — required for per-participant pool merge isolation"
```

### Bug 2: Double-write nuking per-participant isolation

Even after the schema fix, isolation was still broken. Debug tracing revealed a second bug:

1. `mergeVariablesByContext()` correctly scoped deletes by `participant_id`
2. Then `writeStudyVariablesByContext()` was called, which invoked `writeVariablesToPostgresByContext()`
3. That function deleted ALL rows for each `variable_key` without `participant_id` scoping
4. The correct per-participant writes were immediately overwritten

**Fix:** Removed the Postgres write from `writeStudyVariablesByContext()`. It now only writes the GitHub artifact (debugging only). Postgres writes are handled exclusively by `mergeVariablesByContext()`, which implements correct per-participant isolation.

### Supporting changes

- **Data cleanup:** Deleted 45 stale rows with `participant_id IS NULL` from study 12
- **Enforcement test:** Added to `pattern-enforcement.test.ts` to prevent schema regression

## Audit of other per-participant pools

All 5 schemas using `append_or_replace_per_participant` were audited:

| Schema | Field | Status |
|--------|-------|--------|
| atomic_nugget_core | `participant` | ✅ |
| atomic_nugget_detail | `participant` | ✅ (fixed) |
| participant_metadata | `participant_id` | ✅ |
| task_completion_records | `participant` | ✅ |
| barrier_validations | `participant` | ✅ |

`atomic_nugget_detail` was the only one missing the field — not a batch issue.

## Related patterns

- **L004:** Cascade contracts need contract tests — tests must verify declared behavior matches actual behavior
- **ADR 0019:** Ack-first await-extraction handler pattern — handlers must await `extractionPromise` to ensure variables commit before success message

## References

- `backend/config/schemas/atomic_nugget_detail.yaml` — fixed schema
- `backend/src/helpers/studyVariables.ts:381` — participant extraction in merge function
- `backend/src/__tests__/integration/pattern-enforcement.test.ts` — enforcement test (Assertion 10)
