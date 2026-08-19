# Accessibility Contract

This document defines the accessibility baseline for the future Qori Workspace. Accessibility is a product requirement from the start, not a remediation item to be addressed after launch.

---

## Standards

### WCAG 2.2 AA

The Workspace targets conformance with the Web Content Accessibility Guidelines (WCAG) 2.2 at the AA level. This covers all four principles: Perceivable, Operable, Understandable, and Robust.

### Section 508

As a tool used by VA (Veterans Affairs) research teams, the Workspace aligns with Section 508 of the Rehabilitation Act. Section 508 requirements are substantially covered by WCAG 2.2 AA conformance, with additional attention to federal-specific guidance where applicable.

---

## Requirements

### Keyboard Operability

- All interactive elements are reachable and operable via keyboard alone.
- Tab order follows a logical reading sequence.
- No keyboard traps -- the user can always navigate away from any component.
- Complex widgets (modals, dropdowns, data tables) implement standard keyboard interaction patterns from WAI-ARIA Authoring Practices.
- Keyboard shortcuts, if provided, do not conflict with assistive technology shortcuts.

### Visible Focus Indicators

- All focusable elements display a visible focus indicator.
- Focus indicators meet the WCAG 2.2 focus appearance criteria (minimum area, contrast).
- Focus indicators are visible against all theme configurations (validated at token configuration time).
- Focus is never removed or hidden via CSS.

### Screen-Reader Semantics

- Semantic HTML elements are used for their intended purpose (headings, lists, landmarks, forms).
- ARIA roles, states, and properties are applied where native HTML semantics are insufficient.
- Dynamic content updates are announced to screen readers via ARIA live regions.
- Images and icons have appropriate text alternatives (alt text, aria-label, or aria-hidden for decorative elements).
- Form inputs have associated labels. Error messages are programmatically associated with their fields.

### Color-Independent Meaning

- Information is never conveyed by color alone.
- Status indicators, severity levels, and data visualizations use shape, text, or pattern in addition to color.
- Color contrast ratios meet WCAG 2.2 AA minimums: 4.5:1 for normal text, 3:1 for large text and UI components.

### Reduced Motion

- The Workspace respects the `prefers-reduced-motion` media query.
- When reduced motion is preferred, animations are either eliminated or replaced with non-motion alternatives (e.g., opacity fade instead of slide).
- No content depends on animation to be understood.

### Accessible Forms and Error Messages

- All form fields have visible labels (not placeholder-only labels).
- Required fields are indicated both visually and programmatically.
- Validation errors are displayed adjacent to the relevant field.
- Error messages are descriptive -- they identify the problem and suggest correction.
- Form submission errors are announced to screen readers.
- Multi-step forms indicate current position and total steps.

### Accessible Charts and Data Views

- Charts include text alternatives that convey the same information.
- Data tables use proper header markup (`<th>`, `scope`, `headers` attributes).
- Complex data views provide alternative representations (e.g., tabular view alongside chart view).
- Interactive charts are keyboard-operable.

### Responsive Layouts

- The Workspace is usable at viewport widths from 320px to large desktop.
- Content reflows without horizontal scrolling at up to 400% zoom.
- Touch targets meet minimum size requirements (24x24 CSS pixels per WCAG 2.2).
- Text can be resized up to 200% without loss of content or functionality.

---

## Process

Accessibility is integrated into the development process, not bolted on after implementation:

- Components are tested for accessibility during development, not in a separate audit phase.
- Automated accessibility testing (axe-core or equivalent) runs in CI.
- Manual testing with screen readers (VoiceOver, NVDA) is performed for new interaction patterns.
- Accessibility issues are treated as bugs with the same priority as functional defects.
