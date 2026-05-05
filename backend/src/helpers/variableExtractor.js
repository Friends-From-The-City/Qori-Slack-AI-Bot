// variableExtractor.js — Extract structured variables from generated documents using Haiku
const { ChatAnthropic } = require('@langchain/anthropic');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const SCHEMA_BASE_PATH = path.resolve(__dirname, '../../config/schemas');

/**
 * Verify all schema files load at startup.
 * Logs INFO for successes, WARNING for failures.
 * Called once on module load — does not block, but ensures visibility.
 */
function verifySchemas() {
  try {
    if (!fs.existsSync(SCHEMA_BASE_PATH)) {
      console.error(`❌ SCHEMA DIRECTORY NOT FOUND: ${SCHEMA_BASE_PATH}`);
      console.error(`   Variables emitted with $ref schemas will fall back to flat string extraction.`);
      return;
    }
    const files = fs.readdirSync(SCHEMA_BASE_PATH).filter(f => f.endsWith('.yaml'));
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
      } catch (err) {
        failed++;
        console.warn(`⚠️ Schema "${file}" failed to load — variables emitted with this schema will fall back to flat string extraction. Error: ${err.message}`);
      }
    }
    console.log(`📋 Schema verification: ${loaded} loaded, ${failed} failed (${SCHEMA_BASE_PATH})`);
  } catch (err) {
    console.error(`❌ Schema verification error: ${err.message}`);
  }
}

// Run verification on module load
verifySchemas();

/**
 * Load a schema file referenced by $ref in an emits spec.
 * Resolves: "$ref: schemas/atomic_nugget.yaml" → parsed YAML object
 */
function loadSchema(ref) {
  if (!ref) return null;
  // Strip "schemas/" prefix if present
  const schemaFile = ref.replace(/^schemas\//, '');
  const schemaPath = path.join(SCHEMA_BASE_PATH, schemaFile);
  try {
    const content = fs.readFileSync(schemaPath, 'utf8');
    return yaml.load(content);
  } catch (error) {
    console.error(`❌ Schema "${ref}" failed to load at extraction time: ${error.message}`);
    console.error(`   Path attempted: ${schemaPath}`);
    return null;
  }
}

/**
 * Build the extraction prompt for Haiku.
 * Takes the rendered markdown and the emits spec, produces a prompt
 * that instructs Haiku to extract structured JSON.
 */
/**
 * Recursively resolve $ref in a schema object.
 * Handles both top-level $ref and nested $ref (e.g., schema.items.$ref).
 */
function resolveSchemaRefs(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (schema.$ref) return loadSchema(schema.$ref);
  const resolved = { ...schema };
  if (resolved.items) {
    resolved.items = resolveSchemaRefs(resolved.items);
  }
  if (resolved.properties) {
    const resolvedProps = {};
    for (const [key, prop] of Object.entries(resolved.properties)) {
      resolvedProps[key] = resolveSchemaRefs(prop);
    }
    resolved.properties = resolvedProps;
  }
  return resolved;
}

function buildExtractionPrompt(renderedMarkdown, emitsSpec, inputValues) {
  const variableDescriptions = emitsSpec.map(emit => {
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
3. For pool variables (pool: true), extract an array of items.
4. For non-pool variables, extract a single value or object.
5. Participant/stakeholder IDs must use the PT-### or SH-### format found in the document.
6. Quotes MUST be verbatim from the document — do not paraphrase.
7. If a variable cannot be extracted (no relevant content), use an empty array [] for pools or null for singles.
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
${variableDescriptions.map(v => `  "${v.key}": ${v.pool ? '[...]' : '{...}'}`).join(',\n')}
}`;
}

/**
 * Parse the Haiku response into structured variables.
 * Handles common LLM JSON formatting issues.
 */
function parseExtractionResponse(responseText) {
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

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('❌ Failed to parse extraction JSON:', error.message);
    console.error('Raw response (first 500 chars):', cleaned.slice(0, 500));
    return null;
  }
}

/**
 * Validate extracted variables against their schemas.
 * Checks both structural requirements (array vs single) and schema shape
 * (objects vs strings when schema defines properties).
 * Returns { valid: true/false, errors: [...], structureErrors: [...] }
 */
function validateExtraction(extracted, emitsSpec) {
  const errors = [];
  const structureErrors = [];

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
        const item = value[i];
        if (typeof item === 'string') {
          structureErrors.push(`${emit.key}[${i}]: expected object with keys [${expectedKeys.slice(0, 4).join(', ')}...], got string "${item.slice(0, 60)}..."`);
        } else if (typeof item === 'object' && item !== null) {
          // Check that at least some expected keys are present
          const presentKeys = expectedKeys.filter(k => item[k] !== undefined);
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

/**
 * Extract variables from a rendered document using Haiku.
 *
 * @param {string} renderedOutput - The full rendered markdown document
 * @param {Array} emitsSpec - The emits: block from the YAML config
 * @param {Object} inputValues - Template input values (for context)
 * @returns {Object|null} Extracted variables keyed by variable name, or null on failure
 */
/**
 * Select extraction model based on emit config or schema complexity.
 */
function selectExtractionModel(emitConfig, schema) {
  // Explicit override from YAML config
  if (emitConfig.extraction_model) {
    if (emitConfig.extraction_model === 'sonnet') {
      return process.env.EXTRACTION_MODEL_SONNET || 'claude-sonnet-4-20250514';
    }
    return process.env.EXTRACTION_MODEL_NAME || 'claude-haiku-4-5-20251001';
  }

  // Complexity heuristic
  if (schema && schema.properties) {
    const propertyCount = Object.keys(schema.properties).length;
    const hasMultiValueEnum = Object.values(schema.properties).some(
      p => p && p.enum && p.enum.length > 5
    );
    if (propertyCount > 10 || hasMultiValueEnum) {
      return process.env.EXTRACTION_MODEL_SONNET || 'claude-sonnet-4-20250514';
    }
  }

  return process.env.EXTRACTION_MODEL_NAME || 'claude-haiku-4-5-20251001';
}

/**
 * Extract variables from a rendered document.
 * Groups emits by model selection and runs extraction per group.
 */
async function extractVariables(renderedOutput, emitsSpec, inputValues) {
  if (!emitsSpec || emitsSpec.length === 0) {
    return null;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️ ANTHROPIC_API_KEY not set — skipping variable extraction');
    return null;
  }

  const maxTokens = parseInt(process.env.EXTRACTION_MAX_TOKENS || '8192', 10);

  // Group emits by their selected model
  const modelGroups = {};
  for (const emit of emitsSpec) {
    const schema = resolveSchemaRefs(emit.schema);
    const model = selectExtractionModel(emit, schema);
    if (!modelGroups[model]) modelGroups[model] = [];
    modelGroups[model].push(emit);
  }

  const modelNames = Object.keys(modelGroups);
  console.log(`🔄 Extraction: ${emitsSpec.length} variables across ${modelNames.length} model(s): ${modelNames.map(m => `${m.split('-')[1] || m}(${modelGroups[m].length})`).join(', ')}`);

  const allExtracted = {};

  for (const [modelName, groupEmits] of Object.entries(modelGroups)) {
    const llm = new ChatAnthropic({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      modelName: modelName,
      temperature: 0,
      maxTokens: maxTokens,
    });

    const prompt = buildExtractionPrompt(renderedOutput, groupEmits, inputValues);
    let extracted = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts && !extracted) {
      attempts++;
      try {
        const currentPrompt = attempts === 1 ? prompt : prompt + `\n\nCRITICAL RETRY INSTRUCTION: Your previous response returned flat strings instead of structured objects. You MUST return JSON matching the exact schema above. Do not return strings or summaries — return objects with ALL specified fields. Every pool variable must be an array of objects, not an array of strings. Use null for missing optional fields.`;

        const response = await llm.invoke(currentPrompt);
        const parsed = parseExtractionResponse(response.content);

        if (!parsed) {
          console.warn(`⚠️ [${modelName}] Extraction attempt ${attempts}/${maxAttempts}: JSON parse failed`);
          continue;
        }

        const validation = validateExtraction(parsed, groupEmits);

        if (validation.errors.length > 0) {
          console.warn(`⚠️ [${modelName}] Attempt ${attempts}/${maxAttempts}: Validation errors:`, validation.errors);
          if (attempts < maxAttempts) continue;
        }

        if (validation.structureErrors.length > 0) {
          console.error(`❌ [${modelName}] Attempt ${attempts}/${maxAttempts}: Schema structure mismatch:`);
          validation.structureErrors.forEach(e => console.error(`   ${e}`));
          if (attempts < maxAttempts) {
            console.warn(`🔄 Retrying with stricter prompt...`);
            continue;
          }
          console.error(`❌ CRITICAL: [${modelName}] Extraction failed schema validation after ${maxAttempts} attempts. These variables will NOT be written.`);
          // Don't return null — other model groups may have succeeded
          break;
        }

        extracted = parsed;
      } catch (error) {
        console.error(`❌ [${modelName}] Attempt ${attempts}/${maxAttempts} failed:`, error.message);
        if (attempts >= maxAttempts) {
          console.error(`❌ [${modelName}] All extraction attempts failed`);
        }
      }
    }

    if (extracted) {
      Object.assign(allExtracted, extracted);
    }
  }

  if (Object.keys(allExtracted).length === 0) return null;

  // Attach emit specs for merge logic
  for (const emit of emitsSpec) {
    if (allExtracted[emit.key] !== undefined) {
      allExtracted[emit.key] = {
        value: allExtracted[emit.key],
        _emitSpec: emit,
      };
    }
  }

  return allExtracted;
}

module.exports = {
  extractVariables,
  loadSchema,
  buildExtractionPrompt,
  parseExtractionResponse,
  validateExtraction,
};
