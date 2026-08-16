import nunjucks from 'nunjucks';
import { ChatAnthropic } from '@langchain/anthropic';
import { assertKnownNamesRedacted } from './piiRedaction';

// Default environment for prompt rendering — tolerates undefined variables
// because templates use {% if upstream_foo %} guards against optional data.
// Used at line 137 for nunjucks.renderString().
nunjucks.configure({ autoescape: false });

// Jinja keywords that should not be treated as variable references in skip_when
const JINJA_KEYWORDS = new Set(['not', 'and', 'or', 'true', 'false', 'none', 'null', 'is', 'in']);

/**
 * Extract variable names from a skip_when expression and verify they exist in inputValues.
 * Throws if any referenced variable is undefined (not just empty), preventing typos from
 * silently skipping tasks.
 *
 * CONSTRAINT: skip_when supports plain variable references and boolean keywords only.
 * Examples that work: "not upstream_foo", "not upstream_foo and not upstream_bar"
 * Examples that will false-positive throw: string literals ("foo"), filter names (x | default),
 * property access (foo.bar). These are extracted as variable names and fail the existence check.
 * Fails safe — unsupported syntax throws rather than silently misbehaving.
 */
function assertSkipWhenVariablesDefined(
  expression: string,
  inputValues: Record<string, unknown>,
  taskId: string
): void {
  // Extract words that look like variable names (snake_case identifiers)
  const matches = expression.match(/\b[a-z_][a-z0-9_]*\b/gi) || [];
  const referencedVars = matches.filter(v => !JINJA_KEYWORDS.has(v.toLowerCase()));

  for (const varName of referencedVars) {
    if (!(varName in inputValues)) {
      throw new Error(
        `skip_when in task "${taskId}" references undefined variable "${varName}". ` +
        `Check for typos. Available variables: ${Object.keys(inputValues).filter(k => k.startsWith('upstream_')).join(', ')}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// PII redaction context (H9)
// ---------------------------------------------------------------------------

/**
 * Optional PII context passed to executeAiGenerationTasks.
 * If provided, the assertion is run BEFORE each LLM API call.
 * If any known name is detected in the prompt, the call is ABORTED.
 */
export interface PiiRedactionContext {
  /** Participant names that should have been redacted */
  knownNames: Array<string | null | undefined>;
  /** Participant code that should appear instead */
  participantCode?: string;
}

interface AiGenerationTask {
  task_id: string;
  prompt: string;
  output_format?: string;
  /** Per-task model override. When set, this task uses the specified model
   * instead of the default. Used for trivial transforms on Haiku. */
  model?: string;
  /** Jinja expression evaluated against inputValues. If truthy, task is skipped
   * and skip_output is returned instead of calling the LLM. Prevents fabrication
   * when upstream data is absent. */
  skip_when?: string;
  /** Literal string returned when skip_when evaluates to true. No LLM call. */
  skip_output?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Post-generation validation (claim guard)
// ---------------------------------------------------------------------------

export interface ClaimViolationLike {
  class: string;
  description: string;
  evidence: string;
}

export interface PostGenerationValidation {
  /** Which task IDs to validate. If empty, no validation runs. */
  taskIds: Set<string>;
  /** Validate generated text. Return violations or empty array. */
  validate: (taskId: string, text: string) => ClaimViolationLike[];
  /** Build retry guidance from violations. Prepended to prompt on retry. */
  buildRetryGuidance: (violations: ClaimViolationLike[]) => string;
  /** Deterministic fallback text when retry also fails. Per task ID. */
  fallbackText: (taskId: string) => string;
}

type AiResponses = Record<string, string>;

// Convert Handlebars-style conditionals to Nunjucks syntax
// This allows templates to use either Handlebars {{#if}} or Nunjucks {% if %} syntax
function convertHandlebarsToNunjucks(template: string): string {
  let converted = template;

  // IMPORTANT: Convert {{else}} FIRST to prevent Nunjucks from parsing it as a variable
  converted = converted.replace(/\{\{else\}\}/g, '{% else %}');
  converted = converted.replace(/\{\{#if\s+(\w+)\s*\}\}/g, '{% if $1 %}');
  converted = converted.replace(/\{\{#unless\s+(\w+)\s*\}\}/g, '{% if not $1 %}');
  converted = converted.replace(/\{\{\/if\}\}/g, '{% endif %}');
  converted = converted.replace(/\{\{#each\s+(\w+)\s*\}\}/g, '{% for item in $1 %}');
  converted = converted.replace(/\{\{\/each\}\}/g, '{% endfor %}');

  return converted;
}

/**
 * Escape Nunjucks template syntax in a string value.
 * Prevents participant quotes containing {{ }}, {% %} etc. from being
 * interpreted as template logic during nunjucks.renderString().
 */
function escapeNunjucksSyntax(str: string): string {
  if (typeof str !== 'string') return str;
  return str
    .replace(/\{%/g, '{_PCT_')
    .replace(/%\}/g, '_PCT_}')
    .replace(/\{\{/g, '{_DBL_')
    .replace(/\}\}/g, '_DBL_}');
}

/**
 * Restore escaped Nunjucks syntax after rendering.
 * Reverses the escaping so the LLM sees the original text.
 */
function unescapeNunjucksSyntax(str: string): string {
  if (typeof str !== 'string') return str;
  return str
    .replace(/\{_PCT_/g, '{%')
    .replace(/_PCT_\}/g, '%}')
    .replace(/\{_DBL_/g, '{{')
    .replace(/_DBL_\}/g, '}}');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeAiGenerationTasks(
  aiGenerationTasks: AiGenerationTask[],
  inputValues: Record<string, any>,
  piiContext?: PiiRedactionContext,
): Promise<AiResponses> {
  // Extract post-generation validation from inputValues if present.
  // This avoids changing the processYamlTemplate signature chain.
  const postValidation = inputValues.__postValidation as PostGenerationValidation | undefined;
  const modelName = process.env.ANTHROPIC_MODEL_NAME || 'claude-sonnet-4-6';
  const temperature = parseFloat(process.env.ANTHROPIC_TEMPERATURE || '0.4');
  const maxTokens = parseInt(process.env.ANTHROPIC_MAX_TOKENS || '8192', 10);

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
  }

  const llm = new ChatAnthropic({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    modelName,
    temperature,
    maxTokens,
  });

  // Escape Nunjucks-sensitive sequences in upstream data to prevent
  // participant quotes like "I typed {{username}}" from crashing the renderer
  const safeInputValues: Record<string, unknown> = { ...inputValues };
  for (const [key, val] of Object.entries(safeInputValues)) {
    if (typeof val === 'string' && (key.startsWith('upstream_') || key === 'combined_file_content')) {
      safeInputValues[key] = escapeNunjucksSyntax(val);
    }
  }

  const aiResponses: AiResponses = {};

  const taskPromises = aiGenerationTasks.map(async (task) => {
    try {
      // Skip-task guard: if skip_when evaluates truthy, return skip_output without LLM call.
      // Prevents fabrication when upstream data is absent.
      // assertSkipWhenVariablesDefined throws on typos (undefined vars) before evaluation.
      if (task.skip_when) {
        assertSkipWhenVariablesDefined(task.skip_when, safeInputValues, task.task_id);
        const skipCondition = nunjucks.renderString(`{{ ${task.skip_when} }}`, safeInputValues);
        if (skipCondition.trim().toLowerCase() === 'true') {
          console.log(`⏭️  Skipping task ${task.task_id}: skip_when condition met`);
          return { taskId: task.task_id, response: task.skip_output || '' };
        }
      }

      const nunjucksTemplate = convertHandlebarsToNunjucks(task.prompt);
      const jinjaOut = nunjucks.renderString(nunjucksTemplate, safeInputValues);
      const finalPrompt = unescapeNunjucksSyntax(jinjaOut);

      // H9: Pre-transmission PII assertion — FAIL CLOSED if known names detected
      // This is the LAST check before data crosses the wire to Anthropic
      if (piiContext?.knownNames?.length) {
        assertKnownNamesRedacted(
          finalPrompt,
          piiContext.knownNames,
          piiContext.participantCode,
        );
      }

      // Per-task model override (P4 ruling: trivial transforms on Haiku)
      const taskLlm = task.model && task.model !== modelName
        ? new ChatAnthropic({
            anthropicApiKey: process.env.ANTHROPIC_API_KEY,
            modelName: task.model,
            temperature,
            maxTokens,
          })
        : llm;
      const response = await taskLlm.invoke(finalPrompt);
      let responseText = response.content as string;

      // Post-generation claim guard: validate + bounded retry
      if (postValidation?.taskIds.has(task.task_id)) {
        const violations = postValidation.validate(task.task_id, responseText);
        if (violations.length > 0) {
          console.warn(
            `⚠️  Claim guard: ${violations.length} violation(s) in task ${task.task_id}: ` +
            violations.map(v => `[${v.class}] ${v.evidence}`).join(', '),
          );
          // Bounded retry: prepend guidance and re-invoke once
          const guidance = postValidation.buildRetryGuidance(violations);
          const retryPrompt = `${guidance}\n\n---\n\n${finalPrompt}`;
          const retryResponse = await taskLlm.invoke(retryPrompt);
          const retryText = retryResponse.content as string;

          const retryViolations = postValidation.validate(task.task_id, retryText);
          if (retryViolations.length > 0) {
            console.error(
              `❌ Claim guard: retry still has ${retryViolations.length} violation(s) in task ${task.task_id}. ` +
              `Using deterministic fallback.`,
            );
            responseText = postValidation.fallbackText(task.task_id);
          } else {
            console.log(`✅ Claim guard: retry for task ${task.task_id} passed validation`);
            responseText = retryText;
          }
        }
      }

      return { taskId: task.task_id, response: responseText };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error processing task ${task.task_id}:`, message);
      throw err;
    }
  });

  (await Promise.all(taskPromises)).forEach(({ taskId, response }) => {
    aiResponses[taskId] = response;
  });

  return aiResponses;
}
