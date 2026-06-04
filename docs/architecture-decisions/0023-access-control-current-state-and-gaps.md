# ADR 0023: Access control current state and enforcement gaps

**Status:** Accepted
**Date:** 2026-06-03
**Decision drivers:** Federal reviewer preparation; security audit finding; data isolation requirements for VA deployment

## Context

A security audit conducted 2026-06-03 mapped the actual access control model in the codebase. The findings reveal critical gaps between the intended model (per-study ownership with role-based access) and the implemented model (inconsistent enforcement, UI-hidden filtering that can be bypassed).

Federal reviewers will ask: "What is your access control model?" This ADR documents the honest current state, the identified gaps, and the remediation plan.

### Current architecture

**Authentication:** Handled by Slack OAuth. The app receives authenticated user context (`body.user.id`) from Slack on every interaction.

**Authorization model:** Per-resource ownership only. Each `ResearchStudy` has a `created_by` field (Slack user ID) that identifies the owner.

**Role infrastructure (unused):**
- `User.is_admin` field exists in the model — never checked anywhere
- `ResearchStudyUserRole` table exists — roles are written on study creation but never queried for authorization decisions
- `SessionObserver.role` enum exists — tracked for audit/notification purposes only, never enforced

### Enforcement patterns found

**Pattern A — DB-layer enforcement (correct):** Only `/qori-delete` uses this pattern.
```typescript
const study = await ResearchStudyModel.findOne({
  where: { id: studyId, created_by: userId },
});
if (!study) throw new Error('Study not found or you do not have permission');
```

**Pattern B — UI-hidden filtering (insufficient):** 7+ handlers use this pattern.
```typescript
// Modal open
const studies = await getStudiesByUser(userId);  // ← Dropdown filtered
const modal = buildModal({ studies });

// Submission handler — NO RE-VALIDATION
const studyId = values.selected_option?.value;   // ← Trust, don't verify
const study = await getStudyById(studyId);       // ← Proceeds without ownership check
```

**Pattern C — No authorization (open):** Some handlers have no checks at all.

### Authorization map (audit results)

| Command | Action | Check | Enforcement | Gap |
|---------|--------|-------|-------------|-----|
| `/qori-delete` | Delete study | `created_by = userId` | DB service | ✅ None |
| `/qori-ask` | Cross-study query | None | — | ❌ CRITICAL |
| `/qori-analyze` | Session analysis | UI dropdown | — | ❌ HIGH |
| `/qori-report` | Generate readout | UI dropdown | — | ❌ HIGH |
| `/qori-participant` | Add participant | UI dropdown | — | ❌ HIGH |
| `/qori-add-observer` | Add observer | None | — | ❌ HIGH |
| `/qori-notes` | Upload notes | `created_by` on note | Partial | ⚠️ MEDIUM |
| `/qori-plan` | Generate plan | `project_id` match | Handler | ⚠️ MEDIUM |
| `/qori-brief` | Create study | None | — | ⚠️ MEDIUM |
| `/qori-start` | Create project | None | — | ⚠️ MEDIUM |

### Critical finding: /qori-ask data exposure

`searchVariablesAcrossStudies()` in `studyVariables.ts:826-892` queries all studies in the workspace when `projectId`/`studyId` are omitted. Any authenticated user can query any study's variables including participant PII.

## Decision

1. **Document the current state honestly** (this ADR) as federal-reviewer evidence.

2. **Enforce ownership at DB layer for all study-access operations** using the `/qori-delete` pattern. UI filtering is defense-in-depth, not authorization.

3. **Fix /qori-ask immediately** — require explicit scope (user's studies only or project-scoped); never allow workspace-wide queries.

4. **Roll out consistently** — a missed handler is an open door. Address all 7+ handlers in one coordinated workstream.

5. **Defer RBAC build** — the unused role infrastructure (`ResearchStudyUserRole`, `SessionObserver.role`, `User.is_admin`) is a separate, lower-priority item. The urgent work is enforcing the existing ownership model.

## Alternatives considered

### Alternative A: Trust UI filtering

Continue relying on dropdown filtering. The modal only shows studies the user owns, so they can't select others.

**Rejected because:** UI-hidden ≠ enforced. A crafted request (modified modal state, direct API call) bypasses the dropdown entirely. This is not authorization; it's obscurity.

### Alternative B: Build full RBAC first

Implement the role system (admin, researcher, stakeholder, observer) before addressing enforcement gaps.

**Rejected because:** The urgent problem is enforcement, not role granularity. We can enforce ownership today with `created_by`. Role-based visibility is a later enhancement. Fixing enforcement doesn't require roles.

### Alternative C: Middleware-based authorization

Add Bolt middleware that checks study ownership before any handler runs.

**Considered, not rejected:** This may be the right pattern long-term. For now, service-layer checks (Pattern A) are sufficient and require less architectural change. Middleware can be added later as a defense-in-depth layer.

## Consequences

### Intended

- **Federal reviewers get honest documentation.** The gap analysis shows we understand the problem and have a remediation plan.
- **Data isolation enforced.** After remediation, users can only access studies they own.
- **Consistent pattern.** All handlers use the same ownership-check pattern.

### Accepted tradeoffs

- **Remediation touches 10+ files.** The blast radius is wide, but the fix pattern is mechanical (add WHERE clause, validate ownership).
- **Role-based access deferred.** Stakeholders who should see some studies but not edit them won't have that capability until RBAC is built.
- **Create operations remain open.** Any workspace user can create projects/studies. This may be acceptable (researchers self-serve) or may need tightening later.

### Risks

- **Missed handler = open door.** The rollout must be exhaustive. Pattern enforcement tests should catch regressions.
- **Performance impact minimal.** The ownership check is a single indexed WHERE clause, not a new query.

## Remediation plan

### Phase 1: Critical (immediate)

1. Fix `/qori-ask` — add ownership filter to `searchVariablesAcrossStudies()`
2. Add pattern enforcement test — fail if any handler accesses study without ownership check

### Phase 2: High priority

3. Fix all UI-only handlers (analyze, report, participant, observer, notes, plan)
4. Pattern: `const study = await getStudyByIdAndOwner(studyId, userId)` — throws if not owner

### Phase 3: Medium priority

5. Decide on create-operation gating (should any user create projects/studies?)
6. Consider middleware layer for defense-in-depth

### Phase 4: Lower priority (separate workstream)

7. Evaluate RBAC requirements — do we need roles beyond owner/non-owner?
8. If yes, wire `ResearchStudyUserRole` to authorization decisions

## References

- **Issue #194** — CRITICAL: Access control enforcement gaps
- **Issue #193** — Project scope leak (related: 9 handlers need project filtering)
- **Service (correct pattern):** `backend/src/services/research_study.service.ts:169-177`
- **Service (gap):** `backend/src/helpers/studyVariables.ts:826-892`
- **Handlers (need fix):** See Issue #194 for full list
