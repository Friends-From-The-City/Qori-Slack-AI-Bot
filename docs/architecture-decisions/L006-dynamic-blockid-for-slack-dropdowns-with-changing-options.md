# ADR L006: Dynamic block_id for Slack dropdowns with changing options

**Status:** Accepted
**Date:** 2026-06-02
**Decision drivers:** Stale session selection displayed after study change in /qori-analyze; previously hit in enrichment-per-type dropdown

## Context

When a user changes the Study dropdown in `/qori-analyze`, the modal rebuilds with new session options via `views.update`. Despite building fresh options and not setting `initial_option`, Slack displayed the **previous study's session** in the dropdown.

Root cause: Slack's `static_select` preserves user selections in `view.state.values` across `views.update` calls, **even when the options change**. If `block_id` stays the same, Slack merges the new view definition with existing state, keeping the stale selection.

This is the **second time** this pattern has bitten us:
1. Enrichment-per-type dropdown (discovery sources changing based on type selection)
2. Study → Session cascade (sessions changing based on study selection)

## Decision

**When a dropdown's options depend on another field's selection, use a dynamic `block_id` that incorporates the parent field's value.**

```typescript
// Session block_id includes study ID — changes when study changes
const sessionBlockId = selectedStudy
  ? `session_select_block_${selectedStudy}`
  : "session_select_block";
```

When the `block_id` changes, Slack treats it as a new element with no prior state, forcing a fresh selection.

**Corollary:** Handlers that read from dynamic `block_id` blocks must search by action_id prefix, not hardcoded block_id:

```typescript
const findSessionSelection = (values: ViewStateValues) => {
  for (const blockId of Object.keys(values)) {
    if (blockId.startsWith('session_select_block')) {
      return values[blockId]?.analyze_notes_session_select?.selected_option;
    }
  }
  return null;
};
```

## Why this is a lesson, not just a fix

The fix was ~20 lines (dynamic block_id + helper function). The lesson is that **this category of bug will recur on every cascading dropdown** unless we internalize the pattern. Slack's view state behavior is non-obvious and underdocumented — the natural assumption is that providing new options clears the old selection.

## Alternatives considered

1. **Clear `view.state.values` manually** — Not possible; Slack doesn't expose a way to clear specific field state.
2. **Always set `initial_option` to first option** — Forces a selection the user didn't make; confusing UX.
3. **Use a different element type** — `radio_buttons` have the same state persistence issue.

Dynamic `block_id` is the only reliable way to force Slack to reset element state.

## Consequences

- Any future cascading dropdown (parent → child options) should use `block_id_${parentValue}` pattern from the start
- Handlers must use prefix matching or similar to find values from dynamic block_ids
- Slightly more complex modal code, but prevents subtle data-correctness bugs

## When to revisit

If Slack adds an API to explicitly clear element state on `views.update`, or provides a `reset_on_options_change` flag, this pattern becomes unnecessary.

## References

- PR #179: feat: cascade-aware transcript selection in /qori-analyze
- `analyzeNotesModal.ts` lines 244-252: dynamic block_id implementation
- `analyzeNotesHandler.ts` lines 134-152: `findSessionSelection` helper
