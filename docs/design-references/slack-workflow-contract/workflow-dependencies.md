# Workflow Dependencies

All dependencies documented here reflect CURRENT runtime behavior verified against handler code and application services.

**Convention:**
- **CURRENT** = what runtime code enforces today
- **INTENDED** = approved direction not yet in runtime
- **HARD DEPENDENCY** = system-enforced; operation fails without prerequisite
- **SOFT / RECOMMENDED** = conventional sequence; system allows out-of-order
- **OPTIONAL BRANCH** = researcher may skip entirely

## Dependency Table

### Project Creation (`/qori-start`)

**Consumes:** nothing (entry point)
**Commits:** Project record (canonical), ProjectMember (owner), optional stakeholder binding, GitHub folder scaffold, optional Slack channel
**Enables:** Discovery, Research Brief, all downstream workflows

---

### Discovery (`/qori-discover`)

**Consumes:** Project context (project_id)
**Commits:** Discovery variables (study_variables with synthetic discovery ID), discovery artifacts (GitHub), evidence sources + constructs
**Enables:** Research Brief (optional enrichment via checkbox selection)

**Hard dependency:** Project must exist
**Soft dependency:** None — can run at any point

---

### Research Brief (`/qori-brief`)

**Consumes:** Project context (project_id, project_slug), optional discovery variables (selected via checkboxes)
**Commits:** ResearchStudy record (canonical), brief artifact (GitHub), study_variables (research_questions, target_barriers, methodology_selection, etc.), brief_status=pending_approval
**Enables:** Brief approval flow, then Research Plan

**Hard dependency:** Project must exist
**Soft dependency:** Discovery artifacts (optional enrichment)

---

### Brief Approval

**Consumes:** Brief (study with brief_status=pending_approval), stakeholder/owner identity
**Commits:** brief_status=approved or brief_status=request_changes
**Enables:** Research Plan (on approval), Revision + Resubmit (on request_changes)

**Hard dependency:** Brief submitted
**Gate:** Approval required before plan creation

---

### Research Plan (`/qori-plan`)

**Consumes:** Approved brief (study with brief_status=approved), study_variables from brief (research_questions, methodology)
**Commits:** Plan artifact (GitHub), additional study_variables
**Enables:** Discussion Guide, Fieldwork

**Hard dependency:** Brief approved
**Cascade pre-fill:** methodology, research_questions from brief

---

### Discussion Guide (`/qori-discuss`)

**Consumes:** Study context, cascade variables from brief (research_objectives → research_focus, research_questions, methodology → research_method)
**Commits:** Discussion guide artifact (GitHub)
**Enables:** Fieldwork sessions (soft)

**Hard dependency:** Study must exist
**Cascade gate:** Shows readiness blocks if required variables missing

---

### Fieldwork — Participants (`/qori-fieldwork` → add participant)

**Consumes:** Study context
**Commits:** StudyParticipant record (canonical), participant code (PT-NNN, advisory lock), participant_tracker.yaml (GitHub)
**Enables:** Session notes, outreach

**Hard dependency:** Study must exist

---

### Fieldwork — Session Notes (`/qori-fieldwork` → upload notes)

**Consumes:** Study + participant context
**Commits:** study_notes record (canonical), transcript in GitHub quarantine (PII review) or DB quarantine (manual notes)
**Enables:** PII Review → Analysis

**Hard dependency:** Study + participant must exist
**Two modes:** Manual (observations → DB quarantine) or Upload (transcript files → GitHub quarantine)

---

### Transcript PII Review

**Consumes:** Quarantined transcript (GitHub or DB)
**Commits:** pii_reviewed=true, final study_notes record, quarantine deleted
**Enables:** Analysis (/qori-analyze)

**Hard dependency:** Session notes submitted
**Actions:** Approve (accept), Reject (delete quarantine), Rescrub (re-run PII removal)

---

### Per-Session Analysis (`/qori-analyze`)

**Consumes:** Approved session notes for a study, cascade variables from brief (barriers, questions)
**Commits:** session_summary variables (atomic_nugget_core, atomic_nugget_detail, validated_themes, etc.)
**Enables:** Synthesis

**Hard dependency:** Approved session notes exist
**Per-session:** Runs on individual sessions, produces nuggets per participant

---

### Research Synthesis (`/qori-synthesis`)

**Consumes:** Analyzed sessions (nuggets from session_summary), study context, optional enrichments (themes, barriers, questions, personas, jobs, constraints)
**Commits:** Synthesis artifact (GitHub), method-specific cascade variables, evidence constructs (theme, persona, journey_stage, usability_finding depending on method)
**Enables:** Research Readout, Tickets

**Hard dependency:** Analyzed session notes (nuggets exist)
**Types:** affinity_mapping, journey_mapping, persona_generation, jobs_to_be_done, usability_issues, design_opportunities

---

### Research Readout (`/qori-report`)

**Consumes:** GitHub-rendered artifacts at runtime (CA-002) + cascade context where declared by template
**Commits:** Readout artifact (GitHub)
**Enables:** Tickets

**Hard dependency:** Synthesis outputs exist (themes, issues, opportunities — varies by method)
**Types:** research_readout (full), targeted_readouts (per audience: designer, engineering, accessibility, leadership)
**Note (CA-002):** Currently reads rendered GitHub Markdown as `research_readout_data`. Architecturally intended to consume canonical evidence/domain state instead.

---

### Tickets (`/qori-tickets`)

**Consumes:** Recommendations from synthesis
**Commits:** GitHub Issues with qori-action-id markers
**Enables:** Implementation handoff (terminal)

**Hard dependency:** Recommendations exist
**Audiences:** designer, engineering, accessibility

---

## Navigation Model for Workspace

CD should use these dependency classifications to determine Workspace navigation:

| Dependency Type | Workspace Pattern | Current Examples |
|----------------|-------------------|------------------|
| HARD DEPENDENCY | Locked step / disabled action | Brief must be approved before Plan; nuggets must exist before synthesis |
| SOFT / RECOMMENDED | Suggested next action (non-blocking) | Discovery before brief; analysis before synthesis |
| OPTIONAL BRANCH | Free navigation | Discovery, Discussion Guide, Ask Qori — available at any time |
| CASCADE GATE | Warning with missing context | Discussion guide without research_objectives shows readiness blocks |

### CURRENT Hard Dependencies (System-Enforced)

| Step | Requires | Enforcement Point |
|------|---------|-------------------|
| Brief | Project exists | `briefHandler.ts` — project_id from metadata |
| Plan | Brief approved (`brief_status=approved`) | `planHandler.ts` — validates study exists with approved brief |
| Discussion Guide | Study exists + research_objectives | Cascade readiness gate in `discussionGuideHandler.ts` |
| Session Notes | Study + participant exist | `sessionNotesHandler.ts` — session picker requires participants |
| Analysis | Approved session notes (`pii_reviewed=true`) | `analyzeNotesHandler.ts` — loads only approved notes |
| Synthesis | Nuggets exist (`atomic_nugget_core` in study_variables) | `synthesis.app-service.ts:140-153` — validates nuggets |
| Readout | Synthesis outputs exist | `readout.app-service.ts` — aggregates study content |
| Tickets | Ticket candidates in study_variables | `ticketHandler.ts:273-281` — loads from StudyVariable |

### CURRENT Soft Dependencies (Recommended but Not Enforced)

| Step | Recommended After | Why |
|------|------------------|-----|
| Discovery | Project creation | Enriches brief with pre-study evidence |
| Plan | Brief approval | Plan elaborates on brief methodology |
| Discussion Guide | Plan | Guide can pre-fill from plan context |
| Multiple analyses | First analysis | More sessions = better synthesis |
| All synthesis types | Affinity mapping | Themes from affinity enrich other methods |

### CURRENT Optional Branches (Free Navigation)

| Step | Available When | No Prerequisites Beyond |
|------|---------------|------------------------|
| Discovery | Project exists | None |
| Discussion Guide | Study exists | Cascade gate shows warnings only |
| Ask Qori | Any time | Project context |
| Participant add | Study exists | None |
| Observer add | Study exists | None |
