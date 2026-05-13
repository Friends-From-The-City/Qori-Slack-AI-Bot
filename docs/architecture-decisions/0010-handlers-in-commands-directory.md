# ADR 0010: YAML-processing handlers live in commands/, not inline in events.js

**Status:** Accepted
**Date:** 2026-05-13
**Decision drivers:** Architecture audit found the plan handler was still inline in `events.js` (~50 lines), while every other YAML-processing handler had been extracted to its own file in `backend/src/helpers/slack/commands/`. The inline pattern was a holdover, but it had real consequences: modifying the plan template required navigating to `events.js`, scrolling through ~1300 lines of unrelated handler logic, and finding the right block to edit. Foundation 2 extracted it; this ADR locks in the pattern for everything else.

## Context

Slack apps register handlers for various event types (slash commands, modal submissions, button clicks). The natural place to register these is in a top-level events file. Where the handler logic itself lives is a separate question.

Two patterns existed in the codebase:

**Inline handler:** The full handler logic lives inside the `events.js` registration. The event registration and the handler are the same block of code.

```js
// events.js
slackApp.view('plan_modal', async ({ ack, body, view, client }) => {
  await ack();
  // ... 50+ lines of plan-specific logic ...
});
```

**Extracted handler:** Handler logic lives in `backend/src/helpers/slack/commands/{name}Handler.js` and is imported into `events.js` as a thin registration.

```js
// events.js
const { handlePlanSubmission } = require('./commands/planHandler');
slackApp.view('plan_modal', handlePlanSubmission);
```

Most handlers had been migrated to the extracted pattern over time. The plan handler hadn't been migrated yet. Before restructuring the plan template (which required modifying the handler significantly), Foundation 2 extracted it.

## Decision

Every handler that processes a YAML template lives in its own file at `backend/src/helpers/slack/commands/{name}Handler.js`.

`events.js` contains only:
- Registration lines (`slackApp.view('plan_modal', handlePlanSubmission);`)
- Imports of handler functions
- Top-level Slack app configuration

No business logic, data assembly, template processing, or DB writes happen in `events.js`.

The canonical handler pattern, established across the codebase:

```
ack() → extract form values → build data object → processYamlTemplate() → save DB record → send Slack message
```

Each handler exports a single function (e.g., `handlePlanSubmission`) that follows this pattern. Variations are acceptable when justified (multi-step flows, async-only paths) but should be intentional, not accidental.

## Alternatives considered

**Keep inline handlers, accept the events.js bloat.** Rejected. The audit specifically called out events.js as a coupling concern and the plan handler being inline meant template restructuring touched both a YAML file and a giant events file in the same change. Extracted handlers keep changes scoped.

**Move handlers into the corresponding service file.** E.g., plan logic into `research_study.service.js`. Rejected because service files own data access; handlers own Slack-specific orchestration. Mixing them violates layering — handlers know about Slack views and modal state; services should not.

**Single mega-handler with type-based dispatch.** A `slackEventHandler.js` that dispatches based on event type. Rejected as a needless indirection — the per-handler files are already the right abstraction; routing through a mega-handler just adds one more layer.

**Use a slash-command framework (e.g., Slack Bolt's commandRouter pattern).** Considered. The current pattern is already close to the Bolt convention. Migrating to a more framework-y approach would be a refactor without clear benefit. Stick with the simple per-file handlers.

## Consequences

**Intended:** Modifying a handler is a focused change to one file. Template restructure work touches the YAML and the handler; no need to navigate events.js. New handlers follow the established pattern. Junior engineers (and future Claude Code sessions) can copy an existing handler to scaffold a new one.

**events.js becomes a registration manifest.** After all handlers are extracted, events.js becomes a short file that lists every event the app responds to. This is its right shape — it answers "what events does this app handle" without conflating with "how does this app respond to them."

**Handler testing becomes possible.** Extracted handlers can be unit-tested by importing the handler function and calling it with a mock Slack body. Inline handlers buried in `slackApp.view(...)` are essentially untestable.

**Handler discovery is uniform.** A new engineer looking for "where does the plan modal submission go" gets directed to `commands/planHandler.js` consistently, not "search events.js for `'plan_modal'`."

**Accepted maintenance pattern:** When a new modal is added, the engineer creates `{name}Handler.js`, exports a single function, imports it into events.js, and registers. The pattern is mechanical enough that it doesn't need a generator script — it's a 5-minute task.

## When to revisit

- The number of handlers grows enough that even the imports in events.js become unwieldy (currently 14 handler files; would become a concern at 50+). At that point, sub-folder organization by domain might help.
- A different architectural pattern is adopted (e.g., a microservices split where some handlers become separate services).
- An emergent pattern shows up that doesn't fit the canonical handler shape — at which point either the pattern adapts or this ADR gets superseded.

## References

- `backend/src/helpers/slack/commands/` — the handler directory
- `backend/src/events.js` — the registration file
- The plan handler extraction: `commands/planHandler.js` (created in Foundation 2)
- Audit Section 3.2 — handler pattern consistency check
- Related: ADR 0007 (cascade contracts fail loudly — implemented in handlers, requires the extraction pattern to work cleanly)
