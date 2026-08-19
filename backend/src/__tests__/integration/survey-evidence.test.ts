/**
 * Survey Evidence Integration Tests
 *
 * Validates: evidence_source creation for survey datasets,
 * survey_field_schema persistence and review state transitions,
 * deterministic construct creation with lineage, source reuse
 * via content hash, and zero-use backward compatibility.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';
import type { CreationAttributes } from 'sequelize';
import type { EvidenceSource } from '../../database/models/evidence_source';
import type { SurveyFieldSchema } from '../../database/models/survey_field_schema';
import { parseCsvBuffer } from '../../helpers/survey/csvParser';
import { computeContentHash } from '../../helpers/survey/sourceHash';
import { inferFieldSchema } from '../../helpers/survey/schemaInference';
import { computeSurveyFacts } from '../../helpers/survey/statsEngine';
import type { ConfirmedField } from '../../types/survey';

const sequelize = getTestDb();

jest.mock('../../helpers/github', () => ({
  fetchFileFromRepoByPath: jest.fn().mockResolvedValue(null),
  createOrUpdateFileOnGitHub: jest.fn().mockResolvedValue({ success: true }),
  getContentRepo: jest.fn().mockReturnValue('test-repo'),
}));

const Project = sequelize.models.Project;
const EvidenceSourceModel = sequelize.models.EvidenceSource;
const EvidenceConstructModel = sequelize.models.EvidenceConstruct;
const EvidenceRelationshipModel = sequelize.models.EvidenceRelationship;
const SurveyFieldSchemaModel = sequelize.models.SurveyFieldSchema;

const FIXTURES = join(__dirname, '../__fixtures__/survey');
let projectId: number;

beforeEach(async () => {
  await truncateAll();
  const project = await Project.create({
    name: 'Survey Test Project', slug: 'survey-test', status: 'active', created_by: 'U_TEST',
    organization_id: TEST_ORG_ID,
  });
  projectId = (project as any).id;
});

afterAll(async () => { await sequelize.close(); });

// ═══════════════════════════════════════════════════════════════════════
// SOURCE CREATION
// ═══════════════════════════════════════════════════════════════════════

describe('survey evidence_source', () => {
  it('creates a survey_dataset source with content hash', async () => {
    const csv = readFileSync(join(FIXTURES, 'standard.csv'));
    const hash = computeContentHash(csv);

    const source = await EvidenceSourceModel.create({
      project_id: projectId,
      source_type: 'survey_dataset',
      label: 'Test Survey — standard.csv',
      artifact_ref: { filename: 'standard.csv', content_hash: hash },
      metadata: { row_count: 10, column_count: 7 },
      created_by: 'U_TEST',
    } as CreationAttributes<EvidenceSource>);

    expect((source as any).id).toBeDefined();
    expect((source as any).public_id).toBeDefined();
    expect((source as any).source_type).toBe('survey_dataset');
    expect((source as any).artifact_ref.content_hash).toBe(hash);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// FIELD SCHEMA PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════

describe('survey_field_schemas', () => {
  let sourceId: number;

  beforeEach(async () => {
    const source = await EvidenceSourceModel.create({
      project_id: projectId, source_type: 'survey_dataset',
      label: 'Test', artifact_ref: { content_hash: 'abc' },
      created_by: 'U_TEST',
    } as CreationAttributes<EvidenceSource>);
    sourceId = (source as any).id;
  });

  it('persists inferred field schemas', async () => {
    await SurveyFieldSchemaModel.create({
      evidence_source_id: sourceId,
      field_name: 'overall_satisfaction',
      inferred_role: 'ordinal',
      inference_source: 'heuristic',
      review_status: 'pending',
    } as CreationAttributes<SurveyFieldSchema>);

    const schemas = await SurveyFieldSchemaModel.findAll({
      where: { evidence_source_id: sourceId },
    });
    expect(schemas).toHaveLength(1);
    expect((schemas[0] as any).inferred_role).toBe('ordinal');
    expect((schemas[0] as any).review_status).toBe('pending');
  });

  it('transitions from pending to confirmed with reviewer info', async () => {
    const schema = await SurveyFieldSchemaModel.create({
      evidence_source_id: sourceId,
      field_name: 'difficulty_rating',
      inferred_role: 'ordinal',
      review_status: 'pending',
    } as CreationAttributes<SurveyFieldSchema>);

    await schema.update({
      confirmed_role: 'ordinal',
      order_metadata: ['Very Easy', 'Easy', 'Moderate', 'Difficult', 'Very Difficult'],
      review_status: 'confirmed',
      reviewed_by: 'U_REVIEWER',
      reviewed_at: new Date(),
    });

    const updated = await SurveyFieldSchemaModel.findByPk((schema as any).id);
    expect((updated as any).confirmed_role).toBe('ordinal');
    expect((updated as any).order_metadata).toEqual(['Very Easy', 'Easy', 'Moderate', 'Difficult', 'Very Difficult']);
    expect((updated as any).review_status).toBe('confirmed');
  });

  it('enforces unique (evidence_source_id, field_name)', async () => {
    await SurveyFieldSchemaModel.create({
      evidence_source_id: sourceId, field_name: 'satisfaction',
      inferred_role: 'ordinal', review_status: 'pending',
    } as CreationAttributes<SurveyFieldSchema>);

    await expect(
      SurveyFieldSchemaModel.create({
        evidence_source_id: sourceId, field_name: 'satisfaction',
        inferred_role: 'nominal', review_status: 'pending',
      } as CreationAttributes<SurveyFieldSchema>),
    ).rejects.toThrow();
  });

  it('cascades on evidence_source deletion', async () => {
    await SurveyFieldSchemaModel.create({
      evidence_source_id: sourceId, field_name: 'test_field',
      inferred_role: 'nominal', review_status: 'pending',
    } as CreationAttributes<SurveyFieldSchema>);

    await EvidenceSourceModel.destroy({ where: { id: sourceId } });

    const remaining = await SurveyFieldSchemaModel.count({
      where: { evidence_source_id: sourceId },
    });
    expect(remaining).toBe(0);
  });

  it('schema rows contain no raw CSV content column', async () => {
    const schema = await SurveyFieldSchemaModel.create({
      evidence_source_id: sourceId, field_name: 'test',
      inferred_role: 'nominal', review_status: 'pending',
    } as CreationAttributes<SurveyFieldSchema>);

    // Verify the model does not have a pending_csv_content column
    // (raw CSV staging moved to Redis)
    const raw = schema as unknown as Record<string, unknown>;
    expect(raw.pending_csv_content).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ACCEPTED-SCHEMA REUSE GUARD
// ═══════════════════════════════════════════════════════════════════════

describe('accepted-schema reuse guard', () => {
  it('partially reviewed schema is NOT treated as reusable accepted schema', async () => {
    const source = await EvidenceSourceModel.create({
      project_id: projectId, source_type: 'survey_dataset',
      label: 'Partial review test', artifact_ref: { content_hash: 'abc123' },
      created_by: 'U_TEST',
    } as CreationAttributes<EvidenceSource>);
    const sourceId = (source as any).id;

    // Simulate paginated review: first 2 fields confirmed, third still pending
    await SurveyFieldSchemaModel.create({
      evidence_source_id: sourceId, field_name: 'field_a',
      inferred_role: 'nominal', confirmed_role: 'nominal',
      review_status: 'confirmed', reviewed_by: 'U_TEST', reviewed_at: new Date(),
    } as CreationAttributes<SurveyFieldSchema>);
    await SurveyFieldSchemaModel.create({
      evidence_source_id: sourceId, field_name: 'field_b',
      inferred_role: 'ordinal', confirmed_role: 'ordinal',
      review_status: 'confirmed', reviewed_by: 'U_TEST', reviewed_at: new Date(),
    } as CreationAttributes<SurveyFieldSchema>);
    await SurveyFieldSchemaModel.create({
      evidence_source_id: sourceId, field_name: 'field_c',
      inferred_role: 'open_text',
      review_status: 'pending', // NOT confirmed
    } as CreationAttributes<SurveyFieldSchema>);

    // Query the same way the handler does:
    const confirmedSchemas = await SurveyFieldSchemaModel.findAll({
      where: { evidence_source_id: sourceId, review_status: 'confirmed' },
    });
    const pendingCount = await SurveyFieldSchemaModel.count({
      where: { evidence_source_id: sourceId, review_status: 'pending' },
    });

    // Guard: must have confirmed rows AND zero pending AND count matches CSV headers
    const csvHeaderCount = 3; // simulated: field_a, field_b, field_c
    const isCompleteAccepted = confirmedSchemas.length > 0
      && pendingCount === 0
      && confirmedSchemas.length === csvHeaderCount;

    // Partial review must NOT be treated as accepted
    expect(isCompleteAccepted).toBe(false);
    expect(pendingCount).toBe(1);
    expect(confirmedSchemas.length).toBe(2);
  });

  it('fully reviewed schema IS treated as reusable accepted schema', async () => {
    const source = await EvidenceSourceModel.create({
      project_id: projectId, source_type: 'survey_dataset',
      label: 'Full review test', artifact_ref: { content_hash: 'def456' },
      created_by: 'U_TEST',
    } as CreationAttributes<EvidenceSource>);
    const sourceId = (source as any).id;

    // All fields confirmed
    await SurveyFieldSchemaModel.create({
      evidence_source_id: sourceId, field_name: 'field_a',
      inferred_role: 'nominal', confirmed_role: 'nominal',
      review_status: 'confirmed', reviewed_by: 'U_TEST', reviewed_at: new Date(),
    } as CreationAttributes<SurveyFieldSchema>);
    await SurveyFieldSchemaModel.create({
      evidence_source_id: sourceId, field_name: 'field_b',
      inferred_role: 'ordinal', confirmed_role: 'ordinal',
      review_status: 'confirmed', reviewed_by: 'U_TEST', reviewed_at: new Date(),
    } as CreationAttributes<SurveyFieldSchema>);

    const confirmedSchemas = await SurveyFieldSchemaModel.findAll({
      where: { evidence_source_id: sourceId, review_status: 'confirmed' },
    });
    const pendingCount = await SurveyFieldSchemaModel.count({
      where: { evidence_source_id: sourceId, review_status: 'pending' },
    });

    const csvHeaderCount = 2; // simulated: field_a, field_b
    const isCompleteAccepted = confirmedSchemas.length > 0
      && pendingCount === 0
      && confirmedSchemas.length === csvHeaderCount;

    expect(isCompleteAccepted).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// DETERMINISTIC CONSTRUCTS + LINEAGE
// ═══════════════════════════════════════════════════════════════════════

describe('deterministic survey constructs', () => {
  it('creates survey_dataset_summary construct with lineage to source', async () => {
    const csv = readFileSync(join(FIXTURES, 'standard.csv'));
    const hash = computeContentHash(csv);
    const survey = parseCsvBuffer(csv, 'standard.csv');

    const source = await EvidenceSourceModel.create({
      project_id: projectId, source_type: 'survey_dataset',
      label: 'Standard survey', artifact_ref: { content_hash: hash },
      created_by: 'U_TEST',
    } as CreationAttributes<EvidenceSource>);

    const confirmedFields: ConfirmedField[] = [
      { fieldName: 'response_id', confirmedRole: 'id', orderMetadata: null, isDemographic: false },
      { fieldName: 'overall_satisfaction', confirmedRole: 'ordinal',
        orderMetadata: ['Very Dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very Satisfied'],
        isDemographic: false },
      { fieldName: 'completion_status', confirmedRole: 'nominal', orderMetadata: null, isDemographic: false },
    ];

    const facts = computeSurveyFacts(survey, confirmedFields, hash);

    // Create construct
    const construct = await EvidenceConstructModel.create({
      project_id: projectId,
      construct_type: 'survey_dataset_summary',
      label: `Standard survey — ${facts.totalRespondents} respondents`,
      payload: { total_respondents: facts.totalRespondents, source_content_hash: hash },
      derivation_type: 'deterministic',
      status: 'accepted',
      created_by: 'U_TEST',
    });

    // Create lineage
    await EvidenceRelationshipModel.create({
      project_id: projectId,
      from_source_id: (source as any).id,
      from_construct_id: null,
      to_source_id: null,
      to_construct_id: (construct as any).id,
      relationship_type: 'DERIVED_FROM',
    });

    // Verify lineage
    const rels = await EvidenceRelationshipModel.findAll({
      where: { from_source_id: (source as any).id },
    });
    expect(rels).toHaveLength(1);
    expect((rels[0] as any).to_construct_id).toBe((construct as any).id);
    expect((construct as any).derivation_type).toBe('deterministic');
    expect((construct as any).status).toBe('accepted');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// DETERMINISM INVARIANT
// ═══════════════════════════════════════════════════════════════════════

describe('determinism invariant', () => {
  it('same CSV + same schema produces identical computed facts 3 times', () => {
    const csv = readFileSync(join(FIXTURES, 'standard.csv'));
    const hash = computeContentHash(csv);
    const survey = parseCsvBuffer(csv, 'standard.csv');

    const fields: ConfirmedField[] = [
      { fieldName: 'response_id', confirmedRole: 'id', orderMetadata: null, isDemographic: false },
      { fieldName: 'overall_satisfaction', confirmedRole: 'ordinal',
        orderMetadata: ['Very Dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very Satisfied'],
        isDemographic: false },
      { fieldName: 'difficulty_rating', confirmedRole: 'ordinal',
        orderMetadata: ['Very Difficult', 'Difficult', 'Moderate', 'Easy', 'Very Easy'],
        isDemographic: false },
      { fieldName: 'completion_status', confirmedRole: 'nominal', orderMetadata: null, isDemographic: false },
      { fieldName: 'biggest_challenge', confirmedRole: 'open_text', orderMetadata: null, isDemographic: false },
    ];

    const run1 = computeSurveyFacts(survey, fields, hash);
    const run2 = computeSurveyFacts(survey, fields, hash);
    const run3 = computeSurveyFacts(survey, fields, hash);

    expect(run1).toEqual(run2);
    expect(run2).toEqual(run3);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ZERO-USE COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════

describe('zero-use backward compatibility', () => {
  it('existing cascade operations work when survey tables are empty', async () => {
    expect(await SurveyFieldSchemaModel.count()).toBe(0);

    // study_variables still works
    const StudyVariableModel = sequelize.models.StudyVariable;
    const study = await sequelize.models.ResearchStudy.create({
      project_id: projectId, name: 'Compat Study', slug: 'compat',
      path: 'survey-test/compat', status: 'active', created_by: 'U_TEST',
      channel_name: 'test', researcher_name: 'Test', researcher_email: 'test@test.com',
    });

    const variable = await StudyVariableModel.create({
      project_id: projectId, study_id: (study as any).id,
      variable_key: 'discovered_barriers', variable_type: 'pool',
      value: { id: 'DB-001', title: 'Test' },
      source_template: 'desk_research', is_pool: true, item_key: 'DB-001',
      scope: 'study', extracted_at: new Date(),
    });

    expect((variable as any).id).toBeDefined();
  });
});
