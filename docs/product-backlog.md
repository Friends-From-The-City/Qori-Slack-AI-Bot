# Qori Product Backlog

**Last updated:** 2026-05-20
**Status:** Active work in progress. Federal go-to-market is the final workstream; all other workstreams should complete before triggering Phase 0 of the launch playbook.

This document consolidates the work we've identified across conversations into a single backlog. Items are grouped by workstream rather than by sequence — workstreams can run in parallel or be interleaved as priorities shift.

For codebase hygiene items (technical debt from the TypeScript migration), see `docs/v1.1-followups.md`.
For federal go-to-market execution, see the federal go-to-market playbook.
For modal-specific design guidance, see `docs/modal-design-principles.md`.

---

## Template restructure queue

The migration paused template standardization. The plan template (v7.0) and brief template (v7.0) are the established references. Per the post-migration audit, 26 of 27 templates have no unit tests, and 12 use the older "minimal static + single LLM" pattern instead of the canonical interleaved Handlebars + bounded LLM slots (ADR 0005).

### Completed (May–August 2026)

- **research_plan** v7.2 (OUTPUT BOUNDARIES added August 2026, validity checklist, metadata ruling)
- **research_brief** v7.1 (validity checklist, metadata ruling)
- **desk_research** v7.1 (validity checklist, metadata ruling)
- **stakeholder_synthesis** v7.1 (✓→empty cells, metadata ruling)
- **survey_synthesis** v7.1 (validity checklist, metadata ruling)
- **affinity_mapping** v7.1 (validity checklist, metadata ruling)
- **persona_generator** v7.0 (metadata ruling)
- **designer_readout** v7.0 (metadata ruling; delta doc marked Implemented)
- **research_readout** v7.0 (metadata ruling)
- **engineering_readout** v7.0 (metadata ruling)
- **accessibility_readout** v7.0 (metadata ruling)
- **leadership_readout** v7.0 (metadata ruling)
- **discussion_guide** v7.1 (true v7.0 restructure August 2026 — was monolithic despite v7.0 label)
- **journey_mapping** v7.0 (true restructure from v4.0, August 2026)
- **session_summary** v7.2 (reference implementation, metadata ruling)
- **design_opportunity_generator** v7.0 (metadata ruling)
- **jobs_to_be_done** v7.0 (metadata ruling)
- **usability_issues_extractor** v7.0 (metadata ruling)

### Post-launch conformance backlog

Restructure to v7.0 when next touched. Priority order: service_blueprint first.

- **service_blueprint** v1.2 — monolithic, no OUTPUT BOUNDARIES. First priority among these.
- **targeted_readouts** v4.1 — monolithic, 8 audience formats. Dead config strings fixed but structure unchanged.
- **github_issues_generator** v4.0 — monolithic. Downstream terminal (emits GitHub issues, not cascade variables).
- **participant_outreach** v4.2 — 2-task communication template. Pattern C per §4.12 (low design weight).

Not applicable for v7.0 restructure (utility/non-AI):
- **participant_tracker** v1.2 — pure Handlebars, zero AI tasks
- **session_notes** v2.1 — handler-driven formatting
- **transcript_upload** v2.4 — transcript processing utility

---

## Cascade UI redesign

The cascade architecture is load-bearing in the system, but the UI doesn't always need to display it.

### Cascade Context block in plan modal

When researcher opens plan modal, they see a recap of brief commitments — all shown even when everything's fine. Change to problem-surfacing block: hide when complete, show actionable warning when required missing, show "run /qori-brief first" when no variables exist.

Implementation requires audit of how often the block is shown today, what problem states to surface, and whether there's an existing pattern for "modal opens with warning state."

### Cascade summary section in rendered documents

The "Cascade summary" section at the bottom of brief and plan output serves two audiences with different needs (engineers and stakeholders). Possible directions: rename ("Audit trail"), move discovery sources out, or hide in rendered document and surface in operator/debug views.

Worth deliberate audience-first design.

---

## Modal & UX polish

Items accumulated during pre-migration work and during migration debugging. See `docs/modal-design-principles.md` for the design reference document.

### Discussion guide

- 75-minute session length field doesn't flow from modal into cascade variables
- `task` should be renamed to `topic` across discussion guides (more accurate semantically)
- Materials & links field needs to be added to study setup

### /qori-discover

- Field cleanup conditional on discovery type — different fields should appear depending on whether the researcher selects desk research, stakeholder, or survey
- Methodology should auto-pre-fill from discovery output rather than requiring re-entry on plan

### /qori-plan

- ~~Remove desk research, stakeholder notes, and survey data sections from the plan modal — those now live in /qori-discover~~ **Done** (2026-05-21, study setup modal v2.0)
- ~~Remove the execution risks section (consolidated elsewhere or no longer relevant)~~ **Reversed** (2026-05-21) — field kept with conversational label. Cascade doesn't contain researcher-known operational risks; removing would force LLM to fabricate or omit. See `docs/qori-plan-modal-audit.md` §2.
- ~~Study name editable text input~~ **Done** (2026-05-21) — replaced with non-editable context display, handler reads from private_metadata
- ~~Cascade warning alongside form~~ **Done** (2026-05-21) — cascade warning now gates the form; when required vars missing, form is hidden entirely

### Participant tracker

- Shows Slack user ID instead of human-readable name in some places
- Status labels don't match canonical enum (audit finding) — needs to use the same labels as the constants file

### Outreach

- Manual compensation override per participant doesn't exist yet (currently compensation is calculated per study, not per participant)

### Observer

- Auto-post functionality needs to fire when an observer joins a session

---

## Cascade visibility follow-ons

Filed 2026-05-21 as part of the discovery surface redesign (D6: cascade visibility principle).

### Brief modal discovery indicator

Soft signal at top of `/qori-brief` modal showing what discovery artifacts will inform the brief. When artifacts exist: "Discovery available: 2 artifacts will inform this brief." When none: "No discovery yet — brief will be generated from your inputs alone." Information, not a gate. Must cohere with the existing discovery checkbox section. Ships separately after the discovery hub lands.

**Why:** Discovery's cascade contribution is currently invisible until the researcher reaches the checkbox section. The indicator front-loads the information at the moment it matters — when the researcher is deciding whether to start a brief.

### Generated artifact cascade-depth signal

Every rendered document (brief, plan, discussion guide, downstream synthesis) shows what informed it in a "Generated from" block. Examples: "Generated from: researcher inputs + desk research (veteran-telehealth-barriers, May 15) + stakeholder synthesis (claims-process, May 18)" or "Generated from: researcher inputs only. No upstream discovery." Touches every cascade-emitting template's output structure. Separate workstream.

**Why:** Federal customers care about provenance. Researchers care about knowing what their work is built on. The cascade summary section in brief and plan outputs partially does this but is currently more for engineers than researchers/stakeholders. This workstream makes it researcher-readable and consistent across all templates.

---

## Slack surface area expansion

These are larger product additions that change Qori's surface area meaningfully. Both are post-launch candidates — substantial enough to deserve dedicated design and implementation phases rather than being bundled with the current polish work.

### Home tab

The Slack app sidebar shows a Home tab when users click on Qori. Today it's likely default/empty. Built out, it becomes the researcher's command center:

- Active studies with status and next expected step
- Pending approvals (briefs awaiting sign-off, plans awaiting review)
- Recent outputs with quick links
- Cascade health indicators (studies with incomplete or stale data)
- Quick action buttons for common starts (/qori-discover, /qori-brief, /qori-plan)

Refreshes on view, always current. Different views for researcher vs. stakeholder roles based on user role.

This takes Qori from "tool I use sometimes" to "place where my research work lives." Probably 3-5 days of CC time to build well. Substantial design work needed first — information density, role-specific views, performance with hundreds of studies.

### Canvas integration

Slack Canvas (released 2024) is long-form collaborative documents that live in channels. Current Qori outputs are markdown files in GitHub posted as Slack messages. A Canvas version could:

- Live in the study channel as a persistent artifact (no scrolling back to find the brief)
- Support inline comments from stakeholders on specific sections
- Update in place when regenerated, with edit history preserved
- Embed live data (participant counts, status snippets) that stays current

Tradeoff: Canvas is Slack-native, less portable. GitHub markdown is exportable and archivable, which matters for federal customers who may want artifacts in their own systems.

Hybrid approach worth considering: artifacts continue to live in GitHub (source of truth, portable), and Canvas versions get auto-generated for collaboration in Slack. Canvas as a view, GitHub as the data.

This changes the artifact model meaningfully. Best done post-launch when real federal users can give feedback on what they need.

---

## Notifications

The federal-readiness work touched notification routing but didn't complete it. The full notification system needs review and cleanup.

### Approval flow notifications

Brief approval and plan approval currently post CTAs to the product channel. They should DM the stakeholder/researcher directly. The product channel notification can stay as a summary, but the actionable CTA belongs in DM.

### Generic error notifications

The Phase 4 work added a generic "Something went wrong on our end" DM for non-TemplateContractError exceptions. Worth reviewing whether the wording and context are right, and whether ops should also be notified for these (Sentry, ops Slack channel) rather than just the user.

### Cross-cutting notification standards

There isn't yet a documented standard for "when should Qori DM a user vs. post in channel vs. update a UI element." Worth defining as we touch the notification code.

---

## Deferred features

Features that don't exist yet. Not blocking launch but worth tracking for prioritization.

### Screener

A pre-recruitment screening flow. Researchers would define screening questions; potential participants would answer; only qualified participants would proceed to scheduling. Current workflow assumes participants are pre-qualified.

### DB demographics as authoritative cascade source

The researcher-entered, SPD-15-compliant demographic record in `study_participants.demographics_info` should plausibly BE `participant_metadata`'s demographic layer, rather than the cascade relying on LLM transcript extraction. Currently the Add Participant demographics (race/ethnicity, age range, education, location) flow only to the participant tracker and DSAR export — never into the cascade. The cascade's `participant_metadata` emit from session_summary extracts `background` and `accessibility` from the transcript, which risks inferred demographic characterization of veteran participants (the fabrication class this architecture exists to prevent). Design decision: merge the DB record into participant_metadata at the handler level, making the researcher's structured input the authoritative source and constraining the LLM extraction to session-observed facts only.

**Filed:** 2026-08-05. Adjacent to ADR 0027 (multi-study) and `/qori-ask` cross-team spike.

### Bulk-add participants

Adding participants one at a time is slow for studies with many participants. Bulk upload (CSV or paste-from-spreadsheet) would speed up large studies.

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

The technical debt items from the TypeScript migration. See `docs/v1.1-followups.md` for the full list, which includes:

- User auth boilerplate cleanup
- `study_name` denormalization across 3 tables (move to study_id FK)
- Database CHECK constraints for application enums
- STRING → DATE/TIME column conversions
- Cascade emission type generation from YAML schemas
- Modal metadata audit
- Cascade access pattern consolidation
- Lint rules for pattern enforcement (stricter than current test-suite assertions)
- Template unit tests (26 of 27 templates untested at rendering level)

Plus newly filed during template restructure work:

- Cascade context block hardcoded against TEMPLATE_CONSUMES table (should generate dynamically from cascade variable registry)
- Cross-template audit step in template restructure workflow (catch dead extracts and redundant collections systematically)
- `derived_variables` in YAML is documentation-only — handlers must compute these explicitly
- Two desk research handlers (deskResearchHandler.ts and discoverHandler.ts) both live, both have consistent data assembly — consolidate to eliminate duplication risk

These items don't block product work or federal go-to-market. They make the codebase more robust over time. Worth picking up opportunistically when touching related code.

### Modal design standard findings (2026-07-09)

Filed from `backend/docs/qori-modal-design-standard.md` §6.10:

- **Structured discovery provenance:** Store discovery artifact IDs used at brief generation on the brief's DB record. Currently traceability exists only in rendered markdown (`research_brief.yaml:534-543`). Enables audit trail, regeneration with same context, and impact analysis when discovery is re-run.

- **Discovery naming-layer consolidation:** Three identifier layers per discovery type exist with a manual mapping table (`studyVariables.ts:18-29`): YAML template ID (`desk_research`), storage type (`desk-research`), loader ID (same as storage type). This is the substrate the PR #170 filter bug grew in. Consolidate to a single canonical identifier per discovery type.

### Modal design standard findings (2026-07-10)

- **Project name display split:** Admin Center shows pretty name (`projects.name`: "Testing Mobile Design"), all study surfaces show slug (`research_studies.name`: "testing-mobile-design"). This is the Phase 2D architectural choice — `briefHandler.ts:238` sets `studyName = projectSlug`. Decision needed: standardize on one form or document the split as intentional. No code change now.

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

- This backlog doesn't prioritize. Decisions about what to work on get made in the moment.
- Items move between sections as priorities shift. New findings get added.
- For any item that becomes "in progress," consider whether it warrants an ADR per the architecture decisions workflow.
