# Qori Slack

Qori is an AI-powered research operations platform for government UX research teams. Researchers interact through Slack slash commands (`/qori-plan`, `/qori-analyze`, `/qori-synthesis`) which open Block Kit modals, collect input, run chained LLM tasks defined in YAML configs, and store generated documents in GitHub repositories. The variable cascade architecture lets each research artifact (brief, plan, session summary, synthesis) emit typed variables that downstream artifacts consume — creating a traceable chain from raw research through final readouts.

This repo is the Slack surface of Qori. The web surface lives at `Friends-Innovation-Lab/qori` (separate repo).

## Tech stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict mode, migrated from JS in 2026 Q2) |
| Runtime | Node.js 20 |
| Slack | Bolt 4.x (socket mode) |
| Database | PostgreSQL via Sequelize v6 (13 typed models) |
| Queue | Redis / BullMQ |
| AI | Claude via LangChain (`@langchain/anthropic`) |
| Artifact storage | GitHub via Octokit |
| CI | GitHub Actions (typecheck + unit tests + integration tests) |

## Prerequisites

- Node.js 20+
- PostgreSQL (local Homebrew or Docker)
- Redis (for job queue; optional for development)
- Slack app configured with socket mode (see `.env.example`)
- GitHub personal access token with repo scope

## Getting started

```bash
cd backend
cp .env.example .env        # Fill in Slack tokens, GitHub token, DB credentials, Anthropic API key
npm install
npm run db:migrate           # Run all 33 Sequelize migrations
npm run dev                  # Dev server with nodemon (port 3000)
```

For Docker (all services):
```bash
cd backend
docker-compose up            # Starts app (3000), postgres (5432), redis (6379)
```

## Running tests

```bash
cd backend
npm test                     # 76 unit tests (parsers, type verification, template tests)
npm run test:integration     # 34 integration tests against real Postgres
npm run typecheck            # TypeScript strict mode check
```

Integration tests require a PostgreSQL database named `qori_test`:

**Local Homebrew Postgres (no Docker needed):**
```bash
brew services start postgresql@18
createdb qori_test
npm run test:integration
```

**Docker:**
```bash
docker compose -f docker-compose.test.yml up -d
TEST_DB_PORT=5433 TEST_DB_USER=qori_test TEST_DB_PASSWORD=test npm run test:integration
```

## Architecture documentation

- **[Architecture Decision Records](docs/architecture-decisions/README.md)** — 15 ADRs documenting significant design choices (cascade contracts, template architecture, Sequelize TypeScript pattern, Bolt native types)
- **[TypeScript migration plan](docs/typescript-migration-plan.md)** — 7-phase migration from JavaScript, completed 2026-05-18
- **[Migration retrospective](docs/migration-retrospective.md)** — What worked, what was hard, cumulative findings
- **[Architecture audit](docs/audits/2026-Q2-audit-post-migration.md)** — Post-migration audit with section ratings and findings
- **[Quarterly audit checklist](docs/audits/quarterly-architecture-audit.md)** — Recurring discipline document for drift detection
- **[Template standards](docs/qori-template-standards.md)** — Design language and YAML conventions
- **[v1.1 followups](docs/v1.1-followups.md)** — Deferred improvements with effort estimates

## Deployment

The team's instance runs on **Railway** with Postgres and Redis as managed services. Push to `main` triggers auto-deploy via Dockerfile.

For government customer deployments (GOTS), the architecture supports on-premises deployment with standard Node.js + PostgreSQL infrastructure. See `docs/internal/deployment.md` for Railway-specific configuration and the federal go-to-market playbook for customer deployment guidance.

## Key directories

```
backend/src/
  helpers/slack/commands/    # ~30 handler files (Bolt native types)
  helpers/slack/ui/          # Modal builders (Block Kit)
  helpers/slack/events.ts    # Registration manifest (zero as-any casts)
  services/                  # Sequelize service layer (typed model returns)
  database/models/           # 13 Sequelize models (InferAttributes pattern)
  types/                     # Shared types (cascade, models, handlers)
  utils/                     # Parsers, calculators
  __tests__/                 # Unit tests
  __tests__/integration/     # E2E tests against real Postgres
config/prompts/              # 27 YAML workflow configs (runtime source of truth)
config/templates/            # Study folder scaffold
docs/architecture-decisions/ # ADRs
docs/audits/                 # Architecture audit reports
```

## License

MIT

## Maintained by

Built by [Friends Innovation Lab](https://www.friendsfromthecity.com)
