# Qori Slack Deployment Checklist

**Last updated:** 2026-06-05

This checklist covers fresh Qori deployments. Follow it in order — some steps depend on earlier ones.

---

## Prerequisites

- [ ] Node.js 18+ installed
- [ ] PostgreSQL 14+ accessible (Railway-managed or self-hosted)
- [ ] Redis accessible (Railway-managed or self-hosted)
- [ ] GitHub personal access token with repo scope
- [ ] Anthropic API key

---

## 1. Slack App Configuration

### Create Slack App

1. Go to https://api.slack.com/apps
2. Create New App → From scratch
3. Name it (e.g., "Qori") and select your workspace

### Required Scopes

Navigate to **OAuth & Permissions** → **Scopes** → **Bot Token Scopes**.

Add these scopes:

| Scope | Purpose |
|-------|---------|
| `chat:write` | Send messages |
| `commands` | Register slash commands |
| `users:read` | Look up user profiles |
| `users:read.email` | Get user email addresses |
| `channels:read` | List public channels, check membership |
| `groups:read` | **CRITICAL** — List private channels, check membership |
| `im:write` | Open DM channels for notifications |
| `files:read` | Access uploaded files |

#### DEPLOYMENT-CRITICAL: `groups:read` Scope

> **If you skip `groups:read`, membership detection silently fails for private channels.**

The Admin Center (`/qori-admin`) checks whether users are project members to show the appropriate modal (owner vs member vs non-member). This uses `conversations.members` to check channel membership.

- **Public channels:** `channels:read` is sufficient
- **Private channels:** Requires BOTH `channels:read` AND `groups:read`

Without `groups:read`:
- Private channel membership checks return empty results
- Users who ARE members see the "non-member" modal
- No error is thrown — the failure is silent

**VA projects typically use private channels.** Missing this scope will break the Admin Center for most real deployments.

### Socket Mode (Required)

1. Navigate to **Socket Mode** in the sidebar
2. Enable Socket Mode
3. Generate an App-Level Token with `connections:write` scope
4. Save the token — this becomes `SLACK_APP_TOKEN`

### Slash Commands

Navigate to **Slash Commands** and create:

| Command | Request URL | Description |
|---------|-------------|-------------|
| `/qori-start` | (Socket Mode — no URL needed) | Create a new project |
| `/qori-admin` | | Open Admin Center (owners only) |
| `/qori-study` | | Create a new study |
| `/qori-plan` | | Generate research plan |
| `/qori-brief` | | Generate research brief |
| `/qori-guide` | | Generate discussion guide |
| `/qori-analyze` | | Analyze session transcript |
| `/qori-synthesis` | | Synthesize study findings |
| `/qori-readout` | | Generate research readout |
| `/qori-delete` | | (Redirects to Admin Center) |

### Event Subscriptions

Enable Events and subscribe to:
- `app_mention`
- `message.im`

### Interactivity

Enable Interactivity (no Request URL needed for Socket Mode).

### Install to Workspace

1. Navigate to **Install App**
2. Install to your workspace
3. Copy the **Bot User OAuth Token** — this becomes `SLACK_BOT_TOKEN`

---

## 2. Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
# Slack (from steps above)
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...        # From Basic Information → App Credentials
SLACK_APP_TOKEN=xapp-...        # From Socket Mode

# Database
DATABASE_URL=postgres://...     # Or individual DB_* vars
DB_DIALECT=postgres

# Redis
REDIS_URL=redis://...

# GitHub
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=your-org
GITHUB_REPO=qori-studies        # Content repo (studies, documents)
GITHUB_CONFIG_REPO=qori-slack   # Config repo (templates, prompts) — optional, falls back to GITHUB_REPO

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Team (optional)
QORI_TEAM_SLUG=friends-lab      # Default team for discovery workspace
```

---

## 3. Database Setup

```bash
cd backend
npm install
npm run db:migrate
```

Verify migrations ran:
```bash
npx sequelize-cli db:migrate:status
```

All 33+ migrations should show as "up".

---

## 4. Verify Installation

```bash
npm run dev
```

In Slack:
1. Run `/qori-start` in any channel → Should open project creation modal
2. Run `/qori-admin` in a project channel → Should open Admin Center

### Smoke Tests

- [ ] `/qori-start` opens modal
- [ ] `/qori-admin` in project channel shows Admin Center (if owner)
- [ ] `/qori-admin` in project channel shows member/non-member variant (if not owner)
- [ ] `/qori-admin` in private channel works (requires `groups:read`)
- [ ] `/qori-study` creates study in GitHub

---

## 5. Production Deployment (Railway)

### Services

Create three services:
1. **Backend** — Deploy from `backend/` directory
2. **Postgres** — Railway-managed
3. **Redis** — Railway-managed

### Environment Variables

Set all variables from Section 2 in Railway's Variables tab.

**Gotcha:** No spaces around `=` in Railway. `DB_DIALECT = postgres` (with spaces) breaks Sequelize.

### Start Command

Clear any custom start command — the Dockerfile handles it:
```dockerfile
CMD ["node", "./dist/app.js"]
```

Do NOT use:
- `npm run prod` — runs raw source, can't load `.ts` files
- `npm start` — `dist/bin/www.js` has broken relative paths

---

## Troubleshooting

### "Dialect needs to be explicitly supplied"
Check for spaces in `DB_DIALECT` env var. Must be `DB_DIALECT=postgres`, not `DB_DIALECT = postgres`.

### Membership detection fails for private channels
Add `groups:read` scope to the Slack app. See Section 1.

### Tokens fail to authenticate
Re-paste the full token value. Railway's UI can truncate long values on paste.

### Migrations fail on Railway
Use the **public** Postgres URL (with `railway.app` hostname), not the internal URL. Internal URLs only resolve from within Railway's private network.

---

## Post-Deployment Verification

- [ ] All slash commands respond
- [ ] Modals open and submit correctly
- [ ] Documents appear in GitHub repo
- [ ] Admin Center works for owners AND members in private channels
- [ ] Audit logs populate in `disposition_audit_logs` table
