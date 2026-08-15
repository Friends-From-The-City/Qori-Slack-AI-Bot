/**
 * Qualitative Entry Writer — persist normalized governed open-text entries.
 *
 * One row per respondent × open-text field. All entries begin as
 * pii_status='pending'. Raw text is governed — accessible only via
 * the content governance service's authorized review path.
 *
 * Auto-scrub applied at ingestion using existing piiRedaction infrastructure.
 * Result stored in redacted_text. Original stored in entry_text.
 *
 * Idempotent: UNIQUE(evidence_source_id, respondent_key, field_name)
 * prevents duplicates on reprocessing.
 */

import { createHash } from 'crypto';
import type { Transaction, CreationAttributes } from 'sequelize';
import type { ParsedSurvey, ConfirmedField, RespondentIdentity } from '../../types/survey';
import type { SurveyQualitativeEntry } from '../../database/models/survey_qualitative_entry';
import { toDisplayLabel } from './displayLabels';
import { scrubEntryText, verifyRedactionConsistency } from './entryScrubber';

export interface QualitativeEntryInput {
  evidenceSourceId: number;
  projectId: number;
  studyId: number | null;
}

/**
 * Build qualitative entry records from a parsed survey.
 *
 * Filters for open_text fields, creates one entry per respondent × field
 * with non-empty content. All entries start as pii_status='pending'.
 *
 * @param survey — parsed CSV data
 * @param confirmedFields — researcher-confirmed schema
 * @param identities — assigned respondent identities
 * @param ctx — FK context (evidence source, project, study)
 * @returns Array of creation attributes ready for bulkCreate
 */
export function buildQualitativeEntries(
  survey: ParsedSurvey,
  confirmedFields: ConfirmedField[],
  identities: RespondentIdentity[],
  ctx: QualitativeEntryInput,
): CreationAttributes<SurveyQualitativeEntry>[] {
  const openTextFields = confirmedFields.filter(f => f.confirmedRole === 'open_text');
  if (openTextFields.length === 0) return [];

  const entries: CreationAttributes<SurveyQualitativeEntry>[] = [];

  for (let i = 0; i < survey.rows.length; i++) {
    const row = survey.rows[i];
    const identity = identities[i];

    for (const field of openTextFields) {
      const text = row.values[field.fieldName]?.trim() ?? '';
      if (text === '') continue; // skip empty entries

      const entryHash = createHash('sha256').update(text).digest('hex');

      // Apply deterministic scrubbing (phone/email patterns)
      const scrubResult = scrubEntryText(text);
      const isConsistent = verifyRedactionConsistency(
        scrubResult.scrubbedText, scrubResult.detectedValues,
      );

      entries.push({
        evidence_source_id: ctx.evidenceSourceId,
        project_id: ctx.projectId,
        study_id: ctx.studyId,
        respondent_key: identity.canonicalKey,
        display_respondent_id: identity.displayLabel,
        field_name: field.fieldName,
        field_display_name: toDisplayLabel(field.fieldName),
        entry_text: text,
        entry_hash: entryHash,
        pii_status: 'pending',
        redacted_text: scrubResult.scrubbedText,
        source_row_index: row.rowIndex,
        metadata: {
          auto_scrub: {
            has_detections: scrubResult.hasDetections,
            phone_count: scrubResult.detections.phoneCount,
            email_count: scrubResult.detections.emailCount,
            is_consistent: isConsistent,
          },
        },
      } as CreationAttributes<SurveyQualitativeEntry>);
    }
  }

  return entries;
}

/**
 * Persist qualitative entries within a transaction.
 * Uses ignoreDuplicates for idempotency on reprocessing.
 */
export async function persistQualitativeEntries(
  model: typeof SurveyQualitativeEntry,
  entries: CreationAttributes<SurveyQualitativeEntry>[],
  transaction: Transaction,
): Promise<number> {
  if (entries.length === 0) return 0;

  const result = await model.bulkCreate(entries, {
    transaction,
    ignoreDuplicates: true, // UNIQUE constraint handles idempotency
  });

  return result.length;
}
