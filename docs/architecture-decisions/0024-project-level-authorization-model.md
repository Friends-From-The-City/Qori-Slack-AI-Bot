# ADR 0024: Project-Level Authorization Model

**Status:** Accepted
**Date:** 2026-06-04
**Relates to:** #193 (project scope), #194 (authorization enforcement), ADR 0023 (gap analysis)

## Context

ADR 0023 identified critical authorization gaps: 11+ handlers accept study selection from user input without re-validating ownership at the database layer. A user could forge a studyId and access another user's study data.

The initial fix proposal was creator-only enforcement (`WHERE created_by = userId`), but this breaks collaboration. Research is collaborative — multiple researchers work on the same study. If only the study creator can analyze sessions or generate reports, team members are locked out of their own project's work.

The correct model is **project-level membership**: "you can act on a study if you're a member of its project."

## Decision

### Tiered Access Model

| Tier | Access Level | Check |
|------|--------------|-------|
| **Read/Analyze/Generate** | Project membership | `isProjectMember(userId, study.project_id)` |
| **Delete study** | Study creator only | `study.created_by === userId` |
| **Delete project** | Project owner only | `project.created_by === userId` |

### Database Schema

New table: `project_members`

```sql
CREATE TABLE project_members (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id VARCHAR(50) NOT NULL,  -- Slack user ID
  role VARCHAR(20) NOT NULL DEFAULT 'member',  -- 'owner' | 'member'
  source VARCHAR(20) NOT NULL DEFAULT 'explicit',  -- 'creator' | 'channel' | 'explicit' | 'migrated'
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_members_user ON project_members(user_id);
CREATE INDEX idx_project_members_project ON project_members(project_id);
```

**Source values:**

| Source | Meaning | Revocation |
|--------|---------|------------|
| `creator` | Project/study creator (bootstrap seed) | Manual only |
| `migrated` | Existing collaborator from `research_study_user_roles` (bootstrap) | Manual only |
| `channel` | Auto-added via Slack channel membership | See "Known Limitations" |
| `explicit` | Manual add via "Add Team Member" action (future) | Manual only |

### Bootstrap Strategy (Migration)

The migration seeds membership from three sources to avoid locking out existing collaborators:

```sql
-- 1. Project owners
INSERT INTO project_members (project_id, user_id, role, source)
SELECT id, created_by, 'owner', 'creator'
FROM projects
ON CONFLICT (project_id, user_id) DO NOTHING;

-- 2. Study creators (may differ from project owner)
INSERT INTO project_members (project_id, user_id, role, source)
SELECT DISTINCT project_id, created_by, 'member', 'creator'
FROM research_studies
ON CONFLICT (project_id, user_id) DO NOTHING;

-- 3. Existing collaborators from research_study_user_roles
INSERT INTO project_members (project_id, user_id, role, source)
SELECT DISTINCT rs.project_id, rsur.user_id, 'member', 'migrated'
FROM research_study_user_roles rsur
JOIN research_studies rs ON rsur.research_id = rs.id
ON CONFLICT (project_id, user_id) DO NOTHING;
```

### Membership Mechanism: Channel-Based (On-Demand Sync)

VA research teams organize around Slack channels. Channel membership is the natural project membership model.

**How it works:**

1. `isProjectMember()` first checks `project_members` table (fast path)
2. If not found AND project has `channel_id`, checks Slack `conversations.members` API (slow path)
3. If user is channel member, auto-inserts to `project_members` with `source='channel'`
4. Future calls hit table (cached)

**Authorization helper (critical security contract):**

```typescript
/**
 * Check if user is a member of the project.
 *
 * SECURITY CONTRACT:
 * - Returns true ONLY if membership is positively confirmed
 * - Returns false on ANY error (fail-closed)
 * - Slack API failures → DENY, never bypass
 */
async function isProjectMember(userId: string, projectId: number): Promise<boolean> {
  // 1. Fast path: check table (cache hit)
  const membership = await ProjectMember.findOne({
    where: { project_id: projectId, user_id: userId }
  });
  if (membership) return true;

  // 2. Slow path: check Slack channel membership (cache miss)
  const project = await getProjectById(projectId);
  if (!project?.channel_id) return false;  // No channel = table-only membership

  // CRITICAL: Fail-closed on Slack API error
  let isChannelMember: boolean;
  try {
    isChannelMember = await checkSlackChannelMembership(userId, project.channel_id);
  } catch (error) {
    // Slack API failure (rate limit, timeout, outage, token issue)
    // DENY access — never fail open
    console.error('Slack channel membership check failed, denying access:', error);
    return false;
  }

  if (!isChannelMember) return false;

  // 3. Auto-insert for future fast checks
  try {
    await ProjectMember.create({
      project_id: projectId,
      user_id: userId,
      role: 'member',
      source: 'channel',
    });
  } catch (insertError) {
    // Insert failure is non-fatal — membership was still confirmed
    // Next call will re-check Slack (acceptable)
    console.warn('Failed to cache channel membership:', insertError);
  }

  return true;
}
```

### `/qori-ask` Scope: Current Project Only

The `/qori-ask` command queries study variables. To prevent cross-project data leakage:

- `scope='all'` → all studies **in the current project** (channel-anchored)
- `scope='single'` → specific study, verified to be in current project
- **Never** queries across multiple projects

```typescript
const currentProject = await getProjectByChannelId(channelId);
if (!currentProject) {
  throw new Error('This channel is not bound to a project.');
}

await assertProjectAccess(userId, currentProject.id);

const result = await searchVariablesAcrossStudies(
  variableKeys,
  searchTerms,
  { projectId: currentProject.id, limit: 30 },  // Single project scope
);
```

## Security Guarantees

### Fail-Closed Authorization

**CRITICAL:** The `isProjectMember()` helper is the gate on every access check. It MUST fail closed:

| Scenario | Result | Rationale |
|----------|--------|-----------|
| User in `project_members` table | ALLOW | Positive confirmation |
| User in Slack channel (API success) | ALLOW | Positive confirmation, auto-cached |
| User NOT in table, project has no channel | DENY | No membership path |
| User NOT in channel (API success) | DENY | Negative confirmation |
| Slack API error (rate limit, timeout, outage) | **DENY** | Fail-closed by design |
| Database error | **DENY** | Fail-closed by design |

A transient Slack error must never become an authorization bypass.

### Pattern Enforcement Test

A test will assert that every handler accepting `studyId` from user input calls `assertStudyAccess()`:

```typescript
it('every handler accepting studyId calls assertStudyAccess', () => {
  const handlerFiles = glob.sync('backend/src/helpers/slack/commands/**/*.ts');
  const violations: string[] = [];

  for (const file of handlerFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (/view\.state\.values.*study.*selected_option.*value/.test(content)) {
      if (!/assertStudyAccess|assertProjectAccess/.test(content)) {
        violations.push(file);
      }
    }
  }

  expect(violations).toEqual([]);
});
```

Note: Regex tests are a backstop, not proof of coverage. The authoritative list is the handler catalog in ADR 0023.

## Known Limitations

### 1. Channel-Sourced Membership Not Auto-Revoked

**Gap:** When a user joins a Slack channel, they're auto-added to `project_members` with `source='channel'`. When they **leave** the channel, their membership row **remains** — future checks hit the table (fast path) and never re-check Slack.

**Impact:** "Join channel = join project" works, but "leave channel = leave project" does NOT. A user who leaves the channel retains project access until manually removed.

**Mitigation:** The `source` column exists specifically for reconciliation. A periodic job can:
1. Query `project_members WHERE source='channel'`
2. Re-check each against Slack `conversations.members`
3. Delete rows where user is no longer in channel

**Status:** Documented known limitation for MVP. Reconciliation job filed as fast-follow (#195).

**Federal reviewer note:** This gap is acknowledged and tracked. The `source` column provides the mechanism for remediation. Reconciliation is a matter of scheduling, not design.

### 2. Explicit "Add Team Member" Deferred

Adding a member outside the Slack channel (e.g., external collaborator) requires an explicit "Add Team Member" action. This is not implemented for MVP.

**Workaround:** Add them to the Slack channel, or manually insert into `project_members` with `source='explicit'`.

**Status:** Fast-follow feature, not blocking MVP.

### 3. No-Channel Projects Have Limited Collaboration

**Context:** `/qori-start` defaults to creating a channel (checkbox pre-checked), but users can uncheck it. Projects created without channels have `channel_id = NULL`.

**Impact:** For no-channel projects:
- No channel-membership fallback — `isProjectMember()` only checks the table
- Only the project/study creator(s) have membership (seeded at bootstrap)
- No way to add teammates until explicit "Add Team Member" is built

**Mitigation:**
- Channel creation is **opt-out, not opt-in** — most projects have channels
- Creators seeded via bootstrap can still access their own projects
- Users can bind a channel later (future feature) or manually insert members

**Error messaging:** Commands requiring channel scope (e.g., `/qori-ask`) distinguish between "no project" and "project without channel":

```typescript
const project = await getProjectByChannelId(channelId);
if (!project) {
  // Check if user has ANY project (different error)
  const userProjects = await getProjectsByUser(userId);
  if (userProjects.length === 0) {
    return 'No projects yet. Run /qori-start to create one.';
  }
  return 'Cross-study search requires a project channel. ' +
    'Run this command from your project\'s dedicated channel, ' +
    'or use /qori-start to create a new project with a channel.';
}
```

**Status:** Acceptable edge case for MVP. Most projects have channels. Explicit member add is fast-follow.

## Consequences

### Positive

- **Collaboration enabled:** Team members can work on any study in their project
- **Slack-native:** No new UX for membership — join channel = join project
- **Fail-closed security:** Errors deny access, never bypass
- **Auditable:** `source` column tracks how each membership was granted
- **Extensible:** `role` column supports future RBAC (owner/member/viewer)

### Negative

- **Slack coupling:** Authorization depends on Slack API availability (mitigated by fail-closed + caching)
- **Stale membership:** Channel-sourced rows not auto-revoked (mitigated by reconciliation job)
- **API latency:** First access per user/project incurs Slack API call (mitigated by auto-caching)

### Neutral

- **`research_study_user_roles` remains:** The existing study-level roles table is preserved but not used for authorization. It may be useful for future fine-grained RBAC (M1 in federal matrix).

## Implementation Checklist

- [x] Migration: Create `project_members` table with 3-source bootstrap
- [x] Helper: `isProjectMember()` with fail-closed Slack fallback
- [x] Helper: `assertStudyAccess()` and `assertProjectAccess()`
- [x] Fix: Apply `assertStudyAccess()` to all 12 gap handlers (11 + planHandler)
- [x] Fix: `/qori-ask` to filter by current project only
- [x] Test: Pattern enforcement test for authorization calls
- [x] Test: Integration test verifying cross-project access denied (10-test bypass suite)
- [x] Doc: Update federal-readiness-matrix.md (C1, C2, H2 → remediated)

### Fast-Follow (Post-MVP)

- [x] **#195: Channel membership reconciliation job** — Periodic task to re-check `source='channel'` rows against Slack `conversations.members` and remove stale memberships
- [ ] Feature: Explicit "Add Team Member" action for non-channel collaborators
- [ ] Feature: "Bind channel to project" for no-channel projects

## References

- ADR 0023: Access Control Current State and Gaps
- `docs/federal-readiness-matrix.md`: C1 (authorization bypass), C2 (cross-study exposure)
- Issue #193: Project scope
- Issue #194: Authorization enforcement
