/**
 * DSAR Delete Integration Tests (GOV-2D)
 *
 * Proves:
 * - Participant-only subject deletion
 * - Survey-only subject deletion
 * - Participant + survey subject deletion
 * - Exact respondent rows only; other respondents survive
 * - Direct quote redaction
 * - Observation/paraphrase redaction
 * - Unknown payload shape rolls back
 * - Attributed construct identity preserved
 * - Evidence relationships preserved
 * - Downstream theme marked stale
 * - Downstream finding marked stale
 * - Downstream recommendation marked stale
 * - Human review status unchanged
 * - Unrelated constructs remain non-stale
 * - Attributions removed after successful redaction
 * - Participant links removed via cascade
 * - Survey links removed explicitly
 * - Subject tombstoned
 * - Second delete idempotent
 * - Audit contains no PII
 * - Cross-project request denied
 * - Affected artifacts identified via artifact_evidence_refs only
 * - No runtime participant_code/prose search
 */

import { getTestDb, truncateAll } from './setup/testDb';
import {
  deleteSubjectData,
  deleteSubjectDataSafe,
  type DSARDeleteResult,
} from '../../services/dsar-delete.service';
import {
  getConstructById,
  getConstructsByProject,
  getConstructsForSource,
  createSourceToConstruct,
} from '../../services/evidence.service';
import { createSubjectForParticipant, linkSubjectToSurveyRespondent } from '../../services/subject-linking.service';
import { attributeConstructToSubject } from '../../services/evidence-attribution.service';
import type { DataSubject } from '../../database/models/data_subject';
import type { DataSubjectLink } from '../../database/models/data_subject_link';
import type { EvidenceConstruct } from '../../database/models/evidence_construct';
import type { EvidenceRelationship } from '../../database/models/evidence_relationship';
import type { EvidenceSubjectAttribution } from '../../database/models/evidence_subject_attribution';
import type { StudyParticipant } from '../../database/models/study_participant';
import type { SurveyQualitativeEntry } from '../../database/models/survey_qualitative_entry';
import type { ResearchArtifact } from '../../database/models/research_artifact';
import type { ArtifactEvidenceRef } from '../../database/models/artifact_evidence_ref';

const sequelize = getTestDb();
const ProjectModel = sequelize.models.Project;
const StudyModel = sequelize.models.ResearchStudy;
const ParticipantModel = sequelize.models.StudyParticipant as typeof StudyParticipant;
const NotesModel = sequelize.models.StudyNotes;
const SourceModel = sequelize.models.EvidenceSource;
const ConstructModel = sequelize.models.EvidenceConstruct as typeof EvidenceConstruct;
const RelationshipModel = sequelize.models.EvidenceRelationship as typeof EvidenceRelationship;
const AttributionModel = sequelize.models.EvidenceSubjectAttribution as typeof EvidenceSubjectAttribution;
const EntryModel = sequelize.models.SurveyQualitativeEntry as typeof SurveyQualitativeEntry;
const SubjectModel = sequelize.models.DataSubject as typeof DataSubject;
const LinkModel = sequelize.models.DataSubjectLink as typeof DataSubjectLink;
const VariableModel = sequelize.models.StudyVariable;
const ObserverModel = sequelize.models.SessionObserver;
const AuditModel = sequelize.models.DispositionAuditLog;
const ArtifactModel = sequelize.models.ResearchArtifact as typeof ResearchArtifact;
const ArtifactRefModel = sequelize.models.ArtifactEvidenceRef as typeof ArtifactEvidenceRef;

// ─── Fixtures ───────────────────────────────────────────────────

async function makeProject(slug: string) {
  return ProjectModel.create({
    name: `P-${slug}`, slug, created_by: 'U_OWNER', status: 'active',
  });
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
    participant_name: `Name-${code}`,
    scheduled_date: new Date('2026-09-01'), scheduled_time: '10:00',
  });
}

async function makeNote(studyId: number, participantId: number, filename: string, content?: string) {
  return NotesModel.create({
    study_id: studyId, participant_id: participantId, study_name: 'test',
    filename, created_by: 'U_OWNER', pending_content: content ?? null,
  });
}

async function makeSource(projectId: number, label?: string) {
  return SourceModel.create({
    project_id: projectId, source_type: 'survey_dataset',
    label: label ?? 'Test Survey', created_by: 'U_OWNER',
  });
}

async function makeEntry(
  sourceId: number, projectId: number, respondentKey: string,
  fieldName: string, text: string,
) {
  return EntryModel.create({
    evidence_source_id: sourceId, project_id: projectId,
    respondent_key: respondentKey, display_respondent_id: respondentKey,
    field_name: fieldName, field_display_name: fieldName,
    entry_text: text, entry_hash: `hash-${respondentKey}-${fieldName}`,
    pii_status: 'clear', metadata: {},
  });
}

async function makeConstruct(
  projectId: number, studyId: number, type: string,
  payload: Record<string, unknown>, opts?: { status?: string },
) {
  return ConstructModel.create({
    project_id: projectId, study_id: studyId,
    construct_type: type as any, label: `test-${type}`,
    payload, derivation_type: 'model',
    status: (opts?.status ?? 'candidate') as any,
    created_by: 'U_OWNER',
  });
}

async function makeRelationship(
  fromConstructId: number, toConstructId: number, type: string,
  projectId: number,
) {
  return RelationshipModel.create({
    project_id: projectId,
    from_construct_id: fromConstructId, to_construct_id: toConstructId,
    relationship_type: type as any,
  });
}

async function makeVariable(
  projectId: number, studyId: number,
  participantCode: string, key: string, value: Record<string, unknown>,
) {
  return VariableModel.create({
    project_id: projectId, study_id: studyId,
    variable_key: key, variable_type: 'pool',
    item_key: `${key}-${participantCode}-001`,
    value, participant_id: participantCode,
    source_template: 'session_summary', source_version: '1.0',
    source_date: new Date(), is_pool: true, scope: 'study',
  });
}

async function makeObserver(studyId: number, participantId: number) {
  return ObserverModel.create({
    study_id: studyId, participant_id: participantId,
    session_id: `session-${participantId}`,
    requester_id: ['U_OBS'], requester_name: ['Observer'],
    role: 'note_taker', status: 'approved',
  });
}

async function setupSubject(participant: StudyParticipant) {
  return sequelize.transaction(async (t) =>
    createSubjectForParticipant(participant.id, 'U_OWNER', t, sequelize),
  );
}

async function makeArtifact(projectId: number, studyId: number, templateId: string) {
  return ArtifactModel.create({
    project_id: projectId, study_id: studyId,
    template_id: templateId, template_version: '1.0',
    artifact_type: 'synthesis' as any,
    status: 'written' as any, created_by: 'U_OWNER',
    repo: 'test-repo',
    semantic_key: `artifact:${templateId}:${Date.now()}`,
  });
}

async function makeArtifactRef(artifactId: number, constructId: number, projectId: number) {
  return ArtifactRefModel.create({
    project_id: projectId,
    artifact_id: artifactId, construct_id: constructId,
  });
}

// ─── Tests ──────────────────────────────────────────────────────

describe('DSAR Delete (GOV-2D)', () => {
  beforeEach(async () => { await truncateAll(); });
  afterAll(async () => { await sequelize.close(); });

  // ═══════════════════════════════════════════════════════════════
  // PARTICIPANT-ONLY SUBJECT DELETION
  // ═══════════════════════════════════════════════════════════════

  describe('participant-only subject deletion', () => {
    it('deletes participant, notes, variables, observers — tombstones subject', async () => {
      const project = await makeProject('del-pt');
      const study = await makeStudy((project as any).id, 'study-pt');
      const participant = await makeParticipant((study as any).id, 'PT-DEL');
      const subject = await setupSubject(participant);

      await makeNote((study as any).id, participant.id, 'notes.md', 'Content');
      await makeVariable((project as any).id, (study as any).id, 'PT-DEL', 'atomic_nugget_core', {
        text: 'quote', participant: 'PT-DEL',
      });
      await makeObserver((study as any).id, participant.id);

      const result = await deleteSubjectData(
        subject.public_id, (project as any).id, 'U_OWNER', sequelize,
      );

      expect(result.outcome).toBe('success');
      expect(result.snapshot.participant_count).toBe(1);
      expect(result.snapshot.study_variables_count).toBe(1);
      expect(result.snapshot.study_notes_count).toBe(1);
      expect(result.snapshot.session_observers_count).toBe(1);

      // Verify deletions
      expect(await ParticipantModel.count({ where: { id: participant.id } })).toBe(0);
      expect(await NotesModel.count({ where: { participant_id: participant.id } })).toBe(0);
      expect(await VariableModel.count({ where: { participant_id: 'PT-DEL' } })).toBe(0);
      expect(await ObserverModel.count({ where: { participant_id: participant.id } })).toBe(0);

      // Subject tombstoned
      const tombstone = await SubjectModel.findByPk(subject.id);
      expect(tombstone!.status).toBe('deleted');
      expect(tombstone!.deleted_at).not.toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SURVEY-ONLY SUBJECT DELETION
  // ═══════════════════════════════════════════════════════════════

  describe('survey-only subject deletion', () => {
    it('deletes exact respondent entries — tombstones subject', async () => {
      const project = await makeProject('del-surv');
      const source = await makeSource((project as any).id);
      await makeEntry((source as any).id, (project as any).id, 'R-target', 'q1', 'Target answer');
      await makeEntry((source as any).id, (project as any).id, 'R-other', 'q1', 'Other answer');

      // Create external subject with survey link
      const subject = await SubjectModel.create({
        project_id: (project as any).id, created_by: 'U_OWNER',
      });
      await linkSubjectToSurveyRespondent(
        subject.id, (source as any).id, 'R-target', 'U_OWNER', undefined, sequelize,
      );

      const result = await deleteSubjectData(
        subject.public_id, (project as any).id, 'U_OWNER', sequelize,
      );

      expect(result.outcome).toBe('success');
      expect(result.snapshot.survey_entries_count).toBe(1);

      // R-target entries deleted
      expect(await EntryModel.count({
        where: { respondent_key: 'R-target' },
      })).toBe(0);

      // R-other entries survive
      expect(await EntryModel.count({
        where: { respondent_key: 'R-other' },
      })).toBe(1);

      // Subject tombstoned
      const tombstone = await SubjectModel.findByPk(subject.id);
      expect(tombstone!.status).toBe('deleted');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PARTICIPANT + SURVEY COMBINED
  // ═══════════════════════════════════════════════════════════════

  describe('participant + survey subject deletion', () => {
    it('deletes both participant data and survey entries', async () => {
      const project = await makeProject('del-both');
      const study = await makeStudy((project as any).id, 'study-both');
      const participant = await makeParticipant((study as any).id, 'PT-BOTH');
      const subject = await setupSubject(participant);
      const source = await makeSource((project as any).id);

      await makeNote((study as any).id, participant.id, 'notes.md', 'Content');
      await makeEntry((source as any).id, (project as any).id, 'R-both', 'q1', 'Response');

      await linkSubjectToSurveyRespondent(
        subject.id, (source as any).id, 'R-both', 'U_OWNER', undefined, sequelize,
      );

      const result = await deleteSubjectData(
        subject.public_id, (project as any).id, 'U_OWNER', sequelize,
      );

      expect(result.outcome).toBe('success');
      expect(result.snapshot.participant_count).toBe(1);
      expect(result.snapshot.survey_entries_count).toBe(1);
      expect(await ParticipantModel.count({ where: { id: participant.id } })).toBe(0);
      expect(await EntryModel.count({ where: { respondent_key: 'R-both' } })).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // EXACT RESPONDENT ROWS — OTHER RESPONDENTS SURVIVE
  // ═══════════════════════════════════════════════════════════════

  describe('exact respondent isolation', () => {
    it('deletes only exact linked respondent — others survive', async () => {
      const project = await makeProject('del-iso');
      const source = await makeSource((project as any).id);
      await makeEntry((source as any).id, (project as any).id, 'R-del', 'q1', 'Delete me');
      await makeEntry((source as any).id, (project as any).id, 'R-del', 'q2', 'Delete me too');
      await makeEntry((source as any).id, (project as any).id, 'R-keep', 'q1', 'Keep me');

      const subject = await SubjectModel.create({
        project_id: (project as any).id, created_by: 'U_OWNER',
      });
      await linkSubjectToSurveyRespondent(
        subject.id, (source as any).id, 'R-del', 'U_OWNER', undefined, sequelize,
      );

      await deleteSubjectData(subject.public_id, (project as any).id, 'U_OWNER', sequelize);

      expect(await EntryModel.count({ where: { respondent_key: 'R-del' } })).toBe(0);
      expect(await EntryModel.count({ where: { respondent_key: 'R-keep' } })).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DIRECT QUOTE REDACTION
  // ═══════════════════════════════════════════════════════════════

  describe('direct quote redaction', () => {
    it('redacts verbatim_quote and removes participant field', async () => {
      const project = await makeProject('del-dq');
      const study = await makeStudy((project as any).id, 'study-dq');
      const participant = await makeParticipant((study as any).id, 'PT-DQ');
      const subject = await setupSubject(participant);

      const nugget = await makeConstruct((project as any).id, (study as any).id, 'nugget', {
        verbatim_quote: 'The form was confusing',
        participant: 'PT-DQ',
        severity: 'high',
        session: 'S-001',
      });
      await attributeConstructToSubject({
        constructId: nugget.id, dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      const result = await deleteSubjectData(
        subject.public_id, (project as any).id, 'U_OWNER', sequelize,
      );

      expect(result.outcome).toBe('success');
      expect(result.redaction_map.redacted_constructs).toHaveLength(1);
      expect(result.redaction_map.redacted_constructs[0].fields_redacted).toContain('verbatim_quote');
      expect(result.redaction_map.redacted_constructs[0].fields_redacted).toContain('participant');

      // Verify payload in DB
      const redacted = await ConstructModel.findByPk(nugget.id);
      expect(redacted!.payload!.verbatim_quote).toBe('[REDACTED]');
      expect(redacted!.payload!.participant).toBeUndefined();
      // Non-attributable fields preserved
      expect(redacted!.payload!.severity).toBe('high');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // OBSERVATION / PARAPHRASE REDACTION
  // ═══════════════════════════════════════════════════════════════

  describe('observation and paraphrase redaction', () => {
    it('redacts observation fields correctly', async () => {
      const project = await makeProject('del-obs');
      const study = await makeStudy((project as any).id, 'study-obs');
      const participant = await makeParticipant((study as any).id, 'PT-OBS');
      const subject = await setupSubject(participant);

      const construct = await makeConstruct((project as any).id, (study as any).id, 'nugget', {
        observation: 'User appeared frustrated',
        behavior: 'Clicked back button repeatedly',
        participant: 'PT-OBS',
        task_id: 'T-001',
      });
      await attributeConstructToSubject({
        constructId: construct.id, dataSubjectId: subject.id,
        attributionType: 'observation',
      }, undefined, sequelize);

      const result = await deleteSubjectData(
        subject.public_id, (project as any).id, 'U_OWNER', sequelize,
      );

      const redacted = await ConstructModel.findByPk(construct.id);
      expect(redacted!.payload!.observation).toBe('[REDACTED]');
      expect(redacted!.payload!.behavior).toBe('[REDACTED]');
      expect(redacted!.payload!.participant).toBeUndefined();
      expect(redacted!.payload!.task_id).toBe('T-001'); // Preserved
    });

    it('redacts paraphrase fields correctly', async () => {
      const project = await makeProject('del-para');
      const study = await makeStudy((project as any).id, 'study-para');
      const participant = await makeParticipant((study as any).id, 'PT-PARA');
      const subject = await setupSubject(participant);

      const construct = await makeConstruct((project as any).id, (study as any).id, 'nugget', {
        paraphrase: 'Participant expressed concern about navigation',
        summary: 'Navigation was difficult',
        participant_code: 'PT-PARA',
        category: 'usability',
      });
      await attributeConstructToSubject({
        constructId: construct.id, dataSubjectId: subject.id,
        attributionType: 'paraphrase',
      }, undefined, sequelize);

      const result = await deleteSubjectData(
        subject.public_id, (project as any).id, 'U_OWNER', sequelize,
      );

      const redacted = await ConstructModel.findByPk(construct.id);
      expect(redacted!.payload!.paraphrase).toBe('[REDACTED]');
      expect(redacted!.payload!.summary).toBe('[REDACTED]');
      expect(redacted!.payload!.participant_code).toBeUndefined();
      expect(redacted!.payload!.category).toBe('usability'); // Preserved
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // UNKNOWN PAYLOAD SHAPE ROLLS BACK
  // ═══════════════════════════════════════════════════════════════

  describe('unknown payload shape', () => {
    it('rolls back entire transaction when payload shape is unrecognized', async () => {
      const project = await makeProject('del-unk');
      const study = await makeStudy((project as any).id, 'study-unk');
      const participant = await makeParticipant((study as any).id, 'PT-UNK');
      const subject = await setupSubject(participant);

      // Good construct
      const goodNugget = await makeConstruct((project as any).id, (study as any).id, 'nugget', {
        verbatim_quote: 'A real quote', participant: 'PT-UNK',
      });
      await attributeConstructToSubject({
        constructId: goodNugget.id, dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      // Bad construct — unrecognized payload for direct_quote
      const badNugget = await makeConstruct((project as any).id, (study as any).id, 'nugget', {
        custom_field: 'some value', another_field: 'other value',
      });
      await attributeConstructToSubject({
        constructId: badNugget.id, dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      // Add a note that should NOT be deleted if rollback works
      await makeNote((study as any).id, participant.id, 'notes.md', 'Should survive');

      const result = await deleteSubjectDataSafe(
        subject.public_id, (project as any).id, 'U_OWNER', sequelize,
      );

      expect(result.outcome).toBe('manual_review_required');
      expect(result.redaction_map.failed_constructs).toHaveLength(1);
      expect(result.redaction_map.failed_constructs[0].public_id).toBe(badNugget.public_id);

      // CRITICAL: Everything survives — transaction rolled back
      expect(await ParticipantModel.count({ where: { id: participant.id } })).toBe(1);
      expect(await NotesModel.count({ where: { participant_id: participant.id } })).toBe(1);
      const subjectAfter = await SubjectModel.findByPk(subject.id);
      expect(subjectAfter!.status).toBe('active');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ATTRIBUTED CONSTRUCT IDENTITY PRESERVED
  // ═══════════════════════════════════════════════════════════════

  describe('construct identity preservation', () => {
    it('preserves id, public_id, construct_type, status, derivation metadata', async () => {
      const project = await makeProject('del-pres');
      const study = await makeStudy((project as any).id, 'study-pres');
      const participant = await makeParticipant((study as any).id, 'PT-PRES');
      const subject = await setupSubject(participant);

      const nugget = await makeConstruct(
        (project as any).id, (study as any).id, 'nugget',
        { verbatim_quote: 'My experience', participant: 'PT-PRES' },
        { status: 'accepted' },
      );
      await attributeConstructToSubject({
        constructId: nugget.id, dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      await deleteSubjectData(subject.public_id, (project as any).id, 'U_OWNER', sequelize);

      const after = await ConstructModel.findByPk(nugget.id);
      expect(after).not.toBeNull();
      expect(after!.id).toBe(nugget.id);
      expect(after!.public_id).toBe(nugget.public_id);
      expect(after!.construct_type).toBe('nugget');
      expect(after!.derivation_type).toBe('model');
      expect(after!.stale_due_to_disposition).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // EVIDENCE RELATIONSHIPS PRESERVED
  // ═══════════════════════════════════════════════════════════════

  describe('evidence relationships preserved', () => {
    it('keeps relationships intact after redaction', async () => {
      const project = await makeProject('del-rel');
      const study = await makeStudy((project as any).id, 'study-rel');
      const participant = await makeParticipant((study as any).id, 'PT-REL');
      const subject = await setupSubject(participant);

      const nugget = await makeConstruct((project as any).id, (study as any).id, 'nugget', {
        verbatim_quote: 'Quote', participant: 'PT-REL',
      });
      const theme = await makeConstruct((project as any).id, (study as any).id, 'theme', {
        theme_name: 'Navigation',
      });
      await makeRelationship(nugget.id, theme.id, 'SYNTHESIZED_FROM', (project as any).id);

      await attributeConstructToSubject({
        constructId: nugget.id, dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      await deleteSubjectData(subject.public_id, (project as any).id, 'U_OWNER', sequelize);

      // Relationship still exists
      const rels = await RelationshipModel.findAll({
        where: { from_construct_id: nugget.id, to_construct_id: theme.id },
      });
      expect(rels).toHaveLength(1);
      expect((rels[0] as any).relationship_type).toBe('SYNTHESIZED_FROM');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DOWNSTREAM STALENESS — THEME, FINDING, RECOMMENDATION
  // ═══════════════════════════════════════════════════════════════

  describe('downstream staleness traversal', () => {
    it('marks downstream theme, finding, recommendation as stale', async () => {
      const project = await makeProject('del-stale');
      const study = await makeStudy((project as any).id, 'study-stale');
      const participant = await makeParticipant((study as any).id, 'PT-STALE');
      const subject = await setupSubject(participant);

      // Build lineage chain: nugget → theme → finding → recommendation
      const nugget = await makeConstruct((project as any).id, (study as any).id, 'nugget', {
        verbatim_quote: 'Evidence', participant: 'PT-STALE',
      });
      const theme = await makeConstruct((project as any).id, (study as any).id, 'theme', {
        theme_name: 'UX Issues',
      });
      const finding = await makeConstruct((project as any).id, (study as any).id, 'finding', {
        finding: 'Users struggle with navigation',
      });
      const recommendation = await makeConstruct((project as any).id, (study as any).id, 'recommendation', {
        recommendation: 'Simplify nav structure',
      });

      await makeRelationship(nugget.id, theme.id, 'SYNTHESIZED_FROM', (project as any).id);
      await makeRelationship(theme.id, finding.id, 'SUPPORTS', (project as any).id);
      await makeRelationship(finding.id, recommendation.id, 'ADDRESSES', (project as any).id);

      await attributeConstructToSubject({
        constructId: nugget.id, dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      const result = await deleteSubjectData(
        subject.public_id, (project as any).id, 'U_OWNER', sequelize,
      );

      expect(result.staleness.directly_marked).toContain(nugget.public_id);
      expect(result.staleness.downstream_marked).toContain(theme.public_id);
      expect(result.staleness.downstream_marked).toContain(finding.public_id);
      expect(result.staleness.downstream_marked).toContain(recommendation.public_id);

      // Verify in DB
      for (const id of [theme.id, finding.id, recommendation.id]) {
        const c = await ConstructModel.findByPk(id);
        expect(c!.stale_due_to_disposition).toBe(true);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // HUMAN REVIEW STATUS UNCHANGED
  // ═══════════════════════════════════════════════════════════════

  describe('review status unchanged', () => {
    it('does not change accepted/rejected status on stale constructs', async () => {
      const project = await makeProject('del-review');
      const study = await makeStudy((project as any).id, 'study-review');
      const participant = await makeParticipant((study as any).id, 'PT-REV');
      const subject = await setupSubject(participant);

      const nugget = await makeConstruct(
        (project as any).id, (study as any).id, 'nugget',
        { verbatim_quote: 'Quote', participant: 'PT-REV' },
        { status: 'accepted' },
      );
      const finding = await makeConstruct(
        (project as any).id, (study as any).id, 'finding',
        { finding: 'Key finding' },
        { status: 'accepted' },
      );
      await makeRelationship(nugget.id, finding.id, 'SUPPORTS', (project as any).id);

      await attributeConstructToSubject({
        constructId: nugget.id, dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      await deleteSubjectData(subject.public_id, (project as any).id, 'U_OWNER', sequelize);

      // Both marked stale, but status unchanged
      const nuggetAfter = await ConstructModel.findByPk(nugget.id);
      expect(nuggetAfter!.status).toBe('accepted');
      expect(nuggetAfter!.stale_due_to_disposition).toBe(true);

      const findingAfter = await ConstructModel.findByPk(finding.id);
      expect(findingAfter!.status).toBe('accepted');
      expect(findingAfter!.stale_due_to_disposition).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // UNRELATED CONSTRUCTS REMAIN NON-STALE
  // ═══════════════════════════════════════════════════════════════

  describe('unrelated constructs unaffected', () => {
    it('does not mark unrelated constructs as stale', async () => {
      const project = await makeProject('del-unrel');
      const study = await makeStudy((project as any).id, 'study-unrel');
      const participant = await makeParticipant((study as any).id, 'PT-UNREL');
      const subject = await setupSubject(participant);

      const nugget = await makeConstruct((project as any).id, (study as any).id, 'nugget', {
        verbatim_quote: 'Quote', participant: 'PT-UNREL',
      });
      await attributeConstructToSubject({
        constructId: nugget.id, dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      // Unrelated construct — no relationship to nugget
      const unrelated = await makeConstruct((project as any).id, (study as any).id, 'theme', {
        theme_name: 'Accessibility',
      });

      await deleteSubjectData(subject.public_id, (project as any).id, 'U_OWNER', sequelize);

      const unrelatedAfter = await ConstructModel.findByPk(unrelated.id);
      expect(unrelatedAfter!.stale_due_to_disposition).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ATTRIBUTIONS REMOVED
  // ═══════════════════════════════════════════════════════════════

  describe('attributions removed', () => {
    it('deletes evidence_subject_attributions after redaction', async () => {
      const project = await makeProject('del-attr');
      const study = await makeStudy((project as any).id, 'study-attr');
      const participant = await makeParticipant((study as any).id, 'PT-ATTR');
      const subject = await setupSubject(participant);

      const nugget = await makeConstruct((project as any).id, (study as any).id, 'nugget', {
        verbatim_quote: 'Quote', participant: 'PT-ATTR',
      });
      await attributeConstructToSubject({
        constructId: nugget.id, dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      await deleteSubjectData(subject.public_id, (project as any).id, 'U_OWNER', sequelize);

      expect(await AttributionModel.count({
        where: { data_subject_id: subject.id },
      })).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PARTICIPANT LINKS REMOVED / SURVEY LINKS REMOVED
  // ═══════════════════════════════════════════════════════════════

  describe('links removed', () => {
    it('removes participant and survey links', async () => {
      const project = await makeProject('del-links');
      const study = await makeStudy((project as any).id, 'study-links');
      const participant = await makeParticipant((study as any).id, 'PT-LINKS');
      const subject = await setupSubject(participant);
      const source = await makeSource((project as any).id);
      await makeEntry((source as any).id, (project as any).id, 'R-link', 'q1', 'data');

      await linkSubjectToSurveyRespondent(
        subject.id, (source as any).id, 'R-link', 'U_OWNER', undefined, sequelize,
      );

      await deleteSubjectData(subject.public_id, (project as any).id, 'U_OWNER', sequelize);

      expect(await LinkModel.count({
        where: { data_subject_id: subject.id },
      })).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SUBJECT TOMBSTONED
  // ═══════════════════════════════════════════════════════════════

  describe('subject tombstoned', () => {
    it('sets status=deleted and deleted_at', async () => {
      const project = await makeProject('del-tomb');
      const study = await makeStudy((project as any).id, 'study-tomb');
      const participant = await makeParticipant((study as any).id, 'PT-TOMB');
      const subject = await setupSubject(participant);

      await deleteSubjectData(subject.public_id, (project as any).id, 'U_OWNER', sequelize);

      const after = await SubjectModel.findByPk(subject.id);
      expect(after!.status).toBe('deleted');
      expect(after!.deleted_at).toBeInstanceOf(Date);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // IDEMPOTENT SECOND DELETE
  // ═══════════════════════════════════════════════════════════════

  describe('idempotent second delete', () => {
    it('returns already_deleted on second call — no destructive work', async () => {
      const project = await makeProject('del-idem');
      const study = await makeStudy((project as any).id, 'study-idem');
      const participant = await makeParticipant((study as any).id, 'PT-IDEM');
      const subject = await setupSubject(participant);

      const first = await deleteSubjectData(
        subject.public_id, (project as any).id, 'U_OWNER', sequelize,
      );
      expect(first.outcome).toBe('success');

      const second = await deleteSubjectData(
        subject.public_id, (project as any).id, 'U_OWNER', sequelize,
      );
      expect(second.outcome).toBe('already_deleted');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AUDIT CONTAINS NO PII
  // ═══════════════════════════════════════════════════════════════

  describe('audit PII safety', () => {
    it('audit log contains only IDs and counts — no PII', async () => {
      const project = await makeProject('del-audit');
      const study = await makeStudy((project as any).id, 'study-audit');
      const participant = await makeParticipant((study as any).id, 'PT-AUD');
      const subject = await setupSubject(participant);

      await makeNote((study as any).id, participant.id, 'notes.md', 'Sensitive PII content here');
      const nugget = await makeConstruct((project as any).id, (study as any).id, 'nugget', {
        verbatim_quote: 'My name is John', participant: 'PT-AUD',
      });
      await attributeConstructToSubject({
        constructId: nugget.id, dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      await deleteSubjectData(subject.public_id, (project as any).id, 'U_OWNER', sequelize);

      const audits = await AuditModel.findAll({
        where: { action: 'delete_subject' },
      });
      expect(audits).toHaveLength(1);

      const audit = audits[0] as any;
      const auditStr = JSON.stringify(audit.toJSON());

      // Must NOT contain PII
      expect(auditStr).not.toContain('Name-PT-AUD');
      expect(auditStr).not.toContain('Sensitive PII content here');
      expect(auditStr).not.toContain('My name is John');
      expect(auditStr).not.toContain('PT-AUD'); // No participant codes in audit

      // Must contain canonical identifiers
      expect(audit.target_identifier).toBe(subject.public_id);
      expect(audit.outcome).toBe('success');
      expect(audit.records_affected).toBeDefined();
      expect(audit.records_affected.participants).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CROSS-PROJECT REQUEST DENIED
  // ═══════════════════════════════════════════════════════════════

  describe('cross-project denial', () => {
    it('rejects delete for wrong project', async () => {
      const projectA = await makeProject('del-xp-a');
      const projectB = await makeProject('del-xp-b');
      const study = await makeStudy((projectA as any).id, 'study-xp');
      const participant = await makeParticipant((study as any).id, 'PT-XP');
      const subject = await setupSubject(participant);

      await expect(
        deleteSubjectData(subject.public_id, (projectB as any).id, 'U_OWNER', sequelize),
      ).rejects.toThrow(/not found/);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AFFECTED ARTIFACTS VIA ARTIFACT_EVIDENCE_REFS
  // ═══════════════════════════════════════════════════════════════

  describe('affected artifacts via artifact_evidence_refs', () => {
    it('identifies affected artifacts through redacted/stale constructs', async () => {
      const project = await makeProject('del-art');
      const study = await makeStudy((project as any).id, 'study-art');
      const participant = await makeParticipant((study as any).id, 'PT-ART');
      const subject = await setupSubject(participant);

      // nugget → theme → finding, with artifacts referencing each
      const nugget = await makeConstruct((project as any).id, (study as any).id, 'nugget', {
        verbatim_quote: 'Data', participant: 'PT-ART',
      });
      const theme = await makeConstruct((project as any).id, (study as any).id, 'theme', {
        theme_name: 'Theme',
      });
      const finding = await makeConstruct((project as any).id, (study as any).id, 'finding', {
        finding: 'Finding',
      });

      await makeRelationship(nugget.id, theme.id, 'SYNTHESIZED_FROM', (project as any).id);
      await makeRelationship(theme.id, finding.id, 'SUPPORTS', (project as any).id);

      await attributeConstructToSubject({
        constructId: nugget.id, dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      // Create artifacts and refs
      const artifact1 = await makeArtifact((project as any).id, (study as any).id, 'readout');
      const artifact2 = await makeArtifact((project as any).id, (study as any).id, 'synthesis');
      await makeArtifactRef((artifact1 as any).id, finding.id, (project as any).id);
      await makeArtifactRef((artifact2 as any).id, theme.id, (project as any).id);

      const result = await deleteSubjectData(
        subject.public_id, (project as any).id, 'U_OWNER', sequelize,
      );

      expect(result.affected_artifacts).toHaveLength(2);
      const artifactIds = result.affected_artifacts.map(a => a.artifact_id);
      expect(artifactIds).toContain((artifact1 as any).id);
      expect(artifactIds).toContain((artifact2 as any).id);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // NO RUNTIME PARTICIPANT_CODE / PROSE SEARCH
  // ═══════════════════════════════════════════════════════════════

  describe('no runtime prose/code search', () => {
    it('unlinked participant data not found — FK only', async () => {
      const project = await makeProject('del-nolookup');
      const study = await makeStudy((project as any).id, 'study-nolookup');

      // Create participant with data but NO subject link
      const orphan = await makeParticipant((study as any).id, 'PT-ORPHAN');
      await makeNote((study as any).id, orphan.id, 'orphan.md', 'Orphan data');
      await makeVariable((project as any).id, (study as any).id, 'PT-ORPHAN', 'nugget', {
        text: 'orphan quote', participant: 'PT-ORPHAN',
      });

      // Create empty subject
      const subject = await SubjectModel.create({
        project_id: (project as any).id, created_by: 'U_OWNER',
      });

      const result = await deleteSubjectData(
        subject.public_id, (project as any).id, 'U_OWNER', sequelize,
      );

      expect(result.outcome).toBe('success');
      expect(result.snapshot.participant_count).toBe(0);

      // Orphan data untouched — FK traversal found nothing
      expect(await ParticipantModel.count({ where: { id: orphan.id } })).toBe(1);
      expect(await NotesModel.count({ where: { participant_id: orphan.id } })).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // MULTIPLE PARTICIPANT RECORDS
  // ═══════════════════════════════════════════════════════════════

  describe('subject linked to multiple participants', () => {
    it('deletes all linked participants across studies', async () => {
      const project = await makeProject('del-multi');
      const study1 = await makeStudy((project as any).id, 'study-m1');
      const study2 = await makeStudy((project as any).id, 'study-m2');
      const p1 = await makeParticipant((study1 as any).id, 'PT-M1');
      const p2 = await makeParticipant((study2 as any).id, 'PT-M2');

      // Create subject for first participant, link second
      const subject = await setupSubject(p1);
      await sequelize.transaction(async (t) => {
        await LinkModel.create({
          data_subject_id: subject.id, link_type: 'participant',
          participant_id: p2.id, study_id: (study2 as any).id,
          linked_by: 'U_OWNER',
        }, { transaction: t });
      });

      await deleteSubjectData(subject.public_id, (project as any).id, 'U_OWNER', sequelize);

      expect(await ParticipantModel.count({ where: { id: p1.id } })).toBe(0);
      expect(await ParticipantModel.count({ where: { id: p2.id } })).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SUBJECT WITH NO EVIDENCE ATTRIBUTIONS
  // ═══════════════════════════════════════════════════════════════

  describe('subject with no evidence attributions', () => {
    it('completes deletion without evidence redaction', async () => {
      const project = await makeProject('del-noev');
      const study = await makeStudy((project as any).id, 'study-noev');
      const participant = await makeParticipant((study as any).id, 'PT-NOEV');
      const subject = await setupSubject(participant);

      const result = await deleteSubjectData(
        subject.public_id, (project as any).id, 'U_OWNER', sequelize,
      );

      expect(result.outcome).toBe('success');
      expect(result.redaction_map.redacted_constructs).toHaveLength(0);
      expect(result.staleness.directly_marked).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ALREADY STALE CONSTRUCTS
  // ═══════════════════════════════════════════════════════════════

  describe('already stale constructs', () => {
    it('handles constructs already marked stale', async () => {
      const project = await makeProject('del-prestale');
      const study = await makeStudy((project as any).id, 'study-prestale');
      const participant = await makeParticipant((study as any).id, 'PT-PS');
      const subject = await setupSubject(participant);

      const nugget = await makeConstruct((project as any).id, (study as any).id, 'nugget', {
        verbatim_quote: 'Quote', participant: 'PT-PS',
      });
      // Pre-mark downstream as stale
      const theme = await ConstructModel.create({
        project_id: (project as any).id, study_id: (study as any).id,
        construct_type: 'theme' as any, label: 'test-theme',
        payload: { theme_name: 'Already stale' },
        derivation_type: 'model', status: 'candidate', created_by: 'U_OWNER',
        stale_due_to_disposition: true,
      });
      await makeRelationship(nugget.id, theme.id, 'SYNTHESIZED_FROM', (project as any).id);

      await attributeConstructToSubject({
        constructId: nugget.id, dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      const result = await deleteSubjectData(
        subject.public_id, (project as any).id, 'U_OWNER', sequelize,
      );

      expect(result.outcome).toBe('success');
      // Theme was already stale — still reported in downstream
      expect(result.staleness.downstream_marked).toContain(theme.public_id);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // EMPTY PAYLOAD CONSTRUCT
  // ═══════════════════════════════════════════════════════════════

  describe('null/empty payload construct', () => {
    it('marks stale without redaction when payload is null', async () => {
      const project = await makeProject('del-null');
      const study = await makeStudy((project as any).id, 'study-null');
      const participant = await makeParticipant((study as any).id, 'PT-NULL');
      const subject = await setupSubject(participant);

      const nugget = await ConstructModel.create({
        project_id: (project as any).id, study_id: (study as any).id,
        construct_type: 'nugget' as any, label: 'empty-nugget',
        payload: null, derivation_type: 'model', status: 'candidate',
        created_by: 'U_OWNER',
      });
      await attributeConstructToSubject({
        constructId: nugget.id, dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      const result = await deleteSubjectData(
        subject.public_id, (project as any).id, 'U_OWNER', sequelize,
      );

      expect(result.outcome).toBe('success');
      const after = await ConstructModel.findByPk(nugget.id);
      expect(after!.stale_due_to_disposition).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // STALENESS CONSUMER SAFETY (Section 8)
  // ═══════════════════════════════════════════════════════════════

  describe('staleness consumer safety', () => {
    it('stale_due_to_disposition is preserved in getConstructById retrieval', async () => {
      const project = await makeProject('del-cs-1');
      const study = await makeStudy((project as any).id, 'study-cs1');
      const participant = await makeParticipant((study as any).id, 'PT-CS1');
      const subject = await setupSubject(participant);

      const nugget = await makeConstruct((project as any).id, (study as any).id, 'nugget', {
        verbatim_quote: 'Quote', participant: 'PT-CS1',
      });
      await attributeConstructToSubject({
        constructId: nugget.id, dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      await deleteSubjectData(subject.public_id, (project as any).id, 'U_OWNER', sequelize);

      // Retrieval via evidence.service must expose staleness
      const retrieved = await getConstructById(nugget.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.stale_due_to_disposition).toBe(true);
    });

    it('stale_due_to_disposition is preserved in getConstructsByProject retrieval', async () => {
      const project = await makeProject('del-cs-2');
      const study = await makeStudy((project as any).id, 'study-cs2');
      const participant = await makeParticipant((study as any).id, 'PT-CS2');
      const subject = await setupSubject(participant);

      const nugget = await makeConstruct((project as any).id, (study as any).id, 'nugget', {
        verbatim_quote: 'Quote', participant: 'PT-CS2',
      });
      const theme = await makeConstruct((project as any).id, (study as any).id, 'theme', {
        theme_name: 'Test',
      });
      await makeRelationship(nugget.id, theme.id, 'SYNTHESIZED_FROM', (project as any).id);

      await attributeConstructToSubject({
        constructId: nugget.id, dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      await deleteSubjectData(subject.public_id, (project as any).id, 'U_OWNER', sequelize);

      // Both stale constructs must expose staleness in bulk retrieval
      const allConstructs = await getConstructsByProject((project as any).id);
      const staleConstructs = allConstructs.filter(c => c.stale_due_to_disposition);
      expect(staleConstructs.length).toBeGreaterThanOrEqual(2);
      expect(staleConstructs.some(c => c.public_id === nugget.public_id)).toBe(true);
      expect(staleConstructs.some(c => c.public_id === theme.public_id)).toBe(true);
    });

    it('stale construct retrieved via getConstructsForSource still carries stale flag', async () => {
      const project = await makeProject('del-cs-3');
      const study = await makeStudy((project as any).id, 'study-cs3');
      const participant = await makeParticipant((study as any).id, 'PT-CS3');
      const subject = await setupSubject(participant);

      // Create source and link nugget
      const source = await makeSource((project as any).id);
      const nugget = await makeConstruct((project as any).id, (study as any).id, 'nugget', {
        verbatim_quote: 'Quote', participant: 'PT-CS3',
      });
      await createSourceToConstruct({
        from_source_id: (source as any).id,
        to_construct_id: nugget.id,
        relationship_type: 'DERIVED_FROM',
        project_id: (project as any).id,
      });

      await attributeConstructToSubject({
        constructId: nugget.id, dataSubjectId: subject.id,
        attributionType: 'direct_quote',
      }, undefined, sequelize);

      await deleteSubjectData(subject.public_id, (project as any).id, 'U_OWNER', sequelize);

      const sourceConstructs = await getConstructsForSource((source as any).id);
      expect(sourceConstructs).toHaveLength(1);
      expect(sourceConstructs[0].stale_due_to_disposition).toBe(true);
    });
  });
});
