# Complete Researcher Journey

The actual supported sequence of research activities in Qori, derived from code inspection.

## Lifecycle Overview

```
/qori-start (Project Creation)
    │
    ├─── /qori-discover (Optional: Discovery Phase)
    │    ├── Desk Research
    │    ├── Stakeholder Synthesis
    │    └── Survey Synthesis
    │
    ├─── /qori-brief (Research Brief — APPROVAL GATE)
    │    │
    │    ├── Stakeholder reviews → Approve / Request Changes
    │    │                              │
    │    │                         Researcher revises → Resubmit
    │    │
    │    └── Brief Approved ──────────────────────────┐
    │                                                  │
    ├─── /qori-plan (Research Plan)  ◄─────────────────┘
    │
    ├─── /qori-discuss (Discussion Guide, optional)
    │
    ├─── /qori-fieldwork (Fieldwork Phase)
    │    ├── Add Participants (/qori-participants)
    │    ├── Participant Outreach
    │    ├── Add Observers
    │    ├── Session Notes / Transcript Upload
    │    └── Transcript PII Review → Approve / Reject / Rescrub
    │
    ├─── /qori-analyze (Per-Session Analysis)
    │    └── Produces: session summaries, nuggets, coded observations
    │
    ├─── /qori-synthesis (Cross-Session Synthesis)
    │    ├── Affinity Mapping
    │    ├── Thematic Analysis
    │    ├── Cross-Session Synthesis
    │    ├── Usability Issues
    │    ├── Recommendations
    │    └── Executive Summary
    │
    ├─── /qori-report (Research Readout)
    │    ├── Full Research Readout
    │    └── Targeted Readouts (per audience)
    │
    └─── /qori-tickets (Implementation Handoff)
         └── GitHub Issues from recommendations
```

## Dependency Graph (Hard vs. Soft)

| Step | Hard Dependencies | Soft Dependencies (Recommended) |
|------|-------------------|---------------------------------|
| Project Creation | None | — |
| Discovery | Project exists | — |
| Research Brief | Project exists | Discovery artifacts (optional enrichment via checkboxes) |
| Brief Approval | Brief submitted | Stakeholder assigned |
| Research Plan | Brief approved | — |
| Discussion Guide | Study exists | Brief approved (cascade pre-fill) |
| Fieldwork (add participants) | Study exists | Plan approved |
| Session Notes | Study + participants exist | — |
| Transcript PII Review | Session notes submitted | — |
| Analyze Notes | Approved session notes exist | — |
| Synthesis | Analyzed session notes exist (nuggets) | Multiple sessions analyzed |
| Research Readout | Synthesis complete (findings, recommendations) | All synthesis types done |
| Tickets | Recommendations exist | Readout published |

### Hard Dependencies (System-Enforced)

- Brief requires a project (created within brief flow if needed via Phase 2D)
- Plan requires an approved brief (brief_status=approved checked)
- Analysis requires existing session notes for the study
- Synthesis requires existing nuggets/evidence for the study
- Readout requires existing findings/recommendations

### Soft Dependencies (Conventional Sequencing)

- Discovery before brief is recommended but not enforced — brief checkboxes let researcher select which discovery artifacts to include
- Plan before fieldwork is recommended — discussion guide pre-fills from plan
- Multiple analyzed sessions before synthesis is recommended
- All synthesis types before readout is recommended

### Free Navigation (No Dependencies)

- Discovery can happen at any time
- Discussion guide can be created before or after plan
- Participants can be added at any time after study exists
- /qori-ask can be used at any point

## Status: IMPLEMENTED

The entire lifecycle above is implemented and functional in the Slack surface. No stages are placeholder-only.
