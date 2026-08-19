# Architecture Decision Records

This directory holds Architecture Decision Records (ADRs) for Qori-Slack. An ADR is a short markdown file capturing a single architectural decision: what was chosen, what alternatives were considered, and why this option won.

ADRs exist for three reasons:

1. **Future readers can reconstruct intent.** When a government partner's engineering team asks "why did you do it this way," the answer lives in the repo, not in someone's head.
2. **Decisions don't get re-litigated.** Without ADRs, the same question gets asked every six months and re-answered slightly differently each time. ADRs lock the answer until something new prompts a revisit.
3. **Drift becomes visible.** When a future change contradicts an ADR, that contradiction is explicit. Either the ADR gets superseded with a clear rationale, or the change gets reconsidered.

## When to write an ADR

Write one when a decision meets any of these criteria:

- Affects more than one file or service
- Constrains future work (e.g., "we will always do X")
- Was non-obvious — multiple reasonable options existed
- Future-you might forget the reasoning in three months
- Will be questioned by a reviewer (internal or external)

You do not need an ADR for routine implementation choices. The bar is "would a thoughtful engineer joining this codebase wonder why we did this." If yes, ADR.

## Format

Each ADR is a single markdown file named `NNNN-short-slug.md` where `NNNN` is a four-digit sequence number. Numbers don't restart; they grow monotonically.

The file follows this structure:

```markdown
# ADR NNNN: [Short title in present tense]

**Status:** [Accepted / Superseded by ADR-XXXX / Deprecated]
**Date:** YYYY-MM-DD
**Decision drivers:** [Who or what prompted this — a bug, a partner requirement, an audit finding]

## Context

What's the situation that requires a decision? What constraints are in play? Two to four paragraphs.

## Decision

What did we choose? Single paragraph, plainly stated.

## Alternatives considered

For each alternative we genuinely considered, one paragraph: what it was, why it didn't win.

## Consequences

What this decision means going forward. Both intended (the wins) and potential downsides (what we accept by choosing this).

## References

Links to relevant Slack threads, PRs, related ADRs, or code locations.
```

## Status lifecycle

- **Accepted** — the active decision
- **Superseded by ADR-XXXX** — a later ADR replaces this one; this ADR is kept for history but no longer reflects current architecture
- **Deprecated** — no longer relevant, but kept for history

Never delete an ADR. Even superseded ones are part of the record.

## Numbering

The first ADR is `0001-record-architecture-decisions.md` (meta — the decision to use ADRs at all). Each subsequent decision gets the next number. If two ADRs are written simultaneously and pick the same number, whoever merges last bumps theirs.

## Reading the existing ADRs

Start with `0001` and read forward. The history is itself useful — it shows how thinking on a topic evolved.

## Index

### Architectural decisions

- [0001 — Record architecture decisions](./0001-record-architecture-decisions.md) — Meta: the decision to use ADRs at all
- [0002 — Canonical participant status enum](./0002-canonical-participant-status-enum.md) — One set of status values, validated at the model layer
- [0003 — Outreach tracking on StudyParticipant](./0003-outreach-tracking-on-studyparticipant.md) — Outreach as first-class event, not derived state
- [0004 — Compensation snapshots on participant creation](./0004-compensation-snapshots-on-creation.md) — Snapshot vs live recalculation
- [0005 — Templates render via Handlebars with bounded LLM slots](./0005-handlebars-template-architecture.md) — The architectural fix; the foundation everything else builds on
- [0006 — Transform upstream variables on consume, not on emit](./0006-transform-on-consume-not-emit.md) — Adapt at the consumer boundary
- [0007 — Cascade variable contracts fail loudly](./0007-cascade-contracts-fail-loudly.md) — Required missing variables throw, don't warn
- [0008 — Render empty rather than fabricate](./0008-empty-over-fabricated.md) — Visible failure beats invisible fabrication
- [0009 — Test infrastructure with factory fixtures and reusable mocks](./0009-test-infrastructure-pattern.md) — The Jest pattern that scales
- [0010 — YAML-processing handlers live in commands/](./0010-handlers-in-commands-directory.md) — events.js is a registration manifest
- [0011 — Hardcoded Qori-style timeline durations](./0011-hardcoded-timeline-durations.md) — Alpha-only; revisit when we have signal
- [0012 — LLM emits structured JSON when output is a table or list](./0012-structured-json-for-llm-outputs.md) — Constrained shape can't drift through paraphrasing
- [0014 — Sequelize v6 built-in TypeScript generics for model typing](./0014-sequelize-typescript-pattern.md) — Lowest disruption with real type safety; no new dependencies
- [0015 — Bolt native middleware types for handler signatures](./0015-bolt-native-middleware-types.md) — Framework-aligned typing; eliminates registration boundary casts
- [0016 — Brief template restructured to v7.0 interleaved Handlebars/AI](./0016-brief-template-v7-restructure.md) — First template restructure; sets the pattern for the remaining 10
- [0017 — Template ID convention](./0017-template-id-convention.md) — YAML `id` must match consumer-side `consumes.source` exactly; no suffixes
- [0018 — Cascade-aware synthesis modal](./0018-cascade-aware-synthesis-modal.md) — Synthesis reads variable store; file picker removed; structured nuggets as real input
- [0019 — Ack-first await-extraction handler pattern](./0019-ack-first-await-extraction-handler-pattern.md) — Handlers must await extractionPromise before returning success; eliminates read-before-write races
- [0020 — System-assigned per-study participant codes](./0020-system-assigned-participant-codes.md) — PT-XXX codes are system-assigned at creation; LLM uses verbatim (complements L005)
- [0021 — Single source of truth for cascade consumes/emits](./0021-single-source-of-truth-cascade-consumes-emits.md) — YAML is authoritative; TypeScript generated; CI freshness check prevents drift
- [0022 — Data integrity batch (R1/R2/R3)](./0022-data-integrity-batch.md) — CHECK constraints for enums; DATE/TIME types with timezone anchor; drop denormalized count
- [0023 — Access control current state and gaps](./0023-access-control-current-state-and-gaps.md) — Federal-reviewer evidence: honest gap analysis, authorization map, remediation plan
- [0024 — Project-level authorization model](./0024-project-level-authorization-model.md) — Tiered access (membership=act, creator=delete); channel-based membership with fail-closed Slack fallback
- [0025 — Admin center and federal records management](./0025-admin-center-records-management.md) — Owner-as-records-authority; disposition schedules; legal holds; retention-gated deletion; audit logging
- [0026 — PII scrubbing at ingestion](./0026-pii-scrubbing-at-ingestion.md) — Transient-capture scrub; quarantine; review-gates-commit; no real names stored
- [0027 — Single study per project accepted for launch (Phase 2D)](./0027-single-study-per-project-phase-2d.md) — Doubled {slug}/{slug} path is accepted artifact; multi-study deferred post-launch
- [0028 — Deterministic research transformations occur outside generative models](./0028-deterministic-research-transformations.md) — LLMs interpret computed facts; they don't compute them
- [0029 — Canonical evidence state is distinct from cascade projection](./0029-canonical-evidence-state-and-cascade-projection.md) — Authoritative evidence persists independently of study_variables consumer shapes
- [0030 — Stable database IDs and typed relational lineage are authoritative evidence identity](./0030-evidence-lineage-identity.md) — DB IDs are identity; document anchors are presentation
- [0031 — Progressive modal contracts](./0031-progressive-modal-contracts.md) — CONSUMES/ASKS/COMMITS/CONTROL/UPLOADS/DERIVES vocabulary applied progressively
- [0032 — Versioned researcher-adjudicated qualitative coding](./0032-versioned-qualitative-coding.md) — Governed qualitative evidence; privacy-gated model access; immutable versioned codebooks
- [0033 — State classification and GitHub projection removal](./0033-state-classification-and-github-projection-removal.md) — Six-class state taxonomy; GitHub .variables writes removed; Postgres sole cascade authority
- [0034 — Model provider boundary](./0034-model-provider-boundary.md) — Workflows select tier (haiku/sonnet/opus); single factory owns provider instantiation
- [0035 — Unstructured content privacy gate](./0035-unstructured-content-privacy-gate.md) — Platform-wide invariant: all unstructured content → privacy policy → authorized representation → model access
- [0036 — External side-effect idempotency](./0036-external-side-effect-idempotency.md) — External actions require stable semantic identity; retries converge on one action
- [0037 — Canonical evidence lineage](./0037-canonical-evidence-lineage.md) — Evidence graph is lineage authority; study_variables is projection; upstream→downstream edges; candidate vs accepted
- [0038 — Canonical artifact identity and navigation](./0038-canonical-artifact-identity-and-navigation.md) — Artifact public_id is stable identity; location is mutable; artifact→evidence refs use canonical IDs; no prose/path matching
- [0039 — Disaster recovery posture](./0039-disaster-recovery-posture.md) — Logical backup as primary portable recovery; PITR gap; validated restore drill; recovery runbook
- [0040 — Records lifecycle and disposition authority](./0040-records-lifecycle-and-disposition-authority.md) — Qori enforces assigned records authority but does not invent schedules; fail-closed disposition gate; holds override disposition
- [0041 — Deployable government environment boundary](./0041-deployable-government-environment-boundary.md) — Qori is deployable in agency-controlled infrastructure; all providers are adapters; formal deployment contracts
- [0042 — Canonical organization and actor boundary](./0042-canonical-organization-and-actor-boundary.md) — Interface identities map to canonical actors; organizations/teams/projects define authority; Slack is adapter not authority
- [0043 — Adapter-neutral authentication and actor resolution](./0043-adapter-neutral-authentication-and-actor-resolution.md) — AuthAdapter interface extracts IdentityEvidence per provider; OIDC production contract; identity uniqueness is (provider, issuer, subject); no authorization from token claims
- [0044 — Channel-independent application boundary](./0044-channel-independent-application-boundary.md) — Application service layer between adapters and domain services; Slack handlers become thin adapters; artifact canonical state separated from projection state

### Lessons (informal ADRs from failure modes)

- [L001 — Service queries default to fetching all model attributes](./L001-fetch-all-model-attributes.md) — From the attribute whitelist bug
- [L002 — Parsers require fuzz inputs covering format variations](./L002-parser-fuzz-coverage.md) — From the comma parser bug
- [L003 — End-to-end tests for critical flows, not just per-layer unit tests](./L003-end-to-end-tests.md) — From three rounds of compensation bugs
- [L004 — Cascade contract test suite](./L004-cascade-contract-test-suite.md) — From synthesis bypassing declared consumes blocks; backfill readout/brief/plan
- [L005 — Per-participant pool schemas must include participant field](./L005-per-participant-pool-schema-field.md) — From silent isolation failure in atomic_nugget_detail; enforced by CI
- [L006 — Dynamic block_id for Slack dropdowns with changing options](./L006-dynamic-blockid-for-slack-dropdowns-with-changing-options.md) — From stale session selection on study change; use context-scoped block_id to force fresh state

The L-prefix distinguishes "lessons" from active design decisions. Lessons capture failure patterns to avoid; decisions document architectural commitments. Both are useful; they serve different purposes.

### Related documents

- [Quarterly architecture audit](../audits/quarterly-architecture-audit.md) — The recurring discipline that surfaces drift
