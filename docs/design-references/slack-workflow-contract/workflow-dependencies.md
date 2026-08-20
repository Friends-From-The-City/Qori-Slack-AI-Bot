# Workflow Dependencies

For each workflow stage: what enables it and what it enables next.

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

**Consumes:** Analyzed sessions (nuggets, themes from session_summary), study context
**Commits:** Synthesis artifact (GitHub), findings/recommendations variables, evidence constructs
**Enables:** Research Readout, Tickets

**Hard dependency:** Analyzed session notes (nuggets exist)
**Types:** affinity_mapping, thematic_analysis, cross_session_synthesis, usability_issues, recommendations, executive_summary

---

### Research Readout (`/qori-report`)

**Consumes:** Findings, recommendations, themes from synthesis
**Commits:** Readout artifact (GitHub), evidence construct linkage
**Enables:** Publication, Tickets

**Hard dependency:** Findings/recommendations exist
**Types:** research_readout (full), targeted_readouts (per audience)

---

### Tickets (`/qori-tickets`)

**Consumes:** Recommendations from synthesis
**Commits:** GitHub Issues with qori-action-id markers
**Enables:** Implementation handoff (terminal)

**Hard dependency:** Recommendations exist
**Audiences:** designer, engineering, accessibility

---

## Navigation Model for Workspace

| Pattern | When |
|---------|------|
| **Locked step** | Brief must be approved before Plan |
| **Warning** | Synthesis without enough sessions analyzed |
| **Suggested next** | "Run /qori-brief next" after project creation |
| **Free navigation** | Discovery, Discussion Guide, Ask can run anytime |
