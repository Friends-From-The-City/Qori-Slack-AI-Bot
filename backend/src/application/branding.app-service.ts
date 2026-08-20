/**
 * Branding Application Service — WS-0
 *
 * Organization-scoped branding configuration.
 * Read access for any authenticated org member.
 * Write access requires admin authorization.
 */

import type { ApplicationContext } from '../types/application-context';
import { authorizationDenied, resourceNotFound, validationError } from '../types/api-errors';
import sequelize from '../database';
import type { OrganizationBranding, OrganizationBranding as OrgBrandingType } from '../database/models/organization_branding';
import { ALLOWED_LOGO_CONTENT_TYPES, MAX_LOGO_SIZE_BYTES } from '../database/models/organization_branding';
import type { ProjectMembership } from '../database/models/project_membership';
import type { Project } from '../database/models/project';

const BrandingModel = sequelize.models.OrganizationBranding as typeof OrganizationBranding | undefined;
const ProjectMembershipModel = sequelize.models.ProjectMembership as typeof ProjectMembership;
const ProjectModel = sequelize.models.Project as typeof Project;

// ─── Types ─────────────────────────────────────────────────────────

export interface BrandingResource {
  organization_public_id: string;
  display_name: string | null;
  short_name: string | null;
  logo_asset_ref: string | null;
  logo_alt_text: string | null;
  favicon_asset_ref: string | null;
  theme_tokens: Record<string, unknown>;
  public_url: string | null;
}

export interface LogoValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Authorization ─────────────────────────────────────────────────

async function assertOrgAdmin(ctx: ApplicationContext): Promise<void> {
  const membership = await ProjectMembershipModel.findOne({
    where: { actor_id: ctx.actor.id, role: 'owner' },
    include: [{
      model: ProjectModel,
      as: 'project',
      where: { organization_id: ctx.organization.id },
      attributes: ['id'],
    }],
  });
  if (!membership) {
    throw authorizationDenied('Organization admin access required');
  }
}

// ─── Read ──────────────────────────────────────────────────────────

export async function getBranding(ctx: ApplicationContext): Promise<BrandingResource> {
  if (!BrandingModel) {
    return emptyBranding(ctx.organization.publicId);
  }

  const branding = await BrandingModel.findOne({
    where: { organization_id: ctx.organization.id },
  });

  if (!branding) {
    return emptyBranding(ctx.organization.publicId);
  }

  return mapBrandingResource(branding as any, ctx.organization.publicId);
}

// ─── Write ─────────────────────────────────────────────────────────

export async function updateBranding(
  ctx: ApplicationContext,
  body: Partial<{
    display_name: string;
    short_name: string;
    logo_asset_ref: string;
    logo_alt_text: string;
    logo_content_type: string;
    logo_size_bytes: number;
    favicon_asset_ref: string;
    theme_tokens: Record<string, unknown>;
    public_url: string;
  }>,
): Promise<BrandingResource> {
  await assertOrgAdmin(ctx);

  if (!BrandingModel) {
    throw validationError('Branding model not available');
  }

  // Validate logo if provided
  if (body.logo_content_type) {
    if (!ALLOWED_LOGO_CONTENT_TYPES.includes(body.logo_content_type as any)) {
      throw validationError(
        `Invalid logo content type. Allowed: ${ALLOWED_LOGO_CONTENT_TYPES.join(', ')}`,
      );
    }
  }
  if (body.logo_size_bytes !== undefined) {
    if (body.logo_size_bytes > MAX_LOGO_SIZE_BYTES) {
      throw validationError(`Logo exceeds maximum size of ${MAX_LOGO_SIZE_BYTES} bytes (2MB)`);
    }
  }

  // Validate theme_tokens — no executable content
  if (body.theme_tokens) {
    const json = JSON.stringify(body.theme_tokens);
    if (json.includes('<script') || json.includes('javascript:') || json.includes('expression(')) {
      throw validationError('Theme tokens must not contain executable content');
    }
  }

  const [branding] = await BrandingModel.findOrCreate({
    where: { organization_id: ctx.organization.id },
    defaults: { organization_id: ctx.organization.id } as any,
  });

  const allowedFields = [
    'display_name', 'short_name', 'logo_asset_ref', 'logo_alt_text',
    'logo_content_type', 'logo_size_bytes', 'favicon_asset_ref',
    'theme_tokens', 'public_url',
  ] as const;

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      (branding as any)[field] = body[field];
    }
  }

  await branding.save();
  return mapBrandingResource(branding as any, ctx.organization.publicId);
}

// ─── Logo Validation ───────────────────────────────────────────────

export async function validateLogoUpload(
  ctx: ApplicationContext,
  body: { content_type?: string; size_bytes?: number; filename?: string },
): Promise<LogoValidationResult> {
  await assertOrgAdmin(ctx);

  const errors: string[] = [];

  if (!body.content_type) {
    errors.push('content_type is required');
  } else if (!ALLOWED_LOGO_CONTENT_TYPES.includes(body.content_type as any)) {
    errors.push(`Invalid content type "${body.content_type}". Allowed: ${ALLOWED_LOGO_CONTENT_TYPES.join(', ')}`);
  }

  if (body.size_bytes === undefined) {
    errors.push('size_bytes is required');
  } else if (body.size_bytes > MAX_LOGO_SIZE_BYTES) {
    errors.push(`File size ${body.size_bytes} bytes exceeds maximum ${MAX_LOGO_SIZE_BYTES} bytes (2MB)`);
  } else if (body.size_bytes <= 0) {
    errors.push('File size must be positive');
  }

  // Check filename for executable extensions
  if (body.filename) {
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.js', '.html', '.php'];
    const lower = body.filename.toLowerCase();
    for (const ext of dangerousExtensions) {
      if (lower.endsWith(ext)) {
        errors.push(`Executable file extension "${ext}" not allowed`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Helpers ───────────────────────────────────────────────────────

function emptyBranding(orgPublicId: string): BrandingResource {
  return {
    organization_public_id: orgPublicId,
    display_name: null,
    short_name: null,
    logo_asset_ref: null,
    logo_alt_text: null,
    favicon_asset_ref: null,
    theme_tokens: {},
    public_url: null,
  };
}

function mapBrandingResource(b: any, orgPublicId: string): BrandingResource {
  return {
    organization_public_id: orgPublicId,
    display_name: b.display_name || null,
    short_name: b.short_name || null,
    logo_asset_ref: b.logo_asset_ref || null,
    logo_alt_text: b.logo_alt_text || null,
    favicon_asset_ref: b.favicon_asset_ref || null,
    theme_tokens: b.theme_tokens || {},
    public_url: b.public_url || null,
  };
}
