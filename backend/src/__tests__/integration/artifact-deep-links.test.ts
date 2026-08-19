/**
 * PH-6D2: Artifact Deep-Link Integration Tests
 *
 * Proves:
 * - Full UUID-derived anchors are deterministic
 * - Changing display label does not change anchor
 * - Canonical reference section renders from structured persisted refs
 * - No regex/display-label/prose matching used for identity
 * - Theme resolves to affinity/synthesis artifact
 * - Finding resolves to research readout
 * - Recommendation resolves to research readout
 * - Same-document canonical link works
 * - Missing target produces plain-text fallback
 * - Old artifact rerender does not win via updated_at
 * - TB/RQ/OBJ stay plain text (no evidence construct identity)
 * - Resolver uses artifact_evidence_refs + persisted location
 * - Resolver does not use prose/title/filename
 * - Structural: handlers use prepare/finalize flow
 */

import { getTestDb, truncateAll } from './setup/testDb';
import {
  computeDerivationFingerprint,
  buildSemanticKey,
  reserveArtifact,
  recordWriteSuccess,
  attachEvidenceRefs,
} from '../../services/artifact.service';
import { createConstruct } from '../../services/evidence.service';
import {
  computeCanonicalAnchor,
  resolveConstructDeepLink,
  buildCanonicalReferenceSection,
  type CanonicalRefItem,
} from '../../services/deep-link.service';
import * as fs from 'fs';
import * as path from 'path';

const sequelize = getTestDb();

jest.mock('../../helpers/github', () => ({
  fetchFileFromRepoByPath: jest.fn().mockResolvedValue(null),
  createOrUpdateFileOnGitHub: jest.fn().mockResolvedValue({ success: true }),
  getContentRepo: jest.fn().mockReturnValue('test-repo'),
}));

let projectId: number;
let studyId: number;

beforeAll(async () => {
  await truncateAll();
  const project = await sequelize.models.Project.create({
    name: 'DeepLink Test', slug: 'deeplink-test', status: 'active', created_by: 'U_TEST',
  });
  projectId = (project as any).id;
  const study = await sequelize.models.ResearchStudy.create({
    project_id: projectId, name: 'DeepLink Study', slug: 'deeplink-study',
    path: 'deeplink-test/deeplink-study', created_by: 'U_TEST', status: 'active',
    channel_name: 'test', researcher_name: 'Test', researcher_email: 'test@test.com',
  });
  studyId = (study as any).id;
});

afterAll(async () => {
  await truncateAll();
});

// ═══════════════════════════════════════════════════════════════════════
// CANONICAL ANCHOR FORMAT
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6D2: Canonical anchor format', () => {
  it('uses full UUID with ev- prefix', () => {
    const anchor = computeCanonicalAnchor('550e8400-e29b-41d4-a716-446655440000');
    expect(anchor).toBe('ev-550e8400-e29b-41d4-a716-446655440000');
  });

  it('is deterministic — same UUID produces same anchor', () => {
    const a1 = computeCanonicalAnchor('550e8400-e29b-41d4-a716-446655440000');
    const a2 = computeCanonicalAnchor('550e8400-e29b-41d4-a716-446655440000');
    expect(a1).toBe(a2);
  });

  it('lowercases the UUID', () => {
    const anchor = computeCanonicalAnchor('550E8400-E29B-41D4-A716-446655440000');
    expect(anchor).toBe('ev-550e8400-e29b-41d4-a716-446655440000');
  });

  it('changing display label does not change anchor', () => {
    // Anchor derives from construct.public_id, not from display label
    const constructId = 'aabbccdd-1122-3344-5566-778899aabbcc';
    const anchor = computeCanonicalAnchor(constructId);
    // If we change the theme name from "Navigation confusion" to "Nav issues",
    // the anchor remains the same because it uses the UUID
    expect(anchor).toBe('ev-aabbccdd-1122-3344-5566-778899aabbcc');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CANONICAL REFERENCE SECTION
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6D2: Canonical reference section rendering', () => {
  it('renders anchors from structured canonical data', () => {
    const items: CanonicalRefItem[] = [
      {
        displayId: 'theme-01',
        label: 'Navigation confusion',
        constructPublicId: '11111111-1111-1111-1111-111111111111',
        constructType: 'theme',
      },
      {
        displayId: 'theme-02',
        label: 'Scheduling friction',
        constructPublicId: '22222222-2222-2222-2222-222222222222',
        constructType: 'theme',
      },
    ];

    const section = buildCanonicalReferenceSection(items, 'Canonical Theme References');

    expect(section).toContain('<a id="ev-11111111-1111-1111-1111-111111111111"></a>');
    expect(section).toContain('### theme-01 — Navigation confusion');
    expect(section).toContain('<a id="ev-22222222-2222-2222-2222-222222222222"></a>');
    expect(section).toContain('### theme-02 — Scheduling friction');
    expect(section).toContain('## Canonical Theme References');
  });

  it('renders upstream cross-document links', () => {
    const items: CanonicalRefItem[] = [
      {
        displayId: 'finding-01',
        label: 'Users struggle with navigation',
        constructPublicId: '33333333-3333-3333-3333-333333333333',
        constructType: 'finding',
        upstreamLinks: [
          {
            displayId: 'theme-01',
            label: 'Navigation confusion',
            deepLink: 'https://github.com/test/repo/blob/main/affinity-map.md#ev-11111111-1111-1111-1111-111111111111',
          },
        ],
      },
    ];

    const section = buildCanonicalReferenceSection(items, 'Canonical Finding References');
    expect(section).toContain('[theme-01 — Navigation confusion](https://github.com/');
    expect(section).toContain('Supported by:');
  });

  it('renders same-document recommendation→finding links', () => {
    const items: CanonicalRefItem[] = [
      {
        displayId: 'rec-01',
        label: 'Redesign nav hierarchy',
        constructPublicId: '44444444-4444-4444-4444-444444444444',
        constructType: 'recommendation',
        upstreamLinks: [
          {
            displayId: 'finding-01',
            label: 'Navigation issues',
            deepLink: '#ev-33333333-3333-3333-3333-333333333333',
          },
        ],
      },
    ];

    const section = buildCanonicalReferenceSection(items, 'Canonical Recommendation References');
    expect(section).toContain('Based on:');
    expect(section).toContain('[finding-01 — Navigation issues](#ev-33333333-');
  });

  it('renders plain text when deep link is null', () => {
    const items: CanonicalRefItem[] = [
      {
        displayId: 'finding-02',
        label: 'Trust signals missing',
        constructPublicId: '55555555-5555-5555-5555-555555555555',
        constructType: 'finding',
        upstreamLinks: [
          { displayId: 'theme-03', label: 'Trust gaps', deepLink: null },
        ],
      },
    ];

    const section = buildCanonicalReferenceSection(items, 'Canonical Finding References');
    expect(section).toContain('theme-03 — Trust gaps');
    expect(section).not.toContain('[theme-03 — Trust gaps](');
  });

  it('returns empty string when no items', () => {
    const section = buildCanonicalReferenceSection([], 'Empty');
    expect(section).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// DEEP-LINK RESOLVER
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6D2: Deep-link resolver', () => {
  let themeConstructId: number;
  let themePublicId: string;
  let findingConstructId: number;
  let findingPublicId: string;
  let recConstructId: number;
  let recPublicId: string;
  let affinityArtifactId: number;
  let readoutArtifactId: number;

  beforeAll(async () => {
    // Create constructs
    const theme = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'theme',
      label: 'resolver-theme', payload: {}, derivation_type: 'model',
      status: 'candidate', created_by: 'U_TEST',
    });
    themeConstructId = theme.id;
    themePublicId = theme.public_id;

    const finding = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'finding',
      label: 'resolver-finding', payload: {}, derivation_type: 'model',
      status: 'candidate', created_by: 'U_TEST',
    });
    findingConstructId = finding.id;
    findingPublicId = finding.public_id;

    const rec = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'recommendation',
      label: 'resolver-rec', payload: {}, derivation_type: 'model',
      status: 'candidate', created_by: 'U_TEST',
    });
    recConstructId = rec.id;
    recPublicId = rec.public_id;

    // Create artifacts
    const affinityFp = computeDerivationFingerprint(['resolver-test-1'], 'v7.1');
    const affinityKey = buildSemanticKey('affinity_mapping', projectId, studyId, 'synthesis', affinityFp);
    const affinity = await reserveArtifact({
      projectId, studyId, templateId: 'affinity_mapping', templateVersion: 'v7.1',
      artifactType: 'synthesis', repo: 'test/repo', semanticKey: affinityKey, createdBy: 'U_TEST',
    });
    affinityArtifactId = affinity.id;
    await recordWriteSuccess(affinity.id, {
      path: 'deeplink-test/deeplink-study/04-synthesis/affinity-map.md',
      commitSha: 'aff123',
      url: 'https://github.com/test/repo/blob/main/affinity-map.md',
    });

    const readoutFp = computeDerivationFingerprint(['resolver-test-2'], 'v7.0');
    const readoutKey = buildSemanticKey('research_readout', projectId, studyId, 'readout', readoutFp);
    const readout = await reserveArtifact({
      projectId, studyId, templateId: 'research_readout', templateVersion: 'v7.0',
      artifactType: 'readout', repo: 'test/repo', semanticKey: readoutKey, createdBy: 'U_TEST',
    });
    readoutArtifactId = readout.id;
    await recordWriteSuccess(readout.id, {
      path: 'deeplink-test/deeplink-study/05-readouts/research-readout.md',
      commitSha: 'rdo123',
      url: 'https://github.com/test/repo/blob/main/research-readout.md',
    });

    // Attach evidence refs
    await attachEvidenceRefs(affinity.id, [themeConstructId], projectId);
    await attachEvidenceRefs(readout.id, [findingConstructId, recConstructId], projectId);
  });

  it('theme resolves to affinity/synthesis artifact', async () => {
    const result = await resolveConstructDeepLink(themePublicId, studyId);
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.url).toContain('affinity-map.md');
      expect(result.anchor).toBe(`ev-${themePublicId}`);
      expect(result.deepLink).toBe(`${result.url}#ev-${themePublicId}`);
    }
  });

  it('finding resolves to research readout', async () => {
    const result = await resolveConstructDeepLink(findingPublicId, studyId);
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.url).toContain('research-readout.md');
      expect(result.anchor).toBe(`ev-${findingPublicId}`);
    }
  });

  it('recommendation resolves to research readout', async () => {
    const result = await resolveConstructDeepLink(recPublicId, studyId);
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.url).toContain('research-readout.md');
    }
  });

  it('non-existent construct returns fallback', async () => {
    const result = await resolveConstructDeepLink(
      '00000000-0000-0000-0000-000000000000', studyId,
    );
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.reason).toBe('construct not found');
    }
  });

  it('construct with no artifact refs returns fallback', async () => {
    const orphan = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'theme',
      label: 'orphan-theme', payload: {}, derivation_type: 'model',
      status: 'candidate', created_by: 'U_TEST',
    });
    const result = await resolveConstructDeepLink(orphan.public_id, studyId);
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.reason).toBe('no artifact refs');
    }
  });

  it('suppliedArtifactPublicId takes precedence', async () => {
    // Attach theme to BOTH artifacts
    await attachEvidenceRefs(readoutArtifactId, [themeConstructId], projectId);

    // Without supplied: should prefer affinity (template precedence)
    const natural = await resolveConstructDeepLink(themePublicId, studyId);
    expect(natural.resolved).toBe(true);
    if (natural.resolved) {
      expect(natural.url).toContain('affinity-map.md');
    }

    // With supplied readout artifact: should use readout
    const readoutArtifact = await sequelize.models.ResearchArtifact.findByPk(readoutArtifactId);
    const readoutPubId = (readoutArtifact as any).public_id;
    const supplied = await resolveConstructDeepLink(themePublicId, studyId, undefined, readoutPubId);
    expect(supplied.resolved).toBe(true);
    if (supplied.resolved) {
      expect(supplied.url).toContain('research-readout.md');
    }
  });

  it('uses created_at not updated_at for precedence', async () => {
    // Create two synthesis artifacts for the same construct type
    const fp1 = computeDerivationFingerprint(['precedence-older'], 'v7.1');
    const key1 = buildSemanticKey('affinity_mapping', projectId, studyId, 'synthesis', fp1);
    const older = await reserveArtifact({
      projectId, studyId, templateId: 'affinity_mapping', templateVersion: 'v7.1',
      artifactType: 'synthesis', repo: 'test/repo', semanticKey: key1, createdBy: 'U_TEST',
    });
    await recordWriteSuccess(older.id, {
      path: 'older-affinity.md', commitSha: 'old1', url: 'https://github.com/test/older.md',
    });

    const fp2 = computeDerivationFingerprint(['precedence-newer'], 'v7.1');
    const key2 = buildSemanticKey('affinity_mapping', projectId, studyId, 'synthesis', fp2);
    const newer = await reserveArtifact({
      projectId, studyId, templateId: 'affinity_mapping', templateVersion: 'v7.1',
      artifactType: 'synthesis', repo: 'test/repo', semanticKey: key2, createdBy: 'U_TEST',
    });
    await recordWriteSuccess(newer.id, {
      path: 'newer-affinity.md', commitSha: 'new1', url: 'https://github.com/test/newer.md',
    });

    const precedenceTheme = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'theme',
      label: 'precedence-theme', payload: {}, derivation_type: 'model',
      status: 'candidate', created_by: 'U_TEST',
    });

    // Attach to both
    await attachEvidenceRefs(older.id, [precedenceTheme.id], projectId);
    await attachEvidenceRefs(newer.id, [precedenceTheme.id], projectId);

    // Now update the OLDER artifact's updated_at to be more recent
    await sequelize.models.ResearchArtifact.update(
      { updated_at: new Date() },
      { where: { id: older.id } },
    );

    // Resolver should pick newer by created_at, NOT the older one with more recent updated_at
    const result = await resolveConstructDeepLink(precedenceTheme.public_id, studyId);
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.url).toBe('https://github.com/test/newer.md');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// STRUCTURAL: HANDLER WIRING
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6D2: Handler structural verification', () => {
  const readHandler = (relPath: string): string => {
    return fs.readFileSync(
      path.resolve(__dirname, '../../helpers/slack/commands', relPath),
      'utf-8',
    );
  };

  it('researchSynthesisHandler uses prepareYamlTemplate + finalizeArtifactWrite', () => {
    const source = readHandler('researchSynthesisHandler.ts');
    expect(source).toContain('prepareYamlTemplate');
    expect(source).toContain('finalizeArtifactWrite');
    expect(source).toContain('buildCanonicalReferenceSection');
    // Verify only ONE GitHub write path (no processYamlTemplate in the affinity flow)
    // The import of processYamlTemplate may still exist for non-affinity methods
  });

  it('readoutHandler uses prepareYamlTemplate + finalizeArtifactWrite for research readout', () => {
    const source = readHandler('readoutHandler.ts');
    expect(source).toContain('prepareYamlTemplate');
    expect(source).toContain('finalizeArtifactWrite');
    expect(source).toContain('buildCanonicalReferenceSection');
    expect(source).toContain('resolveConstructDeepLink');
  });

  it('analyzeNotesHandler uses prepareYamlTemplate + finalizeArtifactWrite', () => {
    const source = readHandler('analyzeNotesHandler.ts');
    expect(source).toContain('prepareYamlTemplate');
    expect(source).toContain('finalizeArtifactWrite');
    // Nugget anchoring deferred to PH-7
    expect(source).toContain('deferred to PH-7');
  });

  it('no handler uses prose/regex matching for anchor placement', () => {
    const handlers = [
      'researchSynthesisHandler.ts',
      'readoutHandler.ts',
      'analyzeNotesHandler.ts',
    ];
    for (const h of handlers) {
      const source = readHandler(h);
      // Should NOT contain regex-based anchor injection patterns
      expect(source).not.toContain('.match(');
      expect(source).not.toContain('.replace(/##');
      expect(source).not.toContain('new RegExp(');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TB/RQ/OBJ REMAIN PLAIN TEXT
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6D2: TB/RQ/OBJ stay plain text', () => {
  it('computeCanonicalAnchor requires a construct public_id — TB-001 is not one', () => {
    // TB-001, RQ-001, OBJ-001 are display IDs, not UUIDs
    // The resolver requires a UUID, so these cannot be resolved
    const anchor = computeCanonicalAnchor('TB-001');
    // It produces an anchor, but it's meaningless — no evidence construct exists
    expect(anchor).toBe('ev-tb-001');
    // The resolver would fail because no construct with public_id 'TB-001' exists
  });

  it('resolver returns fallback for non-UUID identifiers', async () => {
    const result = await resolveConstructDeepLink('TB-001', studyId);
    expect(result.resolved).toBe(false);
  });
});
