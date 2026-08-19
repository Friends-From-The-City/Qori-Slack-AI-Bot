// yamlProcessor.ts
import yaml from 'js-yaml';
import Handlebars from 'handlebars';
import { format } from 'date-fns';
import path from 'path';
import { createOrUpdateFileOnGitHub, type GitHubWriteResult } from './github';
import { executeAiGenerationTasks, type PiiRedactionContext } from './langchain';
import { extractVariables, type EmitSpec, type ExtractionResult } from './variableExtractor';
import {
  readStudyVariablesByContext,
  writeStudyVariablesByContext,
  mergeVariablesByContext,
  readUpstreamVariablesByContext,
  readDiscoveryVariablesByProject,
  writeDiscoveryVariablesByProject,
  mergeDiscoveryVariables,
  readUpstreamDiscoveryVariables,
  type ConsumeSpec,
  type UpstreamVariables,
  type DiscoveryVariablesStructure,
  type VariableContext,
} from './studyVariables';

// ---------------------------------------------------------------------------
// TemplateContractError
// ---------------------------------------------------------------------------

/**
 * Thrown when a template's cascade contract is violated — a required
 * upstream variable is missing. Handlers should catch this and surface
 * a user-friendly message instead of producing broken output.
 */
export class TemplateContractError extends Error {
  public readonly templateId: string;
  public readonly variableKey: string;
  public readonly userMessage: string;

  constructor(templateId: string, variableKey: string, message?: string) {
    super(
      message ||
        `Required cascade variable '${variableKey}' is missing for template '${templateId}'.`,
    );
    this.name = 'TemplateContractError';
    this.templateId = templateId;
    this.variableKey = variableKey;
    this.userMessage =
      `The research brief is missing required data (*${variableKey}*). ` +
      `This variable must be emitted by an upstream template before *${templateId}* can render.`;
  }
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface YamlConfig {
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
  document?: {
    append_document_information?: boolean;
  };
  [key: string]: unknown;
}

interface AiGenerationTask {
  task_id: string;
  prompt: string;
  output_format?: string;
  [key: string]: unknown;
}

interface ExtractionOutcome {
  success: boolean;
  error?: string;
  variableCount: number;
  keys?: string[];
}

export interface ProcessResult {
  result: GitHubWriteResult;
  outputTemplate: string;
  aiResponses?: Record<string, string>;
  extractionPromise: Promise<ExtractionOutcome> | null;
  /** Canonical artifact public_id when artifact identity is integrated (PH-6B) */
  artifactPublicId?: string;
}

/**
 * Artifact context for canonical identity integration (PH-6B).
 * Pass as inputValues.__artifactContext to opt into artifact tracking.
 */
export interface ArtifactContext {
  projectId: number;
  studyId: number | null;
  artifactType: string;
  title?: string;
  /** Canonical upstream inputs for derivation fingerprint */
  canonicalUpstreamInputs: string[];
  createdBy: string;
}

/** Result when dryRun=true — content returned without GitHub write */
export interface DryRunResult {
  dryRun: true;
  /** The full rendered content (with footer) */
  content: string;
  /** The computed output path (where it WOULD have been written) */
  path: string;
  /** The computed filename */
  filename: string;
  /** Raw output template (without footer) */
  outputTemplate: string;
  aiResponses?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Slugify a filename: lowercase, hyphens, no spaces or special chars, preserve extension */
function slugifyFilename(filename: string): string {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const slugged = base
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9\-.]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slugged + ext.toLowerCase();
}

/** Build traceability metadata footer (appended to every generated document) */
function buildTraceabilityFooter(
  yamlConfig: YamlConfig,
  inputValues: Record<string, unknown>,
): string {
  const now = new Date();
  const dateStr = format(now, "MMMM d, yyyy 'at' h:mm a") + ' UTC';
  const { getDefaultModelName } = require('./modelProvider');
  const model = getDefaultModelName();
  const templateId = yamlConfig.id;
  const templateVersion = yamlConfig.version;
  const study =
    (inputValues.selected_study as string | undefined) ||
    (inputValues.study_name as string | undefined);
  const maxTokens = process.env.ANTHROPIC_MAX_TOKENS || '8192';

  const lines = [
    '',
    '---',
    '',
    '## Document Information',
    '',
    '| Field | Value |',
    '|-------|-------|',
  ];

  if (dateStr) lines.push(`| Generated | ${dateStr} |`);
  if (model) lines.push(`| Model | ${model} |`);
  if (templateId && templateVersion) {
    lines.push(`| Template | ${templateId} ${templateVersion} |`);
  } else if (templateId) {
    lines.push(`| Template | ${templateId} |`);
  }
  if (study) lines.push(`| Study | ${study} |`);

  const noteFiles = inputValues.selected_note_files;
  if (noteFiles) {
    const files = (Array.isArray(noteFiles) ? noteFiles : [noteFiles]).filter(Boolean) as string[];
    if (files.length > 0 && files.length < 5) {
      lines.push(`| Source files | ${files.join(', ')} |`);
    } else if (files.length >= 5) {
      lines.push(
        `| Source files | <details><summary>${files.length} files</summary>${files.map((f) => `<br>${f}`).join('')}</details> |`,
      );
    }
  }

  lines.push(`| Max tokens | ${maxTokens} |`);

  if (yamlConfig.emits && yamlConfig.emits.length > 0) {
    lines.push(`| Cascade | Emits ${yamlConfig.emits.length} variable types |`);
  }

  lines.push('');
  lines.push('*Generated by Qori*');
  lines.push('');

  return lines.join('\n');
}

/** Generate the output content using Handlebars for different templates */
function generateOutputTemplate(
  outputTemplate: string,
  { aiGenerated, ...inputValues }: Record<string, unknown> & { aiGenerated?: Record<string, string> },
): string {
  const template = Handlebars.compile(outputTemplate, { noEscape: true });
  return template({
    ...inputValues,
    current_date: format(new Date(), 'MMMM d, yyyy'),
    current_date_iso: format(new Date(), 'yyyy-MM-dd'),
    ai_generated: aiGenerated,
  });
}

// ---------------------------------------------------------------------------
// PH-6D2: Prepare / Finalize split
// ---------------------------------------------------------------------------

/**
 * Result from prepareYamlTemplate — contains everything needed to create
 * evidence constructs and then finalize with a single GitHub write.
 */
export interface PrepareResult {
  /** Raw AI responses by task_id */
  aiResponses: Record<string, string>;
  /** Parsed structured AI outputs (output_format: json tasks) */
  parsedStructured: Record<string, unknown>;
  /** Rendered output template (baseline, before canonical enrichment) */
  baseOutputTemplate: string;
  /** Extraction outcome (already awaited) */
  extractionOutcome: ExtractionOutcome;
  /** Extraction keys that were successfully committed */
  extractionKeys: string[];
  /** Computed full output path */
  fullPath: string;
  /** Computed filename */
  filename: string;
  /** YAML config metadata */
  yamlConfig: { id: string; version: string; output_template: string; emits?: EmitSpec[] };
  /** All resolved input values (with upstream vars injected) */
  resolvedInputValues: Record<string, unknown>;
  /** Artifact identity (reserved, status=pending) */
  artifact: { id: number; publicId: string } | null;
  /** Derivation fingerprint */
  derivationFingerprint: string;
  /** Base folder (decoded) for footer building */
  baseFolder: string;
  /** Whether to suppress the document footer */
  suppressFooter: boolean;
}

/**
 * Prepare phase: parse YAML, load upstream, generate AI, extract, reserve
 * artifact — but do NOT write to GitHub.
 *
 * Callers use this when they need to create evidence constructs and enrich
 * the document with canonical references before the single GitHub write.
 */
export async function prepareYamlTemplate(
  rawYamlContent: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputValues: Record<string, any>,
  baseFolderEncoded: string,
  extraFolder = '',
  variableContext?: VariableContext,
  piiContext?: PiiRedactionContext,
): Promise<PrepareResult> {
  // 1. Parse YAML
  const yamlConfig = yaml.load(rawYamlContent) as YamlConfig | null;
  if (!yamlConfig) throw new Error('Failed to parse YAML configuration');
  const baseFolder = decodeURIComponent(baseFolderEncoded);
  if (!yamlConfig.output_template) throw new Error('Missing output_template in YAML configuration');

  // 2. Transform: load upstream variables
  const isDiscoveryScope = yamlConfig.discovery_scope === true;
  if (yamlConfig.consumes && yamlConfig.consumes.length > 0) {
    if (!variableContext) {
      throw new Error(
        `prepareYamlTemplate requires variableContext for template '${yamlConfig.id}' with consumes block.`
      );
    }
    try {
      const upstream: UpstreamVariables = isDiscoveryScope
        ? await readUpstreamDiscoveryVariables(
            variableContext.projectId,
            (inputValues._discovery_type as string) || '',
            (inputValues.topic_slug as string) || '',
            yamlConfig.consumes,
          )
        : await readUpstreamVariablesByContext(variableContext, yamlConfig.consumes);

      for (const spec of yamlConfig.consumes) {
        if (spec.required && !upstream[spec.key]) {
          throw new TemplateContractError(
            yamlConfig.id, spec.key,
            `Required cascade variable '${spec.key}' is missing for template '${yamlConfig.id}'.`,
          );
        }
      }

      if (Object.keys(upstream).length > 0) {
        inputValues.upstream_variables = upstream;
        for (const [key, variable] of Object.entries(upstream)) {
          inputValues[`upstream_${key}`] =
            typeof variable.value === 'string' ? variable.value : JSON.stringify(variable.value, null, 2);
          inputValues[`upstream_${key}_data`] = variable.value;
        }
        console.log(`Transform: Injected ${Object.keys(upstream).length} upstream variables for ${yamlConfig.id}`);

        const hasReferenceUpstream = yamlConfig.consumes.some(
          (c) => c.inject_as === 'reference' && c.required && upstream[c.key],
        );
        if (hasReferenceUpstream && inputValues.combined_file_content) {
          const originalLen = (inputValues.combined_file_content as string).length;
          if (originalLen > 2500) {
            inputValues.combined_file_content =
              (inputValues.combined_file_content as string).slice(0, 2000) +
              `\n\n[... ${Math.round((originalLen - 2000) / 1000)}K chars truncated — structured upstream variables contain the primary data ...]`;
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof TemplateContractError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Transform phase failed for ${yamlConfig.id}, continuing without upstream variables:`, message);
    }
  }

  // 3. AI generation
  let aiResponses: Record<string, string> = {};
  if (yamlConfig.ai_generation_tasks && yamlConfig.ai_generation_tasks.length > 0) {
    aiResponses = await executeAiGenerationTasks(
      yamlConfig.ai_generation_tasks,
      { ...inputValues, current_date: format(new Date(), 'MMMM d, yyyy'), current_date_iso: format(new Date(), 'yyyy-MM-dd') },
      piiContext,
    );
    console.log(`AI generation complete for ${yamlConfig.id}: ${Object.keys(aiResponses).length} task(s)`);
  }

  // 4. Parse structured JSON outputs
  const parsedStructured: Record<string, unknown> = {};
  if (yamlConfig.ai_generation_tasks) {
    for (const task of yamlConfig.ai_generation_tasks) {
      if (task.output_format === 'json' && aiResponses[task.task_id]) {
        try {
          let raw = aiResponses[task.task_id];
          const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fenceMatch) raw = fenceMatch[1];
          parsedStructured[task.task_id] = JSON.parse(raw.trim());
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new TemplateContractError(yamlConfig.id, task.task_id,
            `AI task '${task.task_id}' in template '${yamlConfig.id}' returned invalid JSON: ${message}`);
        }
      }
    }
  }

  // 5. Render baseline output template
  const baseOutputTemplate = generateOutputTemplate(yamlConfig.output_template, {
    ...inputValues, ...parsedStructured, aiGenerated: aiResponses,
  });

  // 6. Compute derivation fingerprint
  const artifactCtx = inputValues.__artifactContext as ArtifactContext | undefined;
  let derivationFingerprint = '';
  if (artifactCtx) {
    try {
      const { computeDerivationFingerprint, computeCascadeInputFingerprint } = require('../services/artifact.service');
      derivationFingerprint = artifactCtx.canonicalUpstreamInputs.length > 0
        ? computeDerivationFingerprint(artifactCtx.canonicalUpstreamInputs, yamlConfig.version || '')
        : computeCascadeInputFingerprint(inputValues, yamlConfig.version || '');
    } catch (err) {
      console.warn(`⚠️ Derivation fingerprint failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 7. Compute filename and path
  const filenameTemplate = yamlConfig.output_options?.filename || 'research_brief.md';
  const filePathTemplate = yamlConfig.output_options?.path || '';
  const rawFilename = generateOutputTemplate(filenameTemplate, {
    ...inputValues, aiGenerated: aiResponses,
    current_date: format(new Date(), 'MMMM d, yyyy'), current_date_iso: format(new Date(), 'yyyy-MM-dd'),
    __derivation_fp: derivationFingerprint.substring(0, 12),
  });
  const filename = slugifyFilename(rawFilename);
  const filePath = generateOutputTemplate(filePathTemplate, {
    ...inputValues, aiGenerated: aiResponses,
    current_date: format(new Date(), 'MMMM d, yyyy'), current_date_iso: format(new Date(), 'yyyy-MM-dd'),
  });
  const fullPath = path.posix.join(baseFolder, extraFolder, filePath, filename);

  // 8. Reserve artifact identity (pending — not published yet)
  let artifact: { id: number; publicId: string } | null = null;
  if (artifactCtx && derivationFingerprint) {
    try {
      const { reserveArtifact, buildSemanticKey } = require('../services/artifact.service');
      const semanticKey = buildSemanticKey(
        yamlConfig.id, artifactCtx.projectId, artifactCtx.studyId,
        artifactCtx.artifactType, derivationFingerprint,
      );
      const repo = `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`;
      const reserved = await reserveArtifact({
        projectId: artifactCtx.projectId, studyId: artifactCtx.studyId,
        templateId: yamlConfig.id, templateVersion: yamlConfig.version || '',
        artifactType: artifactCtx.artifactType, title: artifactCtx.title,
        repo, semanticKey, createdBy: artifactCtx.createdBy,
      });
      artifact = { id: reserved.id, publicId: reserved.publicId };
      console.log(`✅ Artifact identity ${reserved.isNew ? 'created' : 'reused'}: ${artifact.publicId}`);
    } catch (err) {
      console.warn(`⚠️ Artifact identity reservation failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 9. Run extraction synchronously
  let extractionOutcome: ExtractionOutcome = { success: true, variableCount: 0 };
  let extractionKeys: string[] = [];
  if (yamlConfig.emits && yamlConfig.emits.length > 0) {
    console.log(`Extract: Starting extraction for ${yamlConfig.id} (${yamlConfig.emits.length} variables)`);
    try {
      const extractionResult: ExtractionResult | null = await extractVariables(
        baseOutputTemplate, yamlConfig.emits, inputValues,
      );
      if (!extractionResult) {
        extractionOutcome = { success: false, error: 'Extraction returned null', variableCount: 0 };
      } else {
        console.log(`Extract: Got ${Object.keys(extractionResult).length} variables for ${yamlConfig.id}`);

        // Persist variables
        if (isDiscoveryScope && inputValues.topic_slug && inputValues._discovery_type && inputValues.project_slug) {
          if (variableContext) {
            const discoveryVars = await readDiscoveryVariablesByProject(variableContext.projectId, inputValues._discovery_type as string);
            const merged = mergeDiscoveryVariables(discoveryVars, extractionResult, inputValues.topic_slug as string, yamlConfig.id, yamlConfig.version || '');
            await writeDiscoveryVariablesByProject(variableContext.projectId, inputValues._discovery_type as string, merged, inputValues.project_slug as string);
          }
        } else if (variableContext) {
          const studyVars = await readStudyVariablesByContext(variableContext);
          const merged = await mergeVariablesByContext(variableContext, studyVars, extractionResult, yamlConfig.id, yamlConfig.version || '');
          await writeStudyVariablesByContext(variableContext, merged, baseFolder);
        }

        const variableCount = Object.values(extractionResult).reduce((sum, v) => sum + (Array.isArray(v.value) ? v.value.length : 1), 0);
        extractionKeys = Object.keys(extractionResult);
        extractionOutcome = { success: true, variableCount, keys: extractionKeys };
        console.log(`✅ Cascade variables committed: ${variableCount} items (${extractionKeys.join(', ')})`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Extract failed for ${yamlConfig.id}: ${message}`);
      extractionOutcome = { success: false, error: message, variableCount: 0 };
    }
  }

  const suppressFooter = yamlConfig.document?.append_document_information === false;

  return {
    aiResponses,
    parsedStructured,
    baseOutputTemplate,
    extractionOutcome,
    extractionKeys,
    fullPath,
    filename,
    yamlConfig: {
      id: yamlConfig.id,
      version: yamlConfig.version || '',
      output_template: yamlConfig.output_template,
      emits: yamlConfig.emits,
    },
    resolvedInputValues: inputValues,
    artifact,
    derivationFingerprint,
    baseFolder,
    suppressFooter,
  };
}

/**
 * Finalize phase: append optional canonical reference section + footer,
 * perform ONE GitHub write, and record artifact location.
 */
export async function finalizeArtifactWrite(
  prepared: PrepareResult,
  canonicalReferenceSection?: string,
): Promise<ProcessResult> {
  const footer = prepared.suppressFooter
    ? '\n\n---\n\n*Generated by Qori*\n'
    : buildTraceabilityFooter(
        prepared.yamlConfig as unknown as YamlConfig,
        prepared.resolvedInputValues,
      );

  const finalContent = canonicalReferenceSection
    ? prepared.baseOutputTemplate + '\n\n' + canonicalReferenceSection + footer
    : prepared.baseOutputTemplate + footer;

  let result: GitHubWriteResult;
  try {
    result = await createOrUpdateFileOnGitHub(prepared.fullPath, finalContent);

    if (prepared.artifact) {
      try {
        const { recordWriteSuccess } = require('../services/artifact.service');
        await recordWriteSuccess(prepared.artifact.id, {
          path: result.path, commitSha: result.sha, url: result.url,
        });
      } catch (err) {
        console.warn(`⚠️ Artifact location persistence failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (writeErr) {
    if (prepared.artifact) {
      try {
        const { recordWriteFailure } = require('../services/artifact.service');
        await recordWriteFailure(prepared.artifact.id, writeErr instanceof Error ? writeErr.message : String(writeErr));
      } catch (recErr) {
        console.warn(`⚠️ Artifact failure recording failed: ${recErr instanceof Error ? recErr.message : String(recErr)}`);
      }
    }
    throw writeErr;
  }

  return {
    result,
    outputTemplate: prepared.baseOutputTemplate,
    extractionPromise: Promise.resolve(prepared.extractionOutcome),
    artifactPublicId: prepared.artifact?.publicId,
  };
}

// ---------------------------------------------------------------------------
// Main processor (backward compatible — existing handlers use this)
// ---------------------------------------------------------------------------

// Function overloads for type-safe dryRun behavior
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function processYamlTemplate(
  rawYamlContent: string,
  inputValues: Record<string, any>,
  baseFolderEncoded: string,
  extraFolder: string,
  aiCheck: boolean,
  variableContext: VariableContext | undefined,
  piiContext: PiiRedactionContext | undefined,
  dryRun: true,
): Promise<DryRunResult>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function processYamlTemplate(
  rawYamlContent: string,
  inputValues: Record<string, any>,
  baseFolderEncoded: string,
  extraFolder?: string,
  aiCheck?: boolean,
  variableContext?: VariableContext,
  piiContext?: PiiRedactionContext,
  dryRun?: false,
): Promise<ProcessResult>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function processYamlTemplate(
  rawYamlContent: string,
  inputValues: Record<string, any>,
  baseFolderEncoded: string,
  extraFolder = '',
  aiCheck = false,
  variableContext?: VariableContext,
  piiContext?: PiiRedactionContext,
  /** When true, returns rendered content without writing to GitHub */
  dryRun = false,
): Promise<ProcessResult | DryRunResult> {
  // 1. Parse the raw YAML content first
  const yamlConfig = yaml.load(rawYamlContent) as YamlConfig | null;
  if (!yamlConfig) {
    throw new Error('Failed to parse YAML configuration');
  }

  // 2. Decode base folder
  const baseFolder = decodeURIComponent(baseFolderEncoded);

  // 3. Check if output_template exists
  if (!yamlConfig.output_template) {
    throw new Error('Missing output_template in YAML configuration');
  }

  // 3.5 TRANSFORM PHASE: Read upstream variables if consumes spec exists
  const isDiscoveryScope = yamlConfig.discovery_scope === true;
  if (yamlConfig.consumes && yamlConfig.consumes.length > 0) {
    // Require variableContext for ALL templates with consumes blocks (Phase 2D)
    if (!variableContext) {
      throw new Error(
        `processYamlTemplate requires variableContext for template '${yamlConfig.id}' with consumes block. ` +
        `Caller must resolve projectId/studyId and pass context.`
      );
    }

    try {
      const upstream: UpstreamVariables = isDiscoveryScope
        ? await readUpstreamDiscoveryVariables(
            variableContext.projectId,
            (inputValues._discovery_type as string) || '',
            (inputValues.topic_slug as string) || '',
            yamlConfig.consumes,
          )
        : await readUpstreamVariablesByContext(variableContext, yamlConfig.consumes);

      // Enforce cascade contracts: required variables must be present
      for (const spec of yamlConfig.consumes) {
        if (spec.required && !upstream[spec.key]) {
          throw new TemplateContractError(
            yamlConfig.id,
            spec.key,
            `Required cascade variable '${spec.key}' is missing for template '${yamlConfig.id}'. ` +
              `Upstream template '${spec.source || 'unknown'}' must emit '${spec.key}' before '${yamlConfig.id}' can render.`,
          );
        }
      }

      if (Object.keys(upstream).length > 0) {
        inputValues.upstream_variables = upstream;

        for (const [key, variable] of Object.entries(upstream)) {
          inputValues[`upstream_${key}`] =
            typeof variable.value === 'string'
              ? variable.value
              : JSON.stringify(variable.value, null, 2);
          inputValues[`upstream_${key}_data`] = variable.value;
        }

        console.log(
          `Transform: Injected ${Object.keys(upstream).length} upstream variables for ${yamlConfig.id}`,
        );

        const hasReferenceUpstream = yamlConfig.consumes.some(
          (c) => c.inject_as === 'reference' && c.required && upstream[c.key],
        );
        if (hasReferenceUpstream && inputValues.combined_file_content) {
          const originalLen = (inputValues.combined_file_content as string).length;
          if (originalLen > 2500) {
            inputValues.combined_file_content =
              (inputValues.combined_file_content as string).slice(0, 2000) +
              `\n\n[... ${Math.round((originalLen - 2000) / 1000)}K chars truncated — structured upstream variables contain the primary data ...]`;
            console.log(
              `Transform: Truncated combined_file_content from ${originalLen} to ~2000 chars (upstream reference data is primary)`,
            );
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof TemplateContractError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `Transform phase failed for ${yamlConfig.id}, continuing without upstream variables:`,
        message,
      );
    }
  }

  // 4. Prepare LangChain tasks for AI generation (optional)
  let aiResponses: Record<string, string> = {};
  if (yamlConfig.ai_generation_tasks && yamlConfig.ai_generation_tasks.length > 0) {
    aiResponses = await executeAiGenerationTasks(
      yamlConfig.ai_generation_tasks,
      {
        ...inputValues,
        current_date: format(new Date(), 'MMMM d, yyyy'),
        current_date_iso: format(new Date(), 'yyyy-MM-dd'),
      },
      piiContext,  // H9: Pass PII context for pre-transmission assertion
    );
    console.log(
      `AI generation complete for ${yamlConfig.id}: ${Object.keys(aiResponses).length} task(s), ${Object.values(aiResponses).reduce((sum, v) => sum + (typeof v === 'string' ? v.length : 0), 0)} chars total`,
    );
  }

  // 4.5 Parse structured AI outputs (output_format: json)
  const parsedStructured: Record<string, unknown> = {};
  if (yamlConfig.ai_generation_tasks) {
    for (const task of yamlConfig.ai_generation_tasks) {
      if (task.output_format === 'json' && aiResponses[task.task_id]) {
        try {
          let raw = aiResponses[task.task_id];
          const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fenceMatch) raw = fenceMatch[1];
          parsedStructured[task.task_id] = JSON.parse(raw.trim());
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new TemplateContractError(
            yamlConfig.id,
            task.task_id,
            `AI task '${task.task_id}' in template '${yamlConfig.id}' returned invalid JSON: ${message}`,
          );
        }
      }
    }
  }

  // 5. Build the output content using the responses from LLM (if any)
  const outputTemplate = generateOutputTemplate(yamlConfig.output_template, {
    ...inputValues,
    ...parsedStructured,
    aiGenerated: aiResponses,
  });

  // 5.5 PH-6D1: Compute derivation fingerprint early so it's available for
  // filename templates (as {{__derivation_fp}}) and for artifact reservation.
  const artifactCtx = inputValues.__artifactContext as ArtifactContext | undefined;
  let derivationFingerprint = '';
  let artifactId: number | null = null;
  let artifactPublicId: string | undefined;

  if (artifactCtx) {
    try {
      const { computeDerivationFingerprint, computeCascadeInputFingerprint } =
        require('../services/artifact.service');
      derivationFingerprint = artifactCtx.canonicalUpstreamInputs.length > 0
        ? computeDerivationFingerprint(artifactCtx.canonicalUpstreamInputs, yamlConfig.version || '')
        : computeCascadeInputFingerprint(inputValues, yamlConfig.version || '');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️ Derivation fingerprint computation failed: ${msg}`);
    }
  }

  // 6. Generate filename and path from YAML configuration
  const filenameTemplate =
    (yamlConfig.output_options && yamlConfig.output_options.filename) || 'research_brief.md';
  const filePathTemplate =
    (yamlConfig.output_options && yamlConfig.output_options.path) || '';

  const rawFilename = generateOutputTemplate(filenameTemplate, {
    ...inputValues,
    aiGenerated: aiResponses,
    current_date: format(new Date(), 'MMMM d, yyyy'),
    current_date_iso: format(new Date(), 'yyyy-MM-dd'),
    __derivation_fp: derivationFingerprint.substring(0, 12),
  });
  const filename = slugifyFilename(rawFilename);

  const filePath = generateOutputTemplate(filePathTemplate, {
    ...inputValues,
    aiGenerated: aiResponses,
    current_date: format(new Date(), 'MMMM d, yyyy'),
    current_date_iso: format(new Date(), 'yyyy-MM-dd'),
  });

  // 7. Append traceability metadata footer (unless template opts out)
  const suppressFooter = yamlConfig.document?.append_document_information === false;
  const footer = suppressFooter ? '\n\n---\n\n*Generated by Qori*\n' : buildTraceabilityFooter(yamlConfig, inputValues);
  const fullContent = outputTemplate + footer;
  const fullPath = path.posix.join(baseFolder, extraFolder, filePath, filename);

  // DRY RUN: Return content without writing to GitHub
  // Used for PII review flow where content goes to quarantine first
  if (dryRun) {
    return {
      dryRun: true,
      content: fullContent,
      path: fullPath,
      filename,
      outputTemplate,
      aiResponses,
    };
  }

  // PH-6B: Reserve canonical artifact identity before GitHub write
  if (artifactCtx && derivationFingerprint) {
    try {
      const { reserveArtifact, buildSemanticKey } =
        require('../services/artifact.service');

      const semanticKey = buildSemanticKey(
        yamlConfig.id, artifactCtx.projectId, artifactCtx.studyId,
        artifactCtx.artifactType, derivationFingerprint,
      );

      const repo = `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`;
      const reserved = await reserveArtifact({
        projectId: artifactCtx.projectId,
        studyId: artifactCtx.studyId,
        templateId: yamlConfig.id,
        templateVersion: yamlConfig.version || '',
        artifactType: artifactCtx.artifactType,
        title: artifactCtx.title,
        repo,
        semanticKey,
        createdBy: artifactCtx.createdBy,
      });

      artifactId = reserved.id;
      artifactPublicId = reserved.publicId;
      console.log(`✅ Artifact identity ${reserved.isNew ? 'created' : 'reused'}: ${artifactPublicId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️ Artifact identity reservation failed (non-blocking): ${msg}`);
    }
  }

  let result: GitHubWriteResult;
  try {
    result = await createOrUpdateFileOnGitHub(fullPath, fullContent);

    // PH-6B: Record successful write location
    if (artifactId) {
      try {
        const { recordWriteSuccess } = require('../services/artifact.service');
        await recordWriteSuccess(artifactId, {
          path: result.path,
          commitSha: result.sha,
          url: result.url,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`⚠️ Artifact location persistence failed (non-blocking): ${msg}`);
      }
    }
  } catch (writeErr) {
    // PH-6B: Record failed write (preserves last successful location)
    if (artifactId) {
      try {
        const { recordWriteFailure } = require('../services/artifact.service');
        await recordWriteFailure(artifactId, writeErr instanceof Error ? writeErr.message : String(writeErr));
      } catch (recErr) {
        // Double failure — log but don't mask the original error
        console.warn(`⚠️ Artifact failure recording failed: ${recErr instanceof Error ? recErr.message : String(recErr)}`);
      }
    }
    throw writeErr;
  }

  // 8. EXTRACT PHASE: Runs AFTER document is written — non-blocking but trackable.
  let extractionPromise: Promise<ExtractionOutcome> | null = null;
  if (yamlConfig.emits && yamlConfig.emits.length > 0) {
    console.log(
      `Extract: Starting extraction for ${yamlConfig.id} (${yamlConfig.emits.length} variables)`,
    );
    extractionPromise = (async (): Promise<ExtractionOutcome> => {
      const extractionResult: ExtractionResult | null = await extractVariables(
        outputTemplate,
        yamlConfig.emits!,
        inputValues,
      );
      if (!extractionResult) {
        console.warn(`Extract phase returned null for ${yamlConfig.id}`);
        return { success: false, error: 'Extraction returned null', variableCount: 0 };
      }
      console.log(
        `Extract: Got ${Object.keys(extractionResult).length} variables for ${yamlConfig.id}`,
      );

      if (
        isDiscoveryScope &&
        inputValues.topic_slug &&
        inputValues._discovery_type &&
        inputValues.project_slug
      ) {
        // Discovery scope uses project-level storage (study_id = NULL)
        if (!variableContext) {
          console.warn(`Extract: Discovery scope but no variableContext - skipping Postgres write`);
        } else {
          const discoveryVars: DiscoveryVariablesStructure = await readDiscoveryVariablesByProject(
            variableContext.projectId,
            inputValues._discovery_type as string,
          );
          const merged = mergeDiscoveryVariables(
            discoveryVars,
            extractionResult,
            inputValues.topic_slug as string,
            yamlConfig.id,
            yamlConfig.version || '',
          );
          await writeDiscoveryVariablesByProject(
            variableContext.projectId,
            inputValues._discovery_type as string,
            merged,
            inputValues.project_slug as string,
          );
          console.log(
            `Extract: Wrote discovery variables for ${yamlConfig.id} to project:${variableContext.projectId}`,
          );
        }
      } else {
        // Study scope requires variableContext
        if (!variableContext) {
          throw new Error(
            `Extract phase requires variableContext for study-scoped template '${yamlConfig.id}'.`
          );
        }
        const studyVars = await readStudyVariablesByContext(variableContext);
        const merged = await mergeVariablesByContext(
          variableContext,
          studyVars,
          extractionResult,
          yamlConfig.id,
          yamlConfig.version || '',
        );
        await writeStudyVariablesByContext(variableContext, merged, baseFolder);
        console.log(`Extract: Wrote variables for ${yamlConfig.id} to project:${variableContext.projectId}/study:${variableContext.studyId}`);
      }

      const variableCount = Object.values(extractionResult).reduce((sum, v) => {
        return sum + (Array.isArray(v.value) ? v.value.length : 1);
      }, 0);
      return { success: true, variableCount, keys: Object.keys(extractionResult) };
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Extract failed for ${yamlConfig.id}: ${message}`);
      return { success: false, error: message, variableCount: 0 };
    });
  }

  if (aiCheck) {
    return { result, outputTemplate, aiResponses, extractionPromise, artifactPublicId };
  } else {
    return { result, outputTemplate, extractionPromise, artifactPublicId };
  }
}
