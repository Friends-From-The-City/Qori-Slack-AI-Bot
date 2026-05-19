# Qori Product Backlog

**Last updated:** 2026-05-19
**Status:** Active work in progress. Federal go-to-market is the final workstream; all other workstreams should complete before triggering Phase 0 of the launch playbook.

This document consolidates the work we've identified across conversations into a single backlog. Items are grouped by workstream rather than by sequence — workstreams can run in parallel or be interleaved as priorities shift.

For codebase hygiene items (technical debt from the TypeScript migration), see `docs/v1.1-followups.md`.
For federal go-to-market execution, see the federal go-to-market playbook.

---

## Template restructure queue

The migration paused template standardization. The plan template (v7.0) is the current reference for the canonical pattern: factual/computed data via Handlebars, LLM only writes prose, structured data emitted as JSON with schema validation, anti-fabrication guards, cascade summary section, cross-reference verification through Postgres.

Per the post-migration audit, 26 of 27 templates have no unit tests, and 12 use the older "minimal static + single LLM" pattern instead of the canonical interleaved Handlebars + bounded LLM slots (ADR 0005).

### Brief restructure (first priority)

The brief template is upstream of plan. Restructuring brief improves the cascade variables plan consumes. Brief restructure also exposes any contract drift between what brief emits and what downstream templates expect.

Brief should emit `research_objectives` as a clean `string[]` (per ADR 0006), `research_questions` and `target_barriers` as fully typed object arrays. The current brief works but doesn't follow v7.0's discipline around factual vs. generative content separation.

### Discovery templates

`desk_research`, `stakeholder_synthesis`, `survey_synthesis`. These emit foundational cascade variables that downstream synthesis and readout templates consume. Restructuring them strengthens the entire cascade chain's reliability.

Stakeholder synthesis specifically had a truncation issue noted earlier; the restructure should resolve that and ensure all emitted variables (constraints, priorities, alignment gaps, etc.) flow cleanly to readouts.

### Synthesis templates

`affinity_mapping`, `persona_generator`. These consume per-session nuggets and produce study-level patterns. They're high-value because their outputs feed every readout and ticket-creation flow.

### Readout templates

`designer_readout`, `engineering_readout`, `accessibility_readout`, `leadership_readout`. These are the audience-specific deliverables researchers share with stakeholders. The current readouts work but need ticket bodies iterated to production-grade before they're declared complete.

### Discussion guide, session_summary, participant_tracker

`discussion_guide` has known cascade gaps (75-minute session length — see Modal & UX section). `session_summary` emits the atomic nuggets that synthesis depends on; its quality directly affects downstream quality. `participant_tracker` has the status label mismatch noted in the audit (it uses display labels that don't match the canonical enum).

### Remaining templates

Whatever's left after the above. Likely smaller, less consequential templates.

---

## Modal & UX polish

Items accumulated during pre-migration work and during migration debugging. None are blocking but each affects researcher experience.

### Discussion guide

- 75-minute session length field doesn't flow from modal into cascade variables
- `task` should be renamed to `topic` across discussion guides (more accurate semantically)
- Materials & links field needs to be added to study setup

### /qori-discover

- Field cleanup conditional on discovery type — different fields should appear depending on whether the researcher selects desk research, stakeholder, or survey
- Methodology should auto-pre-fill from discovery output rather than requiring re-entry on plan

### /qori-plan

- Remove desk research, stakeholder notes, and survey data sections from the plan modal — those now live in /qori-discover
- Recruitment sources should be optional, not required
- Remove the execution risks section (consolidated elsewhere or no longer relevant)

### Notes modal

- Dropdown filter bug (specific behavior not documented in earlier notes — needs investigation)

### Participant tracker

- Shows Slack user ID instead of human-readable name in some places
- Status labels don't match canonical enum (audit finding) — needs to use the same labels as the constants file

### Outreach

- "Generate another message type" feature is broken
- Manual compensation override per participant doesn't exist yet (currently compensation is calculated per study, not per participant)

### Observer

- Auto-post functionality needs to fire when an observer joins a session

---

## Notifications

The federal-readiness work touched notification routing but didn't complete it. The full notification system needs review and cleanup.

### Approval flow notifications

Brief approval and plan approval currently post CTAs to the product channel. They should DM the stakeholder/researcher directly. The product channel notification can stay as a summary, but the actionable CTA belongs in DM.

### Status update notifications

The fieldwork dashboard doesn't refresh automatically after a participant status update. Researchers have to manually re-run the command to see updated counts.

### Generic error notifications

The Phase 4 work added a generic "Something went wrong on our end" DM for non-TemplateContractError exceptions. Worth reviewing whether the wording and context are right, and whether ops should also be notified for these (Sentry, ops Slack channel) rather than just the user.

### Cross-cutting notification standards

There isn't yet a documented standard for "when should Qori DM a user vs. post in channel vs. update a UI element." Worth defining as we touch the notification code.

---

## Deferred features

Features that don't exist yet. Not blocking launch but worth tracking for prioritization.

### Screener

A pre-recruitment screening flow. Researchers would define screening questions; potential participants would answer; only qualified participants would proceed to scheduling. Current workflow assumes participants are pre-qualified.

### Bulk-add participants

Adding participants one at a time is slow for studies with many participants. Bulk upload (CSV or paste-from-spreadsheet) would speed up large studies.

### Manual compensation override per participant

Currently compensation is calculated per study (budget / target participants). Some studies need participant-level overrides (e.g., participants who do additional sessions, accessibility consultants paid different rates).

### Per-study access control for /qori-ask

`/qori-ask` is currently open to all users. Some studies have sensitive participant data; the team needs to be able to restrict who can query a specific study.

### total_participants drift reconciliation

The `total_participants` count on a study can drift from the actual participant rows if participants are added/removed in ways that bypass the counter update. Worth a reconciliation job or a database trigger.

---

## Slash command consolidation

Pre-migration design work proposed reducing from 13-14 commands to 11. The proposed set includes:

- `/qori-fieldwork` as a status dashboard replacing 5 current commands
- `/qori-analyze` combining upload and analysis (currently split)
- `/qori-ask` for free-text cross-study queries, open to all users including stakeholders

The design exists; implementation hasn't started. This is significant UX work because it changes how researchers think about Qori — fewer commands, more affordances per command, confident defaults pre-filled from cascade.

---

## v1.1 codebase hygiene

The technical debt items from the TypeScript migration. See `docs/v1.1-followups.md` for the full list of 14 items, which include:

- User auth boilerplate cleanup
- `study_name` denormalization across 3 tables (move to study_id FK)
- Database CHECK constraints for application enums
- STRING -> DATE/TIME column conversions
- Cascade emission type generation from YAML schemas
- Modal metadata audit
- Cascade access pattern consolidation
- Lint rules for pattern enforcement (stricter than current test-suite assertions)
- 208 `catch (error: any)` -> `unknown` with narrowing (partially done; some legacy code remains)
- Template unit tests (26 of 27 templates untested at rendering level)

These items don't block product work or federal go-to-market. They make the codebase more robust over time. Worth picking up opportunistically when touching related code.

---

## Federal go-to-market

The final workstream. See the federal go-to-market playbook for full context.

The migration produced the readiness criteria for Phase 0 (typed codebase, audit report, documented architecture, regression test coverage, ADR archive). Triggered by Lapedra signaling "Qori is done" or "let's launch" or similar.

Phase 0 work includes:
- Demo video (60-90 second product walkthrough)
- Deployment runbook (4-hour install target)
- Brand-name justification one-pager
- Patent documentation
- VA.gov RFI response

This workstream begins after the other workstreams in this backlog reach a state where Qori can be shown to a federal customer without obvious gaps. The audit report serves as the technical backing.

---

## Notes

- This backlog doesn't prioritize. The current understanding is templates and modals/notifications come first because they're the visible product surface; deferred features come later; federal go-to-market is last.
- Items move between sections as priorities shift. New findings get added.
- For any item that becomes "in progress," consider whether it warrants an ADR per the architecture decisions workflow.
