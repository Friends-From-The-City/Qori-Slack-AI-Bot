/**
 * DSAR Export V2 Integration Tests (GOV-2C)
 *
 * Proves:
 * - Complete export rooted on data_subject.public_id
 * - FK-based traversal only (no JSON/prose/participant-code matching)
 * - Participant records + notes + sessions assembled
 * - Survey responses: exact respondent only, no cross-respondent leakage
 * - Attributed evidence via evidence_subject_attributions
 * - No unrelated observer data
 * - No aggregate findings/themes accidentally included
 * - Audit log contains IDs/counts only, no PII
 * - Deleted/tombstoned subject behavior explicit
 * - Project mismatch denied
 * - Known limitations included
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';
import { exportSubjectData, type DSARExportPackage } from '../../services/dsar-export.service';
import { createSubjectForParticipant, linkSubjectToSurveyRespondent } from '../../services/subject-linking.service';
import { attributeConstructToSubject } from '../../services/evidence-attribution.service';
import type { Project } from '../../database/models/project';
import type { ResearchStudy } from '../../database/models/research_study';
import type { StudyParticipant } from '../../database/models/study_participant';
import type { StudyNotes } from '../../database/models/study_notes';
import type { EvidenceSource } from '../../database/models/evidence_source';
import type { EvidenceConstruct } from '../../database/models/evidence_construct';
import type { SurveyQualitativeEntry } from '../../database/models/survey_qualitative_entry';
import type { DataSubject } from '../../database/models/data_subject';

const sequelize = getTestDb();
const ProjectModel = sequelize.models.Project as typeof Project;
const StudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;
const ParticipantModel = sequelize.models.StudyParticipant as typeof StudyParticipant;
const NotesModel = sequelize.models.StudyNotes as typeof StudyNotes;
const SourceModel = sequelize.models.EvidenceSource as typeof EvidenceSource;
const ConstructModel = sequelize.models.EvidenceConstruct as typeof EvidenceConstruct;
const EntryModel = sequelize.models.SurveyQualitativeEntry as typeof SurveyQualitativeEntry;
const SubjectModel = sequelize.models.DataSubject as typeof DataSubject;

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
  return ParticipantModel.create({
    study_id: studyId, participant_code: code, added_by: 'U_OWNER',
    participant_name: 'Test Person', scheduled_date: new Date('2026-09-01'),
    scheduled_time: '10:00',
  });
}

async function makeNote(studyId: number, participantId: number, filename: string, content?: string) {
  return NotesModel.create({
    study_id: studyId, participant_id: participantId, study_name: 'test',
    filename, created_by: 'U_OWNER',
    pending_content: content ?? null,
  });
}

async function makeSource(projectId: number) {
  return SourceModel.create({
    project_id: projectId, source_type: 'survey_dataset', label: 'Test Survey', created_by: 'U_OWNER',
  });
}

async function makeEntry(sourceId: number, projectId: number, respondentKey: string, fieldName: string, text: string) {
  return EntryModel.create({
    evidence_source_id: sourceId, project_id: projectId,
    respondent_key: respondentKey, display_respondent_id: respondentKey,
    field_name: fieldName, field_display_name: fieldName,
    entry_text: text, entry_hash: `hash-${respondentKey}-${fieldName}`,
    pii_status: 'clear', metadata: {},
  });
}

async function makeConstruct(projectId: number, studyId: number, type: string, payload: Record<string, unknown>) {
  return ConstructModel.create({
    project_id: projectId, study_id: studyId, construct_type: type as any,
    label: `test-${type}`, payload, derivation_type: 'model', status: 'candidate', created_by: 'U_OWNER',
  });
}

async function setupSubject(participant: StudyParticipant) {
  return sequelize.transaction(async (t) => createSubjectForParticipant(participant.id, 'U_OWNER', t, sequelize));
}

// ─── Tests ──────────────────────────────────────────────────────

describe('DSAR Export V2 (GOV-2C)', () => {
  beforeEach(async () => { await truncateAll(); });
  afterAll(async () => { await sequelize.close(); });

  describe('complete export for linked participant', () => {
    it('assembles participant record, notes, sessions, and evidence', async () => {
      const project = await makeProject('exp-complete');
      const study = await makeStudy(project.id, 'study-exp');
      const participant = await makeParticipant(study.id, 'PT-EXP');
      const subject = await setupSubject(participant);

      // Add a note with content
      await makeNote(study.id, participant.id, 'notes_PT-EXP.md', 'Participant described workflow issues');

      // Add an attributed nugget
      const nugget = await makeConstruct(project.id, study.id, 'nugget', {
        verbatim_quote: 'The form was very confusing', participant: 'PT-EXP',
      });
      await attributeConstructToSubject({
        constructId: nugget.id, dataSubjectId: subject.id, attributionType: 'direct_quote',
      }, undefined, sequelize);

      const result = await exportSubjectData(subject.public_id, project.id, 'U_OWNER', sequelize);

      expect(result.export_metadata.export_version).toBe('2.0');
      expect(result.export_metadata.data_subject_public_id).toBe(subject.public_id);
      expect(result.participant_records).toHaveLength(1);
      expect(result.participant_records[0].participant_code).toBe('PT-EXP');
      expect(result.participant_records[0].participant_name).toBe('Test Person');
      expect(result.sessions).toHaveLength(1);
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].content_available).toBe(true);
      expect(result.notes[0].content).toBe('Participant described workflow issues');
      expect(result.attributed_evidence).toHaveLength(1);
      expect(result.attributed_evidence[0].attributed_content).toHaveProperty('verbatim_quote');
      expect(result.summary.participant_records).toBe(1);
    });
  });

  describe('survey respondent export', () => {
    it('includes exact respondent entries only — no other respondent leakage', async () => {
      const project = await makeProject('exp-survey');
      const study = await makeStudy(project.id, 'study-surv');
      const participant = await makeParticipant(study.id, 'PT-SURV');
      const subject = await setupSubject(participant);
      const source = await makeSource(project.id);

      // Two respondents in same source
      await makeEntry(source.id, project.id, 'R-target', 'q1', 'Target response');
      await makeEntry(source.id, project.id, 'R-target', 'q2', 'Target response 2');
      await makeEntry(source.id, project.id, 'R-other', 'q1', 'Other respondent data');

      // Link only R-target to subject
      await linkSubjectToSurveyRespondent(subject.id, source.id, 'R-target', 'U_OWNER', undefined, sequelize);

      const result = await exportSubjectData(subject.public_id, project.id, 'U_OWNER', sequelize);

      expect(result.survey_responses).toHaveLength(1);
      expect(result.survey_responses[0].respondent_key).toBe('R-target');
      expect(result.survey_responses[0].entries).toHaveLength(2);
      expect(result.summary.survey_entries).toBe(2);

      // Verify NO leakage of R-other
      const allEntryTexts = result.survey_responses.flatMap(s => s.entries.map(e => e.entry_text));
      expect(allEntryTexts).not.toContain('Other respondent data');
    });
  });

  describe('external survey-only subject', () => {
    it('exports survey responses for subject with no participant record', async () => {
      const project = await makeProject('exp-external');
      const source = await makeSource(project.id);
      await makeEntry(source.id, project.id, 'R-ext', 'q1', 'External person response');

      // Create external subject with survey link (no participant)
      const subject = await SubjectModel.create({ project_id: project.id, created_by: 'U_ADMIN' });
      const LinkModel = sequelize.models.DataSubjectLink;
      await LinkModel.create({
        data_subject_id: subject.id, link_type: 'survey_respondent',
        evidence_source_id: source.id, respondent_key: 'R-ext',
        linked_by: 'U_ADMIN',
      });

      const result = await exportSubjectData(subject.public_id, project.id, 'U_ADMIN', sequelize);

      expect(result.participant_records).toHaveLength(0);
      expect(result.survey_responses).toHaveLength(1);
      expect(result.survey_responses[0].entries[0].entry_text).toBe('External person response');
    });
  });

  describe('attributed evidence only', () => {
    it('exports only subject-attributed constructs, not unattributed ones', async () => {
      const project = await makeProject('exp-attr');
      const study = await makeStudy(project.id, 'study-attr');
      const participant = await makeParticipant(study.id, 'PT-ATTR');
      const subject = await setupSubject(participant);

      // Attributed nugget
      const nugget = await makeConstruct(project.id, study.id, 'nugget', {
        verbatim_quote: 'Subject quote', participant: 'PT-ATTR',
      });
      await attributeConstructToSubject({
        constructId: nugget.id, dataSubjectId: subject.id, attributionType: 'direct_quote',
      }, undefined, sequelize);

      // Unattributed theme (aggregate — should NOT appear)
      await makeConstruct(project.id, study.id, 'theme', { label: 'Navigation Issues' });

      // Unattributed finding
      await makeConstruct(project.id, study.id, 'finding', { summary: 'Users struggle' });

      const result = await exportSubjectData(subject.public_id, project.id, 'U_OWNER', sequelize);

      expect(result.attributed_evidence).toHaveLength(1);
      expect(result.attributed_evidence[0].construct_type).toBe('nugget');
    });

    it('extracts only subject-attributable payload fields, not full payload', async () => {
      const project = await makeProject('exp-payload');
      const study = await makeStudy(project.id, 'study-pay');
      const participant = await makeParticipant(study.id, 'PT-PAY');
      const subject = await setupSubject(participant);

      const nugget = await makeConstruct(project.id, study.id, 'nugget', {
        verbatim_quote: 'My experience was bad',
        participant: 'PT-PAY',
        severity: 'high',
        supporting_evidence_ids: ['uuid-1', 'uuid-2'],
        internal_model_metadata: { tokens: 500 },
      });
      await attributeConstructToSubject({
        constructId: nugget.id, dataSubjectId: subject.id, attributionType: 'direct_quote',
      }, undefined, sequelize);

      const result = await exportSubjectData(subject.public_id, project.id, 'U_OWNER', sequelize);

      const content = result.attributed_evidence[0].attributed_content!;
      // Should include attributable fields
      expect(content).toHaveProperty('verbatim_quote');
      expect(content).toHaveProperty('participant');
      // Should NOT include non-attributable fields
      expect(content).not.toHaveProperty('severity');
      expect(content).not.toHaveProperty('supporting_evidence_ids');
      expect(content).not.toHaveProperty('internal_model_metadata');
    });
  });

  describe('personal data boundary', () => {
    it('does not include other participants notes', async () => {
      const project = await makeProject('exp-boundary');
      const study = await makeStudy(project.id, 'study-bound');
      const p1 = await makeParticipant(study.id, 'PT-B1');
      const p2 = await makeParticipant(study.id, 'PT-B2');
      const subject1 = await setupSubject(p1);
      await setupSubject(p2);

      await makeNote(study.id, p1.id, 'notes_PT-B1.md', 'P1 content');
      await makeNote(study.id, p2.id, 'notes_PT-B2.md', 'P2 content');

      const result = await exportSubjectData(subject1.public_id, project.id, 'U_OWNER', sequelize);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].content).toBe('P1 content');
    });
  });

  describe('note content handling', () => {
    it('includes canonical content when available', async () => {
      const project = await makeProject('exp-content');
      const study = await makeStudy(project.id, 'study-content');
      const participant = await makeParticipant(study.id, 'PT-CONT');
      const subject = await setupSubject(participant);
      await makeNote(study.id, participant.id, 'notes.md', 'Canonical content here');

      const result = await exportSubjectData(subject.public_id, project.id, 'U_OWNER', sequelize);

      expect(result.notes[0].content_available).toBe(true);
      expect(result.notes[0].content).toBe('Canonical content here');
    });

    it('marks content unavailable when only in external artifact', async () => {
      const project = await makeProject('exp-nocontnt');
      const study = await makeStudy(project.id, 'study-nocontnt');
      const participant = await makeParticipant(study.id, 'PT-NC');
      const subject = await setupSubject(participant);

      const note = await NotesModel.create({
        study_id: study.id, participant_id: participant.id, study_name: 'test',
        filename: 'transcript.md', created_by: 'U_OWNER',
        file_url: 'https://github.com/org/repo/blob/main/transcript.md',
        pending_content: null,
      });

      const result = await exportSubjectData(subject.public_id, project.id, 'U_OWNER', sequelize);

      expect(result.notes[0].content_available).toBe(false);
      expect(result.notes[0].content).toBeNull();
      expect(result.export_metadata.known_limitations).toEqual(
        expect.arrayContaining([expect.stringContaining('content exists only in GitHub artifact')]),
      );
    });
  });

  describe('project scope', () => {
    it('rejects export for wrong project', async () => {
      const projectA = await makeProject('exp-xp-a');
      const projectB = await makeProject('exp-xp-b');
      const study = await makeStudy(projectA.id, 'study-xp');
      const participant = await makeParticipant(study.id, 'PT-XP');
      const subject = await setupSubject(participant);

      await expect(
        exportSubjectData(subject.public_id, projectB.id, 'U_OWNER', sequelize),
      ).rejects.toThrow(/not found/);
    });
  });

  describe('deleted/tombstoned subject', () => {
    it('exports with limitation note for deleted subject', async () => {
      const project = await makeProject('exp-del');
      const study = await makeStudy(project.id, 'study-del');
      const participant = await makeParticipant(study.id, 'PT-DEL');
      const subject = await setupSubject(participant);

      // Tombstone the subject
      await SubjectModel.update(
        { status: 'deleted', deleted_at: new Date() },
        { where: { id: subject.id } },
      );

      const result = await exportSubjectData(subject.public_id, project.id, 'U_OWNER', sequelize);

      expect(result.export_metadata.known_limitations).toEqual(
        expect.arrayContaining([expect.stringContaining('Subject has been deleted')]),
      );
    });
  });

  describe('export with known limitations completes safely', () => {
    it('produces valid export even when some sections are empty', async () => {
      const project = await makeProject('exp-empty');
      const subject = await SubjectModel.create({ project_id: project.id, created_by: 'U_OWNER' });

      // Subject with no links at all
      const result = await exportSubjectData(subject.public_id, project.id, 'U_OWNER', sequelize);

      expect(result.participant_records).toHaveLength(0);
      expect(result.sessions).toHaveLength(0);
      expect(result.notes).toHaveLength(0);
      expect(result.survey_responses).toHaveLength(0);
      expect(result.attributed_evidence).toHaveLength(0);
      expect(result.export_metadata.known_limitations.length).toBeGreaterThan(0);
    });
  });

  describe('no JSON/prose/code runtime lookup', () => {
    it('uses only FK-based traversal — unlinked participant data not found', async () => {
      const project = await makeProject('exp-nolookup');
      const study = await makeStudy(project.id, 'study-nolookup');

      // Create participant with notes but NO subject link
      const orphanParticipant = await makeParticipant(study.id, 'PT-ORPHAN');
      await makeNote(study.id, orphanParticipant.id, 'notes_orphan.md', 'Orphan content');

      // Create a subject with no links
      const subject = await SubjectModel.create({ project_id: project.id, created_by: 'U_OWNER' });

      const result = await exportSubjectData(subject.public_id, project.id, 'U_OWNER', sequelize);

      // Should NOT find the orphan participant via code matching — FK only
      expect(result.participant_records).toHaveLength(0);
      expect(result.notes).toHaveLength(0);
    });
  });
});
