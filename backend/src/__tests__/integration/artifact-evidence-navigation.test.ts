/**
 * PH-6C: Artifact Evidence Navigation Integration Tests
 *
 * Proves:
 * - Artifact→evidence attachment with verified preconditions
 * - Affinity artifact attaches theme construct refs
 * - Readout artifact attaches finding + recommendation refs
 * - Session summary artifact attaches nugget construct refs
 * - Duplicate attachment is idempotent
 * - Refs use canonical persisted construct IDs (not prose/title)
 * - Navigation: public_id → location, location → artifact
 * - Same derivation + location change keeps same public_id
 * - Changed derivation gets new public_id
 * - Evidence ref queries (getEvidenceRefsForArtifact, getArtifactsForConstruct)
 * - Failed artifact write does not affect canonical evidence
 * - Failed evidence attachment does not delete canonical artifact/evidence
 * - Failed attachment → retry succeeds → no duplicates → correct refs
 * - Canonical evidence traversal works without artifact Markdown
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';
import {
  computeDerivationFingerprint,
  buildSemanticKey,
  reserveArtifact,
  recordWriteSuccess,
  recordWriteFailure,
  getArtifactByPublicId,
  getArtifactByLocation,
  getArtifactsByStudy,
  attachEvidenceRefs,
  attachEvidenceRefsVerified,
  getEvidenceRefsForArtifact,
  getArtifactsForConstruct,
} from '../../services/artifact.service';
import {
  createConstruct,
  createSourceToConstruct,
  createConstructToConstruct,
  createSource,
} from '../../services/evidence.service';

const sequelize = getTestDb();

jest.mock('../../helpers/github', () => ({
  fetchFileFromRepoByPath: jest.fn().mockResolvedValue(null),
  createOrUpdateFileOnGitHub: jest.fn().mockResolvedValue({ success: true }),
  getContentRepo: jest.fn().mockReturnValue('test-repo'),
}));

const Project = sequelize.models.Project;
const Study = sequelize.models.ResearchStudy;

let projectId: number;
let studyId: number;

beforeAll(async () => {
  await truncateAll();
  const project = await Project.create({
    name: 'AEN Test', slug: 'aen-test', status: 'active', created_by: 'U_TEST',
    organization_id: TEST_ORG_ID,
  });
  projectId = (project as any).id;

  const study = await Study.create({
    project_id: projectId, name: 'AEN Study', slug: 'aen-study',
    path: 'aen-test/aen-study', created_by: 'U_TEST', status: 'active',
    channel_name: 'test', researcher_name: 'Test', researcher_email: 'test@test.com',
  });
  studyId = (study as any).id;
});

afterAll(async () => {
  await truncateAll();
});

// ═══════════════════════════════════════════════════════════════════════
// EVIDENCE ATTACHMENT — AFFINITY (THEMES)
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6C: Affinity artifact attaches theme construct refs', () => {
  let artifactId: number;
  let artifactPublicId: string;
  let themeConstructIds: number[];

  beforeAll(async () => {
    // Create upstream nugget constructs
    const nugget1 = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'nugget',
      label: 'nugget-01', payload: { text: 'test nugget 1' },
      derivation_type: 'model', status: 'candidate', created_by: 'U_TEST',
    });
    const nugget2 = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'nugget',
      label: 'nugget-02', payload: { text: 'test nugget 2' },
      derivation_type: 'model', status: 'candidate', created_by: 'U_TEST',
    });

    // Create theme constructs (downstream of nuggets)
    const theme1 = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'theme',
      label: 'theme-01', payload: { theme_name: 'Navigation confusion' },
      derivation_type: 'model', status: 'candidate', created_by: 'U_TEST',
    });
    const theme2 = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'theme',
      label: 'theme-02', payload: { theme_name: 'Trust signals' },
      derivation_type: 'model', status: 'candidate', created_by: 'U_TEST',
    });
    themeConstructIds = [theme1.id, theme2.id];

    // Create lineage relationships
    await createConstructToConstruct({
      from_construct_id: nugget1.id, to_construct_id: theme1.id,
      relationship_type: 'SYNTHESIZED_FROM', provenance: { method: 'theme_synthesis' },
      project_id: projectId,
    });
    await createConstructToConstruct({
      from_construct_id: nugget2.id, to_construct_id: theme2.id,
      relationship_type: 'SYNTHESIZED_FROM', provenance: { method: 'theme_synthesis' },
      project_id: projectId,
    });

    // Reserve and write artifact
    const fingerprint = computeDerivationFingerprint(
      [nugget1.public_id, nugget2.public_id], 'v7.1',
    );
    const semanticKey = buildSemanticKey(
      'affinity_mapping', projectId, studyId, 'synthesis', fingerprint,
    );
    const reserved = await reserveArtifact({
      projectId, studyId, templateId: 'affinity_mapping', templateVersion: 'v7.1',
      artifactType: 'synthesis', repo: 'test/repo', semanticKey, createdBy: 'U_TEST',
    });
    artifactId = reserved.id;
    artifactPublicId = reserved.publicId;

    // Simulate successful GitHub write
    await recordWriteSuccess(artifactId, {
      path: 'aen-test/aen-study/04-synthesis/affinity-mapping.md',
      commitSha: 'abc123', url: 'https://github.com/test/repo/blob/main/affinity-mapping.md',
    });
  });

  it('attaches theme construct refs via attachEvidenceRefsVerified', async () => {
    const result = await attachEvidenceRefsVerified(
      artifactPublicId,
      themeConstructIds,
      { projectId, studyId, templateId: 'affinity_mapping', workflow: 'synthesis' },
    );
    expect(result.skipped).toBe(false);
    expect(result.attached).toBe(2);
  });

  it('duplicate attachment is idempotent', async () => {
    const result = await attachEvidenceRefsVerified(
      artifactPublicId,
      themeConstructIds,
      { projectId, studyId, templateId: 'affinity_mapping', workflow: 'synthesis' },
    );
    // All already attached — 0 new rows created, no error
    expect(result.attached).toBe(0);

    // Still exactly 2 refs (not doubled)
    const refs = await getEvidenceRefsForArtifact(artifactId);
    expect(refs.length).toBe(2);
  });

  it('getEvidenceRefsForArtifact returns attached constructs', async () => {
    const refs = await getEvidenceRefsForArtifact(artifactId);
    expect(refs.length).toBe(2);
    expect(refs.every(r => r.ref_type === 'reflects')).toBe(true);
    const refConstructIds = refs.map(r => r.construct_id).sort();
    expect(refConstructIds).toEqual(themeConstructIds.slice().sort());
  });

  it('getArtifactsForConstruct returns the reflecting artifact', async () => {
    const artifacts = await getArtifactsForConstruct(themeConstructIds[0]);
    expect(artifacts.length).toBe(1);
    expect(artifacts[0].public_id).toBe(artifactPublicId);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// EVIDENCE ATTACHMENT — READOUT (FINDINGS + RECOMMENDATIONS)
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6C: Readout artifact attaches finding + recommendation refs', () => {
  let readoutArtifactPublicId: string;
  let findingConstructIds: number[];
  let recConstructIds: number[];

  beforeAll(async () => {
    // Create theme → finding → recommendation chain
    const theme = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'theme',
      label: 'readout-theme-01', payload: { theme_name: 'Test theme' },
      derivation_type: 'model', status: 'candidate', created_by: 'U_TEST',
    });

    const finding1 = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'finding',
      label: 'finding-01', payload: { finding: 'Users struggle with nav' },
      derivation_type: 'model', status: 'candidate', created_by: 'U_TEST',
    });
    const finding2 = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'finding',
      label: 'finding-02', payload: { finding: 'Trust signals missing' },
      derivation_type: 'model', status: 'candidate', created_by: 'U_TEST',
    });
    findingConstructIds = [finding1.id, finding2.id];

    await createConstructToConstruct({
      from_construct_id: theme.id, to_construct_id: finding1.id,
      relationship_type: 'SYNTHESIZED_FROM', provenance: { method: 'finding_synthesis' },
      project_id: projectId,
    });
    await createConstructToConstruct({
      from_construct_id: theme.id, to_construct_id: finding2.id,
      relationship_type: 'SYNTHESIZED_FROM', provenance: { method: 'finding_synthesis' },
      project_id: projectId,
    });

    const rec = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'recommendation',
      label: 'rec-01', payload: { recommendation: 'Redesign nav hierarchy' },
      derivation_type: 'model', status: 'candidate', created_by: 'U_TEST',
    });
    recConstructIds = [rec.id];

    await createConstructToConstruct({
      from_construct_id: finding1.id, to_construct_id: rec.id,
      relationship_type: 'SUPPORTS', provenance: { method: 'recommendation_synthesis' },
      project_id: projectId,
    });

    // Reserve and write readout artifact
    const fingerprint = computeDerivationFingerprint([theme.public_id], 'v7.0');
    const semanticKey = buildSemanticKey(
      'research_readout', projectId, studyId, 'readout', fingerprint,
    );
    const reserved = await reserveArtifact({
      projectId, studyId, templateId: 'research_readout', templateVersion: 'v7.0',
      artifactType: 'readout', repo: 'test/repo', semanticKey, createdBy: 'U_TEST',
    });
    readoutArtifactPublicId = reserved.publicId;
    await recordWriteSuccess(reserved.id, {
      path: 'aen-test/aen-study/05-readouts/research-readout.md',
      commitSha: 'def456', url: 'https://github.com/test/repo/blob/main/readout.md',
    });
  });

  it('attaches finding + recommendation refs', async () => {
    const allIds = [...findingConstructIds, ...recConstructIds];
    const result = await attachEvidenceRefsVerified(
      readoutArtifactPublicId,
      allIds,
      { projectId, studyId, templateId: 'research_readout', workflow: 'readout' },
    );
    expect(result.skipped).toBe(false);
    expect(result.attached).toBe(3);
  });

  it('refs use canonical persisted construct IDs', async () => {
    const artifact = await getArtifactByPublicId(readoutArtifactPublicId);
    expect(artifact).toBeTruthy();
    const refs = await getEvidenceRefsForArtifact(artifact!.id);
    // All ref construct_ids should be real DB IDs, not derived from prose
    const allExpectedIds = [...findingConstructIds, ...recConstructIds].sort();
    const actualIds = refs.map(r => r.construct_id).sort();
    expect(actualIds).toEqual(allExpectedIds);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// EVIDENCE ATTACHMENT — SESSION SUMMARY (NUGGETS)
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6C: Session summary artifact attaches nugget construct refs', () => {
  it('attaches nugget refs after successful write', async () => {
    const source = await createSource({
      project_id: projectId, study_id: studyId,
      source_type: 'session_transcript', label: 'session-PT001',
      created_by: 'U_TEST',
    });

    const nugget = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'nugget',
      label: 'session-nugget-01',
      payload: { text: 'participant struggled', participant_code: 'PT001' },
      derivation_type: 'model', status: 'candidate', created_by: 'U_TEST',
    });

    await createSourceToConstruct({
      from_source_id: source.id, to_construct_id: nugget.id,
      relationship_type: 'DERIVED_FROM',
      provenance: { method: 'session_analysis' },
      project_id: projectId,
    });

    const fingerprint = computeDerivationFingerprint([`source:${source.public_id}`], 'v7.2');
    const semanticKey = buildSemanticKey(
      'session_summary', projectId, studyId, 'fieldwork', fingerprint,
    );
    const reserved = await reserveArtifact({
      projectId, studyId, templateId: 'session_summary', templateVersion: 'v7.2',
      artifactType: 'fieldwork', repo: 'test/repo', semanticKey, createdBy: 'U_TEST',
    });
    await recordWriteSuccess(reserved.id, {
      path: 'aen-test/aen-study/03-fieldwork/sessions/session-pt001.md',
      commitSha: 'ghi789', url: 'https://github.com/test/repo/blob/main/session-pt001.md',
    });

    const result = await attachEvidenceRefsVerified(
      reserved.publicId,
      [nugget.id],
      { projectId, studyId, templateId: 'session_summary', workflow: 'analyze' },
    );
    expect(result.skipped).toBe(false);
    expect(result.attached).toBe(1);

    const refs = await getEvidenceRefsForArtifact(reserved.id);
    expect(refs.length).toBe(1);
    expect(refs[0].construct_id).toBe(nugget.id);
    expect(refs[0].ref_type).toBe('reflects');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// NAVIGATION CONTRACT
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6C: Navigation contract', () => {
  let navArtifactPublicId: string;

  beforeAll(async () => {
    const fingerprint = computeDerivationFingerprint(['nav-input-1'], 'v1');
    const semanticKey = buildSemanticKey(
      'nav_test', projectId, studyId, 'synthesis', fingerprint,
    );
    const reserved = await reserveArtifact({
      projectId, studyId, templateId: 'nav_test', templateVersion: 'v1',
      artifactType: 'synthesis', repo: 'test/repo', semanticKey, createdBy: 'U_TEST',
    });
    navArtifactPublicId = reserved.publicId;
    await recordWriteSuccess(reserved.id, {
      path: 'nav-test/artifact.md', commitSha: 'nav123',
      url: 'https://github.com/test/repo/blob/main/nav-test/artifact.md',
    });
  });

  it('artifact public_id resolves to current location', async () => {
    const artifact = await getArtifactByPublicId(navArtifactPublicId);
    expect(artifact).toBeTruthy();
    expect(artifact!.path).toBe('nav-test/artifact.md');
    expect(artifact!.url).toBe('https://github.com/test/repo/blob/main/nav-test/artifact.md');
    expect(artifact!.commit_sha).toBe('nav123');
    expect(artifact!.status).toBe('written');
  });

  it('(repo, ref, path) resolves to artifact record', async () => {
    const artifact = await getArtifactByLocation('test/repo', 'main', 'nav-test/artifact.md');
    expect(artifact).toBeTruthy();
    expect(artifact!.public_id).toBe(navArtifactPublicId);
  });

  it('same derivation + location change keeps same public_id', async () => {
    const fingerprint = computeDerivationFingerprint(['nav-input-1'], 'v1');
    const semanticKey = buildSemanticKey(
      'nav_test', projectId, studyId, 'synthesis', fingerprint,
    );
    // Re-reserve (same semantic key → reuse)
    const reserved = await reserveArtifact({
      projectId, studyId, templateId: 'nav_test', templateVersion: 'v1',
      artifactType: 'synthesis', repo: 'test/repo', semanticKey, createdBy: 'U_TEST',
    });
    expect(reserved.publicId).toBe(navArtifactPublicId);
    expect(reserved.isNew).toBe(false);

    // Write to a different path
    await recordWriteSuccess(reserved.id, {
      path: 'nav-test/artifact-v2.md', commitSha: 'nav456',
      url: 'https://github.com/test/repo/blob/main/nav-test/artifact-v2.md',
    });

    // public_id unchanged, location updated
    const artifact = await getArtifactByPublicId(navArtifactPublicId);
    expect(artifact!.path).toBe('nav-test/artifact-v2.md');
    expect(artifact!.public_id).toBe(navArtifactPublicId);
  });

  it('changed derivation gets new public_id', async () => {
    const fingerprint = computeDerivationFingerprint(['nav-input-DIFFERENT'], 'v1');
    const semanticKey = buildSemanticKey(
      'nav_test', projectId, studyId, 'synthesis', fingerprint,
    );
    const reserved = await reserveArtifact({
      projectId, studyId, templateId: 'nav_test', templateVersion: 'v1',
      artifactType: 'synthesis', repo: 'test/repo', semanticKey, createdBy: 'U_TEST',
    });
    expect(reserved.publicId).not.toBe(navArtifactPublicId);
    expect(reserved.isNew).toBe(true);
  });

  it('list by study returns artifacts', async () => {
    const artifacts = await getArtifactsByStudy(studyId);
    expect(artifacts.length).toBeGreaterThan(0);
    expect(artifacts.some(a => a.public_id === navArtifactPublicId)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PRECONDITION VERIFICATION
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6C: Attachment precondition verification', () => {
  it('skips when artifactPublicId is undefined', async () => {
    const result = await attachEvidenceRefsVerified(
      undefined,
      [1, 2, 3],
      { projectId, studyId, templateId: 'test', workflow: 'test' },
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no artifact public_id');
  });

  it('skips when constructIds is empty', async () => {
    const result = await attachEvidenceRefsVerified(
      'some-uuid',
      [],
      { projectId, studyId, templateId: 'test', workflow: 'test' },
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no construct IDs to attach');
  });

  it('skips when artifact not found', async () => {
    const result = await attachEvidenceRefsVerified(
      '00000000-0000-0000-0000-000000000000',
      [1],
      { projectId, studyId, templateId: 'test', workflow: 'test' },
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain('not found');
  });

  it('skips when artifact status is not written (pending)', async () => {
    const fingerprint = computeDerivationFingerprint(['precond-input'], 'v1');
    const semanticKey = buildSemanticKey(
      'precond_test', projectId, studyId, 'synthesis', fingerprint,
    );
    const reserved = await reserveArtifact({
      projectId, studyId, templateId: 'precond_test', templateVersion: 'v1',
      artifactType: 'synthesis', repo: 'test/repo', semanticKey, createdBy: 'U_TEST',
    });
    // Don't call recordWriteSuccess — artifact stays pending

    const result = await attachEvidenceRefsVerified(
      reserved.publicId,
      [1],
      { projectId, studyId, templateId: 'precond_test', workflow: 'test' },
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain('status=pending');
  });

  it('skips when artifact status is failed', async () => {
    const fingerprint = computeDerivationFingerprint(['failed-input'], 'v1');
    const semanticKey = buildSemanticKey(
      'failed_test', projectId, studyId, 'synthesis', fingerprint,
    );
    const reserved = await reserveArtifact({
      projectId, studyId, templateId: 'failed_test', templateVersion: 'v1',
      artifactType: 'synthesis', repo: 'test/repo', semanticKey, createdBy: 'U_TEST',
    });
    await recordWriteFailure(reserved.id, 'GitHub API error');

    const result = await attachEvidenceRefsVerified(
      reserved.publicId,
      [1],
      { projectId, studyId, templateId: 'failed_test', workflow: 'test' },
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain('status=failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// FAILURE SAFETY
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6C: Failure safety', () => {
  it('failed artifact write does not affect canonical evidence', async () => {
    // Create evidence constructs first
    const construct = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'theme',
      label: 'failure-safety-theme', payload: { theme_name: 'Survives failure' },
      derivation_type: 'model', status: 'candidate', created_by: 'U_TEST',
    });

    // Reserve artifact then record failure
    const fingerprint = computeDerivationFingerprint(['fail-safety-input'], 'v1');
    const semanticKey = buildSemanticKey(
      'fail_safety', projectId, studyId, 'synthesis', fingerprint,
    );
    const reserved = await reserveArtifact({
      projectId, studyId, templateId: 'fail_safety', templateVersion: 'v1',
      artifactType: 'synthesis', repo: 'test/repo', semanticKey, createdBy: 'U_TEST',
    });
    await recordWriteFailure(reserved.id, 'Simulated GitHub API failure');

    // Evidence construct must still exist and be queryable
    const ConstructModel = sequelize.models.EvidenceConstruct;
    const found = await ConstructModel.findByPk(construct.id);
    expect(found).toBeTruthy();
    expect((found as any).label).toBe('failure-safety-theme');
    expect((found as any).status).toBe('candidate');
  });

  it('failed evidence attachment does not delete canonical artifact or evidence', async () => {
    const construct = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'finding',
      label: 'attach-failure-finding', payload: { finding: 'Survives attachment failure' },
      derivation_type: 'model', status: 'candidate', created_by: 'U_TEST',
    });

    const fingerprint = computeDerivationFingerprint(['attach-fail-input'], 'v1');
    const semanticKey = buildSemanticKey(
      'attach_fail', projectId, studyId, 'readout', fingerprint,
    );
    const reserved = await reserveArtifact({
      projectId, studyId, templateId: 'attach_fail', templateVersion: 'v1',
      artifactType: 'readout', repo: 'test/repo', semanticKey, createdBy: 'U_TEST',
    });
    await recordWriteSuccess(reserved.id, {
      path: 'attach-fail/readout.md', commitSha: 'fail123',
      url: 'https://github.com/test/repo/blob/main/attach-fail/readout.md',
    });

    // Force attachment failure by passing a non-existent construct ID
    // (FK constraint will reject it)
    const result = await attachEvidenceRefsVerified(
      reserved.publicId,
      [999999],
      { projectId, studyId, templateId: 'attach_fail', workflow: 'readout' },
    );
    // attachEvidenceRefsVerified catches the FK error
    expect(result.skipped).toBe(true);

    // Artifact and evidence must both survive
    const artifact = await getArtifactByPublicId(reserved.publicId);
    expect(artifact).toBeTruthy();
    expect(artifact!.status).toBe('written');

    const ConstructModel = sequelize.models.EvidenceConstruct;
    const found = await ConstructModel.findByPk(construct.id);
    expect(found).toBeTruthy();
  });

  it('attachment failure → retry succeeds → no duplicates → correct refs', async () => {
    const construct = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'theme',
      label: 'retry-theme', payload: { theme_name: 'Retry test' },
      derivation_type: 'model', status: 'candidate', created_by: 'U_TEST',
    });

    const fingerprint = computeDerivationFingerprint(['retry-input'], 'v1');
    const semanticKey = buildSemanticKey(
      'retry_test', projectId, studyId, 'synthesis', fingerprint,
    );
    const reserved = await reserveArtifact({
      projectId, studyId, templateId: 'retry_test', templateVersion: 'v1',
      artifactType: 'synthesis', repo: 'test/repo', semanticKey, createdBy: 'U_TEST',
    });

    // First attempt: artifact not yet written → attachment skipped
    const attempt1 = await attachEvidenceRefsVerified(
      reserved.publicId,
      [construct.id],
      { projectId, studyId, templateId: 'retry_test', workflow: 'synthesis' },
    );
    expect(attempt1.skipped).toBe(true);
    expect(attempt1.reason).toContain('status=pending');

    // Artifact and evidence both intact
    const artifactAfter1 = await getArtifactByPublicId(reserved.publicId);
    expect(artifactAfter1).toBeTruthy();
    const ConstructModel = sequelize.models.EvidenceConstruct;
    expect(await ConstructModel.findByPk(construct.id)).toBeTruthy();

    // Now write succeeds
    await recordWriteSuccess(reserved.id, {
      path: 'retry-test/synthesis.md', commitSha: 'retry123',
      url: 'https://github.com/test/repo/blob/main/retry-test/synthesis.md',
    });

    // Retry: should succeed
    const attempt2 = await attachEvidenceRefsVerified(
      reserved.publicId,
      [construct.id],
      { projectId, studyId, templateId: 'retry_test', workflow: 'synthesis' },
    );
    expect(attempt2.skipped).toBe(false);
    expect(attempt2.attached).toBe(1);

    // Third call: idempotent, no duplicates
    const attempt3 = await attachEvidenceRefsVerified(
      reserved.publicId,
      [construct.id],
      { projectId, studyId, templateId: 'retry_test', workflow: 'synthesis' },
    );
    expect(attempt3.attached).toBe(0);

    // Verify exactly one ref exists
    const refs = await getEvidenceRefsForArtifact(reserved.id);
    expect(refs.length).toBe(1);
    expect(refs[0].construct_id).toBe(construct.id);

    // No duplicate artifact rows (same semantic key)
    const ArtifactModel = sequelize.models.ResearchArtifact;
    const artifactCount = await ArtifactModel.count({
      where: { semantic_key: semanticKey },
    });
    expect(artifactCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CANONICAL EVIDENCE TRAVERSAL WITHOUT ARTIFACT MARKDOWN
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6C: Canonical evidence traversal independent of artifacts', () => {
  it('evidence lineage resolves without any artifact or Markdown', async () => {
    // Build a full source→nugget→theme→finding chain with no artifact
    const source = await createSource({
      project_id: projectId, study_id: studyId,
      source_type: 'session_transcript', label: 'independent-session',
      created_by: 'U_TEST',
    });

    const nugget = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'nugget',
      label: 'ind-nugget', payload: { text: 'independent nugget' },
      derivation_type: 'model', status: 'candidate', created_by: 'U_TEST',
    });
    await createSourceToConstruct({
      from_source_id: source.id, to_construct_id: nugget.id,
      relationship_type: 'DERIVED_FROM', provenance: { method: 'test' },
      project_id: projectId,
    });

    const theme = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'theme',
      label: 'ind-theme', payload: { theme_name: 'Independent theme' },
      derivation_type: 'model', status: 'candidate', created_by: 'U_TEST',
    });
    await createConstructToConstruct({
      from_construct_id: nugget.id, to_construct_id: theme.id,
      relationship_type: 'SYNTHESIZED_FROM', provenance: { method: 'test' },
      project_id: projectId,
    });

    const finding = await createConstruct({
      project_id: projectId, study_id: studyId, construct_type: 'finding',
      label: 'ind-finding', payload: { finding: 'Independent finding' },
      derivation_type: 'model', status: 'candidate', created_by: 'U_TEST',
    });
    await createConstructToConstruct({
      from_construct_id: theme.id, to_construct_id: finding.id,
      relationship_type: 'SYNTHESIZED_FROM', provenance: { method: 'test' },
      project_id: projectId,
    });

    // No artifact exists for this chain
    const artifactsForFinding = await getArtifactsForConstruct(finding.id);
    expect(artifactsForFinding.length).toBe(0);

    // But evidence lineage is fully traversable
    const { getRelationshipsToConstruct } = require('../../services/evidence.service');
    const findingUpstream = await getRelationshipsToConstruct(finding.id);
    expect(findingUpstream.length).toBe(1);
    expect((findingUpstream[0] as any).from_construct_id).toBe(theme.id);

    const themeUpstream = await getRelationshipsToConstruct(theme.id);
    expect(themeUpstream.length).toBe(1);
    expect((themeUpstream[0] as any).from_construct_id).toBe(nugget.id);
  });
});
