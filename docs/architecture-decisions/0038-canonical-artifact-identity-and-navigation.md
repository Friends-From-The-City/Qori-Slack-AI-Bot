# ADR 0038: Canonical artifact identity and navigation

**Status:** Accepted
**Date:** 2026-08-17
**Decision drivers:** Platform Hardening Phase 6 (PH-6A/6B/6C) — establish stable canonical identity for rendered research artifacts, independent of GitHub file paths, and connect artifacts to the canonical evidence they reflect.

## Context

Qori generates research artifacts (session summaries, affinity maps, readouts) and writes them to GitHub as Markdown files. Before PH-6, artifact identity was implicit — determined by the file path where the document was written. This created several problems:

- Renaming or moving a file lost all identity. There was no stable reference to "the affinity map for this study."
- No way to answer "which canonical evidence does this artifact reflect?" without reading the Markdown prose.
- Retrying a failed write could create a second file instead of updating the original.
- File paths encoded dates and human-readable names, making them fragile identity anchors.

ADR 0037 established the canonical evidence graph (evidence_sources → evidence_constructs → evidence_relationships) as the sole lineage authority. Rendered artifacts are downstream projections of this graph — they should reference it, not replicate it.

## Decision

### Artifact public_id is stable canonical identity

Each research artifact gets a `public_id` (UUID) that persists across reruns, renames, and location changes. The `research_artifacts` table stores identity, lifecycle state, and the last successful GitHub location.

### Location metadata is mutable

`repo`, `ref`, `path`, `url`, and `commit_sha` record where the artifact was last successfully written. These fields are updated on each successful write but never cleared on failure — the last-known-good location survives a failed retry.

### Semantic identity follows authoritative derivation state

An artifact's `semantic_key` encodes its template, project/study scope, artifact type, and a derivation fingerprint computed from canonical upstream inputs. Same derivation → same semantic key → same artifact identity (reuse). Changed derivation → new semantic key → new artifact identity.

Date, filename, title, and path are presentation/discovery metadata, not identity.

### Artifact → evidence refs use canonical IDs

The `artifact_evidence_refs` join table links artifacts to evidence constructs via DB primary keys, with a `ref_type` field (default: `reflects`). This answers "which canonical evidence does this artifact reflect?" — distinct from the evidence graph which answers "what supports this finding?"

Attachment preconditions are verified before writing refs:
- Artifact must exist and have `status = 'written'` (GitHub write succeeded)
- Construct IDs must be valid persisted canonical constructs
- Attachment is idempotent (unique constraint on artifact_id + construct_id + ref_type)

### Evidence graph remains lineage authority

`artifact_evidence_refs` does not duplicate the evidence derivation graph. Evidence relationships (DERIVED_FROM, SYNTHESIZED_FROM, SUPPORTS) live in `evidence_relationships`. Artifact refs are a separate concern: "this rendered document reflects these canonical constructs."

### Navigation resolves identity to persisted location

Forward lookup: `artifact.public_id` → persisted `path`, `url`, `commit_sha`.
Reverse lookup: `(repo, ref, path)` → `artifact` record.
Evidence query: `artifact.id` → attached construct refs.
Reverse evidence query: `construct.id` → reflecting artifacts.

### No prose/path/title matching for identity or lineage

Identity resolution, evidence attachment, and navigation all use canonical database IDs and public_ids. No text similarity, title matching, filename parsing, or prose extraction is used for any identity or lineage operation.

## Alternatives considered

**Path-based identity**: Use the GitHub file path as the primary key. Rejected because paths change on rename/move, paths encode dates (creating spurious identity changes), and the same logical artifact could exist at different paths in different branches.

**Content-hash identity**: Hash the rendered Markdown as identity. Rejected because the same evidence produces different Markdown on each render (timestamps, formatting tweaks), so content hash changes even when the authoritative derivation hasn't changed.

**Embed refs in Markdown**: Write evidence UUIDs into the Markdown footer. Rejected because it mixes canonical state (evidence identity) into a rendered projection, creating a second source of truth that could drift from the database.

## Consequences

### Enabled

- **Stable artifact references**: Other systems can reference `artifact.public_id` without worrying about file renames.
- **Evidence traceability**: Given an artifact, you can find exactly which findings, themes, or nuggets it reflects — without parsing Markdown.
- **Safe retries**: Rerunning a template with the same inputs reuses the artifact identity and updates the location rather than creating duplicates.
- **Last-known-good navigation**: Failed writes preserve the prior successful location, so navigation doesn't break on transient GitHub errors.

### Current limitations

- `briefHandler` and `planHandler` are not yet wired into the artifact context flow (PH-6B gap — tracked explicitly).
- Discovery artifacts have no canonical evidence constructs to attach (ADR 0037 limitation — discovery sources not yet in the evidence graph).
- `participant_outreach`, GitHub issue creation, and session-note quarantine are intentionally excluded from artifact identity.
- Attachment failure is observable (structured error log) but has no automated retry mechanism.

## When to revisit

- When brief/plan handlers are wired for artifact context (PH-6D).
- When discovery sources enter the canonical evidence graph (future PH-5D).
- When cross-study or cross-project artifact navigation is needed.
- If attachment failure rates become significant enough to warrant an automated retry queue.

## References

- [ADR 0037 — Canonical evidence lineage](./0037-canonical-evidence-lineage.md)
- [ADR 0030 — Stable database IDs and typed relational lineage](./0030-evidence-lineage-identity.md)
- [ADR 0029 — Canonical evidence state is distinct from cascade projection](./0029-canonical-evidence-state-and-cascade-projection.md)
- `backend/src/services/artifact.service.ts` — artifact identity, lifecycle, attachment
- `backend/src/database/models/research_artifact.ts` — model
- `backend/src/database/models/artifact_evidence_ref.ts` — join table model
- `backend/src/__tests__/integration/artifact-evidence-navigation.test.ts` — PH-6C tests
