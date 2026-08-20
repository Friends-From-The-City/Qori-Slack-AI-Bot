# Design System — Visual Language

Qori's own design language: contemporary, calm, product-led. USWDS is the behavioral/accessibility foundation (focus, forms, banners, tables), **not** a visual template. Tokens are semantic and agency-themable (`design-tokens.json`, `branding-model.md`).

## Type

- **Display / headings**: Space Grotesk (600). Geometric, matches the Qori cube mark. H1 28/34, H2 22/28, H3 18/24, H4 15/20.
- **UI / body**: Public Sans (400/500/600) — USWDS-native, agency-familiar, modern. Body 15/22, secondary 13/18, caption 12/16.
- **Mono** (IDs, counts in trace contexts): system mono stack, 13/18.
- Minimum body size 13px; no text below 12px.

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

## Iconography

Single stroke set (Lucide-style, 1.5px, 20px grid). Status icons always paired with labels. AI-suggested marker: ✦ (four-point star), never a robot/sparkle-gradient trope.

## Density

Comfortable default (48px rows); compact mode (40px) available on tables via view toggle — a user preference, persisted.

## AI-content styling

Dashed 1px border (`border` color), ✦ + "Suggested" label in `ink-muted`, `surface-muted` fill. On acceptance the item re-renders solid with a brief 180ms crossfade.
