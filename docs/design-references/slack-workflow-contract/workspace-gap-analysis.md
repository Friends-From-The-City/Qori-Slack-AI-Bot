# Workspace Gap Analysis

Comparison of actual Slack workflows against `design/workspace/` screens and flows.

## Screens Designed (12) — Coverage Status

| Screen | Slack Equivalent | Coverage |
|--------|-----------------|----------|
| Home | No direct equivalent (Slack is channel-based) | ✅ New surface |
| Study Overview | Project channel + /qori-fieldwork dashboard | ✅ Covered |
| Sources | /qori-fieldwork → upload notes | ✅ Covered |
| Evidence | /qori-analyze output | ✅ Covered |
| Finding Detail | No current Slack surface | ✅ New surface |
| Recommendation Detail | No current Slack surface | ✅ New surface |
| Work Queue | DM notifications from Qori | ✅ New surface |
| Artifact Review | GitHub links in DMs | ✅ New surface |
| Project | /qori-start output | ✅ Covered |
| Search | /qori-ask | ✅ Covered |
| Ask Qori | /qori-ask | ✅ Covered |
| Admin | /qori-admin | ✅ Covered |

## MISSING Screens — Must Design

### BLOCKING (required for core research lifecycle)

| Missing Screen | Slack Equivalent | Priority | Notes |
|----------------|-----------------|----------|-------|
| **New Project Form** | `/qori-start` modal | P0 | 5 fields: name, description, problem statement, stakeholder, channel toggle (drop channel toggle for web) |
| **Research Brief Form** | `/qori-brief` modal | P0 | 10 fields + discovery artifact checkboxes |
| **Brief Approval Workflow** | DM with Approve/Request Changes buttons | P0 | Approval banner on brief detail + notification |
| **Research Plan Form** | `/qori-plan` modal | P0 | 6 fields, cascade pre-fill from brief |
| **Synthesis Initiation Form** | `/qori-synthesis` modal | P0 | Method select + enrichment checkboxes + session stats |
| **Transcript/Source Review** | DM with Approve/Reject/Rescrub buttons | P0 | PII review workflow — highlighted terms, approve/reject/rescrub |

### IMPORTANT (completes research lifecycle)

| Missing Screen | Slack Equivalent | Priority | Notes |
|----------------|-----------------|----------|-------|
| **Discussion Guide Form** | `/qori-discuss` modal | P1 | Cascade pre-fill from brief |
| **Session Analysis Form** | `/qori-analyze` modal | P1 | Progressive: study → session → notes picker |
| **Research Readout Form** | `/qori-report` modal | P1 | Readout type + audience selection |
| **Discovery Workflows** | `/qori-discover` hub + type modals | P1 | Three types: desk research, stakeholder, survey |

### LATER (domain-specific or can remain Slack-only)

| Missing Screen | Slack Equivalent | Priority | Notes |
|----------------|-----------------|----------|-------|
| Participant Management | `/qori-fieldwork` → participants | P2 | Add/update/track participants |
| Participant Outreach | Outreach sub-modals | P2 | Email composition, templates |
| Observer Management | Observer sub-modals | P2 | Add observers, self-join |
| Codebook Generation | `/qori-synthesis` → codebook | P2 | Survey-specific |
| Ticket Creation | `/qori-tickets` two-step modal | P2 | GitHub Issues from recommendations |

### NOT NEEDED (Slack-specific)

| Slack Feature | Why No Web Equivalent |
|--------------|----------------------|
| `/qori-learn` onboarding tour | Replace with web onboarding |
| `/qori-repo` repository config | Admin settings page |
| `/qori-sync` GitHub sync | Background sync, no UI needed |
| Channel binding | No channels in web |
| DM notifications | Replace with in-app notifications |

## MISSING Flows — Must Design

| Flow | Current Slack Pattern | Suggested Web Pattern |
|------|----------------------|----------------------|
| Brief → Approval → Plan | DM buttons between modals | Guided flow or approval banner |
| Transcript → PII Review → Approve | DM with review buttons | Inline review panel |
| Analyze → Synthesize → Report | Sequential slash commands | Study pipeline progress view |

## Repeated/Redundant Fields Across Modals

| Field | Appears In | Opportunity |
|-------|-----------|-------------|
| Study selection | analyze, synthesis, report, fieldwork, tickets | Auto-resolve from study context page |
| Research method | brief, plan, discussion guide | Collect once in brief, cascade |
| Problem statement | project creation, brief | Collect once in project, pre-fill |
| Start date | brief, plan | Collect once in brief, inherit |

## Fields That Could Be Derived Automatically

| Field | Currently Asked | Could Be Derived From |
|-------|----------------|----------------------|
| Lead researcher | Plan modal (users_select) | Session auth (logged-in user) |
| Start date | Brief + Plan modals | Default: next Monday |
| Study name | Not asked (Phase 2D: = project_slug) | Auto-derived, correct |
| Session stats | Shown in synthesis modal | Auto-computed from study_variables |
| Enrichment availability | Checkboxes in synthesis modal | Auto-detected from existing variables |

## Suggested Surface Types for Missing Screens

| Screen | Suggested Type | Rationale |
|--------|---------------|-----------|
| New Project | Guided setup (2-3 steps) | Simple form, but stakeholder needs user picker |
| Research Brief | Full-page form | 10+ fields, discovery artifact selection |
| Brief Approval | Approval banner + inline actions | Not a separate page |
| Research Plan | Full-page form | 6 fields, pre-filled from brief |
| Synthesis Initiation | Side panel or modal | Method select + options |
| Transcript Review | Source viewer with inline PII highlights | Critical for privacy workflow |
| Discussion Guide | Full-page form | Pre-filled from brief cascade |
| Session Analysis | Guided flow (study → session → notes) | Progressive disclosure |
| Research Readout | Full-page form | Type selection + options |
| Discovery | Full page with type tabs | Three sub-workflows |

## Unresolved Product Questions for CD

1. **Should participant management be in Workspace v1?** Currently complex Slack workflows (outreach templates, email formatting, status tracking). Recommend Slack-only for v1.

2. **How should brief approval work in Workspace?** Currently DM-based. Options: approval banner on brief page, notification + action button in work queue, or dedicated approval queue.

3. **Should researchers be able to edit AI-generated content inline?** Currently not supported — researcher reviews GitHub artifact. Workspace could add inline editing with version tracking.

4. **Should the analysis pipeline be more interactive?** Currently AI generates all evidence. Workspace could add manual nugget creation, theme editing, finding promotion. Significant scope increase.

5. **Multi-study support:** Phase 2D forces single study per project. If Workspace enables multi-study, study name input must be restored and slug derivation changed.

6. **Discovery timing:** Currently free-form. Should Workspace suggest "do discovery first" or allow any-order navigation?

7. **Observer/fieldwork workflows:** The observer DM guide (`observerGuideDM.ts`) sends session-specific instructions via Slack DM. No web equivalent needed, or should observers get a read-only Workspace view?

8. **Survey pipeline:** The survey submission → schema review → privacy review → codebook → match review → synthesis pipeline is complex and survey-specific. Should this be Workspace v1 or v1.1?
