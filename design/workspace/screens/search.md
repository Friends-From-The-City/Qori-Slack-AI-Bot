# Screen: Search

**Route** `/search?q=&…` · **Purpose**: Unified retrieval across authorized corpus. Full model in `search-and-ask-qori.md`.

## Hierarchy
PageHeader-less: large search field (autofocus from ⌘K) → FilterBar (scope, entity type, status, tags, date, researcher†, stale) → scope/count line → grouped SearchResults → persistent "Ask Qori about these results" bar.

† researcher/method facets only where authorized.

## Data
Query, authorized facets with counts, grouped results (title, entity badge, study context, snippet+highlights, status, staleness), saved views.

## Interactions
Result → drawer (stay in results) or full page (modified-click/↗); facet chips removable; save view; Ask handoff carries query+filters as scope.

## States
Initial (recent searches + saved views), no results (spelling/widen suggestions + entity-type hints), thin results, partial-authorization note ("Some projects are excluded by your access"), search degraded (fallback to basic match, banner).

## Breakpoints
FilterBar → sheet at md; results single column; Ask bar docks bottom at sm.

## A11y
Search landmark; result count announced on update; groups labeled regions; highlight = bold not color-only; keyboard: arrows through results, Enter opens drawer.

## API
`GET /search?q&facets` (grouped, paged, authorized), saved views CRUD, facet-count endpoint.

## Unresolved
- Snippet source for evidence privacy (verbatim in results vs on open)
- Search analytics for taxonomy governance (admin visibility)
