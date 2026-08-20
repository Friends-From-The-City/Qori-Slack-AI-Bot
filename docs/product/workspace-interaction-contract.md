# Workspace Interaction Contract

This document defines the application behaviors that the future Qori Workspace must support. It is a behavioral contract, not a visual design specification. It describes what the user can do, not how it looks.

---

## Guiding Principles

**"The researcher should see the research, not the database schema."**
Every interaction surface presents domain concepts (studies, findings, recommendations, evidence) in the language researchers use. Internal implementation details -- model IDs, cascade variables, extraction schemas, task queues -- are never exposed to the user.

**"Every consequential research conclusion should be navigable to its evidence and forward to its downstream use."**
Traceability is a first-class product feature. Any finding, recommendation, or artifact that influences a research decision must link backward to its evidence chain and forward to where it was used.

---

## Context Navigation

### Organization

- The authenticated user belongs to one organization.
- All data is scoped to that organization. There is no cross-org view.

### Projects and Studies

- An organization contains projects. A project contains studies.
- The Workspace provides navigation to select the active project and study.
- Context selection (org/project/study) persists across page navigation within a session.
- Study metadata (status, dates, methodology, team) is visible from the study context.

---

## Workflow Initiation

The Workspace supports creating and starting the following workflow types:

- **Research brief** -- approval gate for a study
- **Research plan** -- execution document, follows an approved brief
- **Discovery** (desk research, stakeholder interviews, survey synthesis) -- pre-study evidence gathering
- **Discussion guide** -- session facilitation document
- **Session summary** -- per-session analysis
- **Synthesis** (affinity mapping, thematic analysis, cross-session, usability issues, recommendations, executive summary) -- cross-session analysis
- **Research readout** -- final research output

Each workflow is initiated with a form that collects required inputs. Where upstream artifacts exist (e.g., an approved brief exists when starting a plan), the form pre-populates relevant fields and indicates which inputs were derived from prior work.

---

## AI Proposal, Review, and Accept

All AI-generated content follows the proposal pattern:

1. **Generate** -- the system produces a draft artifact using the configured AI pipeline.
2. **Review** -- the researcher reviews the generated content. The artifact is clearly marked as a draft/proposal.
3. **Accept or Revise** -- the researcher either accepts the artifact as-is, edits it, or requests regeneration with modified inputs.

The system never publishes AI-generated content without researcher review. "Accept" is an explicit researcher action.

---

## Evidence Navigation

### Sources, Constructs, and Relationships

The Workspace provides navigation across evidence types:

- **Sources** -- raw inputs (transcripts, survey responses, desk research documents)
- **Constructs** -- derived evidence (themes, nuggets, findings, recommendations)
- **Relationships** -- connections between evidence items (nugget belongs to theme, finding cites nuggets, recommendation references findings)

Evidence items are browsable within a study and, for discovery, across studies within the organization.

### Traceability

**Backward traceability** (from conclusion to evidence):

`recommendation -> finding -> theme -> nugget -> source -> study`

Every recommendation links to the findings that support it. Every finding links to the themes and nuggets it synthesizes. Every nugget links to its source transcript or document. Every source links to its study.

**Forward traceability** (from evidence to use):

`finding -> recommendation -> artifact -> handoff`

Every finding shows where it was used in recommendations. Every recommendation shows which artifacts contain it. Every artifact shows its publication/handoff status.

---

## Findings and Recommendations

- Findings are displayed with their evidence basis (supporting nuggets, source count, confidence level).
- Recommendations are displayed with their supporting findings and any prioritization metadata.
- Both findings and recommendations support status tracking (draft, reviewed, accepted).
- Severity and priority indicators are visible where applicable.

### Review Lifecycle (UX-2B)

Reviewable construct types: **finding**, **recommendation**, **theme**.

**States:** `candidate` → `accepted` / `rejected`. Governance may set `overridden` (terminal).

| Transition | Allowed | Audit |
|------------|---------|-------|
| candidate → accepted | Yes | `review_finding` / `review_recommendation` |
| candidate → rejected | Yes | `review_finding` / `review_recommendation` |
| accepted → rejected | Yes (re-review) | New audit record |
| rejected → accepted | Yes (explicit re-review) | New audit record |
| overridden → any | No (governance override is final) | N/A |

**Authorization:** Project membership required. Cross-org review fails closed.

**Orthogonality:** `stale_due_to_disposition` is independent of review status. Accepting a finding does not clear its stale flag, and a disposition event does not change a finding's review status.

**API endpoints:**
- `POST /api/v1/findings/:publicId/review` — body: `{ "decision": "accept" | "reject" }`
- `POST /api/v1/recommendations/:publicId/review` — body: `{ "decision": "accept" | "reject" }`

**Response:** `public_id`, `construct_type`, `review_status`, `previous_status`, `reviewed_at`, `reviewed_by_display_name`, `stale_due_to_disposition`, `traceability_summary`.

---

## Tags and Taxonomy (Future)

- Resources (studies, findings, recommendations) support tagging.
- Tags are organization-scoped.
- Taxonomy structure (hierarchical vs. flat) is determined by the organization.
- Tag-based filtering is available in list and search views.

---

## Search and "Ask Qori" (Future)

- Full-text search across studies, findings, recommendations, and artifacts within the organization.
- "Ask Qori" provides natural-language query over the organization's research corpus.
- Results include source attribution and confidence indicators.
- Search respects organization scoping -- results never leak across organizations.

---

## Artifacts

Artifacts are the documents produced by Qori workflows (briefs, plans, readouts, etc.).

### Lifecycle Operations

- **Preview** -- view the generated artifact before accepting.
- **Review** -- examine the artifact with change tracking or diff view where applicable.
- **Approve** -- mark the artifact as accepted by the researcher.
- **Publish** -- deliver the approved artifact to the handoff adapter (currently GitHub).
- **Retry** -- re-attempt a failed publication without regenerating research content.
- **Version** -- artifacts maintain version history. Prior versions are accessible.
- **Open in GitHub** -- direct link to the artifact in the handoff repository.

### Workflow and Publication Status (UX-2B)

Artifacts carry two independent status dimensions:

**Workflow status** (research lifecycle): `generating → draft → needs_review → approved → published → (versioned/archived/superseded)`

**Publication status** (external projection): `not_published → publishing → published` or `→ projection_failed`

A GitHub failure changes publication_status to `projection_failed` but **never** changes workflow_status. An approved artifact remains approved regardless of publication outcome.

**Retry contract:**
- Only `projection_failed` is retryable
- Retry transitions: `projection_failed → publishing → published` (or `→ projection_failed` again)
- Retry does NOT regenerate research content
- Retry does NOT alter approved workflow status
- Retry does NOT duplicate GitHub output (semantic_key idempotency)
- Already-published → retry is a no-op (idempotent)
- Location metadata (path, commit_sha, url) preserved on failure

**Publication status API:** `GET /api/v1/artifacts/:publicId/status` returns `workflow_status`, `publication_status`, `external_target`, `external_reference`, `last_attempt_at`, `retryable`, `error_code`.

**Error codes** are sanitized — no raw GitHub/provider errors exposed: `RATE_LIMITED`, `TARGET_NOT_FOUND`, `PERMISSION_DENIED`, `CONFLICT`, `TIMEOUT`, `PROJECTION_FAILED`.

Failed generation produces a `failed` workflow state with error context visible to the researcher.

---

## Work Queue and Notifications

- Pending actions (artifacts awaiting review, workflows awaiting input) appear in a work queue.
- Notifications alert the researcher to completed generations, failures, and items requiring attention.
- Notification preferences are user-configurable.

---

## Stale Evidence Indicators

When upstream evidence changes after a downstream artifact was generated (e.g., new session summaries added after a synthesis was run), the Workspace indicates that the downstream artifact may be stale.

Staleness is informational, not blocking. The researcher decides whether to regenerate.

---

## Governance

### Holds and Dispositions

- Studies and artifacts can be placed on hold (pausing workflow progression).
- Disposition tracking records the outcome of a study (completed, abandoned, merged).

### Schedules

- Study timelines and milestone dates are visible.
- Overdue milestones are surfaced in the work queue.

---

## Admin Boundaries

- Organization administrators manage team membership and project structure.
- Role-based access controls determine who can create studies, approve artifacts, and publish.
- Admin operations are scoped to the organization -- there is no cross-org admin.
- Admin actions produce an audit trail.

---

## Failure States

The Workspace handles failure states explicitly:

| Failure | User Experience |
|---------|-----------------|
| **AI generation failed** | Artifact enters `failed` state. Error context displayed. Retry available. |
| **LLM timeout** | Same as generation failure. Timeout duration noted. |
| **Handoff adapter unavailable** (GitHub down) | Publish queued for retry. User notified of delay. |
| **Upstream data missing** | Workflow form indicates which required inputs are unavailable. Generation blocked until resolved. |
| **Stale cascade variables** | Warning displayed. Researcher can proceed or regenerate upstream first. |
| **Permission denied** | Clear message identifying the required permission. No partial state changes. |

All failure states are recoverable. The system never leaves an artifact or workflow in an unrecoverable intermediate state.
