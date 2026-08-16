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
  formatComputedFacts,
  toDisplayLabel,
} from '../../survey';
import { loadPersistedFacts } from '../../survey/loadPersistedFacts';
import { buildQualitativeEntries, persistQualitativeEntries } from '../../survey/qualitativeEntryWriter';
import {
  getAnalysisEligibleContent as getEligibleContent,
  isPrivacyReviewComplete,
} from '../../../services/content-governance.service';
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
import {
  findAcceptedCodingRun,
  getCodingRunWithDetails,
  selectIllustrativeQuotes,
} from '../../../services/survey-coding-run.service';
import { computeQualitativeAggregation, type PatternStat } from '../../../services/survey-aggregation.service';

// Models
const EvidenceSourceModel = sequelize.models.EvidenceSource as typeof EvidenceSource;
const EvidenceConstructModel = sequelize.models.EvidenceConstruct;
const SurveyFieldSchemaModel = sequelize.models.SurveyFieldSchema as typeof SurveyFieldSchema;
import type { SurveyQualitativeEntry } from '../../../database/models/survey_qualitative_entry';
const QualitativeEntryModel = sequelize.models.SurveyQualitativeEntry as typeof SurveyQualitativeEntry;

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

      // Check if privacy review is complete for existing entries
      const existingEntries = await QualitativeEntryModel.findAll({
        where: { evidence_source_id: existingSource.id },
      });
      // isPrivacyReviewComplete imported statically above
      const privacyComplete = existingEntries.length === 0 || isPrivacyReviewComplete(
        existingEntries as Array<{ pii_status: 'pending' | 'clear' | 'redacted' | 'restricted' }>,
      );

      if (privacyComplete) {
        await runSurveyQualitativeSynthesis(
          survey, confirmedFields, contentHash, existingSource.id,
          { userId, projectId, projectSlug, channelId, topic, topicSlug, surveyName, questionFocus, sourceIntent },
          client,
        );
      } else {
        await client.chat.postMessage({
          channel: userId,
          text: '📊 Structured analysis exists. Complete the open-text privacy review to generate qualitative synthesis.',
        });
      }
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
    originalFilename: csvFile.name,
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
      const survey = parseCsvBuffer(csvContent, meta.originalFilename || 'survey.csv');
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

  const meta: SchemaReviewMeta = JSON.parse(view.private_metadata || '{}');
  const userId = body.user.id;

  // ── VALIDATE BEFORE ACK ──────────────────────────────────────
  // Ordinal order validation must block submission via Slack's
  // response_action: 'errors' mechanism. Once ack() is called with
  // no args, the modal closes and errors cannot be shown inline.

  // Load field schemas (fast DB query, well within 3s ack window)
  const allFieldSchemas = await SurveyFieldSchemaModel.findAll({
    where: { evidence_source_id: meta.evidenceSourceId },
    order: [['id', 'ASC']],
  });

  if (allFieldSchemas.length === 0) {
    await ack();
    await client.chat.postMessage({
      channel: userId,
      text: '❌ Survey schema expired. Please re-upload via `/qori-discover`.',
    });
    return;
  }

  // Build field values map from stored schema metadata for ordinal validation.
  // Use the unique values stored as sampleValues or infer from schema rows.
  // For full validation, we need the actual CSV values — load from Redis.
  const source = await EvidenceSourceModel.findByPk(meta.evidenceSourceId);
  if (!source) {
    await ack();
    await client.chat.postMessage({
      channel: userId,
      text: '❌ Survey source not found. Please re-upload via `/qori-discover`.',
    });
    return;
  }

  const csvContent = await getPendingCsv(meta.projectId, source.public_id, userId);
  if (!csvContent) {
    await ack();
    await client.chat.postMessage({
      channel: userId,
      text: '❌ Survey data has expired (2-hour staging window). Please re-upload via `/qori-discover`.',
    });
    return;
  }

  let survey;
  try {
    survey = parseCsvBuffer(csvContent, meta.originalFilename || 'survey.csv');
  } catch (err) {
    await ack();
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

  // Validate ordinal orders BEFORE ack — blocks submission on failure
  let pageResults;
  try {
    pageResults = parseSchemaReviewValues(
      view.state.values as unknown as Record<string, Record<string, Record<string, unknown>>>,
      pageFields,
      allFieldValues,
    );
  } catch (err) {
    if (err instanceof OrdinalOrderValidationError) {
      // Block submission with inline Slack error on the ordinal order field
      await ack({
        response_action: 'errors',
        errors: {
          [`field_order_${err.fieldName}`]: err.message,
        },
      });
      return;
    }
    await ack();
    throw err;
  }

  // Validation passed — accept submission
  await ack();

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

  const analysisCtx = {
    userId, projectId: meta.projectId, projectSlug: meta.projectSlug,
    channelId: meta.channelId, topic: meta.topic, topicSlug: meta.topicSlug,
    surveyName: meta.surveyName, questionFocus: meta.questionFocus,
    sourceIntent: meta.sourceIntent,
  };

  // Stage 1: Persist structured foundation + qualitative entries (all durable writes)
  await persistSurveyFoundation(
    survey, confirmedFields, contentHash, meta.evidenceSourceId, analysisCtx, client,
  );

  // Delete Redis staging ONLY after all durable writes succeed
  await deletePendingCsv(meta.projectId, source.public_id, userId);

  // Notify researcher: structured analysis ready, privacy review needed
  const hasOpenText = confirmedFields.some(f => f.confirmedRole === 'open_text');
  if (hasOpenText) {
    await client.chat.postMessage({
      channel: userId,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '📊 *Structured analysis saved.* Review open-text responses before Qori uses them for qualitative synthesis.',
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Review Responses' },
              style: 'primary',
              action_id: 'survey_privacy_review',
              value: JSON.stringify({
                evidenceSourceId: meta.evidenceSourceId,
                projectId: meta.projectId,
                projectSlug: meta.projectSlug,
                topic: meta.topic,
                topicSlug: meta.topicSlug,
                surveyName: meta.surveyName,
                questionFocus: meta.questionFocus,
                sourceIntent: meta.sourceIntent,
              }),
            },
          ],
        },
      ],
      text: 'Structured analysis saved. Review open-text responses before Qori analyzes them.',
    });
  } else {
    // No open-text fields — proceed directly to synthesis
    await runSurveyQualitativeSynthesis(
      survey, confirmedFields, contentHash, meta.evidenceSourceId, analysisCtx, client,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// STAGE 1: Persist Structured Foundation + Qualitative Entries
// ═══════════════════════════════════════════════════════════════════════

async function persistSurveyFoundation(
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

    // Persist qualitative entries (pii_status='pending', governed)
    const qualEntries = buildQualitativeEntries(survey, confirmedFields, identities, {
      evidenceSourceId,
      projectId: ctx.projectId,
      studyId: null, // discovery is project-scoped
    });
    if (qualEntries.length > 0) {
      await sequelize.transaction(async (t) => {
        await persistQualitativeEntries(QualitativeEntryModel, qualEntries, t);
      });
      console.log(`✅ ${qualEntries.length} qualitative entries persisted (pii_status=pending)`);
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error persisting survey foundation:', error);
    await client.chat.postMessage({
      channel: ctx.userId,
      text: `❌ Error saving survey analysis: ${message}\n\nPlease try again.`,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// STAGE 2: Qualitative Synthesis (after privacy review)
// ═══════════════════════════════════════════════════════════════════════

export async function runSurveyQualitativeSynthesis(
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
    // Load canonical persisted facts from evidence constructs — NOT recomputed from CSV
    const evidenceConstructs = await EvidenceConstructModel.findAll({
      where: { project_id: ctx.projectId },
      order: [['created_at', 'ASC']],
    });

    const computedFacts = loadPersistedFacts(
      evidenceConstructs.map(c => ({
        construct_type: (c as unknown as { construct_type: string }).construct_type,
        payload: (c as unknown as { payload: Record<string, unknown> | null }).payload,
      })),
    );

    if (!computedFacts) {
      throw new Error('No persisted structured facts found. Cannot generate synthesis without deterministic evidence.');
    }

    // Load analysis-eligible entries via governance accessor
    const allEntries = await QualitativeEntryModel.findAll({
      where: { evidence_source_id: evidenceSourceId },
      order: [['field_name', 'ASC'], ['source_row_index', 'ASC']],
    });

    // Build open-text content from eligible entries only
    // getEligibleContent imported statically above (aliased from getAnalysisEligibleContent)
    const eligibleLines: string[] = [];
    for (const entry of allEntries) {
      const text = getEligibleContent(entry);
      if (text) {
        eligibleLines.push(`${(entry as SurveyQualitativeEntry).display_respondent_id} (${(entry as SurveyQualitativeEntry).field_display_name}): "${text}"`);
      }
    }
    const openTextContent = eligibleLines.length > 0
      ? eligibleLines.join('\n')
      : '(No eligible open-text responses after privacy review.)';

    // Build provenance metadata from actual execution state
    const evidenceSource = await EvidenceSourceModel.findByPk(evidenceSourceId);
    const schemaRows = await SurveyFieldSchemaModel.findAll({
      where: { evidence_source_id: evidenceSourceId, review_status: 'confirmed' },
      order: [['id', 'ASC']],
    });
    const firstReviewed = schemaRows.find((s: SurveyFieldSchema) => s.reviewed_by);
    const ordinalFields = confirmedFields.filter(f => f.confirmedRole === 'ordinal' && f.orderMetadata);
    const provenance = {
      source_public_id: evidenceSource?.public_id ?? 'unknown',
      source_filename: survey.sourceFilename,
      reviewed_by: (firstReviewed as SurveyFieldSchema | undefined)?.reviewed_by ?? 'unknown',
      reviewed_at: (firstReviewed as SurveyFieldSchema | undefined)?.reviewed_at
        ? new Date((firstReviewed as SurveyFieldSchema).reviewed_at!).toISOString()
        : 'unknown',
      field_role_summary: confirmedFields.map(f =>
        `${toDisplayLabel(f.fieldName)} (${f.confirmedRole}${f.isDemographic ? ', demographic' : ''})`
      ).join(', '),
      ordinal_orders: ordinalFields.length > 0
        ? ordinalFields.map(f =>
            `>\n> **${toDisplayLabel(f.fieldName)}**\n>\n> ${f.orderMetadata!.join(' → ')}`
          ).join('\n')
        : 'No ordinal fields confirmed',
      model_used: process.env.ANTHROPIC_MODEL_NAME || 'claude-sonnet-4-6',
    };

    // Load accepted qualitative coding data (Slice 2B)
    const acceptedRun = await findAcceptedCodingRun(evidenceSourceId);
    let qualitativeCoding: Record<string, unknown> | null = null;

    if (acceptedRun) {
      const runId = (acceptedRun as unknown as { id: number }).id;
      const details = await getCodingRunWithDetails(runId);

      if (details) {
        // Build assignment rows for aggregation
        const assignmentRows: Array<{ respondent_key: string; code_public_id: string; code_label: string; code_definition: string }> = [];
        for (const a of details.assignments.filter(a => a.status === 'accepted')) {
          assignmentRows.push({
            respondent_key: a.entry_respondent_key,
            code_public_id: a.code_public_id,
            code_label: a.code_label,
            code_definition: '', // definition loaded separately
          });
        }

        // Get code definitions from accepted codes
        const codeDefMap = new Map(details.acceptedCodes.map(c => [c.public_id, c.definition]));
        for (const row of assignmentRows) {
          row.code_definition = codeDefMap.get(row.code_public_id) ?? '';
        }

        const eligibleRespondentKeys = new Set(allEntries.filter(e => getEligibleContent(e)).map(e => (e as SurveyQualitativeEntry).respondent_key));
        const aggregation = computeQualitativeAggregation(assignmentRows, eligibleRespondentKeys);

        // Select illustrative quotes for each pattern
        const buildQuoteBlock = async (pattern: PatternStat) => {
          const quotes = await selectIllustrativeQuotes(runId, pattern.codePublicId);
          return quotes.map(q => `> "${q.governedText}" — ${q.respondentDisplayId} (${q.fieldDisplayName})`).join('\n>\n');
        };

        const recurringPatterns = [];
        for (const p of aggregation.recurringPatterns) {
          recurringPatterns.push({
            label: p.codeLabel,
            definition: p.codeDefinition,
            displayFrequency: p.displayFrequency,
            quotes: await buildQuoteBlock(p),
          });
        }

        const individualObservations = [];
        for (const p of aggregation.individualObservations) {
          individualObservations.push({
            label: p.codeLabel,
            definition: p.codeDefinition,
            displayFrequency: p.displayFrequency,
            quotes: await buildQuoteBlock(p),
          });
        }

        // Review metadata for Method & Provenance
        const codebook = await sequelize.models.SurveyCodebook.findByPk(acceptedRun.codebook_id);
        const codebookMeta = codebook ? {
          version: (codebook as unknown as { version: number }).version,
          reviewed_by: (codebook as unknown as { reviewed_by: string | null }).reviewed_by ?? 'unknown',
          reviewed_at: (codebook as unknown as { reviewed_at: Date | null }).reviewed_at
            ? new Date((codebook as unknown as { reviewed_at: Date }).reviewed_at).toISOString()
            : 'unknown',
        } : null;

        qualitativeCoding = {
          hasAcceptedCoding: true,
          recurringPatterns,
          individualObservations,
          eligibleRespondentCount: aggregation.eligibleRespondentCount,
          codingRun: {
            version: acceptedRun.version,
            reviewed_by: acceptedRun.reviewed_by ?? 'unknown',
            reviewed_at: acceptedRun.reviewed_at
              ? new Date(acceptedRun.reviewed_at).toISOString()
              : 'unknown',
          },
          codebook: codebookMeta,
          // Privacy review summary
          privacyReview: {
            clear: allEntries.filter(e => (e as SurveyQualitativeEntry).pii_status === 'clear').length,
            redacted: allEntries.filter(e => (e as SurveyQualitativeEntry).pii_status === 'redacted').length,
            restricted: allEntries.filter(e => (e as SurveyQualitativeEntry).pii_status === 'restricted').length,
          },
        };
      }
    }

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
      document_names: [evidenceSource?.artifact_ref ? (evidenceSource.artifact_ref as Record<string, unknown>).filename as string ?? survey.sourceFilename : survey.sourceFilename],
      document_types: ['CSV'],
      _discovery_type: 'survey-synthesis',
      computed_facts: formatComputedFacts(computedFacts, confirmedFields),
      open_text_content: openTextContent,
      combined_file_content: openTextContent,
      provenance,
      qualitative_coding: qualitativeCoding,
      // Top-level boolean for skip_when evaluation (assertSkipWhenVariablesDefined
      // checks top-level keys only — nested property access is not supported)
      has_accepted_coding: qualitativeCoding !== null,
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
