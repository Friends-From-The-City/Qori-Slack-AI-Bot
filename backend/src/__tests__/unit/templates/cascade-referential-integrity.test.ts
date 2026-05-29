/**
 * Cascade Referential Integrity Test
 *
 * Ensures every consumes.source reference in YAML templates resolves to
 * a declared template id. This prevents the class of bugs where a template
 * tries to consume from a source that doesn't exist (or has a mismatched id).
 *
 * Phase B-0: Added to prevent recurrence of the desk_research_processor,
 * analyze_notes, and usability_issues_extractor naming mismatches.
 *
 * The pattern: YAML `id` field is the canonical identifier. Consumer
 * `consumes.source` references resolve directly to it. No suffixes,
 * no transformations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const PROMPTS_DIR = path.join(__dirname, '../../../../../config/prompts');

interface YamlConfig {
  id?: string;
  consumes?: Array<{
    key: string;
    source?: string;
    required?: boolean;
  }>;
}

interface ConsumeReference {
  consumer: string;
  source: string;
  key: string;
  filename: string;
}

describe('Cascade referential integrity', () => {
  let declaredIds: Map<string, string>;
  let consumesRefs: ConsumeReference[];

  beforeAll(() => {
    declaredIds = new Map();
    consumesRefs = [];

    const files = fs.readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.yaml'));

    for (const filename of files) {
      const content = fs.readFileSync(path.join(PROMPTS_DIR, filename), 'utf8');
      const config = yaml.load(content) as YamlConfig | null;

      if (!config) continue;

      // Record declared ID
      if (config.id) {
        declaredIds.set(config.id, filename);
      }

      // Record consumes references
      if (config.consumes && Array.isArray(config.consumes)) {
        for (const spec of config.consumes) {
          if (spec.source) {
            consumesRefs.push({
              consumer: config.id || filename,
              source: spec.source,
              key: spec.key,
              filename,
            });
          }
        }
      }
    }
  });

  it('loads all YAML templates without error', () => {
    expect(declaredIds.size).toBeGreaterThan(0);
    console.log(`✓ Loaded ${declaredIds.size} template IDs`);
  });

  it('finds consumes references to validate', () => {
    expect(consumesRefs.length).toBeGreaterThan(0);
    console.log(`✓ Found ${consumesRefs.length} consumes.source references`);
  });

  it('resolves every consumes.source to a declared template id', () => {
    const mismatches = consumesRefs.filter(ref => !declaredIds.has(ref.source));

    if (mismatches.length > 0) {
      const report = mismatches.map(ref => {
        const similar = Array.from(declaredIds.keys()).filter(id =>
          id.includes(ref.source) || ref.source.includes(id.replace(/_processor$/, '').replace(/_extractor$/, ''))
        );
        return [
          `  ❌ Consumer: ${ref.consumer}`,
          `     References: source="${ref.source}" for key="${ref.key}"`,
          `     File: ${ref.filename}`,
          similar.length > 0 ? `     Similar IDs: ${similar.join(', ')}` : null,
        ].filter(Boolean).join('\n');
      }).join('\n\n');

      fail(`${mismatches.length} consumes.source references do not resolve to a declared template id:\n\n${report}`);
    }

    console.log(`✓ All ${consumesRefs.length} consumes.source references resolve to declared IDs`);
  });

  it('has no duplicate template IDs', () => {
    const idCounts = new Map<string, string[]>();

    const files = fs.readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.yaml'));
    for (const filename of files) {
      const content = fs.readFileSync(path.join(PROMPTS_DIR, filename), 'utf8');
      const config = yaml.load(content) as YamlConfig | null;
      if (config?.id) {
        const existing = idCounts.get(config.id) || [];
        existing.push(filename);
        idCounts.set(config.id, existing);
      }
    }

    const duplicates = Array.from(idCounts.entries())
      .filter(([_, files]) => files.length > 1);

    if (duplicates.length > 0) {
      const report = duplicates.map(([id, files]) =>
        `  ❌ ID "${id}" declared in multiple files: ${files.join(', ')}`
      ).join('\n');
      fail(`Duplicate template IDs found:\n\n${report}`);
    }

    console.log(`✓ No duplicate template IDs`);
  });
});
