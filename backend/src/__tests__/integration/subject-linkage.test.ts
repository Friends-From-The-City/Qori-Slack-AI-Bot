/**
 * Subject Linkage Schema Tests (GOV-2A1)
 *
 * Proves that the data_subjects and data_subject_links schema enforces:
 * - Structurally exclusive link shapes (participant vs survey_respondent)
 * - One participant linked to at most one subject
 * - One (source, respondent_key) linked to at most one subject
 * - CASCADE behavior on parent deletion
 * - Status CHECK constraint
 * - Link type CHECK constraint
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';
import type { Project } from '../../database/models/project';
import type { ResearchStudy } from '../../database/models/research_study';
import type { StudyParticipant } from '../../database/models/study_participant';
import type { EvidenceSource } from '../../database/models/evidence_source';
import type { DataSubject } from '../../database/models/data_subject';
import type { DataSubjectLink } from '../../database/models/data_subject_link';

const sequelize = getTestDb();
const ProjectModel = sequelize.models.Project as typeof Project;
const StudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;
const ParticipantModel = sequelize.models.StudyParticipant as typeof StudyParticipant;
const EvidenceSourceModel = sequelize.models.EvidenceSource as typeof EvidenceSource;
const DataSubjectModel = sequelize.models.DataSubject as typeof DataSubject;
const DataSubjectLinkModel = sequelize.models.DataSubjectLink as typeof DataSubjectLink;

// ─── Test fixtures ──────────────────────────────────────────────

async function createProject(slug: string) {
  return ProjectModel.create({
    name: `Project ${slug}`,
    slug,
    created_by: 'U_OWNER',
    status: 'active',
    organization_id: TEST_ORG_ID,
  });
}

async function createStudy(projectId: number, name: string) {
  return StudyModel.create({
    project_id: projectId,
    name,
    channel_name: `chan-${name}`,
    created_by: 'U_OWNER',
    researcher_name: 'Test',
    researcher_email: 'test@example.com',
  });
}

async function createParticipant(studyId: number, code: string) {
  return ParticipantModel.create({
    study_id: studyId,
    participant_code: code,
    added_by: 'U_OWNER',
  });
}

async function createEvidenceSource(projectId: number, studyId: number | null = null) {
  return EvidenceSourceModel.create({
    project_id: projectId,
    study_id: studyId,
    source_type: 'survey_dataset',
    label: 'Test Survey',
    created_by: 'U_OWNER',
  });
}

async function createSubject(projectId: number) {
  return DataSubjectModel.create({
    project_id: projectId,
    created_by: 'U_OWNER',
  });
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Subject Linkage Schema (GOV-2A1)', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // ═══════════════════════════════════════════════════════════════
  // data_subjects basic operations
  // ═══════════════════════════════════════════════════════════════

  describe('data_subjects', () => {
    it('creates subject with auto-generated UUID and default active status', async () => {
      const project = await createProject('subj-basic');
      const subject = await createSubject(project.id);

      expect(subject.id).toBeDefined();
      expect(subject.public_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(subject.status).toBe('active');
      expect(subject.deleted_at).toBeNull();
      expect(subject.project_id).toBe(project.id);
    });

    it('rejects invalid status value', async () => {
      const project = await createProject('subj-status');
      await expect(
        DataSubjectModel.create({
          project_id: project.id,
          created_by: 'U_OWNER',
          status: 'unknown' as any,
        }),
      ).rejects.toThrow();
    });

    it('can be tombstoned (status=deleted)', async () => {
      const project = await createProject('subj-tombstone');
      const subject = await createSubject(project.id);

      await DataSubjectModel.update(
        { status: 'deleted', deleted_at: new Date() },
        { where: { id: subject.id } },
      );

      const reloaded = await DataSubjectModel.findByPk(subject.id);
      expect(reloaded!.status).toBe('deleted');
      expect(reloaded!.deleted_at).not.toBeNull();
    });

    it('cascades on project delete', async () => {
      const project = await createProject('subj-cascade');
      const subject = await createSubject(project.id);

      await project.destroy();

      const reloaded = await DataSubjectModel.findByPk(subject.id);
      expect(reloaded).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Participant link shape
  // ═══════════════════════════════════════════════════════════════

  describe('participant link shape', () => {
    it('creates valid participant link', async () => {
      const project = await createProject('part-link');
      const study = await createStudy(project.id, 'study-part');
      const participant = await createParticipant(study.id, 'PT-001');
      const subject = await createSubject(project.id);

      const link = await DataSubjectLinkModel.create({
        data_subject_id: subject.id,
        link_type: 'participant',
        study_id: study.id,
        participant_id: participant.id,
        linked_by: 'U_OWNER',
      });

      expect(link.id).toBeDefined();
      expect(link.link_type).toBe('participant');
      expect(link.participant_id).toBe(participant.id);
      expect(link.study_id).toBe(study.id);
      expect(link.evidence_source_id).toBeNull();
      expect(link.respondent_key).toBeNull();
      expect(link.confidence).toBe('confirmed');
    });

    it('REJECTS participant link without participant_id (CHECK constraint)', async () => {
      const project = await createProject('part-no-pid');
      const study = await createStudy(project.id, 'study-no-pid');
      const subject = await createSubject(project.id);

      await expect(
        DataSubjectLinkModel.create({
          data_subject_id: subject.id,
          link_type: 'participant',
          study_id: study.id,
          participant_id: null as any,
          linked_by: 'U_OWNER',
        }),
      ).rejects.toThrow();
    });

    it('REJECTS participant link without study_id (CHECK constraint)', async () => {
      const project = await createProject('part-no-sid');
      const study = await createStudy(project.id, 'study-no-sid');
      const participant = await createParticipant(study.id, 'PT-002');
      const subject = await createSubject(project.id);

      await expect(
        DataSubjectLinkModel.create({
          data_subject_id: subject.id,
          link_type: 'participant',
          study_id: null as any,
          participant_id: participant.id,
          linked_by: 'U_OWNER',
        }),
      ).rejects.toThrow();
    });

    it('REJECTS participant link with evidence_source_id set (mixed shape)', async () => {
      const project = await createProject('part-mixed');
      const study = await createStudy(project.id, 'study-mixed');
      const participant = await createParticipant(study.id, 'PT-003');
      const source = await createEvidenceSource(project.id, study.id);
      const subject = await createSubject(project.id);

      await expect(
        DataSubjectLinkModel.create({
          data_subject_id: subject.id,
          link_type: 'participant',
          study_id: study.id,
          participant_id: participant.id,
          evidence_source_id: source.id,
          linked_by: 'U_OWNER',
        }),
      ).rejects.toThrow();
    });

    it('REJECTS participant link with respondent_key set (mixed shape)', async () => {
      const project = await createProject('part-rk');
      const study = await createStudy(project.id, 'study-rk');
      const participant = await createParticipant(study.id, 'PT-004');
      const subject = await createSubject(project.id);

      await expect(
        DataSubjectLinkModel.create({
          data_subject_id: subject.id,
          link_type: 'participant',
          study_id: study.id,
          participant_id: participant.id,
          respondent_key: 'should-not-be-here',
          linked_by: 'U_OWNER',
        }),
      ).rejects.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Survey respondent link shape
  // ═══════════════════════════════════════════════════════════════

  describe('survey_respondent link shape', () => {
    it('creates valid survey respondent link', async () => {
      const project = await createProject('surv-link');
      const source = await createEvidenceSource(project.id);
      const subject = await createSubject(project.id);

      const link = await DataSubjectLinkModel.create({
        data_subject_id: subject.id,
        link_type: 'survey_respondent',
        evidence_source_id: source.id,
        respondent_key: 'R-abc123',
        linked_by: 'U_OWNER',
      });

      expect(link.link_type).toBe('survey_respondent');
      expect(link.evidence_source_id).toBe(source.id);
      expect(link.respondent_key).toBe('R-abc123');
      expect(link.participant_id).toBeNull();
    });

    it('REJECTS survey_respondent link without evidence_source_id', async () => {
      const project = await createProject('surv-no-src');
      const subject = await createSubject(project.id);

      await expect(
        DataSubjectLinkModel.create({
          data_subject_id: subject.id,
          link_type: 'survey_respondent',
          respondent_key: 'R-nosrc',
          linked_by: 'U_OWNER',
        }),
      ).rejects.toThrow();
    });

    it('REJECTS survey_respondent link without respondent_key', async () => {
      const project = await createProject('surv-no-rk');
      const source = await createEvidenceSource(project.id);
      const subject = await createSubject(project.id);

      await expect(
        DataSubjectLinkModel.create({
          data_subject_id: subject.id,
          link_type: 'survey_respondent',
          evidence_source_id: source.id,
          respondent_key: null as any,
          linked_by: 'U_OWNER',
        }),
      ).rejects.toThrow();
    });

    it('REJECTS survey_respondent link with participant_id set (mixed shape)', async () => {
      const project = await createProject('surv-mixed');
      const study = await createStudy(project.id, 'study-surv-mixed');
      const participant = await createParticipant(study.id, 'PT-005');
      const source = await createEvidenceSource(project.id, study.id);
      const subject = await createSubject(project.id);

      await expect(
        DataSubjectLinkModel.create({
          data_subject_id: subject.id,
          link_type: 'survey_respondent',
          evidence_source_id: source.id,
          respondent_key: 'R-mixed',
          participant_id: participant.id,
          linked_by: 'U_OWNER',
        }),
      ).rejects.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Link type validation
  // ═══════════════════════════════════════════════════════════════

  describe('link_type validation', () => {
    it('REJECTS unknown link_type', async () => {
      const project = await createProject('lt-unknown');
      const subject = await createSubject(project.id);

      await expect(
        DataSubjectLinkModel.create({
          data_subject_id: subject.id,
          link_type: 'external_subject' as any,
          linked_by: 'U_OWNER',
        }),
      ).rejects.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Uniqueness constraints
  // ═══════════════════════════════════════════════════════════════

  describe('uniqueness constraints', () => {
    it('one participant linked to at most one subject', async () => {
      const project = await createProject('uq-part');
      const study = await createStudy(project.id, 'study-uq-part');
      const participant = await createParticipant(study.id, 'PT-UQ');
      const subject1 = await createSubject(project.id);
      const subject2 = await createSubject(project.id);

      await DataSubjectLinkModel.create({
        data_subject_id: subject1.id,
        link_type: 'participant',
        study_id: study.id,
        participant_id: participant.id,
        linked_by: 'U_OWNER',
      });

      // Second subject linking same participant → unique violation
      await expect(
        DataSubjectLinkModel.create({
          data_subject_id: subject2.id,
          link_type: 'participant',
          study_id: study.id,
          participant_id: participant.id,
          linked_by: 'U_OWNER',
        }),
      ).rejects.toThrow();
    });

    it('one (source, respondent_key) linked to at most one subject', async () => {
      const project = await createProject('uq-resp');
      const source = await createEvidenceSource(project.id);
      const subject1 = await createSubject(project.id);
      const subject2 = await createSubject(project.id);

      await DataSubjectLinkModel.create({
        data_subject_id: subject1.id,
        link_type: 'survey_respondent',
        evidence_source_id: source.id,
        respondent_key: 'R-unique',
        linked_by: 'U_OWNER',
      });

      // Second subject linking same respondent in same source → unique violation
      await expect(
        DataSubjectLinkModel.create({
          data_subject_id: subject2.id,
          link_type: 'survey_respondent',
          evidence_source_id: source.id,
          respondent_key: 'R-unique',
          linked_by: 'U_OWNER',
        }),
      ).rejects.toThrow();
    });

    it('same respondent_key in different sources is allowed', async () => {
      const project = await createProject('uq-diff-src');
      const source1 = await createEvidenceSource(project.id);
      const source2 = await createEvidenceSource(project.id);
      const subject = await createSubject(project.id);

      await DataSubjectLinkModel.create({
        data_subject_id: subject.id,
        link_type: 'survey_respondent',
        evidence_source_id: source1.id,
        respondent_key: 'R-same-key',
        linked_by: 'U_OWNER',
      });

      // Same key, different source → allowed
      await expect(
        DataSubjectLinkModel.create({
          data_subject_id: subject.id,
          link_type: 'survey_respondent',
          evidence_source_id: source2.id,
          respondent_key: 'R-same-key',
          linked_by: 'U_OWNER',
        }),
      ).resolves.toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CASCADE behavior
  // ═══════════════════════════════════════════════════════════════

  describe('CASCADE behavior', () => {
    it('participant deletion cascades to participant link', async () => {
      const project = await createProject('cas-part');
      const study = await createStudy(project.id, 'study-cas-part');
      const participant = await createParticipant(study.id, 'PT-CAS');
      const subject = await createSubject(project.id);

      const link = await DataSubjectLinkModel.create({
        data_subject_id: subject.id,
        link_type: 'participant',
        study_id: study.id,
        participant_id: participant.id,
        linked_by: 'U_OWNER',
      });

      await participant.destroy();

      // Link should be gone (CASCADE)
      const reloaded = await DataSubjectLinkModel.findByPk(link.id);
      expect(reloaded).toBeNull();

      // Subject should survive (tombstone anchor)
      const subjectReloaded = await DataSubjectModel.findByPk(subject.id);
      expect(subjectReloaded).not.toBeNull();
    });

    it('evidence source deletion cascades to survey respondent link', async () => {
      const project = await createProject('cas-src');
      const source = await createEvidenceSource(project.id);
      const subject = await createSubject(project.id);

      const link = await DataSubjectLinkModel.create({
        data_subject_id: subject.id,
        link_type: 'survey_respondent',
        evidence_source_id: source.id,
        respondent_key: 'R-cas',
        linked_by: 'U_OWNER',
      });

      await source.destroy();

      const reloaded = await DataSubjectLinkModel.findByPk(link.id);
      expect(reloaded).toBeNull();

      // Subject survives
      const subjectReloaded = await DataSubjectModel.findByPk(subject.id);
      expect(subjectReloaded).not.toBeNull();
    });

    it('subject deletion cascades to all links', async () => {
      const project = await createProject('cas-subj');
      const study = await createStudy(project.id, 'study-cas-subj');
      const participant = await createParticipant(study.id, 'PT-CS');
      const source = await createEvidenceSource(project.id);
      const subject = await createSubject(project.id);

      const link1 = await DataSubjectLinkModel.create({
        data_subject_id: subject.id,
        link_type: 'participant',
        study_id: study.id,
        participant_id: participant.id,
        linked_by: 'U_OWNER',
      });

      const link2 = await DataSubjectLinkModel.create({
        data_subject_id: subject.id,
        link_type: 'survey_respondent',
        evidence_source_id: source.id,
        respondent_key: 'R-cs',
        linked_by: 'U_OWNER',
      });

      await subject.destroy();

      expect(await DataSubjectLinkModel.findByPk(link1.id)).toBeNull();
      expect(await DataSubjectLinkModel.findByPk(link2.id)).toBeNull();
    });

    it('project deletion cascades through subject to links', async () => {
      const project = await createProject('cas-proj');
      const study = await createStudy(project.id, 'study-cas-proj');
      const participant = await createParticipant(study.id, 'PT-CP');
      const subject = await createSubject(project.id);

      await DataSubjectLinkModel.create({
        data_subject_id: subject.id,
        link_type: 'participant',
        study_id: study.id,
        participant_id: participant.id,
        linked_by: 'U_OWNER',
      });

      await project.destroy();

      expect(await DataSubjectModel.findByPk(subject.id)).toBeNull();
      expect(await DataSubjectLinkModel.count()).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Multi-link subject (participant + survey respondent)
  // ═══════════════════════════════════════════════════════════════

  describe('multi-link subject', () => {
    it('same subject can have participant link AND survey respondent link', async () => {
      const project = await createProject('multi');
      const study = await createStudy(project.id, 'study-multi');
      const participant = await createParticipant(study.id, 'PT-MULTI');
      const source = await createEvidenceSource(project.id, study.id);
      const subject = await createSubject(project.id);

      const partLink = await DataSubjectLinkModel.create({
        data_subject_id: subject.id,
        link_type: 'participant',
        study_id: study.id,
        participant_id: participant.id,
        linked_by: 'U_OWNER',
      });

      const surveyLink = await DataSubjectLinkModel.create({
        data_subject_id: subject.id,
        link_type: 'survey_respondent',
        evidence_source_id: source.id,
        respondent_key: 'R-multi',
        linked_by: 'U_OWNER',
      });

      expect(partLink.id).toBeDefined();
      expect(surveyLink.id).toBeDefined();

      // Both links belong to same subject
      const links = await DataSubjectLinkModel.findAll({
        where: { data_subject_id: subject.id },
      });
      expect(links).toHaveLength(2);
      expect(links.map(l => l.link_type).sort()).toEqual(['participant', 'survey_respondent']);
    });
  });
});
