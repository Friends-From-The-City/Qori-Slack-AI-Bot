# USWDS Mapping — implementation foundation (UX-2 §32/33)

Principle: USWDS supplies accessible behavior, form semantics, keyboard/focus conventions, responsive foundations, and token structure. Qori semantic tokens + Public Sans + black/yellow identity render ON TOP. Never stock-USWDS visual output. Agency branding = runtime token override at the allowed layer only (no arbitrary CSS/JS).

| Qori component | USWDS foundation | Notes / divergence |
|---|---|---|
| Buttons (primary/secondary/danger) | usa-button | Qori: square corners, black fill primary; yellow only as accent never text-alone |
| Text/textarea/date fields | usa-input, usa-textarea, usa-date-picker | usa-form-group semantics + error association verbatim |
| Form validation | usa-error-message + usa-form-group--error | programmatic association (aria-describedby), summary at top for long forms |
| Select / combo | usa-select, usa-combo-box | method picker, approver picker |
| Checkbox/radio | usa-checkbox, usa-radio | attestation checkbox, discovery source picker, enrichments |
| File upload | usa-file-input | unified source ingestion (drag-drop + paste extension) |
| Alerts/banners | usa-alert | approval banner, readiness warnings, projection-failed |
| Breadcrumb | usa-breadcrumb | Org > Project > Study (compact, no overload) |
| Side navigation | usa-sidenav | study rail is custom (lifecycle chain) but keyboard/aria model follows sidenav |
| Tables | usa-table | evidence table, codebook, schema review; sticky header + sortable variant |
| Modal | usa-modal | lightweight actions only (reject-note, promote confirm); focus trap + return |
| Accordion | usa-accordion | readout sections, inherited-context groups on plan |
| Step indicator | usa-step-indicator | survey pipeline stages (schema->privacy->codebook->match) |
| Pagination | usa-pagination | only where queues cannot virtualize |
| Tooltip | usa-tooltip | chip why-explanations (also focus-triggered) |
| Tag | usa-tag | state chips restyled to Phase 4 grammar (shape+glyph+text) |
| Site header/banner | usa-banner pattern | gov banner slot, agency-configurable |

Token mapping: docs/design-system tokens.css already semantic (--color-state-*, --surface-*). Add a mapping layer: Qori semantic token -> USWDS token where 1:1 (e.g. --color-error -> $theme-color-error), agency override allowance column (logo, agency accent, banner text: YES; state colors, custody yellow, type: NO).