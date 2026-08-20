# Product Principles

## Positioning

Qori turns user research from a collection of documents into governed institutional knowledge. Research should remain useful long after the study ends — and remain owned by the organization that conducted it.

## Design principles

1. **Show the research, not the schema.** Researchers see studies, evidence, findings — never tables, variables, or cascade jargon. Structure is the system's job; the researcher's experience stays narrative.
2. **Every conclusion is navigable.** Any finding or recommendation can be traced backward to its evidence and forward to its downstream use, in ≤2 interactions, without leaving context.
3. **Calm density.** Information-rich but never crowded. One primary action per view. Progressive disclosure over exhaustive display.
4. **Proposal ≠ accepted.** AI output (tags, themes, findings, drafts) is always visually distinct from human-accepted state. Nothing AI-generated silently becomes canonical.
5. **Workflow state ≠ integration state.** "Approved" (research truth) and "GitHub publication failed" (adapter state) are separate visual systems. An integration failure never implies the research failed.
6. **Powerful without looking technical.** Governance, lineage, and audit are present but presented in plain research language.
7. **Configurable without looking like an admin console.** Agency branding and org configuration exist, but research screens never feel like enterprise settings.
8. **Waiting is designed.** Long AI tasks show staged, named progress; users always know what's happening, whether they can leave, and whether their work is safe.

## Usability heuristics — how they land in Qori

- **Visibility of system status** — staged ProgressStepper for AI tasks; StatusBadge on every construct; publication status separate from workflow status; Work Queue as the global "what needs me" surface.
- **Match with the real world** — vocabulary is research practice ("Analyzing interviews", "Evidence", "Ready for review"), never implementation ("processing embeddings", "LLM task").
- **User control and freedom** — review gates before AI output becomes canonical; cancel/retry on long tasks; request-changes on artifacts; no irreversible one-click actions on canonical state.
- **Consistency** — one card grammar, one badge system, one drawer pattern, one lineage pattern across all entity types.
- **Error prevention** — publish requires approved state; destructive actions confirm with consequence-specific copy; stale evidence warns before it misleads.
- **Recognition over recall** — breadcrumbs + context bar always answer "which org / project / study am I in"; recent work on Home; saved filters in Search.
- **Flexibility/efficiency** — keyboard palette (⌘K) opens Search/Ask Qori; Work Queue batch actions; pinned studies.
- **Minimalist design** — overview screens show 5–7 fields max; everything else behind disclosure.
- **Error recovery** — every failure state names the cause in plain language and offers the specific recovery action (Retry publication, Re-run analysis, Contact admin).
- **Help in context** — first-use empty states teach the workflow; "Why am I seeing this?" affordance on AI-surfaced content.

## AI action rules

For every consequential AI action the UI must: show what happened, show what evidence was used, allow review before acceptance, avoid irreversible surprise, and visually distinguish proposal from accepted state.
