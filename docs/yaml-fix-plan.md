# YAML Fix Plan — Alpha Release

**Date:** 2026-04-29
**Sources:** YAML audit (2026-04-24), ALPHA_POLISH.md (post-Railway findings), codebase verification
**Constraint:** Surgical fixes only. No architectural rewrites. Alpha is days away.

---

## Section 1: Quick Wins

Fixes that resolve known alpha bugs with small/trivial complexity. Ordered by user impact.

### 1.1 Fix `usability_issues_extractor.yaml` key name

| Field | Value |
|-------|-------|
| **Bug it solves** | 🔴 `/qori-synthesis`: Usability Issues section doesn't generate (ALPHA_POLISH) |
| **Root cause** | YAML uses `slack_output_template` (line 360) instead of `output_template`. `yamlProcessor.js:30` throws on missing `output_template`. |
| **Files to change** | `beta-test/YAML Templates/usability_issues_extractor.yaml` — rename key at line 360 |
| **Effort** | XS (one-word rename) |
| **Risk** | Low — no other code references `slack_output_template` |
| **Verification** | Run `/qori-synthesis` → select Usability Issues → confirm output generates |

### 1.2 Fix `session_notes.yaml` key name

| Field | Value |
|-------|-------|
| **Bug it solves** | Session notes pass through unprocessed (no AI structuring applied) |
| **Root cause** | YAML uses `ai_processing_tasks` (line 77) instead of `ai_generation_tasks`. `yamlProcessor.js:36` silently skips. |
| **Files to change** | `beta-test/YAML Templates/session_notes.yaml` — rename key at line 77 |
| **Effort** | XS (one-word rename) |
| **Risk** | Low — the task structure is identical, only the key name is wrong |
| **Verification** | Run `/qori-notes` → submit notes → confirm AI structuring is applied to output |

### 1.3 Inject `current_date` into AI prompt context (systemic fix)

| Field | Value |
|-------|-------|
| **Bug it solves** | 🟡 Generation dates on synthesis files are incorrect (ALPHA_POLISH). Also fixes empty dates in research_plan, service_blueprint, stakeholder_synthesis, stakeholder_interview_guide, survey_synthesis, journey_mapping. |
| **Root cause** | `yamlProcessor.js:16` adds `current_date` to Handlebars output context but NOT to `inputValues` passed to `executeAiGenerationTasks`. Any {% raw %}`{{current_date}}`{% endraw %} in AI prompt strings resolves to empty. |
| **Files to change** | `backend/src/helpers/yamlProcessor.js` — one line change at ~line 37: spread `current_date` into `inputValues` before passing to `executeAiGenerationTasks` |
| **Effort** | XS (one-liner) |
| **Risk** | Low — only enriches the context object; no downstream consumers affected |
| **Verification** | Run `/qori-plan` → check that generated dates in the research plan are today's date, not empty |

### 1.4 Fix `selected_study` vs `study_folder` in synthesis handler

| Field | Value |
|-------|-------|
| **Bug it solves** | 🔴 `/qori-synthesis` Usability Issues and Service Blueprint don't pull study context (ALPHA_POLISH). Affects all 7 synthesis sub-templates. |
| **Root cause** | `researchSynthesisHandler.js:606` passes `study_folder` but all synthesis YAMLs reference `selected_study`. LLM gets no study name context. |
| **Files to change** | `backend/src/helpers/slack/commands/researchSynthesisHandler.js` — rename `study_folder` to `selected_study` at line 606 |
| **Effort** | XS (one key rename) |
| **Risk** | Low — `study_folder` is not referenced in any YAML template (confirmed dead key). Must verify no other JS code reads `analysisData.study_folder` downstream. |
| **Verification** | Run `/qori-synthesis` → any sub-type → confirm study name appears in generated output |

### 1.5 Fix `stakeholder_synthesis.yaml` name mismatch

| Field | Value |
|-------|-------|
| **Bug it solves** | Stakeholder synthesis output missing study name in all 4 prompt tasks |
| **Root cause** | YAML prompts reference `study_name` (lines 135, 145, 275, 470, 589) but JS provides `selected_study` (events.js:2527). |
| **Files to change** | `backend/src/helpers/slack/events.js` ~line 2527 — add `study_name: studyName` alongside `selected_study` |
| **Effort** | XS (one-liner) |
| **Risk** | Low — additive; `selected_study` stays for any code that reads it |
| **Verification** | Run `/qori-synthesis` → Stakeholder Synthesis → confirm study name renders in output |

### 1.6 Fix `research_request.yaml` requestor_name

| Field | Value |
|-------|-------|
| **Bug it solves** | 🔴 `/qori-request` output has empty "Prepared by" field |
| **Root cause** | JS provides `prepared_by` (requestResearchHandler.js:82) but YAML output_template references `requestor_name` (line 163). |
| **Files to change** | `backend/src/helpers/slack/commands/requestResearchHandler.js` — add `requestor_name: prepared_by` value to the data object before calling `processYamlTemplate` |
| **Effort** | XS (one-liner) |
| **Risk** | Low — additive change, `prepared_by` preserved for modal pre-fill logic |
| **Verification** | Run `/qori-request` → submit → confirm requestor name appears in output |

---

## Section 2: Flow-Blockers

Fixes for 🔴 severity bugs from ALPHA_POLISH. Higher complexity but must be done.

### 2.1 `/qori-plan`: research plan doesn't read date inputs

| Field | Value |
|-------|-------|
| **Bug it solves** | 🔴 Project Timeline in Research Plan doesn't read from date inputs (ALPHA_POLISH) |
| **Root cause** | JS at events.js:1501-1503 extracts `start_date`, `end_date`, `key_milestones` but YAML's AI prompts use `timeline_date` (line 298) and `current_date` (lines 317-318) which are never provided. The extracted date values are dead keys — JS provides them but YAML doesn't reference them. |
| **Files to change** | (1) `beta-test/YAML Templates/research_plan.yaml` — add {% raw %}`{{start_date}}`{% endraw %}, {% raw %}`{{end_date}}`{% endraw %} references in the timeline prompt section, alias or remove {% raw %}`{{timeline_date}}`{% endraw %}. (2) Optionally add `timeline_date` to the JS data object if YAML keeps using that name. |
| **Effort** | S (YAML prompt editing + testing the timeline section output) |
| **Risk** | Low — only changes prompt text, no structural changes |
| **Verification** | Run `/qori-plan` → enter specific dates → confirm timeline section reflects those dates |

### 2.2 `/qori-plan`: brief saves to wrong repo

| Field | Value |
|-------|-------|
| **Bug it solves** | 🔴 Brief saved to `beta-test/tester_content/` in config repo instead of `qori-studies` content repo (ALPHA_POLISH) |
| **Root cause** | A `GITHUB_REPO` vs `GITHUB_CONFIG_REPO` classification miss — the brief-writing code path writes to the config repo. Likely a path from the old single-repo setup that wasn't updated in the two-repo refactor. |
| **Files to change** | `backend/src/helpers/slack/events.js` — the `/qori-plan` brief handler. Need to find the `createOrUpdateFile` call and ensure it uses `GITHUB_REPO` (content repo), not `getConfigRepo()`. |
| **Effort** | S (find the call, change the repo reference) |
| **Risk** | Medium — must verify the file path structure is correct for the content repo. Wrong path = file goes to wrong location. Test carefully. |
| **Verification** | Run `/qori-plan` → confirm brief appears in `qori-studies` repo, not `qori-slack` repo |

### 2.3 `/qori-request`: no approval notification

| Field | Value |
|-------|-------|
| **Bug it solves** | 🔴 After submitting a research request, no notification is sent to the stakeholder (ALPHA_POLISH) |
| **Root cause** | Needs investigation — possibly a Slack user ID lookup failure when "Submitted by" name doesn't match, or the approval flow isn't fully wired up. |
| **Files to change** | `backend/src/helpers/slack/commands/requestResearchHandler.js` — trace the post-submit flow to find where notification should be sent |
| **Effort** | M (requires investigation to find root cause, then fix) |
| **Risk** | Medium — depends on root cause; Slack API calls have error modes |
| **Verification** | Run `/qori-request` → submit → confirm stakeholder receives DM or channel notification |

### 2.4 Observer manager saves over the participant

| Field | Value |
|-------|-------|
| **Bug it solves** | 🔴 Observer count stays at 1/3 instead of counting up when new observer added (ALPHA_POLISH) |
| **Root cause** | Observer logic lives in `observeSessionHandler.js` (lines 27/36/44 have `maxObservers: 3`). When a new observer is added, it may be overwriting the participant record rather than appending. |
| **Files to change** | `backend/src/helpers/slack/commands/observeSessionHandler.js` — fix the observer append/update logic |
| **Effort** | M (need to trace exactly how observers are stored and why count doesn't increment) |
| **Risk** | Medium — touches participant data storage; verify existing participant data isn't corrupted by the fix |
| **Verification** | Add 2+ observers to same session → confirm count increments (1/3, 2/3, 3/3) |
| **Schema/migration note** | ⚠️ Check if observer storage uses a DB table or GitHub file. If DB, a migration may be needed. |

### 2.5 Reports and synthesis notes getting truncated

| Field | Value |
|-------|-------|
| **Bug it solves** | 🔴 Generated content is cut off mid-section (ALPHA_POLISH) |
| **Root cause** | Suspect token limit issue — either `max_tokens` in the LLM call is too low, or the combined prompt + output exceeds context window. `langchain.js` may have a hardcoded `max_tokens`. |
| **Files to change** | `backend/src/helpers/langchain.js` — check `max_tokens` / `maxTokens` setting on the `ChatAnthropic` instance (~lines 99-114) |
| **Effort** | S (if it's a max_tokens cap) to M (if it's a prompt-too-long issue requiring template refactoring) |
| **Risk** | Low if just raising max_tokens; Medium if templates need restructuring |
| **Verification** | Run a synthesis command with substantial input data → confirm full output renders without truncation |

### 2.6 `/qori-update-participant`: notes overwrite instead of append

| Field | Value |
|-------|-------|
| **Bug it solves** | 🟡 New notes overwrite original notes — previous notes are lost (ALPHA_POLISH) |
| **Root cause** | The update handler replaces the notes field wholesale instead of appending. |
| **Files to change** | `backend/src/helpers/slack/commands/participantHandler.js` — in the update function, read existing notes first, then concatenate new notes with a timestamp separator |
| **Effort** | S (read-then-append pattern) |
| **Risk** | Low — additive behavior change. Existing notes are preserved. |
| **Verification** | Update participant notes twice → confirm both entries appear in the stored notes |

---

## Section 3: Latent Risks

Audit findings not currently causing reported bugs but will eventually.

### 3.1 `desk_research.yaml` only gets 2 of 5+ needed variables

| Field | Value |
|-------|-------|
| **Bug it solves** | Desk research output will be missing study context, description, and effective_topic |
| **Root cause** | `events.js:2864` only passes `research_topic` and `document_content`. `selected_study`, `description`, and `effective_topic` are not provided. |
| **Files to change** | `backend/src/helpers/slack/events.js` ~line 2864 — add missing variables. For `effective_topic`, either remove `derived_variables` from YAML and use `research_topic` directly, or compute it in JS. |
| **Effort** | S (add variables to the data object + decide on `effective_topic` strategy) |
| **Risk** | Low |
| **Verification** | Run `/qori-plan` desk research flow → confirm all context fields render |

### 3.2 `stakeholder_interview_guide.yaml` user_findings never triggers

| Field | Value |
|-------|-------|
| **Bug it solves** | {% raw %}`{% if user_findings %}`{% endraw %} conditional blocks in the YAML never fire — entire sections of the guide are silently omitted |
| **Root cause** | JS merges `userFindings` into `research_questions` (events.js:2336) instead of providing it as a separate `user_findings` key. |
| **Files to change** | `backend/src/helpers/slack/events.js` ~line 2336 — provide `user_findings` as its own key |
| **Effort** | XS (one-liner) |
| **Risk** | Low |
| **Verification** | Run stakeholder interview guide flow with user findings → confirm conditional sections appear |

### 3.3 `session_summary.yaml` missing `session_date`

| Field | Value |
|-------|-------|
| **Bug it solves** | Session summary output has empty date fields |
| **Root cause** | `analyzeNotesHandler.js:164` doesn't provide `session_date` to the YAML processor |
| **Files to change** | `backend/src/helpers/slack/commands/analyzeNotesHandler.js` — add `session_date` to the variables object |
| **Effort** | XS (one-liner, use `format(new Date(), 'MMMM d, yyyy')` or extract from modal) |
| **Risk** | Low |
| **Verification** | Run `/qori-analyze` → confirm date appears in session summary |

### 3.4 `transcript_upload.yaml` missing metadata variables

| Field | Value |
|-------|-------|
| **Bug it solves** | Transcript uploads have empty metadata (filename, folder, date, source) |
| **Root cause** | `sessionNotesHandler.js:286` doesn't provide `filename`, `folder_context`, `upload_date_utc`, `transcript_source` |
| **Files to change** | `backend/src/helpers/slack/commands/sessionNotesHandler.js` — add missing variables |
| **Effort** | S (need to source values from the upload context — file name from Slack file object, folder from study config, date from `new Date()`) |
| **Risk** | Low |
| **Verification** | Upload a transcript → confirm metadata fields render in output |

### 3.5 `participant_tracker.yaml` observer data always empty

| Field | Value |
|-------|-------|
| **Bug it solves** | Observer table in participant tracker is always empty |
| **Root cause** | `participantYamlProcessor` always passes `session_observers: []` (line 504). Observer objects use `observers` (comma-joined string) not separate `observer_role` fields. |
| **Files to change** | `backend/src/helpers/slack/commands/participantHandler.js` — populate `session_observers` from actual observer data; align field structure with YAML expectations |
| **Effort** | M (need to query observer data and reshape it) |
| **Risk** | Medium — depends on how observer data is stored (DB vs GitHub) |
| **Verification** | Add observers to a session → run participant tracker → confirm observer table populates |

### 3.6 `github_issues_generator.yaml` missing repo context

| Field | Value |
|-------|-------|
| **Bug it solves** | GitHub Issues output has empty repository name and broken "View Issues" link |
| **Root cause** | `readoutHandler.js:360` doesn't provide `github_repository`, `max_issues`, or `github_repo_url` |
| **Files to change** | `backend/src/helpers/slack/commands/readoutHandler.js` — add repo context from env vars (`GITHUB_REPO`, `GITHUB_OWNER`) |
| **Effort** | S |
| **Risk** | Low |
| **Verification** | Run GitHub issues generation → confirm repo name and link render correctly |

### 3.7 Sentry crash on invalid DSN

| Field | Value |
|-------|-------|
| **Bug it solves** | 🟢 App crashes on boot if `SENTRY_DSN` is set to anything invalid (ALPHA_POLISH) |
| **Root cause** | Sentry init is not guarded on env var presence |
| **Files to change** | Wherever Sentry is initialized (likely `backend/src/app.js` or `backend/src/bin/www.js`) — wrap in `if (process.env.SENTRY_DSN)` |
| **Effort** | XS |
| **Risk** | Low |
| **Verification** | Boot app with `SENTRY_DSN=""` → confirm no crash |

---

## Section 4: Cosmetic / Dead Code

Lowest priority. No user-facing impact.

### 4.1 Remove `/civicmind` dead code

| Field | Value |
|-------|-------|
| **Bug it solves** | 🟢 ~225 lines of unreachable code in events.js (ALPHA_POLISH) |
| **Files to change** | `backend/src/helpers/slack/events.js` ~lines 115-339 |
| **Effort** | XS |
| **Risk** | Low — command is not registered in Slack app |

### 4.2 Remove duplicate `ask-study-modal` handler

| Field | Value |
|-------|-------|
| **Bug it solves** | 🟢 Dead code — second registration never fires (ALPHA_POLISH) |
| **Files to change** | `backend/src/helpers/slack/events.js` ~line 1108 |
| **Effort** | XS |
| **Risk** | Low |

### 4.3 Fix `docker-compose.yml` obsolete `version:` attribute

| Field | Value |
|-------|-------|
| **Bug it solves** | 🟢 Warning on every `docker-compose` command (ALPHA_POLISH) |
| **Files to change** | `backend/docker-compose.yml` — delete the `version:` line |
| **Effort** | XS |
| **Risk** | Low |

### 4.4 Audit `/syncfolder` and `/start-research` references in UI text

| Field | Value |
|-------|-------|
| **Bug it solves** | 🟢 Stale command names in help text (ALPHA_POLISH) |
| **Files to change** | Grep for `/syncfolder` and `/start-research` across all files |
| **Effort** | XS |
| **Risk** | Low |

### 4.5 Remove orphaned YAML templates

| Field | Value |
|-------|-------|
| **Bug it solves** | Dead templates with no JS handler (audit finding) |
| **Files to change** | `beta-test/YAML Templates/synthesize_router.yaml`, `participant_status_update.yaml`, `observer_request.yaml` |
| **Effort** | XS |
| **Risk** | Low — no code references them |

### 4.6 Clean up dead keys across all handlers

| Field | Value |
|-------|-------|
| **Bug it solves** | Code hygiene — JS passes variables that no YAML template reads |
| **Files to change** | Multiple handlers (see YAML audit "Dead keys" tables) |
| **Effort** | S (many small changes across files) |
| **Risk** | Low — removing unused variables |

### 4.7 Email `**bold**` → `*bold*` for Slack mrkdwn

| Field | Value |
|-------|-------|
| **Bug it solves** | 🟢 Email output contains raw `**text**` in Slack previews (ALPHA_POLISH) |
| **Files to change** | `beta-test/YAML Templates/participant_outreach.yaml` — lines 272, 274, 275. **Caveat:** The output is also saved to GitHub as proper Markdown. May need to convert at display time rather than in the template. |
| **Effort** | S (decide on strategy: Slack-only fix vs dual-format rendering) |
| **Risk** | Medium — if you change the template, GitHub-stored files lose proper bold formatting |

---

## Section 5: Recommended Fix Order

**Target: 1 week of effort.** Balances user impact, dependency order, and file-batching.

### Day 1: The XS batch (fixes 1.1–1.6)

All are one-line or one-word changes. Knock these out in a single session.

| Fix | Files touched |
|-----|---------------|
| 1.1 usability_issues key rename | `usability_issues_extractor.yaml` |
| 1.2 session_notes key rename | `session_notes.yaml` |
| 1.3 current_date systemic fix | `yamlProcessor.js` |
| 1.4 selected_study rename | `researchSynthesisHandler.js` |
| 1.5 stakeholder_synthesis name | `events.js` |
| 1.6 requestor_name fix | `requestResearchHandler.js` |

**Batch note:** 1.1 + 1.4 together fix the `/qori-synthesis` flow-blocker. 1.3 fixes dates across 6 templates at once. Deploy and test after this batch — it resolves 3 of the 🔴 bugs.

### Day 2: Flow-blocker investigation (fixes 2.1–2.3)

| Fix | Files touched |
|-----|---------------|
| 2.1 research_plan dates | `research_plan.yaml` |
| 2.2 brief wrong repo | `events.js` (plan handler section) |
| 2.3 request notification | `requestResearchHandler.js` |

**Batch note:** 2.2 and 2.3 require investigation before coding. 2.1 is a YAML-only change. Do 2.1 first, then investigate 2.2 and 2.3.

### Day 3: Remaining flow-blockers (fixes 2.4–2.6)

| Fix | Files touched |
|-----|---------------|
| 2.5 truncation fix | `langchain.js` |
| 2.6 notes append | `participantHandler.js` |
| 2.4 observer overwrite | `observeSessionHandler.js` |

**Batch note:** 2.5 may be a simple `max_tokens` bump — try that first. 2.4 requires the most investigation; if it touches DB schema, defer to Day 5.

### Day 4: Latent risks (fixes 3.1–3.4, 3.7)

| Fix | Files touched |
|-----|---------------|
| 3.2 user_findings | `events.js` |
| 3.3 session_date | `analyzeNotesHandler.js` |
| 3.7 Sentry guard | `app.js` or `www.js` |
| 3.1 desk_research vars | `events.js` |
| 3.4 transcript metadata | `sessionNotesHandler.js` |

**Batch note:** 3.2, 3.3, 3.7 are one-liners. 3.1 and 3.4 are small but need value sourcing decisions.

### Day 5: Stretch goals + verification

| Fix | Files touched |
|-----|---------------|
| 3.5 observer tracker data | `participantHandler.js` |
| 3.6 GitHub issues repo context | `readoutHandler.js` |
| 4.7 bold rendering strategy | `participant_outreach.yaml` |
| Full regression test | All `/qori-*` commands |

**Batch note:** If Day 3's observer fix (2.4) was deferred, combine it with 3.5 here — they touch related observer logic.

### Cosmetic (defer or do opportunistically)

Fixes 4.1–4.6 have zero user impact. Do them only if time permits after all verification passes. They're safe to batch into a single "cleanup" PR after alpha.

### Fixes that require schema changes or migrations

- **2.4 (observer overwrite):** ⚠️ May require a migration if observer storage is in a DB table and the schema doesn't support multiple observers per session. Investigate before committing to a fix.
- **3.5 (participant tracker observers):** Same risk — depends on observer data storage model.
- All other fixes are code/YAML only — no migrations needed.
