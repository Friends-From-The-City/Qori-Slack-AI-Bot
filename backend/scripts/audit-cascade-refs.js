/**
 * Referential integrity audit for YAML templates
 * Checks that all consumes.source references resolve to a declared template id
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const PROMPTS_DIR = path.join(__dirname, '../../config/prompts');

// Collect all declared IDs
const declaredIds = new Map();  // id → filename

// Collect all consumes references
const consumesRefs = [];  // { consumer, source, filename }

// Walk all YAML files
const files = fs.readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.yaml'));

for (const filename of files) {
  try {
    const content = fs.readFileSync(path.join(PROMPTS_DIR, filename), 'utf8');
    const config = yaml.load(content);

    if (!config) continue;

    // Record declared ID
    if (config.id) {
      if (declaredIds.has(config.id)) {
        console.log('⚠️ DUPLICATE ID:', config.id, 'in', filename, 'and', declaredIds.get(config.id));
      }
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
  } catch (err) {
    console.error('Error parsing', filename + ':', err.message);
  }
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('DECLARED TEMPLATE IDs (' + declaredIds.size + ' total)');
console.log('═══════════════════════════════════════════════════════════');
for (const [id, filename] of Array.from(declaredIds.entries()).sort()) {
  console.log('  ' + id.padEnd(30) + ' ← ' + filename);
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('CONSUMES SOURCE REFERENCES (' + consumesRefs.length + ' total)');
console.log('═══════════════════════════════════════════════════════════');
for (const ref of consumesRefs.sort((a,b) => a.source.localeCompare(b.source))) {
  const status = declaredIds.has(ref.source) ? '✓' : '❌ NOT FOUND';
  console.log('  ' + ref.source.padEnd(25) + ' → ' + ref.key.padEnd(25) + ' (in ' + ref.consumer + ')  ' + status);
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('MISMATCHES (consumes.source that does not resolve to a known id)');
console.log('═══════════════════════════════════════════════════════════');
const mismatches = consumesRefs.filter(ref => !declaredIds.has(ref.source));
if (mismatches.length === 0) {
  console.log('  (none)');
} else {
  for (const ref of mismatches) {
    // Try to find similar IDs
    const similar = Array.from(declaredIds.keys()).filter(id =>
      id.includes(ref.source) || ref.source.includes(id.replace(/_processor$/, ''))
    );
    console.log('  ❌ Consumer: ' + ref.consumer);
    console.log('     References: source="' + ref.source + '" for key="' + ref.key + '"');
    console.log('     File: ' + ref.filename);
    if (similar.length > 0) {
      console.log('     Similar IDs: ' + similar.join(', '));
    }
    console.log('');
  }
}
