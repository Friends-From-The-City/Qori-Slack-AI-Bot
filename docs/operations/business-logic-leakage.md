# Business Logic Leakage Audit

Last updated: 2026-08-19 (RR-1 pre-release)

---

## Purpose

Identify behavior implemented directly in Slack handlers that would prevent a web/Teams adapter from invoking the same capability. Each finding includes the capability, current Slack entry point, what logic is adapter-specific (acceptable), what logic should move into Core, and severity.

---

## Severity Key

- **BLOCKER** — Must fix before any release
- **BEFORE_WORKSPACE** — Must fix before Workspace adapter (PLAT-3 / UX-3)
- **LATER** — Can be addressed incrementally

---

## Findings

### 1. Template Orchestration Pipeline

**Capability:** Resolving a YAML template, assembling inputs, running LLM generation, extracting variables, writing artifacts to GitHub, and returning results.

**Current Slack entry point:** Each handler (briefHandler, planHandler, researchSynthesisHandler, readoutHandler, etc.) individually orchestrates: modal input parsing → `processTemplate()` → variable extraction → GitHub write → Slack DM.

**Adapter-specific (OK):** Modal input parsing, Slack DM delivery, ephemeral messages.

**Should move into Core:** The orchestration sequence itself — template resolution, input assembly, LLM generation, variable extraction, GitHub artifact write. This is the core pipeline that every adapter needs.

**Current state:** `processTemplate()` in `langchain.ts` handles LLM orchestration. `variableExtractor.ts` handles extraction. `github.js` handles artifact write. These are already factored out — but the *sequencing* is duplicated across ~15 handlers.

**Severity:** **BEFORE_WORKSPACE** — No adapter can work without this pipeline as a service. Not a blocker for dev→main since only Slack exists today.

---

### 2. Approval State Transitions

**Capability:** Brief approval, change requests, resubmission, mark-changes-complete flow.

**Current Slack entry point:** `approvalFlowHandler.ts`, `markChangesCompleteHandler.ts`, `resubmitBriefHandler.ts`

**Adapter-specific (OK):** Slack message updates (replacing buttons with status text), ephemeral confirmations.

**Should move into Core:** State transition logic (pending→approved, pending→changes_requested, etc.), notification triggers, permission checks for who can approve.

**Current state:** Approval logic is partially in handlers, partially in service layer. The state machine is implicit.

**Severity:** **BEFORE_WORKSPACE** — Any adapter needs approval capabilities. The state machine should be explicit in a service.

---

### 3. Survey Ingestion + Review Pipeline

**Capability:** Survey CSV upload, schema review, privacy review, codebook generation, grouping review, match review, synthesis execution.

**Current Slack entry point:** `surveySubmissionHandler.ts`, `surveyPrivacyHandler.ts`, `codebookHandler.ts`, `matchReviewHandler.ts`, `surveySynthesisAction.ts`

**Adapter-specific (OK):** File upload via Slack, interactive schema/privacy/codebook review modals.

**Should move into Core:** CSV parsing, schema inference, privacy classification, codebook generation, coding run execution, match assignment. These already live in services (`survey-aggregation.service`, `survey-codebook.service`, `survey-coding-run.service`).

**Current state:** Well-factored. Services do the heavy lifting. Handlers coordinate the multi-step review flow via Slack modals.

**Severity:** **LATER** — Services are already clean. The multi-step review UX will need a Workspace equivalent but the logic is portable.

---

### 4. Participant Management + Outreach

**Capability:** Add participants, update status, generate outreach emails, assign observers.

**Current Slack entry point:** `participantHandler.ts`, `participantOutreachHandler.ts`, `addObserverHandler.ts`, `fieldworkHandler.ts`

**Adapter-specific (OK):** Modal-based participant entry, Slack profile lookups for observers.

**Should move into Core:** Participant CRUD and outreach email generation already delegate to `study_participant.service` and `participant_outreach` template.

**Current state:** Mostly clean. Slack profile lookup for observer names is adapter-specific but acceptable.

**Severity:** **LATER** — Services exist and are well-factored.

---

### 5. Session Notes + Transcript Review

**Capability:** Upload session notes/transcripts, PII scrubbing, review/approve/reject flow.

**Current Slack entry point:** `sessionNotesHandler.ts` (extensive — tabs, review actions, DM-based review surface)

**Adapter-specific (OK):** Tab switching UI, DM-based transcript review with action buttons.

**Should move into Core:** PII scrubbing pipeline, transcript storage, review state machine (pending→approved/rejected/rescrub).

**Current state:** PII scrubbing is in `helpers/piiRedaction.ts` (already factored out). Review state is managed through Slack message updates — the state machine is implicit.

**Severity:** **BEFORE_WORKSPACE** — Transcript review is a critical workflow that needs a non-Slack surface.

---

### 6. Project + Study Creation

**Capability:** Create project with GitHub repo scaffolding, create study with folder structure, bind channel.

**Current Slack entry point:** `projectStartHandler.ts`, `study/studyLifecycleHandler.ts`

**Adapter-specific (OK):** Channel creation/binding, Slack-specific project picker.

**Should move into Core:** Project creation, study creation, GitHub scaffolding. These already delegate to `project.service`, `research_study.service`, `scaffolding.service`.

**Current state:** Well-factored. Channel binding is the only Slack-specific piece.

**Severity:** **LATER** — Services are clean.

---

### 7. Readout Generation + Audience Selection

**Capability:** Generate research/designer/engineering/accessibility/leadership readouts.

**Current Slack entry point:** `readoutHandler.ts`

**Adapter-specific (OK):** Modal with audience checkboxes, study selection.

**Should move into Core:** Template selection based on audience, study file scanning for inputs. These use `processTemplate()` and `github.js`.

**Current state:** Handler does input assembly and audience routing. LLM and artifact write are factored out.

**Severity:** **BEFORE_WORKSPACE** — Same pipeline orchestration issue as Finding 1.

---

### 8. GitHub Issue Generation

**Capability:** Convert readout findings into GitHub issues with deduplication.

**Current Slack entry point:** `ticketHandler.ts`

**Adapter-specific (OK):** Two-step modal flow, Slack confirmation messages.

**Should move into Core:** Issue creation logic, deduplication check. Currently in handler with `github.js` calls.

**Current state:** Partially factored. GitHub calls are through helpers but the sequencing logic is in the handler.

**Severity:** **LATER** — Functional, rarely invoked outside of readout context.

---

### 9. Admin Center Operations

**Capability:** DSAR, study deletion, stakeholder management.

**Current Slack entry point:** `admin/adminCenterHandler.ts`, `admin/adminActionsHandler.ts`

**Adapter-specific (OK):** Modal-based DSAR flow, confirmation dialogs.

**Should move into Core:** DSAR operations already delegate to `dsar.service`, `dsar-export.service`, `dsar-delete.service`. Study deletion uses service layer.

**Current state:** Well-factored. Services handle all data operations.

**Severity:** **LATER** — Services are clean. Admin operations are low-frequency.

---

## Summary

| Severity | Count | Key Findings |
|----------|:-----:|-------------|
| BLOCKER (for Slack-only release) | 0 | None — all findings are acceptable for a Slack-only dev→main release |
| BEFORE_WORKSPACE | 4 | Template orchestration pipeline (1), approval state machine (2), transcript review state (5), readout pipeline (7) |
| LATER | 5 | Survey pipeline (3), participant management (4), project/study creation (6), GitHub issues (8), admin operations (9) |

### Detailed Handler Coupling Assessment

The background audit identified that several handlers contain more embedded business logic than a service-layer summary suggests:

| Handler | Lines | Key Business Logic Embedded |
|---------|:-----:|-----------------------------|
| `briefHandler.ts` | ~632 | Discovery artifact injection, pre-rendered stable IDs (TB-001, RQ-001, OBJ-001), LLM task execution for barrier/question generation, cascade variable commitment, approval routing to stakeholder |
| `planHandler.ts` | ~280 | Compensation calculation, timeline phase computation, cascade consumption from brief, approval workflow routing |
| `sessionNotesHandler.ts` | ~200+ | PII scrubbing state machine (rescrub/approve/reject), evidence construct creation on approval, transcript review via DM-based surface |
| `researchSynthesisHandler.ts` | ~300+ | Session data stats, available enrichment detection, cascade variable consumption, evidence construct creation |
| `discoverHandler.ts` | ~400+ | Document parsing, PII scanning, YAML template processing, artifact commit to `_discovery/` folder |
| `surveySubmissionHandler.ts` | ~300+ | Two-phase pipeline (schema inference → privacy review), deterministic statistics, evidence mapping |

**These are NOT release blockers** — Qori operates through Slack only today, and all this logic works correctly. They become blockers when PLAT-3 (Channel-independent Application API) is implemented.

### Recommended PLAT-3 Extraction Targets (Priority Order)

1. `BriefGenerationService` — Extract brief orchestration (largest handler, most complex)
2. `TranscriptIngestionService` — Extract scrubbing + review state machine
3. `SynthesisOrchestrationService` — Extract cascade consumption + LLM synthesis
4. `DiscoveryProcessingService` — Extract document parsing + artifact persistence
5. `SurveyIngestionService` — Extract two-phase pipeline into cohesive service
6. `ApprovalStateMachine` — Make approval transitions explicit in a service

**Architecture observation:** The codebase is well-factored at the data/service layer (~38 service files). The leakage is at the orchestration layer — handlers chain services together in sequences that any adapter needs. The fix for PLAT-3 is an **Application API layer** between handlers and services that encapsulates the orchestration sequences (template resolve → LLM → extract → write → notify) as callable operations.

No code should be moved in this slice — the findings are spec-only for PLAT-3.
