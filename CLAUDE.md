# CLAUDE.md

> This repo was originally `Friends-From-The-City/Qori-Slack-AI-Bot` and was transferred to `Friends-Innovation-Lab/qori-slack` on 2026-04-20. It is the Slack surface of Qori; the web surface lives at `Friends-Innovation-Lab/qori` (separate repo).

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Qori?

Qori is an AI-powered research operations platform for VA (Veterans Affairs) UX research teams. Users interact through Slack slash commands (e.g., `/qori-plan`, `/qori-analyze`) which open Block Kit modals, collect input, run chained LLM tasks defined in YAML configs, and store generated documents in GitHub repositories.

## Architecture

**Two-language stack, not yet fully integrated:**

- **Backend (Node.js):** `backend/` — Express + Slack Bolt app. Handles slash commands, modal submissions, LLM orchestration via LangChain, and GitHub document storage via Octokit. Uses Sequelize (PostgreSQL) + Redis/Bull for queuing.
- **Sam Agent (Python):** `sam/` — Support assistant using the Anthropic SDK directly. Has its own Slack handler (`SamSlackHandler`) but is **not finished or functional** — it was started as a help desk agent but never completed.

**Config-driven AI pipeline:** The intelligence layer lives in YAML files, not in application code. Each YAML defines input variables, chained `ai_generation_tasks` (sequential LLM calls), output templates (Handlebars-style `{{ai_generated.*}}`), and delivery options. At runtime the backend fetches YAML templates from the GitHub config repo at path `config/prompts/` (controlled by the `YAML_TEMPLATE_PATH` constant in `github.js`).

**Two-repo GitHub architecture:** The backend uses two GitHub repos, controlled by env vars:
- `GITHUB_REPO` — the **content repo** where studies are created, documents are written, and issues are filed (e.g., `qori-studies`).
- `GITHUB_CONFIG_REPO` — the **config repo** where templates (`config/templates/`) and YAML prompts (`config/prompts/`) are read from (e.g., `qori-slack`). If not set, falls back to `GITHUB_REPO` for backward compatibility.

In code, config reads go through `getConfigRepo()` (defined in `github.js`), which returns `GITHUB_CONFIG_REPO || GITHUB_REPO`. Content writes use `GITHUB_REPO` directly.

**Model resolution:** All `/qori-*` commands go through `backend/src/helpers/langchain.js:99-114`, which creates a `ChatAnthropic` instance. Model is `ANTHROPIC_MODEL_NAME` env var, falling back to `claude-sonnet-4-20250514`. The `llm_config` blocks in YAML prompt files (some say `gpt-4o`) are parsed but **never read** — dead config.

**RAG pipeline (currently disabled for alpha):** `backend/src/helpers/ragV2.js` contains a vector search Q&A pipeline using OpenAI (`gpt-4o-mini` + embeddings) and Supabase as the vector store. It is gated on env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OPENAI_API_KEY`) — if any are missing, the server boots cleanly and RAG commands respond with a "not available yet" message. The RAG command handlers in `events.js` (`/civicmind ask-study`, `/civicmind create-template-study`, `/ask-study` modal, `/civicmind ask`) are disabled and return a user-friendly message. See "How to re-enable RAG" below.

**Note on `config/command-mapping.json`:** This file exists and maps slash commands to modal/prompt files, but the backend does not reference it at runtime. It may have been intended as a routing config but was never wired up. Treat it as documentation of intent, not live config.

## Build and Run Commands

All commands run from `backend/`:

```bash
cd backend
npm install
npm run dev          # Dev server with nodemon (port 3000)
npm run build        # Babel compile src/ → dist/
npm start            # Run compiled dist/bin/www.js
npm run lint         # ESLint (airbnb-base)
npm run lint:fix     # ESLint autofix
npm test             # Mocha + Chai tests
npm run db:migrate   # Sequelize migrations
```

**Docker (all services):**
```bash
cd backend
docker-compose up    # Starts app (3000), postgres (5432), redis (6379)
```

**Sam agent** — `sam/requirements.txt` was generated from imports (versions unpinned, need verification). Run directly: `python sam/sam-agent.py`

**Environment:** Copy `backend/.env.example` to `backend/.env`. Required variables: Slack tokens (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN`), `GITHUB_TOKEN`/`GITHUB_OWNER`/`GITHUB_REPO`, `ANTHROPIC_API_KEY`, database credentials. See `.env.example` for the full list with descriptions.

## Railway Deployment (Production)

**Migrated 2026-04-23. Verified end-to-end 2026-04-24.** The backend runs on Railway with Postgres and Redis as managed services. Slack commands work end-to-end on the Railway URL (~95% of flows working as of 2026-04-24 alpha test).

**Services:**
- **Backend** — Node.js service, deployed from `backend/` on push to `main`
- **Postgres** — Railway-managed, connection string provided as `DATABASE_URL`. All 22 migrations run successfully. You can browse tables directly in Railway's Data tab.
- **Redis** — Railway-managed, connection string provided as `REDIS_URL`

**Environment variables** are set in Railway's Variables tab per service. All the same vars from `.env.example` apply. Three gotchas to know:

1. **No spaces around `=` in Railway variables.** Railway's UI trims values, but if you paste `DB_DIALECT = postgres` (with spaces) from another source, the value becomes ` postgres` (leading space) and Sequelize will fail with "Dialect needs to be explicitly supplied." Always use `DB_DIALECT=postgres` with no spaces.

2. **Token values can get truncated/malformed on paste.** Both `SLACK_APP_TOKEN` and `GITHUB_TOKEN` were broken on initial setup because the value was truncated when pasted into Railway's Variables UI. If a token-based service fails to authenticate, re-paste the full value and verify character count matches the source.

3. **Postgres public URL for migrations.** Railway's internal Postgres hostname (`postgres.railway.internal`) only resolves inside the private network. To run `npx sequelize-cli db:migrate` from your local machine or via `railway run`, use the **public** connection URL (with `DATABASE_PUBLIC_URL` fields) from the Postgres service's Connect tab (it has a `railway.app` hostname and a mapped port). The internal URL works for the backend service at runtime since it's on the same private network.

**Deploy flow:** Push to `main` → Railway auto-deploys. No CI/CD pipeline config needed — Railway watches the repo directly.

## Key Directories

- `config/modals/` — Slack Block Kit modal JSON definitions, organized by command (plan/, analyze/, outreach/, etc.)
- `config/prompts/` — Local copies of YAML workflow configs (~25 files). Note: backend fetches these from GitHub at runtime, not locally
- `config/command-mapping.json` — Maps commands to modal/prompt files, but is **not used by the backend at runtime** (see Architecture section)
- `sam/` — Unfinished Python support agent with its own config, prompts, and escalation rules
- `study-template/` — Canonical folder structure copied into GitHub for each new study (00-brief through 07-implementation)
- `docs/learn/` — Static HTML/Tailwind GitHub Pages documentation site
- `config/prompts/` — YAML workflow configs (23 files). Runtime source of truth, fetched from GitHub by the backend.
- `config/templates/` — Study folder scaffold (markdown READMEs) copied into GitHub for each new study.
- `config/` — Also contains `command-mapping.json` (not used at runtime) and `sam-config.yaml` (Sam agent, unfinished).

## Important Conventions

- **Modals must be valid Slack Block Kit JSON.** Test against the Block Kit Builder spec.
- **YAML prompts are the primary place to edit AI behavior.** Each file defines `ai_generation_tasks` (chained prompts), `input_variables` (typed), and `output_template` (Markdown with Handlebars vars).
- **Claude-only at runtime (for now).** The main `/qori-*` pipeline uses Claude via `langchain.js`. RAG (which used OpenAI) is disabled for alpha. The `llm_config` blocks in YAML prompt files are dead config — never read.
- **Sam's allowed config paths** are restricted: only `config/prompts/*.yaml` and `config/modals/**/*.json`. Sam cannot modify `sam-config.yaml`.

## Key Principles

- Minimal UI — use Slack's native Block Kit components, not custom interfaces
- "Don't bloat" — only add features that solve real researcher problems
- Privacy first — PII redaction is built into workflows
- Match real VA researcher workflows, not idealized processes

## General Rule

When something is ambiguous, document the observation rather than the interpretation. "X and Y both exist, reason unclear" is more useful than a guess presented as fact.

Roadmap and planned work are tracked separately (TBD) — do not assume anything about future direction from this file.

## How to Re-enable RAG

The RAG pipeline is disabled for alpha. To bring it back:

1. **Provision Supabase:** Create a project at supabase.com. In the SQL editor, create a `documents` table with vector columns matching the schema expected by `@langchain/community/vectorstores/supabase` (pgvector extension required).
2. **Set env vars:** Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `OPENAI_API_KEY` to your `.env`. The `ragV2.js` pipeline will initialize automatically when all three are present.
3. **Re-enable command handlers:** In `backend/src/helpers/slack/events.js`, restore the RAG call sites that were replaced with "not available yet" messages. The original code is preserved in git history (commit before the disable change).
4. **Index documents:** Use the `/civicmind sync` command to populate the Supabase vector store with study documents from GitHub.

## Open Questions

These are from a codebase audit. Tanzeel (original backend developer) is no longer on the project, so answers come from code investigation.

1. **RAG / Supabase (resolved for now):** RAG is disabled for alpha. `rag.js` is dead code (fully commented out). `ragV2.js` is preserved but gated on env vars. Hardcoded Supabase credentials were removed from source but remain in git history (repo is private; accepted risk).
2. **ChromaDB: dead dependency.** Listed in `package.json` but never imported in any source file. Safe to remove.
3. **Sam Python dependencies:** `sam/requirements.txt` was generated from imports in `sam-agent.py` (anthropic, slack_sdk, pyyaml). There may be missing transitive dependencies or version constraints that aren't captured.
4. **No CI/CD pipeline exists.** Deployment docs in `docs/internal/deployment.md` describe scripts and processes that don't appear to be implemented yet.
5. **YAML templates fetched from GitHub at `config/prompts/`.** ~~Reconciled (2026-04-29).~~ The backend now fetches from `config/prompts/` via the `YAML_TEMPLATE_PATH` constant. The old `beta-test/YAML Templates/` path has been deleted. `config/prompts/` is both the local and GitHub source of truth.
6. **`command-mapping.json` is not used at runtime.** The backend never loads this file. Slash command routing is handled directly in `events.js`.

## Architecture Decisions

### Design Language Reference Template (updated April 30, 2026)

`config/prompts/research_readout.yaml` (v5.4.1) is the first template to fully embody the locked design language from `docs/design-references/research_readout_traceable.md`. It demonstrates: Pentagram-style masthead, editorial numbered findings (`## 01 &nbsp;&nbsp;`), per-finding confidence levels with parenthetical reasoning, per-finding source citations from `{{detected_files}}`, bold-em-dash methodology format, and backend-injected traceability footer. Use this as the reference when translating the design language to other templates.

### YAML Template Location (decided April 29, 2026)

Templates migrated from `beta-test/YAML Templates/` to `config/prompts/`. Path abstracted to `YAML_TEMPLATE_PATH` constant in `github.js`. The `beta-test/` directory has been deleted entirely — it was a legacy testing dump containing YAML templates, stale modal drafts, and test data.

### Modals Architecture (decided April 29, 2026)

**Decision:** Modal definitions live as JS in `backend/src/helpers/slack/ui/` as the single source of truth. The original `config/modals/` JSON folder has been deleted as it was never loaded at runtime and had diverged from the working JS modals (incompatible callback_ids, different action_ids, missing blocks).

**Reasoning:** ~35% of modals are dynamic factory functions that build structures from DB queries and conditional logic — these resist pure JSON representation without building a custom templating runtime. The remaining ~65% are static or semi-static objects that could theoretically live as JSON, but the cost of building a JSON loader + hybrid template system is not justified at current team scale.

**Sam agent** (originally envisioned to let non-developers edit modals): deferred. Claude Code currently serves this role effectively. Revisit if/when there's clear demand for non-developer self-service modal editing. If revisiting: start with hybrid JSON migration of the 19 static modals before considering full Sam infrastructure. See `docs/modals-migration-plan.md` for the analysis.

### Study Folder Scaffold (decided April 29, 2026)

The study folder scaffold (READMEs and directory structure copied into GitHub for each new study) lives at `config/templates/`. The old `study-template/` directory was a duplicate and has been deleted. `createStudyHandler.js` reads from `config/templates/` via `readFolders()`.

### Document Design Language (locked April 29, 2026)

A "Pentagram-style" design language was developed for Qori's generated documents. Key principles: editorial restraint, consistent masthead/methodology/footer patterns across document types, numbered sections only where they earn it, traceability woven into the design (per-finding source citations, confidence indicators, real artifact links).

**Reference document:** `docs/design-references/research-readout-reference.md` shows the locked design applied to the research readout template.

**Standards documentation:** `docs/qori-template-standards.md` Sections 4 and 6.

**Status:** Design locked. YAML translation pending — `research_readout.yaml` is the first target template for translation.

### Per-template input audit (locked April 30, 2026)

Every template translation now requires an "Inputs and rationale" pass — explicitly documenting what files feed the template and why. This caught a stale reference to coded transcripts when the research flow evolved (raw transcript replaced coded transcript as the primary session summary input — the AI coding step was redundant since `/qori-analyze` handles coding + summarization in one pass). Pattern is documented in Section 7 of the standards doc. Input rationale is captured in each template's design reference header note.

### Research plan template lean rewrite (April 30, 2026)

`research_plan.yaml` v4.7 establishes the planning-doc pattern (Pattern C). **Research brief = approval gate. Research plan = execution doc. Brief approved → plan elaborates.** Approval section removed in v4.7 (lives in brief now). VA-specific sections removed: OCTO Priorities (internal process, not research methodology), User Journey (assumptions before research), Implementation Plan (belongs in research readout), VA Compliance Notes (belongs in study-specific compliance addendum). Modal simplified from 15 fields to 8 with sensible defaults (lead researcher auto-fills from Slack profile, start date defaults to next Monday). Output collapsed from ~292 lines to ~145 lines. AI tasks reduced from 15 to 9. Deliverables section is methodology-driven (LLM selects the right list based on methodology choice). If researchers ask "where did OCTO Priorities go?" — those are VA-internal process concerns, not research methodology. They can be added to a separate compliance addendum if needed.

### Research brief v5.0 translation (April 30, 2026)

`research_brief.yaml` v5.0 implements the locked design from `docs/design-references/research_brief_reference.md`. **Research brief = approval gate. Research plan = execution doc. Brief approved → plan elaborates.** This is the FIRST document in a study lifecycle — prior discovery inputs are optional enrichment selected via modal checkboxes. Modal has 11 fields: study name, requested by, problem statement, learning objectives, out of scope, methodology (radio), participant approach, timeline (radio), start date, decision deadline, budget (optional) — plus discovery artifact selection when available. AI tasks: descriptive_title, display_date, summary, problem (synthesizes discovery), formatted_learning, formatted_out_of_scope, timeline, timeline_display, risks. Handler extracted to `commands/briefHandler.js` (May 3, 2026). Discovery variables are injected manually by the handler based on researcher's checkbox selection, NOT via YAML `consumes:` block — this is intentional so the researcher controls which discovery sources inform the brief.

### Research brief v6.0 cascade-aware (May 3, 2026)

`research_brief.yaml` v6.0 is the first cascade-aware template per Section 8 of the design standards. Key architecture: discovery variables are loaded manually by `commands/briefHandler.js` based on researcher's modal checkbox selection, NOT via YAML `consumes:` block. This is intentional — researcher controls which discovery sources inform each brief. The spec (docs/cascade-spec/05-cc-instruction.md) assumed YAML consumes, but manual loading is better for briefs because it enables per-study cherry-picking. Single `brief_body` AI task generates all 7 prose sections in one pass for citation marker consistency [D1-D7], [S1-S7], [V1-V7]. Modal auto-selects all discovery checkboxes, pre-populates cascade-driven fields with sparkle markers. Deep schema extraction produces rich variables with IDs, verbatim quotes, role context, implications.

### Discussion guide v6.3 follow-up (noted April 30, 2026)

**Research plan integration:** When a research plan exists for the study, the discussion guide should auto-ground its warm-up and retrospective questions in the plan's objectives. Pattern would mirror the synthesis modal's analysis-layer file inputs — a modal checkbox: "Pull objectives from research plan if available." Estimated effort: M. Not implemented in v6.2 to keep scope manageable.

### Discovery workspace separation (May 1, 2026)

Discovery research (desk research, stakeholder interviews, survey synthesis) moved to `_discovery/` folder in qori-studies, separate from active studies. Discovery is pre-study work (industry standard) that informs briefs and accumulates as organizational memory across studies.

**Folder structure in qori-studies** (created on first artifact write, not via `config/templates/` scaffold). Discovery is team-scoped — `QORI_TEAM_SLUG` env var, defaults to `friends-lab`:
```
{team}/_discovery/
  README.md
  desk-research/.variables/discovery-variables.json
  stakeholder-interviews/.variables/discovery-variables.json
  survey-synthesis/.variables/discovery-variables.json
```

**YAML changes:** `desk_research.yaml`, `stakeholder_synthesis.yaml`, `survey_synthesis.yaml` now declare `discovery_scope: true`, output paths point to `{{team}}/_discovery/{type}/`, filenames use `{{topic_slug}}` instead of `{{selected_study}}`, and all three have a `topic` input variable (slugified for filenames).

**Variable store (migrated to Postgres, May 5 2026):** `studyVariables.js` is the authoritative variable store, backed by Postgres `study_variables` table. GitHub JSON files (`study-variables.json`, `discovery-variables.json`) are retained as non-authoritative debugging artifacts. On read, Postgres is checked first; if empty, falls back to GitHub (migration period). On write, Postgres is authoritative, GitHub is best-effort. Pool merges use database transactions (`append_or_replace_per_participant` = atomic DELETE+INSERT per participant). Discovery variables use synthetic study_id pattern (`discovery:{team}:{type}`). Schema files live at `backend/config/schemas/` (inside deploy context). The old `config/schemas/` at repo root no longer exists.

**Extraction model selection:** `variableExtractor.js` selects extraction model per-emit. Emits can declare `extraction_model: sonnet` in the YAML; otherwise a complexity heuristic selects Sonnet for schemas with >10 properties or multi-value enums. Extraction groups emits by model and runs them in separate API calls. session_summary uses Sonnet for all 5 emits.

**Schema split (atomic_nugget):** `atomic_nugget.yaml` (16 fields, monolithic) is superseded by `atomic_nugget_core.yaml` (6 required fields: id, nugget_type, severity, text, participant, session) + `atomic_nugget_detail.yaml` (11 enrichment fields linked by id). session_summary emits both. Downstream consumers should reference `atomic_nugget_core` for essential data and join with `atomic_nugget_detail` by id for enrichment.

**Team scoping:** Discovery is organizational memory at the team level. `QORI_TEAM_SLUG` env var (default: `friends-lab`) determines which team's discovery space to use. When multi-team onboarding happens, each team gets their own `{team}/_discovery/` namespace. Set per deployment in Railway.

**Existing study-scoped discovery files preserved as-is.** No migration. Studies that already ran desk_research have files in their study folders — those remain untouched.

**Handler wiring deferred to Step 2** (`/qori-discover` command). Current handlers still pass `study.path` as the base path — they'll be updated when the new slash command is built.
