/**
 * Survey Submission Handler — two-phase survey ingestion.
 *
 * Phase 1 (handleSurveyUploadPhase):
 *   CSV upload → parse → infer schema → create evidence_source →
 *   store pending_csv_content → send DM with "Review Schema" button
 *
 * Phase 2 (handleSurveySchemaConfirmation):
 *   Schema review modal submission → read confirmed fields →
 *   read pending_csv_content → compute deterministic stats →
 *   create evidence constructs + lineage → inject computed facts
 *   into template → render → clear pending_csv_content
 *
 * Per ADR 0028: all statistics computed in code, never by LLM.
 * Per ADR 0029: evidence entities created for canonical state.
 */

import type {
  SlackActionMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackViewMiddlewareArgs,
  ViewSubmitAction,
  AllMiddlewareArgs,
} from '@slack/bolt';
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
} from '../../survey';
import {
  buildSchemaReviewModal,
  parseSchemaReviewValues,
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
// PHASE 1: Upload → Parse → Infer → DM with Review Button
// ═══════════════════════════════════════════════════════════════════════

/**
 * Called from discoverHandler when discoveryType is 'survey_synthesis'.
 * Downloads CSV, parses, infers schema, creates evidence_source,
 * stores pending CSV content, sends DM with schema review button.
 */
export async function handleSurveyUploadPhase(
  ctx: SurveyUploadContext,
  client: AllMiddlewareArgs['client'],
): Promise<void> {
  const { userId, projectId, projectSlug, channelId, topic, topicSlug, surveyName, questionFocus, sourceIntent, uploadedFiles } = ctx;

  // Download first CSV file
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

  // Parse CSV
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

  const contentHash = computeContentHash(rawContent);

  // Check for existing source with same content hash in this project
  const existingSource = await EvidenceSourceModel.findOne({
    where: {
      project_id: projectId,
      source_type: 'survey_dataset',
    },
  });

  let existingHash: string | null = null;
  if (existingSource) {
    const ref = existingSource.artifact_ref as Record<string, unknown> | null;
    existingHash = ref?.content_hash as string | null;
  }

  // Reuse existing source + schema if same content
  if (existingSource && existingHash === contentHash) {
    const confirmedSchemas = await SurveyFieldSchemaModel.findAll({
      where: {
        evidence_source_id: existingSource.id,
        review_status: 'confirmed',
      },
    });

    if (confirmedSchemas.length > 0) {
      await client.chat.postMessage({
        channel: userId,
        text: `✅ Same survey file detected (content hash match). Reusing accepted schema and recomputing statistics...`,
      });

      // Skip to Phase 2 directly — reuse confirmed schema
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
    study_id: null, // Discovery is project-scoped
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

  // Persist inferred fields + pending CSV content
  await sequelize.transaction(async (t) => {
    for (let i = 0; i < inferredFields.length; i++) {
      const field = inferredFields[i];
      await SurveyFieldSchemaModel.create({
        evidence_source_id: evidenceSource.id,
        field_name: field.fieldName,
        inferred_role: field.inferredRole,
        inference_source: 'heuristic',
        review_status: 'pending',
        // Store pending CSV on first field row only
        pending_csv_content: i === 0 ? rawContent : null,
      } as CreationAttributes<SurveyFieldSchema>, { transaction: t });
    }
  });

  // Build schema summary for DM
  const summaryLines = inferredFields.map(f =>
    `• *${f.fieldName}* → ${f.inferredRole} (${f.presentCount}/${survey.rowCount} present)`
  );

  const meta: SchemaReviewMeta = {
    evidenceSourceId: evidenceSource.id,
    projectId, projectSlug, channelId,
    topic, topicSlug, surveyName, questionFocus, sourceIntent,
  };

  // Send DM with schema review button
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
          text: 'Review and confirm field roles before analysis proceeds. Ordinal fields need category order confirmation.',
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
// SCHEMA REVIEW BUTTON → Open Modal
// ═══════════════════════════════════════════════════════════════════════

export async function handleSurveySchemaReviewAction(
  args: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, action, client, body } = args;
  await ack();

  const meta: SchemaReviewMeta = JSON.parse(action.value || '{}');

  // Load inferred fields from DB
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

  // Convert to SurveyField shape for modal builder
  const fields: SurveyField[] = fieldSchemas.map((s: SurveyFieldSchema) => ({
    fieldName: s.field_name,
    inferredRole: s.inferred_role,
    sampleValues: [], // Samples not stored — role and counts sufficient for review
    distinctCount: 0,
    presentCount: 0,
    missingCount: 0,
  }));

  const modal = buildSchemaReviewModal(fields, meta);

  await client.views.open({
    trigger_id: body.trigger_id,
    view: modal as unknown as import('@slack/types').View,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 2: Schema Confirmation → Compute → Evidence → Render
// ═══════════════════════════════════════════════════════════════════════

export async function handleSurveySchemaConfirmation(
  args: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, view, body, client } = args;
  await ack();

  const meta: SchemaReviewMeta = JSON.parse(view.private_metadata || '{}');
  const userId = body.user.id;

  // Load existing field schemas
  const fieldSchemas = await SurveyFieldSchemaModel.findAll({
    where: { evidence_source_id: meta.evidenceSourceId },
    order: [['id', 'ASC']],
  });

  if (fieldSchemas.length === 0) {
    await client.chat.postMessage({
      channel: userId,
      text: '❌ Survey schema expired. Please re-upload via `/qori-discover`.',
    });
    return;
  }

  // Build original fields for parsing
  const originalFields: SurveyField[] = fieldSchemas.map((s: SurveyFieldSchema) => ({
    fieldName: s.field_name,
    inferredRole: s.inferred_role,
    sampleValues: [],
    distinctCount: 0,
    presentCount: 0,
    missingCount: 0,
  }));

  // Parse confirmed roles from modal
  const confirmedRoles = parseSchemaReviewValues(
    view.state.values as unknown as Record<string, Record<string, Record<string, unknown>>>,
    originalFields,
  );

  // Read pending CSV content from first field row
  const firstField = fieldSchemas[0] as SurveyFieldSchema;
  const pendingCsv = firstField.pending_csv_content;

  if (!pendingCsv) {
    await client.chat.postMessage({
      channel: userId,
      text: '❌ Survey data expired. Please re-upload via `/qori-discover`.',
    });
    return;
  }

  // Re-parse CSV from staged content
  let survey;
  try {
    survey = parseCsvBuffer(pendingCsv, 'staged-csv');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await client.chat.postMessage({
      channel: userId,
      text: `❌ Error re-parsing staged CSV: ${message}`,
    });
    return;
  }

  const contentHash = computeContentHash(pendingCsv);

  // For ordinal fields, detect unique values for order metadata
  const confirmedFields: ConfirmedField[] = confirmedRoles.map(r => {
    let orderMetadata: string[] | null = null;
    if (r.confirmedRole === 'ordinal') {
      // Auto-detect category order from unique values (researcher can adjust in future)
      orderMetadata = getUniqueValues(survey, r.fieldName);
    }
    return {
      fieldName: r.fieldName,
      confirmedRole: r.confirmedRole,
      orderMetadata,
      isDemographic: r.isDemographic,
    };
  });

  // Update field schemas in DB
  await sequelize.transaction(async (t) => {
    for (const field of confirmedFields) {
      await SurveyFieldSchemaModel.update(
        {
          confirmed_role: field.confirmedRole,
          order_metadata: field.orderMetadata,
          is_demographic: field.isDemographic,
          review_status: 'confirmed',
          reviewed_by: userId,
          reviewed_at: new Date(),
          pending_csv_content: null, // Clear staged data
        },
        {
          where: {
            evidence_source_id: meta.evidenceSourceId,
            field_name: field.fieldName,
          },
          transaction: t,
        },
      );
    }
    // Clear pending_csv_content from first row explicitly
    await SurveyFieldSchemaModel.update(
      { pending_csv_content: null },
      { where: { evidence_source_id: meta.evidenceSourceId }, transaction: t },
    );
  });

  await client.chat.postMessage({
    channel: userId,
    text: 'Schema confirmed. Computing survey statistics...',
  });

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
    // Compute deterministic facts (ADR 0028)
    const computedFacts = computeSurveyFacts(survey, confirmedFields, contentHash);

    // Assign respondent identities
    const identities = assignRespondentIdentities(survey, confirmedFields, contentHash);
    const displayLabels = identities.map(id => id.displayLabel);

    // Extract open-text content for LLM interpretation
    const openTextContent = extractOpenTextContent(survey, confirmedFields, displayLabels);

    // Create evidence constructs (deterministic, auto-accepted)
    await sequelize.transaction(async (t) => {
      // Survey dataset summary construct
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

      // Field distribution constructs
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

      // Cross-tab constructs
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

    // Proceed with template rendering via existing discover flow
    const project = await getProjectById(ctx.projectId);
    const projectProblemStatement = project?.problem_statement || null;

    const dateIso = format(new Date(), 'yyyy-MM-dd');

    // Build template input with computed facts
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
      // Computed facts — deterministic, code-computed (ADR 0028)
      computed_facts: computedFacts,
      // Open-text content for LLM qualitative interpretation
      open_text_content: openTextContent,
      // Keep combined_file_content for backward compat with template
      combined_file_content: openTextContent,
    };

    const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, 'survey_synthesis.yaml');

    const variableContext = { projectId: ctx.projectId };

    const renderedYaml = await processYamlTemplate(
      file.content,
      data,
      '',
      '',
      false,
      variableContext,
    );

    // Await extraction (ADR 0019)
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
