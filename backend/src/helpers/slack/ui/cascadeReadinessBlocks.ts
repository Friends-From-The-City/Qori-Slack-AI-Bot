// cascadeReadinessBlocks.ts — Build Slack Block Kit blocks for cascade readiness display
//
// TEMPLATE_CONSUMES is now generated from YAML sources.
// See cascadeRegistry.generated.ts (npm run build:cascade)

import { TEMPLATE_CONSUMES, type ConsumeSpec } from './cascadeRegistry.generated';

// Re-export for consumers that import from this file
export { TEMPLATE_CONSUMES, type ConsumeSpec };

interface AvailableVariable {
  key: string;
  label: string;
  count: number;
  source: string;
  sessions: number;
  required: boolean;
}

interface MissingVariable {
  key: string;
  label: string;
  required: boolean;
  hint: string;
}

interface CascadeData {
  available: AvailableVariable[];
  missing: MissingVariable[];
}

interface VariableValue {
  value?: unknown;
  source?: {
    template?: string;
    dates?: string[];
    date?: string;
  };
}

interface StudyVars {
  variables: Record<string, VariableValue>;
}

/**
 * Build cascade readiness from study variables for a given template.
 */
function buildCascadeReadiness(studyVars: StudyVars, templateKey: string): CascadeData | null {
  const consumes = TEMPLATE_CONSUMES[templateKey];
  if (!consumes) return null;

  const available: AvailableVariable[] = [];
  const missing: MissingVariable[] = [];

  for (const spec of consumes) {
    const variable = studyVars.variables[spec.key];
    if (variable && variable.value) {
      const count = Array.isArray(variable.value) ? variable.value.length : 1;
      const sourceTemplate = variable.source?.template || 'unknown';
      const sourceDates = variable.source?.dates || (variable.source?.date ? [variable.source.date] : []);
      available.push({
        key: spec.key,
        label: spec.label,
        count,
        source: sourceTemplate,
        sessions: sourceDates.length,
        required: spec.required,
      });
    } else {
      missing.push({
        key: spec.key,
        label: spec.label,
        required: spec.required,
        hint: spec.source_hint,
      });
    }
  }

  return { available, missing };
}

/**
 * Build Slack Block Kit blocks for cascade readiness display.
 *
 * Problem-surfacing, not status recap:
 * - All required + all optional present → return [] (hide block entirely)
 * - All required present, optional missing → return [] (handler fallbacks cover this)
 * - Required missing → show actionable warning listing what's missing and how to fix
 *
 * TemplateContractError at handler submission time is the second line of defense.
 * This block is the first — it warns before the researcher wastes time filling out the form.
 */
function buildCascadeBlocks(cascadeData: CascadeData | null) {
  if (!cascadeData) return [];

  const requiredMissing = cascadeData.missing.filter(v => v.required);

  // Happy path: all required variables present → hide block entirely.
  // Optional missing is fine — handler fallbacks cover it.
  if (requiredMissing.length === 0) return [];

  // Problem state: required variables missing → actionable warning
  const blocks: Record<string, unknown>[] = [
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:warning: *Cannot generate — ${requiredMissing.length} required input${requiredMissing.length > 1 ? 's' : ''} missing*`,
      },
    },
    {
      type: "context",
      block_id: "cascade_missing",
      elements: [
        {
          type: "mrkdwn",
          text: requiredMissing.map(v =>
            `:warning: *${v.label}* — ${v.hint}`
          ).join('\n'),
        },
      ],
    },
    {
      type: "context",
      block_id: "cascade_action",
      elements: [
        {
          type: "mrkdwn",
          text: '_Complete the upstream steps above, then re-open this modal._',
        },
      ],
    },
  ];

  return blocks;
}

export { buildCascadeReadiness, buildCascadeBlocks };
export type { CascadeData };
