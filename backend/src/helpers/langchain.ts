import nunjucks from 'nunjucks';
import { ChatAnthropic } from '@langchain/anthropic';

// make sure nunjucks knows it's okay to render standalone strings
nunjucks.configure({ autoescape: false });

interface AiGenerationTask {
  task_id: string;
  prompt: string;
  output_format?: string;
  [key: string]: unknown;
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
): Promise<AiResponses> {
  const modelName = process.env.ANTHROPIC_MODEL_NAME || 'claude-sonnet-4-20250514';
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
      const nunjucksTemplate = convertHandlebarsToNunjucks(task.prompt);
      const jinjaOut = nunjucks.renderString(nunjucksTemplate, safeInputValues);
      const finalPrompt = unescapeNunjucksSyntax(jinjaOut);

      const response = await llm.invoke(finalPrompt);
      return { taskId: task.task_id, response: response.content as string };
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
