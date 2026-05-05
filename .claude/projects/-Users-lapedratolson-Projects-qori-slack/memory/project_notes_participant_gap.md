---
name: /qori-notes participant visibility and observer flow
description: Architectural gap — participants only visible in /qori-notes after observer flow completes; study scaffold uses single-file API
type: project
---

## Observer flow (current behavior, confirmed 2026-05-04)

1. Researcher adds 2+ participants via `/qori-participants`
2. Observe CTA appears in Slack channel
3. Someone submits observer notes through the observe flow → creates `SessionObserver` record with `status='approved'`
4. Only THEN does `/qori-notes` see the participants (it queries `SessionObserver WHERE status='approved'` joined to `StudyParticipant`)

This works but is a chicken-and-egg problem: the researcher who added participants has to go through the observer flow before they can upload notes via `/qori-notes`.

**Why:** `/qori-notes` modal has no study dropdown — it shows a sessions dropdown populated from `SessionObserver` records, not `StudyParticipant` records directly. No observer record = invisible participant.

**Open question:** Is there a `/qori-observe` slash command, or is the observe CTA in the channel the only entry point? Need to verify.

**How to apply (when ready to fix):**
- Option A: Auto-create SessionObserver when participant is added (simplest)
- Option B: Add fallback direct-participant dropdown in notes modal when no observer sessions exist
- Option C: Let the lead researcher bypass the observer requirement
- Secondary bug: study_participant.service.js:15 checks duplicate by participant_name without study_id filter

## Study folder scaffold (separate issue, same session)

`copyFilesToFolder()` in github.js:37-85 creates template files one-by-one via GitHub Contents API (`createOrUpdateFileContents`). Each file = separate commit. ~11 files = ~11 commits appearing one-by-one in the repo.

**Fix when ready:** Use Git Trees API (`octokit.git.createTree` + `createCommit`) to batch all scaffold files into a single commit.

**Key files:** briefHandler.js:67-74, createStudyHandler.js:180-187, github.js:37-85
