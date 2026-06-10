# Architecture Assessment: CCA Front-End Independence

**Date:** 2026-06-06
**Context:** Preparing for (1) web front-end addition (separate repo, shared backend) and (2) provisional-to-real patent conversion requiring accurate CCA characterization.
**Method:** Fresh codebase read with file-level evidence, not recollection.

---

## 1. THE CCA, AS BUILT — Precisely

The Contextual Cascade Architecture is a **provenance-preserving evidence chain** from raw participant observations to synthesized findings.

### Variable Store (The Backbone)

- **File:** `backend/src/helpers/studyVariables.ts` (1237 lines)
- **Table:** `study_variables` with JSONB `value` column
- **Key Fields:** `project_id`, `study_id`, `variable_key`, `participant_id`, `source_template`, `source_version`
- **Scoping:** `scope` = 'study' | 'discovery'; `study_id` = NULL for discovery-scoped variables

### The Cascade Chain (Concrete Stages)

| Stage | Variable Key | Schema File | Emitted By | ID Format |
|-------|-------------|-------------|------------|-----------|
| **Raw Evidence** | `atomic_nugget_core` | `backend/config/schemas/atomic_nugget_core.yaml` | `session_summary.yaml` | `nugget-PT-001-001` |
| **Rich Context** | `atomic_nugget_detail` | `backend/config/schemas/atomic_nugget_detail.yaml` | `session_summary.yaml` | matches core.id |
| **Pattern Recognition** | `validated_themes` | `backend/config/schemas/validated_theme.yaml` | `affinity_mapping.yaml` | `theme-01` |
| **Synthesized Insight** | `prioritized_findings` | `backend/config/schemas/prioritized_finding.yaml` | `research_readout.yaml` | `finding-01` |

### Traceability Links (The Patent Chain)

```
Finding (finding-01)
  └─ supporting_themes: ["theme-01", "theme-02"]
       └─ Theme (theme-01)
            └─ supporting_nuggets: ["nugget-PT-001-001", "nugget-PT-002-003"]
                 └─ AtomicNugget (nugget-PT-001-001)
                      └─ verbatim_quote: "exact participant words"
                      └─ participant: "PT-001"
                      └─ timestamp: "14:23:05"
```

### Citation Marker System

- Discovery sources: `[D#]` = desk research, `[S#]` = stakeholder, `[V#]` = survey
- Barrier references: `TB-001`, `TB-002`
- Research question references: `RQ-001`, `RQ-002`
- Built in `briefHandler.ts:50-54` and `briefHandler.ts:407-419`

### Key Architecture Files

- Type system: `backend/src/types/cascade.ts` (648 lines, authoritative types)
- Extraction: `backend/src/helpers/variableExtractor.ts` (481 lines, schema-validated)
- YAML processor: `backend/src/helpers/yamlProcessor.ts` (orchestrates LLM + extraction)
- LLM execution: `backend/src/helpers/langchain.ts` (pure, stateless)

---

## 2. COUPLING ANALYSIS — The Honest Assessment

### Summary Table

| Operation | Handler | Service Boundary | Cascade Logic | **Grade** |
|-----------|---------|------------------|---------------|-----------|
| Study Creation | `projectStartHandler.ts` | ✅ `createProjectFromName()` | — | **CLEAN** |
| Brief Generation | `briefHandler.ts` | ✅ `addResearchStudyWithRoles()` | ⚠️ handler orchestrates | **PARTIALLY-EXTRACTED** |
| Plan Generation | `planHandler.ts` | ✅ `getStudyById()` | ⚠️ handler reads cascade | **PARTIALLY-EXTRACTED** |
| Session Analysis | `analyzeNotesHandler.ts` | ✅ `sessionSummaryService` | ✅ YAML does extraction | **PARTIALLY-EXTRACTED** |
| Discovery | `discoverHandler.ts` | ❌ no service | ⚠️ all in handler | **SLACK-TANGLED** |
| Synthesis | `researchSynthesisHandler.ts` | ❌ no service | ⚠️ handler aggregates | **SLACK-TANGLED** |
| Readout | `readoutHandler.ts` | ❌ no service | ⚠️ handler scans folders | **SLACK-TANGLED** |
| Admin/DSAR | `adminActionsHandler.ts` | ⚠️ mixed | ✅ `dsar.service.ts` | **PARTIALLY-EXTRACTED** |
| Participant CRUD | `participantHandler.ts` | ✅ `study_participant.service` | — | **CLEAN** |

### Root Cause

Handlers are documented as "data assembly points" (per briefHandler.ts comments). This is intentional but creates coupling — handlers gather 15-30 template fields from multiple sources (forms, Postgres, GitHub, cascade variables) before calling `processYamlTemplate()`.

### Clean Service Layer (Reusable Today)

- `backend/src/services/research_study.service.ts`
- `backend/src/services/study_participant.service.ts`
- `backend/src/services/dsar.service.ts`
- `backend/src/services/authorization.service.ts`
- `backend/src/services/audit.service.ts`
- `backend/src/services/project.service.ts`
- Total: 14 services, all front-end agnostic

### Missing Services (Need Extraction)

- `discovery.service.ts` — document parsing + YAML orchestration
- `synthesis.service.ts` — cascade aggregation + analysis routing
- `readout.service.ts` — folder scanning + template assembly
- `cascade.service.ts` — upstream variable resolution + readiness checks

---

## 3. THE SEAM — Where Exactly Is the Boundary?

### Slack-Specific Layer (Replace Per Front-End)

| Component | File/Table | Purpose |
|-----------|-----------|---------|
| `SlackUserState` model | `slack_user_state.ts` | Tracks active project/study per Slack user |
| `ChannelConfig` model | `channel_config.ts` | Maps Slack channels to projects |
| 16+ handlers | `commands/*.ts` | Slack Bolt middleware → service calls |
| Modal builders | `ui/*.ts` | Block Kit JSON construction |
| Events registration | `events.ts` | Slash command routing |

### Domain-Pure Layer (Shared Core)

| Component | Location | Notes |
|-----------|----------|-------|
| 12 domain models | `models/*.ts` | ResearchStudy, StudyParticipant, StudyVariable, etc. |
| 14 services | `services/*.ts` | All business logic, generic `user_id` parameter |
| LLM pipeline | `langchain.ts` | Stateless, no Slack references |
| Variable store | `studyVariables.ts` | JSONB read/write, project+study scoping |
| Cascade types | `types/cascade.ts` | Type definitions, front-end agnostic |
| YAML templates | `config/prompts/*.yaml` | Configuration, not code |
| Schemas | `backend/config/schemas/*.yaml` | 41 schema files for extraction |

### Where Slack Leaks Into Core

1. **Authorization fallback** — `authorization.service.ts` optionally accepts `slackClient` to check Slack channel membership when DB membership is missing. This is a migration-period pattern, not a hard dependency.

2. **Handler data assembly** — Handlers extract Slack user context and assemble `TemplateInput` objects with 20-30 fields. This logic is business logic that should be in services.

3. **Project `channel_id`** — The `Project` model has an optional `channel_id` field. A web front-end would leave this null.

### Assessment

The seam is clean but thin. The data layer and services are front-end agnostic. The handlers are Slack-specific but should be thin wrappers. The problem is that "thin" is aspirational — handlers currently contain ~50% of the orchestration logic that should be in services.

---

## 4. SHARED-SERVICES TARGET — The Refactor Path

### Already There (No Changes Needed)

- All domain models
- All 14 services
- LLM pipeline (`langchain.ts`)
- Variable store (`studyVariables.ts`)
- Variable extractor (`variableExtractor.ts`)
- YAML processor (`yamlProcessor.ts`)
- Authorization (generic `user_id`)
- DSAR export/delete (generic `user_id`)
- Audit logging (generic `actor_user_id`)

### Extract From Handlers Into Services

| New Service | Extracts From | Size Reduction |
|-------------|---------------|----------------|
| `brief.service.ts` | `briefHandler.ts:95-350` | ~250 lines |
| `plan.service.ts` | `planHandler.ts:116-250` | ~130 lines |
| `discovery.service.ts` | `discoverHandler.ts:300-420` | ~150 lines |
| `synthesis.service.ts` | `researchSynthesisHandler.ts:77-350` | ~270 lines |
| `readout.service.ts` | `readoutHandler.ts:87-200` | ~120 lines |
| `cascade.service.ts` | Common patterns across handlers | Consolidation |

### What Slack Provides That Web Must Supply

| Slack Provides | Web Equivalent |
|----------------|----------------|
| User identity (`user_id`) | JWT/session auth (email or UUID) |
| Workspace context | Tenant/team context |
| Channel membership | Explicit team membership table |
| File uploads | Standard multipart upload |
| Real-time updates (modals) | WebSocket or polling |
| OAuth | OAuth (same pattern, different provider) |

**Note on H6:** The codebase already removed internal auth — Slack provides it. A web front-end would add auth back, but the services don't care; they just receive a `user_id` string.

### Refactor Scope (Not Rebuild)

1. Create 5-6 new services (move handler logic)
2. Handlers become thin adapters: extract form → call service → render response
3. Add REST/GraphQL layer calling same services
4. Add web auth layer providing `user_id`
5. No model changes, no cascade changes, no YAML changes

**Estimated Effort:** 2-3 sprints for service extraction + 2-3 sprints for web API layer = ~6 weeks of focused work.

---

## 5. RISKS TO PATENT-CHAIN INTEGRITY

### The Core Guarantee

The cascade produces identical traceable results regardless of front-end because:

1. **Single Code Path:** Both front-ends call the same services → same `processYamlTemplate()` → same `variableExtractor.ts` → same Postgres writes.

2. **Schema-Validated Extraction:** All cascade variables are extracted against YAML schemas (`backend/config/schemas/*.yaml`). The schema, not the handler, defines the structure.

3. **Deterministic ID Assignment:** Participant codes (`PT-001`), barrier IDs (`TB-001`), and nugget IDs (`nugget-PT-001-001`) are assigned by handlers/services, not by the LLM.

4. **Provenance Stored, Not Derived:** Every `study_variables` row includes `source_template`, `source_version`, `participant_id`, enabling reconstruction of the evidence chain.

### Risks If Not Extracted Properly

| Risk | Cause | Mitigation |
|------|-------|------------|
| **Drift in ID assignment** | Web handler assigns IDs differently than Slack handler | Extract ID assignment to shared service (`brief.service.ts:assignBarrierIds()`) |
| **Different cascade readiness checks** | Web handler skips cascade validation | Extract readiness check to `cascade.service.ts:assertCascadeReady()` |
| **Inconsistent template input** | Web handler misses optional fields Slack handler includes | Define `TemplateInput` interfaces in services, not handlers |
| **Duplicate variable writes** | Two front-ends write same variable differently | Single service method with transaction; DB unique constraints |

### Architectural Guarantee (If Services Extracted)

```
Slack Handler → briefService.assembleBriefInput() → processYamlTemplate()
Web Handler   → briefService.assembleBriefInput() → processYamlTemplate()
                     ↓
              IDENTICAL cascade variables
```

### The Patent-Safe Architecture

The invention (CCA) lives in:
- `studyVariables.ts` — variable store with provenance
- `variableExtractor.ts` — schema-validated extraction
- `types/cascade.ts` — type definitions for the chain
- `config/prompts/*.yaml` — cascade flow definitions with `consumes`/`emits`
- `config/schemas/*.yaml` — structural schemas for each variable type

None of these reference Slack. The front-end is delivery mechanism, not invention.

---

## Summary for Patent Characterization

**The Contextual Cascade Architecture is front-end agnostic by construction.** It is:

1. A **variable store** (Postgres `study_variables` with JSONB) that preserves provenance via `source_template`, `source_version`, `participant_id`, and scope isolation

2. A **cascade chain** from atomic nuggets (verbatim quotes + participant codes) through validated themes to prioritized findings, with each stage linking to its upstream sources via ID references

3. A **schema-validated extraction system** that uses YAML schemas to ensure structural consistency regardless of which front-end triggered the operation

4. A **traceability protocol** where every finding can be traced back through theme IDs → nugget IDs → verbatim quotes → participant codes → session transcripts

**Current state:** The engine is clean; the handlers contain business logic that should be extracted. The refactor path is service extraction (not rebuild), with ~6 weeks effort to enable true multi-frontend operation.

**Risk mitigation:** Extract shared services before building web front-end. If both front-ends call identical services, cascade integrity is guaranteed by construction.

---

## Appendix: File Manifest

### CCA Core (Front-End Agnostic)

```
backend/src/helpers/studyVariables.ts      # Variable store (1237 lines)
backend/src/helpers/variableExtractor.ts   # Schema-validated extraction (481 lines)
backend/src/helpers/yamlProcessor.ts       # YAML + LLM orchestration
backend/src/helpers/langchain.ts           # LLM execution (stateless)
backend/src/types/cascade.ts               # Type definitions (648 lines)
backend/config/schemas/*.yaml              # 41 extraction schemas
config/prompts/*.yaml                      # Cascade flow definitions
```

### Services (Front-End Agnostic)

```
backend/src/services/research_study.service.ts
backend/src/services/study_participant.service.ts
backend/src/services/dsar.service.ts
backend/src/services/authorization.service.ts
backend/src/services/audit.service.ts
backend/src/services/project.service.ts
backend/src/services/research_plan.service.ts
backend/src/services/session-summary.service.ts
backend/src/services/study-notes.service.ts
backend/src/services/study-status.service.ts
backend/src/services/session-observer.service.ts
backend/src/services/scaffolding.service.ts
backend/src/services/channel-config.service.ts      # Slack-specific
backend/src/services/slack-user-state.service.ts    # Slack-specific
```

### Slack Layer (Replace for Web)

```
backend/src/helpers/slack/commands/*.ts    # 16+ handlers
backend/src/helpers/slack/ui/*.ts          # Modal builders
backend/src/helpers/slack/events.ts        # Command routing
backend/src/database/models/slack_user_state.ts
backend/src/database/models/channel_config.ts
```
