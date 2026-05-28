# Phase B-0.7: Remove Research-Request Intake Flow

**Status:** Stub — implementation deferred until after B-0.5
**Filed:** 2026-05-28

---

## Decision (Lapedra, May 28, 2026)

The research-request intake-and-conversion flow is being removed entirely. The concept (stakeholder submits request → triaged → becomes study) is not needed.

---

## Scope

Remove all components of the request intake flow:

### Commands & Handlers
- [ ] `/qori-request` command registration (or however intake is triggered)
- [ ] `requestResearchHandler.ts` — the whole handler file

### Modals
- [ ] `createStudyFromRequestModal.ts`
- [ ] Any request-specific modal builders

### Templates
- [ ] `config/prompts/research_request.yaml`

### Actions & Buttons
- [ ] `create_study_from_request` action registration
- [ ] The "Create Study from Request" button/action in events.ts
- [ ] The `create_study_from_request` path through `createStudyHandler`

### Notifications
- [ ] Request notification logic (DMs, channel posts about new requests)

### Database (AUDIT BEFORE DROPPING)
- [ ] Check for `requests` table or similar
- [ ] Check for request-related status enums
- [ ] Check for FK references to request data
- [ ] **Flag before dropping anything — needs migration plan if data exists**

### Documentation
- [ ] References to request flow in CLAUDE.md
- [ ] Any user-facing docs about `/qori-request`

---

## Interaction with Phase B-0.6

Removing this flow eliminates one of the two legacy callers of `createStudyHandler`:

| Caller | Action ID | Status after B-0.7 |
|--------|-----------|-------------------|
| requestResearchHandler | `create_study_from_request` | **REMOVED** |
| briefToStudyHandler | `create_study_from_brief` | Remains |

After removal, `createStudyHandler` only serves `create_study_from_brief`. This aligns with the B-0.6 decision that study creation should flow through the project-aware path.

**Consider combining B-0.6 and B-0.7:** With the request caller gone, the remaining `createStudyHandler` migration is simpler — only one entry point to rewire.

---

## Verification

After removal:
1. Confirm no dangling registrations (no button that errors on click, no command that 404s)
2. Grep for orphaned references:
   - `request` in handler context
   - `createStudyFromRequest`
   - `research_request`
   - `qori-request`
3. Confirm events.ts has no dead action registrations
4. Confirm Slack app manifest (if managed) has no orphan command

---

## Dependencies

- Phase B-0.5 complete (folder structure migration)
- Database audit complete (before any schema changes)
