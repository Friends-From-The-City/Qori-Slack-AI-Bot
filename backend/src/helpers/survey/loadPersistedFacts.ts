/**
 * Load Persisted Facts — reconstruct SurveyComputedFacts from canonical
 * evidence constructs stored during persistSurveyFoundation().
 *
 * After Redis deletion, the raw CSV is gone. Structured facts live in
 * evidence_constructs: survey_dataset_summary, field_distribution, cross_tab.
 *
 * This function loads those constructs and rebuilds a SurveyComputedFacts
 * object identical to what was originally computed (deterministic invariant).
 */

import type { SurveyComputedFacts, FieldStat, FieldStatSummary, CrossTab } from '../../types/survey';

interface EvidenceConstructRecord {
  construct_type: string;
  payload: Record<string, unknown> | null;
}

/**
 * Reconstruct SurveyComputedFacts from persisted evidence constructs.
 *
 * @param constructs — evidence constructs for the survey source
 * @returns SurveyComputedFacts or null if summary construct not found
 */
export function loadPersistedFacts(
  constructs: EvidenceConstructRecord[],
): SurveyComputedFacts | null {
  // Find the dataset summary
  const summary = constructs.find(c => c.construct_type === 'survey_dataset_summary');
  if (!summary?.payload) return null;

  const totalRespondents = summary.payload.total_respondents as number;
  const schemaSummary = (summary.payload.schema_summary as FieldStatSummary[]) ?? [];
  const nonresponseLimitation = (summary.payload.nonresponse_limitation as string) ?? '';
  const sourceContentHash = (summary.payload.source_content_hash as string) ?? '';

  // Load field distributions
  const fieldStats: FieldStat[] = constructs
    .filter(c => c.construct_type === 'field_distribution' && c.payload)
    .map(c => c.payload as unknown as FieldStat);

  // Load cross-tabs
  const crossTabs: CrossTab[] = constructs
    .filter(c => c.construct_type === 'cross_tab' && c.payload)
    .map(c => c.payload as unknown as CrossTab);

  return {
    sourceContentHash,
    totalRespondents,
    schemaSummary,
    fieldStats,
    crossTabs,
    nonresponseLimitation,
  };
}
