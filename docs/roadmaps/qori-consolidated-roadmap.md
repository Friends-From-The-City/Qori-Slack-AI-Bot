# Qori Consolidated Roadmap

Last updated: 2026-08-19 (roadmap restructure + release readiness)

---

## Product Direction

Qori is a deployable, channel-independent research operating system for public-sector and government research teams.

**Core principles:**

- Canonical research state lives in Qori's governed backend/database
- GitHub is a durable artifact and implementation projection
- Slack is a supported conversational adapter
- A Qori Research Workspace will become the visual adapter
- Future adapters may include Microsoft Teams or agency-specific interfaces
- No interface becomes the source of truth
- Agencies should be able to deploy Qori into infrastructure they control
- The product should not require an external research SaaS to become the permanent institutional system of record

**UX principle:**

> "Qori should make research structured for the system without making research feel structured to the researcher."

**Architectural rule:**

> New business capabilities must be implemented in Qori Core first and exposed through adapters second. No capability should exist only inside Slack or only inside the Workspace.

**Positioning (internal):**

> "Qori turns user research from a collection of documents into governed institutional knowledge."

> "Research should remain useful long after the study ends — and remain owned by the organization that conducted it."

---

## Roadmap Order

### CURRENTLY COMPLETE FOUNDATION

| Item | Status | Reference |
|------|--------|-----------|
| Evidence foundation (tables, services, ADRs 0028-0031) | COMPLETE / PRODUCTION | PR #278 |
| Survey Slice 1 — deterministic ingestion + v9.2 artifact | COMPLETE / PRODUCTION | PRs #279–#285 |
| Survey Slice 2B — claim guard, qualitative coding, adjudication | DEV-ACCEPTED | 2026-08-16 |
| GOV-1 — Project-level authorization (ADR 0024) | COMPLETE / PRODUCTION | Authorization service |
| GOV-2 — DSAR compliance (export + deletion) | COMPLETE / PRODUCTION | DSAR service |
| GOV-3 — Database integrity batch (ADR 0022) | COMPLETE / PRODUCTION | Migration suite |
| GOV-4 — Observability (Sentry + #qori-alerts) | COMPLETE / PRODUCTION | sentry.js |
| GOV-5 — Disaster recovery (ADR 0039, Supabase adapter) | COMPLETE / PRODUCTION | PR #330 |
| GOV-6 — Records lifecycle (ADR 0040, retention + disposition) | COMPLETE / PRODUCTION | PR #331 |

### RELEASE READINESS

| Item | Description | Status |
|------|-------------|--------|
| **RR-1** | Slack modal/template contract audit + cleanup | NOT STARTED |
| **RR-2** | Integrated DEV end-to-end release test | NOT STARTED |
| **RR-3** | dev → main release gate | NOT STARTED |

**RR-1 scope:** Resolve modal/template mismatches, stale handler references, v7.0 conformance gaps (research_plan OUTPUT BOUNDARIES), disabled command cleanup, and any UI state incorrectly acting as authority. See [Slack Surface Inventory](#slack-surface-inventory) and [Template Readiness](#template-readiness) below.

**RR-2 scope:** Systematic manual + system test covering authorization, core research flows, governance, and operations. See `docs/operations/integrated-release-test.md`.

**RR-3 scope:** All RR-1 blockers resolved, automated tests green, migrations verified, integrated test passes, Railway dev healthy, backup cron source strategy documented.

### PLATFORMIZATION

| Item | Description | Status |
|------|-------------|--------|
| **PLAT-1** | Government Deployment Foundation | SPEC ONLY |
| **PLAT-2** | Organization/team/repo isolation | NOT STARTED |
| **PLAT-3** | Channel-independent Application API | NOT STARTED |

### RESEARCH INTELLIGENCE

| Item | Description | Status |
|------|-------------|--------|
| **PH-7** | Structured Claim Contract / Narrative Compiler | NOT STARTED |
| **PH-8** | Artifact Standard vNext | NOT STARTED |
| **PH-9** | Qori Ask — canonical graph retrieval | NOT STARTED |

#### PH-9: Qori Ask — Taxonomy and Retrieval Contract (Spec)

**Tags/taxonomy** are structured metadata on canonical research entities. They are a retrieval signal.

Tags are NOT:
- The source of truth (evidence lineage is)
- A replacement for evidence lineage
- Slack-only metadata
- UI-only metadata

**Three tag categories (future design must distinguish):**

1. **Controlled/system taxonomy** — organization-defined, consistent across studies
2. **Study-specific researcher tags** — researcher-applied, scoped to a study
3. **AI-proposed tags** — do not become canonical until accepted or mapped by a researcher

**Taggable entities (at minimum):**
- Evidence nuggets/constructs
- Themes/findings
- Optionally: sources, studies (where useful)

**Planned Qori Ask retrieval order:**

```
authorization scope
→ explicit organization/team/project/study scope
→ canonical entity/status/freshness filters
→ taxonomy/tags
→ graph relationships
→ semantic retrieval
→ answer with evidence lineage
```

**Canonical context available to Qori Ask (where authorized):**
- Organization/team
- Project
- Study
- Researcher/actor
- Source
- Participant code
- Method
- Dates
- Accepted/stale/rejected status
- Provenance

Tags and schema are NOT implemented in this patch — this is the architectural contract for PH-9.

### EXPERIENCE

| Item | Description | Status |
|------|-------------|--------|
| **UX-1** | Qori Research Workspace information architecture | SPEC ONLY |
| **UX-2** | Claude Design interface design | NOT STARTED |
| **UX-3** | Workspace MVP adapter | NOT STARTED |
| **UX-4** | Slack/Web workflow parity where valuable | NOT STARTED |

### EXPANSION

| Item | Status |
|------|--------|
| Teams adapter | NOT STARTED |
| Research source connectors | NOT STARTED |
| Calendly integration | NOT STARTED |
| Zoom/Meet integration | NOT STARTED |
| Miro/Mural projections | NOT STARTED |
| Cross-study institutional memory | NOT STARTED |
| Living recommendations | NOT STARTED |
| Richer implementation handoff | NOT STARTED |

---

## Four Cooperating Planes

The architecture is organized into four planes:

1. **Research Evidence Plane** — authoritative research state: sources, observations, constructs, findings, recommendations, evidence relationships, derivation metadata, review/adjudication state, provenance, method/version
2. **Contextual Cascade Plane (GET/CCA)** — existing contextual propagation: consumes, asks, commits, emits, destination-specific transformation, artifact generation, downstream accumulation
3. **Participant Operations Plane** — operational participant state: outreach, recruitment, participant tracker, scheduling/session assignment, participation status, participant codes
4. **Governance / Control Plane** — PII review, approval/disposition, authorization, admin center, audit, deletion/DSAR, lifecycle/environment controls

---

## Existing Systems (Operational)

| System | Status |
|--------|--------|
| `/qori-start` project creation + GitHub scaffolding | Operational |
| Discovery workflows (desk research, stakeholder synthesis, survey synthesis) | Operational |
| Research brief / plan / guide generation | Operational |
| Session notes / transcript workflows | Operational |
| Analysis methods (affinity, personas, usability, etc.) | Operational |
| Readouts (research, engineering, leadership, etc.) | Operational |
| GitHub ticket creation | Operational |
| Outreach generation | Operational |
| Participant tracking | Operational |
| Admin center | Operational |
| PII review / disposition infrastructure | Operational |
| Cascade variable system (study_variables) | Operational |
| YAML consumes / emits / GET / CCA architecture | Operational |
| Dev → production deployment flow (Railway) | Operational |
| Survey ingestion + deterministic analysis | Operational (dev) |
| Evidence foundation (sources, observations, constructs) | Operational (dev) |
| Authorization (project-level, fail-closed) | Operational |
| DSAR (export + deletion) | Operational |
| Disaster recovery (Supabase backup adapter) | Operational |
| Records lifecycle (retention, archival, holds, disposition) | Operational |

## Evidence + Context Architecture (Backlog)

| Phase | Status | Reference |
|-------|--------|-----------|
| Survey Slice 2 — qualitative coding + adjudication | NEXT / NOT STARTED | |
| Active Project Context Visibility (UX) | ROADMAP | |
| Schema Review UX improvements | ROADMAP | |
| Legacy cascade → evidence-layer migration | Progressive per vertical slice | |
| XLS/XLSX survey ingestion | DISABLED | |
| `/qori-ask` — evidence-backed research queries | → PH-9 | |
| Staleness detection | NOT BUILT | |
| Discovery Cycle 2 — stakeholder guide | NOT BUILT | |
| Session nugget → evidence migration | NOT BUILT | |
| Affinity rewrite | NOT BUILT | |
| Personas rewrite | NOT BUILT | |
| Service blueprint rewrite | NOT BUILT | |
| Readout rewrite | NOT BUILT | |
| GitHub ticket lineage | NOT BUILT | |

## Federal Readiness

| Area | Status |
|------|--------|
| NARA-compliant disposition audit logging (ADR 0025) | Operational |
| PII scrubbing at ingestion (ADR 0026) | Operational |
| Owner-gated deletion with retention schedules | Operational |
| Legal holds | Operational |
| DSAR compliance | Operational |
| Section 508 accessibility | Ongoing |
| Federal Readiness Gap Matrix | Scoped (see `docs/federal-readiness-matrix.md`) |

---

## PLAT-1: Government Deployment Foundation (Spec)

Required future scope — spec only, not implemented.

### Deployment

- Container/build definition (Dockerfile already exists, needs review for gov constraints)
- Environment configuration contract (document all env vars, required vs optional)
- Secrets contract (what secrets, how provided, rotation policy)
- Postgres provisioning/migrations (currently Railway-managed, needs abstraction)
- Redis provisioning (currently Railway-managed, needs abstraction)
- Backup requirements (currently Supabase adapter, needs provider-neutral interface)
- Observability configuration (currently Sentry, needs configurable provider)
- GitHub integration configuration (org/repo configurable, already partially done)
- Model-provider configuration (ADR 0034 model provider boundary exists)

### Government Environment Boundaries

- Agency-controlled database
- Agency-controlled secrets
- Configurable GitHub org/repo
- Provider-neutral LLM boundary (ADR 0034)
- OIDC/SAML/SSO-ready auth boundary
- No Railway-specific authority assumptions
- No Friends-specific assumptions

### Operations

- Install guide
- Upgrade guide
- Migration procedure
- Backup/restore procedure
- Health checks

**Note:** This spec does NOT claim FedRAMP, VA production approval, ATO, or any certification.

---

## UX-1: Qori Research Workspace (Spec)

The Workspace is:

- A visual adapter over Qori Core
- Not a second product or source of truth
- Not GitHub Pages
- Not a replacement for Slack
- Not a standalone SaaS data silo

### Conceptual Navigation

- Portfolio (projects + studies overview)
- Study (single study context)
- Sources (transcripts, surveys, documents)
- Evidence (observations, constructs, findings)
- Findings (lineage from evidence to recommendations)
- Outputs (artifacts, readouts, GitHub issues)
- Governance (DSAR, records lifecycle, authorization)
- Ask Qori (evidence-backed research queries)

### Initial Demo MVP Emphasis

- Study overview with status
- Evidence browser
- Finding lineage visualization
- Recommendation lineage
- Research outputs collection
- Archived research retrieval
- Governance/status indicators
- Ask Qori (PH-9)
- Open in GitHub (deep links to artifacts)

### Design Process

Claude Design should be engaged after the information architecture and application API boundaries (PLAT-3) are defined. UX-2 depends on PLAT-3.

---

## Dev → Main Release Gate

See `docs/operations/release-gate.md` for the full checklist.

**Key constraint:** The current production backup cron tracks dev because backup code has not yet been promoted to main. At dev → main release:

1. Switch `qori-postgres-backup` production source from dev to main after the backup implementation exists on main
2. Verify one scheduled/manual backup after the switch

Do not perform the switch until after successful promotion.
