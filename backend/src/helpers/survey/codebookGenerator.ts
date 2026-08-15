/**
 * Codebook Generator — model-based draft generation for qualitative coding.
 *
 * Generates structured JSON output proposing 3-12 response categories
 * from approved qualitative evidence. Uses mixed inductive/deductive
 * approach: research problem + focus questions inform what Qori attends
 * to, but categories may emerge directly from respondent evidence.
 *
 * Rules:
 * - No prevalence/frequency claims
 * - No "theme/themes" terminology
 * - No invented respondent IDs
 * - Every proposed code references ≥1 valid entry public_id
 * - Model cannot mark codebook accepted
 * - Model cannot calculate counts
 *
 * All input entries must have analysis-eligible privacy status.
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { getAnalysisEligibleContent } from '../../services/content-governance.service';
import type { SurveyQualitativeEntry } from '../../database/models/survey_qualitative_entry';

const MAX_CODES = 12;

export interface GeneratedCode {
  code_key: string;
  label: string;
  definition: string;
  include_when: string;
  exclude_when?: string;
  example_entry_public_ids: string[];
}

export class CodebookGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodebookGenerationError';
  }
}

/**
 * Generate a draft codebook from approved qualitative entries.
 *
 * @param entries — analysis-eligible entries (already privacy-cleared)
 * @param researchProblem — project problem statement
 * @param focusQuestions — survey focus questions
 * @returns Array of proposed codes with supporting entry references
 */
export async function generateDraftCodes(
  entries: SurveyQualitativeEntry[],
  researchProblem: string | null,
  focusQuestions: string | null,
): Promise<GeneratedCode[]> {
  if (entries.length === 0) {
    throw new CodebookGenerationError('No analysis-eligible entries available for codebook generation.');
  }

  // Build entry context using governance accessor
  const entryContext = entries
    .map(e => {
      const text = getAnalysisEligibleContent(e);
      if (!text) return null;
      return `[${e.public_id}] ${e.display_respondent_id} (${e.field_display_name}): "${text}"`;
    })
    .filter(Boolean)
    .join('\n');

  const validPublicIds = new Set(entries.map(e => e.public_id));

  const prompt = buildCodebookPrompt(entryContext, researchProblem, focusQuestions, validPublicIds.size);

  const model = new ChatAnthropic({
    modelName: process.env.ANTHROPIC_MODEL_NAME || 'claude-sonnet-4-6',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    maxTokens: 4096,
    temperature: 0,
  });

  const response = await model.invoke(prompt);
  const responseText = typeof response.content === 'string'
    ? response.content
    : response.content.map(c => (c as { text: string }).text).join('');

  // Parse JSON from response
  const codes = parseCodebookResponse(responseText);

  // Validate
  return validateCodes(codes, validPublicIds);
}

function buildCodebookPrompt(
  entryContext: string,
  researchProblem: string | null,
  focusQuestions: string | null,
  entryCount: number,
): string {
  return `You are proposing response categories for structured qualitative content analysis of survey open-text responses.

============================================================
RULES
============================================================

1. Propose ${Math.min(MAX_CODES, Math.max(1, Math.ceil(entryCount / 3)))}–${MAX_CODES} categories. Fewer is acceptable if the evidence supports fewer. Do NOT invent categories to fill a quota.

2. Each category must represent ONE analytically coherent observation type. Avoid overlapping categories where possible.

3. Use plain-language labels. Do NOT use:
   - "theme" or "themes"
   - prevalence claims ("most respondents," "frequently")
   - frequency counts
   - percentages

4. Every category must reference at least one supporting entry by its [public_id].

5. Do NOT:
   - invent respondent IDs
   - calculate counts
   - claim formal thematic analysis
   - make causal claims

6. Use a mixed inductive/deductive approach:
   - Attend to the research problem and focus questions (deductive)
   - Allow categories to emerge from the evidence (inductive)

============================================================
CONTEXT
============================================================

${researchProblem ? `Research Problem: ${researchProblem}\n` : ''}
${focusQuestions ? `Focus Questions: ${focusQuestions}\n` : ''}

============================================================
OPEN-TEXT ENTRIES (${entryCount} eligible)
============================================================

${entryContext}

============================================================
OUTPUT FORMAT — STRICT JSON
============================================================

Respond with ONLY a JSON object. No markdown, no explanation.

{
  "codes": [
    {
      "code_key": "lowercase_underscore_key",
      "label": "Plain Language Label",
      "definition": "What this category means — one coherent analytical idea",
      "include_when": "When a response should receive this category",
      "exclude_when": "When a response should NOT receive this category (optional)",
      "example_entry_public_ids": ["uuid-from-entries-above"]
    }
  ]
}`;
}

function parseCodebookResponse(responseText: string): GeneratedCode[] {
  // Extract JSON from response (may have markdown fences)
  let jsonStr = responseText.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  let parsed: { codes: GeneratedCode[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new CodebookGenerationError(`Failed to parse codebook response as JSON: ${jsonStr.slice(0, 200)}...`);
  }

  if (!parsed.codes || !Array.isArray(parsed.codes)) {
    throw new CodebookGenerationError('Codebook response missing "codes" array.');
  }

  return parsed.codes;
}

function validateCodes(
  codes: GeneratedCode[],
  validPublicIds: Set<string>,
): GeneratedCode[] {
  if (codes.length > MAX_CODES) {
    throw new CodebookGenerationError(`Codebook exceeds maximum ${MAX_CODES} codes (got ${codes.length}).`);
  }

  const validatedCodes: GeneratedCode[] = [];

  for (const code of codes) {
    if (!code.code_key || !code.label || !code.definition || !code.include_when) {
      throw new CodebookGenerationError(`Code "${code.label ?? 'unknown'}" missing required fields.`);
    }

    // Validate example references
    const validExamples = code.example_entry_public_ids.filter(id => validPublicIds.has(id));
    if (validExamples.length === 0) {
      // Unsupported code — skip rather than fail entirely
      console.warn(`[codebook] Skipping code "${code.label}" — no valid supporting entry references.`);
      continue;
    }

    // Check for theme/prevalence language in definition
    const prohibitedPatterns = /\btheme\b|\bthemes\b|\bmost respondents\b|\bfrequently\b|\bcommonly\b/i;
    if (prohibitedPatterns.test(code.definition) || prohibitedPatterns.test(code.label)) {
      // Strip prohibited language rather than reject the entire code
      code.definition = code.definition.replace(prohibitedPatterns, '[observation]');
      code.label = code.label.replace(prohibitedPatterns, 'Observation');
    }

    validatedCodes.push({
      ...code,
      example_entry_public_ids: validExamples,
    });
  }

  if (validatedCodes.length === 0) {
    throw new CodebookGenerationError('No valid codes produced. All proposed codes lacked supporting entry references.');
  }

  return validatedCodes;
}
