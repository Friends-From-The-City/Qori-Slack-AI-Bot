# Workspace Gap Analysis

Comparison of actual runtime researcher workflows against the current Workspace design package (`design/workspace/`). Every classification is based on runtime code inspection, not inference.

## Current vs Intended Convention

Throughout this document:
- **CURRENT** = what runtime code actually does today
- **INTENDED** = approved architectural/product direction not yet in runtime
- **NOT IMPLEMENTED** = capability absent from runtime

---

## Design Package Coverage (12 Screens Delivered)

| Screen | Covers Slack Workflow | Backend Capability | Gap |
|--------|----------------------|-------------------|-----|
| Home | No direct Slack equivalent | IMPLEMENTED (project/study queries) | None — new surface |
| Study Overview | `/qori-fieldwork` dashboard | IMPLEMENTED | None |
| Sources | `/qori-fieldwork` → upload notes | IMPLEMENTED | Missing: source ingestion form |
| Evidence | `/qori-analyze` output | IMPLEMENTED | None |
| Finding Detail | No Slack surface (API only) | IMPLEMENTED (UX-2B) | None |
| Recommendation Detail | No Slack surface (API only) | IMPLEMENTED (UX-2B) | None |
| Work Queue | DM notifications | IMPLEMENTED (audit/status queries) | None — new surface |
| Artifact Review | GitHub links in DMs | IMPLEMENTED (artifact API) | None |
| Project | `/qori-start` output | IMPLEMENTED | Missing: project creation form |
| Search | `/qori-ask` | PARTIALLY IMPLEMENTED (variable search, no full-text) | None |
| Ask Qori | `/qori-ask` | PARTIALLY IMPLEMENTED | None |
| Admin | `/qori-admin` | IMPLEMENTED | None |

---

## MISSING Screens — Blocking (P0)

### 1. New Project Form

**Slack:** `/qori-start` → `project_create_modal` (5 fields)
**Backend:** IMPLEMENTED — `projectStartHandler.ts`, `project.service.ts`
**Design coverage:** None — no "Create Project" screen in design package
**Researcher inputs:** Project name, problem statement, description, stakeholder, channel toggle (drop for web)
**Interaction class:** Guided setup (2-3 steps) or simple form
**Priority:** P0 — prerequisite for all other workflows

### 2. Research Brief Form

**Slack:** `/qori-brief` → `research_brief_modal` (13 fields + discovery checkboxes)
**Backend:** IMPLEMENTED — `briefHandler.ts`, `brief.app-service.ts`, `research_brief.yaml` v6.0
**Design coverage:** None — no brief creation screen
**Researcher inputs:** Problem statement, learning objectives, out of scope, methodology, participant approach, recruitment sources, start date, decision deadline, budget, stakeholder, discovery artifact selection
**Pre-fill from cascade:** problem_statement (project), methodology (discovery), research_questions (discovery), out_of_scope (barrier coverage), participant_approach (discovery)
**Interaction class:** Full-page form with cascade-driven pre-fill + discovery artifact picker
**Priority:** P0 — approval gate for all downstream research

### 3. Brief Approval Workflow

**Slack:** DM with Approve / Request Changes buttons → resubmit cycle
**Backend:** IMPLEMENTED — `approvalFlowHandler.ts`, `requestChangesHandler.ts`, `resubmitBriefHandler.ts`, `approval.app-service.ts`
**Design coverage:** None — no approval surface designed
**States:** pending_approval → approved | changes_requested → (resubmit) → pending_approval
**Interaction class:** Approval banner on brief detail page + notification in work queue
**Priority:** P0 — blocks plan creation

### 4. Research Plan Form

**Slack:** `/qori-plan` → plan modal (2 researcher fields; rest from cascade)
**Backend:** IMPLEMENTED — `planHandler.ts`, `plan.app-service.ts`, `research_plan.yaml` v4.7
**Design coverage:** None — no plan creation screen
**Researcher inputs:** Lead researcher, operational risks
**All other content from cascade:** methodology, questions, barriers, timeline, participants, deliverables
**Interaction class:** Simple form (most content inherited)
**Priority:** P0 — follows approved brief

### 5. Synthesis Initiation Form

**Slack:** `/qori-synthesis` → `research-synthesis-modal` (method + enrichments)
**Backend:** IMPLEMENTED — `researchSynthesisHandler.ts`, `synthesis.app-service.ts`, 6 YAML templates
**Design coverage:** None — design shows evidence list but not synthesis initiation
**Researcher inputs:** Analysis method (6 options), enrichment checkboxes (dynamic)
**Display:** Session stats (participant/nugget counts), enrichment availability
**Interaction class:** Side panel or modal (lightweight selection)
**Priority:** P0 — core analysis workflow

### 6. Transcript/Source PII Review

**Slack:** DM-based with Approve / Reject / Rescrub buttons
**Backend:** IMPLEMENTED — `sessionNotesHandler.ts` (approve, reject, rescrub flows)
**Design coverage:** None — "Sources" screen doesn't show review workflow
**Researcher inputs:** PII terms to scrub, attestation checkbox, approve/reject/rescrub decision
**Interaction class:** Source viewer with inline PII highlights + action bar
**Priority:** P0 — blocks analysis

---

## MISSING Screens — Important (P1)

### 7. Discussion Guide Form

**Slack:** `/qori-discuss` → `discussion_guide_modal` (6 fields, cascade pre-fill)
**Backend:** IMPLEMENTED — `discussionGuideHandler.ts`
**Design coverage:** None
**Interaction class:** Full-page form with cascade pre-fill

### 8. Session Analysis Form

**Slack:** `/qori-analyze` → progressive modal (study → session → notes)
**Backend:** IMPLEMENTED — `analyzeNotesHandler.ts`, `transcript.app-service.ts`
**Design coverage:** None
**Interaction class:** Guided flow (progressive disclosure)

### 9. Research Readout Form

**Slack:** `/qori-report` → readout modal (type + audience selection)
**Backend:** IMPLEMENTED — `readoutHandler.ts`, `readout.app-service.ts`
**Design coverage:** None — artifact review screen exists but not readout initiation
**Interaction class:** Simple form (type select, audience checkboxes)

### 10. Discovery Workflows

**Slack:** `/qori-discover` → hub + 3 type modals
**Backend:** IMPLEMENTED — `discoverHandler.ts`, 3 YAML templates
**Design coverage:** None — mentioned in contract but no screens
**Interaction class:** Full page with type tabs, file upload per type

---

## MISSING Screens — Later (P2)

### 11. Participant Management

**Slack:** `/qori-fieldwork` → add/update participant sub-modals
**Backend:** IMPLEMENTED — `participantHandler.ts`, `study_participant.service.ts`
**Design coverage:** None
**Interaction class:** Table/grid with add/edit actions

### 12. Participant Outreach

**Slack:** 6 outreach type modals with YAML templates
**Backend:** IMPLEMENTED — `participantOutreachHandler.ts` (1242 lines)
**Design coverage:** None
**Interaction class:** Template-driven message composer

### 13. Observer Management

**Slack:** Add observer modal with capacity validation + self-join
**Backend:** IMPLEMENTED — `addObserverHandler.ts`
**Design coverage:** None
**Interaction class:** Multi-select form with capacity indicators

### 14. Survey Pipeline (Schema → Privacy → Codebook → Match)

**Slack:** 5 handler files with paginated review modals
**Backend:** IMPLEMENTED — `surveySubmissionHandler.ts`, `surveyPrivacyHandler.ts`, `codebookHandler.ts`, `matchReviewHandler.ts`, `surveySynthesisAction.ts`
**Design coverage:** None — zero survey screens in design package
**Interaction class:** Multi-stage guided flow with review tables

### 15. Ticket Creation

**Slack:** `/qori-tickets` → 2-step modal
**Backend:** IMPLEMENTED — `ticketHandler.ts`, GitHub Issues API
**Design coverage:** None
**Interaction class:** Selection form + preview

---

## NOT NEEDED (Slack-Specific)

| Slack Feature | Why No Web Equivalent |
|--------------|----------------------|
| `/qori-learn` onboarding tour | Web onboarding — different approach |
| `/qori-repo` repository config | Admin settings integration |
| `/qori-sync` GitHub sync | Background operation, no UI |
| Channel binding | No channels in web |
| DM notifications | In-app notifications |
| Observer self-join CTA | Direct invite in web |

---

## Source-Analysis Capability Flags

CURRENT runtime support for source analysis capabilities:

| Capability | Status | Evidence |
|-----------|--------|----------|
| Inline transcript highlighting | NOT IMPLEMENTED | Transcripts stored as plain text; no span-level markup |
| Exact-span annotations | NOT IMPLEMENTED | No span anchor model in study_notes or evidence_source |
| Researcher comments on sources | NOT IMPLEMENTED | No comment model on study_notes |
| Qualitative coding on transcript | NOT IMPLEMENTED | Coding happens in AI pipeline (/qori-analyze), not manual |
| Manual nugget creation | NOT IMPLEMENTED | Nuggets created only by AI extraction (session_summary.yaml) |
| Promote-to-evidence | NOT IMPLEMENTED | Evidence constructs created only by AI extraction pipelines |
| Stable span anchors | NOT IMPLEMENTED | No span reference model exists |
| Media clips (audio/video) | NOT IMPLEMENTED | Only text-based transcripts supported |

**CURRENT:** All evidence creation is AI-driven. Researcher reviews AI output but cannot manually create, edit, or promote individual evidence items from either Slack or API.

**INTENDED:** UX-2B review contract (accept/reject) exists for findings/recommendations/themes at the construct level. No inline/span-level review is planned.

---

## Flows Designed vs. Missing

### Designed (6 flows)

| Flow | Coverage |
|------|---------|
| Start a Study | Covers study overview but NOT project creation or brief |
| Review a Finding | Covers finding detail + UX-2B accept/reject |
| Review and Publish Artifact | Covers artifact lifecycle |
| Search and Ask | Covers search + Ask Qori |
| Inspect Traceability | Covers lineage navigation |
| Administer Organization | Covers admin basics |

### Missing Flows

| Flow | Current Slack Pattern | Needed |
|------|----------------------|--------|
| Create Project → Brief → Approval → Plan | Multi-command chain with DM approval | P0 — core lifecycle |
| Upload → PII Review → Approve | DM-based review buttons | P0 — blocks analysis |
| Analyze → Synthesize → Report | Sequential command execution | P1 — analysis workflow |
| Discovery → Brief enrichment | Hub → type modal → brief checkboxes | P1 |
| Survey pipeline (5 stages) | Sequential handler chain | P2 |
| Participant outreach | 6 outreach type modals | P2 |

---

## Architecture Defects Affecting Workspace Design

### CA-002: Readout Projection Boundary Violation

**CURRENT:** Readout generation reads rendered GitHub artifacts at runtime (`readout.app-service.ts:113-166`) and passes them as `research_readout_data` to the YAML template.

**INTENDED:** Readout should consume canonical evidence/domain state plus structured contextual inputs.

**Impact on Workspace:** The artifact review screen may show content generated from GitHub projections rather than canonical evidence. This doesn't block Workspace v1 but affects data lineage fidelity.

### CA-003: Ticket Candidate Terminal Traceability Gap

**CURRENT:** Readout templates emit `*_ticket_candidates` → `ticketHandler` reads via direct DB query → creates GitHub Issues with template-local IDs. No canonical recommendation → ticket lineage.

**INTENDED:** Canonical recommendation identity → deterministic handoff → persisted IMPLEMENTED_BY lineage.

**Impact on Workspace:** Ticket/handoff screens cannot show canonical traceability from recommendation to issue.

---

## Unresolved Product Questions for CD

1. **Participant management scope:** Should it be in Workspace v1? Currently 1700+ lines of Slack handler code. Recommend: P2 (v1.1) unless PM prioritizes.

2. **Survey pipeline scope:** 5-stage handler chain with 3000+ lines. Fully functional but complex. Recommend: P2 unless survey studies are v1 priority.

3. **Brief approval UX:** Currently DM-based. Options: approval banner on brief page, work queue item, or dedicated approval queue.

4. **Inline editing of AI content:** Currently NOT IMPLEMENTED anywhere. Should Workspace add editing of generated artifacts/evidence? Significant scope.

5. **Interactive analysis workspace:** Currently all AI-driven (no manual nugget/theme manipulation). Should Workspace add manual evidence creation? Significant scope.

6. **Multi-study support:** Phase 2D forces single study per project. If Workspace enables multi-study, study name input must be restored.

7. **Discovery timing guidance:** Should Workspace suggest "do discovery first" or allow free navigation? Currently free navigation.

8. **Observer workflows:** Should observers get read-only Workspace access? Currently Slack DM-only.
