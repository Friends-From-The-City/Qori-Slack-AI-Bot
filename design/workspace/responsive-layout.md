# Responsive Layout System

## Base grid

- Base spacing unit: **4px**; scale: 4, 8, 12, 16, 24, 32, 48, 64.
- Content grid: **12 columns**, 24px gutters (16px below `md`).
- Max content width: **1440px**, centered; content pads 32px (desktop), 24px (tablet), 16px (mobile).
- Vertical rhythm: 8px baseline; section spacing 32px; card internal padding 20px (16px compact).

## Shell dimensions

| Region | Width |
|---|---|
| SideNav expanded | 264px |
| SideNav collapsed (icon rail) | 64px |
| TopBar height | 56px |
| Detail drawer (right) | 480px (min 400, max 560) |
| Trace/Ask panel (right, docked) | 384px |
| Study tab bar height | 48px, sticky under PageHeader |

Sticky behavior: TopBar always sticky; PageHeader + tab bar stick on scroll (condensed 48px variant); table headers sticky within scroll containers. Overflow: horizontal scroll never on the page body — tables get container scroll with sticky first column; toolbars collapse into an overflow ⋯ menu.

## Breakpoints

| Token | Range | Shell behavior |
|---|---|---|
| `xl` Desktop large | ≥1440 | SideNav expanded, drawer overlays content, trace panel can dock |
| `lg` Desktop/laptop | 1024–1439 | SideNav expanded (collapses when drawer docked), trace panel overlays |
| `md` Tablet | 768–1023 | SideNav = icon rail; drawers full-height sheets; filters collapse to Filter button; tables drop tertiary columns |
| `sm` Mobile | <768 | SideNav = hamburger sheet; bottom tab bar (Home, Search, Queue, Menu); drawers full-screen; tables become stacked cards; page headers condense |

## Per-region rules

- **Left navigation**: expanded → icon rail (md) → sheet (sm). Labels never truncate; rail shows tooltips.
- **Right traceability / Ask Qori panel**: docked (xl) → overlay (lg/md) → full-screen sheet with back (sm).
- **Tables (DataTable)**: column priority declared per screen (P1 always, P2 hides at md, P3 hides at lg); at sm the row becomes a two-line card (P1 fields) with drawer for the rest.
- **Filter bars**: inline chips (lg+) → "Filters (n)" button opening a sheet (md/sm); active filters always summarized as removable chips.
- **Artifact viewer**: two-pane (document + provenance rail) at lg+; provenance becomes a toggleable tab at md/sm.
- **Evidence lists**: two-column masonry (xl) → single column (lg down).
- **Admin forms**: two-column label/field (lg+) → stacked (md down); max form width 720px at any size.
- **Card grids**: 3-up (xl) → 2-up (lg/md) → 1-up (sm).

Every screen spec in `screens/` declares: remains visible / collapses / becomes drawer / becomes tabs / stacks / hides / moves to overflow, per breakpoint.
