# Flow: Search and Ask

**Actors**: Any authorized user. **Entry**: ⌘K, TopBar search, SideNav Search/Ask Qori.

1. **Search** — Query "appointment scheduling"; results grouped by entity type; scope line "142 results across 2 projects".
2. **Narrow** — FilterBar: scope to Project Alpha, entity type = findings, status = accepted, exclude stale. Result count updates and announces.
3. **Handoff** — "Ask Qori about these results" → Ask panel opens with scope banner: "Answering from: Project Alpha · accepted findings · current evidence · 23 items". The corpus IS the filtered result set.
4. **Ask** — "What are the main barriers to scheduling for older veterans?" Staged status ("Reading 23 findings… Drafting answer…"), streaming, cancellable.
5. **Verify** — Answer with numbered citations → supporting findings cards → "Why these results" disclosure → any citation opens TraceabilityPanel down to verbatim evidence.
6. **Keep** — Optional "Save as note" (explicitly marked AI-assisted, scoped to study/project); answers are never silently persisted.

**States**: thin corpus warning before answering; no results (widen suggestions); unauthorized segments named; AI unavailable (search still works — degraded banner); long queue (position shown).

**A11y checkpoints**: result count live announcement; streamed answer chunked into polite live region; citations are real links; scope banner precedes answer in DOM order.
