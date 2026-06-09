# Dev Environment Setup

This document describes how to set up a proper development environment for Qori, with complete isolation from production.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        PRODUCTION                                │
│  Railway: main branch auto-deploy                                │
│  Slack App: "Qori" in research team workspace                   │
│  Database: Railway Postgres (prod)                               │
│  URL: qori-slack-production.up.railway.app                      │
└─────────────────────────────────────────────────────────────────┘
         ▲
         │ merge to main (human gate)
         │
┌─────────────────────────────────────────────────────────────────┐
│                        DEVELOPMENT                               │
│  Railway: dev branch auto-deploy                                 │
│  Slack App: "Qori Dev" in dev/test workspace                    │
│  Database: Railway Postgres (dev) OR local Docker               │
│  URL: qori-slack-dev.up.railway.app OR localhost:3000           │
└─────────────────────────────────────────────────────────────────┘
         ▲
         │ push to dev branch
         │
┌─────────────────────────────────────────────────────────────────┐
│                     LOCAL DEVELOPMENT                            │
│  feature/* branches                                              │
│  Local Docker: Postgres + Redis                                  │
│  ngrok: exposes localhost to Slack                              │
│  Slack App: "Qori Dev" (same as Railway dev)                    │
└─────────────────────────────────────────────────────────────────┘
```

## Why This Setup?

The 2-day outage (June 2026) traced to three problems:

1. **No dev environment** — local dev pointed at prod DB
2. **Two Slack apps in one workspace** — ambiguous command routing
3. **Code/migration separation** — code deployed without migrations

This setup fixes all three:
- Separate Railway dev environment with its own DB
- Separate dev Slack app in a separate workspace
- Migrations run automatically on every deploy

---

## Step 1: Create Dev Slack App (One-time)

### 1.1 Create the app

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. App Name: `Qori Dev`
4. Workspace: Select your **dev/test workspace** (NOT the research team workspace)

### 1.2 Configure Socket Mode

1. Settings → Socket Mode → Enable
2. Create an App-Level Token:
   - Name: `socket-mode`
   - Scopes: `connections:write`
3. Copy the token (starts with `xapp-1-`)

### 1.3 Configure Bot Token Scopes

OAuth & Permissions → Bot Token Scopes:
- `app_mentions:read`
- `channels:history`
- `channels:read`
- `chat:write`
- `commands`
- `files:read`
- `groups:history`
- `groups:read` (critical for private channels)
- `im:history`
- `im:read`
- `im:write`
- `mpim:history`
- `mpim:read`
- `reactions:read`
- `reactions:write`
- `users:read`
- `users:read.email`

### 1.4 Create Slash Commands

Slash Commands → Create New Command for each:
- `/qori-plan`
- `/qori-brief`
- `/qori-discover`
- `/qori-analyze`
- `/qori-readout`
- `/qori-guide`
- `/qori-help`
- `/qori-admin`

For Socket Mode apps, Request URL is not needed.

### 1.5 Enable Events

Event Subscriptions → Enable Events
Subscribe to bot events:
- `app_mention`
- `message.channels`
- `message.groups`
- `message.im`

### 1.6 Enable Interactivity

Interactivity & Shortcuts → Enable
(Request URL not needed for Socket Mode)

### 1.7 Install to Workspace

OAuth & Permissions → Install to Workspace
Copy the Bot Token (starts with `xoxb-`)

### 1.8 Copy All Tokens

You now have three values:
- `SLACK_BOT_TOKEN` (xoxb-...)
- `SLACK_SIGNING_SECRET` (from Basic Information page)
- `SLACK_APP_TOKEN` (xapp-1-...)

---

## Step 2: Create Railway Dev Environment (One-time)

### 2.1 Create the environment

1. Go to your Railway project
2. Settings → Environments → New Environment
3. Name: `dev`

Railway will automatically provision new Postgres and Redis instances for this environment.

### 2.2 Configure dev environment

In the `dev` environment:

1. **Variables tab** — Set all environment variables:
   - Copy from production, then change:
   - `NODE_ENV=development`
   - `SLACK_*` → use dev Slack app tokens
   - `GITHUB_REPO=qori-studies-dev` (or keep same if OK to mix)
   - `QORI_TEAM_SLUG=friends-lab-dev`

2. **Settings tab** — Configure deployment:
   - Deploy: `dev` branch
   - Auto-deploy: Enabled

### 2.3 Create the dev branch

```bash
git checkout main
git pull
git checkout -b dev
git push -u origin dev
```

Railway will auto-deploy to the dev environment.

### 2.4 Verify

1. Check Railway deploy logs — should show migrations running
2. Test a slash command in the dev Slack workspace
3. Verify data appears in the dev Postgres (Railway Data tab)

---

## Step 3: Local Development Setup

For local development before pushing to dev branch.

### 3.1 Option A: Docker Compose (recommended)

Uses local Postgres + Redis containers:

```bash
cd backend

# Copy dev env template
cp .env.dev.example .env

# Edit .env with your dev Slack tokens
# DB_HOST should be localhost

# Start Postgres and Redis
docker-compose -f docker-compose-dev.yml up -d postgres redis

# Run the app locally (with hot reload)
npm run dev
```

### 3.2 Option B: Railway Dev Database + Local App

Uses Railway dev Postgres, local app:

```bash
cd backend

# Copy dev env template
cp .env.dev.example .env

# Edit .env:
# - Use Railway dev database credentials (from Railway Variables)
# - Use dev Slack tokens

# Run the app locally
npm run dev
```

### 3.3 Expose Local to Slack (if needed)

For local Socket Mode testing, no ngrok needed — Socket Mode handles the connection.

For webhook-based testing (rare), use ngrok:
```bash
ngrok http 3000
# Update Slack app URLs with ngrok URL
```

---

## Step 4: Daily Workflow

### Feature Development

```bash
# Start from dev branch
git checkout dev
git pull
git checkout -b feature/my-feature

# Make changes...

# Test locally
npm run dev
npm test

# Push to feature branch
git push -u origin feature/my-feature

# Create PR to dev branch
# CI runs typecheck, tests, migration check
# Merge when green

# dev branch auto-deploys to Railway dev environment
# Test in dev Slack workspace
```

### Promoting to Production

```bash
# After testing in dev environment:
git checkout main
git pull
git merge dev
git push

# main branch auto-deploys to Railway production
# Migrations run automatically
```

---

## Step 5: Migration Discipline

Migrations now run automatically on every deploy (dev and prod).

### How it works

1. `scripts/start.sh` runs before the app starts
2. It waits for database connection
3. Runs `npx sequelize-cli db:migrate`
4. Verifies migration count matches expected
5. Only then starts `node ./dist/app.js`

### Creating new migrations

```bash
cd backend
npx sequelize-cli migration:generate --name my-migration-name
# Edit the migration file
# Commit with the code that depends on it
```

### CI Verification

CI runs a "Verify migrations" step that:
1. Runs all pending migrations
2. Counts applied vs expected
3. Fails if there's a mismatch

This catches migration issues before they reach production.

---

## Environment Safety Checklist

Before running locally, verify:

| Check | Dev Value | Prod Value (STOP) |
|-------|-----------|-------------------|
| `NODE_ENV` | `development` | `production` |
| `SLACK_APP_TOKEN` | `xapp-1-A0X...` (dev app) | `xapp-1-A0Y...` (prod app) |
| `DB_HOST` | `localhost` or `dev.railway.app` | `*.railway.internal` |
| Workspace | Dev/test workspace | Research team workspace |

If you see production values in your local `.env`, STOP and fix before running.

---

## Troubleshooting

### "Dialect needs to be explicitly supplied"

Check for spaces around `=` in your env vars. `DB_DIALECT = postgres` (with spaces) breaks Sequelize.

### Slack commands go to wrong app

Verify:
1. You're in the correct workspace (dev vs prod)
2. Only one Qori app is installed per workspace
3. Socket Mode is enabled in the Slack app config

### Migrations didn't run

Check Railway deploy logs. Look for:
```
=== Qori Backend Startup ===
Running database migrations...
Migrations completed successfully.
```

If you see "ERROR: Migrations failed!", check the error message.

### Database connection fails on startup

The startup script waits 60 seconds for the database. If it still fails:
1. Check Railway Postgres service is running
2. Verify DB credentials in environment variables
3. Check if Postgres is still provisioning (can take a minute on first deploy)

---

## Reference: File Locations

| File | Purpose |
|------|---------|
| `backend/.env.example` | Prod environment template |
| `backend/.env.dev.example` | Dev environment template |
| `backend/.env` | Your local config (gitignored) |
| `backend/scripts/start.sh` | Startup script with migrations |
| `backend/Dockerfile` | Production container (runs start.sh) |
| `backend/Dockerfile.dev` | Dev container (runs migrations + nodemon) |
| `backend/docker-compose-dev.yml` | Local Docker setup |
| `.github/workflows/ci.yml` | CI with migration verification |
