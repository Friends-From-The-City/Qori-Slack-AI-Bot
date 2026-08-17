/**
 * DSAR Export V2 Service (GOV-2C)
 *
 * Complete, file-based export rooted on canonical data_subject.public_id.
 * Traverses FK-backed subject links and evidence attributions.
 * No JSON/prose/participant-code matching.
 *
 * Replaces the truncated Slack-message export in dsar.service.ts.
 *
 * Export is delivered as a JSON file uploaded to a private DM with
 * the authorized requesting owner/admin.
 */

import type { Sequelize } from 'sequelize';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import type { WebClient } from '@slack/web-api';

import defaultSequelize from '../database';
import { assertProjectOwner, AuthorizationError } from './authorization.service';
import { logDispositionAction } from './audit.service';
import type { DataSubject } from '../database/models/data_subject';
import type { DataSubjectLink } from '../database/models/data_subject_link';
import type { StudyParticipant } from '../database/models/study_participant';
import type { StudyNotes } from '../database/models/study_notes';
import type { EvidenceSubjectAttribution } from '../database/models/evidence_subject_attribution';
import type { EvidenceConstruct } from '../database/models/evidence_construct';
import type { EvidenceSource } from '../database/models/evidence_source';
import type { SurveyQualitativeEntry } from '../database/models/survey_qualitative_entry';
import type { ResearchStudy } from '../database/models/research_study';
import type { DispositionAuditLog } from '../database/models/disposition_audit_log';

function models(db?: Sequelize) {
  const s = db ?? defaultSequelize;
  return {
    Subject: s.models.DataSubject as typeof DataSubject,
    Link: s.models.DataSubjectLink as typeof DataSubjectLink,
    Participant: s.models.StudyParticipant as typeof StudyParticipant,
    Study: s.models.ResearchStudy as typeof ResearchStudy,
    Notes: s.models.StudyNotes as typeof StudyNotes,
    Attribution: s.models.EvidenceSubjectAttribution as typeof EvidenceSubjectAttribution,
    Construct: s.models.EvidenceConstruct as typeof EvidenceConstruct,
    Source: s.models.EvidenceSource as typeof EvidenceSource,
    Entry: s.models.SurveyQualitativeEntry as typeof SurveyQualitativeEntry,
    AuditLog: s.models.DispositionAuditLog as typeof DispositionAuditLog,
    db: s,
  };
}

// ─── Export types ────────────────────────────────────────────────

export interface DSARExportPackage {
  export_metadata: {
    export_version: '2.0';
    generated_at: string;
    requested_by: string;
    data_subject_public_id: string;
    project_id: number;
    project_name: string | null;
    known_limitations: string[];
  };

  participant_records: Array<{
    study_name: string;
    participant_code: string;
    participant_name: string | null;
    demographics_info: Record<string, unknown> | null;
    compensation_amount: number | null;
    recruitment_source: string | null;
    status: string | null;
    outreach_history: {
      sent_at: string | null;
      method: string | null;
      count: number;
    };
    created_at: string;
  }>;

  sessions: Array<{
    study_name: string;
    participant_code: string;
    scheduled_date: string | null;
    scheduled_time: string | null;
  }>;

  notes: Array<{
    note_id: number;
    study_name: string;
    filename: string;
    content_available: boolean;
    content: string | null;
    pii_reviewed: boolean;
    created_at: string;
  }>;

  survey_responses: Array<{
    source_label: string;
    respondent_key: string;
    entries: Array<{
      field_name: string;
      field_display_name: string;
      entry_text: string | null;
      redacted_text: string | null;
      pii_status: string;
    }>;
  }>;

  attributed_evidence: Array<{
    construct_public_id: string;
    construct_type: string;
    attribution_type: string;
    evidence_source_label: string | null;
    attributed_content: Record<string, unknown> | null;
    construct_status: string;
    stale_due_to_disposition: boolean;
  }>;

  audit_events: Array<{
    action: string;
    outcome: string;
    timestamp: string;
  }>;

  summary: {
    participant_records: number;
    sessions: number;
    notes: number;
    survey_entries: number;
    attributed_evidence: number;
    audit_events: number;
  };
}

// ─── Attribution-type payload extraction ─────────────────────────

const ATTRIBUTION_PAYLOAD_FIELDS: Record<string, string[]> = {
  direct_quote: ['verbatim_quote', 'text', 'quote'],
  paraphrase: ['paraphrase', 'summary'],
  observation: ['observation', 'behavior', 'note'],
  survey_response: ['response_text', 'entry_text'],
  behavioral_data: ['behavioral_data', 'task_completion'],
};

function extractAttributedContent(
  payload: Record<string, unknown> | null,
  attributionType: string,
): Record<string, unknown> | null {
  if (!payload) return null;

  const allowedFields = ATTRIBUTION_PAYLOAD_FIELDS[attributionType] || [];
  const participantFields = ['participant', 'participant_code', 'session'];

  const extracted: Record<string, unknown> = {};
  for (const field of [...allowedFields, ...participantFields]) {
    if (field in payload) {
      extracted[field] = payload[field];
    }
  }

  return Object.keys(extracted).length > 0 ? extracted : null;
}

// ─── Core export ─────────────────────────────────────────────────

/**
 * Export all data for a data subject.
 * Rooted on data_subject.public_id. FK-based traversal only.
 */
export async function exportSubjectData(
  subjectPublicId: string,
  projectId: number,
  requestedBy: string,
  db?: Sequelize,
): Promise<DSARExportPackage> {
  const m = models(db);
  const limitations: string[] = [];

  // Resolve subject
  const subject = await m.Subject.findOne({
    where: { public_id: subjectPublicId, project_id: projectId },
  });
  if (!subject) {
    throw new Error(`Data subject ${subjectPublicId} not found in project ${projectId}`);
  }

  if (subject.status === 'deleted') {
    limitations.push('Subject has been deleted. Export contains only tombstone and audit data.');
  }

  // Get project name
  const project = await m.db.models.Project?.findByPk(projectId);
  const projectName = (project as any)?.name ?? null;

  // ── Resolve all links ──
  const links = await m.Link.findAll({
    where: { data_subject_id: subject.id },
  });

  const participantLinks = links.filter(l => l.link_type === 'participant');
  const surveyLinks = links.filter(l => l.link_type === 'survey_respondent');

  // ── Participant records ──
  const participantRecords: DSARExportPackage['participant_records'] = [];
  const sessions: DSARExportPackage['sessions'] = [];
  const allNotes: DSARExportPackage['notes'] = [];

  for (const link of participantLinks) {
    if (!link.participant_id) continue;

    const participant = await m.Participant.findByPk(link.participant_id);
    if (!participant) {
      limitations.push(`Participant ${link.participant_id} referenced by link but not found (may have been deleted).`);
      continue;
    }

    const study = await m.Study.findByPk(participant.study_id);
    const studyName = study?.name ?? 'Unknown Study';

    participantRecords.push({
      study_name: studyName,
      participant_code: participant.participant_code,
      participant_name: participant.participant_name,
      demographics_info: participant.demographics_info,
      compensation_amount: participant.compensation_amount,
      recruitment_source: participant.recruitment_source,
      status: participant.status_select,
      outreach_history: {
        sent_at: participant.outreach_sent_at ? new Date(participant.outreach_sent_at as any).toISOString() : null,
        method: participant.outreach_method,
        count: participant.outreach_count ?? 0,
      },
      created_at: new Date(participant.created_at as any).toISOString(),
    });

    // Session data from participant record
    if (participant.scheduled_date || participant.scheduled_time) {
      const rawDate = participant.scheduled_date;
      const dateStr = rawDate instanceof Date
        ? rawDate.toISOString().split('T')[0]
        : (rawDate ? String(rawDate).split('T')[0] : null);
      sessions.push({
        study_name: studyName,
        participant_code: participant.participant_code,
        scheduled_date: dateStr,
        scheduled_time: participant.scheduled_time,
      });
    }

    // Notes linked to this participant
    const notes = await m.Notes.findAll({
      where: { participant_id: participant.id },
      order: [['created_at', 'DESC']],
    });

    for (const note of notes) {
      const hasContent = Boolean(note.pending_content);
      allNotes.push({
        note_id: note.id,
        study_name: studyName,
        filename: note.filename,
        content_available: hasContent,
        content: note.pending_content ?? null,
        pii_reviewed: note.pii_reviewed ?? false,
        created_at: new Date(note.created_at as any).toISOString(),
      });

      if (!hasContent && note.file_url) {
        // Content exists only in external artifact
        limitations.push(
          `Note ${note.id} (${note.filename}): content exists only in GitHub artifact. ` +
          `Canonical export cannot inline external content.`,
        );
      }
    }
  }

  // ── Survey responses ──
  const surveyResponses: DSARExportPackage['survey_responses'] = [];

  for (const link of surveyLinks) {
    if (!link.evidence_source_id || !link.respondent_key) continue;

    const source = await m.Source.findByPk(link.evidence_source_id);
    const sourceLabel = (source as any)?.label ?? 'Unknown Source';

    // Get ONLY this respondent's entries — no other respondent leakage
    const entries = await m.Entry.findAll({
      where: {
        evidence_source_id: link.evidence_source_id,
        respondent_key: link.respondent_key,
      },
      order: [['field_name', 'ASC'], ['id', 'ASC']],
    });

    if (entries.length > 0) {
      surveyResponses.push({
        source_label: sourceLabel,
        respondent_key: link.respondent_key,
        entries: entries.map(e => ({
          field_name: e.field_name,
          field_display_name: e.field_display_name,
          entry_text: e.entry_text,
          redacted_text: e.redacted_text,
          pii_status: e.pii_status,
        })),
      });
    }
  }

  // ── Attributed evidence (via evidence_subject_attributions) ──
  const attributions = await m.Attribution.findAll({
    where: { data_subject_id: subject.id },
    order: [['created_at', 'ASC']],
  });

  const attributedEvidence: DSARExportPackage['attributed_evidence'] = [];

  for (const attr of attributions) {
    const construct = await m.Construct.findByPk(attr.construct_id);
    if (!construct) continue;

    let sourceLabel: string | null = null;
    if (attr.evidence_source_id) {
      const source = await m.Source.findByPk(attr.evidence_source_id);
      sourceLabel = (source as any)?.label ?? null;
    }

    attributedEvidence.push({
      construct_public_id: construct.public_id,
      construct_type: construct.construct_type,
      attribution_type: attr.attribution_type,
      evidence_source_label: sourceLabel,
      attributed_content: extractAttributedContent(construct.payload, attr.attribution_type),
      construct_status: construct.status,
      stale_due_to_disposition: construct.stale_due_to_disposition,
    });
  }

  // ── Audit events ──
  const auditEvents = await m.AuditLog.findAll({
    where: { target_identifier: subjectPublicId },
    order: [['occurred_at', 'ASC']],
  });

  const auditEventRecords: DSARExportPackage['audit_events'] = auditEvents.map(e => ({
    action: e.action,
    outcome: e.outcome,
    timestamp: e.occurred_at.toISOString(),
  }));

  // ── Standard limitations ──
  limitations.push('GitHub artifacts (rendered documents, issues) are not included in this export.');
  limitations.push('Historical records that predate canonical subject attribution may not be fully represented.');

  return {
    export_metadata: {
      export_version: '2.0',
      generated_at: new Date().toISOString(),
      requested_by: requestedBy,
      data_subject_public_id: subjectPublicId,
      project_id: projectId,
      project_name: projectName,
      known_limitations: limitations,
    },
    participant_records: participantRecords,
    sessions,
    notes: allNotes,
    survey_responses: surveyResponses,
    attributed_evidence: attributedEvidence,
    audit_events: auditEventRecords,
    summary: {
      participant_records: participantRecords.length,
      sessions: sessions.length,
      notes: allNotes.length,
      survey_entries: surveyResponses.reduce((sum, s) => sum + s.entries.length, 0),
      attributed_evidence: attributedEvidence.length,
      audit_events: auditEventRecords.length,
    },
  };
}

// ─── Delivery ────────────────────────────────────────────────────

/**
 * Export subject data and deliver as a JSON file via Slack DM.
 *
 * @param subjectPublicId - The data subject's canonical UUID
 * @param projectId - Project scope
 * @param requestedBy - Slack user ID of the requester (must be project owner)
 * @param client - Slack WebClient for file upload and DM
 * @param db - Optional Sequelize instance (for tests)
 */
export async function exportAndDeliverSubjectData(
  subjectPublicId: string,
  projectId: number,
  requestedBy: string,
  client: WebClient,
  db?: Sequelize,
): Promise<DSARExportPackage> {
  // Authorization: project owner only
  await assertProjectOwner(requestedBy, projectId);

  // Generate export
  const exportPackage = await exportSubjectData(subjectPublicId, projectId, requestedBy, db);

  // Write to temp file
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const filename = `qori-dsar-${subjectPublicId}-${date}.json`;
  const tempPath = join(tmpdir(), `${randomUUID()}-${filename}`);

  try {
    writeFileSync(tempPath, JSON.stringify(exportPackage, null, 2), 'utf-8');

    // Upload via Slack file API to private DM
    await client.filesUploadV2({
      channel_id: requestedBy,
      filename,
      file: tempPath,
      title: `DSAR Export — ${subjectPublicId}`,
      initial_comment: `Data Subject Access Request export for subject \`${subjectPublicId}\`.\n\n` +
        `*Records:* ${exportPackage.summary.participant_records} participant(s), ` +
        `${exportPackage.summary.notes} note(s), ` +
        `${exportPackage.summary.survey_entries} survey entry(ies), ` +
        `${exportPackage.summary.attributed_evidence} evidence construct(s)\n\n` +
        `*Known limitations:* ${exportPackage.export_metadata.known_limitations.length}`,
    });
  } finally {
    // Always delete temp file — success or failure
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
  }

  // Audit log — IDs/counts only, no PII
  await logDispositionAction({
    action: 'export_subject' as any,
    record_type: 'data_subject',
    target_identifier: subjectPublicId,
    project_id: projectId,
    actor_user_id: requestedBy,
    authorization_basis: 'project_owner',
    outcome: 'success',
    records_affected: exportPackage.summary,
  });

  return exportPackage;
}
