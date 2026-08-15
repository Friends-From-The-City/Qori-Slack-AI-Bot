/**
 * Survey Schema Review Modal — dynamic modal for researcher confirmation
 * of inferred field roles.
 *
 * Corrections applied:
 * - Ordinal fields show a plain_text_input for explicit category order
 * - ALL fields must be reviewed — no unreviewed inference becomes authoritative
 * - Multi-page review for >20 fields (20 fields per page)
 * - Fail closed: if field count exceeds supported limit, tell researcher to reduce
 *
 * Modal contract (ADR 0031):
 *   DERIVES: inferred field schema from CSV parsing
 *   ASKS: field role corrections, ordinal order, demographic flags
 *   COMMITS: confirmed field schema (survey_field_schemas)
 */

import type { SurveyField, SurveyFieldRole } from '../../../types/survey';
import { suggestOrdinalOrder } from '../../survey/ordinalSuggestions';
import { toDisplayLabel } from '../../survey/displayLabels';

/** Maximum fields per modal page (Slack limit ~100 blocks; 4 blocks per field = 25 max). */
const FIELDS_PER_PAGE = 20;
/** Maximum supported fields total (5 pages × 20 = 100 fields). */
const MAX_SUPPORTED_FIELDS = 100;

const ROLE_OPTIONS: Array<{ text: string; value: SurveyFieldRole }> = [
  { text: 'ID (Respondent identifier)', value: 'id' },
  { text: 'Nominal (Unordered category)', value: 'nominal' },
  { text: 'Ordinal (Ordered scale)', value: 'ordinal' },
  { text: 'Continuous (Numeric)', value: 'continuous' },
  { text: 'Multi-select', value: 'multi_select' },
  { text: 'Open text', value: 'open_text' },
  { text: 'Timestamp', value: 'timestamp' },
];

export interface SchemaReviewMeta {
  evidenceSourceId: number;
  projectId: number;
  projectSlug: string;
  channelId: string;
  topic: string;
  topicSlug: string;
  surveyName: string;
  questionFocus: string;
  sourceIntent: string;
  /** Original uploaded filename — preserved for provenance. */
  originalFilename: string;
  /** Current page (0-based). */
  page: number;
  /** Total number of fields. */
  totalFields: number;
}

/**
 * Check if a survey's field count is supported for complete review.
 * Returns an error message if too many fields, null if OK.
 */
export function checkFieldCountSupported(fieldCount: number): string | null {
  if (fieldCount > MAX_SUPPORTED_FIELDS) {
    return `Your CSV has ${fieldCount} columns, which exceeds the ${MAX_SUPPORTED_FIELDS}-column limit for schema review. Please reduce the number of columns or split the survey into smaller files.`;
  }
  return null;
}

/**
 * Get total number of pages needed for complete schema review.
 */
export function getTotalPages(fieldCount: number): number {
  return Math.ceil(fieldCount / FIELDS_PER_PAGE);
}

/**
 * Build a schema review modal page showing a subset of fields.
 *
 * Each field gets: sample values context, role dropdown, demographic checkbox.
 * Ordinal fields also get a plain_text_input for category order confirmation.
 *
 * If not the last page, submit button says "Continue →" instead of "Confirm & Analyze".
 */
export function buildSchemaReviewModal(
  allFields: SurveyField[],
  meta: SchemaReviewMeta,
): Record<string, unknown> {
  const page = meta.page;
  const totalPages = getTotalPages(allFields.length);
  const startIdx = page * FIELDS_PER_PAGE;
  const endIdx = Math.min(startIdx + FIELDS_PER_PAGE, allFields.length);
  const pageFields = allFields.slice(startIdx, endIdx);
  const isLastPage = endIdx >= allFields.length;

  const blocks: Record<string, unknown>[] = [
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: totalPages > 1
            ? `Page ${page + 1} of ${totalPages} — reviewing fields ${startIdx + 1}–${endIdx} of ${allFields.length}.\n\n*All fields must be reviewed before analysis can proceed.*`
            : `Reviewing all *${allFields.length} fields*. Confirm roles below.\n\n• *Ordinal* fields: enter the category order (low → high) separated by |\n• Mark *demographic* fields that describe respondent characteristics.`,
        },
      ],
    },
    { type: 'divider' },
  ];

  for (const field of pageFields) {
    // Sample values context
    const sampleText = field.sampleValues.length > 0
      ? `Sample: ${field.sampleValues.slice(0, 3).join(', ')}  |  ${field.presentCount}/${field.presentCount + field.missingCount} present`
      : `${field.presentCount} present, ${field.missingCount} missing`;

    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `*${field.fieldName}* — ${sampleText}` }],
    });

    // Role selector
    blocks.push({
      type: 'input',
      block_id: `field_role_${field.fieldName}`,
      label: { type: 'plain_text', text: `Role for "${field.fieldName}"` },
      element: {
        type: 'static_select',
        action_id: 'role_select',
        initial_option: {
          text: { type: 'plain_text', text: ROLE_OPTIONS.find(o => o.value === field.inferredRole)?.text ?? 'Nominal' },
          value: field.inferredRole,
        },
        options: ROLE_OPTIONS.map(o => ({
          text: { type: 'plain_text', text: o.text },
          value: o.value,
        })),
      },
    });

    // Ordinal category order input (shown for fields inferred as ordinal)
    if (field.inferredRole === 'ordinal') {
      const suggestion = suggestOrdinalOrder(field.sampleValues);
      const suggestedValue = suggestion.suggestedOrder
        ? suggestion.suggestedOrder.join(' | ')
        : '';
      const hintText = suggestion.suggestedOrder
        ? 'Qori suggested this order. Please verify or edit it.'
        : 'No safe category order could be inferred. Enter values from low → high.';
      blocks.push({
        type: 'input',
        block_id: `field_order_${field.fieldName}`,
        optional: true,
        label: { type: 'plain_text', text: `Category order — required for ordered statistics ("${toDisplayLabel(field.fieldName)}")` },
        hint: { type: 'plain_text', text: hintText },
        element: {
          type: 'plain_text_input',
          action_id: 'order_input',
          placeholder: {
            type: 'plain_text',
            text: 'e.g., Very Difficult | Difficult | Neutral | Easy | Very Easy',
          },
          ...(suggestedValue ? { initial_value: suggestedValue } : {}),
        },
      });
    }

    // Demographic checkbox
    blocks.push({
      type: 'input',
      block_id: `field_demo_${field.fieldName}`,
      optional: true,
      label: { type: 'plain_text', text: ' ' },
      element: {
        type: 'checkboxes',
        action_id: 'demo_check',
        options: [
          {
            text: { type: 'plain_text', text: 'This is a demographic field' },
            value: 'demographic',
          },
        ],
      },
    });
  }

  return {
    type: 'modal',
    callback_id: 'survey_schema_review_modal',
    private_metadata: JSON.stringify(meta),
    title: { type: 'plain_text', text: totalPages > 1 ? `Schema (${page + 1}/${totalPages})` : 'Review Survey Schema' },
    submit: { type: 'plain_text', text: isLastPage ? 'Confirm & Analyze' : 'Continue →' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks,
  };
}

export class OrdinalOrderValidationError extends Error {
  constructor(
    message: string,
    public readonly fieldName: string,
  ) {
    super(message);
    this.name = 'OrdinalOrderValidationError';
  }
}

/**
 * Parse confirmed field roles from one page of the schema review modal.
 * Validates ordinal category order.
 *
 * @throws OrdinalOrderValidationError if ordinal order is incomplete or has duplicates
 */
export function parseSchemaReviewValues(
  values: Record<string, Record<string, Record<string, unknown>>>,
  pageFields: SurveyField[],
  allFieldValues: Map<string, string[]>,
): Array<{ fieldName: string; confirmedRole: SurveyFieldRole; isDemographic: boolean; orderMetadata: string[] | null }> {
  return pageFields.map(field => {
    const roleBlock = values[`field_role_${field.fieldName}`];
    const demoBlock = values[`field_demo_${field.fieldName}`];
    const orderBlock = values[`field_order_${field.fieldName}`];

    const selectedOption = roleBlock?.role_select?.selected_option as { value: string } | null | undefined;
    const confirmedRole = (selectedOption?.value as SurveyFieldRole) ?? field.inferredRole;

    const selectedOptions = demoBlock?.demo_check?.selected_options as Array<{ value: string }> | undefined;
    const isDemographic = selectedOptions?.some(o => o.value === 'demographic') ?? false;

    // Parse ordinal order if role is ordinal
    let orderMetadata: string[] | null = null;
    if (confirmedRole === 'ordinal') {
      const orderValue = orderBlock?.order_input?.value as string | undefined;
      if (orderValue && orderValue.trim()) {
        const categories = orderValue.split('|').map(c => c.trim()).filter(c => c !== '');
        // Validate: no duplicates
        const uniqueCategories = new Set(categories.map(c => c.toLowerCase()));
        if (uniqueCategories.size !== categories.length) {
          throw new OrdinalOrderValidationError(
            `Duplicate categories in order for "${field.fieldName}". Each category must appear exactly once.`,
            field.fieldName,
          );
        }
        // Validate: all observed values represented
        const observedValues = allFieldValues.get(field.fieldName) ?? [];
        const orderLower = new Set(categories.map(c => c.toLowerCase()));
        const missing = observedValues.filter(v => !orderLower.has(v.toLowerCase()));
        if (missing.length > 0) {
          throw new OrdinalOrderValidationError(
            `Category order for "${field.fieldName}" is incomplete. Missing observed values: ${missing.join(', ')}`,
            field.fieldName,
          );
        }

        orderMetadata = categories;
      }
      // If no order provided for ordinal field, orderMetadata stays null
      // → stats engine will NOT compute median (fail closed per correction 1)
    }

    return { fieldName: field.fieldName, confirmedRole, isDemographic, orderMetadata };
  });
}
