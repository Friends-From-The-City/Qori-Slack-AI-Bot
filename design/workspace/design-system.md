# Design System — Visual Language

Qori's own design language: contemporary, calm, product-led. USWDS is the behavioral/accessibility foundation (focus, forms, banners, tables), **not** a visual template. Tokens are semantic and agency-themable (`design-tokens.json`, `branding-model.md`).

## Type

- **One family**: Public Sans (400/500/600/700) — USWDS-native, agency-familiar, modern. Headings use 600/700: H1 28/34, H2 22/28, H3 18/24, H4 15/20. Body 15/24, secondary 13/20, caption 12/16 — generous leading; prose never below 1.5.
- **Mono** (IDs, counts in trace contexts): system mono stack, 13/20.
- Minimum body size 13px; no text below 12px.
- **Age ramp (product-wide):** pending-item ages render inline in the meta line, mono, colored progressively by age: <24h `text-muted`, 1–2d `text-meta` #44423C, 3–5d warning #9A6A00, >5d error #B3372B. Urgency reads as a temperature, never a red alarm; items at warning or older also carry the word "aging" so the state is named, not color-alone (tooltip explains thresholds).
- **Commit-action verbs (product-wide):** there is no separate "push"/"save" button style — every committing action uses the primary ink button, one per surface, named for its verb: Generate (documents), Publish (GitHub projection), Retry (failed projection), Create N issues (tickets), Approve, Accept, Save changes (admin forms). "Push" never appears in researcher UI (content-design). Entry points: Publish/Retry live on the artifact (viewer header + Outputs row); Create tickets lives on each audience readout's Outputs row and in its viewer.
- **Peekable counts (product-wide):** any count summarizing inherited or derived content ("3 learning objectives", "12 evidence items", "4 themes") is a peek trigger — dotted underline, hover/focus expands the items in a peek card, explicit action opens the source document. A count that can't expand is dead text.
- **Labeled values (product-wide):** a mono label and its value are never separated by literal text spaces — stack label over value with a 4px gap, or row them with an 8px flex gap. Custody bands stack each segment (label above, value below), segments 32px apart. Values name documents in human words (linked), IDs as trailing mono chips.
- **Scale discipline (product-wide):** every padding, margin, and gap comes from the space scale (4/8/12/16/24/32/48/64) — no 14/18/20/22px in-betweens; side panels use their layout tokens (trace/context panel 384px, drawer 480px); content aligns to the 12-col grid, 24px gutter. Off-scale values are defects, in mockups and implementation alike.
- **Glyph weight (product-wide):** directional glyphs (→ forward links, ▾ selects, ✂ seams) render in text tones — `text-muted` #5C594F minimum — never in border greys (#C9C5BA is for borders/dividers only; too light as a glyph).
- **Trailing metadata (product-wide):** timestamps and version markers never trail inline after a title — they right-align in mono `text-meta` on the same row ("Research Readout … v3 · 1d"), nowrap. Titles stay clean, metadata scans as a column.
- **Metadata legibility (product-wide):** small mono metadata (timestamps "viewed 2h", counts, IDs) uses `text-meta` #44423C — darker than `text-muted` — and never renders below 11px. `text-muted` #5C594F is for secondary prose only, never for the smallest text on a surface.
- **Heading-to-body spacing (product-wide):** a heading never sits closer than `space.3` (12px) to its following content; page-level headings (H1/H2) get `space.4` (16px) before their first block. Inside cards, title-to-body is ≥8px. Headings may sit tight to their own eyebrow/meta line (4px), never to body copy.
- **List-row pattern (product-wide):** two-line rows (title + meta) always set explicit leading — title `line-height: 1.5`, meta `line-height: 1.6` with ≥4px top margin from the title. Never rely on default/inherited line-height in dense lists (queue rows, study cards, evidence rows, search results).

## Color

Warm-neutral base + Qori brand yellow used sparingly as identity, never as text.

- **Paper** `#FAF9F7` (app background), **Surface** `#FFFFFF` (cards), **Surface-muted** `#F3F1ED`.
- **Ink** `#1A1915` (text), **Ink-muted** `#5C594F`, **Border** `#E5E2DA`.
- **Brand yellow** `#FFD43B` — logo field, selected-nav marker, hero moments; always paired with ink.
- **Accent-ink** `#1A1915` — primary buttons are ink on paper (calm, governmental-modern); links `#3D5A99` (oklch(0.48 0.09 262)).
- **Semantic**: success `oklch(0.55 0.11 155)`, warning `oklch(0.62 0.11 75)`, error `oklch(0.55 0.15 25)`, info `oklch(0.55 0.09 245)`; each with a `-surface` tint for banners. Stale uses warning family + clock icon.
- All combinations meet 4.5:1 (text) / 3:1 (UI). Yellow never carries meaning alone.

## Shape & elevation

- Radii: 4 (inputs, chips), 8 (cards, buttons), 12 (drawers, dialogs), full (avatar, count pills).
- Borders: 1px `border` on cards (elevation-0 default); shadows only for overlays: `sm` 0 1px 2px rgba(26,25,21,.06); `md` 0 4px 16px rgba(26,25,21,.10) (popover); `lg` 0 8px 32px rgba(26,25,21,.14) (drawer/dialog).
- Cards are flat + bordered; hover adds `surface-hover` tint, not shadow lift.

## Motion

- Durations: 100ms (state), 180ms (drawer/popover), 240ms (sheet). Easing `cubic-bezier(.2,.8,.2,1)`.
- Purposeful only: enter/exit of overlays, progress step transitions, toast. No decorative motion. Reduced-motion collapses to fades ≤100ms.

## Brand mark

Official logo: `assets/qori_logo.png` (black hex-cube, yellow rounded face, Q-cursor). Use the image asset — never the old CSS square-cube placeholder. Sidenav/lockup 22px, page headers 24px; always paired with the wordmark or breadcrumb, never meaning-alone.

## Iconography

Lucide (stroke 1.5–2px, sized 13–16px in UI). Status icons always paired with labels. AI-suggested marker: ✦ (four-point star), never a robot/sparkle-gradient trope.

## Density

Comfortable default (48px rows); compact mode (40px) available on tables via view toggle — a user preference, persisted.

## AI-content styling

Dashed 1px border (`border` color), ✦ + "Suggested" label in `ink-muted`, `surface-muted` fill. On acceptance the item re-renders solid with a brief 180ms crossfade.
