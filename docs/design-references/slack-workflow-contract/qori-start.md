# /qori-start — Project Creation Contract

**Status:** IMPLEMENTED
**Handler:** `backend/src/helpers/slack/commands/projectStartHandler.ts`
**Modal:** `backend/src/helpers/slack/ui/projectCreationModal.ts`
**Callback ID:** `project_create_modal`

## Purpose

Creates a new research project — the top-level container for studies, discovery, artifacts, and team membership. This is the first action a researcher takes.

## Invocation

```
/qori-start
```

Typed in any Slack channel. Opens a modal.

## What Qori Already Knows

| Field | Source | Used For |
|-------|--------|----------|
| Actor (Slack user ID) | Slack auth | Creator / initial owner |
| Channel ID | Command context | Stored in metadata for post-submission messaging |
| Organization | Resolved from workspace | Org-scoped project |

## Researcher Input (Modal Fields)

| UI Label | block_id | action_id | Type | Required | Default | Validation | Max Length | Placeholder |
|----------|----------|-----------|------|----------|---------|------------|-----------|-------------|
| Project name | `project_name` | `value` | plain_text_input | Yes | — | Non-empty; slug uniqueness checked on submit | 80 | "e.g., Mobile Scheduling Experience" |
| Description | `project_description` | `value` | plain_text_input (multiline) | No | — | — | 500 | "Research supporting the mobile scheduling redesign initiative..." |
| What problem are you trying to solve? | `project_problem_statement` | `value` | plain_text_input (multiline) | Yes | — | Non-empty; hint says "Gaps and research questions are derived against this" | 2000 | "Veterans struggle to find their claim status online..." |
| Who approves research briefs? | `project_stakeholder` | `stakeholder_select` | users_select | No | — (owner is fallback approver) | — | — | "Select a stakeholder" |
| Create dedicated channel | `create_channel` | `value` | checkboxes | No | ON (initial_options pre-selected) | — | — | — |

## What Qori Generates

| Output | Type | Authority |
|--------|------|-----------|
| Project record | CANONICAL (projects table) | name, slug (generated from name), description, problem_statement, status='active', created_by |
| Project slug | DERIVED | `generateSlug(name)` — lowercase, hyphenated. Uniqueness validated. |
| ProjectMember (owner) | CANONICAL (project_members table) | creator as owner, source='creator' |
| Stakeholder binding | CANONICAL (project_members table) | is_stakeholder=true flag on selected user's member record. Does not change role. |
| GitHub folder scaffold | ARTIFACT | `scaffoldProject(slug, name, creatorName)` — creates project folder with README in GitHub content repo |
| Slack channel | EPHEMERAL (Slack API) | Private channel `project-{slug}`, creator invited, welcome message posted |
| Channel binding | CANONICAL (projects.channel_id + channel_config.project_id) | Bidirectional atomic binding via `bindProjectToChannel` |

## Post-Submission Behavior

1. Project created in Postgres
2. Creator added as owner
3. Stakeholder set if provided
4. GitHub folder scaffolded (non-critical — failure logged, not blocking)
5. Slack channel created if toggle ON (with conflict retry up to 5 attempts)
6. Channel bound to project (bidirectional)
7. Confirmation posted: "✅ {name} created, #{channel} ready. Run `/qori-brief` to start your first study — or `/qori-discover` first for background research."

## Error Handling

- Duplicate slug → modal error "already exists"
- Channel creation failure → DM to user, project still created
- Channel binding failure → orphaned channel archived
- GitHub scaffold failure → logged, non-blocking

## Next Steps (Unlocked)

- `/qori-discover` — add background research (desk research, stakeholder interviews, survey synthesis)
- `/qori-brief` — create first research brief / study

## Workspace Design Notes

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
