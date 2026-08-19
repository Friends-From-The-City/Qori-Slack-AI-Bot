/**
 * Subject Linking Service Integration Tests (GOV-2A2)
 *
 * Proves:
 * - Atomic participant + subject creation
 * - Subject creation failure rolls back participant
 * - Cross-project scope rejection
 * - Survey respondent linking
 * - External survey subject creation
 * - Backfill idempotency
 * - Deleted subject cannot receive links
 * - No external PII persisted
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';
import {
  createSubjectForParticipant,
  linkSubjectToParticipant,
  linkSubjectToSurveyRespondent,
  createExternalSurveySubject,
  backfillExistingParticipants,
  getSubjectForParticipant,
  SubjectLinkingError,
} from '../../services/subject-linking.service';
import type { Project } from '../../database/models/project';
import type { ResearchStudy } from '../../database/models/research_study';
import type { StudyParticipant } from '../../database/models/study_participant';
import type { EvidenceSource } from '../../database/models/evidence_source';
import type { SurveyQualitativeEntry } from '../../database/models/survey_qualitative_entry';
import type { DataSubject } from '../../database/models/data_subject';
import type { DataSubjectLink } from '../../database/models/data_subject_link';

const sequelize = getTestDb();
const ProjectModel = sequelize.models.Project as typeof Project;
const StudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;
const ParticipantModel = sequelize.models.StudyParticipant as typeof StudyParticipant;
const SourceModel = sequelize.models.EvidenceSource as typeof EvidenceSource;
const EntryModel = sequelize.models.SurveyQualitativeEntry as typeof SurveyQualitativeEntry;
const DataSubjectModel = sequelize.models.DataSubject as typeof DataSubject;
const DataSubjectLinkModel = sequelize.models.DataSubjectLink as typeof DataSubjectLink;

// ─── Fixtures ───────────────────────────────────────────────────

async function makeProject(slug: string) {
  return ProjectModel.create({ name: `P-${slug}`, slug, created_by: 'U_OWNER', status: 'active', organization_id: TEST_ORG_ID });
}

async function makeStudy(projectId: number, name: string) {
  return StudyModel.create({
    project_id: projectId, name, channel_name: `ch-${name}`,
    created_by: 'U_OWNER', researcher_name: 'R', researcher_email: 'r@e.com',
  });
}

async function makeParticipant(studyId: number, code: string) {
  return ParticipantModel.create({ study_id: studyId, participant_code: code, added_by: 'U_OWNER' });
}

async function makeSource(projectId: number, studyId: number | null = null) {
  return SourceModel.create({
    project_id: projectId, study_id: studyId,
    source_type: 'survey_dataset', label: 'Survey', created_by: 'U_OWNER',
  });
}

async function makeEntry(sourceId: number, projectId: number, respondentKey: string) {
  return EntryModel.create({
    evidence_source_id: sourceId, project_id: projectId,
    respondent_key: respondentKey, display_respondent_id: respondentKey,
    field_name: 'q1', field_display_name: 'Q1',
    entry_text: 'test response', entry_hash: `hash-${respondentKey}-q1`,
    metadata: {},
  });
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Subject Linking Service (GOV-2A2)', () => {
  beforeEach(async () => { await truncateAll(); });
  afterAll(async () => { await sequelize.close(); });

  // ═══════════════════════════════════════════════════════════════
  // createSubjectForParticipant
  // ═══════════════════════════════════════════════════════════════

  describe('createSubjectForParticipant', () => {
    it('creates subject + participant link atomically', async () => {
      const project = await makeProject('csfp-basic');
      const study = await makeStudy(project.id, 'study-csfp');
      const participant = await makeParticipant(study.id, 'PT-001');

      await sequelize.transaction(async (t) => {
        const subject = await createSubjectForParticipant(participant.id, 'U_OWNER', t, sequelize);
        expect(subject.project_id).toBe(project.id);
        expect(subject.status).toBe('active');
      });

      // Verify link was created
      const subject = await getSubjectForParticipant(participant.id, sequelize);
      expect(subject).not.toBeNull();
      expect(subject!.project_id).toBe(project.id);

      const links = await DataSubjectLinkModel.findAll({
        where: { data_subject_id: subject!.id },
      });
      expect(links).toHaveLength(1);
      expect(links[0].link_type).toBe('participant');
      expect(links[0].participant_id).toBe(participant.id);
      expect(links[0].study_id).toBe(study.id);
    });

    it('is idempotent — second call returns existing subject', async () => {
      const project = await makeProject('csfp-idem');
      const study = await makeStudy(project.id, 'study-idem');
      const participant = await makeParticipant(study.id, 'PT-002');

      let subjectId: number;
      await sequelize.transaction(async (t) => {
        const s = await createSubjectForParticipant(participant.id, 'U_OWNER', t, sequelize);
        subjectId = s.id;
      });

      await sequelize.transaction(async (t) => {
        const s2 = await createSubjectForParticipant(participant.id, 'U_OWNER', t, sequelize);
        expect(s2.id).toBe(subjectId!);
      });

      // Still only one link
      const linkCount = await DataSubjectLinkModel.count({
        where: { participant_id: participant.id },
      });
      expect(linkCount).toBe(1);
    });

    it('throws on nonexistent participant', async () => {
      await expect(
        sequelize.transaction(async (t) => {
          await createSubjectForParticipant(999999, 'U_OWNER', t, sequelize);
        }),
      ).rejects.toThrow(SubjectLinkingError);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Cross-project rejection
  // ═══════════════════════════════════════════════════════════════

  describe('cross-project scope rejection', () => {
    it('rejects linking Project A subject to Project B participant', async () => {
      const projectA = await makeProject('xp-a');
      const projectB = await makeProject('xp-b');
      const studyB = await makeStudy(projectB.id, 'study-b');
      const participantB = await makeParticipant(studyB.id, 'PT-XP');

      const subjectA = await DataSubjectModel.create({
        project_id: projectA.id, created_by: 'U_OWNER',
      });

      await expect(
        linkSubjectToParticipant(subjectA.id, participantB.id, 'U_OWNER', undefined, sequelize),
      ).rejects.toThrow(/project scope mismatch/i);
    });

    it('rejects linking Project A subject to Project B survey source', async () => {
      const projectA = await makeProject('xps-a');
      const projectB = await makeProject('xps-b');
      const sourceB = await makeSource(projectB.id);
      await makeEntry(sourceB.id, projectB.id, 'R-xps');

      const subjectA = await DataSubjectModel.create({
        project_id: projectA.id, created_by: 'U_OWNER',
      });

      await expect(
        linkSubjectToSurveyRespondent(subjectA.id, sourceB.id, 'R-xps', 'U_OWNER', undefined, sequelize),
      ).rejects.toThrow(/project scope mismatch/i);
    });

    it('rejects external survey subject with mismatched project', async () => {
      const projectA = await makeProject('xpe-a');
      const projectB = await makeProject('xpe-b');
      const sourceB = await makeSource(projectB.id);
      await makeEntry(sourceB.id, projectB.id, 'R-xpe');

      await expect(
        createExternalSurveySubject(projectA.id, sourceB.id, 'R-xpe', 'U_OWNER', undefined, sequelize),
      ).rejects.toThrow(/project scope mismatch/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Survey respondent linking
  // ═══════════════════════════════════════════════════════════════

  describe('linkSubjectToSurveyRespondent', () => {
    it('creates valid survey respondent link', async () => {
      const project = await makeProject('surv-link');
      const study = await makeStudy(project.id, 'study-surv');
      const participant = await makeParticipant(study.id, 'PT-SL');
      const source = await makeSource(project.id, study.id);
      await makeEntry(source.id, project.id, 'R-sl');

      // Create subject via participant
      let subjectId: number;
      await sequelize.transaction(async (t) => {
        const s = await createSubjectForParticipant(participant.id, 'U_OWNER', t, sequelize);
        subjectId = s.id;
      });

      const link = await linkSubjectToSurveyRespondent(subjectId!, source.id, 'R-sl', 'U_OWNER', undefined, sequelize);
      expect(link.link_type).toBe('survey_respondent');
      expect(link.evidence_source_id).toBe(source.id);
      expect(link.respondent_key).toBe('R-sl');
    });

    it('rejects nonexistent respondent_key', async () => {
      const project = await makeProject('surv-nork');
      const source = await makeSource(project.id);
      const subject = await DataSubjectModel.create({
        project_id: project.id, created_by: 'U_OWNER',
      });

      await expect(
        linkSubjectToSurveyRespondent(subject.id, source.id, 'NONEXISTENT', 'U_OWNER', undefined, sequelize),
      ).rejects.toThrow(/not found in evidence source/i);
    });

    it('rejects respondent already linked to another subject', async () => {
      const project = await makeProject('surv-dup');
      const source = await makeSource(project.id);
      await makeEntry(source.id, project.id, 'R-dup');
      const subject1 = await DataSubjectModel.create({ project_id: project.id, created_by: 'U_OWNER' });
      const subject2 = await DataSubjectModel.create({ project_id: project.id, created_by: 'U_OWNER' });

      await linkSubjectToSurveyRespondent(subject1.id, source.id, 'R-dup', 'U_OWNER', undefined, sequelize);

      // Second subject → same respondent → unique violation
      await expect(
        linkSubjectToSurveyRespondent(subject2.id, source.id, 'R-dup', 'U_OWNER', undefined, sequelize),
      ).rejects.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Deleted subject rejection
  // ═══════════════════════════════════════════════════════════════

  describe('deleted subject rejection', () => {
    it('cannot link participant to deleted subject', async () => {
      const project = await makeProject('del-part');
      const study = await makeStudy(project.id, 'study-del');
      const participant = await makeParticipant(study.id, 'PT-DEL');

      const subject = await DataSubjectModel.create({
        project_id: project.id, created_by: 'U_OWNER',
        status: 'deleted', deleted_at: new Date(),
      });

      await expect(
        linkSubjectToParticipant(subject.id, participant.id, 'U_OWNER', undefined, sequelize),
      ).rejects.toThrow(/deleted subject/i);
    });

    it('cannot link survey respondent to deleted subject', async () => {
      const project = await makeProject('del-surv');
      const source = await makeSource(project.id);
      await makeEntry(source.id, project.id, 'R-del');

      const subject = await DataSubjectModel.create({
        project_id: project.id, created_by: 'U_OWNER',
        status: 'deleted', deleted_at: new Date(),
      });

      await expect(
        linkSubjectToSurveyRespondent(subject.id, source.id, 'R-del', 'U_OWNER', undefined, sequelize),
      ).rejects.toThrow(/deleted subject/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // External survey subject
  // ═══════════════════════════════════════════════════════════════

  describe('createExternalSurveySubject', () => {
    it('creates subject + survey link atomically', async () => {
      const project = await makeProject('ext-basic');
      const source = await makeSource(project.id);
      await makeEntry(source.id, project.id, 'R-ext');

      const { subject, link } = await createExternalSurveySubject(
        project.id, source.id, 'R-ext', 'U_ADMIN', undefined, sequelize,
      );

      expect(subject.project_id).toBe(project.id);
      expect(subject.status).toBe('active');
      expect(link.link_type).toBe('survey_respondent');
      expect(link.respondent_key).toBe('R-ext');
    });

    it('does not persist external PII fields', async () => {
      const project = await makeProject('ext-nopii');
      const source = await makeSource(project.id);
      await makeEntry(source.id, project.id, 'R-nopii');

      const { subject } = await createExternalSurveySubject(
        project.id, source.id, 'R-nopii', 'U_ADMIN', undefined, sequelize,
      );

      // Subject record should have NO PII fields
      const raw = await DataSubjectModel.findByPk(subject.id);
      const attrs = raw!.toJSON() as Record<string, unknown>;
      // Only allowed fields
      const allowedKeys = ['id', 'public_id', 'project_id', 'status', 'created_by', 'created_at', 'deleted_at'];
      for (const key of Object.keys(attrs)) {
        expect(allowedKeys).toContain(key);
      }
      // No name, email, CRM ID etc
      expect(attrs).not.toHaveProperty('name');
      expect(attrs).not.toHaveProperty('email');
      expect(attrs).not.toHaveProperty('canonical_name');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Backfill
  // ═══════════════════════════════════════════════════════════════

  describe('backfillExistingParticipants', () => {
    it('creates exactly one subject/link per unlinked participant', async () => {
      const project = await makeProject('bf-basic');
      const study = await makeStudy(project.id, 'study-bf');
      await makeParticipant(study.id, 'PT-BF1');
      await makeParticipant(study.id, 'PT-BF2');
      await makeParticipant(study.id, 'PT-BF3');

      const result = await backfillExistingParticipants(sequelize);

      expect(result.created).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      const subjectCount = await DataSubjectModel.count();
      const linkCount = await DataSubjectLinkModel.count();
      expect(subjectCount).toBe(3);
      expect(linkCount).toBe(3);
    });

    it('rerun creates no duplicates (idempotent)', async () => {
      const project = await makeProject('bf-idem');
      const study = await makeStudy(project.id, 'study-bfi');
      await makeParticipant(study.id, 'PT-BI1');
      await makeParticipant(study.id, 'PT-BI2');

      const result1 = await backfillExistingParticipants(sequelize);
      expect(result1.created).toBe(2);

      const result2 = await backfillExistingParticipants(sequelize);
      expect(result2.created).toBe(0);
      expect(result2.skipped).toBe(2);

      // Still only 2 subjects
      expect(await DataSubjectModel.count()).toBe(2);
    });

    it('pre-linked participants are skipped safely', async () => {
      const project = await makeProject('bf-prelink');
      const study = await makeStudy(project.id, 'study-bfp');
      const p1 = await makeParticipant(study.id, 'PT-PL1');
      await makeParticipant(study.id, 'PT-PL2');

      // Pre-link p1
      await sequelize.transaction(async (t) => {
        await createSubjectForParticipant(p1.id, 'U_OWNER', t, sequelize);
      });

      const result = await backfillExistingParticipants(sequelize);
      expect(result.created).toBe(1);  // only PT-PL2
      expect(result.skipped).toBe(1);  // PT-PL1 already linked
      expect(await DataSubjectModel.count()).toBe(2);
    });
  });
});
