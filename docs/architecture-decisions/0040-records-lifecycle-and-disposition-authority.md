# ADR 0040: Records Lifecycle and Disposition Authority

**Status:** Accepted
**Date:** 2026-08-19
**Context:** GOV-6 Records Lifecycle / Archival / Retention / Legal Hold / Disposition

## Context

Qori stores canonical research records — projects, studies, evidence graphs, artifacts — that may be subject to federal records management requirements. Prior to GOV-6:

- `project.status = 'archived'` was cosmetic (no enforcement beyond hiding from active lists)
- No records schedule assignment model existed
- No preservation/legal hold mechanism existed
- No disposition gate prevented premature or unauthorized record destruction
- DSAR deletion could proceed without checking records-retention obligations
- "Archive" and "delete" were conflated in the UX mental model

Federal records management requires that records be retained according to approved schedules, that legal holds override disposition, and that permanent records are never destroyed (only transferred for permanent preservation).

## Decision

### Core Principle

**Qori enforces assigned records authority but does not invent records schedules.**

The system can store and enforce a NARA GRS citation, an agency-specific schedule citation, or another authority reference. But it never guesses which federal retention period applies to a given record, never preloads speculative VA schedules, and never auto-assigns schedules.

### Design Choices

1. **Archive ≠ delete.** Archived records remain canonical, governed, searchable/retrievable, and subject to access controls. Archival transitions lifecycle status but deletes nothing.

2. **Disposition is fail-closed.** A record cannot be destroyed unless ALL conditions are met: schedule assigned, authority active, temporary record or explicit permission, retention expired, no holds, not already disposed, actor authorized. The gate returns specific ineligibility reasons.

3. **Holds are computed, not copied.** Project-level holds block all child records by computation at query time, not by writing hold status to every child row. This avoids update storms and ensures consistency.

4. **DSAR/privacy and records-retention conflicts are human-resolved.** When both obligations appear to apply, the system returns `GOVERNANCE_REVIEW_REQUIRED` — it does not invent legal precedence.

5. **Disposition suppresses content via record-type adapters.** A completed destroy must actually remove the governed payload — not just tombstone the assignment. Each supported record type has an explicit adapter that NULLs destroyable content while preserving structural/audit metadata (public_id, type, schedule authority, timestamps, actor, lineage). Unsupported types return `manual_review_required` rather than falsely claiming completion.

   Supported adapters:
   - `evidence_construct`: suppresses `label` + `payload`; FK children reference IDs only
   - `research_artifact`: suppresses `title` + `path` + `url`; FK children reference IDs only

   Unsupported (→ manual review):
   - `project`: name/slug are routing keys; content suppression orphans child studies
   - `study`: name used in display paths; content suppression orphans participants/evidence
   - `evidence_source`: NOT NULL FK children in survey tables would break

6. **Permanent records follow a transfer path.** They are never eligible for `destroy` disposition. Transfer preparation creates a `manual_review_required` event and stops.

### Schema

Five new tables:

- `records_schedules` — provider-neutral records schedule definitions
- `records_management_assignments` — lifecycle assignment per canonical record (polymorphic via `record_type` + `record_public_id`)
- `records_holds` — preservation/legal holds scoped to a project
- `records_hold_targets` — specific record targets under a hold
- `records_disposition_events` — append-only disposition audit trail

All tables use CHECK constraints (per GOV-3 standards) for domain value enforcement. The `records_disposition_events` FK to assignments uses `ON DELETE RESTRICT` to ensure disposition history is never lost.

### Authorization Model

Archival/retrieval: any authorized project member. Destructive disposition, hold creation/release: owner/admin only. A records-officer role is deferred.

## Consequences

### Benefits

- Records management obligations can be enforced at the database level
- Legal/preservation holds block disposition across the entire project or specific records
- Disposition is auditable and append-only
- DSAR flow gains a governance checkpoint before deleting records under retention
- Archival is hardened beyond cosmetic status

### Constraints

- Content suppression NULLs payload columns but does not delete canonical rows (structural metadata survives for lineage/audit)
- Three record types (project, study, evidence_source) lack safe automated adapters — disposition returns `manual_review_required`
- No NARA transfer API integration
- No records-officer RBAC role (uses owner/admin)
- Schedules must be manually created — no preloaded federal schedules

### Future Work

- Disposition adapters for project/study/evidence_source (requires cascade analysis)
- Records-officer role with specialized permissions
- NARA transfer packaging and export
- GitHub/Slack external artifact reconciliation on disposition
- UI/modal for records management operations (currently service-layer only)

## References

- Operations guide: `docs/operations/records-lifecycle.md`
- NARA General Records Schedules: https://www.archives.gov/records-mgmt/grs
- GOV-3 integrity standards: ADR 0033 (domain value CHECK constraints)
- GOV-5 backup interaction: ADR 0039 (disaster recovery posture)
- DSAR/privacy: ADR 0025 (disposition audit logging)
