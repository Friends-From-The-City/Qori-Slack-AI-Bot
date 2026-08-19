# Secrets Contract

Rules governing how Qori handles secrets (credentials, API keys, tokens, and other sensitive values).

## Principles

1. **Secrets are supplied externally at runtime** — via environment variables injected by the hosting platform
2. **No secrets are committed to the repository** — `.env` is gitignored; `.env.example` contains placeholders only
3. **No specific secret manager is required** — Railway Variables, HashiCorp Vault, AWS Secrets Manager, Kubernetes Secrets, Azure Key Vault, or any equivalent is supported
4. **Application code consumes values through a stable configuration boundary** — `process.env.*` reads, never direct secret manager SDK calls
5. **Logs never expose secrets** — Sentry PII scrubber redacts fields named `token`, `secret`, `api_key`, `authorization`, `password`; startup logs confirm presence without printing values
6. **Startup fails closed for required credentials** — missing required secrets cause immediate, clear failure

## Secret Inventory

| Variable | Type | Required | Current violations | Notes |
|----------|------|----------|--------------------|-------|
| `DB_PASSWORD` | Database credential | Yes | None | |
| `SLACK_BOT_TOKEN` | OAuth token | Yes | None | Workspace-scoped; must match deployment's Slack app |
| `SLACK_SIGNING_SECRET` | Request signing | Yes | None | Workspace-scoped |
| `SLACK_APP_TOKEN` | Socket Mode token | Yes | None | Workspace-scoped |
| `GITHUB_TOKEN` | API token | Yes | None | PAT or GitHub App token with `repo` scope |
| `ANTHROPIC_API_KEY` | API key | Yes | None | |
| `JWT_SECRET_KEY` | Signing key | Conditional | None | Required if JWT features are used |
| `OPENAI_API_KEY` | API key | No | None | Only for disabled RAG pipeline |
| `SUPABASE_ANON_KEY` | API key | No | None | Only for disabled RAG pipeline |
| `SMTP_PASSWORD` | Email credential | No | None | Only for optional email features |
| `DATABASE_URL` | Connection string | No | None | Contains password; alternative to individual DB_* vars |

## Current Violations

### Resolved

- **Hard-coded Supabase credentials** — removed from source but remain in git history. Repository is private; accepted risk. If repository becomes public, credentials must be rotated.

### Active

- **`QORI_TEAM_SLUG` default value `friends-lab`** — this is an organization-specific identifier embedded as a default in `.env.example` and in handler code. It is not a secret, but it is an organization-specific value that new deployments must override. **Fixed in this slice:** the default is retained for backward compatibility but documented as organization-specific. See portability section below.

## Logging Safeguards

### Startup logging

The startup sequence (`scripts/start.sh` and `events.ts`) logs credential **presence** without values:

```
Bot token present: true
App token present: true
Database: localhost:5432/qori_dev
```

### Sentry PII scrubber

`config/sentry.js` redacts these field names before sending to any external error service:

- `token`, `secret`, `api_key`, `authorization`, `password`
- Pattern-based: Slack tokens (`xoxb-*`, `xapp-*`), Bearer tokens

### Pattern enforcement

- No `console.log(process.env.*)` for secret variables in application code
- Deployment validator checks configuration shape without printing secret values

## Secret Rotation

Secrets can be rotated by updating the environment variable in the hosting platform and restarting the application. No code changes or redeployment are required.

## Portability

The secret delivery mechanism is the operating system's environment. Any platform that can set environment variables before process start is compatible:

| Platform | Mechanism |
|----------|-----------|
| Railway | Variables tab per environment |
| Docker | `--env-file`, `-e`, Docker Secrets |
| Kubernetes | Secrets mounted as env vars |
| AWS ECS | Task definition secrets (from Secrets Manager/Parameter Store) |
| Azure App Service | Application Settings |
| systemd | `EnvironmentFile=` directive |
| Bare metal | Shell export or `.env` file |
