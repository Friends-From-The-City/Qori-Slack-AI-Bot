# Accessibility

WCAG 2.2 AA and Section 508 alignment are **requirements of every spec**, not an annotation pass. USWDS is the behavioral reference for primitives (focus, forms, tables, banners); visual styling is Qori's own.

## Global commitments

- **Keyboard**: every interaction keyboard-complete. Logical focus order = visual order. No keyboard traps except managed dialog/drawer traps.
- **Visible focus**: 2px focus ring token (`focus`), 2px offset, ≥3:1 against adjacent colors; never removed, never color-only.
- **Focus restoration**: drawers/dialogs return focus to the triggering element on close; list actions restore to the row.
- **Landmarks**: one `banner` (TopBar), `navigation` (SideNav, labeled), `main`, `complementary` (drawer/trace panel, labeled), `contentinfo`. Skip link "Skip to main content" is the first focusable element.
- **Headings**: one `h1` per screen (PageHeader title); tabs/sections use h2/h3 hierarchically; no skipped levels.
- **ARIA only where necessary**: native elements first. Drawers = `dialog` with `aria-modal`, labeled by their title. Tabs use the tabs pattern with roving tabindex. Live regions: `polite` for progress-step changes and toasts; `assertive` only for errors.
- **Announcements**: staged AI progress announces step transitions ("Extracting evidence, step 3 of 5"); async completion announces via live region + Work Queue.
- **Errors**: identified in text, linked to the field, described with recovery action; error summary at form top receives focus on submit failure.
- **Touch targets**: ≥44×44px on all pointers; list rows ≥48px.
- **Contrast**: text ≥4.5:1 (≥3:1 for large text), UI components/graphics ≥3:1. Brand yellow is never used for text or as the only state signal; on yellow, text is ink (≥8:1).
- **Color-independent meaning**: every status pairs color with icon + label; staleness = clock icon + text; AI-suggested = dashed border + ✦ + "Suggested" label.
- **Zoom/reflow**: usable at 400% zoom / 320px width with no 2D scroll (tables get the stacked-card treatment); text spacing overrides must not clip.
- **Reduced motion**: `prefers-reduced-motion` disables slide/scale transitions (fade ≤100ms remains); progress animations become discrete state changes.
- **Tables**: real `<table>` with `<th scope>`, caption; sortable headers are buttons announcing sort state.
- **Charts/visualizations**: every chart has a data-table alternative and a text summary; lineage strip is a described list, not just visual.
- **Tags**: chips are buttons ("Filter by tag: accessibility"); AI-suggested chips announce "Suggested tag, not yet accepted".
- **Session/timeout**: warnings meet 2.2.1; re-auth preserves work.
- **WCAG 2.2-specific**: focus not obscured by sticky headers (scroll-margin); dragging alternatives for any reorder; target size 24×24 minimum met everywhere via 44px rule; consistent help placement; no cognitive-function-only auth patterns in Workspace flows.

## Per-pattern requirements

Each component in `component-inventory.md` carries keyboard behavior + a11y notes; each screen in `screens/` carries focus order, landmark map, and announcement events. Flows in `flows/` note screen-reader checkpoints at each step.

## Testing expectation for UX-3

Axe-clean CI gate; manual keyboard pass per screen; NVDA + VoiceOver script per flow; 400% zoom pass; reduced-motion pass.
