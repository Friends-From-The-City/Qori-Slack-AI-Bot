/**
 * Projection Enrichment Service — PH-5C
 *
 * Enriches study_variables (cascade projection) items with canonical
 * evidence_construct refs after canonical evidence is persisted.
 *
 * Write order (enforced by callers):
 *   1. Model output → extraction → study_variables written
 *   2. Validate upstream refs → persist canonical constructs + relationships
 *   3. Obtain canonical public_ids
 *   4. Enrich projection items with evidence_construct_ref + status
 *
 * study_variables remains AUTHORITATIVE CASCADE PROJECTION (ADR 0033).
 * It is not lineage authority. Evidence refs are convenience metadata.
 *
 * If canonical persistence fails, no ref is fabricated.
 */

import { Op } from 'sequelize';
import sequelize from '../database';
import type { CreatedSynthesizedConstruct } from './synthesis-evidence.service';

function getStudyVariableModel() {
  return sequelize.models.StudyVariable;
}

/**
 * Enrich projected study_variable items with canonical evidence refs.
 *
 * For each created construct, finds the matching item in the variable's
 * value array by display_id and adds evidence_construct_ref + status.
 *
 * @param projectId - Project scope
 * @param studyId - Study scope
 * @param variableKey - The cascade variable key (e.g., 'validated_themes')
 * @param createdConstructs - Canonical constructs with displayId→publicId mapping
 */
export async function enrichProjectionWithEvidenceRefs(
  projectId: number,
  studyId: number,
  variableKey: string,
  createdConstructs: CreatedSynthesizedConstruct[],
): Promise<number> {
  if (createdConstructs.length === 0) return 0;

  const StudyVariable = getStudyVariableModel();
  if (!StudyVariable) return 0;

  // Build display_id → canonical ref mapping
  const refMap = new Map(
    createdConstructs.map(c => [c.displayId, c.publicId]),
  );

  // Load matching variable rows
  const rows = await StudyVariable.findAll({
    where: {
      project_id: projectId,
      study_id: studyId,
      variable_key: variableKey,
    },
  });

  let enrichedCount = 0;

  for (const row of rows) {
    const value = (row as unknown as { value: unknown }).value;
    if (!value || typeof value !== 'object') continue;

    let modified = false;

    // Handle array values (most common: array of items)
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          const displayId = (item as Record<string, unknown>).id as string | undefined;
          if (displayId && refMap.has(displayId)) {
            (item as Record<string, unknown>).evidence_construct_ref = refMap.get(displayId);
            (item as Record<string, unknown>).status = 'candidate';
            modified = true;
            enrichedCount++;
          }
        }
      }
    }
    // Handle single-object values
    else if (typeof value === 'object') {
      const displayId = (value as Record<string, unknown>).id as string | undefined;
      if (displayId && refMap.has(displayId)) {
        (value as Record<string, unknown>).evidence_construct_ref = refMap.get(displayId);
        (value as Record<string, unknown>).status = 'candidate';
        modified = true;
        enrichedCount++;
      }
    }

    if (modified) {
      // Sequelize JSONB update: set changed() to force save
      (row as unknown as { value: unknown; changed: (field: string, val: boolean) => void }).changed('value', true);
      await row.save();
    }
  }

  return enrichedCount;
}
