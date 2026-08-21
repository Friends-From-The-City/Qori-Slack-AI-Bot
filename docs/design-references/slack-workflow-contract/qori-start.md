# /qori-start — Project Creation Contract

**Status:** CURRENT (implemented)
**Handler:** `backend/src/helpers/slack/commands/projectStartHandler.ts`
**Modal:** `backend/src/helpers/slack/ui/projectCreationModal.ts`
**Callback ID:** `project_create_modal`

## Purpose

Creates a new research project — the top-level container for studies, discovery, artifacts, and team membership. This is the first action a researcher takes. **CURRENT: single-study-per-project architecture (Phase 2D).** Study creation happens in `/qori-brief`, not here.

## Invocation

```
/qori-start
```

Typed in any Slack channel. Opens a modal.

## What Qori Already Knows

**CURRENT — resolved at runtime:**

| Field | Source | Used For |
|-------|--------|----------|
| Actor (Slack user ID) | `body.user.id` from Bolt context | Creator / initial owner (`addProjectMember`) |
| Channel ID | `command.channel_id` | Stored in `private_metadata` for post-submission messaging |

**NOT IMPLEMENTED:**

| Field | Notes |
|-------|-------|
| Organization | Referenced in prior docs but no org-scoped project logic exists in `projectStartHandler.ts` |

## Researcher Input (Modal Fields)

**Source: `projectCreationModal.ts` — verified against runtime code.**

| UI Label | block_id | action_id | Type | Required | Default | Validation | Max Length | Placeholder |
|----------|----------|-----------|------|----------|---------|------------|-----------|-------------|
| Project name | `project_name` | `value` | plain_text_input | Yes | — | Non-empty; slug uniqueness checked on submit (duplicate -> modal error) | 80 | "e.g., Mobile Scheduling Experience" |
| Description | `project_description` | `value` | plain_text_input (multiline) | No (`optional: true`) | — | — | 500 | "Research supporting the mobile scheduling redesign initiative..." |
| What problem are you trying to solve? | `project_problem_statement` | `value` | plain_text_input (multiline) | Yes | — | Non-empty (handler validates separately); hint: "The question this research needs to answer. Gaps and research questions are derived against this." | 2000 | "Veterans struggle to find their claim status online, leading to high call center volume..." |
| Who approves research briefs for this team? | `project_stakeholder` | `stakeholder_select` | users_select | No (`optional: true`) | — (owner is fallback approver via `getProjectApprover`) | — | — | "Select a stakeholder" |
| Create dedicated channel | `create_channel` | `value` | checkboxes | No (`optional: true`) | ON (`initial_options` pre-selected with `value: "create_channel"`) | — | — | "Create a private channel for this project" |

**Note on methodology options:** The methodology selector (usability_testing, user_interviews, contextual_inquiry, concept_testing, survey, card_sorting, tree_testing, mixed_methods) lives in the `/qori-brief` modal (`researchBriefModal.ts`), not here. `/qori-start` creates the project container only.

## What Qori Generates

**CURRENT — verified against `handleProjectCreateSubmission`:**

| Output | Type | Authority | Runtime Detail |
|--------|------|-----------|----------------|
| Project record | CANONICAL | `projects` table | `createProjectFromName(projectName, { description, problem_statement, created_by, status: 'active' })` |
| Project slug | DERIVED | Generated inside `createProjectFromName` | Lowercase, hyphenated from name. Uniqueness validated (duplicate -> "already exists" error). |
| ProjectMember (owner) | CANONICAL | `project_members` table | `addProjectMember(project.id, body.user.id, 'creator', 'owner')` |
| Stakeholder binding | CANONICAL | `project_members` table | `setProjectStakeholder(project.id, stakeholderUserId)` — sets `is_stakeholder=true` on member record. Does not change role. |
| GitHub folder scaffold | ARTIFACT | GitHub content repo | `scaffoldProject(slug, name, creatorName)` — creates project folder with README. **Non-blocking:** failure logged, project still created. |
| Slack channel | EPHEMERAL | Slack API | Private channel `project-{slug}`, creator invited (`conversations.invite`), welcome message posted. Channel name truncated to 80 chars with hash suffix if needed. |
| Channel binding | CANONICAL | `projects.channel_id` + `channel_config.project_id` | Bidirectional atomic binding via `bindProjectToChannel`. |

## Post-Submission Behavior

**CURRENT — exact sequence in `handleProjectCreateSubmission`:**

1. Project created in Postgres via `createProjectFromName`
2. Creator added as owner via `addProjectMember`
3. Stakeholder set if provided via `setProjectStakeholder`
4. GitHub folder scaffolded via `scaffoldProject` (non-critical — failure logged, not blocking)
5. Slack channel created if toggle ON via `createChannelWithRetry` (up to 5 attempts with numeric suffix on name collision)
6. Creator invited to channel via `conversations.invite`
7. Welcome message posted to channel
8. Channel bound to project via `bindProjectToChannel` (bidirectional)
9. Confirmation posted to created channel (or DM if no channel):

```
✅ *{name}* created, <#{channelId}> ready. When you're ready, run `/qori-brief` to start your first study — or `/qori-discover` first if you want to add background research.
```

## Error Handling

**CURRENT — verified against handler code:**

- Duplicate slug -> modal error via `ack({ response_action: 'errors' })`: message from `createProjectFromName` (includes "already exists")
- Missing project name -> modal error: "Project name is required"
- Missing problem statement -> modal error: "Problem statement is required. Discovery and briefs are derived against this."
- Channel creation failure -> DM to user: "Project *{name}* created. I couldn't create a dedicated channel — {error}. You can bind a channel later." Project still created.
- Channel binding failure -> orphaned channel archived via `conversations.archive`, channel cleared from result
- GitHub scaffold failure -> logged via `console.warn`, non-blocking

## Next Steps (Unlocked)

**CURRENT — referenced in confirmation message:**

- `/qori-discover` — add background research (desk research, stakeholder interviews, survey synthesis)
- `/qori-brief` — create first research brief / study

## Workspace Design Notes

**INTENDED — not implemented, design direction only:**

**What can be derived automatically in Workspace:**
- Actor identity (session auth, not Slack user ID)
- Organization (session context)
- Slug generation (same logic, no user input needed)

**What must still be collected:**
- Project name (required, generates slug)
- Problem statement (required, feeds downstream AI)
- Stakeholder selection (optional, needs user picker)

**Slack-specific elements to NOT reproduce:**
- "Create dedicated channel" toggle — Workspace has no channel concept
- Channel binding — replaced by project URL routing

**CD consideration:** This becomes the "New Project" form/screen. The confirmation message becomes the project landing page.
