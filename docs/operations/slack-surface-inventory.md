# Slack Surface Inventory

Last updated: 2026-08-19 (RR-1 audit)

---

## Purpose

Complete inventory of all Slack interaction surfaces, classified for release readiness.

**Classification key:**

- **A** — Keep as-is
- **B** — Cleanup before release
- **C** — Consolidate
- **D** — Disable/remove
- **E** — Defer to Workspace
- **F** — Business logic must move into Core before future adapters

---

## 1. Slash Commands

| Command | Handler File | Status | Classification | Notes |
|---------|-------------|--------|---------------|-------|
| `/qori-start` | `commands/projectStartHandler.ts` | Active | **A** | Project + study creation. Opens modal → creates project, channel, study. Logic delegates to `project.service`, `scaffolding.service`. |
| `/qori-brief` | Inline in `events.ts:400-463` | Active | **B** | Research brief entry. Inline handler does project lookup + Slack profile fetch before opening modal. Brief submission delegates to `briefHandler.ts`. **Cleanup:** Inline handler should be extracted to a modal opener file. |
| `/qori-plan` | Inline in `events.ts:464-469` | Active | **B** | Research plan entry. Inline handler fetches studies then opens modal. Submission delegates to `planHandler.ts`. **Cleanup:** Inline handler should be extracted. |
| `/qori-discover` | `commands/discoverHandler.ts` | Active | **A** | Discovery workflows (desk research, stakeholder synthesis, survey synthesis). |
| `/qori-fieldwork` | `commands/fieldworkHandler.ts` | Active | **A** | Fieldwork hub (participants, observers, outreach, session notes). |
| `/qori-analyze` | `commands/analyzeNotesHandler.ts` | Active | **A** | Session analysis (per-session coding). |
| `/qori-synthesis` | `commands/researchSynthesisHandler.ts` | Active | **A** | Multi-session synthesis (affinity, personas, journey, usability, JTBD, design opportunities). |
| `/qori-report` | `commands/readoutHandler.ts` | Active | **A** | Research readouts (research, designer, engineering, accessibility, leadership, targeted). |
| `/qori-tickets` | `commands/ticketHandler.ts` | Active | **A** | GitHub issue generation from readout findings. |
| `/qori-ask` | `commands/askHandler.ts` | Active | **A** | Q&A / research query. Currently operational but limited (no evidence-backed retrieval yet). |
| `/qori-learn` | `commands/learn/learnHandler.ts` | Active | **A** | Onboarding / guided tour. |
| `/qori-repo` | `commands/repo/repoConfigHandler.ts` | Active | **A** | Repository configuration. |
| `/qori-sync` | `commands/repo/syncHandler.ts` | Active | **A** | Manual sync of research files. |
| `/qori-admin` | `commands/admin/adminCenterHandler.ts` | Active | **A** | Admin center (DSAR, study deletion, stakeholder management). |
| `/run-template` | `commands/qa/runTemplateHandler.ts` | Active | **A** | Dev/QA utility to run any template directly. |
| `/qori` | Removed in GOV-1B | Disabled | **D** | Comment in events.ts says "Remove from Slack app manifest separately." Verify manifest is clean. |
| `/civicmind ask-study` | Not registered | Disabled | **D** | RAG command — disabled, returns "not available." Not registered in events.ts. |
| `/civicmind ask` | Not registered | Disabled | **D** | RAG command — disabled. Not registered in events.ts. |
| `/civicmind create-template-study` | Not registered | Disabled | **D** | RAG command — disabled. Not registered in events.ts. |
| `/civicmind sync` | Not registered | Disabled | **D** | RAG vector store sync. Not registered in events.ts. |

---

## 2. Modal Builders (ui/)

| Modal | File | callback_id | Status | Notes |
|-------|------|-------------|--------|-------|
| Project create | `ui/projectCreateModal.ts` | `project_create_modal` | Active | A |
| Study setup (plan study) | `ui/studySetupModal.ts` | study_select flow | Active | A |
| Research brief entry | `ui/researchBriefEntryModal.ts` | `research_brief_modal` | Active | A |
| Research plan | `ui/researchPlanModal.ts` | `research_plan_modal` | Active | A |
| Discussion guide | `ui/discussionGuideModal.ts` | `discussion_guide_modal` | Active | A |
| Discovery modals | `ui/discoverModals.ts` | `discover_*_modal` (3 variants) | Active | A |
| Fieldwork hub | `ui/fieldworkModal.ts` | `fieldwork_study_picker` | Active | A |
| Session notes | `ui/sessionNotesModal.ts` | `session_notes_submit` | Active | A |
| Analyze notes | `ui/analyzeNotesModal.ts` | `analyze_notes_submit` | Active | A |
| Research synthesis | `ui/researchSynthesisModal.ts` | `research-synthesis-modal` | Active | A |
| Readout | `ui/readoutModal.ts` | `readout_modal_submit` | Active | A |
| Ticket creation | `ui/ticketModal.ts` | `tickets_step1_submit`, `tickets_step2_submit` | Active | A |
| Ask Qori | `ui/askModal.ts` | `ask_qori_submit` | Active | A |
| Admin center | `ui/adminCenterModal.ts` | admin flow | Active | A |
| DSAR modals | `ui/dsarModals.ts` | `admin-dsar-*` (4 steps) | Active | A |
| Participant outreach | `ui/participantOutreachModal.ts` | `participant-outreach-modal` + 6 type modals | Active | A |
| Add participant | `ui/addParticipantModal.ts` | `add-participant-modal` | Active | A |
| Update participant | `ui/updateParticipantModal.ts` | `update-participant-status` | Active | A |
| Observer modals | `ui/observerModal.ts` | `add_observer_modal`, `self_join_session_picker_modal` | Active | A |
| Learn tour | `ui/learnModal.ts` | `learn_ceremony_submit` | Active | A |
| Repo config | `ui/repoModal.ts` | `repo-folder-subfolder-modal` | Active | A |
| Sync | `ui/syncModal.ts` | `sync-folder-modal` | Active | A |
| Survey schema review | `ui/surveySchemaReviewModal.ts` | `survey_schema_review_modal` | Active | A |
| Survey privacy review | `ui/surveyPrivacyModal.ts` | `survey_privacy_review_modal` | Active | A |
| Codebook review | `ui/codebookReviewModal.ts` | `codebook_review_modal` | Active | A |
| Match review | `ui/matchReviewModal.ts` | `match_review_modal` | Active | A |
| Transcript review | DM-based (action buttons) | 3 sub-modals | Active | A |

---

## 3. Button / Action Handlers

| Action ID | Handler File | Status | Notes |
|-----------|-------------|--------|-------|
| `study_select` | `commands/qoriMainHandler.ts` | Active | Study picker in plan modal |
| `create_research_brief` | `commands/modal-openers/briefModalOpener.ts` | Active | Button in study lifecycle flow |
| `create_research_plan` | `commands/modal-openers/planModalOpener.ts` | Active | Button after brief approval |
| `create_research_plan_from_brief` | `commands/modal-openers/briefToStudyHandler.ts` | Active | Brief → plan transition button |
| `approve_brief` | `commands/approval/approvalFlowHandler.ts` | Active | Brief approval action |
| `request_changes_brief` | `commands/approval/approvalFlowHandler.ts` | Active | Brief change request |
| `brief_resubmit` | `resubmitBriefHandler.ts` | Active | Brief resubmission |
| `mark_changes_complete` | `markChangesCompleteHandler.ts` | Active | Changes complete notification |
| `approve_changes` | `markChangesCompleteHandler.ts` | Active | Changes approval |
| `create_discussion_guide` | Discussion guide handler | Active | Open guide modal from plan |
| `discover_desk_research` | `commands/discoverHandler.ts` | Active | Open desk research modal |
| `discover_stakeholder_synthesis` | `commands/discoverHandler.ts` | Active | Open stakeholder modal |
| `discover_survey_synthesis` | `commands/discoverHandler.ts` | Active | Open survey modal |
| `survey_review_schema` | `commands/surveySubmissionHandler.ts` | Active | Survey schema review |
| `survey_privacy_review` | `commands/surveyPrivacyHandler.ts` | Active | Survey privacy review |
| `survey_run_synthesis` | `commands/surveySynthesisAction.ts` | Active | Run survey synthesis |
| `survey_generate_codebook` | `commands/codebookHandler.ts` | Active | Generate codebook |
| `survey_open_grouping_review` | `commands/codebookHandler.ts` | Active | Codebook grouping review |
| `survey_generate_assignments` | `commands/matchReviewHandler.ts` | Active | Generate match assignments |
| `survey_open_match_review` | `commands/matchReviewHandler.ts` | Active | Match review |
| Fieldwork actions (6) | `commands/fieldworkHandler.ts` | Active | Hub navigation |
| Participant actions | `commands/participantHandler.ts` | Active | Participant management |
| Session notes tabs/buttons | `commands/sessionNotesHandler.ts` | Active | Tab switching + review actions |
| Transcript review (3 actions) | `commands/sessionNotesHandler.ts` | Active | Approve/reject/rescrub |
| Manual notes review (2 actions) | `commands/sessionNotesHandler.ts` | Active | Approve/reject |
| Analysis study/session selects | `commands/analyzeNotesHandler.ts` | Active | Modal dynamic updates |
| Synthesis study/method selects | `commands/researchSynthesisHandler.ts` | Active | Modal dynamic updates |
| Readout interactions (4 actions) | `commands/readoutHandler.ts` | Active | Modal interactions |
| `ask_show_more` | `commands/askHandler.ts` | Active | Expand answer |
| `type_select` | `commands/qa/runTemplateHandler.ts` | Active | Template type selection |
| `copy_email_formatted` | `commands/messaging/messagingHandler.ts` | Active | Copy formatted email |
| Learn navigation (3 actions) | `commands/learn/learnHandler.ts` | Active | Tour navigation |
| Repo config actions | `commands/repo/repoConfigHandler.ts` | Active | Repo/folder selection |
| Sync actions | `commands/repo/syncHandler.ts` | Active | Sync folder selection |
| Admin actions (3) | `commands/admin/adminActionsHandler.ts` | Active | DSAR, delete study, stakeholders |

---

## 4. Event Handlers

| Event | Handler File | Status | Notes |
|-------|-------------|--------|-------|
| `message` | `commands/messageEventHandler.ts` | Active | A — message routing |
| `view_closed` | `commands/study/studyLifecycleHandler.ts` | Active | A — cleanup on modal close |

---

## 5. Disabled / RAG Commands (Not Registered)

These commands are referenced in codebase comments but NOT registered in `events.ts`:

- `/civicmind ask-study` — RAG-based study Q&A (requires Supabase + OpenAI)
- `/civicmind ask` — RAG general query
- `/civicmind create-template-study` — RAG template creation
- `/civicmind sync` — RAG vector store sync
- `/ask-study` — RAG study Q&A modal (comment says "removed")
- `/qori` — Removed in GOV-1B, superseded by `/qori-learn`

**Action needed for RR-1:** Verify these are also removed from the Slack app manifest in the dev workspace. Dead manifest entries cause Slack to show commands that error on use.

---

## 6. Business Logic in Slack Handlers (Adapter Leakage)

See `docs/operations/business-logic-leakage.md` for full audit.

Summary of items classified **F** (must move into Core before future adapters):

| Capability | Current Entry Point | Severity |
|------------|-------------------|----------|
| YAML template resolution + LLM orchestration | Handler → `langchain.ts` → `processTemplate()` | BEFORE_WORKSPACE |
| Variable extraction | Handler → `variableExtractor.ts` | BEFORE_WORKSPACE |
| GitHub artifact write | Handler → `github.js` | BEFORE_WORKSPACE |
| Approval state transitions | Handler → inline state updates | BEFORE_WORKSPACE |
| Participant code assignment | Handler → `studyParticipant.service` | LATER |

Note: Most handlers DO delegate to services for data operations. The leakage is in orchestration — the handler is the orchestrator that chains: modal input → service calls → LLM → extraction → GitHub write → Slack DM. A future adapter needs the same orchestration without Slack's trigger_id/ack flow.
