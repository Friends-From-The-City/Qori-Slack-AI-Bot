# Flow: Review a Finding

**Actors**: Researcher/reviewer. **Entry**: Work Queue item ("3 findings need review"), Study → Findings tab, or Slack link.

1. **Open** — Finding detail (drawer from list, or full page from queue). Suggested treatment visible: dashed border, ✦ "Suggested by Qori from 12 evidence items".
2. **Verify evidence** — Lineage strip → backward section: evidence grouped by source; reviewer expands, reads verbatims with participant codes, checks staleness roll-up. *Checkpoint: disclosure pattern, quote semantics.*
3. **Decide** — Actions: **Accept finding** (becomes canonical; solid render; history records reviewer + time), **Edit** (modify statement; edit + provenance both retained), **Dismiss** (reason select; evidence stays, finding proposal archived).
4. **Cascade awareness** — If downstream drafts referenced this proposal, accepting/dismissing shows impact note ("2 draft recommendations reference this finding — they'll be flagged for review").
5. **Done** — Toast confirms; queue item clears; next queued finding offered ("Review next (2 remaining)").

**States**: stale evidence warning during review; permission denied (finding in inaccessible study — named, per states doc); already-reviewed conflict ("Alex accepted this 4 minutes ago — view result").

**Heuristics**: proposal ≠ accepted; recognition (evidence visible in-context); user control (edit/dismiss, no forced accept); batch efficiency (next-item flow).
