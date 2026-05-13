/**
 * Types for the YAML template processor pipeline.
 *
 * The processor (yamlProcessor.js) takes a template ID, input data, and
 * study context, then: (1) fetches the YAML config from GitHub, (2) runs
 * chained AI generation tasks, (3) renders the output template with Handlebars,
 * (4) optionally extracts cascade variables from the rendered output.
 *
 * Types here describe the processor's inputs and outputs. The `inputs` field
 * is intentionally `Record<string, unknown>` — Phase 2 doesn't lock down
 * per-template input shapes. Phase 4 (handler migration) tightens this on
 * a per-handler basis.
 *
 * See ADR 0005 (Handlebars template architecture), ADR 0006 (transform on
 * consume), ADR 0012 (structured JSON for LLM outputs).
 */

import type { CascadeVariableKey } from './cascade';

// ---------------------------------------------------------------------------
// YAML config shape (parsed from the YAML template files)
// ---------------------------------------------------------------------------

/** A single AI generation task in the YAML template's ai_generation_tasks array. */
export interface AiGenerationTask {
  task_id: string;
  prompt: string;
  /** Dead config — parsed but never read. See CLAUDE.md "Model resolution." */
  llm_config?: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
  };
  depends_on?: string[];
}

/** An input variable declared in the YAML template. */
export interface YamlInputVariable {
  name: string;
  type: 'string' | 'text' | 'select' | 'multiselect' | 'number' | 'date' | 'file_content';
  required?: boolean;
  default?: string;
  description?: string;
}

/** A variable emitted by the YAML template after processing. */
export interface YamlEmitDeclaration {
  key: string;
  schema?: string;
  pool?: boolean;
  pool_strategy?: 'append' | 'replace' | 'append_or_replace_per_participant';
  extract_from?: string;
  extraction_model?: 'haiku' | 'sonnet';
  description?: string;
}

/** An upstream variable consumed by the YAML template. */
export interface YamlConsumeDeclaration {
  key: CascadeVariableKey | string;
  source: string;
  required: boolean;
  inject_as?: 'grounding' | 'context' | 'reference';
  description?: string;
}

/** The full parsed YAML template configuration. */
export interface YamlTemplateConfig {
  id: string;
  name: string;
  version?: string;
  description?: string;
  discovery_scope?: boolean;
  input_variables: YamlInputVariable[];
  ai_generation_tasks: AiGenerationTask[];
  output_template: string;
  emits?: YamlEmitDeclaration[];
  consumes?: YamlConsumeDeclaration[];
}

// ---------------------------------------------------------------------------
// Processor inputs and outputs
// ---------------------------------------------------------------------------

/**
 * Input to processYamlTemplate. This is the data the handler passes to the
 * processor after collecting modal submission values.
 *
 * The `inputs` field is loosely typed because each template expects different
 * fields. Phase 4 handler migration will define per-handler input types that
 * narrow this.
 */
export interface ProcessYamlTemplateInput {
  /** Which YAML template to process (e.g., "research_plan", "research_brief"). */
  templateId: string;
  /** The study this template is being processed for. */
  studyName: string;
  /** The study's GitHub path (e.g., "friends-lab/study-name"). */
  studyPath: string;
  /** Input values from the modal submission. */
  inputs: Record<string, unknown>;
  /** Slack user ID of the researcher running the command. */
  userId: string;
}

/**
 * Result of processing a YAML template.
 */
export interface ProcessYamlTemplateResult {
  success: boolean;
  /** The rendered markdown document. */
  rendered?: string;
  /** GitHub URL of the committed document. */
  documentUrl?: string;
  /** Error message if processing failed. */
  error?: string;
  /** Number of cascade variables extracted and stored. */
  variableCount?: number;
}

// ---------------------------------------------------------------------------
// Variable extraction types
// ---------------------------------------------------------------------------

/**
 * Result from the variable extraction phase.
 * Maps variable keys to their extracted values (shaped per the YAML schema).
 */
export type ExtractionResult = Record<string, unknown>;

/**
 * A single variable merge operation ready to be applied to the database.
 */
export interface VariableMergeOperation {
  variable_key: string;
  value: unknown;
  item_key?: string;
  participant_id?: string;
  is_pool: boolean;
  pool_strategy?: 'append' | 'replace' | 'append_or_replace_per_participant';
  source_template: string;
  source_version?: string;
}
