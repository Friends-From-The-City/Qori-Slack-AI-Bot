# Discovery Workspace

Pre-study discovery research that informs briefs and accumulates as organizational memory across studies.

Discovery is an industry-standard phase that happens **before** a study is scoped. It answers: _What do we already know? What are the open questions? Who are the stakeholders and what do they need?_

## Folder Structure (in qori-studies repo)

```
_discovery/
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

## How It Works

- Discovery artifacts are **not scoped to a study**. They live at the repo root under `_discovery/`.
- Each artifact is identified by a `topic_slug` (researcher-provided, slugified).
- Variables are stored per discovery type in `.variables/discovery-variables.json`, tagged with `discovery_artifact_id` (the slug) instead of `study_id`.
- Discovery outputs feed downstream into `/qori-brief` and `/qori-plan` via the cascade contract -- briefs consume discovery variables to ground approval decisions in prior research.

## Folder Creation

The `_discovery/` folder structure in qori-studies is **not** part of the per-study template scaffold (`config/templates/`). It is created automatically by the backend when the first discovery artifact is written -- GitHub's `createOrUpdateFileContents` API creates intermediate directories as needed.

## Relationship to Studies

Discovery research **precedes** studies. A single discovery effort (e.g., desk research on "veteran-telehealth-barriers") may inform multiple study briefs. Existing study-scoped discovery files (created before this separation) are preserved as-is in their study folders.
