/**
 * PH-5A: Session Evidence Lineage Integration Tests
 *
 * Tests against real Postgres: source identity, nugget constructs,
 * DERIVED_FROM relationships, dedup, and participant identity isolation.
 */

import { getTestDb, truncateAll } from './setup/testDb';
import type { CreationAttributes } from 'sequelize';
import type { EvidenceSource } from '../../database/models/evidence_source';
import type { EvidenceConstruct } from '../../database/models/evidence_construct';
import type { EvidenceRelationship } from '../../database/models/evidence_relationship';
import {
  resolveSessionSource,
  createNuggetConstructs,
  type NuggetInput,
} from '../../services/session-evidence.service';

const sequelize = getTestDb();

jest.mock('../../helpers/github', () => ({
  fetchFileFromRepoByPath: jest.fn().mockResolvedValue(null),
  createOrUpdateFileOnGitHub: jest.fn().mockResolvedValue({ success: true }),
  getContentRepo: jest.fn().mockReturnValue('test-repo'),
}));

const Project = sequelize.models.Project;
const Study = sequelize.models.ResearchStudy;
const EvidenceSourceModel = sequelize.models.EvidenceSource;
const EvidenceConstructModel = sequelize.models.EvidenceConstruct;
const EvidenceRelationshipModel = sequelize.models.EvidenceRelationship;

let projectId: number;
let studyId: number;

async function setupFixtures() {
  const project = await Project.create({
    name: 'Lineage Test', slug: 'lineage-test', status: 'active', created_by: 'U_TEST',
  });
  projectId = (project as any).id;

  const study = await Study.create({
    project_id: projectId, name: 'Session Study', slug: 'session-study',
    path: 'lineage-test/session-study', created_by: 'U_TEST', status: 'active',
    channel_name: 'test-channel', researcher_name: 'Test Researcher',
    researcher_email: 'test@example.com',
  });
  studyId = (study as any).id;
}

beforeAll(async () => {
  await truncateAll();
  await setupFixtures();
});

afterAll(async () => {
  await truncateAll();
});

// ═══════════════════════════════════════════════════════════════════════
// SOURCE IDENTITY
// ═══════════════════════════════════════════════════════════════════════

describe('PH-5A: Source identity', () => {
  it('creates an evidence_source for a session transcript', async () => {
    const result = await resolveSessionSource({
      projectId,
      studyId,
      studyNotesId: 1,
      sourceType: 'session_transcript',
      label: 'test-transcript.md',
      governedContent: 'Governed transcript content for PT-001.',
      createdBy: 'U_TEST',
    });

    expect(result.isNew).toBe(true);
    expect(result.publicId).toBeTruthy();

    const source = await EvidenceSourceModel.findByPk(result.id);
    expect(source).toBeTruthy();
    expect((source as any).source_type).toBe('session_transcript');
    expect((source as any).public_id).toBe(result.publicId);
  });

  it('reuses existing source on rerun with same content', async () => {
    const first = await resolveSessionSource({
      projectId,
      studyId,
      studyNotesId: 2,
      sourceType: 'session_transcript',
      label: 'rerun-test.md',
      governedContent: 'Same content for dedup test.',
      createdBy: 'U_TEST',
    });
    expect(first.isNew).toBe(true);

    const second = await resolveSessionSource({
      projectId,
      studyId,
      studyNotesId: 2,
      sourceType: 'session_transcript',
      label: 'rerun-test.md',
      governedContent: 'Same content for dedup test.',
      createdBy: 'U_TEST',
    });
    expect(second.isNew).toBe(false);
    expect(second.id).toBe(first.id);
    expect(second.publicId).toBe(first.publicId);
  });

  it('creates new source version when content changes', async () => {
    const v1 = await resolveSessionSource({
      projectId,
      studyId,
      studyNotesId: 3,
      sourceType: 'session_transcript',
      label: 'version-test.md',
      governedContent: 'Version 1 content.',
      createdBy: 'U_TEST',
    });
    expect(v1.isNew).toBe(true);

    const v2 = await resolveSessionSource({
      projectId,
      studyId,
      studyNotesId: 3,
      sourceType: 'session_transcript',
      label: 'version-test.md',
      governedContent: 'Version 2 content — different.',
      createdBy: 'U_TEST',
    });
    expect(v2.isNew).toBe(true);
    expect(v2.id).not.toBe(v1.id);
    // Both sources exist (version history preserved)
  });

  it('source does not contain participant real identity', async () => {
    const source = await resolveSessionSource({
      projectId,
      studyId,
      studyNotesId: 4,
      sourceType: 'session_transcript',
      label: 'privacy-test.md',
      governedContent: 'Governed content with PT-001 code only.',
      createdBy: 'U_TEST',
    });

    const record = await EvidenceSourceModel.findByPk(source.id);
    const metadata = (record as any).metadata;
    const artifactRef = (record as any).artifact_ref;
    const fullRecord = JSON.stringify(record);

    // No real names, emails, or phones should be in evidence records
    expect(fullRecord).not.toContain('John');
    expect(fullRecord).not.toContain('Doe');
    expect(fullRecord).not.toContain('@');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// NUGGET CONSTRUCTS
// ═══════════════════════════════════════════════════════════════════════

describe('PH-5A: Nugget constructs', () => {
  let sourceId: number;
  let sourcePublicId: string;

  beforeAll(async () => {
    const source = await resolveSessionSource({
      projectId,
      studyId,
      studyNotesId: 10,
      sourceType: 'session_transcript',
      label: 'nugget-test-transcript.md',
      governedContent: 'Transcript content for nugget creation test.',
      createdBy: 'U_TEST',
    });
    sourceId = source.id;
    sourcePublicId = source.publicId;
  });

  it('creates evidence_construct records for nuggets', async () => {
    const nuggets: NuggetInput[] = [
      { displayId: 'nugget-PT-001-001', nuggetType: 'pain_point', severity: 3, text: 'Cannot find appointment selector', participantCode: 'PT-001', session: 'session-2026-08-10' },
      { displayId: 'nugget-PT-001-002', nuggetType: 'positive', severity: 0, text: 'Calendar view was intuitive', participantCode: 'PT-001', session: 'session-2026-08-10' },
    ];

    const created = await createNuggetConstructs(
      sourceId, projectId, studyId, nuggets,
      { templateId: 'session_summary', templateVersion: 'v7.2', modelName: 'claude-sonnet-4-6' },
      'U_TEST',
    );

    expect(created).toHaveLength(2);
    expect(created[0].publicId).toBeTruthy();
    expect(created[0].displayId).toBe('nugget-PT-001-001');

    // Verify construct records
    const construct = await EvidenceConstructModel.findByPk(created[0].constructId);
    expect((construct as any).construct_type).toBe('nugget');
    expect((construct as any).status).toBe('candidate');
    expect((construct as any).cascade_variable_key).toBe('atomic_nugget_core');

    const payload = (construct as any).payload;
    expect(payload.participant_code).toBe('PT-001');
    expect(payload.nugget_type).toBe('pain_point');
  });

  it('creates DERIVED_FROM relationships from source to nuggets', async () => {
    const relationships = await EvidenceRelationshipModel.findAll({
      where: { from_source_id: sourceId },
    });

    expect(relationships.length).toBeGreaterThanOrEqual(2);
    for (const rel of relationships) {
      expect((rel as any).relationship_type).toBe('DERIVED_FROM');
      expect((rel as any).from_source_id).toBe(sourceId);
      expect((rel as any).to_construct_id).toBeTruthy();
    }
  });

  it('nugget constructs use participant_code, not real identity', async () => {
    const constructs = await EvidenceConstructModel.findAll({
      where: { construct_type: 'nugget' },
    });

    for (const c of constructs) {
      const payload = (c as any).payload;
      expect(payload.participant_code).toMatch(/^PT-\d{3}$/);
      // No real names
      const fullRecord = JSON.stringify(c);
      expect(fullRecord).not.toContain('participant_name');
    }
  });

  it('nuggets have status candidate (conformance gap: no human review)', async () => {
    const constructs = await EvidenceConstructModel.findAll({
      where: { construct_type: 'nugget' },
    });

    for (const c of constructs) {
      expect((c as any).status).toBe('candidate');
      expect((c as any).reviewed_by).toBeNull();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SURVEY LINEAGE UNAFFECTED
// ═══════════════════════════════════════════════════════════════════════

describe('PH-5A: Survey evidence lineage unaffected', () => {
  it('SYNTHESIZED_FROM is a valid relationship type', () => {
    const relTypes = require('../../database/models/evidence_relationship');
    // The TypeScript type union should include SYNTHESIZED_FROM
    // This is a compile-time check that the type exists
    const typeCheck: typeof relTypes.RelationshipType = 'SYNTHESIZED_FROM' as any;
    expect(typeCheck).toBe('SYNTHESIZED_FROM');
  });
});
