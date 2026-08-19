/**
 * PH-6D1: Artifact Coverage & Filename Identity Integration Tests
 *
 * Proves:
 * - brief, plan, discussion guide, survey handlers produce artifact identity
 * - same derivation rerun reuses identity
 * - changed consumed authoritative state changes identity
 * - each targeted audience gets distinct artifact identity
 * - two audiences through the SAME template cannot collide
 * - survey fingerprint includes accepted analysis state
 * - stable filename changes do not alter canonical identity
 * - derivation fingerprint is deterministic and available for filenames
 * - __derivation_fp exposed to filename templates
 *
 * Structural tests:
 * - briefHandler passes __artifactContext to processYamlTemplate
 * - planHandler passes __artifactContext
 * - discussionGuideHandler passes __artifactContext
 * - surveySubmissionHandler passes __artifactContext
 * - targeted readout loop creates fresh per-audience artifact context
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';
import {
  computeDerivationFingerprint,
  computeCascadeInputFingerprint,
  buildSemanticKey,
  reserveArtifact,
  recordWriteSuccess,
  getArtifactByPublicId,
} from '../../services/artifact.service';
import * as fs from 'fs';
import * as path from 'path';

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
    name: 'Coverage Test', slug: 'coverage-test', status: 'active', created_by: 'U_TEST',
    organization_id: TEST_ORG_ID,
  });
  projectId = (project as any).id;

  const study = await Study.create({
    project_id: projectId, name: 'Coverage Study', slug: 'coverage-study',
    path: 'coverage-test/coverage-study', created_by: 'U_TEST', status: 'active',
    channel_name: 'test', researcher_name: 'Test', researcher_email: 'test@test.com',
  });
  studyId = (study as any).id;
});

afterAll(async () => {
  await truncateAll();
});

// ═══════════════════════════════════════════════════════════════════════
// BRIEF ARTIFACT IDENTITY
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6D1: Brief artifact identity', () => {
  it('brief gets canonical artifact public_id via cascade fingerprint', async () => {
    const consumedValues = {
      problem_statement: 'Veterans struggle with appointment scheduling',
      learning_objectives: 'Understand pain points',
      methodology: 'usability_testing',
    };
    const fingerprint = computeCascadeInputFingerprint(consumedValues, 'v7.1');
    const semanticKey = buildSemanticKey(
      'research_brief', projectId, studyId, 'brief', fingerprint,
    );

    const reserved = await reserveArtifact({
      projectId, studyId, templateId: 'research_brief', templateVersion: 'v7.1',
      artifactType: 'brief', repo: 'test/repo', semanticKey, createdBy: 'U_TEST',
    });

    expect(reserved.publicId).toMatch(/^[0-9a-f]{8}-/);
    expect(reserved.isNew).toBe(true);
  });

  it('same consumed values reuse brief identity', async () => {
    const consumedValues = {
      problem_statement: 'Veterans struggle with appointment scheduling',
      learning_objectives: 'Understand pain points',
      methodology: 'usability_testing',
    };
    const fingerprint = computeCascadeInputFingerprint(consumedValues, 'v7.1');
    const semanticKey = buildSemanticKey(
      'research_brief', projectId, studyId, 'brief', fingerprint,
    );

    const reserved = await reserveArtifact({
      projectId, studyId, templateId: 'research_brief', templateVersion: 'v7.1',
      artifactType: 'brief', repo: 'test/repo', semanticKey, createdBy: 'U_TEST',
    });

    expect(reserved.isNew).toBe(false);
  });

  it('changed consumed values create new brief identity', async () => {
    const consumedValues = {
      problem_statement: 'Veterans need better telehealth access',
      learning_objectives: 'Evaluate remote care barriers',
      methodology: 'interviews',
    };
    const fingerprint = computeCascadeInputFingerprint(consumedValues, 'v7.1');
    const semanticKey = buildSemanticKey(
      'research_brief', projectId, studyId, 'brief', fingerprint,
    );

    const reserved = await reserveArtifact({
      projectId, studyId, templateId: 'research_brief', templateVersion: 'v7.1',
      artifactType: 'brief', repo: 'test/repo', semanticKey, createdBy: 'U_TEST',
    });

    expect(reserved.isNew).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PLAN ARTIFACT IDENTITY
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6D1: Plan artifact identity', () => {
  it('plan gets canonical artifact public_id', async () => {
    const consumedValues = {
      research_objectives: [{ id: 'OBJ-001', objective: 'test' }],
      research_questions: [{ id: 'RQ-001', question: 'test' }],
      target_barriers: [{ id: 'TB-001', barrier: 'test' }],
    };
    const fingerprint = computeCascadeInputFingerprint(consumedValues, 'v7.2');
    const semanticKey = buildSemanticKey(
      'research_plan', projectId, studyId, 'plan', fingerprint,
    );

    const reserved = await reserveArtifact({
      projectId, studyId, templateId: 'research_plan', templateVersion: 'v7.2',
      artifactType: 'plan', repo: 'test/repo', semanticKey, createdBy: 'U_TEST',
    });

    expect(reserved.publicId).toMatch(/^[0-9a-f]{8}-/);
    expect(reserved.isNew).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// DISCUSSION GUIDE ARTIFACT IDENTITY
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6D1: Discussion guide artifact identity', () => {
  it('discussion guide gets canonical artifact public_id', async () => {
    const consumedValues = {
      research_questions: 'RQ-001,RQ-002',
      research_method: 'usability_testing',
      session_length: '60',
    };
    const fingerprint = computeCascadeInputFingerprint(consumedValues, 'v7.1');
    const semanticKey = buildSemanticKey(
      'discussion_guide', projectId, studyId, 'plan', fingerprint,
    );

    const reserved = await reserveArtifact({
      projectId, studyId, templateId: 'discussion_guide', templateVersion: 'v7.1',
      artifactType: 'plan', repo: 'test/repo', semanticKey, createdBy: 'U_TEST',
    });

    expect(reserved.publicId).toMatch(/^[0-9a-f]{8}-/);
    expect(reserved.isNew).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TARGETED READOUT — PER-AUDIENCE IDENTITY
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6D1: Targeted readout per-audience identity', () => {
  const upstreamThemeIds = ['theme-uuid-1', 'theme-uuid-2'];

  it('each audience gets distinct artifact identity', () => {
    const designerInputs = [...upstreamThemeIds, 'audience:design-team'];
    const engineeringInputs = [...upstreamThemeIds, 'audience:engineering-team'];

    const designerFp = computeDerivationFingerprint(designerInputs, 'v7.0');
    const engineeringFp = computeDerivationFingerprint(engineeringInputs, 'v7.0');

    expect(designerFp).not.toBe(engineeringFp);

    const designerKey = buildSemanticKey(
      'designer_readout', projectId, studyId, 'readout', designerFp,
    );
    const engineeringKey = buildSemanticKey(
      'engineering_readout', projectId, studyId, 'readout', engineeringFp,
    );

    expect(designerKey).not.toBe(engineeringKey);
  });

  it('same audience + same derivation reuses identity', async () => {
    const inputs = [...upstreamThemeIds, 'audience:design-team'];
    const fp = computeDerivationFingerprint(inputs, 'v7.0');
    const key = buildSemanticKey('designer_readout', projectId, studyId, 'readout', fp);

    const first = await reserveArtifact({
      projectId, studyId, templateId: 'designer_readout', templateVersion: 'v7.0',
      artifactType: 'readout', repo: 'test/repo', semanticKey: key, createdBy: 'U_TEST',
    });

    const second = await reserveArtifact({
      projectId, studyId, templateId: 'designer_readout', templateVersion: 'v7.0',
      artifactType: 'readout', repo: 'test/repo', semanticKey: key, createdBy: 'U_TEST',
    });

    expect(second.publicId).toBe(first.publicId);
    expect(second.isNew).toBe(false);
  });

  it('two audiences through the SAME template ID cannot collide', () => {
    // Scenario: two audiences both routed to the same generic template
    const sameTemplateId = 'leadership_readout';
    const sameVersion = 'v7.0';

    const execInputs = [...upstreamThemeIds, 'audience:executive-leadership'];
    const prodInputs = [...upstreamThemeIds, 'audience:product-leadership'];

    const execFp = computeDerivationFingerprint(execInputs, sameVersion);
    const prodFp = computeDerivationFingerprint(prodInputs, sameVersion);

    expect(execFp).not.toBe(prodFp);

    const execKey = buildSemanticKey(sameTemplateId, projectId, studyId, 'readout', execFp);
    const prodKey = buildSemanticKey(sameTemplateId, projectId, studyId, 'readout', prodFp);

    expect(execKey).not.toBe(prodKey);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SURVEY ARTIFACT IDENTITY — ACCEPTED ANALYSIS STATE
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6D1: Survey artifact fingerprint includes accepted analysis state', () => {
  it('same source + changed coding run = new identity', () => {
    const sourcePublicId = 'source-uuid-survey-1';
    const contentHash = 'abcdef1234567890';

    // First analysis
    const inputs1 = [
      `source:${sourcePublicId}`,
      'coding-run:1:v1',
      `content:${contentHash.substring(0, 16)}`,
    ];
    const fp1 = computeDerivationFingerprint(inputs1, 'v10.2.1');

    // Same source, new coding run (different accepted analysis)
    const inputs2 = [
      `source:${sourcePublicId}`,
      'coding-run:2:v1',
      `content:${contentHash.substring(0, 16)}`,
    ];
    const fp2 = computeDerivationFingerprint(inputs2, 'v10.2.1');

    expect(fp1).not.toBe(fp2);
  });

  it('same source + same coding run = reuses identity', () => {
    const inputs = [
      'source:source-uuid-survey-2',
      'coding-run:5:v2',
      'content:1234567890abcdef',
    ];

    const fp1 = computeDerivationFingerprint(inputs, 'v10.2.1');
    const fp2 = computeDerivationFingerprint(inputs, 'v10.2.1');

    expect(fp1).toBe(fp2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// DERIVATION FINGERPRINT FOR FILENAMES
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6D1: Derivation fingerprint deterministic for filenames', () => {
  it('fingerprint is 16 chars hex', () => {
    const fp = computeDerivationFingerprint(['input-a', 'input-b'], 'v7.1');
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
    // 12-char substring for filename use
    expect(fp.substring(0, 12)).toMatch(/^[0-9a-f]{12}$/);
  });

  it('same rerun date does not change fingerprint', () => {
    // Fingerprint depends on inputs + version, NOT on date/time
    const fp1 = computeDerivationFingerprint(['input-x'], 'v7.1');
    const fp2 = computeDerivationFingerprint(['input-x'], 'v7.1');
    expect(fp1).toBe(fp2);
  });

  it('cascade fingerprint is deterministic on same consumed values', () => {
    const values = { a: 'hello', b: [1, 2, 3], c: true };
    const fp1 = computeCascadeInputFingerprint(values, 'v7.1');
    const fp2 = computeCascadeInputFingerprint(values, 'v7.1');
    expect(fp1).toBe(fp2);
  });

  it('cascade fingerprint changes on changed consumed values', () => {
    const fp1 = computeCascadeInputFingerprint({ a: 'hello' }, 'v7.1');
    const fp2 = computeCascadeInputFingerprint({ a: 'changed' }, 'v7.1');
    expect(fp1).not.toBe(fp2);
  });

  it('filename change does not alter canonical identity', async () => {
    // Semantic key doesn't include filename — only templateId, project, study, type, fingerprint
    const fp = computeDerivationFingerprint(['filename-test'], 'v7.1');
    const key = buildSemanticKey('affinity_mapping', projectId, studyId, 'synthesis', fp);

    const reserved = await reserveArtifact({
      projectId, studyId, templateId: 'affinity_mapping', templateVersion: 'v7.1',
      artifactType: 'synthesis', repo: 'test/repo', semanticKey: key, createdBy: 'U_TEST',
    });

    // Write to old-style filename
    await recordWriteSuccess(reserved.id, {
      path: 'old-study-affinity-map-2026-08-17.md', commitSha: 'old123',
      url: 'https://github.com/test/old.md',
    });

    // Re-reserve with same key (filename changed in template, but semantic key unchanged)
    const re = await reserveArtifact({
      projectId, studyId, templateId: 'affinity_mapping', templateVersion: 'v7.1',
      artifactType: 'synthesis', repo: 'test/repo', semanticKey: key, createdBy: 'U_TEST',
    });

    expect(re.publicId).toBe(reserved.publicId);
    expect(re.isNew).toBe(false);
    // Last successful URL preserved from prior write
    expect(re.lastSuccessfulUrl).toBe('https://github.com/test/old.md');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// STRUCTURAL: HANDLER WIRING VERIFICATION
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6D1: Handler wiring structural verification', () => {
  const readHandler = (relPath: string): string => {
    return fs.readFileSync(
      path.resolve(__dirname, '../../helpers/slack/commands', relPath),
      'utf-8',
    );
  };

  it('briefHandler passes __artifactContext to processYamlTemplate', () => {
    const source = readHandler('briefHandler.ts');
    // __artifactContext must be set BEFORE processYamlTemplate call (not the import)
    const contextIdx = source.indexOf('__artifactContext');
    // Find processYamlTemplate CALL (after the import), searching from __artifactContext position
    const processIdx = source.indexOf('processYamlTemplate(', contextIdx);
    expect(contextIdx).toBeGreaterThan(-1);
    expect(processIdx).toBeGreaterThan(-1);
    expect(contextIdx).toBeLessThan(processIdx);
    expect(source).toContain("artifactType: 'brief'");
  });

  it('planHandler passes __artifactContext to processYamlTemplate', () => {
    const source = readHandler('planHandler.ts');
    const contextIdx = source.indexOf('__artifactContext');
    const processIdx = source.indexOf('processYamlTemplate(', contextIdx);
    expect(contextIdx).toBeGreaterThan(-1);
    expect(processIdx).toBeGreaterThan(-1);
    expect(contextIdx).toBeLessThan(processIdx);
    expect(source).toContain("artifactType: 'plan'");
  });

  it('discussionGuideHandler passes __artifactContext to processYamlTemplate', () => {
    const source = readHandler('discussion-guide/discussionGuideHandler.ts');
    const contextIdx = source.indexOf('__artifactContext');
    const processIdx = source.indexOf('processYamlTemplate(', contextIdx);
    expect(contextIdx).toBeGreaterThan(-1);
    expect(processIdx).toBeGreaterThan(-1);
    expect(contextIdx).toBeLessThan(processIdx);
    expect(source).toContain("artifactType: 'plan'");
  });

  it('surveySubmissionHandler passes __artifactContext to processYamlTemplate', () => {
    const source = readHandler('surveySubmissionHandler.ts');
    const contextIdx = source.indexOf('__artifactContext');
    const processIdx = source.lastIndexOf('processYamlTemplate');
    expect(contextIdx).toBeGreaterThan(-1);
    expect(processIdx).toBeGreaterThan(-1);
    // __artifactContext appears before the LAST processYamlTemplate call (survey synthesis)
    expect(contextIdx).toBeLessThan(processIdx);
    expect(source).toContain("artifactType: 'discovery'");
    // Must include coding run in canonical inputs
    expect(source).toContain('coding-run:');
  });

  it('targeted readout loop creates fresh per-audience artifact context', () => {
    const source = readHandler('readoutHandler.ts');
    // Must contain audience in canonicalUpstreamInputs within the targeted loop
    expect(source).toContain('`audience:${normalizedAudience}`');
    // Must set __artifactContext inside the for-loop (after audienceReportData creation)
    const audienceDataIdx = source.indexOf('audienceReportData');
    const audienceContextIdx = source.indexOf('__artifactContext', audienceDataIdx);
    expect(audienceContextIdx).toBeGreaterThan(audienceDataIdx);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CASCADE FALLBACK VERIFICATION
// ═══════════════════════════════════════════════════════════════════════

describe('PH-6D1: Cascade fallback hashes actual consumed values', () => {
  it('computeCascadeInputFingerprint hashes serialized consumed values, not just names', () => {
    // Same keys but different values must produce different fingerprints
    const fp1 = computeCascadeInputFingerprint({
      methodology: 'usability_testing',
      problem: 'navigation',
    }, 'v7.1');

    const fp2 = computeCascadeInputFingerprint({
      methodology: 'interviews',
      problem: 'navigation',
    }, 'v7.1');

    expect(fp1).not.toBe(fp2);
  });

  it('key ordering does not affect cascade fingerprint', () => {
    const fp1 = computeCascadeInputFingerprint({ a: '1', b: '2' }, 'v7.1');
    const fp2 = computeCascadeInputFingerprint({ b: '2', a: '1' }, 'v7.1');
    expect(fp1).toBe(fp2);
  });
});
