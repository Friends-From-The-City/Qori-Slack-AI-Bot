/**
 * Survey Codebook Lifecycle Integration Tests
 *
 * Tests against real Postgres: codebook creation, acceptance,
 * immutability, versioning, supersession, FK cascades.
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';
import type { CreationAttributes } from 'sequelize';
import type { EvidenceSource } from '../../database/models/evidence_source';
import type { SurveyQualitativeEntry } from '../../database/models/survey_qualitative_entry';
import type { SurveyCodebook } from '../../database/models/survey_codebook';
import type { SurveyCode } from '../../database/models/survey_code';
import type { SurveyCodeExample } from '../../database/models/survey_code_example';

const sequelize = getTestDb();

jest.mock('../../helpers/github', () => ({
  fetchFileFromRepoByPath: jest.fn().mockResolvedValue(null),
  createOrUpdateFileOnGitHub: jest.fn().mockResolvedValue({ success: true }),
  getContentRepo: jest.fn().mockReturnValue('test-repo'),
}));

const Project = sequelize.models.Project;
const EvidenceSourceModel = sequelize.models.EvidenceSource;
const EntryModel = sequelize.models.SurveyQualitativeEntry;
const CodebookModel = sequelize.models.SurveyCodebook;
const CodeModel = sequelize.models.SurveyCode;
const ExampleModel = sequelize.models.SurveyCodeExample;

let projectId: number;
let sourceId: number;
let entryId1: number;
let entryId2: number;

beforeEach(async () => {
  await truncateAll();

  const project = await Project.create({
    name: 'Codebook Test', slug: 'codebook-test', status: 'active', created_by: 'U_TEST',
    organization_id: TEST_ORG_ID,
  });
  projectId = (project as any).id;

  const source = await EvidenceSourceModel.create({
    project_id: projectId, source_type: 'survey_dataset',
    label: 'Test survey', artifact_ref: { content_hash: 'abc' },
    created_by: 'U_TEST',
  } as CreationAttributes<EvidenceSource>);
  sourceId = (source as any).id;

  const entry1 = await EntryModel.create({
    evidence_source_id: sourceId, project_id: projectId,
    respondent_key: 'T001', display_respondent_id: 'T001',
    field_name: 'feedback', field_display_name: 'Feedback',
    entry_text: 'The form was confusing', entry_hash: 'hash1',
    pii_status: 'clear', metadata: {},
  } as CreationAttributes<SurveyQualitativeEntry>);
  entryId1 = (entry1 as any).id;

  const entry2 = await EntryModel.create({
    evidence_source_id: sourceId, project_id: projectId,
    respondent_key: 'T002', display_respondent_id: 'T002',
    field_name: 'feedback', field_display_name: 'Feedback',
    entry_text: 'Upload kept failing', entry_hash: 'hash2',
    pii_status: 'clear', metadata: {},
  } as CreationAttributes<SurveyQualitativeEntry>);
  entryId2 = (entry2 as any).id;
});

afterAll(async () => { await sequelize.close(); });

describe('codebook v1 lifecycle', () => {
  it('creates a draft codebook with codes and examples', async () => {
    const codebook = await CodebookModel.create({
      evidence_source_id: sourceId, project_id: projectId,
      version: 1, status: 'under_review', created_by: 'U_TEST',
      generation_metadata: { approach: 'mixed_inductive_deductive' },
    } as CreationAttributes<SurveyCodebook>);

    const code = await CodeModel.create({
      codebook_id: (codebook as any).id, code_key: 'form_confusion',
      label: 'Form Confusion', definition: 'Difficulty with form layout',
      include_when: 'Respondent mentions form difficulty',
      origin: 'qori_proposed', status: 'proposed', sort_order: 0, metadata: {},
    } as CreationAttributes<SurveyCode>);

    await ExampleModel.create({
      code_id: (code as any).id, qualitative_entry_id: entryId1,
      example_type: 'include',
    } as CreationAttributes<SurveyCodeExample>);

    expect((codebook as any).public_id).toBeDefined();
    expect((code as any).public_id).toBeDefined();
  });

  it('accepts a codebook with reviewed_by/reviewed_at', async () => {
    const codebook = await CodebookModel.create({
      evidence_source_id: sourceId, project_id: projectId,
      version: 1, status: 'under_review', created_by: 'U_TEST',
      generation_metadata: {},
    } as CreationAttributes<SurveyCodebook>);

    await CodeModel.create({
      codebook_id: (codebook as any).id, code_key: 'test_code',
      label: 'Test Code', definition: 'Test', include_when: 'Test',
      origin: 'qori_proposed', status: 'accepted', sort_order: 0, metadata: {},
    } as CreationAttributes<SurveyCode>);

    await codebook.update({
      status: 'accepted', reviewed_by: 'U_REVIEWER', reviewed_at: new Date(),
    });

    const accepted = await CodebookModel.findByPk((codebook as any).id);
    expect((accepted as any).status).toBe('accepted');
    expect((accepted as any).reviewed_by).toBe('U_REVIEWER');
    expect((accepted as any).reviewed_at).toBeDefined();
  });

  it('accepted codebook codes remain FK-valid', async () => {
    const codebook = await CodebookModel.create({
      evidence_source_id: sourceId, project_id: projectId,
      version: 1, status: 'accepted', created_by: 'U_TEST',
      reviewed_by: 'U_R', reviewed_at: new Date(), generation_metadata: {},
    } as CreationAttributes<SurveyCodebook>);

    const code = await CodeModel.create({
      codebook_id: (codebook as any).id, code_key: 'valid_code',
      label: 'Valid', definition: 'Valid', include_when: 'Valid',
      origin: 'qori_proposed', status: 'accepted', sort_order: 0, metadata: {},
    } as CreationAttributes<SurveyCode>);

    const example = await ExampleModel.create({
      code_id: (code as any).id, qualitative_entry_id: entryId1,
      example_type: 'include',
    } as CreationAttributes<SurveyCodeExample>);

    // Verify FK chain
    const loadedExample = await ExampleModel.findByPk((example as any).id);
    expect(loadedExample).not.toBeNull();
    const loadedCode = await CodeModel.findByPk((code as any).id);
    expect(loadedCode).not.toBeNull();
  });
});

describe('codebook versioning', () => {
  it('creates v2 based on accepted v1 and supersedes v1 on acceptance', async () => {
    // Create and accept v1
    const v1 = await CodebookModel.create({
      evidence_source_id: sourceId, project_id: projectId,
      version: 1, status: 'accepted', created_by: 'U_TEST',
      reviewed_by: 'U_R', reviewed_at: new Date(), generation_metadata: {},
    } as CreationAttributes<SurveyCodebook>);

    await CodeModel.create({
      codebook_id: (v1 as any).id, code_key: 'c1',
      label: 'Code 1', definition: 'Def', include_when: 'When',
      origin: 'qori_proposed', status: 'accepted', sort_order: 0, metadata: {},
    } as CreationAttributes<SurveyCode>);

    // Create v2 based on v1
    const v2 = await CodebookModel.create({
      evidence_source_id: sourceId, project_id: projectId,
      version: 2, status: 'under_review', created_by: 'U_TEST',
      based_on_codebook_id: (v1 as any).id, generation_metadata: {},
    } as CreationAttributes<SurveyCodebook>);

    await CodeModel.create({
      codebook_id: (v2 as any).id, code_key: 'c1',
      label: 'Code 1 Revised', definition: 'Updated def', include_when: 'Updated when',
      origin: 'inherited', status: 'accepted', sort_order: 0, metadata: {},
    } as CreationAttributes<SurveyCode>);

    // Accept v2, supersede v1
    await v2.update({ status: 'accepted', reviewed_by: 'U_R2', reviewed_at: new Date() });
    await v1.update({ status: 'superseded' });

    const v1Reloaded = await CodebookModel.findByPk((v1 as any).id);
    const v2Reloaded = await CodebookModel.findByPk((v2 as any).id);
    expect((v1Reloaded as any).status).toBe('superseded');
    expect((v2Reloaded as any).status).toBe('accepted');
    expect((v2Reloaded as any).based_on_codebook_id).toBe((v1 as any).id);
  });

  it('unique constraint prevents duplicate versions', async () => {
    await CodebookModel.create({
      evidence_source_id: sourceId, project_id: projectId,
      version: 1, status: 'draft', created_by: 'U_TEST', generation_metadata: {},
    } as CreationAttributes<SurveyCodebook>);

    await expect(
      CodebookModel.create({
        evidence_source_id: sourceId, project_id: projectId,
        version: 1, status: 'draft', created_by: 'U_TEST', generation_metadata: {},
      } as CreationAttributes<SurveyCodebook>),
    ).rejects.toThrow();
  });
});

describe('FK cascades', () => {
  it('deleting evidence source cascades to entries, codebooks, codes, examples', async () => {
    const codebook = await CodebookModel.create({
      evidence_source_id: sourceId, project_id: projectId,
      version: 1, status: 'draft', created_by: 'U_TEST', generation_metadata: {},
    } as CreationAttributes<SurveyCodebook>);

    const code = await CodeModel.create({
      codebook_id: (codebook as any).id, code_key: 'test',
      label: 'Test', definition: 'Test', include_when: 'Test',
      origin: 'qori_proposed', status: 'proposed', sort_order: 0, metadata: {},
    } as CreationAttributes<SurveyCode>);

    await ExampleModel.create({
      code_id: (code as any).id, qualitative_entry_id: entryId1,
      example_type: 'include',
    } as CreationAttributes<SurveyCodeExample>);

    // Delete source → everything cascades
    await EvidenceSourceModel.destroy({ where: { id: sourceId } });

    expect(await EntryModel.count({ where: { evidence_source_id: sourceId } })).toBe(0);
    expect(await CodebookModel.count({ where: { evidence_source_id: sourceId } })).toBe(0);
    expect(await CodeModel.count()).toBe(0);
    expect(await ExampleModel.count()).toBe(0);
  });
});

describe('privacy gate', () => {
  it('pending entries block codebook eligibility', async () => {
    // Create a pending entry
    await EntryModel.create({
      evidence_source_id: sourceId, project_id: projectId,
      respondent_key: 'T003', display_respondent_id: 'T003',
      field_name: 'notes', field_display_name: 'Notes',
      entry_text: 'Pending text', entry_hash: 'hash3',
      pii_status: 'pending', metadata: {},
    } as CreationAttributes<SurveyQualitativeEntry>);

    // Verify using governance service (domain logic, not DB service)
    const { isPrivacyReviewComplete } = require('../../services/content-governance.service');

    const allEntries = await EntryModel.findAll({
      where: { evidence_source_id: sourceId },
    });
    const entries = allEntries.map((e: any) => ({ pii_status: e.pii_status }));

    // Should NOT be complete because T003 is pending
    expect(isPrivacyReviewComplete(entries)).toBe(false);
  });

  it('redaction preserves original entry_text unchanged', async () => {
    const entry = await EntryModel.create({
      evidence_source_id: sourceId, project_id: projectId,
      respondent_key: 'T004', display_respondent_id: 'T004',
      field_name: 'notes', field_display_name: 'Notes',
      entry_text: 'Original sensitive text', entry_hash: 'hash4',
      pii_status: 'pending', redacted_text: 'Scrubbed text', metadata: {},
    } as CreationAttributes<SurveyQualitativeEntry>);

    // Simulate redaction disposition
    await entry.update({
      pii_status: 'redacted',
      redacted_text: 'Researcher-edited safe version',
      pii_reviewed_by: 'U_REVIEWER',
      pii_reviewed_at: new Date(),
    });

    const reloaded = await EntryModel.findByPk((entry as any).id);
    // Original text must remain unchanged
    expect((reloaded as any).entry_text).toBe('Original sensitive text');
    // Redacted text updated by researcher
    expect((reloaded as any).redacted_text).toBe('Researcher-edited safe version');
    expect((reloaded as any).pii_status).toBe('redacted');
  });
});
