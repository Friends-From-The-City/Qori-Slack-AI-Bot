/**
 * Deep-Link Resolver Service — PH-6D2
 *
 * Resolves canonical evidence constructs to navigable deep links
 * through artifact_evidence_refs and persisted artifact locations.
 *
 * Key invariants:
 * - Anchors derive from evidence_construct.public_id (full UUID)
 * - Resolution uses artifact_evidence_refs, never prose/title/path matching
 * - Public IDs at all service boundaries
 * - Artifact precedence: supplied > template > type > newest by created_at
 */

import type { ArtifactType } from '../database/models/research_artifact';
import sequelize from '../database';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface DeepLinkResolved {
  resolved: true;
  artifactPublicId: string;
  constructPublicId: string;
  repo: string;
  ref: string;
  path: string;
  url: string;
  anchor: string;
  deepLink: string;
}

export interface DeepLinkFallback {
  resolved: false;
  constructPublicId: string;
  reason: string;
}

export type DeepLinkResolution = DeepLinkResolved | DeepLinkFallback;

/** Construct type → preferred artifact resolution */
const CONSTRUCT_ARTIFACT_PREFERENCE: Record<string, { artifactType: ArtifactType; templateId: string }> = {
  theme: { artifactType: 'synthesis', templateId: 'affinity_mapping' },
  finding: { artifactType: 'readout', templateId: 'research_readout' },
  recommendation: { artifactType: 'readout', templateId: 'research_readout' },
  nugget: { artifactType: 'fieldwork', templateId: 'session_summary' },
};

// ─────────────────────────────────────────────────────────────────────
// Canonical Anchor
// ─────────────────────────────────────────────────────────────────────

/**
 * Compute canonical anchor from construct public_id.
 * Format: ev-{full-lowercase-uuid}
 */
export function computeCanonicalAnchor(constructPublicId: string): string {
  return `ev-${constructPublicId.toLowerCase()}`;
}

// ─────────────────────────────────────────────────────────────────────
// Resolver
// ─────────────────────────────────────────────────────────────────────

/**
 * Resolve a canonical evidence construct to a navigable deep link.
 *
 * Uses artifact_evidence_refs to find artifacts reflecting this construct,
 * then applies precedence to select the best target.
 *
 * @param constructPublicId - Evidence construct UUID
 * @param studyId - Study scope (null for project-scoped)
 * @param preferredArtifactTypes - Optional artifact type filter
 * @param suppliedArtifactPublicId - Explicit target artifact (highest precedence)
 */
export async function resolveConstructDeepLink(
  constructPublicId: string,
  studyId: number | null,
  preferredArtifactTypes?: ArtifactType[],
  suppliedArtifactPublicId?: string,
): Promise<DeepLinkResolution> {
  const ConstructModel = sequelize.models.EvidenceConstruct;
  const ArtifactModel = sequelize.models.ResearchArtifact;
  const RefModel = sequelize.models.ArtifactEvidenceRef;

  if (!ConstructModel || !ArtifactModel || !RefModel) {
    return { resolved: false, constructPublicId, reason: 'required models not available' };
  }

  // 1. Validate UUID format before querying (prevents Postgres cast error)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(constructPublicId)) {
    return { resolved: false, constructPublicId, reason: 'invalid UUID format' };
  }

  // 2. Look up construct by public_id
  const construct = await ConstructModel.findOne({ where: { public_id: constructPublicId } });
  if (!construct) {
    return { resolved: false, constructPublicId, reason: 'construct not found' };
  }
  const constructId = (construct as unknown as { id: number }).id;
  const constructType = (construct as unknown as { construct_type: string }).construct_type;

  // 2. Find all artifact refs for this construct
  const refs = await RefModel.findAll({ where: { construct_id: constructId } });
  if (refs.length === 0) {
    return { resolved: false, constructPublicId, reason: 'no artifact refs' };
  }

  const artifactIds = refs.map((r: unknown) => (r as { artifact_id: number }).artifact_id);

  // 3. Load candidate artifacts — status='written', same study/project
  const whereClause: Record<string, unknown> = {
    id: artifactIds,
    status: 'written',
  };
  if (studyId != null) {
    whereClause.study_id = studyId;
  }

  const candidates = await ArtifactModel.findAll({
    where: whereClause,
    order: [['created_at', 'DESC']],
  });

  if (candidates.length === 0) {
    return { resolved: false, constructPublicId, reason: 'no written artifact for this study' };
  }

  type ArtifactRecord = {
    id: number; public_id: string; template_id: string; artifact_type: string;
    repo: string; ref: string; path: string; url: string; created_at: Date;
  };

  const typed = candidates.map(c => c as unknown as ArtifactRecord);

  // 4. Apply precedence: supplied > template > type > created_at
  let selected: ArtifactRecord | undefined;

  // 4a. Explicit supplied artifact
  if (suppliedArtifactPublicId) {
    selected = typed.find(a => a.public_id === suppliedArtifactPublicId);
  }

  // 4b. Preferred template_id for this construct type
  if (!selected) {
    const pref = CONSTRUCT_ARTIFACT_PREFERENCE[constructType];
    if (pref) {
      selected = typed.find(a => a.template_id === pref.templateId);
    }
  }

  // 4c. Preferred artifact_type for this construct type
  if (!selected && preferredArtifactTypes && preferredArtifactTypes.length > 0) {
    selected = typed.find(a => preferredArtifactTypes.includes(a.artifact_type as ArtifactType));
  }
  if (!selected) {
    const pref = CONSTRUCT_ARTIFACT_PREFERENCE[constructType];
    if (pref) {
      selected = typed.find(a => a.artifact_type === pref.artifactType);
    }
  }

  // 4d. Newest by created_at (already sorted DESC)
  if (!selected) {
    selected = typed[0];
  }

  const anchor = computeCanonicalAnchor(constructPublicId);
  const deepLink = selected.url ? `${selected.url}#${anchor}` : `#${anchor}`;

  return {
    resolved: true,
    artifactPublicId: selected.public_id,
    constructPublicId,
    repo: selected.repo,
    ref: selected.ref,
    path: selected.path,
    url: selected.url,
    anchor,
    deepLink,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Canonical Reference Section Builder
// ─────────────────────────────────────────────────────────────────────

export interface CanonicalRefItem {
  displayId: string;
  label: string;
  constructPublicId: string;
  constructType: string;
  /** Upstream construct refs this item links to (cross-document) */
  upstreamLinks?: Array<{
    displayId: string;
    label: string;
    deepLink: string | null;
  }>;
}

/**
 * Build a deterministic Canonical Evidence References section for an artifact.
 *
 * Renders anchors and cross-document links from structured canonical data.
 * No prose matching — all data comes from persisted evidence constructs.
 */
export function buildCanonicalReferenceSection(
  items: CanonicalRefItem[],
  sectionTitle: string,
): string {
  if (items.length === 0) return '';

  const lines: string[] = [
    '',
    '---',
    '',
    `## ${sectionTitle}`,
    '',
  ];

  for (const item of items) {
    const anchor = computeCanonicalAnchor(item.constructPublicId);
    lines.push(`<a id="${anchor}"></a>`);
    lines.push('');
    lines.push(`### ${item.displayId} — ${item.label}`);
    lines.push('');

    if (item.upstreamLinks && item.upstreamLinks.length > 0) {
      const linkLabel = item.constructType === 'recommendation' ? 'Based on' : 'Supported by';
      const linkItems = item.upstreamLinks.map(link => {
        if (link.deepLink) {
          return `[${link.displayId} — ${link.label}](${link.deepLink})`;
        }
        return `${link.displayId} — ${link.label}`;
      });
      lines.push(`${linkLabel}: ${linkItems.join(', ')}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
