# Screen: New Project (P0)

Route: /projects/new . Entry: Home "Start research", global Create, Projects empty state.
Contract: qori-start.md (runtime-verified).

ASKS (3): project name (req, 80, slug uniqueness inline) . problem statement (req, 2000 — "the question this research answers; gaps and questions derive against this") . description (opt, 500).
PREFILLED: approver picker (opt; owner-fallback stated: "If unset, you approve briefs yourself").
DERIVED: actor (session), org, slug (live preview under name field).
DROPPED: channel toggle.
Layout: single focused form, not a wizard — 3 fields don't need steps. Problem statement is the visual center (it feeds all downstream AI). Landing after create = project page in "what next" state: Discovery (optional, enriches your brief) / Create brief — mirrors the runtime confirmation message.
Errors: duplicate slug -> inline on name; missing required -> field-associated (WCAG 3.3.1).