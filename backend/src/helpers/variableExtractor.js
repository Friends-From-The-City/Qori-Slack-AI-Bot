// variableExtractor.js — Extract structured variables from generated documents using Haiku
const { ChatAnthropic } = require('@langchain/anthropic');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const SCHEMA_BASE_PATH = path.resolve(__dirname, '../../../config/schemas');

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
    console.warn(`⚠️ Could not load schema "${ref}":`, error.message);
    return null;
  }
}

/**
 * Build the extraction prompt for Haiku.
 * Takes the rendered markdown and the emits spec, produces a prompt
 * that instructs Haiku to extract structured JSON.
 */
function buildExtractionPrompt(renderedMarkdown, emitsSpec, inputValues) {
  const variableDescriptions = emitsSpec.map(emit => {
    const schema = emit.schema?.$ref ? loadSchema(emit.schema.$ref) : emit.schema;
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

RULES:
1. Extract ONLY information that exists in the document. Do not invent data.
2. Follow the schema exactly. Every field must be present (use null for missing optional fields).
3. For pool variables (pool: true), extract an array of items.
4. For non-pool variables, extract a single value or object.
5. Participant IDs must use the PT-### format found in the document.
6. Quotes must be verbatim from the document.
7. If a variable cannot be extracted (no relevant content), use an empty array [] for pools or null for singles.

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
 * Returns { valid: true/false, errors: [...] }
 */
function validateExtraction(extracted, emitsSpec) {
  const errors = [];

  for (const emit of emitsSpec) {
    const value = extracted[emit.key];
    if (value === undefined) {
      errors.push(`Missing variable: ${emit.key}`);
      continue;
    }

    if (emit.pool && !Array.isArray(value)) {
      errors.push(`${emit.key} should be an array (pool variable), got ${typeof value}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
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
async function extractVariables(renderedOutput, emitsSpec, inputValues) {
  if (!emitsSpec || emitsSpec.length === 0) {
    return null;
  }

  // Use Haiku for extraction — structured task, cheaper model
  const extractionModel = process.env.EXTRACTION_MODEL_NAME || 'claude-haiku-4-5-20251001';
  const maxTokens = parseInt(process.env.EXTRACTION_MAX_TOKENS || '4096', 10);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️ ANTHROPIC_API_KEY not set — skipping variable extraction');
    return null;
  }

  const llm = new ChatAnthropic({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    modelName: extractionModel,
    temperature: 0,
    maxTokens: maxTokens,
  });

  const prompt = buildExtractionPrompt(renderedOutput, emitsSpec, inputValues);

  let extracted = null;
  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts && !extracted) {
    attempts++;
    try {
      const response = await llm.invoke(prompt);
      const parsed = parseExtractionResponse(response.content);

      if (!parsed) {
        console.warn(`⚠️ Extraction attempt ${attempts}/${maxAttempts}: JSON parse failed`);
        continue;
      }

      const validation = validateExtraction(parsed, emitsSpec);
      if (!validation.valid) {
        console.warn(`⚠️ Extraction attempt ${attempts}/${maxAttempts}: Validation errors:`, validation.errors);
        if (attempts < maxAttempts) continue;
        // On last attempt, use what we got even if partially invalid
        console.warn('⚠️ Using partially valid extraction on final attempt');
      }

      extracted = parsed;
    } catch (error) {
      console.error(`❌ Extraction attempt ${attempts}/${maxAttempts} failed:`, error.message);
      if (attempts >= maxAttempts) {
        console.error('❌ All extraction attempts failed — skipping variable extraction');
        return null;
      }
    }
  }

  if (!extracted) return null;

  // Attach emit specs for merge logic (pool strategy, etc.)
  for (const emit of emitsSpec) {
    if (extracted[emit.key] !== undefined) {
      extracted[emit.key] = {
        value: extracted[emit.key],
        _emitSpec: emit,
      };
    }
  }

  return extracted;
}

module.exports = {
  extractVariables,
  loadSchema,
  buildExtractionPrompt,
  parseExtractionResponse,
  validateExtraction,
};
