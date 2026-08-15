/**
 * Survey Schema Review Modal — dynamic modal for researcher confirmation
 * of inferred field roles.
 *
 * Modal contract (ADR 0031):
 *   DERIVES: inferred field schema from CSV parsing
 *   ASKS: field role corrections, ordinal category order, demographic flags
 *   COMMITS: confirmed field schema (survey_field_schemas)
 */

import type { SurveyField, SurveyFieldRole } from '../../../types/survey';

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
}

/**
 * Build a dynamic schema review modal from inferred fields.
 *
 * Each field gets a role dropdown and sample values context.
 * Ordinal fields show unique values for category order input.
 * Slack modal limit: 100 blocks — supports ~30 fields.
 */
export function buildSchemaReviewModal(
  fields: SurveyField[],
  meta: SchemaReviewMeta,
): Record<string, unknown> {
  const blocks: Record<string, unknown>[] = [
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Qori detected *${fields.length} fields* in your CSV. Review the inferred roles below and adjust if needed.\n\n• *Ordinal* fields will compute a median — confirm the category order after selection.\n• Mark fields as *demographic* if they describe respondent characteristics.`,
        },
      ],
    },
    { type: 'divider' },
  ];

  // Limit to ~30 fields (each uses ~3 blocks = 90 blocks max with header)
  const displayFields = fields.slice(0, 30);

  for (const field of displayFields) {
    // Sample values context
    const sampleText = field.sampleValues.length > 0
      ? `Sample: ${field.sampleValues.slice(0, 3).join(', ')}  |  ${field.presentCount} present, ${field.missingCount} missing`
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

  if (fields.length > 30) {
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `_${fields.length - 30} additional fields will use their inferred roles._`,
      }],
    });
  }

  return {
    type: 'modal',
    callback_id: 'survey_schema_review_modal',
    private_metadata: JSON.stringify(meta),
    title: { type: 'plain_text', text: 'Review Survey Schema' },
    submit: { type: 'plain_text', text: 'Confirm & Analyze' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks,
  };
}

/**
 * Parse confirmed field roles from the schema review modal submission.
 */
export function parseSchemaReviewValues(
  values: Record<string, Record<string, Record<string, unknown>>>,
  originalFields: SurveyField[],
): Array<{ fieldName: string; confirmedRole: SurveyFieldRole; isDemographic: boolean }> {
  return originalFields.map(field => {
    const roleBlock = values[`field_role_${field.fieldName}`];
    const demoBlock = values[`field_demo_${field.fieldName}`];

    const selectedOption = roleBlock?.role_select?.selected_option as { value: string } | null | undefined;
    const confirmedRole = (selectedOption?.value as SurveyFieldRole) ?? field.inferredRole;

    const selectedOptions = demoBlock?.demo_check?.selected_options as Array<{ value: string }> | undefined;
    const isDemographic = selectedOptions?.some(o => o.value === 'demographic') ?? false;

    return { fieldName: field.fieldName, confirmedRole, isDemographic };
  });
}
