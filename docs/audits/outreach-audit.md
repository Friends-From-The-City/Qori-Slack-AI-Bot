# Outreach Audit

**Date:** 2026-05-21
**Purpose:** Pre-design state-of-the-world audit before project restructure
**Scope:** Full surface, PII inventory, compensation flow, cascade integration

---

## 1. Full Outreach Surface

### 1.1 Handler Entry Points

**File:** `backend/src/helpers/slack/commands/participantOutreachHandler.ts`

**Primary Handler:** `participantOutreachHandler`
- Invocation: `/qori-outreach` slash command (now accessed via `/qori-fieldwork`)
- Opens initial participant outreach modal; loads available studies

**Submission Handlers (8 total):**

| Handler | Purpose |
|---------|---------|
| `handleParticipantOutreachSubmit` | Routes to correct message-type modal |
| `handleInitialRecruitmentSubmit` | Generates recruitment message |
| `handleReschedulingRequestSubmit` | Generates rescheduling request |
| `handleSessionConfirmationSubmit` | Generates session confirmation |
| `handleThankYouSubmit` | Generates thank-you message with compensation |
| `handleFollowUpSubmit` | Generates gentle follow-up |
| `handleSessionReminderSubmit` | Generates 24-48hr reminder |
| `handleAddParticipantSubmit` | Creates participant record + writes tracker |

**Additional Handler:** `participantHandler.ts`
- `participantHandler` — Opens add-participant modal
- `updateParticipantHandler` — Opens update participant status modal

### 1.2 Slack UI Modals

**Directory:** `backend/src/helpers/slack/ui/outreach/`

| Modal | File | Purpose |
|-------|------|---------|
| Participant Outreach | `participantOutreachModal.ts` | Step 1: Select message type |
| Initial Recruitment | `initialRecruitmentModal.ts` | Step 2a: Participant + signup instructions |
| Session Confirmation | `sessionConfirmationModal.ts` | Step 2b: Participant + date/time + meeting link |
| Session Reminder | `sessionReminderModal.ts` | Step 2c: Participant + date/time + meeting link |
| Rescheduling Request | `reschedulingRequestModal.ts` | Step 2d: Participant + original/new times |
| Follow-up | `followupModal.ts` | Step 2e: Participant selection |
| Thank You | `thankyouModal.ts` | Step 2f: Participant selection |
| Email Preview | `emailModal.ts` | Step 3: Display generated message |
| Add Participant | `addParticipantModal.ts` | Create new participant |
| Update Participant | `updateParticipantStatusModal.ts` | Modify status/notes |

### 1.3 YAML Template

**File:** `config/prompts/participant_outreach.yaml` (v4.1)

**Structure:**
- `ai_generation_tasks`: Conditional prompts by message_type (Jinja2)
- `output_template`: Markdown with generated subject/body
- `output_options`: Path `02-participants/outreach/`, filename `{{participant_id}}_{{message_type}}_{{current_date}}.md`

**Message Types:**
- `initial_recruitment`
- `session_confirmation`
- `session_reminder`
- `rescheduling_request`
- `follow_up`
- `thank_you`

### 1.4 Services & Database

**Model:** `StudyParticipant` (`study_participants` table)

**Service:** `study_participant.service.ts`

| Method | Purpose |
|--------|---------|
| `createParticipant(data, fileData)` | Creates DB row + GitHub tracker |
| `getParticipantsByStudy(studyId)` | Dropdown options |
| `getParticipantById(participantId)` | Single participant |
| `updateParticipant(participantId, data)` | Status/notes changes |
| `deleteParticipant(participantId)` | Soft-delete + count update |
| `getParticipantStats(studyId)` | Aggregate counts by status |
| `getRecruitmentBreakdown(studyId)` | Groups by recruitment_source |
| `checkStudyMilestone(studyId, count)` | Triggers milestone at N participants |

---

## 2. PII Inventory

### 2.1 Database Schema (`study_participants` table)

| Column | Type | PII Level | Notes |
|--------|------|-----------|-------|
| id | INTEGER | None | Auto-increment PK |
| study_id | INTEGER FK | None | Foreign key |
| **participant_name** | STRING | **SEMI** | UI hints "Use alias (PT001)" but not enforced |
| **contact_details** | TEXT | **YES** | Currently unused in modals; capacity exists |
| recruitment_source | STRING | None | e.g., "internal_panel", "email_outreach" |
| scheduled_date | STRING | None | ISO date |
| scheduled_time | STRING | None | HH:MM |
| status_select | STRING | None | Enum from PARTICIPANT_STATUS |
| **notes_field** | TEXT | **SEMI** | Could contain accessibility/health info |
| demographics_info | JSON | **INDIRECT** | Race, age, education, location (rare combos re-identify) |
| compensation_amount | DECIMAL | None | Dollar amount |
| outreach_sent_at | DATE | None | Timestamp |
| outreach_method | STRING | None | email/slack/phone/other |
| outreach_count | INTEGER | None | Increment counter |
| added_by | STRING | None | Slack user ID |

### 2.2 PII in GitHub Files

**Outreach messages:** `{study_path}/02-participants/outreach/{participant_id}_*.md`
- Contains: participant_id (alias), researcher info
- Does NOT contain: full name, email, phone
- Privacy by design: participant_id used instead of name

**Participant tracker:** `{study_path}/primary-research/02-participants/{study}_participant_tracker.md`
- Contains: All participant fields as Markdown table
- **Risk:** Demographics visible in GitHub; repo must be private

### 2.3 PII Risk Summary

| Risk | Severity | Current State |
|------|----------|---------------|
| Full name in participant_name | Medium | UI hints alias, not enforced |
| contact_details field exists | Low | Unused in current modals |
| notes_field free text | Medium | No PII validation |
| Demographics re-identification | Medium | Rare combinations identifiable |
| GitHub repo exposure | High | Mitigated if repo is private |

---

## 3. Compensation Flow

### 3.1 Calculation

**File:** `backend/src/utils/compensationCalculator.ts`

```typescript
function calculatePerPersonCompensation(
  study: { parsed_budget_amount: number | null, target_participants: number | null }
): number | null {
  if (!budget || !target || target <= 0) return null;
  return Math.round((budget / target) * 100) / 100;
}
```

**Example:** $1000 budget / 8 participants = $125.00 per person

### 3.2 Data Storage

**Study level:**
- `ResearchStudy.parsed_budget_amount` — DECIMAL(10,2)
- `ResearchStudy.target_participants` — INTEGER

**Participant level:**
- `StudyParticipant.compensation_amount` — DECIMAL(10,2) (snapshot at creation)

### 3.3 Flow in Handlers

**Add participant (`handleAddParticipantSubmit`):**
```typescript
const compensation = calculatePerPersonCompensation(study);
const participantData = {
  // ...
  compensation_amount: compensation,  // Snapshot stored
};
```

**Outreach handlers:**
```typescript
const compAmt = calculatePerPersonCompensation(study);
const incentive_amount = compAmt ? `$${compAmt}` : '';
// Injected into YAML template
```

### 3.4 Template Integration

**participant_outreach.yaml:**
- `auto_fill_variables`: `incentive_amount` from study settings
- Used in: `initial_recruitment`, `thank_you` templates

**research_plan.yaml:**
- `{{#if per_participant_compensation}}` conditional display

### 3.5 Compensation Gaps

| Gap | Impact |
|-----|--------|
| No per-participant override | All participants get same amount |
| Snapshot at creation | Budget changes don't update existing participants |
| No compensation tracking | No record of payment status |
| Manual payment process | Qori generates message, user sends payment externally |

---

## 4. Cascade Integration

### 4.1 Cascade Variables Produced

**From participant creation:**

| Variable | Type | Downstream Consumers |
|----------|------|---------------------|
| `participant_id` | String (PT-001 format) | session_summary, readouts |
| `demographics_info` | JSON object | persona_generator, affinity_mapping |

**Demographics structure:**
```json
{
  "race_ethnicity": "asian",
  "age_range": "35-44",
  "education_level": "bachelor",
  "location_type": "urban"
}
```

### 4.2 Schema Reference

**File:** `backend/config/schemas/participant_metadata.yaml`

```yaml
participant_id: "PT-###"
background: "Military service, disability status"
tech_setup: "Device, OS, connectivity"
accessibility: "Assistive technology needs"
recruitment_source: "Perigean, intercept, snowball"
consent_recording: boolean
app_usage: "Frequency, primary tasks"
session_notes: "Observer notes"
key_contribution: "One-sentence insight summary"
```

### 4.3 Cascade Behavior

**Outreach handler does NOT consume cascade variables** — it is an upstream producer.

**Downstream templates may reference:**
- `{{participants}}` counts
- `{{participant_id}}` lists
- `{{demographics_info}}` for persona generation

**Pattern:** Outreach → participant_tracker → downstream templates

---

## 5. Participant Status Lifecycle

### 5.1 Status Enum

**File:** `backend/src/constants/participantStatus.ts`

```
not_contacted → (outreach) → contacted → scheduled → confirmed → completed
                                         ↓
                                  needs_reschedule → confirmed
                                                      ↓
                                              declined / no_response / canceled
```

### 5.2 Auto-Transition Rules

- `recordOutreachSent()` auto-transitions NOT_CONTACTED → CONTACTED on first outreach
- Does NOT change status if already beyond not_contacted

### 5.3 Outreach Tracking Fields

| Field | Purpose |
|-------|---------|
| `outreach_sent_at` | Timestamp of last outreach |
| `outreach_method` | Most recent method (email/slack/phone/other) |
| `outreach_count` | Total number of outreach events |

---

## 6. Test Coverage

**Integration tests exist:**
- `compensation-flow.test.ts` — DECIMAL coercion, null safety, division
- `outreach-flow.test.ts` — `recordOutreachSent()`, status transitions, count increment

**Unit test coverage:** None for modal builders or handler logic

---

## 7. Files Referenced

**Handlers:**
- `participantOutreachHandler.ts`
- `participantHandler.ts`

**Modals:**
- `ui/outreach/*.ts` (8 files)
- `ui/addParticipantModal.ts`
- `ui/updateParticipantStatusModal.ts`

**Model & Service:**
- `database/models/study_participant.ts`
- `services/study_participant.service.ts`

**Templates:**
- `config/prompts/participant_outreach.yaml`
- `config/prompts/participant_tracker.yaml`
- `backend/config/schemas/participant_metadata.yaml`

**Utilities:**
- `utils/compensationCalculator.ts`
- `constants/participantStatus.ts`

---

## 8. Summary Table

| Component | Location | State |
|-----------|----------|-------|
| Slash Command | `/qori-outreach` (via fieldwork) | Active |
| Modals | `ui/outreach/*.ts` | 10 files |
| YAML Template | `participant_outreach.yaml` | v4.1 |
| Database Model | `study_participants` | 16 columns |
| PII Fields | 3-4 semi-sensitive | UI hints, not enforced |
| Compensation | Calculator + snapshot | Per-study, not per-participant |
| Cascade Variables | `participant_id`, `demographics_info` | Produced, not consumed |
| Test Coverage | Integration only | 2 test files |
