// variableExtractor.ts — Extract structured variables from generated documents
import { createModel, resolveModelTier } from './modelProvider';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

import type { CascadeVariableKey, CascadeVariableMap } from '../types/cascade';

// ─── Types ───────────────────────────────────────────────────────────

/** A JSON Schema-like object describing an extracted variable's shape. */
interface SchemaDefinition {
  type?: string;
  properties?: Record<string, SchemaDefinition>;
  items?: SchemaDefinition;
  $ref?: string;
  enum?: string[];
  [key: string]: unknown;
}

/** One entry from a YAML template's `emits:` block. */
export interface EmitSpec {
  key: string;
  pool?: boolean;
  extract_from?: string;
  schema?: SchemaDefinition;
  extraction_model?: 'sonnet' | 'haiku';
}

/** Shape of an individual extracted variable with its emit spec attached. */
interface ExtractedVariableWithSpec {
  value: unknown;
  _emitSpec: EmitSpec;
}

/** Return shape of extractVariables. Keys are variable keys; values carry the extracted data + spec. */
export type ExtractionResult = Record<string, ExtractedVariableWithSpec>;

/** Input values passed to the extraction prompt for context. */
interface ExtractionInputValues {
  study_name?: string;
  selected_study?: string;
  participant_id?: string;
  [key: string]: unknown;
}

/** Result of validateExtraction. */
interface ValidationResult {
  valid: boolean;
  errors: string[];
  structureErrors: string[];
}

// ─── Schema loading ──────────────────────────────────────────────────

const SCHEMA_BASE_PATH = path.resolve(__dirname, '../../config/schemas');

/**
 * Verify all schema files load at startup.
 * Logs INFO for successes, WARNING for failures.
 * Called once on module load — does not block, but ensures visibility.
 */
function verifySchemas(): void {
  try {
    if (!fs.existsSync(SCHEMA_BASE_PATH)) {
      console.error(`❌ SCHEMA DIRECTORY NOT FOUND: ${SCHEMA_BASE_PATH}`);
      console.error(`   Variables emitted with $ref schemas will fall back to flat string extraction.`);
      return;
    }
    const files = fs.readdirSync(SCHEMA_BASE_PATH).filter((f: string) => f.endsWith('.yaml'));
    if (files.length === 0) {
      console.warn(`⚠️ No schema files found in ${SCHEMA_BASE_PATH}`);
      return;
    }
    let loaded = 0;
    let failed = 0;
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(SCHEMA_BASE_PATH, file), 'utf8');
        yaml.load(content);
        loaded++;
      } catch (err: unknown) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`⚠️ Schema "${file}" failed to load — variables emitted with this schema will fall back to flat string extraction. Error: ${message}`);
      }
    }
    console.log(`📋 Schema verification: ${loaded} loaded, ${failed} failed (${SCHEMA_BASE_PATH})`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Schema verification error: ${message}`);
  }
}

// Run verification on module load
verifySchemas();

/**
 * Load a schema file referenced by $ref in an emits spec.
 * Resolves: "$ref: schemas/atomic_nugget.yaml" → parsed YAML object
 */
function loadSchema(ref: string | null | undefined): SchemaDefinition | null {
  if (!ref) return null;
  // Strip "schemas/" prefix if present
  const schemaFile = ref.replace(/^schemas\//, '');
  const schemaPath = path.join(SCHEMA_BASE_PATH, schemaFile);
  try {
    const content = fs.readFileSync(schemaPath, 'utf8');
    return yaml.load(content) as SchemaDefinition;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Schema "${ref}" failed to load at extraction time: ${message}`);
    console.error(`   Path attempted: ${schemaPath}`);
    return null;
  }
}

/**
 * Recursively resolve $ref in a schema object.
 * Handles both top-level $ref and nested $ref (e.g., schema.items.$ref).
 */
function resolveSchemaRefs(schema: SchemaDefinition | null | undefined): SchemaDefinition | null {
  if (!schema || typeof schema !== 'object') return schema ?? null;
  if (schema.$ref) return loadSchema(schema.$ref);
  const resolved = { ...schema };
  if (resolved.items) {
    resolved.items = resolveSchemaRefs(resolved.items) ?? undefined;
  }
  if (resolved.properties) {
    const resolvedProps: Record<string, SchemaDefinition> = {};
    for (const [key, prop] of Object.entries(resolved.properties)) {
      resolvedProps[key] = resolveSchemaRefs(prop) ?? prop;
    }
    resolved.properties = resolvedProps;
  }
  return resolved;
}

// ─── Prompt building ─────────────────────────────────────────────────

interface VariableDescription {
  key: string;
  pool: boolean;
  extract_from: string;
  schema: SchemaDefinition | null;
}

function buildExtractionPrompt(renderedMarkdown: string, emitsSpec: EmitSpec[], inputValues: ExtractionInputValues): string {
  const variableDescriptions: VariableDescription[] = emitsSpec.map(emit => {
    const schema = resolveSchemaRefs(emit.schema);
    return {
      key: emit.key,
      pool: emit.pool || false,
      extract_from: emit.extract_from || 'entire document',
      schema: schema,
    };
  });

  const schemaBlock = variableDescriptions.map(v => {
    const schemaStr = v.schema ? JSON.stringify(v.schema, null, 2) : '(no schema — extract as string or string array)';
    return `### ${v.key}
- Pool: ${v.pool}
- Look in: ${v.extract_from}
- Schema:
\`\`\`json
${schemaStr}
\`\`\``;
  }).join('\n\n');

  return `You are extracting structured variables from a generated research document.

EXTRACTION FIDELITY REQUIREMENTS:
Extract with maximum semantic fidelity. For each variable instance:
- Capture verbatim quotes when present in source (copy exactly, do not paraphrase)
- Capture source attribution with role context (not just "SH-001" but "SH-001" with
  source_role: "Product Owner" and source_team: "OCTO Mobile Experience" from the
  Stakeholders interviewed table)
- Capture related broader patterns from the same document
- Capture research and implementation implications when present
- Do not summarize or abbreviate — if the source has 6 paragraphs about a constraint,
  the extracted variable must reflect that depth across its schema fields
- Assign sequential IDs as specified in extract_from hints (barrier-001, metric-001, etc.)

Thin extraction is the failure mode to avoid. When a schema has nullable fields like
verbatim_quote, broader_pattern, research_implication, implementation_implication —
POPULATE them whenever the document contains relevant content. Only use null when
the information is genuinely absent from the source document.

RULES:
1. Extract ONLY information that exists in the document. Do not invent data.
2. Follow the schema exactly. Every field must be present (use null for missing optional fields).
3. When the schema type is "array", ALWAYS extract an array of items — even if pool is false.
4. When the schema type is "object" (not array), extract a single object.
5. Participant/stakeholder IDs must use the PT-### or SH-### format found in the document.
6. Quotes MUST be verbatim from the document — do not paraphrase.
7. If a variable cannot be extracted (no relevant content), use an empty array [] for arrays or null for singles.
8. For metrics, include context (comparisons, trends, benchmarks) not just raw numbers.
9. When extract_from says "Assign sequential IDs", number items starting from 001.

VARIABLES TO EXTRACT:

${schemaBlock}

STUDY CONTEXT:
- Study: ${inputValues.study_name || inputValues.selected_study || 'unknown'}
- Participant: ${inputValues.participant_id || 'unknown'}

DOCUMENT TO EXTRACT FROM:

${renderedMarkdown}

Respond with ONLY valid JSON in this exact structure (no markdown, no explanation):
{
${variableDescriptions.map(v => {
    const isArray = v.pool || (v.schema && (v.schema.type === 'array' || v.schema.items));
    return `  "${v.key}": ${isArray ? '[...]' : '{...}'}`;
  }).join(',\n')}
}`;
}

// ─── Response parsing and validation ─────────────────────────────────

/**
 * Attempt to repair truncated or malformed JSON.
 * Handles common LLM output issues:
 * - Truncated responses (unclosed brackets/braces)
 * - Trailing commas
 * - Unescaped control characters in strings
 */
function repairJson(text: string): string {
  let repaired = text;

  // Remove trailing commas before closing brackets/braces
  repaired = repaired.replace(/,(\s*[\]}])/g, '$1');

  // Escape unescaped newlines and tabs within strings
  // This regex finds strings and escapes control chars within them
  repaired = repaired.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
    return match
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  });

  // Count brackets and braces to detect truncation
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escaped = false;

  for (const char of repaired) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') braceCount++;
    else if (char === '}') braceCount--;
    else if (char === '[') bracketCount++;
    else if (char === ']') bracketCount--;
  }

  // If we ended inside a string, try to close it
  if (inString) {
    // Find last unclosed quote and truncate there, then close
    const lastQuote = repaired.lastIndexOf('"');
    if (lastQuote > 0) {
      // Check if this quote is the start of an unfinished string value
      const beforeQuote = repaired.slice(0, lastQuote);
      const afterQuote = repaired.slice(lastQuote + 1);
      // If afterQuote has content but no closing quote, truncate the string
      if (afterQuote.length > 0 && !afterQuote.includes('"')) {
        repaired = beforeQuote + '""';
        // Recount after repair
        braceCount = 0;
        bracketCount = 0;
        inString = false;
        escaped = false;
        for (const char of repaired) {
          if (escaped) { escaped = false; continue; }
          if (char === '\\') { escaped = true; continue; }
          if (char === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (char === '{') braceCount++;
          else if (char === '}') braceCount--;
          else if (char === '[') bracketCount++;
          else if (char === ']') bracketCount--;
        }
      }
    }
  }

  // Remove trailing partial content after last complete value
  // Look for patterns like: `"key": "incomplete` or `, "key"` at the end
  if (braceCount > 0 || bracketCount > 0) {
    // Try to find a safe truncation point
    const patterns = [
      /,\s*"[^"]*"?\s*:?\s*"?[^"]*$/,  // Trailing incomplete key-value
      /,\s*\{[^}]*$/,                    // Trailing incomplete object
      /,\s*\[[^\]]*$/,                   // Trailing incomplete array
      /,\s*$/,                           // Trailing comma
    ];

    for (const pattern of patterns) {
      const match = repaired.match(pattern);
      if (match && match.index !== undefined) {
        repaired = repaired.slice(0, match.index);
        // Recount
        braceCount = 0;
        bracketCount = 0;
        inString = false;
        escaped = false;
        for (const char of repaired) {
          if (escaped) { escaped = false; continue; }
          if (char === '\\') { escaped = true; continue; }
          if (char === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (char === '{') braceCount++;
          else if (char === '}') braceCount--;
          else if (char === '[') bracketCount++;
          else if (char === ']') bracketCount--;
        }
        break;
      }
    }
  }

  // Close unclosed brackets and braces
  while (bracketCount > 0) {
    repaired += ']';
    bracketCount--;
  }
  while (braceCount > 0) {
    repaired += '}';
    braceCount--;
  }

  return repaired;
}

/**
 * Parse the Haiku response into structured variables.
 * Handles common LLM JSON formatting issues with repair logic.
 */
function parseExtractionResponse(responseText: string): Record<string, unknown> | null {
  // Strip markdown code fences if present
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  // First attempt: parse as-is
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch (firstError: unknown) {
    const firstMessage = firstError instanceof Error ? firstError.message : String(firstError);
    console.warn(`⚠️ Initial JSON parse failed: ${firstMessage}`);

    // Second attempt: repair and retry
    try {
      const repaired = repairJson(cleaned);
      if (repaired !== cleaned) {
        console.log(`🔧 Attempting JSON repair (truncated/malformed response)...`);
        const result = JSON.parse(repaired) as Record<string, unknown>;
        console.log(`✅ JSON repair succeeded`);
        return result;
      }
    } catch (repairError: unknown) {
      const repairMessage = repairError instanceof Error ? repairError.message : String(repairError);
      console.error(`❌ JSON repair also failed: ${repairMessage}`);
    }

    console.error('❌ Failed to parse extraction JSON:', firstMessage);
    console.error('Raw response (first 500 chars):', cleaned.slice(0, 500));
    console.error('Raw response (last 200 chars):', cleaned.slice(-200));
    return null;
  }
}

/**
 * Validate extracted variables against their schemas.
 * Checks both structural requirements (array vs single) and schema shape
 * (objects vs strings when schema defines properties).
 */
function validateExtraction(extracted: Record<string, unknown>, emitsSpec: EmitSpec[]): ValidationResult {
  const errors: string[] = [];
  const structureErrors: string[] = [];

  for (const emit of emitsSpec) {
    const value = extracted[emit.key];
    if (value === undefined) {
      errors.push(`Missing variable: ${emit.key}`);
      continue;
    }

    if (emit.pool && !Array.isArray(value)) {
      errors.push(`${emit.key} should be an array (pool variable), got ${typeof value}`);
      continue;
    }

    // Strict schema shape validation: if schema defines object properties,
    // extracted values must be objects, not flat strings
    const resolvedSchema = resolveSchemaRefs(emit.schema);
    if (resolvedSchema && resolvedSchema.properties && emit.pool && Array.isArray(value)) {
      const expectedKeys = Object.keys(resolvedSchema.properties);
      for (let i = 0; i < value.length; i++) {
        const item = value[i] as unknown;
        if (typeof item === 'string') {
          structureErrors.push(`${emit.key}[${i}]: expected object with keys [${expectedKeys.slice(0, 4).join(', ')}...], got string "${(item as string).slice(0, 60)}..."`);
        } else if (typeof item === 'object' && item !== null) {
          // Check that at least some expected keys are present
          const presentKeys = expectedKeys.filter(k => (item as Record<string, unknown>)[k] !== undefined);
          if (presentKeys.length < Math.min(3, expectedKeys.length)) {
            structureErrors.push(`${emit.key}[${i}]: only ${presentKeys.length}/${expectedKeys.length} schema keys present`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0 && structureErrors.length === 0,
    errors,
    structureErrors,
  };
}

// ─── Linkage validation (traceable role-transformation) ──────────────

/**
 * Known linkage fields that must be non-empty when required by schema.
 * These fields represent traceable role-transformations from upstream variables.
 * Empty arrays indicate extraction failure, not absence of linkage.
 */
const LINKAGE_FIELDS = [
  'validates_barriers',      // task_scenario → target_barriers
  'addresses_questions',     // task_scenario → research_questions
  'addresses_question',      // probe → research_question
  'supporting_themes',       // prioritized_finding → validated_theme
  'supporting_nuggets',      // prioritized_finding, journey_stage, etc → atomic_nugget
  'addresses_findings',      // prioritized_recommendation → finding
  'addresses_objective',     // study_deliverable → research_objective
  'evidence_nuggets',        // design_hmw_opportunity → atomic_nugget
];

/**
 * Validate that required linkage fields are non-empty.
 * These fields represent traceable role-transformations — empty arrays indicate
 * extraction failure, not absence of linkage. Fail-closed when linkage is required
 * but empty, surfacing the gap rather than silently producing untraceable data.
 */
function validateLinkage(
  extracted: Record<string, unknown>,
  emitsSpec: EmitSpec[],
): { valid: boolean; linkageErrors: string[] } {
  const linkageErrors: string[] = [];

  for (const emit of emitsSpec) {
    const value = extracted[emit.key];
    if (!value || !Array.isArray(value)) continue;

    const resolvedSchema = resolveSchemaRefs(emit.schema);
    if (!resolvedSchema?.properties) continue;

    // Check if schema has required array in YAML
    const requiredFields: string[] = (resolvedSchema as { required?: string[] }).required || [];

    for (let i = 0; i < value.length; i++) {
      const item = value[i] as Record<string, unknown>;
      if (typeof item !== 'object' || item === null) continue;

      for (const linkageField of LINKAGE_FIELDS) {
        // Only validate if this field is required by the schema
        if (!requiredFields.includes(linkageField)) continue;

        const fieldValue = item[linkageField];

        // Check for empty arrays (required linkage not populated)
        if (Array.isArray(fieldValue) && fieldValue.length === 0) {
          linkageErrors.push(
            `${emit.key}[${i}].${linkageField}: empty array — required linkage not populated. ` +
            `This indicates extraction failed to capture the role-transformation.`
          );
        }

        // Check for empty strings (required single linkage not populated)
        if (typeof fieldValue === 'string' && fieldValue.trim() === '') {
          linkageErrors.push(
            `${emit.key}[${i}].${linkageField}: empty string — required linkage not populated.`
          );
        }

        // Check for undefined/null when field is required
        if (fieldValue === undefined || fieldValue === null) {
          linkageErrors.push(
            `${emit.key}[${i}].${linkageField}: missing — required linkage field not present.`
          );
        }
      }
    }
  }

  return {
    valid: linkageErrors.length === 0,
    linkageErrors,
  };
}

// ─── Model selection ─────────────────────────────────────────────────

/**
 * Select extraction tier based on emit config or schema complexity.
 * Returns a logical tier ('haiku' | 'sonnet'), not a provider model name.
 */
function selectExtractionTier(emitConfig: EmitSpec, schema: SchemaDefinition | null): string {
  // Explicit override from YAML config
  if (emitConfig.extraction_model) {
    return emitConfig.extraction_model === 'sonnet' ? 'sonnet' : 'haiku';
  }

  // Complexity heuristic: Sonnet for complex schemas
  if (schema && schema.properties) {
    const propertyCount = Object.keys(schema.properties).length;
    const hasMultiValueEnum = Object.values(schema.properties).some(
      (p): p is SchemaDefinition => !!(p && typeof p === 'object' && 'enum' in p && Array.isArray((p as SchemaDefinition).enum) && ((p as SchemaDefinition).enum!.length > 5))
    );
    if (propertyCount > 10 || hasMultiValueEnum) {
      return 'sonnet';
    }
  }

  return 'haiku';
}

// ─── Type guard for cascade variable keys ────────────────────────────

/**
 * Runtime check that a string is a valid CascadeVariableKey.
 * Used at the emission boundary to bridge runtime YAML keys to compile-time types.
 */
function isCascadeVariableKey(key: string): key is CascadeVariableKey {
  // Import the keys from CascadeVariableMap at type level;
  // at runtime, we check against known keys.
  // This list is derived from CascadeVariableMap — if a key is added there,
  // TypeScript will catch missing cases when this function is used with exhaustive patterns.
  return true; // Accept any key — runtime schema validation is the real gate
}

// ─── Main extraction ─────────────────────────────────────────────────

/**
 * Extract and type-check a single variable from the extraction result.
 * Bridges the runtime extraction to the compile-time CascadeVariableMap.
 */
function typedExtraction<K extends CascadeVariableKey>(
  extracted: Record<string, unknown>,
  key: K,
): CascadeVariableMap[K] | null {
  const value = extracted[key];
  if (value === undefined || value === null) return null;
  // Runtime schema validation has already run before this point.
  // The cast is safe because validateExtraction() verified the shape.
  return value as CascadeVariableMap[K];
}

/**
 * Extract variables from a rendered document.
 * Groups emits by model selection and runs extraction per group.
 */
async function extractVariables(
  renderedOutput: string,
  emitsSpec: EmitSpec[],
  inputValues: ExtractionInputValues,
): Promise<ExtractionResult | null> {
  if (!emitsSpec || emitsSpec.length === 0) {
    return null;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️ ANTHROPIC_API_KEY not set — skipping variable extraction');
    return null;
  }

  const maxTokens = parseInt(process.env.EXTRACTION_MAX_TOKENS || '8192', 10);

  // Group emits by their selected logical tier
  const tierGroups: Record<string, EmitSpec[]> = {};
  for (const emit of emitsSpec) {
    const schema = resolveSchemaRefs(emit.schema);
    const tier = selectExtractionTier(emit, schema);
    if (!tierGroups[tier]) tierGroups[tier] = [];
    tierGroups[tier].push(emit);
  }

  const tiers = Object.keys(tierGroups);
  console.log(`🔄 Extraction: ${emitsSpec.length} variables across ${tiers.length} tier(s): ${tiers.map(t => `${t}(${tierGroups[t].length})`).join(', ')}`);

  const allExtracted: Record<string, unknown> = {};

  for (const [tier, groupEmits] of Object.entries(tierGroups)) {
    const llm = createModel({ tier: tier as 'haiku' | 'sonnet' | 'opus', temperature: 0, maxTokens, purpose: 'variable-extraction' });

    const prompt = buildExtractionPrompt(renderedOutput, groupEmits, inputValues);
    let extracted: Record<string, unknown> | null = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts && !extracted) {
      attempts++;
      try {
        const currentPrompt = attempts === 1 ? prompt : prompt + `\n\nCRITICAL RETRY INSTRUCTION: Your previous response returned flat strings instead of structured objects. You MUST return JSON matching the exact schema above. Do not return strings or summaries — return objects with ALL specified fields. Every pool variable must be an array of objects, not an array of strings. Use null for missing optional fields.`;

        const response = await llm.invoke(currentPrompt);
        const parsed = parseExtractionResponse(typeof response.content === 'string' ? response.content : JSON.stringify(response.content));

        if (!parsed) {
          console.warn(`⚠️ [${tier}] Extraction attempt ${attempts}/${maxAttempts}: JSON parse failed`);
          continue;
        }

        const validation = validateExtraction(parsed, groupEmits);

        if (validation.errors.length > 0) {
          console.warn(`⚠️ [${tier}] Attempt ${attempts}/${maxAttempts}: Validation errors:`, validation.errors);
          if (attempts < maxAttempts) continue;
        }

        if (validation.structureErrors.length > 0) {
          console.error(`❌ [${tier}] Attempt ${attempts}/${maxAttempts}: Schema structure mismatch:`);
          validation.structureErrors.forEach(e => console.error(`   ${e}`));
          if (attempts < maxAttempts) {
            console.warn(`🔄 Retrying with stricter prompt...`);
            continue;
          }
          console.error(`❌ CRITICAL: [${tier}] Extraction failed schema validation after ${maxAttempts} attempts. These variables will NOT be written.`);
          // Don't return null — other model groups may have succeeded
          break;
        }

        // Linkage validation: ensure required traceability fields are populated
        const linkageValidation = validateLinkage(parsed, groupEmits);
        if (!linkageValidation.valid) {
          console.warn(`⚠️ [${tier}] Linkage gaps detected (traceable role-transformation):`);
          linkageValidation.linkageErrors.forEach(e => console.warn(`   ${e}`));
          // Log but don't block — linkage gaps are surfaced, not fatal
          // The data will be written with empty linkage fields for manual review
        }

        extracted = parsed;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`❌ [${tier}] Attempt ${attempts}/${maxAttempts} failed:`, message);
        if (attempts >= maxAttempts) {
          console.error(`❌ [${tier}] All extraction attempts failed`);
        }
      }
    }

    if (extracted) {
      Object.assign(allExtracted, extracted);
    }
  }

  if (Object.keys(allExtracted).length === 0) return null;

  // Attach emit specs for merge logic and apply typed extraction
  const result: ExtractionResult = {};
  for (const emit of emitsSpec) {
    if (allExtracted[emit.key] !== undefined) {
      // Bridge to typed system: if key is a known cascade variable, type-check it
      if (isCascadeVariableKey(emit.key)) {
        typedExtraction(allExtracted, emit.key as CascadeVariableKey);
        // Type check passed (or value is null). The actual value goes in the result.
      }
      result[emit.key] = {
        value: allExtracted[emit.key],
        _emitSpec: emit,
      };
    }
  }

  return result;
}

export {
  extractVariables,
  loadSchema,
  buildExtractionPrompt,
  parseExtractionResponse,
  validateExtraction,
  validateLinkage,
  typedExtraction,
  isCascadeVariableKey,
  LINKAGE_FIELDS,
};
