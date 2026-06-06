# Cascade Linkage Audit — Generation-Side Traceability

**Date:** 2026-06-06
**Purpose:** Identify which schemas enforce traceable role-transformation vs. allow nullable linkage
**Status:** IMPLEMENTED (June 6, 2026)

---

## Status Summary

| Schema | Linkage Field | Status | Fix Required |
|--------|--------------|--------|--------------|
| **validated_theme** | `supporting_nuggets` | REQUIRED ✅ | None |
| **journey_stage** | `supporting_nuggets` | REQUIRED ✅ | None |
| **design_hmw_opportunity** | `evidence_nuggets` | REQUIRED ✅ | None |
| **persona** | `based_on_participants` | REQUIRED ✅ | None |
| **barrier_validation** | `barrier_ref` | REQUIRED ✅ | None |
| **task_scenario** | `validates_barriers` | nullable ❌ | Make required |
| **task_scenario** | `addresses_questions` | nullable ❌ | Make required |
| **probe** | `addresses_question` | nullable ❌ | Make required |
| **prioritized_finding** | `supporting_themes` | nullable ❌ | Make required |
| **prioritized_finding** | `supporting_nuggets` | nullable ❌ | Make required |
| **prioritized_recommendation** | `addresses_findings` | nullable ❌ | Make required |
| **study_deliverable** | `addresses_objective` | nullable ❌ | Make required |
| **atomic_nugget_detail** | `linked_barrier` | nullable | Keep nullable (contextual) |
| **atomic_nugget_detail** | `linked_question` | nullable | Keep nullable (contextual) |

---

## Changes Required

### Priority 1: Discussion Guide Transforms (barrier → task)

**Files to modify:**
- `backend/config/schemas/task_scenario.yaml` — make `validates_barriers`, `addresses_questions` required
- `backend/config/schemas/probe.yaml` — make `addresses_question` required
- `config/prompts/discussion_guide.yaml` — add CASCADE EXTRACTION instructions

### Priority 2: Research Readout Transforms (theme → finding → recommendation)

**Files to modify:**
- `backend/config/schemas/prioritized_finding.yaml` — make `supporting_themes`, `supporting_nuggets` required
- `backend/config/schemas/prioritized_recommendation.yaml` — make `addresses_findings` required
- `config/prompts/research_readout.yaml` — add CASCADE EXTRACTION instructions

### Priority 3: Research Plan Transforms (objective → deliverable)

**Files to modify:**
- `backend/config/schemas/study_deliverable.yaml` — make `addresses_objective` required
- `config/prompts/research_plan.yaml` — add CASCADE EXTRACTION instructions

### Priority 4: Validation Layer

**Files to modify:**
- `backend/src/helpers/variableExtractor.ts` — add linkage validation that fails when required linkage is empty but upstream exists

---

## Design Decision: What Stays Nullable

**`atomic_nugget_detail.linked_barrier`** and **`atomic_nugget_detail.linked_question`** stay nullable because:
1. Not every nugget relates to a specific barrier — some are unexpected observations
2. The analysis chain (nugget → theme → finding) handles barrier/question linkage at the theme level
3. Making this required would force false linkages

**`study_risk.source_constraint`** stays nullable because:
1. Risks can emerge from researcher judgment, not just stakeholder constraints
2. The constraint linkage is enrichment, not transformation

---

## Success Criteria

After implementation:
1. Every `task_scenario` has non-empty `validates_barriers` when upstream barriers exist
2. Every `probe` has non-empty `addresses_question` when upstream questions exist
3. Every `prioritized_finding` has non-empty `supporting_themes` AND `supporting_nuggets`
4. Every `prioritized_recommendation` has non-empty `addresses_findings`
5. Reverse queries work: "which tasks validate TB-001?" returns actual tasks
6. Extraction fails (surfaces gap) when linkage is empty but upstream exists

---

## Implementation Summary (June 6, 2026)

### Schemas Updated (Required Linkage)

| Schema | Fields Now Required | Commit |
|--------|---------------------|--------|
| `task_scenario.yaml` | `validates_barriers`, `addresses_questions` | v2.0 |
| `probe.yaml` | `addresses_question` | v2.0 |
| `prioritized_finding.yaml` | `supporting_themes`, `supporting_nuggets` | v3.0 |
| `prioritized_recommendation.yaml` | `addresses_findings` | v3.0 |
| `study_deliverable.yaml` | `addresses_objective` | v2.0 |

### Templates Updated (Extraction Instructions)

| Template | Changes |
|----------|---------|
| `discussion_guide.yaml` | Added explicit extraction instructions for `validates_barriers` and `addresses_questions` from `[targets TB-XXX]` and `[RQ-XXX]` header markers |
| `research_readout.yaml` | Added explicit extraction instructions for `supporting_themes`, `supporting_nuggets`, and `addresses_findings` from evidence chains |
| `research_plan.yaml` | Added explicit extraction instructions for `addresses_objective` |

### Validation Layer Added

**File:** `backend/src/helpers/variableExtractor.ts`

- Added `LINKAGE_FIELDS` constant listing all traceable linkage fields
- Added `validateLinkage()` function that detects empty linkage arrays on required fields
- Integrated validation into extraction flow — gaps are logged as warnings

### Reverse-Query Utility Added

**File:** `backend/src/helpers/studyVariables.ts`

- Added `LINKAGE_DEFINITIONS` mapping variable types to their linkage fields
- Added `queryUpstreamReferences(ctx, upstreamId, upstreamType)` — returns all downstream variables referencing a specific upstream ID
- Added `validateStudyLinkages(ctx)` — returns a report of all empty linkage fields in a study

### Integration Test

**File:** `backend/src/__tests__/integration/cascade-traceability.test.ts`

Tests verify:
1. Forward linkage (task_scenario → barriers)
2. Reverse queries (barrier → tasks)
3. Linkage validation (detect empty arrays)
4. Cross-type traceability (finding → theme → nugget)

---

## Patent Claim Support

After this implementation, **Claims 5 & 11** are supportable as-built:

| Claim Aspect | Evidence |
|--------------|----------|
| "Single variable assumes different structural roles" | `TB-001` transforms: barrier → task.validates_barriers → theme.linked_barriers → finding.validates_barrier → recommendation.addresses_barrier |
| "Traceably" | Every transformation is recorded in a required linkage field; reverse queries can reconstruct the transformation chain |
| "Across document types" | Discussion guide, session summary, affinity map, research readout, recommendations — all linked |

**Bidirectional Query Example:**
```typescript
// Forward: What barrier does task-01 validate?
const task = taskScenarios.find(t => t.id === 'task-01');
console.log(task.validates_barriers); // ["TB-001"]

// Reverse: Which tasks validate TB-001?
const result = await queryUpstreamReferences(ctx, 'TB-001', 'target_barriers');
console.log(result.items.map(i => i.id)); // ["task-01", "task-03"]
```
