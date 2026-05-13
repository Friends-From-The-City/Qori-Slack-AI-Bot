# ADR 0003: Outreach tracking on StudyParticipant

**Status:** Accepted
**Date:** 2026-05-13
**Decision drivers:** Architecture audit found that outreach was "fire-and-forget" — a markdown file got generated and saved to GitHub, but no database record existed that outreach happened. The dashboard's "outreach count" was an invented statistic derived from participant status fields. Researchers could send outreach to people who didn't exist as participants. No way to track follow-ups or repeat outreach to the same person.

## Context

The original Qori implementation had outreach as an *action* (compose a message, save it to GitHub) rather than as a *tracked event*. This meant the system could not answer basic questions: "How many people have we reached out to?" "When was the last contact?" "How many follow-ups has this person received?" The dashboard fabricated answers by inspecting participant statuses, but those answers didn't reflect actual outreach activity.

The most architecturally significant aspect: outreach and participants were treated as parallel concepts in the UX but had no relationship in the data. A "contact" and a "participant" were the same thing implicitly, but the system had no notion of the contact's lifecycle through "reached out → replied → scheduled → confirmed."

## Decision

Outreach is now a tracked event recorded on the existing `StudyParticipant` row. Three new columns:

- `outreach_sent_at` (DATE, nullable) — timestamp of most recent outreach
- `outreach_method` (STRING) — `email`, `slack`, `phone`, or `other`
- `outreach_count` (INTEGER, default 0) — number of attempts

A `recordOutreachSent(method)` method on the model is the single place these get updated. Every outreach handler calls it after the markdown is successfully written to GitHub.

The free-text "outreach to anyone" path is removed. Outreach now requires selecting a participant from a dropdown — the participant row must exist first. The Add Participant modal creates a row with status `not_contacted`, and sending outreach auto-advances that to `contacted`.

The table name stays `StudyParticipant` rather than being renamed to `Contact`. The same table conceptually serves as the contact model.

## Alternatives considered

**Separate `outreach_events` table.** A row per outreach attempt, foreign-keyed to StudyParticipant. More normalized; allows full outreach history per participant. Rejected for alpha because the current need ("did we reach out, when, how often") is satisfied by counters and timestamps. Filed as v1.1 candidate if richer outreach history becomes useful.

**Rename `StudyParticipant` to `Contact`.** Conceptually cleaner — the row represents a person across the contact lifecycle, not just a confirmed participant. Rejected because the rename ripples through the codebase (model name, table name, foreign keys in 5+ tables, every reference in handlers and templates) and the conceptual win didn't justify the disruption.

**Keep outreach fire-and-forget, accept the dashboard is fake.** What the project had been doing. Rejected because "the dashboard's numbers don't mean anything" is incompatible with a system being evaluated for government use.

**On-the-fly participant creation when outreach targets a non-existent name.** Lets researchers fire outreach without first adding the participant. Rejected because it papered over the missing contract — the system should know who its contacts are before contacting them.

## Consequences

**Intended:** Dashboard outreach counts now measure reality. Researchers can see exactly who has been contacted, when, how many times. Repeat outreach increments a counter rather than silently re-running. The contact lifecycle (`not_contacted → contacted → scheduled → confirmed → completed`) is explicit in the data, not just implicit in researcher behavior.

**Accepted downsides:** Researchers must add a participant before reaching out. Marginally more friction than the old free-text path, but explicit tracking is the trade. If bulk outreach to a new candidate list becomes a common need, a bulk-add affordance can be built (separate workstream).

**Migration impact:** Existing participant rows backfilled — rows in active statuses (contacted, scheduled, confirmed, etc.) got `outreach_sent_at = updated_at` and `outreach_count = 1` as a reasonable approximation. Rows in `not_contacted` or `canceled` stayed null. No data loss.

## References

- `backend/src/database/models/study_participant.js`
- Migration: `20260514000000-add-outreach-tracking.js`
- Instruction document: `cc-instruction-2-outreach-tracking.md`
