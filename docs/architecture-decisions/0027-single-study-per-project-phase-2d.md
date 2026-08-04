# ADR 0027: Single study per project is accepted for launch (Phase 2D)

**Status:** Accepted
**Date:** 2026-08-04
**Decision drivers:** State report #2 (folder structure verification) revealed that `briefHandler.ts` sets `studyName = projectSlug`, producing a doubled `{slug}/{slug}` path in GitHub. Investigation showed this is not a bug to fix silently — there is no study-name input in the brief modal, and the architecture is explicitly single-study-per-project.

## Context

The Phase 1 spec (`docs/project-restructure-phase1-spec.md`) defines a `{project-slug}/{study-slug}/` folder hierarchy where a project contains multiple studies. Phase 2D implemented the simpler case: one study per project. The `study_name_block` was removed from the brief modal, and `studyName` is set equal to `projectSlug` (`briefHandler.ts:238`). This produces a doubled path (`testing-mobile-design/testing-mobile-design/01-brief/`) that is structurally odd but self-consistent — all handlers read `study.path` from the database, so create, read, update, and delete all operate on the same doubled path.

The ticket-link bug (`ticketHandler.ts:639`) was a separate issue: it used bare `studyName` instead of `study.path`, bypassing the stored path entirely. That fix is independent of this decision.

## Decision

Single-study-per-project is **accepted for launch** as the Phase 2D scope. The doubled `{slug}/{slug}` path is the accepted artifact of this scope.

The Phase 1 Option B design (multi-study per project) is **deferred, not reversed**. It is filed as a post-launch design item alongside the `/qori-ask` cross-team spike. When multi-study lands, it will:

1. Restore a study name input to the brief modal
2. Derive a distinct study slug from the study name
3. Update `getStudyByProjectAndName` to allow multiple studies per project
4. Migrate existing paths from `{slug}/{slug}` to `{slug}/{distinct-study-slug}`

## Alternatives considered

**Hardcode a fixed study slug (e.g., `'research'`).** This was attempted and reverted within the same PR. It avoids the doubled path but introduces a collision risk: two studies in the same project would both try to use `{slug}/research/`. Since the architecture doesn't support multiple studies per project today, the collision is theoretical — but hardcoding a constant trades one design gap for another without solving the underlying issue.

**Fix the path to not nest (flat `{slug}/` with study folders directly underneath).** This breaks the spec's `{project}/{study}/` contract and would require migration when multi-study is added.

## Consequences

- New studies continue to produce `{slug}/{slug}/` paths. This is cosmetic, not functional.
- The existing test project (`testing-mobile-design/testing-mobile-design/`) is known-stale test data; it gets deleted before launch during E2E setup.
- Previously created GitHub issue footer links that used bare `studyName` are cosmetically broken (404 on the readout link). Accepted, no fix.
- `ticketHandler.ts` now correctly uses `study.path` from the database for link construction (PR #251).

## References

- State report #2: Folder structure verification (2026-08-04)
- `briefHandler.ts:237-238` — Phase 2D comment and `studyName = projectSlug`
- `ticketHandler.ts:639` — readout link now uses `studyPath` from metadata
- Phase 1 spec: `docs/project-restructure-phase1-spec.md` lines 48-81
- PR #251: folder structure fixes
