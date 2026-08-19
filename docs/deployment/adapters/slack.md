# Slack Adapter Contract

Slack is a **user interface adapter**, not the product runtime authority. Canonical research state (studies, participants, evidence, variables) lives in PostgreSQL. Slack provides the interaction layer through which researchers invoke Qori workflows.

## Architecture

Qori uses Slack's **Socket Mode** (WebSocket-based, no public URL required) via the Bolt framework:

```
Researcher → Slack workspace → Socket Mode WebSocket → Bolt app → Handlers → PostgreSQL
```

This means Qori does not need a public HTTPS endpoint for Slack events — it initiates an outbound WebSocket connection to Slack's servers.

## Required Credentials

| Variable | Purpose | How to obtain |
|----------|---------|---------------|
| `SLACK_BOT_TOKEN` | Bot user OAuth token (`xoxb-...`) | OAuth & Permissions → Install to workspace |
| `SLACK_SIGNING_SECRET` | Request signature verification | Basic Information → App Credentials |
| `SLACK_APP_TOKEN` | Socket Mode connection (`xapp-...`) | App-Level Tokens → Create with `connections:write` scope |

### Token Isolation Rule

**Each deployment environment must have its own Slack app with its own credentials.** This includes `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, and any workspace-scoped channel IDs (`QORI_ALERTS_CHANNEL_ID`, `RESEARCH_TEAM_CHANNEL_ID`).

Cross-environment credential sharing caused a 3-day production outage (incident 2026-07-28). See CLAUDE.md for details.

## Slack App Configuration

### Required OAuth Scopes (Bot Token)

The Slack app must have these bot token scopes:

- `chat:write` — post messages
- `commands` — register slash commands
- `users:read` — resolve user profiles
- `channels:read` — read channel information
- `groups:read` — read private channel information
- `im:write` — send direct messages
- `files:read` — read uploaded files (session notes)

### Socket Mode

Socket Mode must be enabled for the app. Create an app-level token with `connections:write` scope.

### Slash Commands

Register these slash commands in the Slack app configuration:

| Command | Description |
|---------|-------------|
| `/qori-plan` | Open research plan modal |
| `/qori-brief` | Open research brief modal |
| `/qori-guide` | Open discussion guide modal |
| `/qori-analyze` | Open session analysis modal |
| `/qori-synthesis` | Open research synthesis modal |
| `/qori-readout` | Open readout generation modal |
| `/qori-discover` | Open discovery workflow modal |
| `/qori-fieldwork` | Open fieldwork management modal |
| `/qori-ticket` | Create actionable tickets |
| `/qori-ask` | Ask questions about studies |
| `/qori-learn` | Interactive onboarding tour |
| `/qori-admin` | Admin center |
| `/qori-project` | Create a new project |
| `/qori-repo` | Configure repository |
| `/qori-sync` | Sync study data |

### Event Subscriptions

No event subscriptions are required for Socket Mode — events are received through the WebSocket connection.

### Interactivity

Interactivity must be enabled. Request URL is not needed (Socket Mode handles it).

## Workspace Identity

Slack workspace IDs and user IDs are **not** institutional authority. They are adapter-specific identifiers:

- Slack user IDs map to Qori actors (currently 1:1, future: through authentication boundary)
- Channel IDs are workspace-scoped — different in each Slack workspace
- App IDs are per-Slack-app — different for each deployment

No Slack-specific identifier is used as an authorization decision. Authorization is based on project membership and study ownership (ADR 0024).

## Graceful Shutdown

The Slack adapter handles graceful shutdown on SIGTERM/SIGINT:
- Socket Mode WebSocket is explicitly disconnected
- Prevents zombie connections that steal command envelopes
- 5-second timeout for forced exit if disconnect hangs

## Connection Health

The Socket Mode `hello` event includes `num_connections`. If >1, another process shares the app token — this is an incident condition. An alert is posted to `QORI_ALERTS_CHANNEL_ID` if configured.

## Creating a New Slack App for Deployment

1. Visit https://api.slack.com/apps → Create New App
2. Choose "From scratch" (not from manifest)
3. Name it (e.g., "Qori") and select your workspace
4. Enable Socket Mode (Settings → Socket Mode)
5. Create app-level token with `connections:write` scope
6. Add bot token scopes under OAuth & Permissions
7. Install to workspace
8. Register slash commands under Slash Commands
9. Enable Interactivity under Interactivity & Shortcuts
10. Copy `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN` to environment
