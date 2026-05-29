# Known Limitations

Operational edge cases and timing constraints identified during development.

---

## Session→Synthesis Timing

A synthesis run (affinity, personas, etc.) started within ~60s of a session summary commit may not see the latest session, due to GitHub API read latency between commit and readability.

**Not a scan defect** — confirmed by re-run with settled files (B-0.5 verification, 2026-05-28).

**Operational edge case** for back-to-back automated runs only. Manual workflows with natural human pacing are unaffected.

**Future consideration:** If synthesis is ever triggered automatically right after session capture, add a short read-after-write confirmation or retry.
