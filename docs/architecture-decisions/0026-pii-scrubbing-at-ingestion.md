# ADR 0026: PII Scrubbing at Ingestion

- **Status:** Accepted *(implementation claims verified against committed code — see §8)*
- **Date:** 2026-06-19
- **Deciders:** Lapedra Tolson (owner)
- **Related:** ADR 0025 (Records Management — disposition, retention, legal holds)
- **Note:** During the §8 verification of this ADR, a transcript-write path bug was discovered (the handler hardcoded `03-sessions/` instead of the canonical folder constant, making approved transcripts invisible to the readout scanner). It was fixed in commit `a707647d` before acceptance; this ADR and that fix land together. See §6.1.

---

## 1. Context

Qori ingests session evidence — moderated-session transcripts and researcher manual notes — and runs it through the cascade (nuggets → themes → findings). That evidence is the source material the entire provenance chain is built on.

A transcript uploaded during testing was found to contain a participant's real name throughout the document (full name, first name used conversationally, speaker-label initials, and a phone number), and it had been committed to the `qori-studies` repository unscrubbed. This is the precise failure the system's privacy model exists to prevent — a real identity entering the system — except it arrived through the **ingestion path** rather than through any field designed to hold identity.

The root cause was a seam between two individually-correct designs:

- An existing redaction routine assumed the participant's **real name** lived in the `participant_name` field.
- The privacy model (consistent with ADR 0025) deliberately treats `participant_name` as an **optional private alias** ("Veteran A") with explicit guidance *not* to enter real names. Identity is carried by the system-assigned `participant_code` (e.g., `PT-001`).

Because the redaction routine matched against the alias rather than the real name, the real name passed through unscrubbed. Neither design was wrong in isolation; the gap was at the boundary between them.

This ADR governs the **ingestion boundary**: how evidence is cleaned of PII and gated before it is permitted to persist or enter the cascade. It is distinct from, and complementary to, ADR 0025, which governs the **lifecycle boundary** (how data already in the system is retained, held, and disposed of). The two share one privacy posture — *no real names, owner-controlled* — enforced at two different points.

---

## 2. Decision

Qori scrubs PII at ingestion under five principles:

### 2.1 Transient real-name capture — never stored

At upload, the researcher (who already knows the participant's identity) provides the participant's real name **for scrubbing purposes only**. This value is used in memory to find-and-replace the name out of the content, then discarded. It is never written to the database, logs, error messages, temporary files, or persisted modal state.

This preserves the no-real-names design (nothing is stored) while giving the scrubber the actual string it needs to match — solving the seam in §1, where matching against the alias failed.

### 2.2 Auto-scrub is partial **by design**

Automated scrubbing handles **known and structured** PII only:

- The captured participant name, decomposed into all forms — full name, first name alone, last name alone, and honorific + last name — each replaced with the participant code.
- Speaker labels (e.g., participant/moderator initials) normalized to role tokens (`[Participant]`, `[Moderator]`).
- Phone numbers and email addresses replaced with placeholder tokens (`[PHONE]`, `[EMAIL]`).

Automated scrubbing **cannot** catch **incidental free-text PII** — names, locations, or dates a participant volunteers mid-session ("my wife Sarah," "the Denver VA," "my birthday is…"). Detecting these reliably would require named-entity recognition, which is out of scope. This limitation is **declared, not pretended-solved**.

### 2.3 Human review is the safety boundary, not a backup

Because §2.2 is partial by design, **human review of the full content is the primary control**, not a fallback to the scrubber. The reviewer reads the complete (not truncated) content and is responsible for catching the incidental PII that automation structurally cannot. Automation assists; the human decides.

The system must therefore make full-content review genuinely possible — a truncated preview that the reviewer cannot read in full is not review, and is unacceptable.

### 2.4 The gate precedes the commit — review gates, it does not follow

Unreviewed content must not be reachable by the cascade and must not be treated as cleared. Approval is the act that promotes content from a quarantined, not-yet-eligible state to a final, analyzable one. Approval moves and clears; it does not merely flip a flag on already-committed content.

Enforcement is layered:
- **Primary:** unreviewed content has no eligible record, so analysis (`/qori-analyze`) cannot find or select it.
- **Defense-in-depth:** the analysis selection surface additionally filters to reviewed-and-approved content only.

### 2.5 Git receives only approved content; review surface scales by content type

Version control must contain only reviewed-clean content. How quarantine is held differs by content size, because the review surface must show the **full** content (§2.3):

- **Manual notes** (short): held in the database (`pending_content` on `study_notes`) until approval; reviewed **inline** in Slack; written to git **for the first time on approval**, to `03-fieldwork/sessions/{session_id}/`. Rejected notes are deleted from the database and **leave zero git footprint**.
- **Transcripts** (long): currently held in a git quarantine path (`.pending-review/`) and reviewed via a link to the full file; on approval written to `03-fieldwork/transcripts/` (the canonical location scanned by the readout). This is a known residual (§6) — transcripts are too long to review inline in Slack, and the eventual target is to hold them outside git (matching manual notes) and serve the full text for review via a non-git mechanism, so that git receives transcripts only on approval as well.

---

## 3. Rejected Alternatives

**Add a stored real-name field (`contact_name` / `legal_name`).**
Rejected. This reverses the system's deliberate no-real-names design and pulls participant identities into the DSAR / retention / disposition scope governed by ADR 0025 — solving an ingestion leak by creating a permanent identity store. Transient capture (§2.1) achieves reliable scrubbing without persisting identity.

**Regex-only scrubbing (no captured name).**
Rejected. Without the captured name, automation cannot know *which* name in the text is the participant's — it will either miss the name or over-fire on unrelated words. Regex is retained only for genuinely structured patterns (phone, email) and as a supplement, not the primary mechanism.

**Save to the final location, then mark as reviewed ("review-follows-commit").**
Rejected. This was the original manual-notes behavior: notes were written directly to git and auto-stamped as reviewed with no human review. It makes the review a rubber stamp on already-committed content and ships unreviewed PII to a permanent store with a false "reviewed" claim. Review must **gate** the commit (§2.4), not follow it.

---

## 4. Consequences — Positive

- The leak class in §1 is closed: the scrubber matches the real name (via transient capture), not the alias.
- Unreviewed content cannot enter the cascade (§2.4), and for manual notes cannot enter git at all (§2.5).
- Rejected manual notes leave no trace anywhere — no database row, no git history.
- PII state is **verifiable, not merely asserted**: a greppable marker on quarantined content means "is unreviewed content loose anywhere?" is answerable by search rather than by trust. *(Enables a future CI check that fails if a pending marker appears in a final location.)*
- The posture is **honestly bounded** for federal review: the system claims it scrubs *known* PII automatically and *requires human review* for the rest — not that ingested content is guaranteed PII-free.

## 5. Consequences — Negative / Known Limitations

- **Incidental free-text PII is not auto-detected** (§2.2) and depends on human review. This is the designed limitation, not a defect to be silently relied upon.
- **Over-scrubbing risk** from aggressive name decomposition: scrubbing a common name fragment (e.g., a last name that is also a common word) can replace unrelated text. Full-content human review (§2.3) is also the backstop for over-redaction, not only under-redaction.
- **Speaker-label normalization is best-effort** across transcript formats; unfamiliar formats may not normalize, and human review is the backstop.

## 6. Known Residual — Transcript Git History

Transcripts currently use a **git quarantine path** (§2.5): the scrubbed-but-not-yet-human-reviewed transcript is committed to `qori-studies` *before* review. Consequently, even after a transcript is edited or rejected, the original quarantine commit — which may contain incidental PII that auto-scrub did not catch — remains in git history permanently.

This residual is **bounded**: the repository is private with limited collaborators, and the content is already auto-scrubbed (structured PII removed), so the exposure is incidental PII in scrubbed test transcripts, readable only by authorized collaborators via history.

**Planned closure (Option 2):** move transcript quarantine off git (mirroring the manual-notes database approach) and serve the full text for review via a non-git, access-controlled mechanism, so git receives transcripts only on approval. This work is to be built deliberately, with explicit security treatment of any endpoint that serves unreviewed content (session-bound rather than bearer access, no logging of access URLs, no-store caching, HTTPS-only).

**Decision (2026-08-05):** Option 2 ships before the first study with external participants; internal studies proceed on the current bounded residual.

**Blocking dependency (2026-08-05):** The rescrub loop currently writes each iteration as a new quarantine commit, so over-redaction from the rescrub is recoverable via repo history. When Option 2 moves quarantine off git, that recovery path disappears and over-redaction becomes irreversible. **Option 2 must ship WITH a preview-before-commit step in the rescrub loop** — reviewer sees per-term match counts and confirms before the write. This is a blocking dependency, not a backlog item.

### 6.1 Path bug found and fixed during verification

While verifying this ADR's claims against code (§8), the transcript-write path was found to be **hardcoded to `03-sessions/`** in the upload handler, bypassing the canonical folder constant `STUDY_FOLDERS.FIELDWORK_TRANSCRIPTS` (`03-fieldwork/transcripts/`). The readout scanner reads `03-fieldwork/transcripts/`, so **approved transcripts were written to a location the readout never scanned** — a traceability break: the evidence existed but was invisible to the stage that assembles findings.

This was introduced during rapid PII-scrubbing development (the handler did not import the folder constants). It was corrected in commit `a707647d` (handler now uses `STUDY_FOLDERS.FIELDWORK_TRANSCRIPTS`), orphaned test transcripts in `03-sessions/` were removed, and the round-trip was re-proven: an uploaded + approved transcript landed in `03-fieldwork/transcripts/` and was found by `/qori-readout` (the readout located it and proceeded to cascade processing — the remaining "missing nuggets" state is expected, since analysis had not yet been run; it confirms the file was *found*, not missing). The fix and this ADR are committed together.

---

## 7. Relationship to ADR 0025

| | ADR 0025 — Records Management | ADR 0026 — Ingestion Scrubbing (this) |
|---|---|---|
| **Question answered** | Once data is in the system, how is its lifecycle controlled? | How is PII prevented from entering the system, and gated before it persists? |
| **Boundary** | Retention / disposition / hold | Ingestion |
| **Mechanisms** | Owner-gated deletion, disposition audit log, legal holds | Transient-capture scrub, quarantine, review-gates-commit |
| **Shared posture** | No real names, owner-controlled | No real names, owner-controlled |

The two ADRs enforce one privacy posture at two enforcement points and should be read together.

---

## 8. Implementation — Verified Against Committed Code

*Each claim below was confirmed against committed source (file:line evidence), not reconstructed from discussion. This verification is the basis for the Accepted status.*

| Claim | Evidence (file:line) | Result |
|---|---|---|
| Quarantine marker string | `sessionNotesHandler.ts:480` (`<!-- PII-STATUS: PENDING-REVIEW -->`), `:490` (`**PII Status:** Auto-scrubbed, pending human review`) | Confirmed |
| `pii_reviewed` set true **only** in approval handlers | `:848` (transcript approve), `:959` (manual-notes approve); no other `=true` in application code (tests only) | Confirmed |
| Manual-notes quarantine column `pending_content` on `study_notes`; cleared on approve, row deleted on reject | `study_notes.ts:39`; migration `20260618200000-add-pending-content-to-study-notes.js`; cleared `:962`; deleted `:1036` | Confirmed |
| Transcript quarantine path `.pending-review/` | `sessionNotesHandler.ts:507` | Confirmed |
| Final transcript path `03-fieldwork/transcripts/` (via `STUDY_FOLDERS.FIELDWORK_TRANSCRIPTS`) | `sessionNotesHandler.ts:510` → `folderStructure.ts:37` | Confirmed *(corrected from hardcoded `03-sessions/` — see §6.1)* |
| Final notes path `03-fieldwork/sessions/{session_id}/` | `session_notes.yaml:204` | Confirmed |
| Gate: unreviewed content blocked from analysis (handler) + defense-in-depth filter (service) | `analyzeNotesHandler.ts:312` (handler gate on `!pii_reviewed`); `study-notes.service.ts:229` (`pii_reviewed: true` WHERE filter) | Confirmed |
| Approve performs the **first** git write | `sessionNotesHandler.ts:952-953` ("FIRST git commit — clean history") | Confirmed |
| Reject leaves **zero** git footprint | `sessionNotesHandler.ts:1036` (DB delete only, no git ops) | Confirmed |
| Scrub coverage: name decomposition (full/first/last/honorific), speaker labels, phone, email | `transcriptScrubber.ts:62-96` (decomposition), `:186,189` (`[Participant]`,`[Moderator]`), `:209,214` (`[PHONE]`), `:220` (`[EMAIL]`) | Confirmed |
| Participant name replaced with the **participant code** (not a generic token) — preserves traceability | `transcriptScrubber.ts:162` | Confirmed |
| Transient real name **never persisted** (no DB, log, error, temp, or modal metadata); Sentry scrubs it | `sessionNotesHandler.ts:432-433` ("Do NOT log"), `:556` ("out of scope — NEVER stored"); `sentry.js:50` (scrubs `real_name`) | Confirmed |
| Readout round-trip: approved transcript found by `/qori-readout` | Manual test — transcript in `03-fieldwork/transcripts/` located by readout scanner (traceability break closed; see §6.1) | Confirmed |
