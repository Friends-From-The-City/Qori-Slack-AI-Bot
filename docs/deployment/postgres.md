# PostgreSQL Contract

PostgreSQL is the single canonical authority for all Qori research state. All other data stores (GitHub, Redis) are projections or caches.

## Requirements

| Requirement | Value | Notes |
|-------------|-------|-------|
| Engine | PostgreSQL | No other RDBMS is supported |
| Minimum version | 14 | Migrations use standard SQL; no version-specific features detected |
| Tested versions | 15 (docker-compose), 16 (CI) | |
| Extensions | None required | pgvector would be required if RAG is re-enabled |
| Connection | Individual params or `DATABASE_URL` | See configuration contract |
| TLS | Recommended for production | Not enforced by application; configure at infrastructure level |

## Connection Configuration

Qori connects via individual environment variables:

```
DB_HOST=your-postgres-host
DB_PORT=5432
DB_NAME=qori_production
DB_USER=qori_app
DB_PASSWORD=<secret>
DB_DIALECT=postgres
```

The Sequelize configuration (`src/config/sequelize.js`) reads these directly. No connection pooling is configured at the application level — the default Sequelize pool (min: 0, max: 5, idle: 10000ms) applies. For high-concurrency deployments, consider a connection pooler (PgBouncer) at the infrastructure level.

## Migration Execution

Migrations are Sequelize CLI migrations in `src/database/migrations/`. They run in two contexts:

1. **Startup** — `scripts/start.sh` runs `npx sequelize-cli db:migrate` before starting the application, then verifies the applied count matches the expected file count
2. **CI** — GitHub Actions runs migrations against a test database and verifies the count

Migrations are idempotent (Sequelize tracks applied migrations in the `SequelizeMeta` table). They use standard PostgreSQL DDL — no provider-specific extensions or syntax.

### Migration safety

- Migrations run as part of the deployment — code and schema deploy together
- If migration fails, the application does not start
- Migration count mismatch (applied vs. expected files) causes startup failure
- Schema validation (`scripts/validate-schema.js`) verifies model definitions match the database after migration

## Backup Responsibility

The operating organization is responsible for database backup and recovery. Qori does not include backup automation — it is infrastructure-level concern.

Recommended capabilities:

- **Point-in-time recovery (PITR)** via WAL archiving
- **Scheduled logical backups** (`pg_dump`) to an independent storage destination
- **Documented restore procedure** tested periodically

See [backup-dr.md](./backup-dr.md) for the full DR contract.

## Restore Responsibility

The operating organization must be able to restore from backup. Qori's restore validation script (`scripts/validate-restore.js`) can verify a restored database has the expected schema and migration state.

## No Provider-Specific Behavior

The current migration set was audited for Railway-specific PostgreSQL behavior:

- No Railway-specific SQL extensions
- No Railway-specific connection parameters
- No assumptions about filesystem layout
- No assumptions about backup/PITR availability
- Standard Sequelize migrations compatible with any PostgreSQL 14+ instance

## Schema Overview

Qori uses 13 Sequelize models (72 migrations as of this writing). Key tables:

- `research_studies` — study metadata
- `study_participants` — participant records (PII-scrubbed)
- `study_variables` — cascade variable store (JSONB)
- `research_plans`, `research_briefs` — planning documents
- `projects` — project containers
- `evidence_*` tables — canonical evidence lineage

The full schema is defined by the migration sequence. There is no separate schema definition file — migrations are the source of truth.
