# Information Architecture

## Context model

Three nested contexts, always visible:

Organization → Project → Study

The TopBar answers "which organization" (agency identity + Qori mark). Breadcrumbs + PageHeader answer "which project / study / what am I looking at". The primary action in the PageHeader answers "what can I do next".

## Global navigation (SideNav)

Persistent left rail, order fixed:

1. **Home** — portfolio + my work
2. **Projects** — all projects (research programs)
3. **Studies** — cross-project study index
4. **Search** — unified search
5. **Ask Qori** — scoped Q&A over the authorized corpus
6. **Work Queue** — items needing action (badge count)
7. --- divider ---
8. **Admin** — visible only to org admins/owners; visually separated (see `admin-model.md`)

Sources, Evidence, Findings, and Outputs are **not** global nav items — they are study-context navigation. Exposing them globally would turn the nav into a database browser.

## Project context

Route: `/projects/:projectId`
Project page = program container: description, team, studies list, cross-study findings roll-up, outputs. Tabs: **Studies · Findings · Outputs · About**.

## Study context (the main research workspace)

Route: `/studies/:studyId`
Study shell with horizontal context tabs under the study header:

**Overview · Sources · Evidence · Findings · Outputs**

Secondary info (research questions, method, status, researchers, dates, progress, governance state) lives in the Overview via progressive disclosure — not spread across every tab.

## Breadcrumbs

`Org short name / Project / Study / [Entity]` — org crumb is implicit in TopBar on desktop; appears in crumb trail on narrow screens. Crumbs truncate middle-first; the current level is plain text, ancestors are links.

## Context switching

- Project/study switcher in the breadcrumb (click crumb → dropdown of recent + search).
- Recent work: Home shows last 5 touched studies/findings/artifacts.
- Pinning: studies can be pinned; pins appear under Home in the SideNav (max 5, then overflow).

## Entity routes (concept)

| Entity | Route |
|---|---|
| Home | `/` |
| Project | `/projects/:id` |
| Study | `/studies/:id` (tabs: `/sources`, `/evidence`, `/findings`, `/outputs`) |
| Finding | `/findings/:id` |
| Recommendation | `/recommendations/:id` |
| Artifact | `/artifacts/:id` |
| Search | `/search?q=…&scope=…` |
| Ask Qori | `/ask` (or panel over search) |
| Work Queue | `/queue` |
| Admin | `/admin/:section` |

Findings/recommendations/artifacts get canonical top-level routes (they outlive study navigation and get linked from Slack/GitHub), but always render with their study/project context bar.

## What is never in the IA

Database vocabulary (constructs, variables, cascade, embeddings), raw integration internals, per-agency custom sections.
