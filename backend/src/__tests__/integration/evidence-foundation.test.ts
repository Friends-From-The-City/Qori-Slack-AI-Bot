/**
 * Evidence Foundation Integration Tests
 *
 * Per ADRs 0028-0030: Validates the canonical evidence layer —
 * source persistence, construct persistence, FK-backed lineage,
 * CHECK constraints, UUID public_ids, CASCADE deletion semantics,
 * transactional derivation, and zero-use backward compatibility.
 *
 * Requires: PostgreSQL qori_test database with migrations applied.
 */

import { getTestDb, truncateAll } from './setup/testDb';

const sequelize = getTestDb();

// Mock GitHub functions to prevent actual API calls
jest.mock('../../helpers/github', () => ({
  fetchFileFromRepoByPath: jest.fn().mockResolvedValue(null),
  createOrUpdateFileOnGitHub: jest.fn().mockResolvedValue({ success: true }),
  getContentRepo: jest.fn().mockReturnValue('test-repo'),
}));

// Get models
const Project = sequelize.models.Project;
const ResearchStudy = sequelize.models.ResearchStudy;
const EvidenceSourceModel = sequelize.models.EvidenceSource;
const EvidenceConstructModel = sequelize.models.EvidenceConstruct;
const EvidenceRelationshipModel = sequelize.models.EvidenceRelationship;
const StudyVariableModel = sequelize.models.StudyVariable;

// Test fixtures
let projectId: number;
let studyId: number;

beforeEach(async () => {
  await truncateAll();

  const project = await Project.create({
    name: 'Evidence Test Project',
    slug: 'evidence-test-project',
    status: 'active',
    created_by: 'U_TEST',
  });
  projectId = (project as any).id;

  const study = await ResearchStudy.create({
    project_id: projectId,
    name: 'Evidence Test Study',
    slug: 'evidence-test-study',
    path: 'evidence-test-project/evidence-test-study',
    status: 'active',
    created_by: 'U_TEST',
    channel_name: 'test-evidence',
    researcher_name: 'Test Researcher',
    researcher_email: 'test@example.com',
  });
  studyId = (study as any).id;
});

afterAll(async () => {
  await sequelize.close();
});

// ═══════════════════════════════════════════════════════════════════════
// 1. SOURCE PERSISTENCE + UUID
// ═══════════════════════════════════════════════════════════════════════

describe('evidence_sources', () => {
  it('creates a project-scoped discovery source with auto-generated public_id', async () => {
    const source = await EvidenceSourceModel.create({
      project_id: projectId,
      study_id: null,
      source_type: 'uploaded_document',
      label: 'VA Policy Document 2026',
      artifact_ref: { github_path: '_discovery/desk-research/va-policy.pdf' },
      metadata: { page_count: 42 },
      created_by: 'U_TEST',
    });

    expect((source as any).id).toBeDefined();
    expect((source as any).public_id).toBeDefined();
    expect(typeof (source as any).public_id).toBe('string');
    expect((source as any).public_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect((source as any).project_id).toBe(projectId);
    expect((source as any).study_id).toBeNull();
  });

  it('creates a study-scoped source', async () => {
    const source = await EvidenceSourceModel.create({
      project_id: projectId,
      study_id: studyId,
      source_type: 'session_transcript',
      label: 'PT-001 Session 1 Transcript',
      created_by: 'U_TEST',
    });

    expect((source as any).study_id).toBe(studyId);
  });

  it('public_id is unique across sources', async () => {
    const s1 = await EvidenceSourceModel.create({
      project_id: projectId, source_type: 'uploaded_document',
      label: 'Source A', created_by: 'U_TEST',
    });
    const s2 = await EvidenceSourceModel.create({
      project_id: projectId, source_type: 'uploaded_document',
      label: 'Source B', created_by: 'U_TEST',
    });
    expect((s1 as any).public_id).not.toBe((s2 as any).public_id);
  });

  it('public_id persists across updates', async () => {
    const source = await EvidenceSourceModel.create({
      project_id: projectId, source_type: 'uploaded_document',
      label: 'Original', created_by: 'U_TEST',
    });
    const originalPublicId = (source as any).public_id;

    await source.update({ label: 'Updated label' });

    const reloaded = await EvidenceSourceModel.findByPk((source as any).id);
    expect((reloaded as any).public_id).toBe(originalPublicId);
  });

  it('rejects source with invalid project_id FK', async () => {
    await expect(
      EvidenceSourceModel.create({
        project_id: 99999, source_type: 'uploaded_document',
        label: 'Orphaned source', created_by: 'U_TEST',
      }),
    ).rejects.toThrow();
  });

  it('rejects source with invalid study_id FK', async () => {
    await expect(
      EvidenceSourceModel.create({
        project_id: projectId, study_id: 99999,
        source_type: 'uploaded_document',
        label: 'Bad study ref', created_by: 'U_TEST',
      }),
    ).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. CONSTRUCT PERSISTENCE + UUID
// ═══════════════════════════════════════════════════════════════════════

describe('evidence_constructs', () => {
  it('creates a construct with stable ID, public_id, and JSONB payload', async () => {
    const construct = await EvidenceConstructModel.create({
      project_id: projectId,
      construct_type: 'knowledge_gap',
      label: 'VA upload process documentation gaps',
      payload: {
        id: 'KG-001',
        summary: 'No documentation exists for the upload retry mechanism',
      },
      derivation_type: 'model',
      derivation_context: {
        model_name: 'claude-sonnet-4-6',
        template_id: 'desk_research',
      },
      status: 'candidate',
      created_by: 'U_TEST',
    });

    expect((construct as any).id).toBeDefined();
    expect((construct as any).public_id).toBeDefined();
    expect((construct as any).public_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );

    // Verify roundtrip of JSONB payload
    const retrieved = await EvidenceConstructModel.findByPk((construct as any).id);
    expect((retrieved as any).payload).toEqual({
      id: 'KG-001',
      summary: 'No documentation exists for the upload retry mechanism',
    });
    expect((retrieved as any).public_id).toBe((construct as any).public_id);
  });

  it('public_id persists across status transitions', async () => {
    const construct = await EvidenceConstructModel.create({
      project_id: projectId, construct_type: 'finding',
      label: 'Test', status: 'candidate', created_by: 'U_TEST',
    });
    const originalPublicId = (construct as any).public_id;

    await construct.update({ status: 'accepted', reviewed_by: 'U_REVIEWER', reviewed_at: new Date() });

    const updated = await EvidenceConstructModel.findByPk((construct as any).id);
    expect((updated as any).public_id).toBe(originalPublicId);
    expect((updated as any).status).toBe('accepted');
  });

  it('defaults status to candidate and derivation_type to model', async () => {
    const construct = await EvidenceConstructModel.create({
      project_id: projectId, construct_type: 'barrier',
      label: 'Test barrier', created_by: 'U_TEST',
    });
    expect((construct as any).status).toBe('candidate');
    expect((construct as any).derivation_type).toBe('model');
  });

  it('enforces project scope FK', async () => {
    await expect(
      EvidenceConstructModel.create({
        project_id: 99999, construct_type: 'barrier',
        label: 'Orphaned', created_by: 'U_TEST',
      }),
    ).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. FK-BACKED LINEAGE + CHECK CONSTRAINTS
// ═══════════════════════════════════════════════════════════════════════

describe('evidence_relationships — FK integrity', () => {
  let sourceId: number;
  let constructAId: number;
  let constructBId: number;

  beforeEach(async () => {
    const source = await EvidenceSourceModel.create({
      project_id: projectId, source_type: 'uploaded_document',
      label: 'Policy doc', created_by: 'U_TEST',
    });
    sourceId = (source as any).id;

    const constructA = await EvidenceConstructModel.create({
      project_id: projectId, construct_type: 'knowledge_gap',
      label: 'Gap A', created_by: 'U_TEST',
    });
    constructAId = (constructA as any).id;

    const constructB = await EvidenceConstructModel.create({
      project_id: projectId, construct_type: 'research_question',
      label: 'RQ from Gap A', created_by: 'U_TEST',
    });
    constructBId = (constructB as any).id;
  });

  it('valid source → construct works', async () => {
    const rel = await EvidenceRelationshipModel.create({
      project_id: projectId,
      from_source_id: sourceId,
      from_construct_id: null,
      to_source_id: null,
      to_construct_id: constructAId,
      relationship_type: 'DERIVED_FROM',
      provenance: { method: 'desk_research_extraction' },
    });

    expect((rel as any).id).toBeDefined();
    expect((rel as any).public_id).toBeDefined();
    expect((rel as any).from_source_id).toBe(sourceId);
    expect((rel as any).from_construct_id).toBeNull();
    expect((rel as any).to_construct_id).toBe(constructAId);
    expect((rel as any).to_source_id).toBeNull();
  });

  it('valid construct → construct works', async () => {
    const rel = await EvidenceRelationshipModel.create({
      project_id: projectId,
      from_source_id: null,
      from_construct_id: constructAId,
      to_source_id: null,
      to_construct_id: constructBId,
      relationship_type: 'ADDRESSES',
    });

    expect((rel as any).from_construct_id).toBe(constructAId);
    expect((rel as any).to_construct_id).toBe(constructBId);
  });

  it('nonexistent source endpoint fails at DB level', async () => {
    await expect(
      EvidenceRelationshipModel.create({
        project_id: projectId,
        from_source_id: 99999,
        from_construct_id: null,
        to_source_id: null,
        to_construct_id: constructAId,
        relationship_type: 'DERIVED_FROM',
      }),
    ).rejects.toThrow();
  });

  it('nonexistent construct endpoint fails at DB level', async () => {
    await expect(
      EvidenceRelationshipModel.create({
        project_id: projectId,
        from_source_id: null,
        from_construct_id: 99999,
        to_source_id: null,
        to_construct_id: constructAId,
        relationship_type: 'SUPPORTS',
      }),
    ).rejects.toThrow();
  });

  it('zero FROM endpoints fails (CHECK constraint)', async () => {
    await expect(
      EvidenceRelationshipModel.create({
        project_id: projectId,
        from_source_id: null,
        from_construct_id: null,
        to_source_id: null,
        to_construct_id: constructAId,
        relationship_type: 'DERIVED_FROM',
      }),
    ).rejects.toThrow();
  });

  it('two FROM endpoints fails (CHECK constraint)', async () => {
    await expect(
      EvidenceRelationshipModel.create({
        project_id: projectId,
        from_source_id: sourceId,
        from_construct_id: constructAId,
        to_source_id: null,
        to_construct_id: constructBId,
        relationship_type: 'DERIVED_FROM',
      }),
    ).rejects.toThrow();
  });

  it('zero TO endpoints fails (CHECK constraint)', async () => {
    await expect(
      EvidenceRelationshipModel.create({
        project_id: projectId,
        from_source_id: sourceId,
        from_construct_id: null,
        to_source_id: null,
        to_construct_id: null,
        relationship_type: 'DERIVED_FROM',
      }),
    ).rejects.toThrow();
  });

  it('two TO endpoints fails (CHECK constraint)', async () => {
    await expect(
      EvidenceRelationshipModel.create({
        project_id: projectId,
        from_source_id: sourceId,
        from_construct_id: null,
        to_source_id: sourceId,
        to_construct_id: constructAId,
        relationship_type: 'DERIVED_FROM',
      }),
    ).rejects.toThrow();
  });

  it('deletion of source cascades to its relationship edges (no orphan lineage)', async () => {
    await EvidenceRelationshipModel.create({
      project_id: projectId,
      from_source_id: sourceId,
      from_construct_id: null,
      to_source_id: null,
      to_construct_id: constructAId,
      relationship_type: 'DERIVED_FROM',
    });

    // Delete the source
    await EvidenceSourceModel.destroy({ where: { id: sourceId } });

    // Relationship should be gone
    const rels = await EvidenceRelationshipModel.count();
    expect(rels).toBe(0);
  });

  it('deletion of construct cascades to its relationship edges', async () => {
    await EvidenceRelationshipModel.create({
      project_id: projectId,
      from_source_id: null,
      from_construct_id: constructAId,
      to_source_id: null,
      to_construct_id: constructBId,
      relationship_type: 'ADDRESSES',
    });

    // Delete constructA (the from side)
    await EvidenceConstructModel.destroy({ where: { id: constructAId } });

    const rels = await EvidenceRelationshipModel.count();
    expect(rels).toBe(0);
  });

  it('supports forward query (from source)', async () => {
    await EvidenceRelationshipModel.create({
      project_id: projectId,
      from_source_id: sourceId, from_construct_id: null,
      to_source_id: null, to_construct_id: constructAId,
      relationship_type: 'DERIVED_FROM',
    });

    const rels = await EvidenceRelationshipModel.findAll({
      where: { from_source_id: sourceId },
    });
    expect(rels).toHaveLength(1);
    expect((rels[0] as any).to_construct_id).toBe(constructAId);
  });

  it('supports reverse query (to construct)', async () => {
    await EvidenceRelationshipModel.create({
      project_id: projectId,
      from_source_id: null, from_construct_id: constructAId,
      to_source_id: null, to_construct_id: constructBId,
      relationship_type: 'ADDRESSES',
    });

    const rels = await EvidenceRelationshipModel.findAll({
      where: { to_construct_id: constructBId },
    });
    expect(rels).toHaveLength(1);
    expect((rels[0] as any).from_construct_id).toBe(constructAId);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. TRANSACTIONAL DERIVATION
// ═══════════════════════════════════════════════════════════════════════

describe('transactional derivation', () => {
  it('creates construct + relationships atomically', async () => {
    const source = await EvidenceSourceModel.create({
      project_id: projectId, source_type: 'stakeholder_interview',
      label: 'Interview with PM', created_by: 'U_TEST',
    });
    const sourceId = (source as any).id;

    const result = await sequelize.transaction(async (t) => {
      const construct = await EvidenceConstructModel.create({
        project_id: projectId,
        construct_type: 'stakeholder_constraint',
        label: 'Must comply with Section 508',
        payload: { constraint_type: 'regulatory' },
        derivation_type: 'human',
        created_by: 'U_TEST',
      }, { transaction: t });

      const rel = await EvidenceRelationshipModel.create({
        project_id: projectId,
        from_source_id: sourceId,
        from_construct_id: null,
        to_source_id: null,
        to_construct_id: (construct as any).id,
        relationship_type: 'DERIVED_FROM',
      }, { transaction: t });

      return { construct, rel };
    });

    expect(await EvidenceConstructModel.findByPk((result.construct as any).id)).not.toBeNull();
    expect(await EvidenceRelationshipModel.findByPk((result.rel as any).id)).not.toBeNull();
  });

  it('rolls back all records on forced failure', async () => {
    const countBefore = await EvidenceConstructModel.count();

    try {
      await sequelize.transaction(async (t) => {
        await EvidenceConstructModel.create({
          project_id: projectId, construct_type: 'barrier',
          label: 'Will be rolled back', created_by: 'U_TEST',
        }, { transaction: t });
        throw new Error('Simulated derivation failure');
      });
    } catch { /* expected */ }

    expect(await EvidenceConstructModel.count()).toBe(countBefore);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. DELETION BEHAVIOR — CASCADE SEMANTICS
// ═══════════════════════════════════════════════════════════════════════

describe('deletion behavior', () => {
  it('cascades evidence deletion when project is deleted', async () => {
    await EvidenceSourceModel.create({
      project_id: projectId, source_type: 'uploaded_document',
      label: 'Will cascade delete', created_by: 'U_TEST',
    });
    await EvidenceConstructModel.create({
      project_id: projectId, construct_type: 'knowledge_gap',
      label: 'Will cascade delete', created_by: 'U_TEST',
    });

    await Project.destroy({ where: { id: projectId } });

    expect(await EvidenceSourceModel.count({ where: { project_id: projectId } })).toBe(0);
    expect(await EvidenceConstructModel.count({ where: { project_id: projectId } })).toBe(0);
  });

  it('study-scoped source/construct is deleted with its study', async () => {
    await EvidenceSourceModel.create({
      project_id: projectId, study_id: studyId,
      source_type: 'session_transcript',
      label: 'Study-scoped transcript', created_by: 'U_TEST',
    });
    await EvidenceConstructModel.create({
      project_id: projectId, study_id: studyId,
      construct_type: 'nugget',
      label: 'Study-scoped nugget', created_by: 'U_TEST',
    });

    await ResearchStudy.destroy({ where: { id: studyId } });

    // Study-scoped evidence must be gone, NOT reclassified as project-scoped
    expect(await EvidenceSourceModel.count({ where: { project_id: projectId } })).toBe(0);
    expect(await EvidenceConstructModel.count({ where: { project_id: projectId } })).toBe(0);
  });

  it('nothing formerly study-scoped remains as study_id = NULL', async () => {
    await EvidenceConstructModel.create({
      project_id: projectId, study_id: studyId,
      construct_type: 'nugget', label: 'Study nugget', created_by: 'U_TEST',
    });

    await ResearchStudy.destroy({ where: { id: studyId } });

    const remaining = await EvidenceConstructModel.findAll({
      where: { project_id: projectId },
    });
    expect(remaining).toHaveLength(0);
  });

  it('project-scoped discovery source survives unrelated study deletion', async () => {
    // Discovery source: project-scoped (study_id = NULL)
    await EvidenceSourceModel.create({
      project_id: projectId, study_id: null,
      source_type: 'uploaded_document',
      label: 'Discovery source', created_by: 'U_TEST',
    });

    // Delete the study — should not affect discovery source
    await ResearchStudy.destroy({ where: { id: studyId } });

    const remaining = await EvidenceSourceModel.findAll({
      where: { project_id: projectId },
    });
    expect(remaining).toHaveLength(1);
    expect((remaining[0] as any).label).toBe('Discovery source');
    expect((remaining[0] as any).study_id).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. ZERO-USE BACKWARD COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════

describe('zero-use backward compatibility', () => {
  it('existing study_variables operations work when evidence tables are empty', async () => {
    expect(await EvidenceSourceModel.count()).toBe(0);
    expect(await EvidenceConstructModel.count()).toBe(0);
    expect(await EvidenceRelationshipModel.count()).toBe(0);

    const variable = await StudyVariableModel.create({
      project_id: projectId, study_id: studyId,
      variable_key: 'discovered_barriers', variable_type: 'pool',
      value: { id: 'DB-001', title: 'Test barrier', summary: 'A barrier' },
      source_template: 'desk_research', source_version: '7.0',
      is_pool: true, item_key: 'DB-001', scope: 'study',
      extracted_at: new Date(),
    });

    expect((variable as any).id).toBeDefined();
    const retrieved = await StudyVariableModel.findByPk((variable as any).id);
    expect((retrieved as any).value).toEqual({
      id: 'DB-001', title: 'Test barrier', summary: 'A barrier',
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. MULTI-HOP LINEAGE CHAIN
// ═══════════════════════════════════════════════════════════════════════

describe('multi-hop lineage', () => {
  it('source → gap → question → nugget chain with FK-backed edges', async () => {
    const source = await EvidenceSourceModel.create({
      project_id: projectId, source_type: 'uploaded_document',
      label: 'Policy analysis', created_by: 'U_TEST',
    });

    const gap = await EvidenceConstructModel.create({
      project_id: projectId, construct_type: 'knowledge_gap',
      label: 'Unknown upload success rate', created_by: 'U_TEST',
    });

    const question = await EvidenceConstructModel.create({
      project_id: projectId, study_id: studyId,
      construct_type: 'research_question',
      label: 'What is the upload success rate?', created_by: 'U_TEST',
    });

    const nugget = await EvidenceConstructModel.create({
      project_id: projectId, study_id: studyId,
      construct_type: 'nugget',
      label: 'PT-001 reported 3 failed uploads',
      payload: { participant: 'PT-001', session: 'S1', severity: 3 },
      created_by: 'U_TEST',
    });

    // Create lineage chain with FK columns
    await EvidenceRelationshipModel.bulkCreate([
      {
        project_id: projectId,
        from_source_id: (source as any).id, from_construct_id: null,
        to_source_id: null, to_construct_id: (gap as any).id,
        relationship_type: 'DERIVED_FROM',
      },
      {
        project_id: projectId,
        from_source_id: null, from_construct_id: (gap as any).id,
        to_source_id: null, to_construct_id: (question as any).id,
        relationship_type: 'ADDRESSES',
      },
      {
        project_id: projectId,
        from_source_id: null, from_construct_id: (nugget as any).id,
        to_source_id: null, to_construct_id: (question as any).id,
        relationship_type: 'ADDRESSES',
      },
    ]);

    // Verify: what addresses the research question?
    const addressors = await EvidenceRelationshipModel.findAll({
      where: { to_construct_id: (question as any).id, relationship_type: 'ADDRESSES' },
    });
    expect(addressors).toHaveLength(2);

    const fromConstructIds = addressors.map((r: any) => r.from_construct_id);
    expect(fromConstructIds).toContain((gap as any).id);
    expect(fromConstructIds).toContain((nugget as any).id);
  });
});
