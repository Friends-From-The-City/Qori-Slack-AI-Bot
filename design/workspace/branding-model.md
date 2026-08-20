# Branding Model

One Qori codebase; agency identity is **runtime configuration**, not custom code. No agency forks, no arbitrary CSS injection.

## Configurable per agency (Admin → Organization)

- Organization display name ("Department of Example")
- Short name ("DoE" — used in breadcrumbs, compact contexts)
- Logo (SVG/PNG, constrained slots: 32px TopBar, 20px compact)
- Favicon
- Theme tokens — only the `agency-themable` set in `design-tokens.json`: `color.brand`, `color.brand-ink`, `color.link`, `color.focus`, `color.surface-selected`
- Agency-controlled hostname (e.g. `qori.agency.gov`)

Everything else — layout, spacing, type scale, semantic state colors, component behavior — is fixed. This keeps accessibility guarantees intact: submitted theme colors are contrast-validated at save time (brand+brand-ink ≥ 4.5:1; link/focus ≥ 4.5:1 on surface) and rejected with guidance if they fail.

## Co-presentation of Qori + agency

TopBar lockup pattern:

```
[Agency logo]  Department of Example
               Qori Research Workspace
```

- Agency identity leads; Qori is the product line beneath in `text-muted`.
- Login page: agency logo + name primary, "Powered by Qori" secondary.
- SideNav footer: small Qori mark (product identity persists without competing).
- No VA assumptions; the default (unbranded) theme is the neutral Qori black/yellow.

## USWDS compatibility

Tokens map cleanly onto USWDS-derived agency systems: spacing is 4px-based, type sizes align with USWDS scale steps, semantic color roles mirror USWDS state tokens. An agency already on USWDS can express its palette through the themable aliases without new components.

## Explicitly out of scope

Custom CSS, per-agency component variants, custom fonts (system pairing is fixed for a11y/perf), white-labeling that removes Qori identity entirely.
