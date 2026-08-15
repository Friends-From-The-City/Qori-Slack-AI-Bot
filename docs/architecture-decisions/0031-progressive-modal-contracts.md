# ADR 0031: Progressive modal contracts — consumes / asks / commits / control / uploads / derives

**Status:** Accepted
**Date:** 2026-08-15
**Decision drivers:** Evidence architecture foundation — establishing a conceptual vocabulary for modal interactions that prevents researchers from re-entering information Qori already knows, without requiring an immediate whole-product rewrite.

## Context

Qori's modals collect researcher input for AI-powered document generation. Currently, modal design is ad hoc: each modal defines its own fields based on what the template needs. Some fields pre-populate from the database (e.g., lead researcher auto-fills from Slack profile), but there is no systematic vocabulary for distinguishing between "information Qori already has" and "genuinely new input the researcher must provide."

As the evidence layer (ADR 0029) grows, Qori will accumulate accepted research state: project context, discovery findings, research questions, validated barriers, participant observations. Modals should progressively consume this state rather than asking researchers to re-enter or re-describe it.

`/qori-start` is the root context — it establishes the project, problem statement, and GitHub structure that all subsequent workflows reference. Every modal downstream of `/qori-start` can, in principle, consume project-level context.

## Decision

From this point forward, whenever a modal is materially changed, its contract is conceptually defined using these categories:

- **CONSUMES** — accepted context Qori already knows with sufficient confidence. These values are loaded from the database or evidence store and displayed as read-only or pre-populated fields. The researcher should not need to re-enter them.

- **ASKS** — genuinely missing information or required human choice that Qori cannot derive. These are the modal's interactive fields — the researcher must provide or confirm these values.

- **COMMITS** — authoritative state created or changed by the interaction. What does submitting this modal write to the database? This makes the modal's side effects explicit.

- **CONTROL** — workflow-only state that influences processing but isn't research content. Examples: "generate in background" toggle, study selector, output format preference.

- **UPLOADS** — raw evidence or source material attached to the interaction. Examples: uploaded transcripts, survey datasets, policy documents.

- **DERIVES** — values computed by the system from other inputs, not entered by the researcher and not requiring LLM generation. Examples: next participant code, project slug, display date.

The governing UX rule: **Do not ask a researcher to re-enter information Qori already knows with sufficient confidence.**

This is a progressive discipline, not a framework. No generic modal DSL is built. No existing modal is rewritten solely to conform. The vocabulary is applied when a modal is next materially changed, and the contract is documented in the modal builder's JSDoc or a companion comment.

`/qori-start` is recognized as the root project context. Its COMMITS (project name, problem statement, channel binding, project membership) are CONSUMES candidates for every downstream modal.

## Alternatives considered

**Build a modal contract DSL now.** A declarative format (`{ consumes: [...], asks: [...], commits: [...] }`) that generates modals automatically. Premature — Qori has ~30 modals, ~35% are dynamic factory functions (per the modals architecture decision in CLAUDE.md), and the evidence layer doesn't yet have enough accepted state to make automatic consumption valuable. Build the vocabulary first; consider automation after 3-5 modals have been manually converted.

**Skip the vocabulary — just pre-populate where obvious.** Some modals already pre-populate (lead researcher, start date). But without a vocabulary, there's no systematic way to audit "which modals ask for things Qori already knows" or to plan evidence-layer integration. The vocabulary costs nothing to adopt and makes the progressive conversion auditable.

**Rewrite all modals now.** The evidence layer has zero rows. Rewriting 30 modals to consume evidence state that doesn't exist yet is waste. Progressive adoption means each modal conversion happens alongside the vertical slice that populates the evidence it would consume.

## Consequences

- New or materially changed modals document their CONSUMES/ASKS/COMMITS/CONTROL/UPLOADS/DERIVES contract.
- Existing modals are not rewritten solely to conform — the contract is applied when the modal is next changed for functional reasons.
- `/qori-start` is recognized as the root context. Its committed state (project, problem statement, channel) is consumable by all downstream modals.
- The evidence layer (ADR 0029) progressively provides more CONSUMES candidates as vertical slices populate it.
- Modal review becomes auditable: "this modal ASKS for methodology, but the research brief already COMMITTED a methodology choice" is a visible contract violation that can be resolved by converting the field from ASKS to CONSUMES.
- No infrastructure is built in this phase — this is a vocabulary and a discipline, not a framework.

## References

- ADR 0029 — Canonical evidence state (provides CONSUMES candidates)
- `/qori-start` handler — `backend/src/helpers/slack/commands/projectStartHandler.ts`
- Modal builders — `backend/src/helpers/slack/ui/`
- CLAUDE.md — Modals Architecture section (decision to keep modals as JS, ~35% dynamic)
