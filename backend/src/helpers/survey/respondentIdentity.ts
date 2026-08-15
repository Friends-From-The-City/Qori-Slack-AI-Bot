/**
 * Respondent Identity — stable identification for survey respondents.
 *
 * Identity precedence:
 *   1. Researcher-declared ID field (confirmed_role = 'id')
 *   2. Generated stable key: SHA-256(source_content_hash + row_index)
 *
 * Generated identity is deterministic for identical source content
 * regardless of which evidence_source record holds it. It does NOT
 * depend on evidence_source.public_id (which can change across records).
 *
 * Human-facing labels (R001, R002) map to canonical keys but are NOT identity.
 */

import { createHash } from 'crypto';
import type { ParsedSurvey, ConfirmedField, RespondentIdentity } from '../../types/survey';

export class DuplicateRespondentIdError extends Error {
  constructor(
    public readonly duplicateValue: string,
    public readonly rowIndices: number[],
  ) {
    super(`Duplicate respondent ID "${duplicateValue}" found at rows ${rowIndices.map(i => i + 2).join(', ')}`);
    this.name = 'DuplicateRespondentIdError';
  }
}

/**
 * Assign canonical respondent identities to all survey rows.
 *
 * @param survey — parsed survey data
 * @param confirmedFields — researcher-confirmed field schema
 * @param sourceContentHash — SHA-256 of raw CSV content (for generated keys)
 * @returns One RespondentIdentity per row, in order
 * @throws DuplicateRespondentIdError if declared ID field has duplicates
 */
export function assignRespondentIdentities(
  survey: ParsedSurvey,
  confirmedFields: ConfirmedField[],
  sourceContentHash: string,
): RespondentIdentity[] {
  const idField = confirmedFields.find(f => f.confirmedRole === 'id');

  if (idField) {
    return assignFromDeclaredId(survey, idField.fieldName);
  }

  return assignGeneratedKeys(survey, sourceContentHash);
}

function assignFromDeclaredId(
  survey: ParsedSurvey,
  idFieldName: string,
): RespondentIdentity[] {
  // Check for duplicates
  const valuesToIndices = new Map<string, number[]>();
  for (const row of survey.rows) {
    const value = row.values[idFieldName]?.trim() || '';
    if (!value) continue;
    const existing = valuesToIndices.get(value) ?? [];
    existing.push(row.rowIndex);
    valuesToIndices.set(value, existing);
  }

  for (const [value, indices] of valuesToIndices) {
    if (indices.length > 1) {
      throw new DuplicateRespondentIdError(value, indices);
    }
  }

  return survey.rows.map((row, i) => {
    const declaredId = row.values[idFieldName]?.trim() || '';
    return {
      canonicalKey: declaredId || generateKey(sourceContentHashPlaceholder, row.rowIndex),
      // When a declared ID exists and is safe to display, preserve it as the
      // display label. Do not silently replace source IDs with aliases.
      displayLabel: declaredId || `R${String(i + 1).padStart(3, '0')}`,
      source: declaredId ? 'declared' as const : 'generated' as const,
      rowIndex: row.rowIndex,
    };
  });
}

// Placeholder — only used when a declared ID row has an empty value
const sourceContentHashPlaceholder = 'no-declared-id-fallback';

function assignGeneratedKeys(
  survey: ParsedSurvey,
  sourceContentHash: string,
): RespondentIdentity[] {
  return survey.rows.map((row, i) => ({
    canonicalKey: generateKey(sourceContentHash, row.rowIndex),
    displayLabel: `R${String(i + 1).padStart(3, '0')}`,
    source: 'generated' as const,
    rowIndex: row.rowIndex,
  }));
}

/**
 * Generate a stable deterministic respondent key.
 * SHA-256(source_content_hash + ":" + row_index)
 * Truncated to 16 hex chars for readability while retaining uniqueness.
 */
function generateKey(sourceContentHash: string, rowIndex: number): string {
  return createHash('sha256')
    .update(`${sourceContentHash}:${rowIndex}`)
    .digest('hex')
    .slice(0, 16);
}
