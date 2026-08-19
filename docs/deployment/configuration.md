# Deployment Configuration Contract

Every required and optional environment variable for a Qori deployment, organized by category. This is the formal contract between Qori and any hosting environment.

## Rules

1. All configuration is supplied via environment variables at runtime
2. No configuration is compiled into the container image
3. Missing **required** variables cause startup failure with actionable error messages
4. Missing **optional** variables degrade gracefully (documented per variable)
5. Secret values are never logged, even at DEBUG level

## APPLICATION

| Variable | Purpose | Required | Secret | Format | Default | Missing behavior | Owner |
|----------|---------|----------|--------|--------|---------|------------------|-------|
| `NODE_ENV` | Runtime environment | No | No | `development` \| `production` \| `test` | `development` | Defaults to development; Sentry disabled | Application |
| `PORT` | HTTP listen port | No | No | Integer | `3000` | Listens on 3000 | Infrastructure |
| `CORS_ALLOWED_ORIGIN` | Allowed CORS origin | No | No | URL | None | CORS disabled | Application |
| `JWT_SECRET_KEY` | JWT signing key | Yes (if JWT used) | Yes | Random hex string (32+ bytes) | None | JWT operations fail | Application |
| `TRUSTED_PROXY` | Express trust-proxy setting | No | No | `false` \| `true` \| hop count \| IP/CIDR | `false` (disabled) | Proxy headers not trusted — agency must explicitly configure | Infrastructure |
| `CORS_ALLOWED_ORIGINS` | Multiple CORS origins (comma-separated) | No | No | Comma-separated URLs | None | Falls back to `CORS_ALLOWED_ORIGIN` | Application |
| `API_RATE_LIMIT_WINDOW_MS` | Rate limit window in milliseconds | No | No | Integer | `60000` | 1-minute window | Application |
| `API_RATE_LIMIT_MAX` | Max requests per rate limit window | No | No | Integer | `100` | 100 requests per window | Application |

## IDENTITY PROVIDER (OIDC)

| Variable | Purpose | Required | Secret | Format | Default | Missing behavior | Owner |
|----------|---------|----------|--------|--------|---------|------------------|-------|
| `OIDC_ISSUER` | OIDC issuer URL | Yes (if OIDC) | No | URL | None | OIDC adapter disabled | Application |
| `OIDC_CLIENT_ID` | OIDC client/audience ID | Yes (if OIDC) | No | String | None | OIDC adapter disabled | Application |
| `OIDC_JWKS_URI` | OIDC JWKS endpoint URL | Yes (if OIDC) | No | URL | None | OIDC signature verification fails | Application |

## DATABASE

| Variable | Purpose | Required | Secret | Format | Default | Missing behavior | Owner |
|----------|---------|----------|--------|--------|---------|------------------|-------|
| `DB_HOST` | PostgreSQL hostname | Yes | No | Hostname/IP | None | Startup fails | Infrastructure |
| `DB_PORT` | PostgreSQL port | No | No | Integer | `5432` | Uses 5432 | Infrastructure |
| `DB_NAME` | Database name | Yes | No | String | None | Startup fails | Infrastructure |
| `DB_USER` | Database username | Yes | No | String | None | Startup fails | Infrastructure |
| `DB_PASSWORD` | Database password | Yes | Yes | String | None | Startup fails | Infrastructure |
| `DB_DIALECT` | Sequelize dialect | No | No | `postgres` | `postgres` | Uses postgres | Application |
| `DATABASE_URL` | Full connection string | No | Yes | PostgreSQL URI | None | Uses individual DB_* vars | Infrastructure |

## REDIS

| Variable | Purpose | Required | Secret | Format | Default | Missing behavior | Owner |
|----------|---------|----------|--------|--------|---------|------------------|-------|
| `REDIS_HOST` | Redis hostname | No | No | Hostname/IP | `localhost` | Queue operations no-op | Infrastructure |
| `REDIS_PORT` | Redis port | No | No | Integer | `6379` | Uses 6379 | Infrastructure |
| `REDIS_URI` | Full Redis connection string | No | No | Redis URI | None | Uses REDIS_HOST/PORT | Infrastructure |

Redis is currently non-authoritative. All Redis-backed features (RAG embedding queue) are disabled. Qori starts and operates correctly without Redis.

## SLACK

| Variable | Purpose | Required | Secret | Format | Default | Missing behavior | Owner |
|----------|---------|----------|--------|--------|---------|------------------|-------|
| `SLACK_BOT_TOKEN` | Bot user OAuth token | Yes | Yes | `xoxb-...` | None | Startup fails (Bolt init) | Infrastructure |
| `SLACK_SIGNING_SECRET` | Request verification | Yes | Yes | Hex string | None | Startup fails (Bolt init) | Infrastructure |
| `SLACK_APP_TOKEN` | Socket Mode token | Yes | Yes | `xapp-...` | None | Startup fails (Socket Mode) | Infrastructure |
| `SLACK_LOG_LEVEL` | Bolt logging verbosity | No | No | `DEBUG` \| `INFO` | `INFO` | Normal logging | Application |
| `QORI_ALERTS_CHANNEL_ID` | Channel for error alerts | No | No | Slack channel ID (`C...`) | None | Errors logged but not posted to Slack | Application |
| `RESEARCH_TEAM_CHANNEL_ID` | Research team notifications | No | No | Slack channel ID (`C...`) | None | Team notifications skipped | Application |

**Token isolation rule:** Each deployment must use Slack credentials from its own Slack app and workspace. Never share Slack credentials between environments.

## GITHUB

| Variable | Purpose | Required | Secret | Format | Default | Missing behavior | Owner |
|----------|---------|----------|--------|--------|---------|------------------|-------|
| `GITHUB_TOKEN` | GitHub API authentication | Yes | Yes | PAT or app token | None | GitHub operations fail | Infrastructure |
| `GITHUB_OWNER` | GitHub organization/user | Yes | No | String | None | GitHub operations fail | Application |
| `GITHUB_REPO` | Content repository name | Yes | No | String | None | GitHub operations fail | Application |
| `GITHUB_CONFIG_REPO` | Config repository name | No | No | String | Falls back to `GITHUB_REPO` | Single-repo mode | Application |

| `GITHUB_CONFIG_BRANCH` | Config repo branch for reads | No | No | Repository default branch | Uses default (main) | Application |

The deploying organization provides its own GitHub organization and repositories. No dependency on any specific GitHub organization.

## MODEL PROVIDER

| Variable | Purpose | Required | Secret | Format | Default | Missing behavior | Owner |
|----------|---------|----------|--------|--------|---------|------------------|-------|
| `ANTHROPIC_API_KEY` | Anthropic API authentication | Yes | Yes | `sk-ant-...` | None | Model calls fail | Infrastructure |
| `ANTHROPIC_MODEL_NAME` | Default Sonnet-tier model | No | No | Model ID string | `claude-sonnet-4-6` | Uses default | Application |
| `ANTHROPIC_TEMPERATURE` | Sampling temperature | No | No | Float 0.0–1.0 | `0.4` | Uses 0.4 | Application |
| `ANTHROPIC_MAX_TOKENS` | Maximum output tokens | No | No | Integer | `8192` | Uses 8192 | Application |
| `EXTRACTION_MODEL_NAME` | Haiku-tier model override | No | No | Model ID string | `claude-haiku-4-5-20251001` | Uses default | Application |
| `ANTHROPIC_MODEL_OPUS` | Opus-tier model override | No | No | Model ID string | `claude-opus-4-6` | Uses default | Application |

All model access goes through `modelProvider.ts`. Workflows specify logical tiers (haiku/sonnet/opus), not provider-specific identifiers. See [model-provider.md](./model-provider.md).

## OBSERVABILITY

| Variable | Purpose | Required | Secret | Format | Default | Missing behavior | Owner |
|----------|---------|----------|--------|--------|---------|------------------|-------|
| `SENTRY_DSN` | Sentry error tracking endpoint | No | No | Sentry DSN URL | None | Errors logged to stdout only | Infrastructure |
| `SENTRY_DEBUG_SCRUBBING` | Enable PII scrub debug logs | No | No | `true` \| `false` | `false` | Normal scrubbing | Application |
| `QORI_RELEASE_ID` | Release identifier for observability | No | No | String (commit SHA, semver) | None | Events untagged | Application |

Qori does not require Sentry for correct operation. Any Sentry-compatible error reporting endpoint can be used.

## BACKUP

The backup job (`operations/postgres-backup/backup.js`) is a separate run-to-completion process, not part of the main application. It uses these variables:

| Variable | Purpose | Required (for backup) | Secret | Format | Default |
|----------|---------|----------------------|--------|--------|---------|
| `DATABASE_URL` | Postgres connection for pg_dump | Yes | Yes | PostgreSQL URI | None |
| `BACKUP_S3_BUCKET` | S3-compatible storage bucket | Yes | No | Bucket name | None |
| `BACKUP_S3_REGION` | S3 region | Yes | No | Region string | None |
| `BACKUP_S3_ENDPOINT` | S3-compatible endpoint URL | Yes | No | URL | None |
| `BACKUP_S3_ACCESS_KEY_ID` | Storage access key | Yes | Yes | String | None |
| `BACKUP_S3_SECRET_ACCESS_KEY` | Storage secret key | Yes | Yes | String | None |
| `BACKUP_ENVIRONMENT` | Environment label for metadata | No | No | String | `production` |

These are only required when running the backup job. The main application does not consume backup variables. See [backup-dr.md](./backup-dr.md) for the DR contract.

## ENVIRONMENT / RELEASE

| Variable | Purpose | Required | Secret | Format | Default | Missing behavior | Owner |
|----------|---------|----------|--------|--------|---------|------------------|-------|
| `QORI_TEAM_SLUG` | Team identifier for discovery workspace | No | No | URL-safe slug | `friends-lab` | Uses default | Application |

## RAG (disabled)

These variables are only needed to re-enable the RAG pipeline. All are currently optional.

| Variable | Purpose | Required | Secret | Format | Default | Missing behavior |
|----------|---------|----------|--------|--------|---------|------------------|
| `OPENAI_API_KEY` | OpenAI API key for RAG | No | Yes | `sk-...` | None | RAG disabled |
| `SUPABASE_URL` | Supabase project URL | No | No | URL | None | RAG disabled |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | No | Yes | String | None | RAG disabled |

## SMTP (optional)

| Variable | Purpose | Required | Secret | Format | Default | Missing behavior |
|----------|---------|----------|--------|--------|---------|------------------|
| `SMTP_HOST` | SMTP server hostname | No | No | Hostname | None | Email features unavailable |
| `SMTP_PORT` | SMTP server port | No | No | Integer | `587` | Uses 587 |
| `SMTP_USER` | SMTP username | No | Yes | String | None | Email features unavailable |
| `SMTP_PASSWORD` | SMTP password | No | Yes | String | None | Email features unavailable |

## Validation

Run `npm run validate:deployment` to check configuration shape without leaking secrets or making network calls. See the deployment validator for implementation details.
