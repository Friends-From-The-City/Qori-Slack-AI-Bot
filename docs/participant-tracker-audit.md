# Participant Tracker Production Audit

**Date:** 2026-05-21
**Scope:** Production-quality assessment of participant_tracker.yaml + handler + processor

---

## 1. What the rendered tracker looks like

The tracker renders as a GitHub Markdown document at `{study}/primary-research/02-participants/{study_name}_participant_tracker.md`. Sections:

1. **Header** — "Participant Tracker: {study}" + recruitment summary table (total, confirmed, pending, completed counts) + last updated timestamp
2. **Participant Details** — Roster table: ID, name, recruitment source, date/time, status (emoji + label), notes
3. **Recruitment Progress** — Breakdown by method (e.g., "Internal VA Panel: 5 (50%)")
4. **Observer Management** — Session observer assignments with role distribution
5. **Demographics Overview** (collapsible) — 4 breakdown tables: race/ethnicity, age range, education, location
6. **Accessibility & Accommodations** — Participant accommodation notes
7. **Next Steps** — Auto-generated recommendations (follow-up reminders, recruitment targets)

The document is **regenerated on every participant add or status update** — not a one-time generation. Each mutation triggers `processParticipantYamlTemplate()` which fetches all participants from Postgres and re-renders the complete tracker to GitHub.

---

## 2. Handler contract assessment

### What the processor computes

`participantYamlProcessor.ts` computes ALL template variables server-side from the `allParticipants` array. No variable is left to the template — this is the opposite of the "undefined variable" problem flagged in the initial scan.

| Computed variable | Source | Method |
|---|---|---|
| `total_participants_count` | `allParticipants.length` | Direct count |
| `confirmed_sessions_count` | Filter by `CONFIRMED` status | Status filter |
| `pending_responses_count` | Filter by `CONTACTED` status | Status filter |
| `completed_sessions_count` | Filter by `COMPLETED` status | Status filter |
| `participants` | Map with id, name, source, date, time, status, notes | Array map |
| `recruitment_breakdown` | Group by `recruitment_source`, compute % | `calculateRecruitmentBreakdown()` |
| `race_ethnicity_breakdown` | Parse `demographics_info.race_ethnicity` | `generateDemographicBreakdowns()` |
| `age_range_breakdown` | Parse `demographics_info.age_range` | `generateDemographicBreakdowns()` |
| `education_breakdown` | Parse `demographics_info.education_level` | `generateDemographicBreakdowns()` |
| `location_breakdown` | Parse `demographics_info.location_type` | `generateDemographicBreakdowns()` |
| `immediate_actions` | Logic: pending follow-ups, reschedules, recruiting gaps | `generateImmediateActions()` |
| `followup_needed` | Per-participant action items | `generateFollowupNeeded()` |
| `session_observers` | `SessionObserverService.getObserverRequestsByStudy()` | Service call |
| `accommodations` | Filter participants with `notes_field` containing accommodation keywords | Heuristic |
| `demographics_summary` | "Demographics collected for X of Y participants" | Computed string |
| `recruitment_analysis` | Conversion rate: confirmed / total | `generateRecruitmentAnalysis()` |
| `next_steps_recommendations` | Recruiting targets, follow-up reminders | `generateNextStepsRecommendations()` |

**Verdict:** The handler-template contract is complete. The processor computes every variable the template references. The initial scan flagged "undefined variables" incorrectly — the YAML `input_variables` section lists modal form inputs, not template variables. The processor bridges the gap.

---

## 3. Common failure modes

### 0 participants

**What happens:** Processor checks `allParticipants.length > 0` at line 536. If empty, falls through to file-based mode which attempts to parse an existing GitHub file. If no file exists, creates a new file with the single participant being added.

**Risk:** Low. The tracker is only triggered by adding or updating a participant, so there's always at least 1. A study with 0 participants simply has no tracker file yet.

### No observers assigned

**What happens:** Processor calls `SessionObserverService.getObserverRequestsByStudy(study_id)` wrapped in try/catch. If it fails or returns empty, `session_observers` is set to an empty array. The Observer Management section renders with an empty table.

**Risk:** Low. Empty observer table is correct — observers are optional.

### Sparse demographic data

**What happens:** `generateDemographicBreakdowns()` handles nulls — if `demographics_info` is null or fields are missing, participants are counted under "Not specified" / "Unknown" / "Not disclosed" categories. `generateDemographicsSummary()` reports "Demographics collected for X of Y" showing the gap.

**Risk:** Low. Graceful degradation — shows what's available, flags what's missing.

### Status enum mismatch

**This is a real issue.** See Section 5 below.

---

## 4. Workflow integration

### When it's generated/updated

The tracker is **event-driven**, not scheduled or on-demand:

| Trigger | Action | Regenerates tracker? |
|---------|--------|:---:|
| `/qori` → Fieldwork → Add Participant → submit | Creates participant in DB | Yes |
| `/qori` → Fieldwork → Update Status → submit | Updates participant status | Yes (optionally) |
| `participantOutreachHandler` sends outreach | Records outreach, advances status | No |

The tracker file on GitHub is regenerated from scratch on each participant add. Status updates optionally regenerate it (the handler has the call but it may fail silently without blocking the status update).

### Who reads it

Researchers and study leads. The tracker lives in the study's `02-participants/` folder on GitHub alongside other study documentation. It's a living document that reflects current recruitment state.

### Is the trigger pattern right?

**Mostly.** Regenerating on every add is correct. The status update regeneration is optional/fragile — if it fails, the GitHub tracker goes stale until the next participant add. A more robust pattern would regenerate on every mutation, with retry.

---

## 5. Known issues — verified

### Issue 1: Slack user ID instead of human-readable name

**Verified.** `added_by` is set from `body.user.name || body.user.id` (participantHandler.ts:340). The `body.user.name` field in Slack Bolt is the Slack username (e.g., "lapedra"), not the display name. If `body.user.name` is falsy, it falls back to the raw user ID (e.g., "U07XXXXXXXX").

**Location:** participantHandler.ts line 340, rendered in template at line 147: `**Last Updated:** {{current_date}} by {{added_by}}`

**Fix:** Use `body.user.real_name` or resolve via `client.users.info({ user: body.user.id })` for display name.

### Issue 2: Status labels don't match canonical enum

**Verified.** The YAML template defines 8 status labels:

| YAML template (status_mappings) | Canonical enum (participantStatus.ts) |
|---|---|
| `recruited` | `not_contacted` / `contacted` |
| `confirmed` | `confirmed` |
| `completed` | `completed` |
| `pending` | -- (no canonical match) |
| `rescheduling` | `needs_reschedule` |
| `backup` | -- (no canonical match) |
| `canceled` | `canceled` |
| `disqualified` | -- (no canonical match) |

Missing from YAML: `not_contacted`, `contacted`, `scheduled`, `declined`, `no_response`
Extra in YAML: `recruited`, `pending`, `backup`, `disqualified`

**Impact:** The `status_mappings` in the YAML are **documentation-only** — never read by the processor. The processor passes raw `status_select` values from the database (canonical enum) directly to the template. The Handlebars template renders `{{status_select}}` as-is, so the rendered tracker shows canonical values like `confirmed`, `needs_reschedule`, `no_response` — not the display-friendly emoji labels defined in `status_mappings`.

**Fix:** Either (a) map canonical enum to display labels in the processor before template injection, or (b) remove the dead `status_mappings` from the YAML.

---

## 6. Additional findings

### Observer management metadata is aspirational

Lines 314-411 of the YAML describe sophisticated observer management rules (capacity limits, role limits, auto-approve logic, workflow triggers). None of this is read by the processor — the processor simply fetches observer records from the database and passes them through. The metadata describes intended behavior that lives in handler code, not in the YAML.

**Recommendation:** Remove or move to handler documentation. Dead config in the YAML creates false expectations.

### Notification config is dead

Lines 271-308 describe Slack notifications (researcher tags, team messages, observer DMs). The processor doesn't read these — notifications are handled by handler code.

**Recommendation:** Remove. Same as observer management metadata.

### File-based fallback (legacy mode)

The processor has a legacy code path (Mode 2 in the audit) that parses existing GitHub files via regex to extract participant rows when `allParticipants` is not provided. This path exists for backward compatibility but is fragile — regex parsing of markdown tables is error-prone.

**Recommendation:** Low priority. The database-driven path (Mode 1) is always used when triggered from the handler. The fallback only activates if someone calls the processor without providing the participant array.

---

## 7. Recommendations for production quality

### Blocking (should fix before broader use)

| # | Issue | Effort | Description |
|:-:|-------|:------:|-------------|
| 1 | Status display labels | S | Map canonical enum to display-friendly labels (with emoji) in processor before template injection. Use `PARTICIPANT_STATUS_LABELS` from participantStatus.ts. |
| 2 | `added_by` shows username not display name | S | Resolve Slack user ID to display name via `client.users.info()` or use `body.user.real_name`. |

### Nice-to-have (improves quality but not blocking)

| # | Issue | Effort | Description |
|:-:|-------|:------:|-------------|
| 3 | Remove dead YAML sections | S | Delete `status_mappings`, `observer_management`, `workflow_integration`, `capacity_management`, `notify` — all documentation-only, never read. |
| 4 | Status update should always regenerate tracker | S | Make GitHub tracker regeneration non-optional on status update. Currently optional/silently-failing. |
| 5 | TypeScript data contract | M | Add interface for `ParticipantTrackerTemplateData` that the processor produces and the template consumes. Currently implicit. |

### File for later

| # | Issue | Effort | Description |
|:-:|-------|:------:|-------------|
| 6 | Remove legacy file-based fallback | S | Dead code path. Only used if processor called without `allParticipants`. |
| 7 | Consider AI-assisted recruitment analysis | L | The `next_steps_recommendations` and `recruitment_analysis` functions use simple heuristics. An AI task could provide richer analysis. Not necessary now. |
