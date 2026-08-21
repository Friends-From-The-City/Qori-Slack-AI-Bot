# Screen: Research Plan form (P0)

Route: /studies/:id/plan/new. Contract: research-plan.md.
Exactly 2 inputs: lead researcher (PREFILLED users-select, from study.created_by/session — reassignable) . operational risks (opt, multiline).
Everything else INHERITED and shown as read-only inherited context with provenance ("from the approved brief"): objectives, questions, barriers, methodology, timeline (computed phases from start_date+preference), participants, compensation (computed from budget), deliverables.
Gate: cascade readiness, NOT brief_status — missing objectives/questions/barriers -> warning-only view, no submit, link to brief. NO plan approval (removed; brief is the only gate).
Do NOT render as a big authoring form — it is a confirmation surface over inherited state with 2 asks.