# ADR 0019: Ack-first await-extraction handler pattern

**Status:** Accepted
**Date:** 2026-05-30
**Prompted by:** Recurring race conditions where UI reads stale data (B-0.5 affinity showing 1/2 participants; synthesis showing 2/3 sessions; analyze participant count wrong until modal reopened)

## Context

Slack handlers that call `processYamlTemplate()` generate documents (GitHub write) and extract cascade variables (Postgres write). The extraction phase is returned as `extractionPromise` — a promise the caller can await or ignore.

All five emitting handlers ignored this promise:
- `analyzeNotesHandler` — emits `atomic_nugget_core`, `atomic_nugget_detail`
- `discoverHandler` — emits `discovered_barriers`, `discovered_themes`
- `briefHandler` — emits `research_objectives`, `target_barriers`
- `researchSynthesisHandler` — emits `validated_themes`, `personas`, etc.
- `planHandler` — emits `methodology_selection`, etc.

When extraction runs in the background, downstream modals (synthesis reading nuggets, brief reading discovery vars, plan reading brief vars) race the write. If the read happens before the write commits, the modal shows stale data. Reopening "fixes" it because the write has settled by then.

This is a systemic timing gap, not isolated bugs.

## Decision

**All handlers that emit cascade variables must await `extractionPromise` before returning success to the user.**

The canonical handler pattern is:

```typescript
// 1. Ack the Slack interaction immediately (<3s window)
await ack();

// 2. Post progress message (optional)
await client.chat.postEphemeral({
  channel: body.user.id,
  user: body.user.id,
  text: 'Processing...',
});

// 3. Do slow work (LLM calls, GitHub write)
const renderedYaml = await processYamlTemplate(...);

// 4. CRITICAL: Await extraction — hard-fail if it fails
if (renderedYaml.extractionPromise) {
  const extractResult = await renderedYaml.extractionPromise;
  if (!extractResult.success) {
    throw new Error(
      `Cascade variable extraction failed: ${extractResult.error}. ` +
      `Document was saved but variables were not written.`
    );
  }
  console.log(`✅ Cascade variables committed: ${extractResult.variableCount} items`);
}

// 5. ONLY NOW send success message
await client.chat.postEphemeral({
  channel: body.user.id,
  user: body.user.id,
  text: '✅ Complete!',
});
```

**Key constraints:**

1. **Ack first.** Slack requires acknowledgment within 3 seconds. The `await ack()` happens before any slow work.

2. **Await extraction.** The `extractionPromise` must be awaited, not ignored or `.then()`-ed. Fire-and-forget causes races.

3. **Hard-fail on extraction failure.** If extraction fails, don't send a success message. Throw and let the error propagate. Per ADR 0007/0008, the system fails loud — never silently shows a wrong state.

4. **Success message after extraction.** The user sees "complete" only after cascade variables are committed to Postgres.

## Consequences

**Positive:**
- Downstream modals (synthesis, brief, plan, readout) always read committed data
- No more "reopen to see correct count" UX bugs
- Extraction errors surface to the user, not swallowed silently

**Negative:**
- Success message is slightly slower (waits for extraction)
- If extraction is slow (>10s), user waits longer before seeing "complete"

**Mitigations:**
- Extraction is typically <2s (LLM parsing + Postgres write)
- The ack-first pattern prevents Slack timeout errors
- If extraction becomes slow, optimize the extractor, don't remove the await

**Scaling note:** This pattern assumes single-Postgres-instance writes are atomic and immediately visible to subsequent reads. If Postgres is replicated with read replicas, downstream reads could still race replication lag. Current architecture uses a single instance — revisit if that changes.

## Handlers updated

| Handler | Emits | Downstream Consumer | Fixed |
|---------|-------|---------------------|-------|
| analyzeNotesHandler | atomic_nugget_core/detail | synthesis, readout | ✅ |
| discoverHandler | discovered_barriers/themes | brief | ✅ |
| briefHandler | research_objectives, target_barriers | plan | ✅ |
| researchSynthesisHandler | validated_themes, personas, etc. | readout | ✅ |
| planHandler | methodology_selection, etc. | discussion guide | ✅ |

## References

- ADR 0007: Cascade contracts fail loudly (throw on missing required data)
- ADR 0008: Render empty rather than fabricate (visible failure over silent fabrication)
- L004: Cascade contract test suite
- `processYamlTemplate()` in `yamlProcessor.ts`
- Global error middleware in `events.ts` (lines 102-150) — delivers error DMs to user
