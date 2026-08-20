# Flow: Inspect Traceability

**Actors**: Researcher, research lead, stakeholder with access. **Entry**: any finding/recommendation/artifact — lineage strip or evidence count.

1. **Orient** — Lineage strip on the detail view shows the full chain with counts. Current node emphasized.
2. **Go backward** — Click "12 evidence" → TraceabilityPanel backward section: summary sentence, staleness roll-up, source-grouped expandable evidence list.
3. **Drill in** — Click an evidence item → EvidenceDrawer replaces panel content (back stack): full verbatim, participant code, source link, capture date, everything else this evidence supports.
4. **Go forward** — Panel forward section: recommendations (with status), artifacts (workflow + publication badges), GitHub handoff links.
5. **Cross-boundary hop** — Any hop can "Open full page ↗" to make that node the new context; strip re-centers.

**The five answers** (per `traceability-model.md`): why it exists, how much evidence, which studies/sources, staleness, downstream dependents — all reachable in ≤2 interactions from any construct.

**States**: partial lineage (pre-migration constructs may lack edges — show "Lineage incomplete for research created before [date]", never fake it); permission-gated hops (named); stale roll-up warning.

**A11y checkpoints**: strip = ordered list with per-segment counts in names; panel expansion via disclosure; drawer back stack announces; focus restoration on close.
