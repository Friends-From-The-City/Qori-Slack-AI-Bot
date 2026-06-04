# Federal Readiness Gap Matrix

**Target Framework:** NIST 800-53 Moderate Baseline (FedRAMP Moderate)
**Audit Date:** 2026-06-03
**Status:** Gap analysis complete — scoping document for remediation workstream

This matrix maps NIST 800-53 control families to Qori's current state, identifies gaps, and scopes remediation. It serves as both a build roadmap and federal reviewer evidence package.

---

## Control Family Coverage

| Family | Included | Rationale |
|--------|----------|-----------|
| AC (Access Control) | Yes | Core authorization model |
| AU (Audit & Accountability) | Yes | Logging, audit trails |
| IA (Identification & Authentication) | Yes | Slack OAuth, session management |
| SC (System & Communications Protection) | Yes | Encryption, network security |
| SI (System & Information Integrity) | Yes | Input validation, error handling |
| CM (Configuration Management) | Yes | Change control, CI/CD, baselines |
| CP (Contingency Planning) | Yes | Backup, recovery |
| IR (Incident Response) | Yes | Alerting, response procedures |
| RA (Risk Assessment) | Yes | Security audits, vulnerability management |
| CA (Security Assessment) | Yes | Testing, continuous monitoring |
| MP (Media Protection) | Yes | Data handling, sanitization |
| PT (Privacy) | Yes | PII handling, consent, retention |
| PE (Physical & Environmental) | **No** | SaaS hosted on Railway — physical security is provider responsibility |
| PS (Personnel Security) | **No** | Organizational control — outside codebase scope |
| AT (Awareness & Training) | **No** | Organizational control — outside codebase scope |
| PL (Planning) | **No** | Documentation control — covered by ADRs |
| SA (System & Services Acquisition) | **No** | Procurement control — outside codebase scope |
| MA (Maintenance) | **No** | Physical maintenance — SaaS not applicable |

---

## Gap Matrix

### AC — Access Control

| Requirement | Current State | Gap | Severity | Maps To | Remediation |
|-------------|---------------|-----|----------|---------|-------------|
| **AC-2: Account Management** | Slack workspace membership controls user access. No application-level account management. | No user provisioning/deprovisioning in Qori — relies on Slack workspace admin | LOW | — | Document: Slack workspace admin is account authority |
| **AC-3: Access Enforcement** | ✅ **REMEDIATED (2026-06-04).** All 11 gap handlers now call `assertStudyAccess` or `assertProjectAccess` before any study/project operation. Authorization service uses project-level membership with fail-closed semantics. | — | — | ADR 0024 | None (remediated) |
| **AC-4: Information Flow Enforcement** | ✅ **REMEDIATED (2026-06-04).** `/qori-ask` now scopes search to current project only (channel-bound). Cross-study queries require project membership. | — | — | ADR 0024 | None (remediated) |
| **AC-5: Separation of Duties** | No role separation. Everyone is a peer with ownership-only distinction. `ResearchStudyUserRole` table exists but never enforced. | No researcher vs stakeholder vs observer enforcement | MEDIUM | NEW | Defer to RBAC workstream (lower priority than enforcement fixes) |
| **AC-6: Least Privilege** | All workspace users can create projects/studies. No approval workflow. | Open creation may be acceptable (researcher autonomy) or may need gating | LOW | — | Document design decision; add approval if VA requires |
| **AC-17: Remote Access** | Slack OAuth for all access. Socket mode connection. | Adequate for SaaS model | — | — | None |

**Evidence files:**
- `docs/architecture-decisions/0024-project-level-authorization-model.md` (decision + security contract)
- `backend/src/services/authorization.service.ts` (fail-closed implementation)
- `backend/src/__tests__/integration/authorization-bypass.test.ts` (decisive proof: 10 tests)
- `backend/src/database/migrations/20260604000000-create-project-members.js` (3-source bootstrap)

---

### AU — Audit and Accountability

| Requirement | Current State | Gap | Severity | Maps To | Remediation |
|-------------|---------------|-----|----------|---------|-------------|
| **AU-2: Audit Events** | Sentry captures errors. #qori-alerts posts error notifications. `created_by`, `created_at`, `updated_at` on models. | No dedicated audit log table. No record of who accessed what, only who created. | HIGH | #192 (partial) | Create `activity_log` table: user, action, resource_type, resource_id, timestamp |
| **AU-3: Content of Audit Records** | Model timestamps + `created_by` fields. Sentry events include user, command, timestamp. | Missing: action type, before/after values, IP address, session context | MEDIUM | NEW | Extend audit logging to capture action details |
| **AU-6: Audit Review** | #qori-alerts for real-time error visibility. Sentry dashboard for historical. | No scheduled audit review process documented | LOW | — | Document quarterly audit review procedure |
| **AU-9: Protection of Audit Information** | Sentry is external SaaS (protected by Sentry). Database logs in Railway. | Audit records not separated from application data; admin can delete | MEDIUM | NEW | Consider write-only audit log or external log aggregator |
| **AU-11: Audit Record Retention** | Sentry: 90 days (free tier). Database: indefinite. Console: Railway default (7-30 days). | No documented retention policy | MEDIUM | NEW | Document retention; configure Sentry plan if needed |
| **AU-12: Audit Generation** | Automatic via Sentry + model timestamps | Per-action audit generation missing | HIGH | NEW | Add audit middleware to log all study-access operations |

**Evidence files:**
- `backend/src/config/sentry.js` (error capture + PII scrubbing)
- `backend/src/helpers/slack/events.ts:113-164` (#qori-alerts posting)
- Database models with `created_by`, `created_at`, `updated_at` fields

**Strength:** PII scrubbing in Sentry is comprehensive — two-phase collection + redaction, fail-safe drop on error.

---

### IA — Identification and Authentication

| Requirement | Current State | Gap | Severity | Maps To | Remediation |
|-------------|---------------|-----|----------|---------|-------------|
| **IA-2: Identification & Authentication** | Slack OAuth handles all authentication. User identity from `body.user.id` (Slack-verified). Bolt validates request signatures. | No application-layer authentication | — | — | Document: Slack is authentication authority |
| **IA-4: Identifier Management** | Slack user IDs are system identifiers. Participant codes (PT-001) per ADR 0020. | Adequate | — | — | None |
| **IA-5: Authenticator Management** | Slack manages user credentials. App tokens in Railway env vars. JWT for legacy auth (unused). | Legacy `User.password` field exists (bcrypt hashed) but unused | LOW | — | Consider removing legacy auth code |
| **IA-8: Identification of Non-Org Users** | N/A — all users are Slack workspace members | — | — | — | None |

**Evidence files:**
- `backend/src/helpers/slack/events.ts` (Bolt request validation)
- `backend/src/database/models/user.model.ts:121` (bcrypt hashing, unused)

**Strength:** Slack OAuth is a robust authentication mechanism. No custom auth to maintain.

---

### SC — System and Communications Protection

| Requirement | Current State | Gap | Severity | Maps To | Remediation |
|-------------|---------------|-----|----------|---------|-------------|
| **SC-8: Transmission Confidentiality** | Third-party APIs (Slack, GitHub, Anthropic) use HTTPS. App serves HTTP; Railway provides HTTPS ingress. | App-layer HTTPS not verified; relies on Railway | **UNKNOWN** | NEW | Verify Railway HTTPS config; document |
| **SC-12: Cryptographic Key Management** | Secrets in Railway env vars. JWT signed with `JWT_SECRET_KEY`. GitHub webhook HMAC-SHA256. | No key rotation automation. Hardcoded fallback: `GITHUB_WEBHOOK_SECRET || 'Qori AI'` | HIGH | NEW | Remove hardcoded fallback; add rotation procedure |
| **SC-13: Cryptographic Protection** | bcrypt for passwords (unused). HMAC-SHA256 for webhooks. | No application-layer encryption for data at rest | MEDIUM | NEW | Evaluate column-level encryption for PII fields |
| **SC-28: Protection of Information at Rest** | Postgres encryption: **UNKNOWN** (Railway infrastructure). No app-level encryption. Participant data stored plaintext. | Database encryption status unverified | **UNKNOWN** | NEW | Verify Railway Postgres encryption; document |

**Evidence files:**
- `backend/src/services/github-webhook.service.ts:37,48` (HMAC + timingSafeEqual)
- `backend/src/controllers/github-webhook.controller.js:5` (hardcoded fallback — **risk**)
- `.env.example` (secrets documented)

**Risk:** `GITHUB_WEBHOOK_SECRET || 'Qori AI'` hardcoded fallback is a security vulnerability.

---

### SI — System and Information Integrity

| Requirement | Current State | Gap | Severity | Maps To | Remediation |
|-------------|---------------|-----|----------|---------|-------------|
| **SI-2: Flaw Remediation** | CI runs on every PR. Pattern enforcement tests catch regressions. | No automated vulnerability scanning (npm audit, Snyk, Dependabot) | MEDIUM | NEW | Add `npm audit` to CI; consider Dependabot |
| **SI-3: Malicious Code Protection** | N/A — server-side Node.js, no user-executable code | — | — | — | None |
| **SI-4: Information System Monitoring** | Sentry for errors. #qori-alerts for ops. | No performance monitoring. No anomaly detection. | LOW | — | Deferred per production-readiness-gaps.md |
| **SI-10: Information Input Validation** | Sequelize parameterized queries (SQL injection protected). Budget/participant parsing with regex validation. | **No schema validation library** (Zod/Joi). No input length limits. No rate limiting. | HIGH | NEW | Add Zod schemas for modal inputs; implement rate limiting |
| **SI-11: Error Handling** | Errors caught, logged to Sentry (PII-scrubbed), user gets generic DM. | Error responses don't leak stack traces | — | — | None (adequate) |

**Evidence files:**
- `backend/src/__tests__/integration/pattern-enforcement.test.ts` (10+ architectural assertions)
- `backend/src/utils/budgetParser.ts` (input validation example)
- `backend/src/config/sentry.js` (PII scrubbing)

**Strength:** Sequelize ORM prevents SQL injection. Sentry PII scrubbing is comprehensive.

---

### CM — Configuration Management

| Requirement | Current State | Gap | Severity | Maps To | Remediation |
|-------------|---------------|-----|----------|---------|-------------|
| **CM-2: Baseline Configuration** | TypeScript strict mode. ESLint airbnb-base. `any` budget (max 215). Pattern enforcement tests. | Documented in CLAUDE.md and ADRs | — | — | None (adequate) |
| **CM-3: Configuration Change Control** | 23 ADRs + 6 lessons-from-failure. Quarterly architecture audit. PR required for main. | Strong change control discipline | — | — | None |
| **CM-4: Security Impact Analysis** | ADRs document alternatives considered and consequences | Adequate | — | — | None |
| **CM-6: Configuration Settings** | `.env.example` with 140+ documented variables. Docker health checks. | Adequate | — | — | None |
| **CM-7: Least Functionality** | RAG disabled for alpha. ChromaDB identified as dead dependency. Test commands removed. Old folders deleted. | ChromaDB still in package.json (unused) | LOW | — | Remove ChromaDB from dependencies |
| **CM-8: Information System Component Inventory** | package.json + package-lock.json. 47 prod, 28 dev dependencies. | No SBOM (Software Bill of Materials) generated | LOW | NEW | Consider SBOM generation for federal compliance |

**Evidence files:**
- `docs/architecture-decisions/README.md` (ADR index)
- `.github/workflows/ci.yml` (CI pipeline)
- `backend/src/__tests__/integration/pattern-enforcement.test.ts`

**Strength:** ADR discipline is federal-reviewer-ready. Change control is well-documented.

---

### CP — Contingency Planning

| Requirement | Current State | Gap | Severity | Maps To | Remediation |
|-------------|---------------|-----|----------|---------|-------------|
| **CP-9: Information System Backup** | Postgres: Railway-managed (policy **UNKNOWN**). Redis: AOF enabled locally. GitHub: implicit backup for documents. | **No explicit backup scripts.** Railway backup policy undocumented. | **UNKNOWN** | NEW | Verify Railway backup policy; document RTO/RPO |
| **CP-10: Information System Recovery** | Deployment guide has config rollback. Database/data recovery **not documented**. | No disaster recovery runbook | HIGH | NEW | Create DR runbook: Postgres restore, Redis recovery, GitHub as source of truth |
| **CP-2: Contingency Plan** | None documented | No formal contingency plan | MEDIUM | NEW | Document contingency procedures |
| **CP-4: Contingency Plan Testing** | None | Backups never tested | HIGH | NEW | Schedule quarterly backup restore tests |

**Evidence files:**
- `docker-compose.yml:87` (Redis AOF)
- `docs/internal/deployment.md` (rollback procedures, incomplete)

**Risk:** Backup policy entirely dependent on Railway infrastructure with no verification.

---

### IR — Incident Response

| Requirement | Current State | Gap | Severity | Maps To | Remediation |
|-------------|---------------|-----|----------|---------|-------------|
| **IR-1: Incident Response Policy** | Deployment guide has 5-step outline (identify, contain, notify, remediate, post-mortem) | Outline only, not a runbook | MEDIUM | NEW | Expand to full runbook with contacts, escalation |
| **IR-4: Incident Handling** | Sentry + #qori-alerts for detection. User DM for notification. | No severity classification. No SLA. No on-call rotation. | HIGH | NEW | Define severity levels, response SLAs, on-call schedule |
| **IR-5: Incident Monitoring** | Real-time: #qori-alerts, Sentry | No dashboard. No metrics. | MEDIUM | — | Consider monitoring dashboard (Grafana, Railway metrics) |
| **IR-6: Incident Reporting** | Post to #qori-alerts | No formal incident report template | LOW | NEW | Create incident report template |
| **IR-8: Incident Response Plan** | Partial (deployment.md) | Security incident runbook missing | HIGH | NEW | Create security incident runbook (breach, token leak, unauthorized access) |

**Evidence files:**
- `backend/src/helpers/slack/events.ts:113-164` (#qori-alerts)
- `docs/internal/deployment.md:263-270` (incident outline)
- `docs/production-readiness-gaps.md` (GAP-001 resolved)

**Strength:** Sentry + #qori-alerts provides real-time ops visibility with PII scrubbing.

---

### RA/CA — Risk Assessment / Security Assessment

| Requirement | Current State | Gap | Severity | Maps To | Remediation |
|-------------|---------------|-----|----------|---------|-------------|
| **RA-3: Risk Assessment** | ADR 0023 documents access control gaps. This matrix is a risk assessment. | No formal risk register | MEDIUM | NEW | Create risk register from this matrix |
| **RA-5: Vulnerability Scanning** | None automated. Manual audits (this session). | No npm audit, Snyk, or Dependabot | MEDIUM | NEW | Add automated vulnerability scanning to CI |
| **CA-2: Security Assessments** | Pattern enforcement tests (10+ assertions). Integration tests (34). | Tests are functional, not security-focused | LOW | NEW | Consider security-focused test suite |
| **CA-7: Continuous Monitoring** | Sentry for errors. No performance/security metrics. | Limited to error monitoring | MEDIUM | — | Deferred per production-readiness-gaps.md |

**Evidence files:**
- `docs/architecture-decisions/0023-access-control-current-state-and-gaps.md`
- `docs/audits/quarterly-architecture-audit.md`

**Strength:** Quarterly architecture audit discipline catches drift.

---

### MP — Media Protection

| Requirement | Current State | Gap | Severity | Maps To | Remediation |
|-------------|---------------|-----|----------|---------|-------------|
| **MP-2: Media Access** | Database access via connection string (Railway secrets). GitHub via token. | Adequate for cloud SaaS | — | — | None |
| **MP-6: Media Sanitization** | Cascade delete on study removal (Postgres). GitHub documents remain unless manually deleted. | **No GitHub cleanup on study delete.** No soft delete. | MEDIUM | #192 (partial) | Consider GitHub folder deletion on study delete; add audit log |
| **MP-7: Media Use** | N/A — no removable media | — | — | — | None |

**Evidence files:**
- Sequelize models with `onDelete: 'CASCADE'`
- `backend/src/helpers/slack/commands/study/deleteStudyHandler.ts` (GitHub deletion)

---

### PT — Privacy

| Requirement | Current State | Gap | Severity | Maps To | Remediation |
|-------------|---------------|-----|----------|---------|-------------|
| **PT-1: Privacy Policy** | CLAUDE.md documents privacy-first principle. PII scrubbing implemented. | No formal privacy policy document | LOW | NEW | Document privacy policy for federal review |
| **PT-2: Authority to Collect** | Assumes researcher handles IRB/consent externally | No consent tracking in Qori | MEDIUM | NEW | Document assumption; consider consent checkbox |
| **PT-3: Purpose Specification** | Study-scoped data. Research purpose implicit. | No explicit purpose tagging on data | LOW | — | Document: all data is for research purposes |
| **PT-4: Data Minimization** | System-assigned participant codes (PT-001) per ADR 0020. **BUT:** `contact_details`, `participant_name` still stored. | Zero-PII architecture planned but not executed | HIGH | pii-handling-architecture workstream | Complete PII audit; remove contact_details from participant model |
| **PT-5: Use Limitation** | Data used for research analysis only. | No technical enforcement of use limits | LOW | — | Document acceptable use |
| **PT-6: Data Quality** | No data validation beyond basic parsing | Limited | LOW | — | Consider data quality checks |
| **PT-7: Individual Participation** | No data subject access mechanism. No export. No deletion on request. | **No DSAR handling** | HIGH | NEW | Implement participant data export/deletion endpoints |
| **PT-8: Data Retention** | Data retained indefinitely. No archival policy. | **No retention policy** | HIGH | NEW | Define retention limits; implement archival/deletion |

**Evidence files:**
- `backend/src/database/models/study_participant.ts` (PII fields)
- `backend/src/config/sentry.js` (PII scrubbing)
- `docs/workstreams/pii-handling-architecture.md` (planned, not executed)
- `docs/architecture-decisions/0020-system-assigned-participant-codes.md`

**Strength:** Participant code system (ADR 0020) is privacy-preserving design. Sentry PII scrubbing is comprehensive.

**Critical finding:** Transcripts with participant names sent to Claude API. LLM instructed to redact post-hoc, but raw PII is processed.

---

## Summary by Severity

### CRITICAL (Must fix before federal deployment)

| ID | Issue | Family | Status |
|----|-------|--------|--------|
| C1 | ~~Authorization bypass — 7+ handlers trust UI filtering, not DB-layer enforcement~~ | AC-3 | ✅ REMEDIATED (2026-06-04) — ADR 0024, authorization.service.ts |
| C2 | ~~Cross-study data exposure — `/qori-ask` queries all studies without ownership filter~~ | AC-4 | ✅ REMEDIATED (2026-06-04) — project-scoped search |

### HIGH (Should fix before federal deployment)

| ID | Issue | Family | Maps To |
|----|-------|--------|---------|
| H1 | No audit log table — only `created_by` tracked, not access/actions | AU-2 | NEW |
| H2 | ~~Hardcoded webhook secret fallback (`'Qori AI'`)~~ | SC-12 | ✅ REMEDIATED (2026-06-04) — startup validation added |
| H3 | No input schema validation (Zod/Joi), no rate limiting | SI-10 | NEW |
| H4 | No disaster recovery runbook, backup policy UNKNOWN | CP-10 | NEW |
| H5 | No security incident runbook, no on-call rotation | IR-4, IR-8 | NEW |
| H6 | Participant PII (contact_details, name) still stored against zero-PII design | PT-4 | workstream |
| H7 | No data subject access mechanism (export/delete) | PT-7 | NEW |
| H8 | No data retention policy | PT-8 | NEW |
| H9 | Transcript PII sent to Claude API without pre-redaction | PT-4 | NEW |

### UNKNOWN (Requires infrastructure verification)

| ID | Issue | Family | Maps To |
|----|-------|--------|---------|
| U1 | Database encryption at rest — Railway Postgres config unverified | SC-28 | NEW |
| U2 | HTTPS enforcement — Railway ingress config unverified | SC-8 | NEW |
| U3 | Backup policy — Railway backup retention/RTO/RPO unverified | CP-9 | NEW |

### MEDIUM

| ID | Issue | Family | Maps To |
|----|-------|--------|---------|
| M1 | No role separation (researcher vs stakeholder vs observer) | AC-5 | NEW (defer) |
| M2 | Audit records not protected from admin deletion | AU-9 | NEW |
| M3 | No automated vulnerability scanning (npm audit, Dependabot) | RA-5 | NEW |
| M4 | GitHub documents not deleted on study delete | MP-6 | #192 |
| M5 | No consent tracking mechanism | PT-2 | NEW |

### LOW (Polish / Documentation)

| ID | Issue | Family | Maps To |
|----|-------|--------|---------|
| L1 | ChromaDB dead dependency still in package.json | CM-7 | — |
| L2 | No SBOM generation | CM-8 | NEW |
| L3 | Legacy auth code (`User.password`) unused | IA-5 | — |
| L4 | No formal incident report template | IR-6 | NEW |

---

## Remediation Workstreams

Based on this gap analysis, remediation groups into coordinated workstreams:

### Workstream 1: Data Isolation & Access Control (CRITICAL) — PHASE 1 COMPLETE ✅
**Issues:** ~~C1~~, ~~C2~~, H1, M1
**Status:** Authorization enforcement complete (2026-06-04). Audit logging (H1) and RBAC (M1) remain.
**Dependencies:** None
**Effort:** ~~Large~~ Remaining: Medium (audit table, RBAC)

- ✅ Apply `assertStudyAccess`/`assertProjectAccess` to all handlers (ADR 0024)
- ✅ Fix `/qori-ask` to scope search to current project only
- ✅ Add authorization bypass test (10 tests, decisive proof)
- ⬜ Create `activity_log` table for audit trail
- ⬜ Defer RBAC (M1) until enforcement is solid

**Related issues:** #194, #193
**Evidence:** `authorization-bypass.test.ts` passes, pattern-enforcement.test.ts includes auth import checks

### Workstream 2: Privacy & PII (HIGH)
**Issues:** H6, H7, H8, H9, M5
**Scope:** Complete zero-PII architecture, add DSAR handling
**Dependencies:** Workstream 1 (authorization must be fixed first)
**Effort:** Medium

- Complete `pii-handling-architecture` workstream audit
- Remove `contact_details` from participant model
- Pre-redact transcripts before Claude API call
- Implement participant data export/deletion
- Define and document retention policy
- Document consent model (researcher responsibility)

**Related:** `docs/workstreams/pii-handling-architecture.md`

### Workstream 3: Infrastructure Verification (UNKNOWN)
**Issues:** U1, U2, U3
**Scope:** Verify Railway configuration, document findings
**Dependencies:** None (can run in parallel)
**Effort:** Small (investigation + documentation)

- Contact Railway support for Postgres encryption details
- Verify HTTPS ingress configuration
- Document backup retention policy and RTO/RPO
- Add SSL config to Sequelize if needed

### Workstream 4: Security Hardening (HIGH)
**Issues:** H2, H3, M3
**Scope:** Fix vulnerabilities, add scanning
**Dependencies:** None
**Effort:** Medium

- Remove hardcoded `'Qori AI'` webhook secret fallback
- Add Zod schemas for modal input validation
- Implement rate limiting middleware
- Add `npm audit` to CI pipeline
- Consider Dependabot for dependency updates

### Workstream 5: Incident Response & DR (HIGH)
**Issues:** H4, H5, M4
**Scope:** Create runbooks, test backups
**Dependencies:** Workstream 3 (need infrastructure info first)
**Effort:** Medium (documentation + process)

- Create security incident runbook
- Define on-call rotation and escalation
- Create disaster recovery runbook
- Add GitHub folder deletion to study delete
- Schedule quarterly backup restore tests

---

## Strengths to Highlight for Federal Reviewers

| Strength | Evidence | Control Family |
|----------|----------|----------------|
| **Slack OAuth authentication** | All access via Slack; Bolt validates signatures | IA-2 |
| **PII scrubbing in error logs** | Two-phase Sentry scrubbing with fail-safe | AU-9, PT-4 |
| **ADR discipline** | 23 ADRs + 6 lessons; quarterly audit | CM-3, RA-3 |
| **System-assigned participant codes** | ADR 0020; PT-001 instead of real names | PT-4 |
| **Cascade delete** | Study deletion cascades to all child data | MP-6 |
| **Pattern enforcement tests** | 10+ architectural assertions in CI | CM-2, SI-2 |
| **Dead code removal** | RAG disabled, ChromaDB identified, beta-test deleted | CM-7 |
| **Ownership enforcement (partial)** | `/qori-delete` validates `created_by` at DB layer | AC-3 |

---

## Next Steps

1. **File this matrix** as the scoping document
2. **Create issue for each NEW workstream** with linked issues from this matrix
3. **Prioritize Workstream 1** (Critical) — authorization fixes are prerequisite for everything else
4. **Run Workstream 3 in parallel** — infrastructure verification is low-effort, high-value
5. **Schedule Workstreams 2, 4, 5** after Workstream 1 completes

---

## Document History

| Date | Author | Change |
|------|--------|--------|
| 2026-06-03 | Claude Code audit | Initial gap analysis |
| 2026-06-04 | Claude Code | Workstream 1 Phase 1 complete: C1, C2 remediated (authorization enforcement), H2 remediated (webhook secret). ADR 0024 published. 10-test bypass suite passes. |
