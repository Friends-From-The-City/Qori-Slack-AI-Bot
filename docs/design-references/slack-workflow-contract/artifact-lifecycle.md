# Artifact Lifecycle

Every researcher-facing artifact currently produced by Qori. Each entry labeled CURRENT (verified in runtime code), INTENDED (architectural direction, not yet implemented), or NOT IMPLEMENTED.

## Artifact Inventory

### Discovery Phase

| Artifact | Template | Trigger | Type | Reviewable | Publishable | Status |
|----------|----------|---------|------|------------|-------------|--------|
| Desk Research | `desk_research.yaml` | `/qori-discover` (desk) | `discovery` | No | Yes (GitHub) | CURRENT |
| Stakeholder Synthesis | `stakeholder_synthesis.yaml` | `/qori-discover` (stakeholder) | `discovery` | No | Yes (GitHub) | CURRENT |
| Survey Synthesis | `survey_synthesis.yaml` | `/qori-discover` (survey) | `discovery` | No | Yes (GitHub) | CURRENT |

### Planning Phase

| Artifact | Template | Trigger | Type | Reviewable | Publishable | Status |
|----------|----------|---------|------|------------|-------------|--------|
| Research Brief | `research_brief.yaml` | `/qori-brief` submission | `brief` | Yes (approval gate) | Yes (GitHub) | CURRENT |
| Research Plan | `research_plan.yaml` | `/qori-plan` submission | `plan` | No (approval removed) | Yes (GitHub) | CURRENT |
| Discussion Guide | `discussion_guide.yaml` | `/qori-discuss` submission | `fieldwork` | No | Yes (GitHub) | CURRENT |

### Fieldwork Phase

| Artifact | Template | Trigger | Type | Reviewable | Publishable | Status |
|----------|----------|---------|------|------------|-------------|--------|
| Participant Tracker | `participant_tracker.yaml` | `/qori-fieldwork` participant add | `fieldwork` | No | Yes (GitHub) | CURRENT |
| Participant Outreach | `participant_outreach.yaml` | `/qori-fieldwork` outreach action | `fieldwork` | No | Yes (GitHub) | CURRENT |
| Session Notes | `session_notes.yaml` | `/qori-fieldwork` upload notes | `fieldwork` | Yes (PII review) | Yes (GitHub) | CURRENT |
| Transcript Upload | `transcript_upload.yaml` | `/qori-fieldwork` transcript upload | `fieldwork` | Yes (PII review) | Yes (GitHub) | CURRENT |

### Analysis Phase

| Artifact | Template | Trigger | Type | Reviewable | Publishable | Status |
|----------|----------|---------|------|------------|-------------|--------|
| Session Summary | `session_summary.yaml` | `/qori-analyze` submission | `analysis` | No | Yes (GitHub) | CURRENT |

### Synthesis Phase

| Artifact | Template | Trigger | Type | Reviewable | Publishable | Status |
|----------|----------|---------|------|------------|-------------|--------|
| Affinity Mapping | `affinity_mapping.yaml` | `/qori-synthesis` (affinity_mapping) | `synthesis` | No | Yes (GitHub) | CURRENT |
| Journey Mapping | `journey_mapping.yaml` | `/qori-synthesis` (journey_mapping) | `synthesis` | No | Yes (GitHub) | CURRENT |
| Persona Generation | `persona_generator.yaml` | `/qori-synthesis` (persona_generation) | `synthesis` | No | Yes (GitHub) | CURRENT |
| Jobs to Be Done | `jobs_to_be_done.yaml` | `/qori-synthesis` (jobs_to_be_done) | `synthesis` | No | Yes (GitHub) | CURRENT |
| Usability Issues | `usability_issues_extractor.yaml` | `/qori-synthesis` (usability_issues) | `synthesis` | No | Yes (GitHub) | CURRENT |
| Design Opportunities | `design_opportunity_generator.yaml` | `/qori-synthesis` (design_opportunities) | `synthesis` | No | Yes (GitHub) | CURRENT |

### Readout Phase

| Artifact | Template | Trigger | Type | Reviewable | Publishable | Status |
|----------|----------|---------|------|------------|-------------|--------|
| Research Readout | `research_readout.yaml` | `/qori-report` (research_readout) | `readout` | No | Yes (GitHub) | CURRENT |
| Targeted Readouts | `targeted_readouts.yaml` | `/qori-report` (targeted_readouts) | `readout` | No | Yes (GitHub) | CURRENT |
| Designer Readout | `designer_readout.yaml` | `/qori-report` (targeted, Design Team) | `readout` | No | Yes (GitHub) | CURRENT |
| Engineering Readout | `engineering_readout.yaml` | `/qori-report` (targeted, Engineering Team) | `readout` | No | Yes (GitHub) | CURRENT |
| Accessibility Readout | `accessibility_readout.yaml` | `/qori-report` (targeted, Accessibility Team) | `readout` | No | Yes (GitHub) | CURRENT |
| Leadership Readout | `leadership_readout.yaml` | `/qori-report` (targeted, Executive Leadership) | `readout` | No | Yes (GitHub) | CURRENT |

### Handoff Phase

| Artifact | Template | Trigger | Type | Reviewable | Publishable | Status |
|----------|----------|---------|------|------------|-------------|--------|
| GitHub Issues | `github_issues_generator.yaml` | `/qori-tickets` | `tickets` | Yes (select before create) | Yes (GitHub Issues) | CURRENT |

### Other

| Artifact | Template | Trigger | Type | Reviewable | Publishable | Status |
|----------|----------|---------|------|------------|-------------|--------|
| Service Blueprint | `service_blueprint.yaml` | (not wired to a slash command) | `other` | No | Yes (GitHub) | CURRENT |

## Generation Flow (Common Pattern)

CURRENT — verified in runtime handler code:

1. Researcher submits modal -> handler extracts inputs
2. Handler resolves cascade variables (upstream study_variables)
3. Handler calls application service -> YAML template loaded from GitHub config repo
4. LangChain executes AI generation tasks (Claude via ChatAnthropic)
5. Variable extractor runs extraction schemas against AI output
6. Extracted variables persisted to study_variables (Postgres)
7. Handlebars output template rendered with AI-generated + input variables
8. Artifact written to GitHub content repo
9. ResearchArtifact record created (canonical identity, semantic_key)
10. Researcher receives DM with GitHub URL

## Artifact Identity (PH-6A)

CURRENT — implemented in ResearchArtifact model:

- `public_id` — stable UUID, canonical identity
- `semantic_key` — `{templateId}:{projectId}:{scope}:{artifactType}:{derivationFingerprint}` — unique, no date
- Same semantic_key -> reuse existing artifact (update, not create)
- Location metadata (path, commit_sha, url) is mutable; NEVER cleared on retry

## Workflow Status vs. Publication Status

CURRENT — both fields exist on ResearchArtifact:

- **Workflow:** `pending -> written -> failed` (or `approved` via app service)
- **Publication:** `not_published -> publishing -> published` or `-> projection_failed`

GitHub failure changes publication_status, NEVER workflow_status.

## Approval Flow

CURRENT — implemented in `approval.app-service.ts` and `approvalFlowHandler.ts`:

- Brief approval: `brief_status` on research_studies: `pending_approval -> approved` or `pending_approval -> changes_requested`
- Plan approval: same mechanism via `handleApprove(body, client, 'plan')`
- Approval actions: `approve` or `request_changes` (with optional change description)
- Resubmit: `changes_requested -> pending_approval` via `resubmitBriefHandler.ts`

## Researcher Actions

CURRENT:

- **View:** GitHub link in Slack DM
- **Regenerate:** Re-run the same command with same/different inputs (semantic_key dedup handles identity)
- **Revise:** Not supported from Slack — edit in GitHub directly
- **Approve:** Brief and plan (approval flow via DM buttons, delegates to `approval.app-service.ts`)
- **Publish:** Automatic on generation — artifact written to GitHub immediately. No separate "approve then publish" flow exists in Slack except for briefs (approval gate).

## Artifact Consumption Patterns

### CA-002: Readout consumes rendered GitHub Markdown

CURRENT: Readouts read rendered GitHub Markdown at runtime. The readout handler fetches previously-generated artifacts from GitHub to feed into the readout template.

INTENDED: Readouts should consume canonical evidence state (evidence_sources, evidence_constructs) instead of re-parsing rendered Markdown.

### CA-003: Ticket candidates emitted to study_variables

CURRENT: Ticket candidates are emitted by targeted readout templates (designer_readout, engineering_readout, accessibility_readout) into study_variables. `ticketHandler.ts` reads ticket candidates directly from study_variables by variable_key (`design_ticket_candidates`, `engineering_ticket_candidates`, `accessibility_ticket_candidates`). `github_issues_generator.yaml` exists as a template but is NOT the runtime consumer — `ticketHandler.ts` reads from Postgres and creates GitHub Issues directly.

INTENDED: Canonical recommendation -> handoff -> IMPLEMENTED_BY lineage.

## Workspace Design Notes

INTENDED (UX-2B) — not yet implemented:

- Each artifact type -> artifact detail page with rendered preview
- Generation -> progress indicator (ProgressStepper in design package)
- Review/approve -> inline on artifact page (UX-2B review contract)
- Approve then publish lifecycle for ALL artifacts, not just briefs. publication_status separate from workflow_status.
- Version history -> show artifact audit trail (semantic_key reuse means updates, not new artifacts)
