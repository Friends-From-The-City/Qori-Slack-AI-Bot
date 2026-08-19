# Platform Completeness Audit — 2026-08-19

Pre-PLAT-3 audit of platform-level requirements that should be decided or addressed before the Channel-Independent Application API (PLAT-3) or Workspace (UX-3) implementation begins.

**Scope:** All categories from the PLAT-COMPLETENESS prompt. Findings classified as:

- **A. MUST_BEFORE_PLAT3** — blocks Application API design
- **B. MUST_BEFORE_WORKSPACE** — blocks Workspace UX implementation
- **C. MUST_BEFORE_EXTERNAL_DEMO** — blocks showing Qori to external partners
- **D. BEFORE_GOV_PRODUCTION** — required for government production but not for demo/dev
- **E. LATER** — can wait until after initial deployments

---

## HOSTING / NETWORK

| # | Item | Current state | Gap | Class |
|---|------|--------------|-----|-------|
| H-1 | DNS / hostname | Contract documented (`hostname-dns.md`, this patch) | None — documented | -- |
| H-2 | TLS | Documented as agency responsibility | None — documented | -- |
| H-3 | Reverse proxy / ingress | Contract and nginx example documented | None — documented | -- |
| H-4 | CORS | `CORS_ALLOWED_ORIGIN` env var exists, consumed by Express | Workspace will need explicit CORS when API and UI are separate origins | **B** |
| H-5 | Outbound network dependencies | Documented in `hostname-dns.md` | No `HTTPS_PROXY` / `NO_PROXY` handling in application code — only documented | **D** |
| H-6 | Proxy/firewall assumptions | Documented | `TRUSTED_PROXY` env var exists but not yet wired to `app.set('trust proxy')` in `app.js` | **A** |

### H-6 detail

`TRUSTED_PROXY` is documented in configuration.md but `app.js` does not read it. Before PLAT-3 exposes HTTP endpoints, `app.set('trust proxy', process.env.TRUSTED_PROXY || false)` must be added so `req.ip` and `req.protocol` reflect client values behind a reverse proxy.

---

## IDENTITY

| # | Item | Current state | Gap | Class |
|---|------|--------------|-----|-------|
| I-1 | OIDC boundary | Documented in `authentication.md` | Not implemented — PLAT-3 scope | **A** |
| I-2 | SAML via broker | Documented as future | No implementation needed until agency requires it | **D** |
| I-3 | Actor mapping | Canonical actor model implemented (PLAT-2, ADR 0042) | Transition in progress — `project_members` still parallel | -- |
| I-4 | Session management | No web sessions — Slack handles sessions | Web session management required for Workspace | **B** |
| I-5 | Logout / session revocation | N/A (Slack-only) | Required for Workspace | **B** |
| I-6 | MFA delegated to IdP | Slack MFA is user-managed | Documented that MFA is IdP responsibility, not Qori | -- |
| I-7 | Service-to-service identity | GitHub token, Anthropic API key — env var based | No service-to-service auth between Qori components (monolith) | **E** |

### I-1 detail

PLAT-3 introduces HTTP API endpoints accessible outside Slack. These need authentication. The OIDC adapter design (issuer, client ID, callback URL, token validation middleware) must be decided before PLAT-3 implementation. The env vars (`AUTH_CALLBACK_URL`, OIDC settings in gov env example) are documented as of this patch. Implementation is PLAT-3 scope.

---

## AUTHORIZATION

| # | Item | Current state | Gap | Class |
|---|------|--------------|-----|-------|
| Z-1 | Organization/team/project scope | Implemented (PLAT-2) | Transition — `project_members` still parallel with `project_memberships` | -- |
| Z-2 | Adapter-neutral request context | Slack user ID resolved to canonical actor via `ActorIdentity` | PLAT-3 must add OIDC subject → actor resolution | **A** |
| Z-3 | Least-privilege service operations | GitHub token has `repo` scope (broad) | Consider GitHub App installation tokens for narrower scope | **D** |
| Z-4 | Admin vs researcher boundaries | Admin center exists, project-level roles (owner/admin/researcher) | Admin actions not yet scoped to organization boundary | **B** |

---

## DATA

| # | Item | Current state | Gap | Class |
|---|------|--------------|-----|-------|
| D-1 | Canonical Postgres | Authoritative for all research state | None | -- |
| D-2 | Migrations | Sequelize CLI, CI-verified, auto-run on deploy | None | -- |
| D-3 | Tenant/org isolation | Organization model implemented (PLAT-2) | Cross-org queries not yet constrained at service layer for all models | **A** |
| D-4 | Encryption assumptions | TLS in transit documented as infra responsibility | Encryption at rest not documented as a requirement | **D** |
| D-5 | Data export portability | DSAR export exists | No general data export beyond DSAR | **C** |
| D-6 | Archival/retrieval | Records lifecycle (ADR 0040) with retention, holds, disposition | None | -- |
| D-7 | Retention/holds/disposition | Implemented and operational | None | -- |

### D-3 detail

PLAT-2 added `organization_id` to projects (now NOT NULL after backfill). But not all service queries filter by organization yet. Before PLAT-3 exposes an API, service-layer queries for studies, evidence, artifacts, and variables must include organization scope to prevent cross-tenant data leakage. This is a PLAT-3 prerequisite.

---

## AI / MODEL

| # | Item | Current state | Gap | Class |
|---|------|--------------|-----|-------|
| M-1 | Provider abstraction | `modelProvider.ts` with logical tiers (ADR 0034) | None | -- |
| M-2 | Approved model configuration | Env var controlled, tier-based | None | -- |
| M-3 | Privacy gate before model invocation | ADR 0035 (unstructured content privacy gate) | Not fully enforced — some handlers send content without privacy pipeline | **C** |
| M-4 | Deterministic compute outside model | ADR 0028 | None | -- |
| M-5 | Model request/audit metadata | Sentry captures errors; no per-request model audit log | Request-level model audit trail (which model, tokens, cost) not implemented | **D** |
| M-6 | Graceful provider failure | LangChain retries; errors surfaced to user via Slack | No fallback provider; no circuit breaker | **E** |

---

## INTEGRATIONS

| # | Item | Current state | Gap | Class |
|---|------|--------------|-----|-------|
| G-1 | Slack adapter | Operational, Socket Mode | None | -- |
| G-2 | GitHub handoff adapter | Operational | None | -- |
| G-3 | Future Jira handoff adapter | Not started | Spec only — not blocking | **E** |
| G-4 | Future Teams/agency messaging adapter | Not started | Spec only — not blocking | **E** |
| G-5 | Integration credentials per org | PLAT-2 added `RepositoryBinding` and `AdapterWorkspaceBinding` | GitHub token is still global, not per-org | **B** |

### G-5 detail

`RepositoryBinding` maps repos to orgs but the actual `GITHUB_TOKEN` is a single env var. For multi-org deployments, each organization may need its own GitHub credentials. This can be deferred to Workspace (B) since the current Slack deployment is single-org.

---

## OBSERVABILITY

| # | Item | Current state | Gap | Class |
|---|------|--------------|-----|-------|
| O-1 | Structured logs | `console.log` throughout (~285 instances) | No structured JSON logging | **C** |
| O-2 | Metrics | None | No metrics endpoint (Prometheus, StatsD, etc.) | **D** |
| O-3 | Error reporting | Sentry integration with PII scrubbing | None | -- |
| O-4 | Audit logs | NARA-compliant disposition audit logging (ADR 0025) | None for disposition; broader audit trail (login, access, admin actions) not implemented | **D** |
| O-5 | Secret/PII scrubbing | Sentry scrubber + PII scrubbing at ingestion | None | -- |
| O-6 | Health/readiness | `/health` (liveness) + `/health/ready` (readiness with DB check) | None | -- |
| O-7 | Environment/release metadata | `QORI_RELEASE_ID` env var, Sentry release tag | None | -- |

### O-1 detail

Government deployments typically require structured (JSON) logging for log aggregation (CloudWatch, ELK, Splunk). Current `console.log` works but is not parseable. Before an external demo, at minimum the HTTP request log (morgan) should output JSON in production mode. Full structured logging migration is BEFORE_GOV_PRODUCTION.

---

## OPERATIONS

| # | Item | Current state | Gap | Class |
|---|------|--------------|-----|-------|
| P-1 | Install guide | `docs/deployment/README.md` (13-step guide) | None | -- |
| P-2 | Upgrade guide | Not documented | No documented upgrade procedure (stop, migrate, start, verify) | **C** |
| P-3 | Rollback strategy | Not documented | No rollback procedure for failed deployments | **C** |
| P-4 | Migration procedure | Automated via `scripts/start.sh`, CI-verified | None | -- |
| P-5 | Backup/restore | Provider-neutral DR contract (`backup-dr.md`) | None | -- |
| P-6 | DR | ADR 0039, operational backup job | None | -- |
| P-7 | Configuration validation | `npm run validate:deployment` | None | -- |
| P-8 | Secret rotation | Documented in `secrets.md` (env var update + restart) | None | -- |
| P-9 | Dependency upgrades | No automated dependency updates | No Dependabot or equivalent | **C** |

---

## SECURITY

| # | Item | Current state | Gap | Class |
|---|------|--------------|-----|-------|
| S-1 | Dependency scanning | None | No `npm audit` in CI, no Dependabot, no Snyk | **C** |
| S-2 | Secret scanning | `.env` gitignored; secrets contract documented | No automated secret scanning (GitHub secret scanning, gitleaks) | **D** |
| S-3 | Vulnerability response | No `SECURITY.md` | Missing security policy and disclosure process | **C** |
| S-4 | Headers / CSP for Workspace | None | No security headers (CSP, X-Frame-Options, HSTS, etc.) | **B** |
| S-5 | Rate limiting / abuse controls | None | No rate limiting on any endpoint | **B** |
| S-6 | Auditability | Disposition audit logging exists | Broader access audit trail not implemented | **D** |
| S-7 | Supply-chain/build provenance | None | No SBOM, no signed builds | **D** |

### S-4 detail

Before Workspace serves HTML, security headers must be configured. This is a standard requirement. Use `helmet` or equivalent middleware. Blocks Workspace, not PLAT-3 (API-only).

### S-5 detail

Before the Application API is externally accessible, rate limiting must exist to prevent abuse. This blocks Workspace deployment and arguably PLAT-3 if the API is internet-facing. At minimum, apply rate limits to authentication endpoints and AI generation endpoints.

---

## ACCESSIBILITY

| # | Item | Current state | Gap | Class |
|---|------|--------------|-----|-------|
| A-1 | Section 508 / WCAG target | Noted as "ongoing" in roadmap | No formal target level documented (WCAG 2.1 AA is typical for federal) | **B** |
| A-2 | Keyboard navigation | N/A (Slack handles this) | Workspace will need keyboard nav | **B** |
| A-3 | Screen reader support | N/A (Slack handles this) | Workspace will need ARIA | **B** |
| A-4 | Color-independent status | N/A (Slack handles this) | Workspace will need this | **B** |
| A-5 | Accessible data visualizations | N/A | Workspace will need this | **B** |

All accessibility items are Workspace-scoped. Slack's own accessibility applies to the current deployment.

---

## PRODUCT PORTABILITY

| # | Item | Current state | Gap | Class |
|---|------|--------------|-----|-------|
| R-1 | No Railway dependency | ADR 0041 — no architectural dependency | `RAILWAY_GIT_COMMIT_SHA` still read in Sentry config as fallback | **C** |
| R-2 | No Supabase dependency | Confirmed — RAG disabled, backup uses S3-compatible | None | -- |
| R-3 | No Slack dependency | Documented as adapter | None (architecturally) | -- |
| R-4 | No Friends-specific org/repo assumptions | `QORI_TEAM_SLUG` defaults to `friends-lab` (documented, overridable) | Single hardcoded default in `discoverHandler.ts` duplicates env var default | **C** |
| R-5 | Agency branding/configuration without code fork | Not addressed | No branding configuration (logo, app name, colors) | **B** |
| R-6 | Agency-controlled data/infrastructure | Documented in ADR 0041 | None | -- |

### R-1 detail

`config/sentry.js` reads `RAILWAY_GIT_COMMIT_SHA` as a release identifier fallback. Should fall back to `QORI_RELEASE_ID` only. Trivial fix but noted.

### R-4 detail

`discoverHandler.ts:111` has `const DEFAULT_TEAM = 'friends-lab'` duplicating the env var default. Should read from `process.env.QORI_TEAM_SLUG || 'default'`.

---

## DEMO / TEST ENVIRONMENT

| # | Item | Current state | Gap | Class |
|---|------|--------------|-----|-------|
| T-1 | Deterministic synthetic research fixtures | Integration tests use factory fixtures | No standalone demo dataset | **C** |
| T-2 | No real PII in test data | Test fixtures are synthetic | None | -- |
| T-3 | Seeded study/project/evidence/findings | Not available | No demo seed script | **C** |
| T-4 | Accessibility examples | None | Workspace prerequisite | **B** |
| T-5 | Stale evidence example | Not available | Demo prerequisite | **C** |
| T-6 | DSAR example | Not available | Demo prerequisite | **C** |
| T-7 | Records hold/archive example | Not available | Demo prerequisite | **C** |
| T-8 | Future qori-ask examples | PH-9 not implemented | Later | **E** |
| T-9 | Reset/reseed procedure | Not available | Demo prerequisite | **C** |

---

## REPOSITORY PRODUCTIZATION

| # | Item | Current state | Gap | Class |
|---|------|--------------|-----|-------|
| X-1 | README | Exists at repo root | Needs update for current architecture (references may be stale) | **C** |
| X-2 | Architecture overview | `docs/internal/architecture.md` exists | None | -- |
| X-3 | Deployment docs | Comprehensive (`docs/deployment/`) | None | -- |
| X-4 | CONTRIBUTING | Exists at repo root | None | -- |
| X-5 | SECURITY | Missing | No security policy or disclosure process | **C** |
| X-6 | License status | Apache 2.0 | None | -- |
| X-7 | Changelog/releases | Missing | No CHANGELOG.md or GitHub Releases | **C** |
| X-8 | ADR organization | 42 ADRs + 6 lessons, indexed | None | -- |
| X-9 | CI/CD docs | CI pipeline exists (`.github/workflows/ci.yml`) | No CI/CD documentation beyond inline comments | **C** |
| X-10 | Environment examples | `government-environment.env.example` + `.env.example` | None | -- |
| X-11 | Stale docs cleanup | Not audited | Some docs may reference pre-PLAT-2 state | **C** |
| X-12 | Branch/release strategy | Not documented | Dev→main flow exists but not formally documented beyond release-gate.md | **C** |

---

## Summary by Classification

### A. MUST_BEFORE_PLAT3 (4 items)

| # | Item | Why |
|---|------|-----|
| H-6 | Wire `TRUSTED_PROXY` to Express | API behind reverse proxy will report wrong client IP/protocol |
| I-1 | OIDC adapter design decision | API needs authentication; cannot ship unauthenticated HTTP endpoints |
| Z-2 | OIDC subject → actor resolution | Non-Slack clients need identity resolution |
| D-3 | Organization-scoped service queries | Cross-tenant data leakage risk if API exposes unscoped queries |

### B. MUST_BEFORE_WORKSPACE (11 items)

| # | Item |
|---|------|
| H-4 | CORS configuration for separate API/UI origins |
| I-4 | Web session management |
| I-5 | Logout / session revocation |
| Z-4 | Admin actions scoped to organization |
| G-5 | Per-org GitHub credentials |
| S-4 | Security headers (CSP, HSTS, X-Frame-Options) |
| S-5 | Rate limiting on API/auth endpoints |
| R-5 | Agency branding configuration |
| A-1–A-5 | Full accessibility (Section 508 / WCAG 2.1 AA) |

### C. MUST_BEFORE_EXTERNAL_DEMO (17 items)

| # | Item |
|---|------|
| D-5 | General data export beyond DSAR |
| M-3 | Privacy gate enforcement audit |
| O-1 | Structured JSON logging |
| P-2 | Upgrade procedure documentation |
| P-3 | Rollback procedure documentation |
| P-9 | Dependabot or equivalent |
| S-1 | Dependency scanning in CI (`npm audit`) |
| S-3 | SECURITY.md |
| R-1 | Remove Railway-specific fallback in Sentry config |
| R-4 | Remove hardcoded `friends-lab` default in discoverHandler |
| T-1, T-3, T-5–T-7, T-9 | Demo seed data and reset procedure |
| X-1 | README refresh |
| X-5 | SECURITY.md |
| X-7 | CHANGELOG |
| X-9 | CI/CD documentation |
| X-11 | Stale docs cleanup |
| X-12 | Branch/release strategy documentation |

### D. BEFORE_GOV_PRODUCTION (8 items)

| # | Item |
|---|------|
| H-5 | `HTTPS_PROXY` / `NO_PROXY` application support |
| I-2 | SAML via identity broker |
| D-4 | Encryption at rest documentation |
| Z-3 | GitHub App installation tokens (narrower scope) |
| M-5 | Per-request model audit trail |
| O-2 | Metrics endpoint |
| O-4 | Broader access audit trail |
| S-2 | Automated secret scanning |
| S-6 | Broader access auditability |
| S-7 | SBOM / build provenance |

### E. LATER (4 items)

| # | Item |
|---|------|
| I-7 | Service-to-service identity |
| M-6 | Fallback provider / circuit breaker |
| G-3 | Jira handoff adapter |
| G-4 | Teams/agency messaging adapter |
| T-8 | Qori Ask demo examples |

---

## Recommendation: Can PLAT-3 Begin?

**Yes, with four prerequisites.** The four MUST_BEFORE_PLAT3 items are scoped and can be addressed as the first steps of PLAT-3 or as a small pre-PLAT-3 patch:

1. **H-6** — Wire `TRUSTED_PROXY` env var to `app.set('trust proxy')` (trivial, <10 lines)
2. **I-1** — OIDC adapter design ADR (design decision, not full implementation)
3. **Z-2** — OIDC → actor resolution design (part of I-1 ADR)
4. **D-3** — Organization scope on service queries (implementation work, but can be done incrementally as API endpoints are added)

Items 1 is a trivial code fix. Items 2–3 are design decisions that should be captured in an ADR before PLAT-3 implementation begins. Item 4 can be done endpoint-by-endpoint as PLAT-3 is built.

**PLAT-3 can begin once H-6 is fixed and the OIDC/auth ADR is written.** D-3 can be addressed incrementally during PLAT-3.
