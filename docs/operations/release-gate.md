# Dev → Main Release Gate

Last updated: 2026-08-19

---

## Purpose

Main must NOT be updated unless ALL items in this checklist are true.

---

## Release Checklist

### Prerequisites

- [ ] All RR-1 Slack/template blockers resolved
- [ ] All automated tests green (`npm run typecheck && npm test`)
- [ ] All integration tests green (`npm run test:integration`)
- [ ] All migrations verified (CI migration check passes)
- [ ] Integrated manual/system test passes (see `docs/operations/integrated-release-test.md`)
- [ ] Railway dev healthy (deploy succeeded, no crash loops)
- [ ] No unresolved HIGH/BLOCKER governance issues

### Migration Gap

- [ ] Known production/dev migration gap understood and documented
- [ ] Migration files present in branch, CI migration verification passes
- [ ] Post-deploy migration count matches expected

### Backup Cron Source

**Current state:** The production backup cron (`qori-postgres-backup`) tracks dev because backup code has not yet been promoted to main.

At dev → main release:

1. [ ] Promote dev to main (merge PR)
2. [ ] Switch `qori-postgres-backup` production source from dev to main
3. [ ] Verify one scheduled or manual backup succeeds after the switch
4. [ ] Confirm backup artifact appears in expected Supabase bucket

**Do not perform the switch before the merge.** The backup implementation must exist on main before the cron tracks it.

### Post-Deploy Verification

- [ ] Railway prod deploys successfully from main
- [ ] `scripts/start.sh` runs migrations without error
- [ ] Application responds to Slack commands in prod workspace
- [ ] Sentry receives events (verify with a test error or check dashboard)
- [ ] `#qori-alerts` channel receives test notification
- [ ] Backup cron fires on schedule after source switch

---

## RR-1 Blockers (Pre-Release)

Items that must be resolved before release. Updated as the RR-1 audit progresses.

| Blocker | Description | Status |
|---------|-------------|--------|
| research_plan OUTPUT BOUNDARIES | v7.0 conformance gap — missing OUTPUT BOUNDARIES instruction | **RESOLVED** — Added in v7.2 (2026-08-04). All 9 AI tasks have OUTPUT BOUNDARIES. Regression test added. |
| Disabled RAG commands | `/civicmind ask-study`, `/ask-study`, `/civicmind ask`, `/civicmind create-template-study` return "not available" — confirm these should remain disabled or be removed from event registration | **RESOLVED** — None are registered in events.ts. Regression test added. |
| usability_issues → research_readout emit contract | research_readout expects `prioritized_issues` from usability_issues but emit may not exist in all flows | **RESOLVED** — Emit exists (schema: `prioritized_issue.yaml`), consume is `required: false`. Contract valid. Regression test added. |
| GitHub cascade size | `discovery-variables.json` can exceed GitHub Contents API limit | **RESOLVED** — GitHub write removed in PH-1/ADR 0033. Postgres is sole runtime authority. Regression test added. |

**All 4 RR-1 blockers resolved.** Regression tests in `rr1-contract-verification.test.ts` (36 tests).

**Business-logic leakage:** 0 RELEASE_BLOCKERs found (see `docs/operations/business-logic-leakage.md`). All 7 BEFORE_WORKSPACE items are acceptable for Slack-only release — extraction deferred to PLAT-3.

---

## RR-2 Reference

See `docs/operations/integrated-release-test.md` for the full integrated test plan.

---

## RR-3 Sign-Off

Release sign-off requires:

- All checklist items above checked
- Sign-off recorded in PR description with date and operator
