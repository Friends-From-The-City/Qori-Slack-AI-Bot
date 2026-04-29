// yamlProcessor.js
const yaml = require('js-yaml');
const Handlebars = require('handlebars');
const { format } = require('date-fns');
const path = require('path');
const { createOrUpdateFileOnGitHub } = require('./github');
const { executeAiGenerationTasks } = require('./langchain');

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

  // 7. Push the generated content to GitHub
  const fullPath = path.posix.join(baseFolder, extraFolder, filePath, filename);
  // 6. Push the generated content to GitHub
  const result = await createOrUpdateFileOnGitHub(fullPath, outputTemplate);
  if (aiCheck) {
    return { result, outputTemplate, aiResponses };
  } else {
    return { result, outputTemplate };
  }
}

module.exports = { processYamlTemplate };
