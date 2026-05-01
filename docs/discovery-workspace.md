# Discovery Workspace

Pre-study discovery research that informs briefs and accumulates as organizational memory across studies.

Discovery is an industry-standard phase that happens **before** a study is scoped. It answers: _What do we already know? What are the open questions? Who are the stakeholders and what do they need?_

## Folder Structure (in qori-studies repo)

Discovery is **team-scoped**. Each team gets its own discovery namespace:

```
{team}/_discovery/
  README.md
  desk-research/
    .variables/          <- discovery-variables.json per artifact
    {topic-slug}-desk-research-{date}.md
  stakeholder-interviews/
    .variables/
    {topic-slug}-stakeholder-synthesis-{date}.md
  survey-synthesis/
    .variables/
    {topic-slug}-survey-synthesis-{date}.md
```

For the friends-lab team: `friends-lab/_discovery/desk-research/...`

## Team Resolution

The team slug comes from the `QORI_TEAM_SLUG` environment variable, defaulting to `friends-lab`. Set per deployment in Railway. When multi-team onboarding arrives, each team gets a separate deployment with its own value.

## How It Works

- Discovery artifacts are **not scoped to a study**. They live under `{team}/_discovery/`.
- Each artifact is identified by a `topic_slug` (researcher-provided, slugified).
- Variables are stored per discovery type in `.variables/discovery-variables.json`, tagged with `discovery_artifact_id` (the slug) instead of `study_id`.
- Discovery outputs feed downstream into `/qori-brief` and `/qori-plan` via the cascade contract -- briefs consume discovery variables to ground approval decisions in prior research.
- Duplicate filenames within the same date are handled by appending `-HHMM` timestamp.

## Folder Creation

The `{team}/_discovery/` folder structure in qori-studies is **not** part of the per-study template scaffold (`config/templates/`). It is created automatically by the `/qori-discover` command on first use -- a `README.md` is written as a scaffold marker, and GitHub's `createOrUpdateFileContents` API creates intermediate directories as needed.

## Relationship to Studies

Discovery research **precedes** studies. A single discovery effort (e.g., desk research on "veteran-telehealth-barriers") may inform multiple study briefs. Existing study-scoped discovery files (created before this separation) are preserved as-is in their study folders.
