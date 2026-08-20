# Stakeholder Input Contract

**Status:** PARTIALLY IMPLEMENTED

## What Exists

### Stakeholder Designation

Stakeholders are designated during project creation (`/qori-start`) or via admin center (`/qori-admin`).

- **Project creation:** Optional `project_stakeholder` field (users_select) — selects the person who approves briefs
- **Admin center:** "Manage Stakeholder" action — allows changing the stakeholder after project creation
- **Authority:** `project_members.is_stakeholder` flag (Boolean). Stakeholder is NOT a role — it's a flag on a member record. A project owner can also be the stakeholder.

### Stakeholder Approval

The stakeholder (or owner as fallback) reviews and approves research briefs:

1. Brief submitted → DM sent to stakeholder with Approve / Request Changes buttons
2. `getProjectApprover(projectId)` lookup order: member with `is_stakeholder=true`, then owner fallback
3. Approval sets `brief_status=approved`
4. Request changes sets `brief_status=request_changes` with a reason

### Stakeholder Synthesis (Discovery)

Stakeholder interviews can be synthesized via `/qori-discover` → "Stakeholder Synthesis":
- Researcher uploads stakeholder interview notes/transcripts
- YAML template (`stakeholder_synthesis.yaml`) generates synthesis artifact
- Variables emitted to discovery scope for downstream brief consumption

## What Does NOT Exist

- **No dedicated stakeholder interview form** — stakeholder input is captured via file upload in discovery
- **No stakeholder feedback collection** — stakeholders don't have their own input surface in Qori
- **No stakeholder dashboard** — stakeholders only interact via approval DMs
- **No structured stakeholder data model** — stakeholders are member records with a flag, not a separate entity

## Workspace Design Notes

- Stakeholder designation → part of project settings, not a separate workflow
- Stakeholder approval → approval banner on brief detail page + notification (not DM)
- Stakeholder synthesis → part of discovery workflows
- Consider: should stakeholders have read-only Workspace access? Currently they only interact via Slack DMs
