/**
 * Template test harness — mocks LLM execution and provides assertion helpers
 * for testing YAML template rendering and cascade variable emission.
 *
 * The harness intercepts calls to executeAiGenerationTasks() and returns
 * canned responses, allowing deterministic testing of template output.
 *
 * Usage:
 *   const harness = createTemplateTestHarness();
 *   harness.mockLlmResponses('research_brief', {
 *     brief_body: 'Mocked brief body content...',
 *   });
 *
 *   const result = await harness.processTemplate('research_brief', inputData);
 *   expect(result.output).toContain('## Executive Summary');
 *   expect(result.emittedVariables).toHaveProperty('research_objectives');
 */

import yaml from 'js-yaml';
import Handlebars from 'handlebars';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface TemplateTestHarness {
  /**
   * Register mock LLM responses for a specific template.
   * Keys are task_ids from the YAML, values are the mock responses.
   */
  mockLlmResponses: (templateId: string, responses: Record<string, string>) => void;

  /**
   * Process a template with mocked LLM responses.
   * Returns the rendered output and emitted cascade variables.
   */
  processTemplate: (
    templateId: string,
    inputData: Record<string, unknown>,
    options?: ProcessOptions,
  ) => Promise<ProcessResult>;

  /**
   * Load and parse a YAML template file.
   */
  loadTemplate: (templateId: string) => YamlConfig;

  /**
   * Clear all registered mocks.
   */
  reset: () => void;
}

export interface ProcessOptions {
  /** Upstream variables to inject (simulates cascade consumption) */
  upstreamVariables?: Record<string, unknown>;
  /** Skip LLM execution entirely (for testing Handlebars-only output) */
  skipLlm?: boolean;
}

export interface ProcessResult {
  /** Rendered Markdown output */
  output: string;
  /** Variables that would be emitted to the cascade store */
  emittedVariables: Record<string, unknown>;
  /** Raw AI responses (task_id → response) */
  aiResponses: Record<string, string>;
  /** Parsed YAML config for inspection */
  config: YamlConfig;
}

export interface YamlConfig {
  id: string;
  version?: string;
  output_template?: string;
  output_options?: {
    filename?: string;
    path?: string;
  };
  ai_generation_tasks?: AiGenerationTask[];
  consumes?: ConsumeSpec[];
  emits?: EmitSpec[];
  discovery_scope?: boolean;
  [key: string]: unknown;
}

interface AiGenerationTask {
  task_id: string;
  prompt: string;
  output_format?: string;
  [key: string]: unknown;
}

interface ConsumeSpec {
  key: string;
  required: boolean;
  inject_as?: string;
  source?: string;
}

interface EmitSpec {
  key: string;
  pool?: boolean;
  pool_strategy?: string;
  schema?: unknown;
  extract_from?: string;
}

// ═══════════════════════════════════════════════════════════
// TEMPLATE PATH RESOLUTION
// ═══════════════════════════════════════════════════════════

const TEMPLATE_DIR = join(__dirname, '../../../../../../config/prompts');

function getTemplatePath(templateId: string): string {
  const filename = templateId.endsWith('.yaml') ? templateId : `${templateId}.yaml`;
  return join(TEMPLATE_DIR, filename);
}

// ═══════════════════════════════════════════════════════════
// HANDLEBARS HELPERS
// ═══════════════════════════════════════════════════════════

// Register common Handlebars helpers used in templates
Handlebars.registerHelper('if_eq', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
  return a === b ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper('unless_eq', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
  return a !== b ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper('length', function (arr: unknown[]) {
  return Array.isArray(arr) ? arr.length : 0;
});

Handlebars.registerHelper('add', function (a: number, b: number) {
  return (a || 0) + (b || 0);
});

Handlebars.registerHelper('pad', function (num: number, width: number) {
  return String(num).padStart(width, '0');
});

// ═══════════════════════════════════════════════════════════
// HARNESS IMPLEMENTATION
// ═══════════════════════════════════════════════════════════

export function createTemplateTestHarness(): TemplateTestHarness {
  const mockedResponses: Map<string, Record<string, string>> = new Map();

  function loadTemplate(templateId: string): YamlConfig {
    const templatePath = getTemplatePath(templateId);
    if (!existsSync(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }
    const content = readFileSync(templatePath, 'utf-8');
    return yaml.load(content) as YamlConfig;
  }

  function mockLlmResponses(templateId: string, responses: Record<string, string>): void {
    mockedResponses.set(templateId, responses);
  }

  async function processTemplate(
    templateId: string,
    inputData: Record<string, unknown>,
    options: ProcessOptions = {},
  ): Promise<ProcessResult> {
    const config = loadTemplate(templateId);
    const aiResponses: Record<string, string> = {};

    // Get mocked responses or use empty strings
    const mocks = mockedResponses.get(templateId) || {};

    // Execute AI tasks (with mocks)
    if (!options.skipLlm && config.ai_generation_tasks) {
      for (const task of config.ai_generation_tasks) {
        if (mocks[task.task_id] !== undefined) {
          aiResponses[task.task_id] = mocks[task.task_id];
        } else {
          // If no mock provided, use placeholder
          aiResponses[task.task_id] = `[MOCK: ${task.task_id} response not provided]`;
        }
      }
    }

    // Build template context
    const context: Record<string, unknown> = {
      ...inputData,
      ...options.upstreamVariables,
      ai_generated: aiResponses,
    };

    // Render output template
    let output = '';
    if (config.output_template) {
      try {
        const template = Handlebars.compile(config.output_template);
        output = template(context);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Handlebars rendering failed: ${message}`);
      }
    }

    // Extract emitted variables (simplified extraction for testing)
    const emittedVariables: Record<string, unknown> = {};
    if (config.emits) {
      for (const emitSpec of config.emits) {
        // For testing, we extract from the context based on key name
        // Real extraction happens via variableExtractor.ts with LLM
        const key = emitSpec.key;

        // Check if the variable exists in input data (pre-computed by handler)
        if (inputData[key] !== undefined) {
          emittedVariables[key] = inputData[key];
        }
        // Or check if it was supposed to be extracted from AI response
        else if (emitSpec.extract_from && aiResponses[emitSpec.extract_from]) {
          // In real code, variableExtractor parses this; in tests, use mock
          emittedVariables[key] = `[Extracted from: ${emitSpec.extract_from}]`;
        }
      }
    }

    return {
      output,
      emittedVariables,
      aiResponses,
      config,
    };
  }

  function reset(): void {
    mockedResponses.clear();
  }

  return {
    mockLlmResponses,
    processTemplate,
    loadTemplate,
    reset,
  };
}

// ═══════════════════════════════════════════════════════════
// ASSERTION HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Assert that the output contains expected sections.
 */
export function assertOutputContainsSections(
  output: string,
  sections: string[],
): void {
  for (const section of sections) {
    if (!output.includes(section)) {
      throw new Error(
        `Expected output to contain section "${section}".\n\nOutput preview:\n${output.slice(0, 500)}...`,
      );
    }
  }
}

/**
 * Assert that emitted variables match expected keys.
 */
export function assertEmittedVariables(
  emitted: Record<string, unknown>,
  expectedKeys: string[],
): void {
  for (const key of expectedKeys) {
    if (emitted[key] === undefined) {
      throw new Error(
        `Expected emitted variable "${key}" to be present. Found: [${Object.keys(emitted).join(', ')}]`,
      );
    }
  }
}

/**
 * Assert that a template's consumes spec has required variables.
 */
export function assertConsumesContract(
  config: YamlConfig,
  upstreamVariables: Record<string, unknown>,
): void {
  if (!config.consumes) return;

  const missing: string[] = [];
  for (const spec of config.consumes) {
    if (spec.required && upstreamVariables[spec.key] === undefined) {
      missing.push(spec.key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required upstream variables: [${missing.join(', ')}]`,
    );
  }
}

/**
 * Verify that a TemplateContractError would be thrown for missing required variables.
 */
export function shouldThrowForMissingRequired(
  config: YamlConfig,
  providedVariables: Record<string, unknown>,
): string[] {
  if (!config.consumes) return [];

  const missing: string[] = [];
  for (const spec of config.consumes) {
    if (spec.required && providedVariables[spec.key] === undefined) {
      missing.push(spec.key);
    }
  }
  return missing;
}
