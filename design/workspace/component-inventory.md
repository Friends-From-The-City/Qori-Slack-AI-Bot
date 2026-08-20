# Component Inventory

Format per component: **Purpose · Anatomy · Variants · States · Interaction/Keyboard · Responsive · A11y · Data contract**. Universal states (hover/focus/loading/disabled/etc.) follow `states-and-feedback.md`; only component-specific states are listed.

---

## AppShell
- **Purpose**: Frame for all screens: TopBar + SideNav + main + optional right panel.
- **Anatomy**: skip link · TopBar · SideNav · `main` · right-panel slot · toast region · live regions.
- **Variants**: research (default), admin (visually separated — see `admin-model.md`).
- **Interaction**: manages one overlay at a time (drawer OR dialog); `⌘K` palette.
- **Responsive**: per `responsive-layout.md` shell table.
- **A11y**: landmark map owner; skip link first-focusable; focus restoration registry.
- **Data**: org identity (name, short name, logo), current user, nav badge counts.

## SideNav
- **Purpose**: Global navigation + pinned studies.
- **Anatomy**: org/product lockup · nav items (icon + label + badge) · pinned section · Admin (separated by divider, gated) · collapse toggle.
- **Variants**: expanded 264px, icon rail 64px, mobile sheet.
- **States**: item current (`aria-current="page"`, yellow start-marker + selected surface), badge count.
- **Keyboard**: arrow keys between items; Enter activates; collapse toggle announced.
- **A11y**: `nav` labeled "Main"; rail icons have tooltips + accessible names; badge counts in accessible name ("Work Queue, 4 items").
- **Data**: nav model, queue count, pinned studies (id, name), admin visibility.

## TopBar
- **Purpose**: Org identity, search entry, user menu, environment banner slot.
- **Anatomy**: agency lockup ("Dept of Example · Qori Research Workspace") · search field (⌘K) · notifications-free (queue lives in nav) · user menu.
- **A11y**: `banner`; search labeled; user menu is a disclosure menu button.
- **Data**: branding config, user, session state.

## Breadcrumbs / ContextSwitcher
- **Purpose**: Answer "where am I"; switch project/study without leaving flow.
- **Anatomy**: crumb trail; each ancestor crumb is a menu button (recent + type-ahead of siblings).
- **Responsive**: middle-truncation at md; at sm shows only parent + current.
- **Keyboard**: crumb menus are standard menu-button pattern.
- **A11y**: `nav` labeled "Breadcrumb"; current page `aria-current`.
- **Data**: ancestry chain (org→project→study→entity), recents, sibling lists.

## PageHeader
- **Purpose**: Screen title, context metadata, primary action.
- **Anatomy**: breadcrumbs · h1 · status badges/meta row · action group (1 primary, ≤2 secondary, rest in ⋯).
- **Variants**: default, condensed (sticky on scroll), with tab bar.
- **Responsive**: actions collapse into ⋯ at md; meta wraps.
- **Data**: title, meta, actions (with permission flags).

## Card / MetricCard / StudyCard / FindingCard / RecommendationCard
- **Purpose**: One card grammar. Card = container; Metric = number + label + delta; Study = study summary; Finding/Recommendation = construct summaries.
- **Anatomy (construct cards)**: statement (2-line clamp) · StatusBadge · evidence count ("12 evidence · 4 sources") · tags (≤3 + overflow) · StaleIndicator slot · study context line.
- **Variants**: default, compact (list row), suggested (AI treatment).
- **States**: suggested (dashed + ✦), stale, archived (muted).
- **Interaction**: whole card clickable → drawer; inner links/chips are discrete targets; Enter opens.
- **Keyboard**: card is single tab stop (role link/button); inner actions reachable with tab.
- **A11y**: accessible name = statement + status ("Finding, needs review: …"); metrics announce label then value.
- **Data**: id, statement/title, status, counts, tags[], staleness, study ref, permissions.

## EvidenceItem
- **Purpose**: One evidence unit (verbatim + context).
- **Anatomy**: quote/observation · participant code (mono) · source link · tags · staleness.
- **Interaction**: click → EvidenceDrawer with full context + lineage.
- **A11y**: quote marked up with `blockquote` + cite; participant codes get expanded accessible text ("Participant P07").
- **Data**: id, text, participant code, source ref, capture date, tags, downstream refs.

## TagChip
- **Purpose**: Retrieval signal, not truth.
- **Variants**: system taxonomy (solid neutral), researcher (outlined), AI-suggested (dashed + ✦, Accept/Dismiss on focus/hover).
- **States**: interactive (filter), removable (in editors), suggested-pending.
- **Keyboard**: chip = button; suggested chips expose Accept/Dismiss as buttons in a labeled group.
- **A11y**: names include kind ("Suggested tag: trust — not yet accepted").
- **Data**: label, kind, accepted?, mapping (for AI-proposed → taxonomy).

## FilterBar
- **Purpose**: Scoping lists/search.
- **Anatomy**: filter menus (scope, type, status, tags, date, researcher, staleness) · active-filter chips · Clear all · saved views.
- **Responsive**: collapses to "Filters (n)" sheet at md.
- **A11y**: active filters announced on apply ("Filtered: 24 results"); each removable chip a button.
- **Data**: available facets (authorized), active filters, result count.

## StatusBadge
- **Purpose**: Workflow state.
- **Variants**: Draft, Needs review, Accepted, Approved, Published, Archived (+ Candidate for AI-proposed).
- **A11y**: icon + label always; color never alone.
- **Data**: status enum.

## StaleIndicator
- **Purpose**: Evidence age warning, decoupled from status.
- **Anatomy**: clock icon + duration text; tooltip with capture date and what "stale" means here.
- **Data**: oldest evidence date, staleness threshold source (governance config).

## TraceabilityPanel
- **Purpose**: Backward/forward lineage without a graph. See `traceability-model.md`.
- **Anatomy**: lineage strip · backward section (evidence rolled up by source/study, expandable) · forward section (recommendations, artifacts, handoffs) · staleness roll-up.
- **Variants**: docked panel (384px), drawer section, full-page tab.
- **Keyboard**: strip segments are buttons; expandable rows use disclosure pattern.
- **A11y**: strip is an ordered list "Lineage from study to artifact"; counts in names.
- **Data**: lineage chain with counts per hop, staleness roll-up, downstream refs + their statuses.

## EvidenceDrawer / Drawer
- **Purpose**: Detail-in-context; one at a time with internal back stack.
- **Anatomy**: header (title, Open full page ↗, close) · content · footer actions.
- **Keyboard**: focus trap; Esc closes; focus restores to trigger; internal back = Backspace-safe button.
- **A11y**: `dialog` `aria-modal`, labeled; back stack announces content change.
- **Data**: entity ref + hydration endpoint.

## ArtifactViewer
- **Purpose**: Read/review Qori-generated documents in the Workspace (GitHub is handoff, not the reading surface).
- **Anatomy**: document pane (rendered markdown) · provenance rail (citations → evidence) · version bar (v3 · Supersedes v2) · review footer.
- **States**: draft, needs review, approved, published, superseded, publication-failed overlay pill.
- **Interaction**: citation markers in the document link to provenance rail entries → EvidenceDrawer.
- **Responsive**: provenance rail becomes a tab at md/sm.
- **A11y**: document is real semantic HTML (headings, lists, tables); citations are links with context.
- **Data**: artifact body, citations→evidence map, versions, workflow status, publication status.

## PublicationStatus
- **Purpose**: External adapter state, visually separate from workflow status.
- **Variants**: Not published, Publishing…, Published (link ↗), Failed (Retry), Retrying.
- **A11y**: failure copy explicitly scopes to publication.
- **Data**: adapter (GitHub/Jira), state, last attempt, target URL, retry token.

## ProgressStepper
- **Purpose**: Staged AI progress (see `interaction-model.md` §4).
- **Anatomy**: task title with counts · steps (done ✓ / current ● animated / pending ○ / failed ✕) · leave-safety note · Cancel/Retry.
- **States**: queued (position shown), running, partial, failed-at-step, completed, cancelled-partial.
- **A11y**: `role=status` polite announcements per step change; not a progressbar unless % is real.
- **Data**: task id, steps[], current, counts, cancellable?, retryable?.

## WorkQueueItem
- **Purpose**: Actionable item.
- **Anatomy**: type icon · statement ("3 findings need review") · context line · primary action button · age.
- **Variants**: review, approval, failure (retry), governance, informational (completed background task).
- **Interaction**: primary action inline; row → relevant screen/drawer.
- **Data**: kind, refs, action, created, priority.

## EmptyState / ErrorState / Skeleton
Per `states-and-feedback.md`. Skeleton variants: card, row, text-block, document.

## Toast / Dialog / Popover / Tabs / DataTable
- **Toast**: own-action confirmations only; polite live region; pausable 6s.
- **Dialog**: consequence-specific copy; focus trap; primary action named for the verb.
- **Popover**: non-modal, Esc closes, focus returns.
- **Tabs**: study shell + admin sections; roving tabindex; tab panels lazy-load with skeletons.
- **DataTable**: column priority (P1/P2/P3) for responsive drops; sortable header buttons; row = drawer trigger; sm renders stacked cards; selection column optional with batch bar.

## SearchResults
- **Purpose**: Mixed-entity results with scope clarity.
- **Anatomy**: result groups by entity type · per-result: title, entity badge, study context, snippet with highlight, status/staleness · "Ask Qori about these results" handoff.
- **A11y**: results count announced; groups are labeled regions; highlights not color-only (bold).
- **Data**: query, facets, grouped results, authorization scope note.

## AskQoriPanel
- **Purpose**: Scoped Q&A with provenance. See `search-and-ask-qori.md`.
- **Anatomy**: scope banner ("Answering from: Project Alpha · 3 studies · 214 evidence items") · question input · answer with inline citations · supporting findings list · "Why these results" disclosure · trace entry.
- **A11y**: streaming answer in polite live region chunked by paragraph; citations are links.
- **Data**: scope descriptor, corpus counts, answer, citations→construct refs.

## AdminForm
- **Purpose**: Org/admin configuration.
- **Anatomy**: section header · field groups (label-above, 720px max) · save bar (sticky, dirty-state aware) · per-field help.
- **A11y**: USWDS form behaviors; error summary focus; no raw credentials shown (masked, "Rotate" actions only).
- **Data**: config schema per section, permissions, validation.

## FileUpload
- **Purpose**: Source ingestion (transcripts, notes, recordings-as-text).
- **Anatomy**: dropzone + browse button · file list with per-file staged progress (upload → privacy check → ready) · PII notice.
- **States**: uploading, privacy-checking, needs privacy review, ready, failed (reason + retry).
- **A11y**: dropzone has button alternative; per-file status announced; progress per file, not global.
- **Data**: accepted types, privacy policy ref, per-file status.
