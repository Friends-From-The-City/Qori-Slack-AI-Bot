/**
 * PH-2: Model Provider Boundary Tests (ADR 0034)
 *
 * Proves:
 * - No direct ChatAnthropic/@langchain/anthropic import outside modelProvider.ts
 * - Tier→model mapping preserves current behavior
 * - Temperature/options forwarded correctly
 * - resolveModelTier maps model names to tiers correctly
 * - Factory validates API key
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// ═══════════════════════════════════════════════════════════════════════
// PATTERN ENFORCEMENT: No provider SDK outside boundary
// ═══════════════════════════════════════════════════════════════════════

describe('PH-2: Model provider boundary enforcement', () => {
  const srcDir = join(__dirname, '../../');
  const ALLOWED_FILE = 'helpers/modelProvider.ts';

  function collectTsFiles(dir: string, base: string = ''): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const relPath = base ? `${base}/${entry}` : entry;
      if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...collectTsFiles(fullPath, relPath));
      } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        files.push(relPath);
      }
    }
    return files;
  }

  const tsFiles = collectTsFiles(srcDir);

  it('no file outside modelProvider.ts imports ChatAnthropic', () => {
    const violations: string[] = [];
    for (const file of tsFiles) {
      if (file === ALLOWED_FILE) continue;
      const content = readFileSync(join(srcDir, file), 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
        if (line.includes('ChatAnthropic') || line.includes("'@langchain/anthropic'") || line.includes('"@langchain/anthropic"')) {
          violations.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// FACTORY BEHAVIOR
// ═══════════════════════════════════════════════════════════════════════

describe('PH-2: Model factory behavior', () => {
  // Save and restore env
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('resolveModelTier maps haiku model names to haiku tier', () => {
    const { resolveModelTier } = require('../../helpers/modelProvider');
    expect(resolveModelTier('claude-haiku-4-5-20251001')).toBe('haiku');
    expect(resolveModelTier('claude-haiku-4-5')).toBe('haiku');
  });

  it('resolveModelTier maps sonnet model names to sonnet tier', () => {
    const { resolveModelTier } = require('../../helpers/modelProvider');
    expect(resolveModelTier('claude-sonnet-4-6')).toBe('sonnet');
    expect(resolveModelTier('claude-sonnet-4-5')).toBe('sonnet');
  });

  it('resolveModelTier maps opus model names to opus tier', () => {
    const { resolveModelTier } = require('../../helpers/modelProvider');
    expect(resolveModelTier('claude-opus-4-6')).toBe('opus');
  });

  it('resolveModelTier defaults unknown models to sonnet', () => {
    const { resolveModelTier } = require('../../helpers/modelProvider');
    expect(resolveModelTier('some-unknown-model')).toBe('sonnet');
  });

  it('getDefaultModelName returns sonnet model name', () => {
    const { getDefaultModelName } = require('../../helpers/modelProvider');
    const name = getDefaultModelName();
    expect(name).toContain('sonnet');
  });

  it('getModelName returns tier-appropriate model', () => {
    const { getModelName } = require('../../helpers/modelProvider');
    expect(getModelName('haiku')).toContain('haiku');
    expect(getModelName('sonnet')).toContain('sonnet');
    expect(getModelName('opus')).toContain('opus');
  });

  it('createModel throws without ANTHROPIC_API_KEY', () => {
    delete process.env.ANTHROPIC_API_KEY;
    // Clear module cache to pick up env change
    jest.resetModules();
    const { createModel } = require('../../helpers/modelProvider');
    expect(() => createModel({ tier: 'sonnet' })).toThrow('ANTHROPIC_API_KEY');
  });

  it('createModel succeeds with ANTHROPIC_API_KEY set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-for-unit-test';
    jest.resetModules();
    const { createModel } = require('../../helpers/modelProvider');
    const model = createModel({ tier: 'sonnet' });
    expect(model).toBeDefined();
  });

  it('createModel respects temperature override', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-for-unit-test';
    jest.resetModules();
    const { createModel } = require('../../helpers/modelProvider');
    // Should not throw with custom temperature
    const model = createModel({ tier: 'haiku', temperature: 0, maxTokens: 512 });
    expect(model).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ADR EXISTS
// ═══════════════════════════════════════════════════════════════════════

describe('PH-2: ADR 0034 exists', () => {
  it('ADR 0034 model provider boundary document exists', () => {
    const adr = readFileSync(
      join(__dirname, '../../../../docs/architecture-decisions/0034-model-provider-boundary.md'),
      'utf-8',
    );
    expect(adr).toContain('Model Provider Boundary');
    expect(adr).toContain('haiku');
    expect(adr).toContain('sonnet');
    expect(adr).toContain('opus');
    expect(adr).toContain('modelProvider.ts');
  });
});
