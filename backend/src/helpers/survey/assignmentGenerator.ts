/**
 * Assignment Generator — model-based draft matching of entries to accepted codes.
 *
 * For each privacy-eligible qualitative entry, proposes zero or more
 * grouping matches from the accepted codebook. Uses the existing
 * Uses the shared model provider boundary (modelProvider.ts).
 *
 * Rules:
 * - Every entry_public_id must exist in the supplied entry set
 * - Every code_public_id must exist in the supplied code set
 * - Zero matches per entry is explicitly valid
 * - No prevalence/frequency claims, no counts, no "theme" language
 * - Temperature 0 for deterministic output
 * - Invalid model output → reject + bounded retry
 */

import { createModel } from '../modelProvider';
import { getAnalysisEligibleContent } from '../../services/content-governance.service';
import type { SurveyQualitativeEntry } from '../../database/models/survey_qualitative_entry';

const MAX_RETRIES = 1;

export interface GeneratedAssignment {
  qualitative_entry_public_id: string;
  code_public_ids: string[];
  rationale: string;
}

export interface AcceptedCodeInput {
  public_id: string;
  label: string;
  definition: string;
  include_when: string;
  exclude_when: string | null;
}

export class AssignmentGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssignmentGenerationError';
  }
}

/**
 * Generate draft entry-to-code assignments from approved entries and accepted codes.
 *
 * @param entries — analysis-eligible entries (already privacy-cleared)
 * @param acceptedCodes — accepted codes from the codebook
 * @param researchProblem — project problem statement
 * @param focusQuestions — survey focus questions
 * @returns Array of proposed assignments (entry → code matches with rationale)
 */
export async function generateDraftAssignments(
  entries: SurveyQualitativeEntry[],
  acceptedCodes: AcceptedCodeInput[],
  researchProblem: string | null,
  focusQuestions: string | null,
): Promise<GeneratedAssignment[]> {
  if (entries.length === 0) {
    throw new AssignmentGenerationError('No analysis-eligible entries available for assignment generation.');
  }
  if (acceptedCodes.length === 0) {
    throw new AssignmentGenerationError('No accepted codes available for assignment generation.');
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

  const validEntryIds = new Set(entries.map(e => e.public_id));
  const validCodeIds = new Set(acceptedCodes.map(c => c.public_id));

  // Build code context
  const codeContext = acceptedCodes
    .map(c => {
      const parts = [`[${c.public_id}] ${c.label}: ${c.definition} | Include: ${c.include_when}`];
      if (c.exclude_when) parts.push(`| Exclude: ${c.exclude_when}`);
      return parts.join(' ');
    })
    .join('\n');

  const prompt = buildAssignmentPrompt(entryContext, codeContext, researchProblem, focusQuestions, validEntryIds.size, acceptedCodes.length);

  const model = createModel({ tier: 'sonnet', temperature: 0, maxTokens: 4096, purpose: 'assignment-generation' });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const effectivePrompt = attempt === 0 ? prompt : prompt + RETRY_CORRECTION;

    const response = await model.invoke(effectivePrompt);
    const responseText = typeof response.content === 'string'
      ? response.content
      : response.content.map(c => (c as { text: string }).text).join('');

    try {
      const assignments = parseAssignmentResponse(responseText);
      const validated = validateAssignments(assignments, validEntryIds, validCodeIds);
      return validated;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        console.warn(`[assignments] Attempt ${attempt + 1} failed: ${lastError.message}. Retrying with corrective instruction.`);
        continue;
      }
    }
  }

  throw new AssignmentGenerationError(
    `Assignment generation failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`,
  );
}

const RETRY_CORRECTION = `

CORRECTION: Your previous response was rejected. Please:
1. Use ONLY entry [public_id] values from the ENTRIES section above — do NOT invent IDs
2. Use ONLY code [public_id] values from the GROUPINGS section above — do NOT invent IDs
3. Do NOT include frequency counts, prevalence claims, or percentages in rationale
4. Do NOT use the words "theme" or "themes"
5. An empty code_public_ids array is valid when no grouping fits
6. Output valid JSON only`;

function buildAssignmentPrompt(
  entryContext: string,
  codeContext: string,
  researchProblem: string | null,
  focusQuestions: string | null,
  entryCount: number,
  codeCount: number,
): string {
  return `You are matching survey open-text responses to researcher-approved groupings for structured qualitative content analysis.

============================================================
RULES
============================================================

1. For each entry, decide which groupings (if any) apply. An entry may match:
   - Zero groupings (no good fit — this is valid)
   - One grouping
   - Multiple groupings (when genuinely applicable)

2. Use ONLY the entry [public_id] values from the ENTRIES section below.
   Do NOT invent, fabricate, or guess entry IDs.

3. Use ONLY the code [public_id] values from the GROUPINGS section below.
   Do NOT invent, fabricate, or guess grouping IDs.

4. Every entry in the ENTRIES section must appear exactly once in your output.

5. Provide a brief rationale (1-2 sentences) for each match decision.

6. Do NOT:
   - Calculate counts, frequencies, or percentages
   - Use "theme" or "themes"
   - Make prevalence claims ("most respondents," "frequently," "commonly")
   - Invent new groupings
   - Make causal claims

7. Apply groupings according to their "Include" criteria.
   Do NOT apply when "Exclude" criteria match.

============================================================
CONTEXT
============================================================

${researchProblem ? `Research Problem: ${researchProblem}\n` : ''}${focusQuestions ? `Focus Questions: ${focusQuestions}\n` : ''}
============================================================
GROUPINGS (${codeCount} approved)
============================================================

${codeContext}

============================================================
ENTRIES (${entryCount} eligible)
============================================================

${entryContext}

============================================================
OUTPUT FORMAT — STRICT JSON
============================================================

Respond with ONLY a JSON object. No markdown, no explanation.

{
  "assignments": [
    {
      "qualitative_entry_public_id": "uuid-from-entries-above",
      "code_public_ids": ["uuid-from-groupings-above"],
      "rationale": "Brief explanation of why these groupings apply or why none apply"
    }
  ]
}`;
}

function parseAssignmentResponse(responseText: string): GeneratedAssignment[] {
  let jsonStr = responseText.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  let parsed: { assignments: GeneratedAssignment[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new AssignmentGenerationError(`Failed to parse assignment response as JSON: ${jsonStr.slice(0, 200)}...`);
  }

  if (!parsed.assignments || !Array.isArray(parsed.assignments)) {
    throw new AssignmentGenerationError('Assignment response missing "assignments" array.');
  }

  return parsed.assignments;
}

/** Prohibited language patterns. */
const PROHIBITED_PATTERNS = /\btheme\b|\bthemes\b|\bmost respondents\b|\bfrequently\b|\bcommonly\b|\bprevalence\b/i;

/** Prohibited counting patterns in rationale. */
const COUNTING_PATTERNS = /\b\d+\s*(?:respondents?|participants?|people|entries|responses)\b|\b\d+\s*(?:out of|of)\s*\d+\b|\b\d+%/i;

export function validateAssignments(
  assignments: GeneratedAssignment[],
  validEntryIds: Set<string>,
  validCodeIds: Set<string>,
): GeneratedAssignment[] {
  for (const assignment of assignments) {
    // Required fields
    if (!assignment.qualitative_entry_public_id || !assignment.rationale) {
      throw new AssignmentGenerationError(
        `Assignment missing required fields (qualitative_entry_public_id, rationale).`,
      );
    }

    if (!Array.isArray(assignment.code_public_ids)) {
      throw new AssignmentGenerationError(
        `Assignment for entry "${assignment.qualitative_entry_public_id}" has non-array code_public_ids.`,
      );
    }

    // Validate entry ID exists in supplied set
    if (!validEntryIds.has(assignment.qualitative_entry_public_id)) {
      throw new AssignmentGenerationError(
        `Assignment references unknown entry "${assignment.qualitative_entry_public_id}". ` +
        `Only entry IDs from the supplied data are allowed.`,
      );
    }

    // Validate code IDs exist in supplied set
    for (const codeId of assignment.code_public_ids) {
      if (!validCodeIds.has(codeId)) {
        throw new AssignmentGenerationError(
          `Assignment references unknown code "${codeId}". ` +
          `Only code IDs from the accepted groupings are allowed.`,
        );
      }
    }

    // Check for prohibited language in rationale
    if (PROHIBITED_PATTERNS.test(assignment.rationale)) {
      throw new AssignmentGenerationError(
        `Assignment rationale contains prohibited language. ` +
        `Do not use "theme," "prevalence," "frequently," or "commonly."`,
      );
    }

    // Check for counting in rationale
    if (COUNTING_PATTERNS.test(assignment.rationale)) {
      throw new AssignmentGenerationError(
        `Assignment rationale contains counts or percentages. ` +
        `The model must not count, calculate frequencies, or claim prevalence.`,
      );
    }
  }

  return assignments;
}
