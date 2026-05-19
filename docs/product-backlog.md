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

### Brief restructure (complete — ADR 0016)

Restructured to v7.0 interleaved Handlebars/AI architecture. Handler is the data assembly point; LLM writes bounded prose only. See `docs/architecture-decisions/0016-brief-template-v7-restructure.md` for the decision record and `docs/brief-restructure-delta.md` for the planning document.

Completed work includes:
- Interleaved Handlebars + bounded AI tasks (7 focused tasks replacing monolithic `brief_body`)
- Handler-assigned stable IDs for barriers (TB-001) and questions (RQ-001) via pre-render JSON tasks
- Mechanical rendering of display date, timeline phases, timeline display label, metadata table
- Anti-fabrication guards on all prose tasks
- Per-section citation numbering with OUTPUT BOUNDARIES rule
- Cascade summary section
- Recruitment sources as dedicated field and cascade variable
- Timeline preference computed from decision_deadline gap (modal radio removed)
- Plan handler reads timeline_preference, start_date, recruitment_sources from cascade
- Dead plan modal fields removed (recruitment, note-taker, observer)

**Known finding: cascade variable count non-determinism.** The pre-render LLM tasks for research questions and target barriers produce variable-length arrays (e.g., 5 questions on one run, 6 on another with the same inputs). The prompts specify ranges ("3-7 questions") and the LLM picks within that range non-deterministically. This means brief outputs aren't fully reproducible — same study, same inputs, different question/barrier counts. The plan template inherits this property since it consumes the brief's emissions. Not blocking but worth knowing for any future reproducibility requirements.

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

## Cascade UI redesign

The cascade context block and cascade summary section were redesigned during the brief restructure. This workstream tracks the remaining cascade UI work.

### Cascade context block (complete)

The cascade context block in modals was changed from a status recap (always shown, listing all variables with green/blue checks) to a problem-surfacing block:
- All required present → block hidden entirely (no redundant recap)
- Required missing → actionable warning with what's missing and what command to run
- Applied consistently across all 6 modals (plan, brief, discussion guide, synthesis, stakeholder, brief-to-study)

`TemplateContractError` at handler submission time remains as second line of defense (ADR 0007).

### TEMPLATE_CONSUMES drift surface (v1.1 followup)

The cascade context display is hardcoded against `TEMPLATE_CONSUMES` in `cascadeReadinessBlocks.ts`. Every new cascade variable requires manual update to this table in addition to YAML `emits`/`consumes` — three places to keep in sync. Should generate dynamically from YAML cascade contracts. Tracked in `docs/v1.1-followups.md`.

### Cascade summary section in rendered documents

Both brief and plan now include a cascade summary section at the bottom of rendered output, documenting what the document emits/consumes for downstream templates. This pattern should propagate to all restructured templates.

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

~~- Remove desk research, stakeholder notes, and survey data sections from the plan modal — those now live in /qori-discover~~
~~- Recruitment sources should be optional, not required~~
~~- Remove the execution risks section (consolidated elsewhere or no longer relevant)~~

Plan modal was cleaned up during brief restructure Stream B: recruitment sources now flow from cascade, dead fields (note-taker, observer) removed, timeline preference computed from dates. Remaining plan modal fields (study, lead researcher, operational risks) are all legitimate plan-time inputs.

### Notes modal

- Dropdown filter bug — fixed: empty list shown when session_id absent instead of silent fallback to all study notes

### Participant tracker

- Shows Slack user ID instead of human-readable name in some places
- Status labels don't match canonical enum (audit finding) — needs to use the same labels as the constants file

### Outreach

- "Generate another message type" feature — fixed: uses `views.update` instead of `views.push` (overflow actions lack trigger_id)
- Manual compensation override per participant doesn't exist yet (currently compensation is calculated per study, not per participant)

### Observer

- Auto-post functionality needs to fire when an observer joins a session

---

## Notifications

The federal-readiness work touched notification routing but didn't complete it. The full notification system needs review and cleanup.

### Approval flow notifications

Brief approval and plan approval currently post CTAs to the product channel. They should DM the stakeholder/researcher directly. The product channel notification can stay as a summary, but the actionable CTA belongs in DM.

### Status update notifications

~~The fieldwork dashboard doesn't refresh automatically after a participant status update. Researchers have to manually re-run the command to see updated counts.~~

Fixed: `refreshDashboardAfterAction` now called from `participantHandler` (status update) and `participantOutreachHandler` (add participant), matching the existing observer handler pattern.

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

The technical debt items from the TypeScript migration. See `docs/v1.1-followups.md` for the full list of 15 items, which include:

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
- TEMPLATE_CONSUMES hardcoding drift surface (new — from brief restructure)

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
