# Stakeholder Input Contract

**Status:** PARTIALLY IMPLEMENTED

## CURRENT: Stakeholder Designation

Stakeholders are identified by a Boolean flag on the `project_members` table, not by a role.

**Data model:** `project_members.is_stakeholder` (Boolean flag). A stakeholder is NOT a role -- it is a flag on a member record. A project owner can also be the stakeholder (same person, both flags set).

**Source:** `backend/src/database/models/project_member.ts`, migration `20260607000001-add-is-stakeholder.js`

### Setting the stakeholder

Two surfaces exist for designating a stakeholder:

1. **Project creation (`/qori-start`):**
   - Field: `project_stakeholder` block, `stakeholder_select` action
   - Type: `users_select` (optional)
   - Modal: `backend/src/helpers/slack/ui/projectCreationModal.ts` (line 116)
   - Handler: `backend/src/helpers/slack/commands/projectStartHandler.ts` (line 119)

2. **Admin center (`/qori-admin` -> "Manage Stakeholder"):**
   - Opens a pushed modal (`callback_id: 'admin-stakeholder-submit'`)
   - If stakeholder exists: shows current stakeholder display + clear checkbox + new stakeholder selector
   - If no stakeholder: shows new stakeholder selector only
   - Type: `users_select` for new selection, `checkboxes` for clear
   - Cannot both select new and clear (validation error)
   - Only project owners can manage stakeholders (`assertProjectOwner` check)
   - Changes are audit-logged via `logDispositionAction` with `record_type: 'project_stakeholder'`
   - New stakeholder receives DM notification of assignment
   - Handler: `backend/src/helpers/slack/commands/admin/adminActionsHandler.ts` (lines 1095-1390)

## CURRENT: Stakeholder Approval (Brief Only)

The stakeholder (or owner as fallback) reviews and approves research briefs. This is the only approval flow in the system (plan approval was explicitly removed).

**Approver resolution:** `getProjectApprover(projectId)` in `backend/src/services/authorization.service.ts` (line 654):

1. First: finds member with `is_stakeholder=true` for the project
2. Fallback: finds member with `role='owner'`
3. Returns `null` if neither found (should never happen per ADR 0025)

**Return shape:** `ApproverInfo` with fields:
- `userId`: Slack user ID of the approver
- `role`: `'stakeholder'` or `'owner'`
- `source`: `'stakeholder'` or `'owner_fallback'` (tracks which lookup path succeeded)

**Callers** (all verified in runtime code):
- `briefHandler.ts:205` -- sends approval DM after brief generation
- `researchBriefEntryModal.ts:213` -- shows approver info in modal
- `resubmitBriefHandler.ts:119` -- sends re-approval DM after brief resubmission
- `requestChangesHandler.ts:36` -- resolves approver during change request flow
- `studyResultBlocks.ts:210` -- displays approver in study result blocks

**Approval flow:**
1. Brief submitted -> DM sent to approver with Approve / Request Changes buttons
2. Approve -> sets `brief_status='approved'` on the study record
3. Request Changes -> sets `brief_status='changes_requested'` with feedback reason
4. Researcher can resubmit -> sets `brief_status='pending_approval'`, re-sends DM

**Source:** `backend/src/application/approval.app-service.ts` (lines 111-135)

## CURRENT: Stakeholder Synthesis (Discovery Type)

Stakeholder interviews can be synthesized via `/qori-discover` -> stakeholder_synthesis type:

- Researcher uploads stakeholder interview notes/transcripts
- YAML template: `config/prompts/stakeholder_synthesis.yaml`
- Template declares `discovery_scope: true`

**Emitted variables** (6 total, verified from YAML lines 76-143):

| Variable Key | Description |
|-------------|-------------|
| `stakeholder_constraints` | Technical, policy, resource, organizational limitations |
| `stakeholder_priorities` | Strategic priorities with user-need alignment |
| `alignment_gaps` | Stated priority vs. actual behavior mismatches |
| `stakeholder_questions_for_users` | Prioritized research questions from stakeholder insights |
| `backstage_observations` | Raw system/process observations for service blueprint |
| `system_failure_modes` | System dynamics with failure points (from alignment conflicts) |

These variables are stored in the discovery variable scope and feed into briefs via discovery checkbox selection in the brief modal.

## NOT IMPLEMENTED

- **No dedicated stakeholder interview capture form** -- stakeholder input is captured via file upload in the discovery flow, not a structured interview form
- **No stakeholder feedback collection surface** -- stakeholders only interact via approval DMs; there is no surface for them to provide general feedback or input outside the approval flow
- **No stakeholder dashboard** -- stakeholders receive DMs for approvals but have no overview of project status, study progress, or accumulated findings
- **No structured stakeholder data model beyond the flag** -- stakeholders are member records with a Boolean flag (`is_stakeholder`), not a separate entity with stakeholder-specific attributes (e.g., department, interests, influence level)
- **No multi-stakeholder support** -- `getProjectApprover` returns a single stakeholder (first match). There is no provision for multiple stakeholders per project or for routing different approvals to different stakeholders.

## INTENDED (architectural direction)

- Stakeholder designation -> part of project settings in Workspace, not a separate workflow
- Stakeholder approval -> approval banner on brief detail page + notification (not DM)
- Consider whether stakeholders should have read-only Workspace access
