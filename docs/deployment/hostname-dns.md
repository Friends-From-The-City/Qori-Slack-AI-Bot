# Hostname, DNS, and Network Ingress Contract

Qori must support deployment behind an agency-controlled hostname. No vendor-owned hostname is required.

## Supported Hostname Patterns

The deploying organization chooses its own hostname and path structure. Examples:

```
qori.agency.gov
research.agency.gov
research.agency.gov/qori
```

No production hostname may be hard-coded in Qori Core.

## Architecture

```
agency-controlled DNS
        │
        ▼
TLS termination / certificate management
        │
        ▼
ingress / reverse proxy / load balancer
        │
        ▼
Qori Application (Workspace + API)
        │
        ▼
Qori Core (business logic, services)
        │
        ▼
agency-controlled PostgreSQL
```

## Infrastructure Responsibilities

The deploying organization is responsible for:

| Concern | Responsibility | Notes |
|---------|---------------|-------|
| **DNS** | Agency infrastructure team | A/CNAME records pointing to the ingress |
| **TLS certificates** | Agency infrastructure team | Issued by agency-approved CA; HTTPS required for production |
| **Certificate rotation** | Agency infrastructure team | Automated via ACME, agency PKI, or manual process |
| **Ingress / reverse proxy** | Agency infrastructure team | nginx, HAProxy, AWS ALB, Azure App Gateway, Kubernetes Ingress, etc. |
| **Load balancer** | Agency infrastructure team | If running multiple application instances |
| **Network routing** | Agency infrastructure team | Firewall rules, VPC/subnet configuration, outbound access for external APIs |

Qori does not manage DNS, certificates, or ingress. Qori listens on a configurable `PORT` (default `3000`) and expects the infrastructure layer to route traffic to it.

## Application URL Configuration

Qori uses environment variables for all URL-dependent behavior. No hostname is compiled into the application.

| Variable | Purpose | Required | Example |
|----------|---------|----------|---------|
| `PUBLIC_APP_URL` | Base URL for the Workspace UI (links in notifications, emails, OAuth redirects) | When Workspace is deployed | `https://qori.agency.gov` |
| `PUBLIC_API_URL` | Base URL for the Application API (client SDK configuration, webhook callbacks) | When API is externally accessible | `https://qori.agency.gov/api` |
| `AUTH_CALLBACK_URL` | OAuth/OIDC callback endpoint | When OIDC is configured | `https://qori.agency.gov/auth/callback` |
| `CORS_ALLOWED_ORIGIN` | Allowed origin for cross-origin requests from the Workspace | When Workspace and API are on different origins | `https://qori.agency.gov` |
| `TRUSTED_PROXY` | Trust proxy headers (`X-Forwarded-For`, `X-Forwarded-Proto`) | When behind a reverse proxy | `true` or `loopback,linklocal,uniquelocal` |
| `WEBHOOK_BASE_URL` | Base URL for external webhook/callback registrations (Slack, GitHub, etc.) | When using HTTP-mode integrations instead of Socket Mode | `https://qori.agency.gov/webhooks` |

### Notes

- **`PUBLIC_APP_URL` and `PUBLIC_API_URL`** may be the same origin (e.g., `https://qori.agency.gov` with API at `/api`) or different origins. Qori supports both configurations.
- **`TRUSTED_PROXY`** is passed to Express's `trust proxy` setting. Required when Qori runs behind a reverse proxy so that `req.ip`, `req.protocol`, and `req.hostname` reflect the client's actual values rather than the proxy's.
- **`WEBHOOK_BASE_URL`** is only needed if the deployment uses HTTP webhooks instead of Slack Socket Mode. Current Slack integration uses Socket Mode (no inbound HTTP required). Future HTTP-mode Slack or GitHub webhook integrations would use this.
- None of these variables have defaults that reference any specific hostname or domain.

## Reverse Proxy Configuration

When Qori runs behind a reverse proxy, the proxy must:

1. **Forward standard headers:**
   - `X-Forwarded-For` — client IP
   - `X-Forwarded-Proto` — original protocol (`https`)
   - `X-Forwarded-Host` — original hostname
   - `Host` — may be rewritten or preserved depending on proxy config

2. **Pass WebSocket connections** if the Workspace uses real-time features (future requirement).

3. **Set appropriate timeouts** — AI generation requests can take 30–120 seconds. The proxy timeout must exceed the application's longest expected response time.

4. **Handle request body size** — Survey uploads and transcript ingestion may produce request bodies up to 10 MB. Configure `client_max_body_size` (nginx) or equivalent.

### Example: nginx

```nginx
server {
    listen 443 ssl;
    server_name qori.agency.gov;

    ssl_certificate     /etc/ssl/certs/qori.agency.gov.crt;
    ssl_certificate_key /etc/ssl/private/qori.agency.gov.key;

    client_max_body_size 10m;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_read_timeout 180s;
    }
}
```

## Outbound Network Dependencies

Qori makes outbound HTTPS connections to:

| Service | Hostname pattern | Purpose | Required |
|---------|-----------------|---------|----------|
| Slack API | `*.slack.com` | Bot commands, modals, messages | Yes (for Slack adapter) |
| GitHub API | `api.github.com` | Document projection, config reads | Yes |
| Anthropic API | `api.anthropic.com` | AI model inference | Yes |
| Sentry | Configured via `SENTRY_DSN` | Error reporting | No |

If the deployment environment uses an outbound proxy or firewall, these destinations must be allowed. Configure `HTTPS_PROXY` / `NO_PROXY` environment variables if an outbound proxy is required.

## Current State (WS-0)

As of WS-0, the application API is live and consumes all hostname-related variables:

- `CORS_ALLOWED_ORIGINS` — consumed by CORS middleware for API access control
- `AUTH_CALLBACK_URL` — used by the OIDC callback endpoint (`/api/v1/auth/callback`)
- `TRUSTED_PROXY` — consumed by Express for correct `req.ip` and `req.protocol`
- `PUBLIC_APP_URL` / `PUBLIC_API_URL` — available for link generation in notifications
- `WEBHOOK_BASE_URL` — available for external service registration

Slack still uses Socket Mode (no inbound HTTP from Slack required).

## Related Documents

- [Configuration contract](./configuration.md) — all environment variables
- [Deployment guide](./README.md) — deployment steps
- [Slack adapter](./adapters/slack.md) — Slack-specific networking
- [Authentication boundary](./authentication.md) — OIDC/callback URL requirements
