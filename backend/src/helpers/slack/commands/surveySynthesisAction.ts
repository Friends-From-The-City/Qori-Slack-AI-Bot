/**
 * Survey Synthesis Action Handler — thin Slack adapter.
 *
 * Triggered after privacy review completes. Resolves context,
 * verifies privacy completion, invokes qualitative synthesis.
 *
 * This handler is an adapter — synthesis logic lives in
 * runSurveyQualitativeSynthesis (surveySubmissionHandler.ts).
 */

import type {
  SlackActionMiddlewareArgs,
  BlockAction,
  ButtonAction,
  AllMiddlewareArgs,
} from '@slack/bolt';
import type { CreationAttributes } from 'sequelize';
import sequelize from '../../../database';
import type { EvidenceSource } from '../../../database/models/evidence_source';
import type { SurveyFieldSchema } from '../../../database/models/survey_field_schema';
import type { SurveyQualitativeEntry } from '../../../database/models/survey_qualitative_entry';
import type { ConfirmedField } from '../../../types/survey';
import { parseCsvBuffer, computeContentHash } from '../../survey';
import { isPrivacyReviewComplete } from '../../../services/content-governance.service';
import { findAcceptedCodingRun } from '../../../services/survey-coding-run.service';
import { getProjectById } from '../../../services/project.service';
import { runSurveyQualitativeSynthesis } from './surveySubmissionHandler';

const EvidenceSourceModel = sequelize.models.EvidenceSource as typeof EvidenceSource;
const SurveyFieldSchemaModel = sequelize.models.SurveyFieldSchema as typeof SurveyFieldSchema;
const QualitativeEntryModel = sequelize.models.SurveyQualitativeEntry as typeof SurveyQualitativeEntry;

interface SynthesisMeta {
  evidenceSourceId: number;
  projectId: number;
  projectSlug?: string;
  topic?: string;
  topicSlug?: string;
  surveyName?: string;
  questionFocus?: string;
  sourceIntent?: string;
}

/**
 * Handle "Generate Survey Synthesis" button click after privacy review.
 */
export async function handleRunSynthesisAction(
  args: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, action, client, body } = args;
  await ack();

  const meta: SynthesisMeta = JSON.parse(action.value || '{}');
  const userId = body.user.id;

  try {
    // 1. Verify privacy review is complete
    const entries = await QualitativeEntryModel.findAll({
      where: { evidence_source_id: meta.evidenceSourceId },
    });

    if (entries.length > 0 && !isPrivacyReviewComplete(
      entries as Array<{ pii_status: 'pending' | 'clear' | 'redacted' | 'restricted' }>,
    )) {
      await client.chat.postMessage({
        channel: userId,
        text: '❌ Privacy review is not complete. All open-text entries must be reviewed before synthesis.',
      });
      return;
    }

    // 2. Verify accepted coding run exists (Slice 2B gate)
    const acceptedRun = await findAcceptedCodingRun(meta.evidenceSourceId);
    if (!acceptedRun) {
      await client.chat.postMessage({
        channel: userId,
        text: 'Complete match review before generating the final survey summary. Use the "Review Matches" button to continue.',
      });
      return;
    }

    // 3. Load evidence source
    const source = await EvidenceSourceModel.findByPk(meta.evidenceSourceId);
    if (!source) {
      await client.chat.postMessage({
        channel: userId,
        text: '❌ Survey source not found. Please re-upload via `/qori-discover`.',
      });
      return;
    }

    // 4. Load confirmed field schemas
    const fieldSchemas = await SurveyFieldSchemaModel.findAll({
      where: { evidence_source_id: meta.evidenceSourceId, review_status: 'confirmed' },
      order: [['id', 'ASC']],
    });

    if (fieldSchemas.length === 0) {
      await client.chat.postMessage({
        channel: userId,
        text: '❌ No confirmed field schema found. Please re-upload via `/qori-discover`.',
      });
      return;
    }

    const confirmedFields: ConfirmedField[] = fieldSchemas.map((s: SurveyFieldSchema) => ({
      fieldName: s.field_name,
      confirmedRole: s.confirmed_role!,
      orderMetadata: s.order_metadata,
      isDemographic: s.is_demographic,
    }));

    // 5. Reconstruct survey from evidence source metadata
    // The survey headers are stored in evidence source metadata
    const sourceMetadata = source.metadata as Record<string, unknown> | null;
    const headers = (sourceMetadata?.headers as string[]) ?? [];
    const rowCount = (sourceMetadata?.row_count as number) ?? 0;

    if (headers.length === 0) {
      await client.chat.postMessage({
        channel: userId,
        text: '❌ Survey metadata not available. Please re-upload via `/qori-discover`.',
      });
      return;
    }

    // Build minimal survey representation from qualitative entries + evidence metadata
    // The actual CSV is no longer in Redis, but we have entries in DB
    const artifactRef = source.artifact_ref as Record<string, unknown> | null;
    const contentHash = (artifactRef?.content_hash as string) ?? '';
    const sourceFilename = (artifactRef?.filename as string) ?? 'survey.csv';

    await client.chat.postMessage({
      channel: userId,
      text: 'Generating survey synthesis from approved responses...',
    });

    // 6. Invoke qualitative synthesis
    // Resolution order for survey context:
    //   1. evidence_source.metadata.survey_context (authoritative, written during upload)
    //   2. Persisted canonical DB state (project, evidence_source metadata)
    //   3. evidence_source.label as last-resort display fallback (never mutated back)
    //   4. Slack button metadata as final legacy fallback
    //
    // This avoids title corruption from metadata loss through the Slack button chain.
    const surveyContext = (sourceMetadata?.survey_context as Record<string, string> | undefined);

    // Load canonical project state for fallback
    const project = await getProjectById(meta.projectId);

    let resolvedTopic: string;
    let resolvedTopicSlug: string;
    let resolvedSurveyName: string;
    let resolvedProjectSlug: string;
    let resolvedQuestionFocus: string;
    let resolvedSourceIntent: string;

    if (surveyContext?.topic) {
      // Priority 1: Persisted survey_context (authoritative)
      resolvedTopic = surveyContext.topic;
      resolvedTopicSlug = surveyContext.topicSlug ?? 'survey';
      resolvedSurveyName = surveyContext.surveyName ?? surveyContext.topic;
      resolvedProjectSlug = surveyContext.projectSlug ?? meta.projectSlug ?? '';
      resolvedQuestionFocus = surveyContext.questionFocus ?? '';
      resolvedSourceIntent = surveyContext.sourceIntent ?? '';
    } else {
      // Priority 2-4: Canonical DB state + legacy fallbacks
      // Use project slug from DB, survey name from Slack meta or source label
      const projectSlug = project?.slug ?? meta.projectSlug ?? '';
      const surveyName = meta.surveyName ?? source.label ?? 'Survey';
      resolvedSurveyName = surveyName;
      resolvedTopic = meta.topic ?? surveyName;
      resolvedTopicSlug = meta.topicSlug ?? 'survey';
      resolvedProjectSlug = projectSlug;
      resolvedQuestionFocus = meta.questionFocus ?? '';
      resolvedSourceIntent = meta.sourceIntent ?? '';
    }

    const ctx = {
      userId,
      projectId: meta.projectId,
      projectSlug: resolvedProjectSlug,
      channelId: userId,
      topic: resolvedTopic,
      topicSlug: resolvedTopicSlug,
      surveyName: resolvedSurveyName,
      questionFocus: resolvedQuestionFocus,
      sourceIntent: resolvedSourceIntent,
    };

    // Create a minimal ParsedSurvey-compatible object from stored metadata
    const minimalSurvey = {
      sourceFilename,
      headers,
      rows: [] as Array<{ values: Record<string, string>; rowIndex: number }>,
      rowCount,
      parseWarnings: [] as string[],
    };

    await runSurveyQualitativeSynthesis(
      minimalSurvey, confirmedFields, contentHash, meta.evidenceSourceId, ctx, client,
    );

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error running survey synthesis:', error);
    await client.chat.postMessage({
      channel: userId,
      text: `❌ Error generating survey synthesis: ${message}`,
    });
  }
}
