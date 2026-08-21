# Screen: Research Brief form (P0)

Route: /studies/:id/brief/new (creates the study — Phase 2D). Contract: research-brief.md.

DERIVED: project context (header), approver (read-only: "Approver: {name} ({role}) — set in project settings"), lead researcher (session auth; NO field), study name (= project slug; not asked).
PREFILLED (provenance-labeled, editable): problem statement <- project . learning objectives <- discovery stakeholder questions (first 3) . methodology <- discovery recommendation (8 options + custom-method text) . out of scope <- barrier coverage . participant approach <- hints (category-level only) . start date <- next Monday.
MUST ASK: decision deadline . budget (opt) . recruitment sources (opt).
Discovery source picker: checkboxes of existing discovery artifacts (all pre-selected), each opens in peek — this is deliberate source selection (F10), lineage records the hop.
Submit -> generation (inline narrative progress) -> brief detail with PENDING APPROVAL banner; approver notified in work queue.