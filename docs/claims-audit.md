# Claims vs. Implementation

Every claim the system makes about its own behavior — in UI text, generated documents, ADRs, the design standard, and the patent-relevant architecture story — verified against what the code mechanically does.

**Maintained going forward:** Any new UI text or document template making a behavioral claim adds a row.

**Sources swept (2026-08-05):** All 30 modal builder `.ts` files, all 16 command handler `.ts` files, all 27 YAML `output_template` sections, all 27 ADRs, design standard, CLAUDE.md.

---

## Audit table

### Seed rows (known prior)

| # | Claim | Where it appears | What the code does | Status |
|---|-------|------------------|--------------------|--------|
| 1 | "All actions are logged for compliance" | `adminCenterModal.ts:128` | Stakeholder changes not logged until PR #229. Now all admin actions write audit rows. | TRUE |
| 2 | PII review "N items scrubbed ✓" | PII Review DM (`sessionNotesHandler.ts`) | Scrub is partial by design (name decomposition only). Checkmark implies completeness. | OPEN — assigned to PII redesign |
| 3 | "participant_metadata is cascade-required by research_readout so the cascade always receives a value" | Design standard R7 + §6.7 | Add Participant demographics never enter the cascade. `participant_metadata` is LLM-extracted from transcripts. | FALSE — correction in C2 PR #259 |
| 4 | participant_metadata extraction "traceable to upstream data" | `participant_metadata.yaml` schema | Extraction was inference-capable. Guard added. | FALSE → FIXED (PR #258) |

### Researcher-facing claims (modal text, DM text)

| # | Claim | Where it appears | What the code does | Status |
|---|-------|------------------|--------------------|--------|
| 5 | "This name is not stored — it's used only for find/replace, then discarded." | `sessionNotesModal.ts:216` | `piiRealName` never written to DB/log. Code comment confirms. | TRUE |
| 6 | "Files will be processed and committed to GitHub automatically." | `uploadNotesModal.ts:143` | **Dead code** — modal never imported or registered. Active flow quarantines first. | FALSE (dead code) |
| 7 | "Both paths trigger the observer guide DM." | `addObserverModal.ts:94` | `sendObserverGuideDM` called in both curated and self-join paths. | TRUE |
| 8 | "File types will be shown based on folder selection." | `uploadNotesModal.ts:106-109` | Same dead modal as #6. Folder-based filtering not implemented. | FALSE (dead code) |
| 9 | "Do not enter real names — use the system code for identity." | `addParticipantModal.ts:65` | No validation prevents real names. Field accepts any string. | MISLEADING — advisory, not enforced |
| 10 | "Anyone in the channel can click to self-join the selected sessions." | `addObserverModal.ts:80` | No server-side channel membership check. Depends on Slack visibility. | UNVERIFIABLE |
| 11 | "Define the research scope for stakeholder approval." | `researchBriefModal.ts:32` | Brief approval flow implemented. | TRUE |
| 12 | "Turns your brief into a stakeholder-ready plan" | `studySetupModal.ts:88` | Plan reads cascade from brief. TemplateContractError if missing. | TRUE |
| 13 | "Session script grounded in your objectives" | `studySetupModal.ts:105` | Discussion guide consumes `research_objectives` (required) from brief. | TRUE |
| 14 | "AI will organize everything for you!" | `sessionNotesModal.ts:190` | Manual notes go through AI generation tasks. | TRUE |
| 15 | "Qori extracts barriers, metrics, and knowledge gaps." | `discoverTypeModals.ts:31` | `desk_research.yaml` emits all three. | TRUE |
| 16 | "Qori extracts constraints, priorities, and alignment gaps." | `discoverTypeModals.ts:121` | `stakeholder_synthesis.yaml` emits `stakeholder_constraints`, `alignment_gaps`. | TRUE |
| 17 | "Pre-study research that informs your brief." | `discoverHubModal.ts:29` | Discovery outputs feed brief via handler checkbox selection. | TRUE |
| 18 | "Approval MOVES file from quarantine to final location." | `transcriptReviewModal.ts:137` | Handler: read quarantine → write final → delete quarantine. Confirmed. | TRUE |
| 19 | "Auto-scrub handles known names and patterns, but may miss…" | `transcriptReviewModal.ts:108-114` | ADR 0026 §2.2: declared limitation. Accurate. | TRUE |
| 20 | "✅ This transcript is now eligible for /qori-analyze." | `sessionNotesHandler.ts:959` | `pii_reviewed: true` set; analyze handler gates on it. | TRUE |
| 21 | "Reject — deletes from DB, nothing committed to git." | `sessionNotesHandler.ts:800` | DB delete only, no git operations. | TRUE |
| 22 | "Stakeholder who will approve this brief" | `researchBriefModal.ts:68` | Approval routes to stakeholder (owner fallback). | TRUE |
| 23 | Observer cap text | `addObserverModal.ts:94` | `canAddObserversToSession()` enforces at both paths. | TRUE |

### Generated document claims (YAML provenance blocks)

| # | Claim | Where it appears | What the code does | Status |
|---|-------|------------------|--------------------|--------|
| 24 | "This brief establishes the research scope for downstream templates." | `research_brief.yaml` provenance | Brief emits variables consumed as required by plan and guide. | TRUE |
| 25 | "cascade summary (always present)" | 8 YAML notes sections | Static Handlebars literal, no conditional. Shows declaration tables, not live state. | MISLEADING — literally true; implies dynamic data |

### ADR assertions

| # | Claim | Where it appears | What the code does | Status |
|---|-------|------------------|--------------------|--------|
| 26 | "Missing required variables throw TemplateContractError" | ADR 0007 | `yamlProcessor.ts:271-279` enforces. Tested. | TRUE |
| 27 | "`TemplateContractError` class in `backend/src/utils/yamlProcessor.js`" | ADR 0007 references | File is at `backend/src/helpers/yamlProcessor.ts`. | FALSE — stale path |
| 28 | "Drift impossible by construction" (cascade registry) | ADR 0021 | CI runs `build:cascade` + `git diff --exit-code`. Active. | TRUE |
| 29 | "unreviewed content has no eligible record" + defense-in-depth filter | ADR 0026 §2.4 | Both gates confirmed (`analyzeNotesHandler.ts:312`, `study-notes.service.ts:229`). | TRUE |
| 30 | "Rejected manual notes leave no trace anywhere" | ADR 0026 | DB delete only; no git write ever occurred (DB-held quarantine). | TRUE |
| 31 | "original quarantine commit remains in git history permanently" | ADR 0026 §6 | Transcripts committed to `.pending-review/` before review. Self-declared. | TRUE |

### Design standard claims

| # | Claim | Where it appears | What the code does | Status |
|---|-------|------------------|--------------------|--------|
| 32 | R1-R5, R9, R10, R12, R13 "**Status:** Enforced" | Design standard (9 rulings) | No automated test checks any ruling. Reflects manual sweep (PR #241), not CI. | MISLEADING — no regression guard |
| 33 | R7 demographics rationale (repeated in §6.7) | Design standard §6.7 | Same as #3 — false cascade justification. | FALSE — correction in C2 PR #259 |
| 34 | `any` budget assertion | CLAUDE.md | `pattern-enforcement.test.ts:147-171`: `expect(total).toBeLessThanOrEqual(215)`. | TRUE |

---

## Non-TRUE summary

| # | Status | Priority | Recommended action |
|---|--------|----------|--------------------|
| 2 | OPEN → REOPENED | **High** | #268 shipped honest-status block but spec item (d) shipped "Reject — needs source fix" as a close-button label with no handler, no note capture, no notification. Inert-control class. DM-swap PR fixes: reject handler with note → uploader DM, quarantine deletion, audit row. Old misleading footer (:155-158) and close-button label removed. |
| 3/33 | FALSE | **High** | §6.5/A1 rationale correction (in C2 PR #259) |
| 4 | FIXED | — | PR #258 merged |
| 6/8 | FALSE (dead) | Low | Delete `uploadNotesModal.ts` — dead code with false claims |
| 9 | MISLEADING | Medium | Advisory "don't enter real names" has no enforcement |
| 10 | UNVERIFIABLE | Low | Slack platform behavior |
| 25 | MISLEADING | Low | Static declaration, not dynamic reflection |
| 27 | FALSE → FIXED (#266) | Low | Stale ADR file reference — cosmetic |
| 32 | MISLEADING → FIXED (#266) | Medium | "Enforced" → "Verified by manual sweep (PR #241)" |
| 35 | PARTIAL | Medium | Generated documents conform to the writing style standard — standard ratified, enforcement pass pending |
| 36 | FALSE → FIXING | **High** | #268 spec item (c) states approval "writes to the disposition audit log with attestation recorded." Implementation was console.log at sessionNotesHandler.ts:955 — no persisted record. DM-swap PR wires to logDispositionAction (audit.service.ts:72), same store as admin actions. Closes with DM-swap PR number. |
