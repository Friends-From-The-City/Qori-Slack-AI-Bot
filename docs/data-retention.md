# Data Retention and Records Management

> **Status:** Documentation of current posture (H8 remediation)
> **Last updated:** 2026-06-04
> **Related work:** [#201: Records-management architecture (federal GOTS)](https://github.com/friends-innovation-lab/qori-slack/issues/201)

---

## 1. Current State

Qori currently retains data **indefinitely**. There is no TTL, scheduled archival, or automated disposition mechanism in place.

This is the honest baseline: data persists until manually deleted.

---

## 2. Records-Management Surface

Federal agencies evaluating Qori for GOTS (Government Off-The-Shelf) deployment will ask about the following areas. This section documents the full scope so reviewers see we understand the requirements.

| Area | Current Status |
|------|----------------|
| **Where prompts/data are stored** | Qori's PostgreSQL database (Railway-managed in current deployment). LLM interactions transit to Anthropic's API — their retention policy is **UNVERIFIED** and must be confirmed against official Anthropic terms before federal deployment. |
| **Retention period** | Not set. Deployment-determined per applicable records schedule (see Framework below). |
| **Export of records** | Built (H7). Participant-level export complete. Study/project-level export to agency repositories tracked as future scope. |
| **Deletion per schedule** | Disposition-ready at the database level — cascade deletes exist on all foreign keys. No scheduled trigger or retention-period enforcement built. |
| **Legal hold** | **NOT BUILT.** Flagged as future requirement. Federal records under litigation or FOIA must be preserved regardless of retention schedule. |
| **Audit trail** | **OPEN GAP (AU/H1).** Who generated what, when, is not comprehensively logged. Tracked as separate remediation item. |
| **Transient vs. official-record distinction** | **NOT BUILT.** Federal GOTS systems must distinguish between ephemeral working conversations and records that enter the official record. This is a real NARA/agency concept — not currently implemented. |

---

## 3. Framework: Retention Is Deployment-Scoped

Federal research-data retention is governed by legally binding, record-type-specific schedules:

1. **NARA-approved records control schedules** — The National Archives and Records Administration approves disposition authorities for federal records. See [archives.gov/records-mgmt/scheduling](https://www.archives.gov/records-mgmt/scheduling).

2. **Agency records control schedules** — Each agency (e.g., VA) maintains its own approved schedule. VA's Records Control Schedule specifies retention periods for research records, PII, administrative records, etc.

3. **IRB protocol and consent terms** — Individual studies have retention requirements specified in their approved IRB protocol and participant consent forms. These may be more restrictive than agency schedules.

**Qori does not set retention periods.** Retention periods are:
- **Record-type-specific** (research data vs. administrative records vs. consent forms)
- **Legally binding** (NARA/agency schedule violations are compliance failures)
- **Determined per deployment** by the agency's records officer in consultation with their records management office

The governing authorities are the applicable NARA and agency schedules — not this document.

---

## 4. Mechanism Status

| Mechanism | Status | Notes |
|-----------|--------|-------|
| **Cascade deletes** | Built | All foreign keys have `ON DELETE CASCADE`. Deleting a study removes all related records. |
| **DSAR export/delete** | Built (H7) | Participant-level export and deletion. See section 4.1 below. |
| **Export** | In progress | H7 workstream — enables export to agency repositories. |
| **Retention-period enforcement** | Not built | No TTL, no scheduled jobs, no retention-aware deletion. |
| **Audit trail** | Open gap | H1/AU remediation — comprehensive logging of who generated what when. |
| **Legal hold** | Not built | Must freeze records under litigation/FOIA regardless of schedule. |
| **Official-record designation** | Not built | Distinction between working drafts and records entering official record. |

### 4.1 DSAR (Data Subject Access Request) Support

**H7 Remediation** added participant-level data export and deletion:

- `exportParticipantData()` — Assembles all data for a participant across:
  - `study_participants` row (core record, demographics)
  - `study_notes` rows (session transcripts)
  - `session_observers` rows (observer records)
  - `study_variables` rows (nuggets with verbatim quotes)

- `deleteParticipantDSAR()` — Cascade-complete deletion removing all data from all stores above. Runs in a transaction for atomicity. Authorization-gated via `assertStudyAccess()`.

**Known Limitation (documented residual):**

GitHub artifacts (participant tracker YAML, rendered documents mentioning the participant) are **NOT** automatically deleted. This requires manual cleanup by the study owner.

Rationale: Building fragile GitHub-rewrite logic is higher risk than documenting the residual. The database is the system of record; GitHub artifacts are debugging/reference copies.

**Implementation note:** `study_variables.participant_id` is currently a STRING field, not an FK. Deletion uses manual `DELETE WHERE participant_id='PT-XXX'`. FK conversion is tracked in [#202](https://github.com/friends-innovation-lab/qori-slack/issues/202) for future data-integrity work.

---

## 5. Statement for Federal Reviewers

> Qori recognizes federal records-management requirements including NARA-approved schedules, agency records control schedules, legal hold obligations, export to agency repositories, and audit trail requirements.
>
> **Currently in place:** Disposition-ready database schema (cascade deletes on all foreign keys), participant-level DSAR export and deletion (H7).
>
> **In progress:** Audit trail (H1/AU).
>
> **Recognized but not built:** Configurable retention periods, legal hold, official-record designation.
>
> Full records-management configuration — retention periods, legal hold triggers, official-record designation — is deployment-scoped per the applicable agency schedule and is tracked as a dedicated workstream. See [GitHub issue #201: Records-management architecture (federal GOTS)](https://github.com/friends-innovation-lab/qori-slack/issues/201).

---

## Related Issue

GitHub issue tracking the full records-management architecture workstream:

**[#201: Records-management architecture (federal GOTS)](https://github.com/friends-innovation-lab/qori-slack/issues/201)**
