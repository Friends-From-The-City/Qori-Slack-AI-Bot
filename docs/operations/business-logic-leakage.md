# Business Logic Leakage Audit

Last updated: 2026-08-19 (reconciled classification)

---

## Purpose

Identify behavior implemented directly in Slack handlers that would prevent a web/Teams adapter from invoking the same capability.

---

## Classification Key

- **RELEASE_BLOCKER** — The existing Slack release cannot operate correctly or safely without extraction. Must fix before dev→main.
- **BEFORE_WORKSPACE** — Slack is currently correct, but a second adapter could not safely invoke the same behavior without moving orchestration into Core. Fix required before PLAT-3 / UX-3.
- **LATER** — Can be addressed incrementally. Logic is either already well-factored or low-frequency.

---

## Reconciled Findings

### 1. Brief Generation Orchestration

**Capability:** Research brief creation with discovery artifact injection, pre-rendered stable IDs (TB-001, RQ-001, OBJ-001), LLM task execution, cascade variable commitment, approval routing.

**Slack handler:** `commands/briefHandler.ts` (632 lines)

**Business logic in adapter:**
- Discovery artifact loading + variable injection (~35 lines)
- Structured LLM tasks for barriers/questions via `executeAiGenerationTasks()` (~40 lines)
- Mechanical ID assignment (TB-001, RQ-001, OBJ-001) (~10 lines)
- Cascade variable extraction and commitment (~25 lines)
- Approval routing to stakeholder/project owner (~35 lines)
- Form value parsing: budget, participant target, date, timeline preference inference (~150 lines)

**Existing Core/service dependency:** `processTemplate()` (langchain.ts), `variableExtractor.ts`, `github.js`, `studyVariables` service, `authorization.service`. LLM and artifact write are factored out. The orchestration sequence is not.

**Extraction required for PLAT-3:** `BriefGenerationService` encapsulating: input normalization → discovery injection → LLM tasks → ID assignment → template render → variable extraction → artifact write → approval trigger.

**Classification:** **BEFORE_WORKSPACE** — Brief generation works correctly through Slack today. The 632-line handler is large but stable. A second adapter cannot invoke this without extracting the orchestration, but the Slack release is safe.

---

### 2. Research Plan Generation

**Capability:** Research plan creation with compensation calculation, timeline phase computation, cascade variable consumption from brief.

**Slack handler:** `commands/planHandler.ts` (316 lines)

**Business logic in adapter:**
- Compensation calculation via `calculatePerPersonCompensation()` (~15 lines)
- Timeline phases and summary computation (~10 lines)
- Cascade variable consumption from brief (~7 lines)
- Data assembly for YAML template (~25 lines)
- Approval workflow routing (~20 lines)

**Existing Core/service dependency:** `processTemplate()`, `studyVariables`, `authorization.service`. Compensation calculator is a standalone utility.

**Extraction required for PLAT-3:** Merge into `BriefGenerationService` or create `PlanGenerationService`. Smaller and cleaner than briefHandler.

**Classification:** **BEFORE_WORKSPACE** — Works correctly through Slack. Simpler than brief handler.

---

### 3. Session Notes + Transcript Review

**Capability:** Upload session notes/transcripts, PII scrubbing, review/approve/reject flow, evidence construct creation.

**Slack handler:** `commands/sessionNotesHandler.ts` (1658 lines — largest handler in the codebase)

**Business logic in adapter:**
- PII scrubbing orchestration via `scrubTranscript()` (~30 lines, utility already extracted)
- Review state machine: pending → rescrub → approved / rejected (~200+ lines across 6 action handlers)
- Evidence construct creation on approval (~50 lines)
- Tab switching logic (manual vs upload) with form state preservation (~100+ lines)
- Session selection with participant data loading (~80 lines)
- Transcript commit to GitHub with metadata (~40 lines)

**Existing Core/service dependency:** `piiRedaction.ts` (scrubbing utility), `session-summary.service.ts`, `session-evidence.service.ts`, `study_participant.service.ts`. PII scrubbing is factored out. The review state machine and evidence creation on approval are not.

**Extraction required for PLAT-3:** `TranscriptIngestionService` encapsulating: upload → scrub → review state machine → evidence creation. The DM-based review surface is adapter-specific, but the state transitions and evidence creation must be Core.

**Classification:** **BEFORE_WORKSPACE** — Works correctly through Slack. The 1658-line handler is the most complex in the codebase, but all paths produce correct results today. The implicit state machine (managed through Slack message updates) would need to become explicit for any non-Slack adapter.

---

### 4. Research Synthesis Orchestration

**Capability:** Session nugget aggregation, cascade variable consumption, LLM synthesis (affinity, personas, journey, usability, JTBD, design opportunities), evidence construct creation.

**Slack handler:** `commands/researchSynthesisHandler.ts` (773 lines)

**Business logic in adapter:**
- Session data stats building (~40 lines)
- Available enrichment detection from upstream cascade (~35 lines)
- Cascade variable consumption (~30 lines)
- YAML template selection per analysis method (~20 lines)
- Evidence construct creation from synthesis results (~30 lines)

**Existing Core/service dependency:** `processTemplate()`, `studyVariables`, `synthesis-evidence.service.ts`, `evidence.service.ts`. Evidence services exist. Template processing is factored out. Orchestration sequence is not.

**Extraction required for PLAT-3:** `SynthesisOrchestrationService` — input assembly, template selection, cascade consumption, evidence creation.

**Classification:** **BEFORE_WORKSPACE** — Works correctly through Slack. Same orchestration-layer pattern as findings 1–3.

---

### 5. Discovery Artifact Generation

**Capability:** Document upload (PDF/DOCX/TXT/CSV), parsing, PII scanning, YAML template processing, artifact commit to `_discovery/` folder.

**Slack handler:** `commands/discoverHandler.ts` (689 lines)

**Business logic in adapter:**
- Document type validation and parsing via `parseDocuments()` (~20 lines)
- PII scanning via `scanForPii()` (~10 lines)
- YAML template processing (~30 lines)
- Variable extraction from rendered artifact (~15 lines)
- File commit to GitHub in `_discovery/` folder (~20 lines)
- Discovery hub modal with existing artifact display (~100+ lines)

**Existing Core/service dependency:** `processTemplate()`, `github.js`, `studyVariables`, `piiRedaction.ts`. Document parsing and PII scanning are factored out. Orchestration is not.

**Extraction required for PLAT-3:** `DiscoveryProcessingService` — document intake, PII scan, template render, artifact persistence.

**Classification:** **BEFORE_WORKSPACE** — Works correctly through Slack. File upload is tightly coupled to Slack Files API, but the business logic (parse → scan → render → persist) is straightforward to extract.

---

### 6. Readout Generation + Audience Selection

**Capability:** Generate research/designer/engineering/accessibility/leadership readouts.

**Slack handler:** `commands/readoutHandler.ts` (948 lines)

**Business logic in adapter:**
- Study file scanning for inputs (~50 lines)
- Audience type routing to template selection (~30 lines)
- Input assembly from cascade + scanned files (~40 lines)

**Existing Core/service dependency:** `processTemplate()`, `github.js`, `studyVariables`. Same pattern as other template handlers.

**Extraction required for PLAT-3:** Covered by the general template orchestration extraction (Finding 1 pattern).

**Classification:** **BEFORE_WORKSPACE** — Same orchestration-layer pattern. Works correctly through Slack.

---

### 7. Survey Ingestion + Review Pipeline

**Capability:** CSV upload, schema review, privacy review, codebook generation, match review, synthesis execution.

**Slack handler:** `commands/surveySubmissionHandler.ts` (~300+ lines) + `surveyPrivacyHandler.ts` + `codebookHandler.ts` + `matchReviewHandler.ts` + `surveySynthesisAction.ts`

**Business logic in adapter:**
- CSV parsing and field schema inference (handler calls service)
- Redis staging of raw CSV (~5 lines)
- Schema confirmation validation (handler coordinates multi-step modal flow)
- Codebook draft → review → acceptance state machine (modal-driven)
- Match assignment generation and review (modal-driven)

**Existing Core/service dependency:** `survey-aggregation.service.ts`, `survey-codebook.service.ts`, `survey-coding-run.service.ts`. **Well-factored.** Services do the heavy computation. Handlers coordinate the multi-step interactive review flow.

**Extraction required for PLAT-3:** The multi-step review state machine needs a service equivalent, but computation is already in services.

**Classification:** **LATER** — Services are clean. The multi-step interactive review will need a Workspace-specific UX, but the logic is portable today.

---

### 8. Approval State Transitions

**Capability:** Brief approval, change requests, resubmission, mark-changes-complete flow.

**Slack handler:** `commands/approval/approvalFlowHandler.ts`, `markChangesCompleteHandler.ts`, `resubmitBriefHandler.ts`

**Business logic in adapter:**
- State transitions (pending → approved, pending → changes_requested, etc.) via `addStudyStatus()` (~10 lines per transition)
- Stale-button guard (check if already approved) (~25 lines)
- Notification routing to stakeholder/owner (~30 lines)

**Existing Core/service dependency:** `study-status.service.ts`, `authorization.service.ts`. Status changes go through service. Permission checks go through auth service.

**Extraction required for PLAT-3:** `ApprovalStateMachine` — explicit state transitions with guard conditions. Currently implicit in handler action sequences.

**Classification:** **BEFORE_WORKSPACE** — Works correctly through Slack. The implicit state machine is safe when there's only one adapter driving it.

---

### 9. Project + Study Creation

**Capability:** Create project with GitHub repo scaffolding, create study with folder structure, bind channel.

**Slack handler:** `commands/projectStartHandler.ts` (156+ lines)

**Business logic in adapter:**
- Project slug generation (~5 lines)
- Slack channel creation with conflict retry (~30 lines, adapter-specific and acceptable)
- GitHub scaffolding delegation to `scaffolding.service.ts` (~5 lines)

**Existing Core/service dependency:** `project.service.ts`, `research_study.service.ts`, `scaffolding.service.ts`. **Well-factored.** Channel binding is the only Slack-specific piece.

**Extraction required for PLAT-3:** Minimal — remove channel binding assumption.

**Classification:** **LATER** — Services are clean. Channel binding is appropriately adapter-specific.

---

### 10. Participant Management + Outreach

**Capability:** Add participants, update status, generate outreach emails, assign observers.

**Slack handler:** `commands/participantHandler.ts`, `participantOutreachHandler.ts`, `addObserverHandler.ts`, `fieldworkHandler.ts`

**Business logic in adapter:**
- Participant code preview (~10 lines, calls service)
- Outreach email generation delegates to template

**Existing Core/service dependency:** `study_participant.service.ts`, `session_observer.service.ts`. **Well-factored.**

**Extraction required for PLAT-3:** Minimal.

**Classification:** **LATER** — Services exist and are well-factored.

---

### 11. GitHub Issue Generation

**Capability:** Convert readout findings into GitHub issues with deduplication.

**Slack handler:** `commands/ticketHandler.ts`

**Business logic in adapter:**
- Issue creation with deduplication check (~30 lines)
- Two-step modal flow coordination

**Existing Core/service dependency:** `github.js` for issue creation. No dedicated issue service.

**Extraction required for PLAT-3:** `IssueGenerationService` — straightforward extraction.

**Classification:** **LATER** — Functional, low-frequency.

---

### 12. Admin Center Operations

**Capability:** DSAR, study deletion, stakeholder management.

**Slack handler:** `commands/admin/adminCenterHandler.ts`, `commands/admin/adminActionsHandler.ts`

**Business logic in adapter:** Minimal — delegates to services.

**Existing Core/service dependency:** `dsar.service.ts`, `dsar-export.service.ts`, `dsar-delete.service.ts`, `authorization.service.ts`. **Well-factored.**

**Extraction required for PLAT-3:** None significant.

**Classification:** **LATER** — Services are clean.

---

## Reconciled Summary

| Classification | Count | Findings |
|---------------|:-----:|----------|
| **RELEASE_BLOCKER** | **0** | None — all Slack handlers operate correctly and safely for the current release |
| **BEFORE_WORKSPACE** | **7** | Brief generation (1), plan generation (2), transcript review (3), synthesis orchestration (4), discovery artifacts (5), readout generation (6), approval state machine (8) |
| **LATER** | **5** | Survey pipeline (7), project/study creation (9), participant management (10), GitHub issues (11), admin operations (12) |

### Handler Coupling Detail

| Handler | Lines | Coupling Level | Classification |
|---------|------:|:--------------|:--------------|
| `sessionNotesHandler.ts` | 1658 | High — implicit review state machine, evidence creation on approval | BEFORE_WORKSPACE |
| `readoutHandler.ts` | 948 | Medium — orchestration sequence, input assembly from cascade + files | BEFORE_WORKSPACE |
| `researchSynthesisHandler.ts` | 773 | Medium — cascade consumption, evidence creation, method routing | BEFORE_WORKSPACE |
| `discoverHandler.ts` | 689 | Medium — document parsing, PII scan, template render, artifact write | BEFORE_WORKSPACE |
| `briefHandler.ts` | 632 | High — discovery injection, LLM tasks, ID assignment, approval routing | BEFORE_WORKSPACE |
| `planHandler.ts` | 316 | Low-Medium — compensation calc, cascade consumption, approval routing | BEFORE_WORKSPACE |

### PLAT-3 Extraction Priority

When PLAT-3 begins, extract in this order:

1. **Template Orchestration Pipeline** — shared pattern across findings 1–6. A single `TemplateOrchestrationService` (input assembly → template resolve → LLM → extraction → artifact write) eliminates the duplication.
2. **TranscriptIngestionService** — largest handler, implicit state machine.
3. **ApprovalStateMachine** — make state transitions explicit in a service.
4. Individual orchestration services only where the generic pipeline doesn't fit.

**Architecture observation:** The codebase has ~38 well-factored service files handling data operations. The leakage is exclusively at the orchestration layer — handlers chain services in sequences that any adapter needs. The fix is an **Application API layer** between adapters and services. No code should be moved in this patch.
