// yamlProcessor.js
const yaml = require('js-yaml');
const Handlebars = require('handlebars');
const { format } = require('date-fns');
const path = require('path');
const { createOrUpdateFileOnGitHub } = require('./github');
const { executeAiGenerationTasks } = require('./langchain');

// Build YAML frontmatter for traceability (prepended to every generated document)
function buildTraceabilityFrontmatter(yamlConfig, inputValues) {
  const lines = ['---'];

  lines.push(`generated_at: "${new Date().toISOString()}"`);
  lines.push(`model: "${process.env.ANTHROPIC_MODEL_NAME || 'claude-sonnet-4-20250514'}"`);
  lines.push(`template: "${yamlConfig.id || 'unknown'}"`);
  lines.push(`template_version: "${yamlConfig.version || 'unknown'}"`);
  lines.push(`study: "${inputValues.selected_study || inputValues.study_name || 'unknown'}"`);

  // Add input files if available
  const noteFiles = inputValues.selected_note_files;
  if (noteFiles) {
    const files = Array.isArray(noteFiles) ? noteFiles : [noteFiles];
    if (files.length > 0 && files[0]) {
      lines.push('input_files:');
      files.forEach(f => lines.push(`  - "${f}"`));
    }
  }

  lines.push(`max_tokens: ${process.env.ANTHROPIC_MAX_TOKENS || '8192'}`);
  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

// Generate the output content using Handlebars for different templates
function generateOutputTemplate(outputTemplate, { aiGenerated, ...inputValues }) {
  const template = Handlebars.compile(outputTemplate, { noEscape: true });
  return template({
    ...inputValues,
    current_date: format(new Date(), 'MMMM d, yyyy'),
    ai_generated: aiGenerated, // Map to the expected template variable name
  });
}

async function processYamlTemplate(rawYamlContent, inputValues, baseFolderEncoded, extraFolder = 'primary-research', aiCheck = false) {
  // 1. Parse the raw YAML content first
  const yamlConfig = yaml.load(rawYamlContent);
  if (!yamlConfig) {
    throw new Error('Failed to parse YAML configuration');
  }

  // 2. Decode base folder
  const baseFolder = decodeURIComponent(baseFolderEncoded);

  // 3. Check if output_template exists
  if (!yamlConfig.output_template) {
    throw new Error('Missing output_template in YAML configuration');
  }

  // 4. Prepare LangChain tasks for AI generation (optional)
  let aiResponses = {};
  if (yamlConfig.ai_generation_tasks && yamlConfig.ai_generation_tasks.length > 0) {
    aiResponses = await executeAiGenerationTasks(yamlConfig.ai_generation_tasks, { ...inputValues, current_date: format(new Date(), 'MMMM d, yyyy') });
    console.log("🚀 ~ processYamlTemplate ~ aiResponses:", aiResponses)
  } else {
    aiResponses = {};
  }

  // 5. Build the output content using the responses from LLM (if any)
  const outputTemplate = generateOutputTemplate(yamlConfig.output_template, {
    ...inputValues,
    aiGenerated: aiResponses,
  });

  // 6. Generate filename and path from YAML configuration
  const filenameTemplate = (yamlConfig.output_options && yamlConfig.output_options.filename) || 'research_brief.md';
  const filePathTemplate = (yamlConfig.output_options && yamlConfig.output_options.path) || '';

  // Render filename and path with Handlebars
  const filename = generateOutputTemplate(filenameTemplate, {
    ...inputValues,
    aiGenerated: aiResponses,
    current_date: format(new Date(), 'MMMM d, yyyy'),
  });

  const filePath = generateOutputTemplate(filePathTemplate, {
    ...inputValues,
    aiGenerated: aiResponses,
    current_date: format(new Date(), 'MMMM d, yyyy'),
  });

  // 7. Prepend traceability frontmatter and push to GitHub
  const frontmatter = buildTraceabilityFrontmatter(yamlConfig, inputValues);
  const fullContent = frontmatter + outputTemplate;
  const fullPath = path.posix.join(baseFolder, extraFolder, filePath, filename);
  const result = await createOrUpdateFileOnGitHub(fullPath, fullContent);
  if (aiCheck) {
    return { result, outputTemplate, aiResponses };
  } else {
    return { result, outputTemplate };
  }
}

module.exports = { processYamlTemplate };
