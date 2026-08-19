# Qori Deployment Guide

This guide describes how to deploy Qori in any environment. Qori is a deployable application whose canonical research state remains under the operating organization's control. It is not architecturally dependent on any specific hosting provider.

## Prerequisites

- **PostgreSQL** 14+ (see [Postgres contract](./postgres.md))
- **Redis** (optional — see [Redis contract](./redis.md))
- **GitHub** organization and repository (see [GitHub integration](./github.md))
- **Slack** workspace with a configured app (see [Slack adapter](./adapters/slack.md))
- **Anthropic API** key (see [Model provider](./model-provider.md))
- **Node.js** 20+ LTS
- **Container runtime** (Docker or equivalent) — or bare Node.js

## Deployment Steps

### 1. Provision PostgreSQL

Provide a PostgreSQL 14+ instance. Qori uses individual connection parameters (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) or a `DATABASE_URL`. See [postgres.md](./postgres.md) for full requirements.

### 2. Provision Redis (optional)

Redis is **not required** for Qori to operate. It is currently used only by the disabled RAG embedding queue. If provided, Qori connects via `REDIS_URI` or `REDIS_HOST`/`REDIS_PORT`. See [redis.md](./redis.md).

### 3. Configure Secrets

All secrets are supplied as environment variables at runtime. No secrets are committed to the repository. See [secrets.md](./secrets.md) for the full secrets contract and [configuration.md](./configuration.md) for all environment variables.

### 4. Configure GitHub Integration

Qori uses GitHub as a document projection store (not canonical authority). Provide:
- `GITHUB_TOKEN` — a PAT or app token with `repo` scope
- `GITHUB_OWNER` — your organization name
- `GITHUB_REPO` — the content repository for studies
- `GITHUB_CONFIG_REPO` (optional) — separate repo for YAML templates

See [github.md](./github.md).

### 5. Configure Slack Adapter

Create a Slack app in your workspace with Socket Mode enabled. See [adapters/slack.md](./adapters/slack.md) for required scopes, slash commands, and manifest configuration.

### 6. Configure Model Provider

Qori uses Anthropic Claude models via the model provider boundary. Provide `ANTHROPIC_API_KEY` and optionally override model names. See [model-provider.md](./model-provider.md).

### 7. Configure Observability (optional)

Qori supports Sentry for error tracking. Provide `SENTRY_DSN` to enable. Qori operates correctly without external observability — errors are logged to stdout. See [observability.md](./observability.md).

### 8. Configure Backup Destination (optional)

Backup infrastructure is external to Qori. The operating organization is responsible for database backup and recovery. See [backup-dr.md](./backup-dr.md) for the provider-neutral DR contract.

### 9. Build and Run Qori

**Container build:**
```bash
cd backend
docker build -t qori-backend .
docker run --env-file .env -p 3000:3000 qori-backend
```

**Direct Node.js:**
```bash
cd backend
npm ci --legacy-peer-deps
npm run build
NODE_ENV=production node dist/app.js
```

The container image and the direct Node.js path both produce the same application. The startup script (`scripts/start.sh`) handles migration execution and schema validation automatically.

### 10. Apply Migrations

Migrations run automatically on startup via `scripts/start.sh`. To run manually:

```bash
cd backend
npx sequelize-cli db:migrate
```

### 11. Verify Health

```bash
curl http://localhost:3000/health
# Expected: {"message":"Server is healthy"}
```

For deeper validation, run the deployment validator:

```bash
cd backend
npm run validate:deployment
```

This checks configuration shape without making network mutations or leaking secrets.

### 12. Smoke Test

1. Open Slack in the configured workspace
2. Run `/qori-plan` — a modal should open
3. Verify the bot responds (does not time out)

## Environment Variable Reference

See [configuration.md](./configuration.md) for the complete environment variable inventory.

## Architecture

Qori follows an adapter-based architecture:

```
┌─────────────────────────────────────────────────┐
│                 Qori Application                │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Slack   │  │  GitHub  │  │   Model      │  │
│  │ Adapter  │  │ Adapter  │  │  Provider    │  │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       │              │               │          │
│  ┌────┴──────────────┴───────────────┴───────┐  │
│  │           Core Business Logic             │  │
│  │    (Handlers, Services, Templates)        │  │
│  └────────────────┬──────────────────────────┘  │
│                   │                             │
│  ┌────────────────┴──────────────────────────┐  │
│  │         PostgreSQL (canonical state)      │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
         │              │              │
    Slack API      GitHub API    Anthropic API
   (workspace)    (org/repos)     (Claude)
```

- **PostgreSQL** is the single canonical authority for all research state
- **GitHub** is a projection/handoff store for documents — not canonical
- **Slack** is a user interface adapter — not the product runtime authority
- **Model provider** is behind a governed boundary — workflows specify logical tiers, not provider specifics
- **Redis** is optional and non-authoritative
- **Observability** (Sentry) is an adapter — not required for correctness

## Related Documents

- [Configuration contract](./configuration.md) — all environment variables
- [Secrets contract](./secrets.md) — secret handling rules
- [Postgres contract](./postgres.md) — database requirements
- [Redis contract](./redis.md) — optional cache/queue
- [GitHub integration](./github.md) — document projection store
- [Slack adapter](./adapters/slack.md) — Slack app requirements
- [Model provider](./model-provider.md) — AI model boundary
- [Observability](./observability.md) — error tracking and logging
- [Backup/DR](./backup-dr.md) — disaster recovery contract
- [Authentication boundary](./authentication.md) — current and future auth architecture
- [Government environment example](./examples/government-environment.env.example) — sample non-secret deployment profile
