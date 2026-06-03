#!/usr/bin/env npx ts-node
/**
 * build-cascade-registry.ts
 *
 * Generates cascade registry files from YAML sources (single source of truth).
 * Run: npm run build:cascade
 *
 * Outputs:
 *   - src/helpers/slack/ui/cascadeRegistry.generated.ts (TEMPLATE_CONSUMES)
 *   - src/types/cascade.generated.ts (interfaces from schemas)
 *
 * See ADR 0021 for architecture decision.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const PROMPTS_DIR = path.resolve(__dirname, '../../config/prompts');
const SCHEMAS_DIR = path.resolve(__dirname, '../config/schemas');
const REGISTRY_OUTPUT = path.resolve(__dirname, '../src/helpers/slack/ui/cascadeRegistry.generated.ts');
const TYPES_OUTPUT = path.resolve(__dirname, '../src/types/cascade.generated.ts');

// ---------------------------------------------------------------------------
// Types for YAML parsing
// ---------------------------------------------------------------------------

interface ConsumeEntry {
  key: string;
  source: string;
  required: boolean;
  inject_as?: string;
  description?: string;
}

interface EmitEntry {
  key: string;
  pool?: boolean;
  pool_strategy?: string;
  extraction_model?: string;
  schema?: {
    type?: string;
    items?: { $ref?: string };
    $ref?: string;
  };
  extract_from?: string;
}

interface YamlTemplate {
  id?: string;
  name?: string;
  version?: string;
  consumes?: ConsumeEntry[];
  emits?: EmitEntry[];
}

interface SchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  items?: { type?: string; $ref?: string };
  properties?: Record<string, SchemaProperty>;
  $ref?: string;
}

interface YamlSchema {
  type?: string;
  description?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

// ---------------------------------------------------------------------------
// ID Aliases — map YAML id to the method key used in code
// These handle cases where the YAML template ID differs from the method
// selection value used in modals/handlers.
// ---------------------------------------------------------------------------

const ID_ALIASES: Record<string, string> = {
  // YAML id: persona_generator → code uses: persona_generation
  persona_generator: 'persona_generation',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readYamlFile<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return yaml.load(content) as T;
  } catch (err) {
    console.warn(`Warning: Could not read ${filePath}: ${err}`);
    return null;
  }
}

function pascalCase(str: string): string {
  return str
    .split(/[_\s-]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function humanLabel(key: string): string {
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function sourceHint(source: string): string {
  const hints: Record<string, string> = {
    session_summary: 'Run session summaries first',
    research_brief: 'Create research brief first',
    research_plan: 'Create research plan first',
    affinity_mapping: 'Run affinity mapping first',
    persona_generator: 'Run persona generation first',
    stakeholder_synthesis: 'Run stakeholder synthesis first',
    jobs_to_be_done: 'Run jobs-to-be-done first',
    desk_research: 'Run /qori-discover (desk research) first',
    survey_synthesis: 'Run /qori-discover (survey) first',
    research_readout: 'Run research readout first',
  };
  return hints[source] || `Complete ${source.replace(/_/g, ' ')} first`;
}

// ---------------------------------------------------------------------------
// Registry Generator (TEMPLATE_CONSUMES)
// ---------------------------------------------------------------------------

function generateRegistry(): string {
  const templates: Record<string, ConsumeEntry[]> = {};

  // Read all YAML templates
  const yamlFiles = fs.readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.yaml'));

  for (const filename of yamlFiles) {
    const filePath = path.join(PROMPTS_DIR, filename);
    const template = readYamlFile<YamlTemplate>(filePath);

    if (!template?.id || !template.consumes || template.consumes.length === 0) {
      continue;
    }

    // Apply ID alias if one exists (e.g., persona_generator → persona_generation)
    const registryKey = ID_ALIASES[template.id] || template.id;
    templates[registryKey] = template.consumes;
  }

  // Generate TypeScript
  const lines: string[] = [
    '// AUTO-GENERATED FILE — do not edit manually',
    '// Source: config/prompts/*.yaml consumes: blocks',
    '// Run: npm run build:cascade',
    '//',
    '// NOTE: This tracks YAML-declared consumption only. Some variables are consumed',
    '// by handler code directly (e.g., briefHandler.ts for discovery variables).',
    '// To find ALL consumers of a variable, also grep handler code for the key.',
    '// See ADR 0021 for details.',
    '',
    'export interface ConsumeSpec {',
    '  key: string;',
    '  required: boolean;',
    '  label: string;',
    '  source_hint: string;',
    '}',
    '',
    '/**',
    ' * Consumes specifications per template, generated from YAML consumes: blocks.',
    ' * Used by cascade readiness checks in modals.',
    ' */',
    'export const TEMPLATE_CONSUMES: Record<string, ConsumeSpec[]> = {',
  ];

  const sortedIds = Object.keys(templates).sort();
  for (const templateId of sortedIds) {
    const consumes = templates[templateId];
    lines.push(`  ${templateId}: [`);

    for (const entry of consumes) {
      const label = humanLabel(entry.key);
      const hint = sourceHint(entry.source);
      lines.push(`    { key: '${entry.key}', required: ${entry.required}, label: '${label}', source_hint: '${hint}' },`);
    }

    lines.push('  ],');
  }

  lines.push('};');
  lines.push('');

  // Also generate TEMPLATE_EMITS for completeness
  const emits: Record<string, string[]> = {};

  for (const filename of yamlFiles) {
    const filePath = path.join(PROMPTS_DIR, filename);
    const template = readYamlFile<YamlTemplate>(filePath);

    if (!template?.id || !template.emits || template.emits.length === 0) {
      continue;
    }

    // Apply ID alias if one exists
    const registryKey = ID_ALIASES[template.id] || template.id;
    emits[registryKey] = template.emits.map(e => e.key);
  }

  lines.push('/**');
  lines.push(' * Emits specifications per template, generated from YAML emits: blocks.');
  lines.push(' * Used for cascade dependency tracking.');
  lines.push(' */');
  lines.push('export const TEMPLATE_EMITS: Record<string, string[]> = {');

  const sortedEmitIds = Object.keys(emits).sort();
  for (const templateId of sortedEmitIds) {
    const keys = emits[templateId];
    lines.push(`  ${templateId}: [${keys.map(k => `'${k}'`).join(', ')}],`);
  }

  lines.push('};');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Types Generator (interfaces from schemas)
// ---------------------------------------------------------------------------

function yamlTypeToTs(prop: SchemaProperty): string {
  if (prop.$ref) {
    const refName = prop.$ref.replace('schemas/', '').replace('.yaml', '');
    return pascalCase(refName);
  }

  switch (prop.type) {
    case 'string':
      if (prop.enum) {
        return prop.enum.map(v => `'${v}'`).join(' | ');
      }
      return 'string';
    case 'integer':
    case 'number':
      if (prop.enum) {
        return prop.enum.join(' | ');
      }
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      if (prop.items) {
        const itemType = yamlTypeToTs(prop.items);
        return `${itemType}[]`;
      }
      return 'unknown[]';
    case 'object':
      if (prop.properties) {
        const fields = Object.entries(prop.properties)
          .map(([k, v]) => `${k}: ${yamlTypeToTs(v)}`)
          .join('; ');
        return `{ ${fields} }`;
      }
      return 'Record<string, unknown>';
    default:
      return 'unknown';
  }
}

function generateInterfaceFromSchema(schemaPath: string): string | null {
  const schema = readYamlFile<YamlSchema>(schemaPath);
  if (!schema || !schema.properties) {
    return null;
  }

  const filename = path.basename(schemaPath, '.yaml');
  const interfaceName = pascalCase(filename);
  const required = new Set(schema.required || []);

  const lines: string[] = [
    `/** Generated from ${filename}.yaml */`,
    `export interface ${interfaceName} {`,
  ];

  for (const [propName, propDef] of Object.entries(schema.properties)) {
    const isRequired = required.has(propName);
    const tsType = yamlTypeToTs(propDef);
    const optional = isRequired ? '' : ' | null';
    const comment = propDef.description ? `  /** ${propDef.description} */\n` : '';
    lines.push(`${comment}  ${propName}: ${tsType}${optional};`);
  }

  lines.push('}');
  return lines.join('\n');
}

function generateTypes(): string {
  const lines: string[] = [
    '// AUTO-GENERATED FILE — do not edit manually',
    '// Source: backend/config/schemas/*.yaml',
    '// Run: npm run build:cascade',
    '',
    '// ---------------------------------------------------------------------------',
    '// Generated interfaces from YAML schemas',
    '// ---------------------------------------------------------------------------',
    '',
  ];

  // Read all schema files
  const schemaFiles = fs.readdirSync(SCHEMAS_DIR)
    .filter(f => f.endsWith('.yaml'))
    .sort();

  for (const filename of schemaFiles) {
    const schemaPath = path.join(SCHEMAS_DIR, filename);
    const interfaceCode = generateInterfaceFromSchema(schemaPath);

    if (interfaceCode) {
      lines.push(interfaceCode);
      lines.push('');
    }
  }

  // Generate CascadeVariableMapGenerated (subset that has schemas)
  lines.push('// ---------------------------------------------------------------------------');
  lines.push('// Variable key registry (generated portion)');
  lines.push('// ---------------------------------------------------------------------------');
  lines.push('');
  lines.push('/**');
  lines.push(' * Maps cascade variable keys to their generated TypeScript types.');
  lines.push(' * For primitive types (string, string[]), see cascade.manual.ts.');
  lines.push(' */');
  lines.push('export interface CascadeVariableMapGenerated {');

  // Map schema names to variable keys (schema name is typically the variable key singularized)
  // This is imperfect but covers the common pattern
  for (const filename of schemaFiles) {
    const schemaName = filename.replace('.yaml', '');
    const interfaceName = pascalCase(schemaName);
    // Variable key is often the plural form or exact match
    lines.push(`  // ${schemaName} → ${interfaceName}`);
  }

  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('Building cascade registry from YAML sources...');

  // Generate registry
  const registryContent = generateRegistry();
  fs.writeFileSync(REGISTRY_OUTPUT, registryContent);
  console.log(`  ✓ Generated ${REGISTRY_OUTPUT}`);

  // Generate types
  const typesContent = generateTypes();
  fs.writeFileSync(TYPES_OUTPUT, typesContent);
  console.log(`  ✓ Generated ${TYPES_OUTPUT}`);

  console.log('Done.');
}

main();
