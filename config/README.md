# Configuration Files

## What lives here

- `prompts/` — YAML templates loaded at runtime by the synthesis and generation flows. Path is abstracted via `YAML_TEMPLATE_PATH` in `backend/src/helpers/github.js`.
- `templates/` — Study folder scaffold (markdown READMEs and directory structure) copied into GitHub for each new study via `createStudyHandler.js`.

## What does NOT live here

- Modal definitions — these live as JS in `backend/src/helpers/slack/ui/`. See CLAUDE.md "Architecture Decisions" for why.
