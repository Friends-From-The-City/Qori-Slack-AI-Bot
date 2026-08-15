/**
 * Survey Submission Handler — two-phase survey ingestion.
 *
 * Phase 1 (handleSurveyUploadPhase):
 *   CSV upload → parse → infer schema → create evidence_source →
 *   stage raw CSV in Redis (TTL 2h) → send DM with "Review Schema" button
 *
 * Phase 2 (handleSurveySchemaConfirmation):
 *   Schema review modal page(s) → researcher confirms ALL fields →
 *   read CSV from Redis → compute deterministic stats →
 *   create evidence constructs + lineage → inject computed facts
 *   into template → render → delete Redis staging
 *
 * Per ADR 0028: all statistics computed in code, never by LLM.
 * Per ADR 0029: evidence entities created for canonical state.
 *
 * Corrections applied:
 * - Ordinal fields require explicit category order confirmation
 * - ALL fields must be reviewed (paginated modal or fail closed)
 * - Raw CSV staged in Redis with TTL, not in Postgres
 */

import type {
  SlackActionMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackViewMiddlewareArgs,
  ViewSubmitAction,
  AllMiddlewareArgs,
} from '@slack/bolt';
import type { View } from '@slack/types';
import type { CreationAttributes } from 'sequelize';
import sequelize from '../../../database';
import type { EvidenceSource } from '../../../database/models/evidence_source';
import type { SurveyFieldSchema } from '../../../database/models/survey_field_schema';
import type { ConfirmedField, SurveyField } from '../../../types/survey';
import {
  parseCsvBuffer,
  CsvParseError,
  computeContentHash,
  inferFieldSchema,
  computeSurveyFacts,
  extractOpenTextContent,
  assignRespondentIdentities,
  getUniqueValues,
  stagePendingCsv,
  getPendingCsv,
  deletePendingCsv,
} from '../../survey';
import {
  buildSchemaReviewModal,
  parseSchemaReviewValues,
  checkFieldCountSupported,
  getTotalPages,
  OrdinalOrderValidationError,
  type SchemaReviewMeta,
} from '../ui/surveySchemaReviewModal';
import { processSlackFile } from '../../pdfProcessor';
import { createSourceToConstruct } from '../../../services/evidence.service';
import { fetchFileFromRepo, getConfigRepo, YAML_TEMPLATE_PATH } from '../../github';
import { processYamlTemplate } from '../../yamlProcessor';
import { getProjectById } from '../../../services/project.service';
import { format } from 'date-fns';

// Models
const EvidenceSourceModel = sequelize.models.EvidenceSource as typeof EvidenceSource;
const EvidenceConstructModel = sequelize.models.EvidenceConstruct;
const SurveyFieldSchemaModel = sequelize.models.SurveyFieldSchema as typeof SurveyFieldSchema;

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

interface SurveyUploadContext {
  userId: string;
  projectId: number;
  projectSlug: string;
  channelId: string;
  topic: string;
  topicSlug: string;
  surveyName: string;
  questionFocus: string;
  sourceIntent: string;
  uploadedFiles: Array<{ id: string; name: string; mimetype: string; url: string }>;
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 1: Upload → Parse → Infer → Stage in Redis → DM with Button
// ═══════════════════════════════════════════════════════════════════════

export async function handleSurveyUploadPhase(
  ctx: SurveyUploadContext,
  client: AllMiddlewareArgs['client'],
): Promise<void> {
  const { userId, projectId, projectSlug, channelId, topic, topicSlug, surveyName, questionFocus, sourceIntent, uploadedFiles } = ctx;

  const csvFile = uploadedFiles.find(f => f.name.toLowerCase().endsWith('.csv'));
  if (!csvFile) {
    await client.chat.postMessage({
      channel: userId,
      text: '❌ No CSV file found in upload. Please upload a .csv file.',
    });
    return;
  }

  await client.chat.postMessage({
    channel: userId,
    text: `Parsing survey CSV "${csvFile.name}"...`,
  });

  let rawContent: string;
  try {
    rawContent = await processSlackFile(csvFile.url, process.env.SLACK_BOT_TOKEN!, 'text/csv');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await client.chat.postMessage({
      channel: userId,
      text: `❌ Failed to download survey file: ${message}`,
    });
    return;
  }

  let survey;
  try {
    survey = parseCsvBuffer(rawContent, csvFile.name);
  } catch (err) {
    if (err instanceof CsvParseError) {
      await client.chat.postMessage({
        channel: userId,
        text: `❌ CSV parse error: ${err.message}`,
      });
      return;
    }
    throw err;
  }

  // Check field count is supported for complete review
  const fieldCountError = checkFieldCountSupported(survey.headers.length);
  if (fieldCountError) {
    await client.chat.postMessage({
      channel: userId,
      text: `❌ ${fieldCountError}`,
    });
    return;
  }

  const contentHash = computeContentHash(rawContent);

  // Check for existing source with same content hash for reuse
  const existingSource = await EvidenceSourceModel.findOne({
    where: { project_id: projectId, source_type: 'survey_dataset' },
  });

  let existingHash: string | null = null;
  if (existingSource) {
    const ref = existingSource.artifact_ref as Record<string, unknown> | null;
    existingHash = ref?.content_hash as string | null;
  }

  if (existingSource && existingHash === contentHash) {
    const confirmedSchemas = await SurveyFieldSchemaModel.findAll({
      where: { evidence_source_id: existingSource.id, review_status: 'confirmed' },
    });
    const pendingCount = await SurveyFieldSchemaModel.count({
      where: { evidence_source_id: existingSource.id, review_status: 'pending' },
    });

    // Reuse ONLY when schema is complete: all fields confirmed, none pending
    const isCompleteAccepted = confirmedSchemas.length > 0
      && pendingCount === 0
      && confirmedSchemas.length === survey.headers.length;

    if (isCompleteAccepted) {
      await client.chat.postMessage({
        channel: userId,
        text: '✅ Same survey file detected (content hash match). Reusing accepted schema and recomputing statistics...',
      });

      const confirmedFields: ConfirmedField[] = confirmedSchemas.map((s: SurveyFieldSchema) => ({
        fieldName: s.field_name,
        confirmedRole: s.confirmed_role!,
        orderMetadata: s.order_metadata,
        isDemographic: s.is_demographic,
      }));

      await executeSurveyAnalysis(
        survey, confirmedFields, contentHash, existingSource.id,
        { userId, projectId, projectSlug, channelId, topic, topicSlug, surveyName, questionFocus, sourceIntent },
        client,
      );
      return;
    }
  }

  // Create evidence_source
  const evidenceSource = await EvidenceSourceModel.create({
    project_id: projectId,
    study_id: null,
    source_type: 'survey_dataset',
    label: `${surveyName} — ${csvFile.name}`,
    artifact_ref: {
      filename: csvFile.name,
      content_hash: contentHash,
      slack_file_id: csvFile.id,
    },
    metadata: {
      row_count: survey.rowCount,
      column_count: survey.headers.length,
      headers: survey.headers,
      parse_warnings: survey.parseWarnings,
    },
    created_by: userId,
  } as CreationAttributes<EvidenceSource>);

  // Infer field schema
  const inferredFields = inferFieldSchema(survey);

  // Persist inferred fields
  await sequelize.transaction(async (t) => {
    for (const field of inferredFields) {
      await SurveyFieldSchemaModel.create({
        evidence_source_id: evidenceSource.id,
        field_name: field.fieldName,
        inferred_role: field.inferredRole,
        inference_source: 'heuristic',
        review_status: 'pending',
      } as CreationAttributes<SurveyFieldSchema>, { transaction: t });
    }
  });

  // Stage raw CSV in Redis with TTL (2 hours)
  await stagePendingCsv(projectId, evidenceSource.public_id, userId, rawContent);

  const summaryLines = inferredFields.map(f =>
    `• *${f.fieldName}* → ${f.inferredRole} (${f.presentCount}/${survey.rowCount} present)`
  );

  const totalPages = getTotalPages(inferredFields.length);

  const meta: SchemaReviewMeta = {
    evidenceSourceId: evidenceSource.id,
    projectId, projectSlug, channelId,
    topic, topicSlug, surveyName, questionFocus, sourceIntent,
    page: 0,
    totalFields: inferredFields.length,
  };

  await client.chat.postMessage({
    channel: userId,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📊 *Survey parsed:* ${survey.rowCount} respondents, ${survey.headers.length} fields\n\n*Inferred field roles:*\n${summaryLines.join('\n')}`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: totalPages > 1
            ? `Review all fields across ${totalPages} pages before analysis proceeds. Ordinal fields need category order confirmation.`
            : 'Review and confirm field roles before analysis proceeds. Ordinal fields need category order confirmation.',
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'Review & Confirm Schema' },
          style: 'primary',
          action_id: 'survey_review_schema',
          value: JSON.stringify(meta),
        },
      },
    ],
    text: `Survey parsed: ${survey.rowCount} respondents, ${survey.headers.length} fields. Click "Review & Confirm Schema" to proceed.`,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// SCHEMA REVIEW BUTTON → Open Modal (page 0)
// ═══════════════════════════════════════════════════════════════════════

export async function handleSurveySchemaReviewAction(
  args: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, action, client, body } = args;
  await ack();

  const meta: SchemaReviewMeta = JSON.parse(action.value || '{}');

  const fieldSchemas = await SurveyFieldSchemaModel.findAll({
    where: { evidence_source_id: meta.evidenceSourceId },
    order: [['id', 'ASC']],
  });

  if (fieldSchemas.length === 0) {
    await client.chat.postMessage({
      channel: body.user.id,
      text: '❌ Survey schema not found. The upload may have expired. Please re-upload via `/qori-discover`.',
    });
    return;
  }

  // Load the parsed survey to get sample values for the modal
  const pendingCsv = await getPendingCsv(meta.projectId, '', body.user.id);
  // Try with source public_id
  const source = await EvidenceSourceModel.findByPk(meta.evidenceSourceId);
  const sourcePublicId = source ? source.public_id : '';
  const csvContent = await getPendingCsv(meta.projectId, sourcePublicId, body.user.id);

  let fields: SurveyField[];
  if (csvContent) {
    try {
      const survey = parseCsvBuffer(csvContent, 'staged-csv');
      fields = inferFieldSchema(survey);
    } catch {
      fields = fieldSchemas.map((s: SurveyFieldSchema) => ({
        fieldName: s.field_name,
        inferredRole: s.inferred_role,
        sampleValues: [],
        distinctCount: 0,
        presentCount: 0,
        missingCount: 0,
      }));
    }
  } else {
    // CSV expired from Redis
    await client.chat.postMessage({
      channel: body.user.id,
      text: '❌ Survey data has expired (2-hour staging window). Please re-upload via `/qori-discover`.',
    });
    return;
  }

  meta.page = 0;
  meta.totalFields = fields.length;
  const modal = buildSchemaReviewModal(fields, meta);

  await client.views.open({
    trigger_id: body.trigger_id,
    view: modal as unknown as View,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 2: Schema Confirmation (paginated) → Compute → Evidence → Render
// ═══════════════════════════════════════════════════════════════════════

export async function handleSurveySchemaConfirmation(
  args: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, view, body, client } = args;
  await ack();

  const meta: SchemaReviewMeta = JSON.parse(view.private_metadata || '{}');
  const userId = body.user.id;

  // Load source for Redis key
  const source = await EvidenceSourceModel.findByPk(meta.evidenceSourceId);
  if (!source) {
    await client.chat.postMessage({
      channel: userId,
      text: '❌ Survey source not found. Please re-upload via `/qori-discover`.',
    });
    return;
  }

  // Load field schemas
  const allFieldSchemas = await SurveyFieldSchemaModel.findAll({
    where: { evidence_source_id: meta.evidenceSourceId },
    order: [['id', 'ASC']],
  });

  if (allFieldSchemas.length === 0) {
    await client.chat.postMessage({
      channel: userId,
      text: '❌ Survey schema expired. Please re-upload via `/qori-discover`.',
    });
    return;
  }

  // Read CSV from Redis to get field values for ordinal order validation
  const csvContent = await getPendingCsv(meta.projectId, source.public_id, userId);
  if (!csvContent) {
    await client.chat.postMessage({
      channel: userId,
      text: '❌ Survey data has expired (2-hour staging window). Please re-upload via `/qori-discover`.',
    });
    return;
  }

  let survey;
  try {
    survey = parseCsvBuffer(csvContent, 'staged-csv');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await client.chat.postMessage({
      channel: userId,
      text: `❌ Error re-parsing staged CSV: ${message}`,
    });
    return;
  }

  // Get current page's fields
  const FIELDS_PER_PAGE = 20;
  const startIdx = meta.page * FIELDS_PER_PAGE;
  const endIdx = Math.min(startIdx + FIELDS_PER_PAGE, allFieldSchemas.length);
  const pageFieldSchemas = allFieldSchemas.slice(startIdx, endIdx);
  const isLastPage = endIdx >= allFieldSchemas.length;

  const pageFields: SurveyField[] = pageFieldSchemas.map((s: SurveyFieldSchema) => {
    const fieldValues = survey.rows.map(r => r.values[s.field_name]?.trim() ?? '').filter(v => v !== '');
    return {
      fieldName: s.field_name,
      inferredRole: s.inferred_role,
      sampleValues: [...new Set(fieldValues)].slice(0, 5),
      distinctCount: new Set(fieldValues).size,
      presentCount: fieldValues.length,
      missingCount: survey.rowCount - fieldValues.length,
    };
  });

  // Build map of all field values for ordinal order validation
  const allFieldValues = new Map<string, string[]>();
  for (const s of allFieldSchemas) {
    const vals = survey.rows.map(r => r.values[s.field_name]?.trim() ?? '').filter(v => v !== '');
    allFieldValues.set(s.field_name, [...new Set(vals)]);
  }

  // Parse confirmed roles from this page
  let pageResults;
  try {
    pageResults = parseSchemaReviewValues(
      view.state.values as unknown as Record<string, Record<string, Record<string, unknown>>>,
      pageFields,
      allFieldValues,
    );
  } catch (err) {
    if (err instanceof OrdinalOrderValidationError) {
      await client.chat.postMessage({
        channel: userId,
        text: `❌ ${err.message}`,
      });
      return;
    }
    throw err;
  }

  // Persist this page's confirmed fields
  await sequelize.transaction(async (t) => {
    for (const result of pageResults) {
      await SurveyFieldSchemaModel.update(
        {
          confirmed_role: result.confirmedRole,
          order_metadata: result.orderMetadata,
          is_demographic: result.isDemographic,
          review_status: 'confirmed',
          reviewed_by: userId,
          reviewed_at: new Date(),
        },
        {
          where: {
            evidence_source_id: meta.evidenceSourceId,
            field_name: result.fieldName,
          },
          transaction: t,
        },
      );
    }
  });

  // If not last page, open next page
  if (!isLastPage) {
    const allFields = inferFieldSchema(survey);
    const nextMeta = { ...meta, page: meta.page + 1 };
    const nextModal = buildSchemaReviewModal(allFields, nextMeta);

    await client.views.open({
      trigger_id: body.trigger_id,
      view: nextModal as unknown as View,
    });
    return;
  }

  // All pages complete — verify every field is confirmed
  const unconfirmed = await SurveyFieldSchemaModel.count({
    where: { evidence_source_id: meta.evidenceSourceId, review_status: 'pending' },
  });

  if (unconfirmed > 0) {
    await client.chat.postMessage({
      channel: userId,
      text: `❌ ${unconfirmed} field(s) have not been reviewed. All fields must be confirmed before analysis can proceed. Please re-upload and review all pages.`,
    });
    return;
  }

  await client.chat.postMessage({
    channel: userId,
    text: 'All fields confirmed. Computing survey statistics...',
  });

  // Load all confirmed fields
  const confirmedSchemas = await SurveyFieldSchemaModel.findAll({
    where: { evidence_source_id: meta.evidenceSourceId, review_status: 'confirmed' },
    order: [['id', 'ASC']],
  });

  const confirmedFields: ConfirmedField[] = confirmedSchemas.map((s: SurveyFieldSchema) => ({
    fieldName: s.field_name,
    confirmedRole: s.confirmed_role!,
    orderMetadata: s.order_metadata,
    isDemographic: s.is_demographic,
  }));

  const contentHash = computeContentHash(csvContent);

  // Delete staged CSV from Redis immediately
  await deletePendingCsv(meta.projectId, source.public_id, userId);

  await executeSurveyAnalysis(
    survey, confirmedFields, contentHash, meta.evidenceSourceId,
    { userId, projectId: meta.projectId, projectSlug: meta.projectSlug, channelId: meta.channelId, topic: meta.topic, topicSlug: meta.topicSlug, surveyName: meta.surveyName, questionFocus: meta.questionFocus, sourceIntent: meta.sourceIntent },
    client,
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SHARED: Compute → Evidence → Template Render
// ═══════════════════════════════════════════════════════════════════════

async function executeSurveyAnalysis(
  survey: ReturnType<typeof parseCsvBuffer>,
  confirmedFields: ConfirmedField[],
  contentHash: string,
  evidenceSourceId: number,
  ctx: {
    userId: string;
    projectId: number;
    projectSlug: string;
    channelId: string;
    topic: string;
    topicSlug: string;
    surveyName: string;
    questionFocus: string;
    sourceIntent: string;
  },
  client: AllMiddlewareArgs['client'],
): Promise<void> {
  try {
    const computedFacts = computeSurveyFacts(survey, confirmedFields, contentHash);
    const identities = assignRespondentIdentities(survey, confirmedFields, contentHash);
    const displayLabels = identities.map(id => id.displayLabel);
    const openTextContent = extractOpenTextContent(survey, confirmedFields, displayLabels);

    // Create evidence constructs (deterministic, auto-accepted)
    await sequelize.transaction(async (t) => {
      const summaryConstruct = await EvidenceConstructModel.create({
        project_id: ctx.projectId,
        study_id: null,
        construct_type: 'survey_dataset_summary',
        label: `${ctx.surveyName} — ${computedFacts.totalRespondents} respondents`,
        payload: {
          total_respondents: computedFacts.totalRespondents,
          schema_summary: computedFacts.schemaSummary,
          nonresponse_limitation: computedFacts.nonresponseLimitation,
          source_content_hash: contentHash,
        },
        derivation_type: 'deterministic',
        derivation_context: { method: 'survey_structured_ingestion', version: '1.0' },
        status: 'accepted',
        created_by: ctx.userId,
      }, { transaction: t });

      await createSourceToConstruct({
        from_source_id: evidenceSourceId,
        to_construct_id: (summaryConstruct as unknown as { id: number }).id,
        relationship_type: 'DERIVED_FROM',
        provenance: { method: 'survey_structured_ingestion' },
      }, t);

      for (const stat of computedFacts.fieldStats) {
        if (!stat.distribution && stat.nValidNumeric === null) continue;

        const distConstruct = await EvidenceConstructModel.create({
          project_id: ctx.projectId,
          study_id: null,
          construct_type: 'field_distribution',
          label: `${stat.fieldName} distribution`,
          payload: stat,
          derivation_type: 'deterministic',
          derivation_context: { method: 'survey_structured_ingestion', version: '1.0' },
          status: 'accepted',
          created_by: ctx.userId,
        }, { transaction: t });

        await createSourceToConstruct({
          from_source_id: evidenceSourceId,
          to_construct_id: (distConstruct as unknown as { id: number }).id,
          relationship_type: 'DERIVED_FROM',
        }, t);
      }

      for (const ct of computedFacts.crossTabs) {
        const ctConstruct = await EvidenceConstructModel.create({
          project_id: ctx.projectId,
          study_id: null,
          construct_type: 'cross_tab',
          label: `${ct.rowField} × ${ct.colField}`,
          payload: ct,
          derivation_type: 'deterministic',
          derivation_context: { method: 'survey_structured_ingestion', version: '1.0' },
          status: 'accepted',
          created_by: ctx.userId,
        }, { transaction: t });

        await createSourceToConstruct({
          from_source_id: evidenceSourceId,
          to_construct_id: (ctConstruct as unknown as { id: number }).id,
          relationship_type: 'DERIVED_FROM',
        }, t);
      }
    });

    // Template rendering
    const project = await getProjectById(ctx.projectId);
    const projectProblemStatement = project?.problem_statement || null;
    const dateIso = format(new Date(), 'yyyy-MM-dd');

    const data: Record<string, unknown> = {
      topic: ctx.topic,
      effective_topic: ctx.topic,
      topic_slug: ctx.topicSlug,
      project_slug: ctx.projectSlug,
      project_problem_statement: projectProblemStatement,
      source_intent: ctx.sourceIntent,
      description: ctx.sourceIntent || ctx.topic,
      survey_name: ctx.surveyName,
      question_focus: ctx.questionFocus || '',
      selected_study: `discovery-${ctx.topicSlug}`,
      study_name: ctx.topic,
      document_count: 1,
      document_names: [survey.sourceFilename],
      document_types: ['CSV'],
      _discovery_type: 'survey-synthesis',
      computed_facts: computedFacts,
      open_text_content: openTextContent,
      combined_file_content: openTextContent,
    };

    const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, 'survey_synthesis.yaml');
    const variableContext = { projectId: ctx.projectId };

    const renderedYaml = await processYamlTemplate(
      file.content, data, '', '', false, variableContext,
    );

    if (renderedYaml.extractionPromise) {
      const extractResult = await renderedYaml.extractionPromise;
      if (!extractResult.success) {
        throw new Error(`Cascade variable extraction failed: ${extractResult.error}`);
      }
      console.log(`✅ Survey cascade variables committed: ${extractResult.variableCount} items (${extractResult.keys?.join(', ')})`);
    }

    const url = renderedYaml.result.url;

    await client.chat.postMessage({
      channel: ctx.userId,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *Survey synthesis complete*\n\n*Survey:* ${ctx.surveyName}\n*Respondents:* ${computedFacts.totalRespondents}\n*Fields analyzed:* ${computedFacts.fieldStats.length}\n*Cross-tabs:* ${computedFacts.crossTabs.length}`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View on GitHub' },
              style: 'primary',
              url,
              action_id: 'view_discovery_result',
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Evidence entities created: 1 source, ${computedFacts.fieldStats.length + computedFacts.crossTabs.length + 1} constructs with lineage`,
            },
          ],
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Next:* Run `/qori-brief` to start your study — all discovery feeds in automatically.',
          },
        },
      ],
      text: `Survey synthesis complete for "${ctx.surveyName}". View: ${url}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error in survey analysis:', error);
    await client.chat.postMessage({
      channel: ctx.userId,
      text: `❌ Error running survey analysis: ${message}\n\nPlease try again or contact support.`,
    });
  }
}
