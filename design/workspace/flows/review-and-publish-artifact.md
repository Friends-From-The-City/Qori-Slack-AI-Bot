# Flow: Review and Publish an Artifact

**Actors**: Generating researcher, reviewer/approver (may be same person per org config). **Entry**: Work Queue ("Readout ready for approval"), Study → Outputs, Slack link.

1. **Generate** — From Study → Outputs → "Generate readout" (type select + audience). ProgressStepper: ✓ Gathering findings · ● Writing sections (3 of 7) · ○ Checking citations. Leave-safe.
2. **Read** — Artifact Review screen: ArtifactViewer with provenance rail. Reviewer reads in the Workspace — not GitHub.
3. **Verify claims** — Inline citation markers → provenance rail → EvidenceDrawer. Stale citations flagged inline.
4. **Decide** — **Approve** (workflow → Approved) · **Request changes** (comment required; Work Queue item for author; workflow → Draft with change notes) · **Edit** (tracked).
5. **Publish** — "Publish to GitHub" (enabled only when Approved). Dialog: destination repo/path, visibility consequence. PublicationStatus → Publishing… → Published ↗.
6. **Failure branch** — Publication fails: workflow badge stays **Approved**; separate red pill "Publication failed · Retry". Cause in plain language; member sees "ask your administrator" when the fix is admin-side (token, permissions). Retry is idempotent (ADR-0036).
7. **Supersede** — Regenerating creates v(n+1); prior version readable, watermarked Superseded; version history lists all.

**States**: generation failed at step (retry from step), reviewer conflict, superseded, archived, GitHub unreachable (publishing paused banner, research unaffected).

**Heuristic anchors**: workflow ≠ integration state; visibility of status; error recovery with named cause; no irreversible surprise (publish dialog states external visibility).
