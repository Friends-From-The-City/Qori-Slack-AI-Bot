# Slack Workflow Reference — Design Input for Qori Workspace

This package documents the complete researcher workflow as it exists today in Qori's Slack surface. It is the authoritative input for Claude Design to create Workspace screens that reproduce or improve on the real research lifecycle.

**Purpose:** Give CD enough behavioral contract detail to design Workspace screens without losing required backend inputs.

**Rules:**
- Where code and docs differ, the actual runtime behavior is reported and the difference is flagged.
- IMPLEMENTED / PARTIALLY IMPLEMENTED / DOCUMENTED ONLY / NOT IMPLEMENTED labels used throughout.
- No frontend code was created. No backend code was modified.

## Index

| File | Contents |
|------|----------|
| [researcher-journey.md](researcher-journey.md) | Complete researcher lifecycle with dependency graph |
| [command-inventory.md](command-inventory.md) | All Slack commands with Workspace classification |
| [qori-start.md](qori-start.md) | /qori-start deep dive — project creation contract |
| [discovery.md](discovery.md) | Discovery workflows (desk research, stakeholder, survey) |
| [research-brief.md](research-brief.md) | Research brief contract |
| [research-plan.md](research-plan.md) | Research plan contract |
| [stakeholder-inputs.md](stakeholder-inputs.md) | Stakeholder input and approval contract |
| [sources-notes-transcripts.md](sources-notes-transcripts.md) | Notes, sources, and transcripts contract |
| [analysis-synthesis.md](analysis-synthesis.md) | Analysis pipeline: sources → nuggets → themes → findings → recommendations |
| [evidence-pipeline.md](evidence-pipeline.md) | Source → nugget → theme → finding pipeline with lineage |
| [artifact-lifecycle.md](artifact-lifecycle.md) | Every artifact type, generation, review, publication |
| [research-methods.md](research-methods.md) | Supported research methods and method-specific objects |
| [survey-codebook.md](survey-codebook.md) | Survey pipeline, codebook, match review contracts |
| [field-master-inventory.md](field-master-inventory.md) | **Master field catalogue** — every field with authority, reuse, derivation flags |
| [modal-field-contracts.md](modal-field-contracts.md) | Field tables for every researcher-facing modal |
| [workflow-dependencies.md](workflow-dependencies.md) | Dependency/unlock rules between workflow stages |
| [workspace-gap-analysis.md](workspace-gap-analysis.md) | Missing Workspace screens and flows |
| [workflow-contract.json](workflow-contract.json) | Machine-readable workflow contract |
| [claims-audit.md](claims-audit.md) | False claims found and corrected, with runtime evidence |

## Source of Truth

All information is derived from repository inspection:
- `backend/src/helpers/slack/events.ts` — command registration manifest
- `backend/src/helpers/slack/commands/` — handler implementations
- `backend/src/helpers/slack/ui/` — modal builders
- `backend/src/application/` — application services
- `backend/src/services/` — domain services
- `backend/src/database/models/` — canonical data models
- `config/prompts/` — YAML template definitions
- `backend/config/schemas/` — extraction schemas
- `docs/architecture-decisions/` — ADRs
