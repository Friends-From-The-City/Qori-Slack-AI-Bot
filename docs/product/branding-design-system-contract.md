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

Branding configuration is managed through the `/api/v1/branding` API (requires org admin role) and deployment configuration. A visual branding admin UI may be introduced in a future phase once the token system is stable and validated.

---

## Logo Storage Contract (WS-0)

Logo and favicon uploads follow a provider-neutral storage adapter pattern. Binary assets are NOT stored in Postgres.

### Upload Flow

```
Client
  │
  ▼
POST /api/v1/branding/logo/validate
  │ (content type, size, filename validation)
  │
  ▼
Upload to storage adapter (future implementation)
  │
  ▼
Storage adapter returns stable asset reference
  │
  ▼
PUT /api/v1/branding { logo_asset_ref: "...", logo_content_type: "...", ... }
  │ (stores reference in organization_branding table)
  │
  ▼
Workspace shell renders via asset reference
```

### Validation (implemented in WS-0)

| Check | Rule |
|-------|------|
| Content type | Must be `image/png`, `image/jpeg`, `image/svg+xml`, or `image/webp` |
| File size | Maximum 2MB (2,097,152 bytes) |
| Filename | No executable extensions (`.exe`, `.bat`, `.js`, `.html`, `.php`, etc.) |
| Alt text | Required for accessibility (stored alongside reference) |

### Storage Adapter Interface (contract only — implementation is UX-3 scope)

```typescript
interface AssetStorageAdapter {
  /** Upload a validated asset, return a stable reference */
  upload(input: {
    organizationId: number;
    contentType: string;
    sizeBytes: number;
    data: Buffer | ReadableStream;
    altText: string;
  }): Promise<{ assetRef: string; publicUrl: string }>;

  /** Resolve an asset reference to a serveable URL */
  resolve(assetRef: string): Promise<string | null>;

  /** Delete an asset by reference */
  delete(assetRef: string): Promise<void>;
}
```

### Supported Future Backends

| Backend | Asset Ref Format | Notes |
|---------|-----------------|-------|
| S3-compatible | `s3://{bucket}/{key}` | MinIO, AWS S3, agency-hosted |
| Azure Blob | `azure://{container}/{blob}` | Azure Government compatible |
| Local filesystem | `file://{path}` | Development only |

### What is NOT stored in Postgres

- Binary image data (logos, favicons)
- Base64-encoded images
- Large JSONB blobs containing asset data

The `organization_branding.logo_asset_ref` column stores only the reference string. The storage adapter resolves it to a serveable URL at render time.

### Theme validation

Any theme configuration is validated before activation:

- Color contrast ratios meet WCAG 2.2 AA minimums
- Typography sizes meet minimum readability thresholds
- Focus indicators remain visible against the configured color palette
- Token values are well-formed (valid hex colors, valid font references)

Invalid configurations are rejected with specific validation errors, not silently applied.
