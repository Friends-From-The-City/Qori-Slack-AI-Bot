import type { View } from '@slack/types';

// ─── Modal metadata contract ─────────────────────────────────────

/** The shape of private_metadata for the research-synthesis-modal. */
export interface SynthesisModalMetadata {
  selectedStudyId: string | number | null;
  selectedAnalysisMethod: string | null;
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
) => {
  // Truncate study names to Slack's 75-char limit for plain_text
  const truncateName = (name: string) => name.length > 75 ? name.slice(0, 72) + '...' : name;

  // Build research study options (first 10 only)
  const studyOptions = researchStudies.slice(0, 10).map((study) => ({
    text: {
      type: "plain_text",
      text: truncateName(study.name),
    },
    value: study.id.toString(),
  }));

  // Find selected study - ONLY from visible options (first 10)
  // initial_option must match one of the options, so don't select studies beyond index 10
  const selectedStudy = researchStudies.slice(0, 10).find(s => s.id.toString() === selectedStudyId?.toString());

  // Determine if selected method is cascade-aware
  const isCascadeAware = selectedAnalysisMethod && CASCADE_AWARE_METHODS.includes(selectedAnalysisMethod);
  const isLegacyMethod = selectedAnalysisMethod && LEGACY_METHODS.includes(selectedAnalysisMethod);

  // Store metadata
  const privateMetadata = JSON.stringify({
    selectedStudyId,
    selectedAnalysisMethod,
  } satisfies SynthesisModalMetadata);

  // Build grounding block — merged session data + enrichments (R10: one subordinate context block)
  const groundingBlocks: Record<string, unknown>[] = [];
  if (cascadeData && isCascadeAware) {
    if (cascadeData.sessionStats && cascadeData.sessionStats.totalSessions > 0) {
      const stats = cascadeData.sessionStats;

      // Session summary line
      const sessionLine = `${stats.totalSessions} session${stats.totalSessions !== 1 ? 's' : ''} • ${stats.totalNuggets} nuggets`;

      // R5: Translate enrichment labels to researcher language
      // "participant metadata" → "participant", drop system suffixes
      const translateLabel = (label: string): string => {
        return label
          .toLowerCase()
          .replace(/ metadata$/, '')  // "participant metadata" → "participant"
          .replace(/_/g, ' ');        // snake_case → spaces
      };

      // Build enrichments list if any
      const enrichmentItems = cascadeData.enrichments.length > 0
        ? cascadeData.enrichments.map(e => `${e.count} ${translateLabel(e.label)}`).join(' • ')
        : '';

      // Combine into one grounding line
      const groundingLine = enrichmentItems
        ? `${sessionLine} • ${enrichmentItems}`
        : sessionLine;

      groundingBlocks.push(
        { type: "divider" },
        {
          type: "context",
          block_id: "grounding_info",
          elements: [{
            type: "mrkdwn",
            text: `*Using:*  ${groundingLine}`,
          }],
        }
      );
    } else if (!cascadeData.readyToRun) {
      // No session data — hard fail state
      groundingBlocks.push(
        { type: "divider" },
        {
          type: "context",
          block_id: "session_data_missing",
          elements: [{
            type: "mrkdwn",
            text: `:warning: *No session data* — run \`/qori-analyze\` first`,
          }],
        }
      );
    }
  }

  // Build missing required warning (R10: context blocks)
  const missingRequiredBlocks: Record<string, unknown>[] = [];
  if (cascadeData && cascadeData.missingRequired.length > 0) {
    const missingList = cascadeData.missingRequired
      .map(m => `• ${m.label} — ${m.hint}`)
      .join('\n');

    missingRequiredBlocks.push(
      { type: "divider" },
      {
        type: "context",
        block_id: "missing_required_info",
        elements: [{
          type: "mrkdwn",
          text: `:warning: *Missing required inputs*\n${missingList}\n_Complete these steps, then re-open this modal._`,
        }],
      }
    );
  }

  // Build legacy method notice (R1: no decorative emoji, R10: context block)
  const legacyNoticeBlocks: Record<string, unknown>[] = [];
  if (isLegacyMethod) {
    legacyNoticeBlocks.push(
      { type: "divider" },
      {
        type: "context",
        block_id: "legacy_method_notice",
        elements: [{
          type: "mrkdwn",
          text: `*Service Blueprint* uses legacy file-based input. This method will be upgraded in a future release.`,
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
    submit: {
      type: "plain_text",
      text: "Generate",  // R2: "Run Analysis" → "Generate"
    },
    close: {
      type: "plain_text",
      text: "Cancel",
    },
    private_metadata: privateMetadata,
    blocks: [
      // Study Selection — PRIMARY (R1: no emoji, R7: required marking, R10: prominent)
      {
        type: "input",
        block_id: "study_select_block",
        label: { type: "plain_text", text: "Study *" },
        element: {
          type: "static_select",
          action_id: "study_select_synthesize",
          placeholder: { type: "plain_text", text: "Select a study..." },
          options: studyOptions.length > 0 ? studyOptions : [
            { text: { type: "plain_text", text: "No research studies found" }, value: "no_studies" },
          ],
          initial_option: selectedStudy ? {
            text: { type: "plain_text", text: truncateName(selectedStudy.name) },
            value: selectedStudy.id.toString(),
          } : undefined,
        },
      },

      { type: "divider" },

      // Synthesis Type — PRIMARY (R1: no emoji, R4: "Synthesis" not "Analysis", R7: required, R10: prominent)
      (() => {
        // R1: Remove ALL decorative emoji from options
        const synthesisMethodOptions = [
          {
            text: { type: "plain_text", text: "Affinity Mapping • Group findings" },
            value: "affinity_mapping",
          },
          {
            text: { type: "plain_text", text: "Journey Mapping • Map experiences" },
            value: "journey_mapping",
          },
          {
            text: { type: "plain_text", text: "Persona Generation • Create personas" },
            value: "persona_generation",
          },
          {
            text: { type: "plain_text", text: "Jobs to Be Done • Extract user jobs" },
            value: "jobs_to_be_done",
          },
          {
            text: { type: "plain_text", text: "Usability Issues • Prioritize problems" },
            value: "usability_issues",
          },
          {
            text: { type: "plain_text", text: "Design Opportunities • Generate HMWs" },
            value: "design_opportunities",
          },
        ];

        const methodValue = selectedAnalysisMethod || "affinity_mapping";
        const matchingOption = synthesisMethodOptions.find(opt => opt.value === methodValue);
        const initialOption = matchingOption || synthesisMethodOptions[0];

        return {
          type: "input",
          block_id: "analysis_method_selection",
          dispatch_action: true, // Fire action on radio change to update enrichments
          label: { type: "plain_text", text: "Synthesis method *" },  // R4 & R7
          element: {
            type: "radio_buttons",
            action_id: "analysis_method",
            options: synthesisMethodOptions,
            initial_option: initialOption,
          },
        };
      })(),

      // Grounding info — merged session data + enrichments (subordinate)
      ...groundingBlocks,

      // Missing required warnings
      ...missingRequiredBlocks,

      // Legacy method notice
      ...legacyNoticeBlocks,

    ],
  } as unknown as View;
};
