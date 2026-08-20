# GitHub Integration Contract

GitHub serves as a **projection/handoff store** for Qori — documents are written to GitHub for researcher access and external collaboration. GitHub is **not** the canonical authority for research state; PostgreSQL is.

## Architecture

Qori uses two GitHub repositories (optionally the same repo):

| Role | Env var | Purpose |
|------|---------|---------|
| **Content repo** | `GITHUB_REPO` | Studies, generated documents, issues |
| **Config repo** | `GITHUB_CONFIG_REPO` | YAML prompt templates, study folder scaffolds |

If `GITHUB_CONFIG_REPO` is not set, both roles fall back to `GITHUB_REPO` (single-repo mode).

The `getConfigRepo()` function in `github.ts` encapsulates this fallback. Content writes always use `getContentRepo()` / `GITHUB_REPO`.

## Configuration

| Variable | Required | Purpose |
|----------|----------|---------|
| `GITHUB_TOKEN` | Yes | Authentication — PAT or GitHub App token with `repo` scope |
| `GITHUB_OWNER` | Yes | Organization or user that owns the repositories |
| `GITHUB_REPO` | Yes | Content repository name |
| `GITHUB_CONFIG_REPO` | No | Config repository name (defaults to `GITHUB_REPO`) |

### Deploying Organization Requirements

The deploying organization provides:

- Its own GitHub organization (or user account)
- Its own content repository
- Optionally its own config repository
- Its own authentication token

**No dependency on any specific GitHub organization.** The `GITHUB_OWNER` variable controls which organization Qori writes to. There are no hard-coded organization names in application code.

### Per-Organization Credential Boundary (WS-0)

In multi-org deployments, each organization can have its own GitHub credential:

| Table | Purpose |
|-------|---------|
| `integration_credentials` | Maps org → credential reference (e.g., `env:GITHUB_TOKEN_ORG1`) |

The `credential-resolver.service.ts` resolves credentials in order:
1. **Org-specific**: `integration_credentials` row for the org + provider
2. **Global fallback**: `GITHUB_TOKEN` env var (backward-compatible for single-org)

Credential references use a `ref:` format — currently `env:VAR_NAME` for environment variables. Future formats (`vault:`, `aws-sm:`) can be added without schema changes.

Cross-org credential use is impossible: the resolver always scopes by `organization_id`.

## Portability Audit

### Clean (no org-specific references in application code)

- `github.ts` — reads `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_CONFIG_REPO` from environment
- All Octokit calls use `process.env.GITHUB_OWNER` and repo variables
- YAML template path is a constant (`config/prompts`) — relative to repo root, not org-specific
- Study folder scaffold path is `config/templates/` — relative to repo root

### Organization-specific defaults (documentation only)

- `QORI_TEAM_SLUG` defaults to `friends-lab` — this is a team identifier within the content repo's folder structure, not a GitHub organization reference. New deployments should set their own team slug.
- `.env.example` comments reference the current team's setup — documentation, not runtime behavior.

## Content Repository Structure

Qori creates this structure in the content repository:

```
{team_slug}/
  {study-name}/
    {study-name}/
      research-brief.md
      research-plan.md
      discussion-guide.md
      session-notes/
      analysis/
      readouts/
  _discovery/
    desk-research/
    stakeholder-interviews/
    survey-synthesis/
```

The `{team_slug}` prefix is configurable via `QORI_TEAM_SLUG`.

## Config Repository Structure

YAML prompt templates and study folder scaffolds:

```
config/
  prompts/          # YAML workflow definitions (27 files)
  templates/        # Study folder scaffold (markdown READMEs)
```

## Branch Convention

Content writes target the `main` branch of the content repository. This is currently not configurable — content commits go to `main`.

## API Usage

Qori uses the GitHub REST API via `@octokit/rest`:

- `repos.getContent` — read files and directory listings
- `repos.createOrUpdateFileContents` — write documents
- `issues.create` — create study issues
- `repos.deleteFile` — delete files (admin operations)

No GitHub Actions, webhooks (beyond the optional inbound webhook route), or GitHub Apps APIs are used.
