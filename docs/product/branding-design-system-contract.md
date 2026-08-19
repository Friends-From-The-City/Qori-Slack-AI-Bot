# Branding and Design System Contract

This document defines the future branding and design system configuration model for Qori. It describes what is configurable per organization, what constraints apply, and the design system direction.

---

## Organization Branding Configuration

Each organization can configure the following display properties:

| Property | Description | Constraints |
|----------|-------------|-------------|
| **Display name** | Organization name shown in the Workspace header and generated artifacts | Plain text, max 100 characters |
| **Logo** | Organization logo displayed in navigation and document headers | Image file, constrained dimensions (TBD) |
| **Favicon** | Browser tab icon | Standard favicon formats (ICO, PNG) |
| **Hostname** | Agency-controlled subdomain or custom domain for their Workspace instance | DNS configured by the agency; Qori validates and serves |

---

## One Codebase, No Forks

Qori is a single codebase deployed for all organizations. There are no agency-specific frontend forks, branches, or build variants.

Branding differentiation is achieved exclusively through configuration (display name, logo, design tokens) -- never through code divergence.

---

## Design System Direction

The design system evolves through these stages:

1. **Qori component system** -- internal component library purpose-built for Qori's interaction patterns.
2. **Stable accessibility baseline** -- all components meet WCAG 2.2 AA and Section 508 requirements before tokens are exposed.
3. **Configurable design tokens** -- organizations can customize colors, typography, and spacing through a token system. Tokens are validated against accessibility contrast requirements.
4. **USWDS-compatible baseline** -- the default token set aligns with the U.S. Web Design System, providing a familiar starting point for federal agencies.
5. **Agency USWDS-derived themes** -- agencies that maintain their own USWDS-derived design themes can apply those tokens to their Qori instance.

### Token Scope

Configurable tokens include:

- Primary and secondary brand colors
- Accent colors
- Typography (font family, scale)
- Spacing scale
- Border radius
- Focus indicator styling

Tokens are constrained to maintain accessibility compliance. A token set that produces insufficient color contrast is rejected at configuration time, not at runtime.

---

## Constraints

### No arbitrary custom CSS injection

Organizations cannot inject arbitrary CSS. All visual customization flows through the token system. This ensures:

- Accessibility guarantees are maintained
- Layout and interaction patterns remain consistent
- Security risks from injected styles are eliminated
- Upgrades to the Qori component system do not break agency customizations

### No branding admin UI yet

Branding configuration is managed through deployment configuration (environment variables or configuration files), not through a self-service admin interface. A branding admin UI may be introduced in a future phase once the token system is stable and validated.

### Theme validation

Any theme configuration is validated before activation:

- Color contrast ratios meet WCAG 2.2 AA minimums
- Typography sizes meet minimum readability thresholds
- Focus indicators remain visible against the configured color palette
- Token values are well-formed (valid hex colors, valid font references)

Invalid configurations are rejected with specific validation errors, not silently applied.
