/**
 * Pattern enforcement assertions — structural tests that scan the codebase
 * for Phase 4 bug class regressions.
 *
 * These tests use filesystem reads and regex matching to verify patterns
 * across the codebase. They don't hit a database.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC_ROOT = join(__dirname, '../..');

/**
 * Recursively find all .ts files under a directory.
 */
function findTsFiles(dir: string, results: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
    if (statSync(full).isDirectory()) {
      findTsFiles(full, results);
    } else if (full.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

function readFile(path: string): string {
  return readFileSync(path, 'utf-8');
}

// ═══════════════════════════════════════════════════════════
// Assertion 1: No throw new Error() for cascade contract violations
// ═══════════════════════════════════════════════════════════

describe('pattern: cascade contract errors use TemplateContractError', () => {
  const commandsDir = join(SRC_ROOT, 'helpers/slack/commands');

  it('handler files that read cascade variables use TemplateContractError, not bare Error', () => {
    const files = findTsFiles(commandsDir);
    const violations: string[] = [];

    for (const file of files) {
      const content = readFile(file);
      const rel = relative(SRC_ROOT, file);

      // Skip files that don't read upstream variables
      if (!content.includes('readUpstreamVariables')) continue;

      // Find throw new Error(...) that look like cascade contract checks
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // pattern-enforcement-ignore comments suppress this check
        if (line.includes('pattern-enforcement-ignore')) continue;

        if (
          line.includes('throw new Error') &&
          !line.includes('TemplateContractError') &&
          // Heuristic: if the error message mentions upstream, cascade, brief, plan, or required
          (line.includes('required') || line.includes('upstream') ||
           line.includes('brief') || line.includes('objectives') ||
           line.includes('cascade'))
        ) {
          violations.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════
// Assertion 2: Handlers use Bolt native types, not wrapper types
// ═══════════════════════════════════════════════════════════

describe('pattern: handlers use Bolt native types', () => {
  const commandsDir = join(SRC_ROOT, 'helpers/slack/commands');

  it('no handler file imports deprecated wrapper types from types/handlers', () => {
    const files = findTsFiles(commandsDir);
    const violations: string[] = [];
    const deprecatedTypes = ['ViewSubmissionContext', 'SlashCommandContext', 'BlockActionContext', 'EventContext'];

    for (const file of files) {
      const content = readFile(file);
      const rel = relative(SRC_ROOT, file);

      for (const typeName of deprecatedTypes) {
        // Check imports specifically — not just any mention
        if (content.includes(`import`) && content.includes(typeName) && content.includes('types/handlers')) {
          violations.push(`${rel}: imports deprecated ${typeName} from types/handlers`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('types/handlers.ts does not export deprecated wrapper types', () => {
    const handlersFile = readFile(join(SRC_ROOT, 'types/handlers.ts'));
    expect(handlersFile).not.toContain('export interface ViewSubmissionContext');
    expect(handlersFile).not.toContain('export interface SlashCommandContext');
    expect(handlersFile).not.toContain('export interface BlockActionContext');
    expect(handlersFile).not.toContain('export interface EventContext');
  });
});

// ═══════════════════════════════════════════════════════════
// Assertion 3: events.ts registration has zero as-any casts
// ═══════════════════════════════════════════════════════════

describe('pattern: events.ts registration boundary is typed', () => {
  const eventsFile = readFile(join(SRC_ROOT, 'helpers/slack/events.ts'));

  it('has at most 1 as-any cast (documented view_closed Bolt gap)', () => {
    const asAnyCasts = eventsFile.match(/ as any/g) || [];
    // Exactly 1: the documented view_closed Bolt type gap
    expect(asAnyCasts.length).toBeLessThanOrEqual(1);
  });

  it('the only as-any cast is on view_closed with a justification comment', () => {
    const lines = eventsFile.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(' as any') && !line.trimStart().startsWith('//')) {
        // Must be the view_closed line with a comment above it
        expect(line).toContain('view_closed');
        // Check for justification comment in preceding 3 lines
        const context = lines.slice(Math.max(0, i - 3), i).join('\n');
        expect(context).toContain('Bolt type gap');
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Assertion 4: No new as-any outside bounded categories
// ═══════════════════════════════════════════════════════════

describe('pattern: as-any budget enforcement', () => {
  it('total any count (as any + : any) does not exceed baseline', () => {
    const allFiles = findTsFiles(SRC_ROOT);
    let total = 0;

    for (const file of allFiles) {
      const content = readFile(file);
      // Count both `as any` and `: any` patterns (the two forms of any usage)
      const asAnyCasts = content.match(/as any/g) || [];
      const colonAnyCasts = content.match(/: any/g) || [];
      total += asAnyCasts.length + colonAnyCasts.length;
    }

    // Baseline after Stream 1: ~193 (measured). Allow 10% margin for natural growth.
    // If this fails, new `any` was introduced — categorize and justify or fix.
    expect(total).toBeLessThanOrEqual(215);
  });

  it('events.ts has no more than 1 as-any cast (excluding comments)', () => {
    const eventsContent = readFile(join(SRC_ROOT, 'helpers/slack/events.ts'));
    const codeLines = eventsContent.split('\n').filter(l => !l.trimStart().startsWith('//'));
    const codeOnly = codeLines.join('\n');
    const matches = codeOnly.match(/as any/g) || [];
    expect(matches.length).toBeLessThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════
// Assertion 5: TemplateContractError is kept and importable
// ═══════════════════════════════════════════════════════════

describe('pattern: TemplateContractError contract', () => {
  it('TemplateContractError is exported from types/handlers.ts', () => {
    const content = readFile(join(SRC_ROOT, 'types/handlers.ts'));
    expect(content).toContain('export class TemplateContractError');
  });

  it('handlers that consume cascade variables import TemplateContractError from types/handlers', () => {
    const commandsDir = join(SRC_ROOT, 'helpers/slack/commands');
    const files = findTsFiles(commandsDir);
    const violations: string[] = [];

    for (const file of files) {
      const content = readFile(file);
      const rel = relative(SRC_ROOT, file);

      // If a handler reads upstream variables with required: true
      if (content.includes('required: true') && content.includes('readUpstreamVariables')) {
        // It must have a real (non-commented) import of TemplateContractError from types/handlers
        const codeLines = content.split('\n').filter(l => !l.trimStart().startsWith('//'));
        const codeOnly = codeLines.join('\n');
        const hasImport = codeOnly.includes('TemplateContractError') &&
          codeOnly.includes('types/handlers');
        if (!hasImport) {
          violations.push(`${rel}: reads required cascade variables but doesn't import TemplateContractError from types/handlers`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
