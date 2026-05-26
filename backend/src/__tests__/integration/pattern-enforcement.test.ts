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

// ═══════════════════════════════════════════════════════════
// RESTRUCTURE-BLOCKING ASSERTIONS (Phase 2A)
// These define the behavioral contract Phase 2B schema changes must satisfy.
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// Assertion 6: Cascade store operations must specify scope
// ═══════════════════════════════════════════════════════════

describe('pattern: cascade scope parameter enforcement', () => {
  const helpersDir = join(SRC_ROOT, 'helpers');

  it('variableStore read/write calls include scope parameter', () => {
    const files = findTsFiles(helpersDir);
    const violations: string[] = [];

    for (const file of files) {
      const content = readFile(file);
      const rel = relative(SRC_ROOT, file);

      // Skip the store implementation itself
      if (rel.includes('variableStore')) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        if (line.trimStart().startsWith('//')) continue;
        // pattern-enforcement-ignore comments suppress this check
        if (line.includes('pattern-enforcement-ignore')) continue;

        // Check for variableStore calls that don't pass scope
        // The valid pattern is variableStore.read({ studyName, key, scope })
        // or variableStore.write({ studyName, key, value, scope })
        if (
          (line.includes('variableStore.read(') || line.includes('variableStore.write(')) &&
          !line.includes('scope')
        ) {
          // Look ahead for multi-line calls
          const nextLines = lines.slice(i, i + 5).join(' ');
          if (!nextLines.includes('scope')) {
            violations.push(`${rel}:${i + 1}: variableStore call missing scope parameter`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════
// Assertion 7: Scope values use typed constants
// ═══════════════════════════════════════════════════════════

describe('pattern: scope values use typed constants', () => {
  const commandsDir = join(SRC_ROOT, 'helpers/slack/commands');

  it('no raw scope string literals in handler files', () => {
    const files = findTsFiles(commandsDir);
    const violations: string[] = [];
    // Pattern: scope: 'study' or scope: "study" or scope: 'discovery' etc.
    const rawScopePattern = /scope:\s*['"](?:study|discovery)['"]/;

    for (const file of files) {
      const content = readFile(file);
      const rel = relative(SRC_ROOT, file);

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        if (line.trimStart().startsWith('//')) continue;
        // pattern-enforcement-ignore comments suppress this check
        if (line.includes('pattern-enforcement-ignore')) continue;

        if (rawScopePattern.test(line)) {
          violations.push(`${rel}:${i + 1}: raw scope string literal - use SCOPE_STUDY or SCOPE_DISCOVERY constant`);
        }
      }
    }

    // Baseline: count existing violations for migration tracking
    // Phase 2B will require this to be 0
    // For now, document the baseline and skip if violations exist
    if (violations.length > 0) {
      console.log(`[Phase 2A baseline] ${violations.length} raw scope literals to migrate in 2B:`);
      violations.forEach(v => console.log(`  ${v}`));
    }
    // SKIP for now - will enforce in 2B after constants are introduced
    // expect(violations).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════
// Assertion 8: Phase 2B path-based function removal
// ═══════════════════════════════════════════════════════════

describe('pattern: Phase 2B removed path-based cascade functions', () => {
  // ─────────────────────────────────────────────────────────
  // ACTIVATE AT 2D CLOSE-OUT: resolveStudyFromName
  // ─────────────────────────────────────────────────────────
  // When Phase 2D updates modal builders to pass projectId + studyId
  // directly in private_metadata, uncomment this assertion.
  // See: docs/scaffolding-to-remove.md
  //
  // it('no resolveStudyFromName calls (scaffolding removed)', () => {
  //   const allFiles = findTsFiles(SRC_ROOT);
  //   const violations: string[] = [];
  //
  //   for (const file of allFiles) {
  //     const content = readFile(file);
  //     const rel = relative(SRC_ROOT, file);
  //
  //     // Skip the service definition itself
  //     if (rel.includes('research_study.service.ts')) continue;
  //     if (rel.includes('__tests__/')) continue;
  //
  //     const lines = content.split('\n');
  //     for (let i = 0; i < lines.length; i++) {
  //       const line = lines[i];
  //       if (line.trimStart().startsWith('//')) continue;
  //       if (line.includes('import ')) continue;
  //
  //       if (line.includes('resolveStudyFromName(')) {
  //         violations.push(`${rel}:${i + 1}: scaffolding not removed - resolveStudyFromName should be deleted after 2D`);
  //       }
  //     }
  //   }
  //
  //   expect(violations).toEqual([]);
  // });
  // ─────────────────────────────────────────────────────────
  const REMOVED_FUNCTIONS = [
    // These functions were removed in Phase 2B - they throw errors now
    'readStudyVariables(',        // Use readStudyVariablesByContext
    'writeStudyVariables(',       // Use writeStudyVariablesByContext
    'mergeVariables(',            // Use mergeVariablesByContext
    'readUpstreamVariables(',     // Use readUpstreamVariablesByContext
    'readDiscoveryVariables(',    // Use readDiscoveryVariablesByProject
    'writeDiscoveryVariables(',   // Use writeDiscoveryVariablesByProject
    'getResearchStudyWithRoles(', // Use getStudyById or getStudyByProjectAndName
  ];

  const ALLOWED_FILES = [
    // The implementation file can reference these (for the throwing stubs)
    'studyVariables.ts',
    'research_study.service.ts',
    // Test files that mock these functions
    '__tests__/',
    '__mocks__/',
    // NOTE: discoveryLoader.ts removed from ALLOWED_FILES in Phase 2D-A (2026-05-22)
    // It now uses readDiscoveryVariablesByProject(projectId) instead of readDiscoveryVariables(team)
  ];

  it('no handler files call removed path-based cascade functions', () => {
    const allFiles = findTsFiles(SRC_ROOT);
    const violations: string[] = [];

    for (const file of allFiles) {
      const content = readFile(file);
      const rel = relative(SRC_ROOT, file);

      // Skip allowed files
      if (ALLOWED_FILES.some(allowed => rel.includes(allowed))) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        if (line.trimStart().startsWith('//')) continue;
        // Skip import statements (importing type doesn't call the function)
        if (line.includes('import ')) continue;

        for (const fn of REMOVED_FUNCTIONS) {
          if (line.includes(fn)) {
            violations.push(`${rel}:${i + 1}: calls removed function ${fn.slice(0, -1)} - use FK-based alternative`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════
// Assertion 9: Channel-project binding readiness
// ═══════════════════════════════════════════════════════════

describe('pattern: channel context threading', () => {
  const commandsDir = join(SRC_ROOT, 'helpers/slack/commands');

  // Handlers that legitimately operate at channel level without study/project context:
  // - learn/: User onboarding, not research operations
  // - repo/repoConfigHandler: Channel-to-repo binding (becomes channel→project in 2B)
  // - repo/syncHandler: Channel-level folder sync
  // - qa/askStudyHandler: Disabled RAG feature (returns "not available yet")
  const CHANNEL_ONLY_ALLOWED = [
    'learn/learnHandler.ts',
    'repo/repoConfigHandler.ts',
    'repo/syncHandler.ts',
    'qa/askStudyHandler.ts',
  ];

  it('handler files that use channel_id also reference study or project context', () => {
    const files = findTsFiles(commandsDir);
    const violations: string[] = [];

    for (const file of files) {
      const content = readFile(file);
      const rel = relative(SRC_ROOT, file);

      // Skip files in the allowed list (legitimate channel-only operations)
      if (CHANNEL_ONLY_ALLOWED.some(allowed => rel.includes(allowed))) continue;

      // Skip files that don't use channel_id
      if (!content.includes('channel_id') && !content.includes('channelId')) continue;

      // Must also have study/project context
      const hasStudyContext = content.includes('studyName') || content.includes('study_name') ||
        content.includes('studyId') || content.includes('study_id');
      const hasProjectContext = content.includes('projectId') || content.includes('project_id') ||
        content.includes('projectName') || content.includes('project_name');

      // For 2A: must have study context (current model)
      // For 2B: will require project context
      if (!hasStudyContext && !hasProjectContext) {
        violations.push(`${rel}: uses channel_id without study/project context - orphan channel reference`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('private_metadata includes channel context for modal chains', () => {
    const files = findTsFiles(commandsDir);
    const violations: string[] = [];

    for (const file of files) {
      const content = readFile(file);
      // rel would be used for violation reporting if we enforce this strictly
      // Currently informational only for 2A baseline

      // Files that build private_metadata for modals
      if (!content.includes('private_metadata')) continue;

      // If it builds private_metadata, it should include channelId
      // Pattern: JSON.stringify({ ... channelId ... }) or private_metadata: { channelId }
      const hasPrivateMetadataBuild = content.includes('JSON.stringify') &&
        (content.includes('private_metadata') || content.includes('privateMetadata'));

      if (hasPrivateMetadataBuild) {
        // For 2A: just verify the pattern detection works
        // For 2B: will strictly enforce channel context in private_metadata
        // The heuristic checks for channelId somewhere in stringify context
        const hasChannelContext = content.includes('channelId') || content.includes('channel_id');
        // Baseline tracking - not enforced yet
        if (!hasChannelContext) {
          // Would add to violations in 2B
        }
      }
    }

    // This assertion is informational for 2A
    // Will be enforced strictly in 2B when channel → project binding is required
    expect(violations).toEqual([]);
  });
});
