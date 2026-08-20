# Artifact Lifecycle

Every researcher-facing artifact currently produced by Qori.

## Artifact Inventory

| Artifact | Template | Trigger | Type | Reviewable | Publishable |
|----------|----------|---------|------|------------|-------------|
| Research Brief | `research_brief.yaml` v6.0 | `/qori-brief` submission | `brief` | Yes (approval gate) | Yes (GitHub) |
| Research Plan | `research_plan.yaml` v4.7 | `/qori-plan` submission | `plan` | No (approval removed) | Yes (GitHub) |
| Discussion Guide | `discussion_guide.yaml` v6.3 | `/qori-discuss` submission | `fieldwork` | No | Yes (GitHub) |
| Desk Research | `desk_research.yaml` | `/qori-discover` (desk) | `discovery` | No | Yes (GitHub) |
| Stakeholder Synthesis | `stakeholder_synthesis.yaml` | `/qori-discover` (stakeholder) | `discovery` | No | Yes (GitHub) |
| Survey Synthesis | `survey_synthesis.yaml` | `/qori-discover` (survey) | `discovery` | No | Yes (GitHub) |
| Session Summary | `session_summary.yaml` | `/qori-analyze` submission | `synthesis` | No | Yes (GitHub) |
| Affinity Mapping | `affinity_mapping.yaml` | `/qori-synthesis` (affinity) | `synthesis` | No | Yes (GitHub) |
| Thematic Analysis | `thematic_analysis.yaml` | `/qori-synthesis` (thematic) | `synthesis` | No | Yes (GitHub) |
| Cross-Session Synthesis | `cross_session_synthesis.yaml` | `/qori-synthesis` (cross) | `synthesis` | No | Yes (GitHub) |
| Usability Issues | `usability_issues.yaml` | `/qori-synthesis` (usability) | `synthesis` | No | Yes (GitHub) |
| Recommendations | `recommendations.yaml` | `/qori-synthesis` (recs) | `synthesis` | No | Yes (GitHub) |
| Executive Summary | `executive_summary.yaml` | `/qori-synthesis` (exec) | `synthesis` | No | Yes (GitHub) |
| Research Readout | `research_readout.yaml` v5.4.1 | `/qori-report` (readout) | `readout` | No | Yes (GitHub) |
| Targeted Readout | `targeted_readout.yaml` | `/qori-report` (targeted) | `readout` | No | Yes (GitHub) |
| GitHub Issues | (ticket template) | `/qori-tickets` | `tickets` | No | Yes (GitHub Issues) |

## Generation Flow (Common Pattern)

1. Researcher submits modal → handler extracts inputs
2. Handler resolves cascade variables (upstream study_variables)
3. Handler calls application service → YAML template loaded from GitHub config repo
4. LangChain executes AI generation tasks (Claude via ChatAnthropic)
5. Variable extractor runs extraction schemas against AI output
6. Extracted variables persisted to study_variables (Postgres)
7. Handlebars output template rendered with AI-generated + input variables
8. Artifact written to GitHub content repo
9. ResearchArtifact record created (canonical identity, semantic_key)
10. Researcher receives DM with GitHub URL

## Artifact Identity (PH-6A)

- `public_id` — stable UUID, canonical identity
- `semantic_key` — `{templateId}:{projectId}:{scope}:{artifactType}:{derivationFingerprint}` — unique, no date
- Same semantic_key → reuse existing artifact (update, not create)
- Location metadata (path, commit_sha, url) is mutable; NEVER cleared on retry

## Workflow Status vs. Publication Status

Two independent dimensions (UX-2B):
- **Workflow:** `pending → written → failed` (or `approved` via app service)
- **Publication:** `not_published → publishing → published` or `→ projection_failed`

GitHub failure changes publication_status, NEVER workflow_status.

## Researcher Actions

- **View:** GitHub link in Slack DM
- **Regenerate:** Re-run the same command with same/different inputs (semantic_key dedup handles identity)
- **Revise:** Not supported from Slack — edit in GitHub directly
- **Approve:** Brief only (approval flow via DM buttons)
- **Publish:** Automatic on generation — artifact written to GitHub immediately

## Workspace Design Notes

- Each artifact type → artifact detail page with rendered preview
- Generation → progress indicator (ProgressStepper in design package)
- Review/approve → inline on artifact page (UX-2B review contract)
- Publish → separate action (approved → publish to GitHub)
- Version history → show artifact audit trail (semantic_key reuse means updates, not new artifacts)
