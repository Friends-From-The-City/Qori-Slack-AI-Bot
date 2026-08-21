# Slack Command Inventory

Complete inventory of all registered Slack commands from `events.ts`, with Workspace classification.

## Active Slash Commands

| Command | Handler | Purpose | Workspace Classification |
|---------|---------|---------|-------------------------|
| `/qori-start` | `projectStartHandler` | Create new project | CORE WORKSPACE MVP |
| `/qori-brief` | `briefCommandOpener` → `briefHandler` | Create research brief + study | CORE WORKSPACE MVP |
| `/qori-plan` | `planCommandOpener` → `planHandler` | Create research plan | CORE WORKSPACE MVP |
| `/qori-discover` | `discoverHandler` | Discovery hub (desk research, stakeholder, survey) | CORE WORKSPACE MVP |
| `/qori-fieldwork` | `fieldworkHandler` | Fieldwork dashboard (participants, observers, outreach, notes) | LATER WORKSPACE |
| `/qori-analyze` | `analyzeNotesHandler` | Analyze session notes (per-session) | CORE WORKSPACE MVP |
| `/qori-synthesis` | `researchSynthesisHandler` | Run synthesis (affinity mapping, journey mapping, persona generation, jobs to be done, usability issues, design opportunities) | CORE WORKSPACE MVP |
| `/qori-report` | `readoutHandler` | Generate research readout or targeted readouts | CORE WORKSPACE MVP |
| `/qori-tickets` | `ticketHandler` | Create GitHub Issues from recommendations | LATER WORKSPACE |
| `/qori-ask` | `askHandler` | Cross-study variable search with LLM interpretation | LATER WORKSPACE |
| `/qori-learn` | `learnHandler` | Onboarding tour | SLACK-SPECIFIC ONLY |
| `/qori-repo` | `repoConfigHandler` | Configure GitHub repository binding | SLACK-SPECIFIC ONLY |
| `/qori-sync` | `syncHandler` | Sync research from GitHub | SLACK-SPECIFIC ONLY |
| `/qori-admin` | `adminCenterHandler` | Admin center (DSAR, delete study, stakeholder) | CORE WORKSPACE MVP |
| `/run-template` | `runTemplateHandler` | Debug: run arbitrary YAML template | DEPRECATED / DISABLED |

## Non-Command Entry Points (Actions/Buttons)

| Action | Source | Purpose | Workspace Classification |
|--------|--------|---------|-------------------------|
| `create_research_brief` | Button in channel | Open brief modal | CORE WORKSPACE MVP |
| `create_research_plan` | Button in channel | Open plan modal | CORE WORKSPACE MVP |
| `create_research_plan_from_brief` | Button in brief approval message | Transition brief → plan | CORE WORKSPACE MVP |
| `create_discussion_guide` | Button | Open discussion guide modal | CORE WORKSPACE MVP |
| `approve_brief` / `request_changes_brief` | Buttons in approval DM | Brief approval workflow | CORE WORKSPACE MVP |
| `brief_resubmit` | Button after changes requested | Re-submit revised brief | CORE WORKSPACE MVP |
| `mark_changes_complete` / `approve_changes` | Buttons in change workflow | Mark changes done, approve | CORE WORKSPACE MVP |
| `discover_desk_research` / `discover_stakeholder_synthesis` / `discover_survey_synthesis` | Buttons in discovery hub | Open type-specific discovery modal | CORE WORKSPACE MVP |
| `survey_review_schema` / `survey_privacy_review` / `survey_run_synthesis` | Buttons in survey workflow | Survey pipeline steps | LATER WORKSPACE |
| `survey_generate_codebook` / `survey_open_grouping_review` | Buttons in survey workflow | Codebook generation | LATER WORKSPACE |
| `survey_generate_assignments` / `survey_open_match_review` | Buttons in survey workflow | Match review | LATER WORKSPACE |
| `fieldwork_add_participant` / `fieldwork_update_status` / `fieldwork_observe` / `fieldwork_outreach` / `fieldwork_upload_notes` | Buttons in fieldwork dashboard | Fieldwork sub-actions | LATER WORKSPACE |
| `transcript_rescrub` / `transcript_approve` / `transcript_reject` | Buttons in DM | Transcript PII review | CORE WORKSPACE MVP |
| `manual_notes_approve` / `manual_notes_reject` | Buttons in DM | Manual notes approval | CORE WORKSPACE MVP |
| `copy_email_formatted` | Button | Copy outreach email | SLACK-SPECIFIC ONLY |
| `self_join_observer` | Button | Observer self-join | SLACK-SPECIFIC ONLY |

## Disabled / Removed Commands

| Command | Status | Reason |
|---------|--------|--------|
| `/qori` | Removed (GOV-1B) | Superseded by `/qori-learn` |
| `/ask-study` | Removed | RAG disabled, hardcoded beta-test/ path deleted |
| `/civicmind ask-study` | Disabled | RAG disabled for alpha |
| `/civicmind create-template-study` | Disabled | RAG disabled |
| `/civicmind ask` | Disabled | RAG disabled |
| `/civicmind sync` | Disabled | RAG disabled |

## Classification Key

- **CORE WORKSPACE MVP** — Must have a Workspace equivalent for v1 launch
- **LATER WORKSPACE** — Can follow in v1.1+; complex or domain-specific workflows
- **SLACK-SPECIFIC ONLY** — Tied to Slack infrastructure, no Workspace equivalent needed
- **DEPRECATED / DISABLED** — Not active, do not design for
