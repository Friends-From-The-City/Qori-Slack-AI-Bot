# Search + Ask Qori

One retrieval system, two modes: **Search** (find things) and **Ask Qori** (answer questions over the same authorized, scoped corpus). They share scope, filters, and provenance — related surfaces, not two products.

## Search

Route `/search?q=&scope=&…`. Entry: TopBar field, `⌘K`, or SideNav.

**Filters** (FilterBar facets): free text · project/study scope · tags · entity type (study, source, evidence, finding, recommendation, artifact) · status · date range · researcher/method (only where authorized) · stale/current.

**Results**: grouped by entity type, each result shows title/statement, entity badge, study context line, snippet with bolded matches, status + staleness. Result count + scope always visible ("142 results in Project Alpha"). Saved views for recurring filter sets.

**Authorization**: the corpus is pre-scoped to what the user may see; the scope line makes this explicit rather than silently filtering.

## The handoff: Search → Ask Qori

A persistent affordance on results: **"Ask Qori about these results"**. It carries the current query + filters as the Ask scope. Mechanic:

search filters → define corpus → Ask Qori reasons over that corpus

Equally, from Ask Qori the user can widen/narrow scope with the same facet controls.

## Ask Qori

Route `/ask`, also available as a docked panel from Search. Never a floating chatbot; every answer is provenance-bearing.

**Anatomy of an answer**:
1. **Scope banner** (always first): "Answering from: Project Alpha · 3 studies · 214 evidence items" + Edit scope.
2. **Answer** with inline numbered citations.
3. **Supporting findings** — cards with status + evidence counts.
4. **Evidence counts** per cited finding ("cites 12 evidence items from 4 interviews").
5. **"Why these results"** disclosure — plain-language retrieval rationale (matched tags, scope, recency), not similarity scores.
6. **Traceability entry** — each citation opens the TraceabilityPanel for that construct.

**Trust rules**:
- If the corpus is empty/thin, say so before answering: "Only 2 evidence items match this scope — treat this answer as limited."
- Stale evidence used in an answer is flagged inline.
- Answers are never silently persisted as research constructs; "Save as note" is explicit and marked AI-assisted.
- Streaming answer with staged status ("Reading 214 evidence items… Drafting answer…"), cancellable.

## States

Empty scope (teach scoping), no results (offer to widen), unauthorized scope segments (named, not hidden), degraded AI provider (banner: "Ask Qori is unavailable — search still works"), long-running (staged progress per `interaction-model.md` §4).

## Data contract

Search: query, facets (authorized), grouped results with refs. Ask: scope descriptor + corpus counts, streamed answer, citation map (marker → construct ref), retrieval rationale summary, degraded flags.
