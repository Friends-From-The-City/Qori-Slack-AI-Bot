# Screen: Project

**Route** `/projects/:id` · **Purpose**: Program container — studies roll-up, cross-study findings, outputs.

## Hierarchy
PageHeader (breadcrumb Org/Projects · h1 project name · status meta · [New study]) → Tabs: **Studies · Findings · Outputs · About**.

- **Studies**: StudyCard grid (status, method, dates, evidence counts, staleness); filter by status.
- **Findings**: cross-study FindingCard list + FilterBar (study, status, tags, stale); this is the "institutional knowledge" view — findings outlive their studies.
- **Outputs**: artifacts table (title, type, study, workflow status, publication status, date).
- **About**: description, team, links; edit gated.

## Data
Project meta, studies[], cross-study findings (paged, filterable), artifacts[], memberships.

## States
Empty project (teach: create first study), archived project (read-only banner), permission-partial (studies user can't open render as named-but-locked rows).

## Breakpoints
Cards 3→2→1-up; tabs remain tabs at all sizes (scrollable tab bar at sm); outputs table → stacked cards at sm.

## A11y
Tabs pattern; h1 project name; each tab panel labeled; table semantics per DataTable.

## API
`GET /projects/:id`, `/projects/:id/studies`, `/projects/:id/findings?filters`, `/projects/:id/artifacts`.

## Unresolved
- Do projects have their own status lifecycle or derive from studies?
- Cross-project findings view (portfolio level) — v1.1?
