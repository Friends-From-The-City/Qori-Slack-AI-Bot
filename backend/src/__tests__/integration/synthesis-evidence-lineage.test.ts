/**
 * PH-5B: Synthesis Evidence Lineage Integration Tests
 *
 * Tests validated lineage from nuggets → themes → findings → recommendations.
 * All constructs are status: 'candidate' (no human review gate).
 */

import { getTestDb, truncateAll } from './setup/testDb';
import type { CreationAttributes } from 'sequelize';
import type { EvidenceSource } from '../../database/models/evidence_source';
import type { EvidenceConstruct } from '../../database/models/evidence_construct';
import {
  validateEvidenceRefs,
  createSynthesizedConstructs,
  type SynthesizedConstructInput,
} from '../../services/synthesis-evidence.service';
import { createSource, createConstruct } from '../../services/evidence.service';

const sequelize = getTestDb();

jest.mock('../../helpers/github', () => ({
  fetchFileFromRepoByPath: jest.fn().mockResolvedValue(null),
  createOrUpdateFileOnGitHub: jest.fn().mockResolvedValue({ success: true }),
  getContentRepo: jest.fn().mockReturnValue('test-repo'),
}));

const Project = sequelize.models.Project;
const Study = sequelize.models.ResearchStudy;
const ConstructModel = sequelize.models.EvidenceConstruct;
const RelationshipModel = sequelize.models.EvidenceRelationship;

let projectId: number;
let studyId: number;
let nugget1PublicId: string;
let nugget2PublicId: string;
let nugget3PublicId: string;
let otherStudyNuggetPublicId: string;

async function setupFixtures() {
  const project = await Project.create({
    name: 'Synthesis Test', slug: 'synthesis-test', status: 'active', created_by: 'U_TEST',
  });
  projectId = (project as any).id;

  const study = await Study.create({
    project_id: projectId, name: 'Study A', slug: 'study-a',
    path: 'synthesis-test/study-a', created_by: 'U_TEST', status: 'active',
    channel_name: 'test', researcher_name: 'Test', researcher_email: 'test@test.com',
  });
  studyId = (study as any).id;

  // Create source
  const source = await createSource({
    project_id: projectId, study_id: studyId, source_type: 'session_transcript',
    label: 'test-transcript', created_by: 'U_TEST',
    artifact_ref: { semantic_key: 'test:1', content_hash: 'abc' },
  });

  // Create nuggets
  const n1 = await createConstruct({
    project_id: projectId, study_id: studyId, construct_type: 'nugget',
    label: 'nugget-PT-001-001', payload: { text: 'Pain point 1', participant_code: 'PT-001' },
    derivation_type: 'model', status: 'candidate',
    derivation_context: { semantic_key: 'nugget:test:1' },
    created_by: 'U_TEST',
  });
  nugget1PublicId = n1.public_id;

  const n2 = await createConstruct({
    project_id: projectId, study_id: studyId, construct_type: 'nugget',
    label: 'nugget-PT-002-001', payload: { text: 'Pain point 2', participant_code: 'PT-002' },
    derivation_type: 'model', status: 'candidate',
    derivation_context: { semantic_key: 'nugget:test:2' },
    created_by: 'U_TEST',
  });
  nugget2PublicId = n2.public_id;

  const n3 = await createConstruct({
    project_id: projectId, study_id: studyId, construct_type: 'nugget',
    label: 'nugget-PT-003-001', payload: { text: 'Positive', participant_code: 'PT-003' },
    derivation_type: 'model', status: 'candidate',
    derivation_context: { semantic_key: 'nugget:test:3' },
    created_by: 'U_TEST',
  });
  nugget3PublicId = n3.public_id;

  // Other study nugget (for cross-study ref test)
  const otherStudy = await Study.create({
    project_id: projectId, name: 'Study B', slug: 'study-b',
    path: 'synthesis-test/study-b', created_by: 'U_TEST', status: 'active',
    channel_name: 'test2', researcher_name: 'Test', researcher_email: 'test@test.com',
  });
  const otherN = await createConstruct({
    project_id: projectId, study_id: (otherStudy as any).id, construct_type: 'nugget',
    label: 'nugget-PT-099-001', payload: { text: 'Other study' },
    derivation_type: 'model', status: 'candidate',
    derivation_context: { semantic_key: 'nugget:other:1' },
    created_by: 'U_TEST',
  });
  otherStudyNuggetPublicId = otherN.public_id;
}

beforeAll(async () => {
  await truncateAll();
  await setupFixtures();
});

afterAll(async () => {
  await truncateAll();
});

// ═══════════════════════════════════════════════════════════════════════
// EVIDENCE REF VALIDATION
// ═══════════════════════════════════════════════════════════════════════

describe('PH-5B: validateEvidenceRefs', () => {
  const suppliedIds = () => new Set([nugget1PublicId, nugget2PublicId, nugget3PublicId]);

  it('validates known, supplied, correct-type refs', async () => {
    const result = await validateEvidenceRefs(
      [nugget1PublicId, nugget2PublicId],
      suppliedIds(),
      studyId,
      'nugget',
    );
    expect(result.valid).toEqual([nugget1PublicId, nugget2PublicId]);
    expect(result.rejected).toHaveLength(0);
  });

  it('rejects unknown ref (not in DB)', async () => {
    const result = await validateEvidenceRefs(
      ['00000000-0000-0000-0000-000000000000'],
      suppliedIds(),
      studyId,
      'nugget',
    );
    expect(result.valid).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toContain('not found');
  });

  it('rejects out-of-study ref', async () => {
    const result = await validateEvidenceRefs(
      [otherStudyNuggetPublicId],
      new Set([otherStudyNuggetPublicId]),
      studyId,
      'nugget',
    );
    expect(result.valid).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toContain('belongs to study');
  });

  it('rejects existing-but-unsupplied ref', async () => {
    const result = await validateEvidenceRefs(
      [nugget3PublicId],
      new Set([nugget1PublicId]), // nugget3 exists but not in supplied set
      studyId,
      'nugget',
    );
    expect(result.valid).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toContain('not supplied');
  });

  it('rejects wrong construct type', async () => {
    const result = await validateEvidenceRefs(
      [nugget1PublicId],
      suppliedIds(),
      studyId,
      'theme', // expects theme but got nugget
    );
    expect(result.valid).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toContain('type nugget, expected theme');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SYNTHESIZED CONSTRUCT CREATION
// ═══════════════════════════════════════════════════════════════════════

describe('PH-5B: createSynthesizedConstructs', () => {
  const baseConfig = () => ({
    projectId,
    studyId,
    constructType: 'theme' as const,
    upstreamConstructType: 'nugget' as const,
    relationshipType: 'SYNTHESIZED_FROM' as const,
    suppliedEvidenceIds: new Set([nugget1PublicId, nugget2PublicId, nugget3PublicId]),
    cascadeVariableKey: 'validated_themes',
    templateId: 'affinity_mapping',
    templateVersion: 'v7.1',
    modelName: 'claude-sonnet-4-6',
    createdBy: 'U_TEST',
  });

  it('creates theme with valid nugget refs', async () => {
    const items: SynthesizedConstructInput[] = [{
      displayId: 'theme-01',
      label: 'Navigation Friction',
      payload: { theme_name: 'Navigation Friction', summary: 'Users struggle with navigation' },
      proposedEvidenceIds: [nugget1PublicId, nugget2PublicId],
    }];

    const result = await createSynthesizedConstructs(items, baseConfig());
    expect(result.created).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
    expect(result.created[0].publicId).toBeTruthy();

    // Verify relationships created
    const construct = await ConstructModel.findByPk(result.created[0].constructId);
    expect((construct as any).construct_type).toBe('theme');
    expect((construct as any).status).toBe('candidate');

    const rels = await RelationshipModel.findAll({
      where: { to_construct_id: result.created[0].constructId },
    });
    expect(rels).toHaveLength(2);
    for (const rel of rels) {
      expect((rel as any).relationship_type).toBe('SYNTHESIZED_FROM');
    }
  });

  it('rejects theme with ANY invalid ref', async () => {
    const items: SynthesizedConstructInput[] = [{
      displayId: 'theme-bad-ref',
      label: 'Bad Theme',
      payload: {},
      proposedEvidenceIds: [nugget1PublicId, '00000000-0000-0000-0000-000000000000'],
    }];

    const result = await createSynthesizedConstructs(items, baseConfig());
    expect(result.created).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].displayId).toBe('theme-bad-ref');
  });

  it('rejects theme with zero refs', async () => {
    const items: SynthesizedConstructInput[] = [{
      displayId: 'theme-no-refs',
      label: 'No Evidence Theme',
      payload: {},
      proposedEvidenceIds: [],
    }];

    const result = await createSynthesizedConstructs(items, baseConfig());
    expect(result.created).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reasons[0]).toContain('no supporting evidence');
  });

  it('rerun does not duplicate same derivation', async () => {
    const items: SynthesizedConstructInput[] = [{
      displayId: 'theme-01',
      label: 'Navigation Friction',
      payload: { theme_name: 'Navigation Friction' },
      proposedEvidenceIds: [nugget1PublicId, nugget2PublicId],
    }];

    const result1 = await createSynthesizedConstructs(items, baseConfig());
    const result2 = await createSynthesizedConstructs(items, baseConfig());

    // Both should succeed but return the same construct
    expect(result1.created).toHaveLength(1);
    expect(result2.created).toHaveLength(1);
    expect(result1.created[0].publicId).toBe(result2.created[0].publicId);
  });

  it('candidate status preserved — not accepted', async () => {
    const items: SynthesizedConstructInput[] = [{
      displayId: 'theme-candidate-check',
      label: 'Test Candidate',
      payload: {},
      proposedEvidenceIds: [nugget3PublicId],
    }];

    const result = await createSynthesizedConstructs(items, baseConfig());
    const construct = await ConstructModel.findByPk(result.created[0].constructId);
    expect((construct as any).status).toBe('candidate');
    expect((construct as any).reviewed_by).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GRAPH TRAVERSAL
// ═══════════════════════════════════════════════════════════════════════

describe('PH-5B: Evidence graph traversal', () => {
  it('can traverse nugget → theme via relationships only', async () => {
    // Find a theme construct
    const themes = await ConstructModel.findAll({
      where: { construct_type: 'theme', study_id: studyId },
    });
    expect(themes.length).toBeGreaterThan(0);

    const themeId = (themes[0] as any).id;

    // Traverse incoming SYNTHESIZED_FROM relationships
    const rels = await RelationshipModel.findAll({
      where: { to_construct_id: themeId, relationship_type: 'SYNTHESIZED_FROM' },
    });
    expect(rels.length).toBeGreaterThan(0);

    // Each relationship points to a nugget
    for (const rel of rels) {
      const nugget = await ConstructModel.findByPk((rel as any).from_construct_id);
      expect(nugget).toBeTruthy();
      expect((nugget as any).construct_type).toBe('nugget');
    }
  });

  it('no prose matching is used for lineage', () => {
    // Structural test: synthesis-evidence.service.ts should never use
    // text similarity, title matching, or string comparison for lineage
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, '../../services/synthesis-evidence.service.ts'),
      'utf-8',
    );
    expect(source).not.toContain('similarity');
    expect(source).not.toContain('levenshtein');
    expect(source).not.toContain('fuzzy');
    expect(source).not.toContain('.title ===');
    expect(source).not.toContain('.text ===');
    expect(source).not.toContain('.label ===');
    // Uses public_id for all lookups
    expect(source).toContain('public_id');
  });
});
