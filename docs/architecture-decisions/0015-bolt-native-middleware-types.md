# ADR 0015: Use Bolt's native middleware types for handler signatures

**Status:** Accepted
**Date:** 2026-05-18
**Decision drivers:** Phase 6 of the TypeScript migration needed to type the Bolt handler middleware boundary — ~75 handler functions and ~112 `as any` casts at registration sites in `events.ts`. The choice between maintaining custom wrapper types and adopting Bolt's native types affects how every future handler is written and how the registration manifest compiles.

## Context

Phase 2 of the migration introduced four custom wrapper interfaces in `types/handlers.ts`: `ViewSubmissionContext`, `SlashCommandContext`, `BlockActionContext`, and `EventContext`. These simplified Bolt's middleware types to the four properties each handler actually destructured (`ack`, `body`, `view`/`command`, `client`).

The wrappers worked for typing handler bodies, but they didn't satisfy Bolt's registration methods. `slackApp.view('callback_id', handler)` expects `Middleware<SlackViewMiddlewareArgs<ViewSubmitAction>>`, not a function typed as `(args: ViewSubmissionContext) => Promise<void>`. TypeScript couldn't prove structural compatibility through Bolt's generic overloads, so every registration required `as any`:

```typescript
slackApp.view('research_plan_modal', handlePlanSubmission as any);
```

This created 112 casts in `events.ts` alone, plus ~146 `(body as any).actions[0]` casts in handler bodies where the custom types didn't expose Bolt's full `BlockAction` shape (which includes `actions`, `trigger_id`, `view`, `channel`, etc.).

## Decision

Use Bolt's native parameterized middleware types directly in handler signatures. Remove the custom wrapper interfaces.

```typescript
// Before
async function handlePlanSubmission({ ack, body, view, client }: ViewSubmissionContext) {

// After
async function handlePlanSubmission({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs) {
```

The type mappings:
- `ViewSubmissionContext` → `SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs`
- `SlashCommandContext` → `SlackCommandMiddlewareArgs & AllMiddlewareArgs`
- `BlockActionContext` → `SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs`
- `EventContext` → `SlackEventMiddlewareArgs<EventType> & AllMiddlewareArgs`
- Options handlers → `SlackOptionsMiddlewareArgs<'block_suggestion'> & AllMiddlewareArgs`

## Alternatives considered

**Keep wrappers and fix the registration boundary.** Make the wrappers structurally compatible with Bolt's `Middleware<>` generic. This would mean the wrappers need to include every property Bolt might pass (`context`, `logger`, `next`, `say`, `respond`), not just the four properties handlers use. The wrappers would become nearly identical to Bolt's types with no simplification benefit. Rejected: adds complexity without adding value.

**Use Bolt types at registration but keep wrappers for handler bodies.** Type handlers as wrappers internally, cast once at registration with a typed adapter function. This maintains the simpler handler signatures but requires a mapping layer. Rejected: still requires maintaining two parallel type hierarchies and the adapter adds indirection.

**Use `Parameters<typeof slackApp.view>[1]` utility types.** Extract the handler type from Bolt's method signature. Clever but obscure — a developer reading the handler signature would need to chase through the utility type to understand what `body` actually is. Rejected: trades explicitness for brevity.

## Consequences

**Intended:**

- Registration boundary is type-safe. `events.ts` compiles with zero `as any` casts (except one documented gap: `view_closed` is not a recognized event type in Bolt's `SlackEvent` union).
- Handler bodies have access to Bolt's full typed shapes. `body.actions[0]`, `body.trigger_id`, `body.view?.private_metadata`, `body.user.id` — all typed without casts. This eliminated ~45 `(body as any)` casts in handler bodies.
- No separate type hierarchy to maintain. When Bolt adds a new property to `BlockAction`, handlers see it immediately without updating a wrapper.
- New handlers copy the pattern from any existing handler. The import is one line from `@slack/bolt`.

**Accepted costs:**

- **Verbose signatures.** `SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs` is longer than `ViewSubmissionContext`. Handlers that destructure many properties have longer parameter type annotations. We accept this as the cost of alignment with the framework.
- **Bolt version coupling.** Handler signatures now reference Bolt's internal type names. A major Bolt version that renames these types would require updating every handler. This is low risk — Bolt 4.x is stable, and major version upgrades would require handler changes regardless.
- **One remaining `as any` at `view_closed`.** Bolt's `SlackEvent` type union doesn't include `view_closed` as a recognized event. The handler uses an inline type with a documented comment. This is a Bolt type gap, not a pattern problem.

## When to revisit

- If Bolt releases a version that provides simpler handler typing (e.g., first-class handler type aliases), evaluate whether adopting those would reduce signature verbosity.
- If the team wants shorter type names, consider local type aliases (e.g., `type ViewArgs = SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs`) in a shared types file. Currently not worth the indirection for ~30 handler files.

## References

- Phase 6 Stream 1 commit: `7bf59851` (37 files, 370 insertions, 455 deletions)
- Bolt 4.x middleware types: `@slack/bolt/dist/types/view/index.d.ts`, `actions/index.d.ts`, `command/index.d.ts`
- Custom wrappers removed from: `backend/src/types/handlers.ts`
- Pattern enforcement test: `backend/src/__tests__/integration/pattern-enforcement.test.ts` (assertion 2: "no handler imports deprecated wrapper types")
