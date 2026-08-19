/**
 * Evidence Subject Attribution Integration Tests (GOV-2B)
 *
 * Proves:
 * - Valid attribution creation + idempotency
 * - Cross-project rejection
 * - Evidence source scope mismatch rejection
 * - Deleted subject rejection
 * - Correct attribution types for different evidence shapes
 * - Unlinked survey respondents do NOT get guessed attribution
 * - Themes/findings/recommendations are not automatically attributed
 * - Legacy backfill resolves unique PT codes, skips ambiguous
 * - stale_due_to_disposition defaults false
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';
import {
  attributeConstructToSubject,
  backfillNuggetAttributions,
  getAttributionsForSubject,
  AttributionError,
} from '../../services/evidence-attribution.service';
import { createSubjectForParticipant } from '../../services/subject-linking.service';
import type { Project } from '../../database/models/project';
import type { ResearchStudy } from '../../database/models/research_study';
import type { StudyParticipant } from '../../database/models/study_participant';
import type { EvidenceSource } from '../../database/models/evidence_source';
import type { EvidenceConstruct } from '../../database/models/evidence_construct';
import type { DataSubject } from '../../database/models/data_subject';
import type { DataSubjectLink } from '../../database/models/data_subject_link';
import type { EvidenceSubjectAttribution } from '../../database/models/evidence_subject_attribution';

const sequelize = getTestDb();
const ProjectModel = sequelize.models.Project as typeof Project;
const StudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;
const ParticipantModel = sequelize.models.StudyParticipant as typeof StudyParticipant;
const SourceModel = sequelize.models.EvidenceSource as typeof EvidenceSource;
const ConstructModel = sequelize.models.EvidenceConstruct as typeof EvidenceConstruct;
const SubjectModel = sequelize.models.DataSubject as typeof DataSubject;
const SubjectLinkModel = sequelize.models.DataSubjectLink as typeof DataSubjectLink;
const AttributionModel = sequelize.models.EvidenceSubjectAttribution as typeof EvidenceSubjectAttribution;

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
    source_type: 'session_transcript', label: 'Session', created_by: 'U_OWNER',
  });
}

async function makeConstruct(
  projectId: number,
  studyId: number | null,
  type: string,
  payload: Record<string, unknown> = {},
) {
  return ConstructModel.create({
    project_id: projectId,
    study_id: studyId,
    construct_type: type as any,
    label: `test-${type}`,
    payload,
    derivation_type: 'model',
    status: 'candidate',
    created_by: 'U_OWNER',
  });
}

async function makeSubjectForParticipant(participant: StudyParticipant) {
  return sequelize.transaction(async (t) => {
    return createSubjectForParticipant(participant.id, 'U_OWNER', t, sequelize);
  });
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Evidence Subject Attribution (GOV-2B)', () => {
  beforeEach(async () => { await truncateAll(); });
  afterAll(async () => { await sequelize.close(); });

  // ═══════════════════════════════════════════════════════════════
  // Core attribution
  // ═══════════════════════════════════════════════════════════════

  describe('attributeConstructToSubject', () => {
    it('creates valid attribution for direct_quote nugget', async () => {
      const project = await makeProject('attr-basic');
      const study = await makeStudy(project.id, 'study-attr');
      const participant = await makeParticipant(study.id, 'PT-001');
      const subject = await makeSubjectForParticipant(participant);
      const construct = await makeConstruct(project.id, study.id, 'nugget', {
        verbatim_quote: 'I found the form confusing',
        participant: 'PT-001',
      });

      const attr = await attributeConstructToSubject({
        constructId: construct.id,
        dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      expect(attr.construct_id).toBe(construct.id);
      expect(attr.data_subject_id).toBe(subject.id);
      expect(attr.attribution_type).toBe('direct_quote');
    });

    it('creates observation attribution', async () => {
      const project = await makeProject('attr-obs');
      const study = await makeStudy(project.id, 'study-obs');
      const participant = await makeParticipant(study.id, 'PT-002');
      const subject = await makeSubjectForParticipant(participant);
      const construct = await makeConstruct(project.id, study.id, 'nugget', {
        observation: 'Participant hesitated before clicking submit',
        participant: 'PT-002',
      });

      const attr = await attributeConstructToSubject({
        constructId: construct.id,
        dataSubjectId: subject.id,
        attributionType: 'observation',
      }, undefined, sequelize);

      expect(attr.attribution_type).toBe('observation');
    });

    it('is idempotent — duplicate returns existing', async () => {
      const project = await makeProject('attr-idem');
      const study = await makeStudy(project.id, 'study-idem');
      const participant = await makeParticipant(study.id, 'PT-003');
      const subject = await makeSubjectForParticipant(participant);
      const construct = await makeConstruct(project.id, study.id, 'nugget');

      const attr1 = await attributeConstructToSubject({
        constructId: construct.id,
        dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      const attr2 = await attributeConstructToSubject({
        constructId: construct.id,
        dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      expect(attr2.id).toBe(attr1.id);
      expect(await AttributionModel.count()).toBe(1);
    });

    it('allows different attribution types for same construct+subject', async () => {
      const project = await makeProject('attr-multi');
      const study = await makeStudy(project.id, 'study-multi');
      const participant = await makeParticipant(study.id, 'PT-004');
      const subject = await makeSubjectForParticipant(participant);
      const construct = await makeConstruct(project.id, study.id, 'nugget');

      await attributeConstructToSubject({
        constructId: construct.id, dataSubjectId: subject.id, attributionType: 'direct_quote',
      }, undefined, sequelize);
      await attributeConstructToSubject({
        constructId: construct.id, dataSubjectId: subject.id, attributionType: 'observation',
      }, undefined, sequelize);

      expect(await AttributionModel.count()).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Scope rejection
  // ═══════════════════════════════════════════════════════════════

  describe('cross-project scope rejection', () => {
    it('rejects Project A subject + Project B construct', async () => {
      const projectA = await makeProject('xp-attr-a');
      const projectB = await makeProject('xp-attr-b');
      const studyB = await makeStudy(projectB.id, 'study-xpb');
      const participantA = await makeParticipant((await makeStudy(projectA.id, 'study-xpa')).id, 'PT-XP');
      const subjectA = await makeSubjectForParticipant(participantA);
      const constructB = await makeConstruct(projectB.id, studyB.id, 'nugget');

      await expect(
        attributeConstructToSubject({
          constructId: constructB.id,
          dataSubjectId: subjectA.id,
          attributionType: 'direct_quote',
        }, undefined, sequelize),
      ).rejects.toThrow(/project scope mismatch/i);
    });

    it('rejects mismatched evidence source project', async () => {
      const projectA = await makeProject('xps-attr-a');
      const projectB = await makeProject('xps-attr-b');
      const studyA = await makeStudy(projectA.id, 'study-xpsa');
      const participantA = await makeParticipant(studyA.id, 'PT-XPS');
      const subjectA = await makeSubjectForParticipant(participantA);
      const constructA = await makeConstruct(projectA.id, studyA.id, 'nugget');
      const sourceB = await makeSource(projectB.id);

      await expect(
        attributeConstructToSubject({
          constructId: constructA.id,
          dataSubjectId: subjectA.id,
          attributionType: 'direct_quote',
          evidenceSourceId: sourceB.id,
        }, undefined, sequelize),
      ).rejects.toThrow(/source project mismatch/i);
    });
  });

  describe('deleted subject rejection', () => {
    it('rejects attribution to deleted subject', async () => {
      const project = await makeProject('del-attr');
      const study = await makeStudy(project.id, 'study-del');
      const construct = await makeConstruct(project.id, study.id, 'nugget');
      const subject = await SubjectModel.create({
        project_id: project.id, created_by: 'U_OWNER',
        status: 'deleted', deleted_at: new Date(),
      });

      await expect(
        attributeConstructToSubject({
          constructId: construct.id,
          dataSubjectId: subject.id,
          attributionType: 'direct_quote',
        }, undefined, sequelize),
      ).rejects.toThrow(/deleted subject/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Non-attribution of aggregate constructs
  // ═══════════════════════════════════════════════════════════════

  describe('aggregate constructs are not automatically attributed', () => {
    it('themes/findings/recommendations have no automatic attribution', async () => {
      const project = await makeProject('agg-noattr');
      const study = await makeStudy(project.id, 'study-agg');
      const participant = await makeParticipant(study.id, 'PT-AGG');
      await makeSubjectForParticipant(participant);

      // Create aggregate constructs
      await makeConstruct(project.id, study.id, 'theme', { label: 'Navigation Issues' });
      await makeConstruct(project.id, study.id, 'finding', { summary: 'Users struggle with nav' });
      await makeConstruct(project.id, study.id, 'recommendation', { text: 'Simplify navigation' });

      // No attributions should exist — backfill only processes nuggets
      const result = await backfillNuggetAttributions(sequelize);
      expect(result.created).toBe(0);
      expect(await AttributionModel.count()).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Legacy backfill
  // ═══════════════════════════════════════════════════════════════

  describe('backfillNuggetAttributions', () => {
    it('resolves unique PT code and creates attribution', async () => {
      const project = await makeProject('bf-attr');
      const study = await makeStudy(project.id, 'study-bf');
      const participant = await makeParticipant(study.id, 'PT-BF1');
      await makeSubjectForParticipant(participant);

      // Create nugget with participant code in payload
      await makeConstruct(project.id, study.id, 'nugget', {
        verbatim_quote: 'I found the form confusing',
        participant: 'PT-BF1',
      });

      const result = await backfillNuggetAttributions(sequelize);

      expect(result.created).toBe(1);
      expect(result.unresolved).toBe(0);
      expect(await AttributionModel.count()).toBe(1);
    });

    it('skips ambiguous participant codes', async () => {
      const project = await makeProject('bf-ambig');
      const study1 = await makeStudy(project.id, 'study-bf1');
      const study2 = await makeStudy(project.id, 'study-bf2');
      // Same code in two different studies within same project
      await makeParticipant(study1.id, 'PT-DUP');
      await makeParticipant(study2.id, 'PT-DUP');

      // Create nugget without study_id scope — project-level, ambiguous
      await makeConstruct(project.id, null, 'nugget', {
        verbatim_quote: 'test', participant: 'PT-DUP',
      });

      const result = await backfillNuggetAttributions(sequelize);

      expect(result.unresolved).toBe(1);
      expect(result.created).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].reason).toMatch(/ambiguous/i);
    });

    it('skips nuggets with no matching participant', async () => {
      const project = await makeProject('bf-nopt');
      const study = await makeStudy(project.id, 'study-nopt');

      await makeConstruct(project.id, study.id, 'nugget', {
        verbatim_quote: 'test', participant: 'PT-NONEXISTENT',
      });

      const result = await backfillNuggetAttributions(sequelize);

      expect(result.unresolved).toBe(1);
      expect(result.created).toBe(0);
    });

    it('rerun creates no duplicates (idempotent)', async () => {
      const project = await makeProject('bf-idem');
      const study = await makeStudy(project.id, 'study-bfi');
      const participant = await makeParticipant(study.id, 'PT-BI');
      await makeSubjectForParticipant(participant);
      await makeConstruct(project.id, study.id, 'nugget', {
        verbatim_quote: 'test', participant: 'PT-BI',
      });

      const r1 = await backfillNuggetAttributions(sequelize);
      expect(r1.created).toBe(1);

      const r2 = await backfillNuggetAttributions(sequelize);
      expect(r2.created).toBe(0);
      expect(r2.skipped).toBe(1);

      expect(await AttributionModel.count()).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // stale_due_to_disposition
  // ═══════════════════════════════════════════════════════════════

  describe('stale_due_to_disposition', () => {
    it('defaults to false on new constructs', async () => {
      const project = await makeProject('stale-default');
      const study = await makeStudy(project.id, 'study-stale');
      const construct = await makeConstruct(project.id, study.id, 'nugget');

      expect(construct.stale_due_to_disposition).toBe(false);
    });

    it('can be set to true', async () => {
      const project = await makeProject('stale-set');
      const study = await makeStudy(project.id, 'study-stale-set');
      const construct = await makeConstruct(project.id, study.id, 'nugget');

      await ConstructModel.update(
        { stale_due_to_disposition: true },
        { where: { id: construct.id } },
      );

      const reloaded = await ConstructModel.findByPk(construct.id);
      expect(reloaded!.stale_due_to_disposition).toBe(true);
      // Review status remains unchanged
      expect(reloaded!.status).toBe('candidate');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Query helper
  // ═══════════════════════════════════════════════════════════════

  describe('getAttributionsForSubject', () => {
    it('returns all attributions for a subject', async () => {
      const project = await makeProject('query-attr');
      const study = await makeStudy(project.id, 'study-query');
      const participant = await makeParticipant(study.id, 'PT-Q');
      const subject = await makeSubjectForParticipant(participant);
      const c1 = await makeConstruct(project.id, study.id, 'nugget');
      const c2 = await makeConstruct(project.id, study.id, 'nugget');

      await attributeConstructToSubject({
        constructId: c1.id, dataSubjectId: subject.id, attributionType: 'direct_quote',
      }, undefined, sequelize);
      await attributeConstructToSubject({
        constructId: c2.id, dataSubjectId: subject.id, attributionType: 'observation',
      }, undefined, sequelize);

      const attrs = await getAttributionsForSubject(subject.id, sequelize);
      expect(attrs).toHaveLength(2);
    });
  });
});
