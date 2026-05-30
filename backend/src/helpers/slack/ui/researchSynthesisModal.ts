import type { View } from '@slack/types';

// ─── Modal metadata contract ─────────────────────────────────────

/** The shape of private_metadata for the research-synthesis-modal. */
export interface SynthesisModalMetadata {
  selectedStudyId: string | number | null;
  selectedAnalysisMethod: string | null;
  /** Enrichment keys that the user has explicitly excluded (opt-out). */
  excludedEnrichments?: string[];
}

interface Study {
  id: number | string;
  name: string;
  path?: string | null;
}

/** Session data stats from the variable store. */
export interface SessionDataStats {
  totalSessions: number;
  totalNuggets: number;
  participantBreakdown: Array<{
    participantId: string;
    nuggetCount: number;
    sessionDate?: string;
  }>;
}

/** Available enrichment from prior synthesis/brief. */
export interface AvailableEnrichment {
  key: string;
  label: string;
  count: number;
  source: string;
  sourceDate?: string;
}

/** Cascade readiness data for synthesis. */
export interface SynthesisCascadeData {
  sessionStats: SessionDataStats | null;
  enrichments: AvailableEnrichment[];
  missingRequired: Array<{ key: string; label: string; hint: string }>;
  readyToRun: boolean;
}

// Analysis methods that use the cascade-aware flow (v7.0 templates)
const CASCADE_AWARE_METHODS = [
  'affinity_mapping',
  'journey_mapping',
  'persona_generation',
  'jobs_to_be_done',
  'usability_issues',
  'design_opportunities',
];

// service_blueprint stays on legacy flow (v1.2 template)
const LEGACY_METHODS = ['service_blueprint'];

export const researchSynthesisModal = (
  researchStudies: Study[] = [],
  selectedStudyId: string | number | null = null,
  selectedAnalysisMethod: string | null = null,
  cascadeData: SynthesisCascadeData | null = null,
  excludedEnrichments: string[] = [],
) => {
  // Build research study options
  const studyOptions = researchStudies.slice(0, 10).map((study) => ({
    text: {
      type: "plain_text",
      text: study.name,
    },
    value: study.id.toString(),
  }));

  // Find selected study
  const selectedStudy = researchStudies.find(s => s.id.toString() === selectedStudyId?.toString());

  // Determine if selected method is cascade-aware
  const isCascadeAware = selectedAnalysisMethod && CASCADE_AWARE_METHODS.includes(selectedAnalysisMethod);
  const isLegacyMethod = selectedAnalysisMethod && LEGACY_METHODS.includes(selectedAnalysisMethod);

  // Store metadata
  const privateMetadata = JSON.stringify({
    selectedStudyId,
    selectedAnalysisMethod,
    excludedEnrichments,
  } satisfies SynthesisModalMetadata);

  // Build session data blocks
  const sessionDataBlocks: Record<string, unknown>[] = [];
  if (cascadeData && isCascadeAware) {
    if (cascadeData.sessionStats && cascadeData.sessionStats.totalSessions > 0) {
      // Session data available
      const stats = cascadeData.sessionStats;
      const participantList = stats.participantBreakdown
        .slice(0, 8)
        .map(p => `• ${p.participantId}${p.sessionDate ? ` (${p.sessionDate})` : ''} — ${p.nuggetCount} nuggets`)
        .join('\n');
      const moreCount = stats.participantBreakdown.length > 8 ? stats.participantBreakdown.length - 8 : 0;

      sessionDataBlocks.push(
        { type: "divider" },
        {
          type: "section",
          block_id: "session_data_status",
          text: {
            type: "mrkdwn",
            text: `📊 *Session Data Available*\n${stats.totalSessions} session${stats.totalSessions !== 1 ? 's' : ''} analyzed • ${stats.totalNuggets} atomic nuggets`,
          },
        },
        {
          type: "context",
          block_id: "session_data_breakdown",
          elements: [{
            type: "mrkdwn",
            text: participantList + (moreCount > 0 ? `\n_... and ${moreCount} more_` : ''),
          }],
        }
      );
    } else if (!cascadeData.readyToRun) {
      // No session data — hard fail state
      sessionDataBlocks.push(
        { type: "divider" },
        {
          type: "section",
          block_id: "session_data_missing",
          text: {
            type: "mrkdwn",
            text: `:warning: *Cannot run synthesis — no session data*`,
          },
        },
        {
          type: "context",
          block_id: "session_data_hint",
          elements: [{
            type: "mrkdwn",
            text: `Run \`/qori-analyze\` on session transcripts first to build the nugget pool.\nSynthesis requires atomic nuggets extracted from analyzed sessions.`,
          }],
        }
      );
    }
  }

  // Build enrichments blocks (opt-out checkboxes)
  const enrichmentBlocks: Record<string, unknown>[] = [];
  if (cascadeData && isCascadeAware && cascadeData.enrichments.length > 0) {
    const enrichmentOptions = cascadeData.enrichments.map(e => ({
      text: {
        type: "mrkdwn",
        text: `*${e.label}* — ${e.count} item${e.count !== 1 ? 's' : ''} from ${e.source}`,
      },
      value: e.key,
    }));

    // Pre-select all enrichments that are NOT in excludedEnrichments (opt-out pattern)
    const initialOptions = enrichmentOptions.filter(opt => !excludedEnrichments.includes(opt.value));

    enrichmentBlocks.push(
      { type: "divider" },
      {
        type: "section",
        block_id: "enrichments_header",
        text: {
          type: "mrkdwn",
          text: `✅ *Cascade Enrichments* (included by default)`,
        },
      },
      {
        type: "context",
        block_id: "enrichments_hint",
        elements: [{
          type: "mrkdwn",
          text: `_Uncheck to exclude from synthesis. These were generated by prior analysis._`,
        }],
      },
      {
        type: "section",
        block_id: "enrichments_list",
        text: { type: "mrkdwn", text: " " },
        accessory: {
          type: "checkboxes",
          action_id: "enrichment_checkboxes",
          options: enrichmentOptions,
          initial_options: initialOptions.length > 0 ? initialOptions : undefined,
        },
      }
    );
  }

  // Build missing required warning
  const missingRequiredBlocks: Record<string, unknown>[] = [];
  if (cascadeData && cascadeData.missingRequired.length > 0) {
    const missingList = cascadeData.missingRequired
      .map(m => `:warning: *${m.label}* — ${m.hint}`)
      .join('\n');

    missingRequiredBlocks.push(
      { type: "divider" },
      {
        type: "section",
        block_id: "missing_required_header",
        text: {
          type: "mrkdwn",
          text: `:warning: *Missing required inputs*`,
        },
      },
      {
        type: "context",
        block_id: "missing_required_list",
        elements: [{ type: "mrkdwn", text: missingList }],
      },
      {
        type: "context",
        block_id: "missing_required_action",
        elements: [{ type: "mrkdwn", text: `_Complete the upstream steps above, then re-open this modal._` }],
      }
    );
  }

  // Build legacy method notice
  const legacyNoticeBlocks: Record<string, unknown>[] = [];
  if (isLegacyMethod) {
    legacyNoticeBlocks.push(
      { type: "divider" },
      {
        type: "context",
        block_id: "legacy_method_notice",
        elements: [{
          type: "mrkdwn",
          text: `⚠️ *Service Blueprint* uses legacy file-based input. This synthesis method will be upgraded in a future release.`,
        }],
      }
    );
  }

  return {
    type: "modal",
    callback_id: "research-synthesis-modal",
    title: {
      type: "plain_text",
      text: "Research Synthesis",
    },
    submit: cascadeData?.readyToRun !== false ? {
      type: "plain_text",
      text: "Run Analysis",
    } : undefined,
    close: {
      type: "plain_text",
      text: "Cancel",
    },
    private_metadata: privateMetadata,
    blocks: [
      // Study Selection Section
      { type: "section", text: { type: "mrkdwn", text: "📁 *Study*" } },
      {
        type: "input",
        block_id: "study_select_block",
        label: { type: "plain_text", text: "Study" },
        element: {
          type: "static_select",
          action_id: "study_select_synthesize",
          placeholder: { type: "plain_text", text: "Select a study..." },
          options: studyOptions.length > 0 ? studyOptions : [
            { text: { type: "plain_text", text: "No research studies found" }, value: "no_studies" },
          ],
          initial_option: selectedStudy ? {
            text: { type: "plain_text", text: selectedStudy.name },
            value: selectedStudy.id.toString(),
          } : undefined,
        },
      },

      { type: "divider" },

      // Analysis Type Section
      { type: "section", text: { type: "mrkdwn", text: "🎯 *Analysis Type*" } },
      { type: "context", elements: [{ type: "mrkdwn", text: "Choose the type of synthesis" }] },
      (() => {
        const analysisMethodOptions = [
          {
            text: { type: "plain_text", text: "🗂️ Affinity Mapping • Group findings" },
            value: "affinity_mapping",
          },
          {
            text: { type: "plain_text", text: "🗺️ Journey Mapping • Map experiences" },
            value: "journey_mapping",
          },
          {
            text: { type: "plain_text", text: "👤 Persona Generation • Create personas" },
            value: "persona_generation",
          },
          {
            text: { type: "plain_text", text: "🎯 Jobs to Be Done • Extract user jobs" },
            value: "jobs_to_be_done",
          },
          {
            text: { type: "plain_text", text: "⚠️ Usability Issues • Prioritize problems" },
            value: "usability_issues",
          },
          {
            text: { type: "plain_text", text: "💡 Design Opportunities • Generate HMWs" },
            value: "design_opportunities",
          },
          // Service blueprint excluded from cascade-aware modal per ADR 0018
          // {
          //   text: { type: "plain_text", text: "🔧 Service Blueprint • Map backstage" },
          //   value: "service_blueprint",
          // },
        ];

        const methodValue = selectedAnalysisMethod || "affinity_mapping";
        const matchingOption = analysisMethodOptions.find(opt => opt.value === methodValue);
        const initialOption = matchingOption || analysisMethodOptions[0];

        return {
          type: "input",
          block_id: "analysis_method_selection",
          label: { type: "plain_text", text: "Analysis method" },
          element: {
            type: "radio_buttons",
            action_id: "analysis_method",
            options: analysisMethodOptions,
            initial_option: initialOption,
          },
        };
      })(),

      // Session data status (cascade-aware)
      ...sessionDataBlocks,

      // Enrichments (opt-out checkboxes)
      ...enrichmentBlocks,

      // Missing required warnings
      ...missingRequiredBlocks,

      // Legacy method notice
      ...legacyNoticeBlocks,

    ],
  } as unknown as View;
};
