/**
 * Codebook Generator — model-based draft generation for qualitative coding.
 *
 * Generates structured JSON output proposing response categories from
 * approved qualitative evidence. Uses mixed inductive/deductive approach.
 *
 * Uses the existing LangChain/ChatAnthropic pattern consistent with
 * langchain.ts and variableExtractor.ts. Provider/model identity is
 * recorded in generation metadata.
 *
 * Rules:
 * - Target 3-12 codes, hard max 12, no hard minimum (1-2 valid when evidence supports it)
 * - No prevalence/frequency claims
 * - No "theme/themes" terminology
 * - Every proposed code references ≥1 valid entry public_id
 * - Invalid model output (prohibited language) → reject + bounded retry, not silent strip
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { getAnalysisEligibleContent } from '../../services/content-governance.service';
import type { SurveyQualitativeEntry } from '../../database/models/survey_qualitative_entry';

const MAX_CODES = 12;
const MAX_RETRIES = 1;

export type AnalyticRelevance = 'research' | 'governance_only';

export interface GeneratedCode {
  code_key: string;
  label: string;
  definition: string;
  include_when: string;
  exclude_when?: string;
  example_entry_public_ids: string[];
  /** Whether this grouping is substantive research or governance metadata. */
  analytic_relevance?: AnalyticRelevance;
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

  // Build entry context using governance accessor only
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

  // Use existing LangChain/ChatAnthropic pattern (consistent with langchain.ts)
  const modelName = process.env.ANTHROPIC_MODEL_NAME || 'claude-sonnet-4-6';
  const model = new ChatAnthropic({
    modelName,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    maxTokens: 4096,
    temperature: 0,
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const effectivePrompt = attempt === 0 ? prompt : prompt + RETRY_CORRECTION;

    const response = await model.invoke(effectivePrompt);
    const responseText = typeof response.content === 'string'
      ? response.content
      : response.content.map(c => (c as { text: string }).text).join('');

    try {
      const codes = parseCodebookResponse(responseText);
      const validated = validateCodes(codes, validPublicIds);
      return validated;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        console.warn(`[codebook] Attempt ${attempt + 1} failed: ${lastError.message}. Retrying with corrective instruction.`);
        continue;
      }
    }
  }

  throw new CodebookGenerationError(
    `Codebook generation failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`,
  );
}

const RETRY_CORRECTION = `

CORRECTION: Your previous response was rejected because it contained prohibited language or structural issues. Please:
1. Do NOT use the words "theme" or "themes" — use "category," "observation type," or "grouping"
2. Do NOT include frequency counts, prevalence claims, or percentages
3. Ensure every code references at least one valid entry [public_id] from the data above
4. Output valid JSON only`;

function buildCodebookPrompt(
  entryContext: string,
  researchProblem: string | null,
  focusQuestions: string | null,
  entryCount: number,
): string {
  const targetMax = Math.min(MAX_CODES, Math.max(1, Math.ceil(entryCount / 2)));
  return `You are proposing response categories for structured qualitative content analysis of survey open-text responses.

============================================================
RULES
============================================================

1. Propose up to ${targetMax} categories (maximum ${MAX_CODES}). Fewer is acceptable — even 1 or 2 — if the evidence genuinely supports fewer. Do NOT invent categories to fill a quota.

2. Each category must represent ONE analytically coherent observation type. Avoid overlapping categories.

3. Use plain-language labels. Do NOT use:
   - "theme" or "themes"
   - prevalence claims ("most respondents," "frequently")
   - frequency counts or percentages

4. Every category must reference at least one supporting entry by its [public_id] from the data below.

5. Do NOT:
   - invent respondent IDs
   - calculate counts
   - claim formal thematic analysis
   - make causal claims

6. Use a mixed inductive/deductive approach:
   - Attend to the research problem and focus questions (deductive)
   - Allow categories to emerge from the evidence (inductive)

7. ANALYTIC RELEVANCE: Every category must be classified as either:
   - "research" — substantively relevant to the research problem/question.
     Describes what respondents experienced, thought, or described about
     the topic under study.
   - "governance_only" — describes a privacy/data-handling property rather
     than substantive content. Examples: contact information offered,
     sensitive personal disclosure, third-party mention, redaction state.
     These categories are important for data governance but are NOT
     research findings about the topic.

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
      "example_entry_public_ids": ["uuid-from-entries-above"],
      "analytic_relevance": "research"
    }
  ]
}

IMPORTANT: analytic_relevance is REQUIRED. Use "research" for substantive findings about the research topic. Use "governance_only" for categories that describe data properties (PII, contact info, sensitive disclosure) rather than research content.`;
}

function parseCodebookResponse(responseText: string): GeneratedCode[] {
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

/** Prohibited language patterns that invalidate analytic codes. */
const PROHIBITED_PATTERNS = /\btheme\b|\bthemes\b|\bmost respondents\b|\bfrequently\b|\bcommonly\b|\bprevalence\b|\brecurring\b/i;

function validateCodes(
  codes: GeneratedCode[],
  validPublicIds: Set<string>,
): GeneratedCode[] {
  // Hard maximum
  if (codes.length > MAX_CODES) {
    throw new CodebookGenerationError(`Codebook exceeds maximum ${MAX_CODES} codes (got ${codes.length}).`);
  }

  const validatedCodes: GeneratedCode[] = [];

  for (const code of codes) {
    // Required fields
    if (!code.code_key || !code.label || !code.definition || !code.include_when) {
      throw new CodebookGenerationError(`Code "${code.label ?? 'unknown'}" missing required fields.`);
    }

    // Check for prohibited language — reject, do not silently strip
    if (PROHIBITED_PATTERNS.test(code.label) || PROHIBITED_PATTERNS.test(code.definition)) {
      throw new CodebookGenerationError(
        `Code "${code.label}" contains prohibited qualitative authority language. ` +
        `Do not use "theme," "prevalence," "frequently," "commonly," or "recurring."`,
      );
    }

    // Validate example references — unsupported codes rejected
    const validExamples = code.example_entry_public_ids.filter(id => validPublicIds.has(id));
    if (validExamples.length === 0) {
      throw new CodebookGenerationError(
        `Code "${code.label}" has no valid supporting entry references. ` +
        `Every Qori-proposed code must reference at least one supplied entry.`,
      );
    }

    validatedCodes.push({
      ...code,
      example_entry_public_ids: validExamples,
      analytic_relevance: code.analytic_relevance === 'governance_only' ? 'governance_only' : 'research',
    });
  }

  if (validatedCodes.length === 0) {
    throw new CodebookGenerationError('No valid codes produced.');
  }

  return validatedCodes;
}
