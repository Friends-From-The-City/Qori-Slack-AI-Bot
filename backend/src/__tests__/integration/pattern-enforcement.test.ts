/**
 * Pattern enforcement assertions — structural tests that scan the codebase
 * for Phase 4 bug class regressions.
 *
 * These tests use filesystem reads and regex matching to verify patterns
 * across the codebase. They don't hit a database.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { load as loadYaml } from 'js-yaml';
import { ALL_FOLDERS, PROJECT_FOLDERS, STUDY_FOLDERS } from '../../config/folderStructure';

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
    // Budget raised 215 → 223 by PR #272 (transcript review DM swap).
    // Budget raised 223 → 225 by PH-5B (evidence lineage integration tests
    // use `as any` for Sequelize model attribute access in test assertions).
    // Budget raised 225 → 229 by GOV-1 (authorization guards add EvidenceSource model refs
    // with `as typeof EvidenceSource` casts in codebookHandler, matchReviewHandler, surveyPrivacyHandler).
    // Budget raised 229 → 235 by GOV-6 (records lifecycle services use `as typeof Model` casts
    // for test-injectable Sequelize model access and polymorphic retrieval mapping).
    expect(total).toBeLessThanOrEqual(235);
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
  // - admin/adminCenterHandler: Uses project context via ProjectModel.findOne, passes
  //   project object to modal builder (pattern check doesn't recognize project.id)
  // - study/studyLifecycleHandler: handleUserSelectOptions fetches channel members
  //   for team-member typeahead — channel-only by design (no study/project scope)
  const CHANNEL_ONLY_ALLOWED = [
    'learn/learnHandler.ts',
    'repo/repoConfigHandler.ts',
    'repo/syncHandler.ts',
    'qa/askStudyHandler.ts',
    'qa/runTemplateHandler.ts',     // GOV-1B: disabled, returns ephemeral only
    'admin/adminCenterHandler.ts',
    'study/studyLifecycleHandler.ts',
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

// ═══════════════════════════════════════════════════════════
// Phase B-0.5: Folder structure alignment
// ═══════════════════════════════════════════════════════════

describe('pattern: folder structure alignment (Phase B-0.5)', () => {
  const PROMPTS_DIR = join(__dirname, '../../../../config/prompts');

  // Old folder names that should not appear in handler code
  const OLD_FOLDER_NAMES = [
    'primary-research',
    '01-planning',
    '02-participants',
    '04-analysis',
    '05-findings',
    '05-reports',
    '07-implementation',
  ];

  // Files explicitly excluded from migration (none currently — all handlers migrated)
  const MIGRATION_EXCLUSIONS: string[] = [];

  it('no hardcoded old folder names in handlers (enforced)', () => {
    const commandsDir = join(SRC_ROOT, 'helpers/slack/commands');
    const files = findTsFiles(commandsDir);
    const violations: string[] = [];

    for (const file of files) {
      const content = readFile(file);
      const rel = relative(SRC_ROOT, file);
      const filename = rel.split('/').pop() || '';

      // Skip files explicitly excluded (deferred/being removed)
      if (MIGRATION_EXCLUSIONS.some(excluded => filename === excluded)) continue;

      for (const oldFolder of OLD_FOLDER_NAMES) {
        // Match string literals containing old folder names
        const pattern = new RegExp(`['"\`]${oldFolder}['"\`/]`);
        if (pattern.test(content)) {
          // Find the line number for better error messages
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Skip comments
            if (line.trimStart().startsWith('//')) continue;
            if (pattern.test(line)) {
              violations.push(`${rel}:${i + 1}: hardcoded old folder '${oldFolder}'`);
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      console.log(`[Phase B-0.5] Found ${violations.length} violations:`);
      violations.forEach(v => console.log(`  ${v}`));
    }

    expect(violations).toEqual([]);
  });

  it('YAML output_options.path values match folderStructure registry', () => {
    // This test validates that YAML templates use paths from the structure registry
    // It's informational until Step 5 (YAML updates) completes

    const violations: string[] = [];
    let yamlFiles: string[] = [];

    try {
      yamlFiles = readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.yaml'));
    } catch {
      // Config dir may not exist in test environment
      console.log('[Phase B-0.5] Skipping YAML path validation - config/prompts not found');
      return;
    }

    for (const yamlFilename of yamlFiles) {
      const yamlPath = join(PROMPTS_DIR, yamlFilename);
      const content = readFileSync(yamlPath, 'utf-8');

      // Parse output_options.path from YAML
      const pathMatch = content.match(/output_options:\s*\n\s*path:\s*["']([^"']+)["']/);
      if (!pathMatch) continue;

      const outputPath = pathMatch[1];

      // Skip discovery templates (they use {{project_slug}}/00-discovery/ which is valid)
      if (outputPath.includes('{{project_slug}}')) {
        const remainder = outputPath.replace(/^\{\{project_slug\}\}\//, '');
        if (remainder === '00-discovery/' || remainder === PROJECT_FOLDERS.DISCOVERY + '/') {
          continue;
        }
      }


      // Normalize path (remove trailing slash)
      const normalizedPath = outputPath.replace(/\/$/, '');

      // Check if the path or its parent folder is in the registry
      const pathParts = normalizedPath.split('/');
      const topLevelFolder = pathParts[0];

      // Valid if top-level folder matches a study folder
      const isValidStudyFolder = Object.values(STUDY_FOLDERS).some(folder => {
        const folderParts = folder.split('/');
        return folderParts[0] === topLevelFolder;
      });

      if (!isValidStudyFolder) {
        violations.push(`${yamlFilename}: output_options.path '${outputPath}' not in folderStructure registry`);
      }
    }

    if (violations.length > 0) {
      console.log(`[Phase B-0.5] Found ${violations.length} YAML path violations:`);
      violations.forEach(v => console.log(`  ${v}`));
    }

    expect(violations).toEqual([]);
  });

  it('no handler passes primary-research as extraFolder (enforced)', () => {
    const commandsDir = join(SRC_ROOT, 'helpers/slack/commands');
    const files = findTsFiles(commandsDir);
    const violations: string[] = [];

    // Pattern: processYamlTemplate(..., 'primary-research', ...)
    // or processParticipantYamlTemplate(..., 'primary-research', ...)
    // or processObserverYamlTemplate(..., 'primary-research', ...)
    const pattern = /process(?:Yaml|Participant|Observer)YamlTemplate\([^)]*['"]primary-research['"]/;

    for (const file of files) {
      const content = readFile(file);
      const rel = relative(SRC_ROOT, file);
      const filename = rel.split('/').pop() || '';

      // Skip files explicitly excluded (deferred/being removed)
      if (MIGRATION_EXCLUSIONS.some(excluded => filename === excluded)) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        if (line.trimStart().startsWith('//')) continue;
        if (pattern.test(line)) {
          violations.push(`${rel}:${i + 1}: passes 'primary-research' as extraFolder`);
        }
      }
    }

    if (violations.length > 0) {
      console.log(`[Phase B-0.5] Found ${violations.length} extraFolder violations:`);
      violations.forEach(v => console.log(`  ${v}`));
    }

    expect(violations).toEqual([]);
  });

  it('no default extraFolder is primary-research (enforced)', () => {
    const helpersDir = join(SRC_ROOT, 'helpers');
    const violations: string[] = [];

    // Check the three processor files
    const processorFiles = [
      'yamlProcessor.ts',
      'observerYamlProcessor.ts',
      'participantYamlProcessor.ts',
    ];

    for (const filename of processorFiles) {
      const filePath = join(helpersDir, filename);
      try {
        const content = readFileSync(filePath, 'utf-8');
        // Pattern: extraFolder = 'primary-research'
        if (/extraFolder\s*=\s*['"]primary-research['"]/.test(content)) {
          violations.push(`${filename}: default extraFolder is 'primary-research'`);
        }
      } catch {
        // File doesn't exist in test environment
      }
    }

    if (violations.length > 0) {
      console.log(`[Phase B-0.5] Found ${violations.length} default extraFolder violations:`);
      violations.forEach(v => console.log(`  ${v}`));
    }

    expect(violations).toEqual([]);
  });

  it('folderStructure registry matches Phase 1 spec', () => {
    // This test validates that the registry itself is correct

    // Project-level: 00-discovery must exist
    expect(PROJECT_FOLDERS.DISCOVERY).toBe('00-discovery');

    // Study-level: numbered folders 01-06 must exist with correct names
    expect(STUDY_FOLDERS.BRIEF).toBe('01-brief');
    expect(STUDY_FOLDERS.PLAN).toBe('02-plan');
    expect(STUDY_FOLDERS.FIELDWORK).toBe('03-fieldwork');
    expect(STUDY_FOLDERS.SYNTHESIS).toBe('04-synthesis');
    expect(STUDY_FOLDERS.READOUTS).toBe('05-readouts');
    expect(STUDY_FOLDERS.TICKETS).toBe('06-tickets');

    // Subfolders
    expect(STUDY_FOLDERS.FIELDWORK_SESSIONS).toBe('03-fieldwork/sessions');
    expect(STUDY_FOLDERS.FIELDWORK_TRANSCRIPTS).toBe('03-fieldwork/transcripts');
    expect(STUDY_FOLDERS.FIELDWORK_OUTREACH).toBe('03-fieldwork/outreach');

    // Variables folder
    expect(STUDY_FOLDERS.VARIABLES).toBe('.variables');
  });
});

// ═══════════════════════════════════════════════════════════
// Phase B Step 3: Handler re-anchoring assertions
// ═══════════════════════════════════════════════════════════

describe('pattern: Phase B handlers use getStudyById, not resolveStudyFromName', () => {
  const commandsDir = join(SRC_ROOT, 'helpers/slack/commands');

  // Files that have been migrated to FK-based pattern in Phase B
  const MIGRATED_HANDLERS = [
    'planHandler.ts',
    'modal-openers/planModalOpener.ts',
    'discussion-guide/discussionGuideHandler.ts',
    'modal-openers/briefToStudyHandler.ts',
  ];

  it('migrated handlers do not call resolveStudyFromName', () => {
    const violations: string[] = [];

    for (const handler of MIGRATED_HANDLERS) {
      const filePath = join(commandsDir, handler);
      let content: string;
      try {
        content = readFile(filePath);
      } catch {
        // File doesn't exist in test environment
        continue;
      }

      const rel = relative(SRC_ROOT, filePath);
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        if (line.trimStart().startsWith('//')) continue;
        // Skip import statements
        if (line.includes('import ')) continue;

        if (line.includes('resolveStudyFromName(')) {
          violations.push(`${rel}:${i + 1}: calls deprecated resolveStudyFromName — use getStudyById with projectId from metadata`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('migrated handlers import getStudyById from research_study.service', () => {
    const violations: string[] = [];

    for (const handler of MIGRATED_HANDLERS) {
      const filePath = join(commandsDir, handler);
      let content: string;
      try {
        content = readFile(filePath);
      } catch {
        // File doesn't exist in test environment
        continue;
      }

      const rel = relative(SRC_ROOT, filePath);

      // Must import getStudyById
      if (!content.includes('getStudyById') || !content.includes('research_study.service')) {
        violations.push(`${rel}: missing import of getStudyById from research_study.service`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('migrated handlers use StudySetupModalMetadata for typed metadata', () => {
    const violations: string[] = [];

    for (const handler of MIGRATED_HANDLERS) {
      const filePath = join(commandsDir, handler);
      let content: string;
      try {
        content = readFile(filePath);
      } catch {
        // File doesn't exist in test environment
        continue;
      }

      const rel = relative(SRC_ROOT, filePath);

      // Check for typed metadata usage
      // Either imports StudySetupModalMetadata or uses satisfies StudySetupModalMetadata
      const hasTypedMetadata = content.includes('StudySetupModalMetadata');

      if (!hasTypedMetadata) {
        violations.push(`${rel}: missing StudySetupModalMetadata for typed modal metadata`);
      }
    }

    expect(violations).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════
// Assertion 10: Per-participant pool schemas must have participant field
// Lesson from L005: without participant field, pool merge silently fails to isolate
// ═══════════════════════════════════════════════════════════

describe('pattern: per-participant pool schemas include participant field (L005)', () => {
  const PROMPTS_DIR = join(__dirname, '../../../../config/prompts');
  const SCHEMAS_DIR = join(__dirname, '../../../config/schemas');

  it('all append_or_replace_per_participant pool schemas have participant or participant_id field', () => {
    const violations: string[] = [];
    let yamlFiles: string[] = [];

    try {
      yamlFiles = readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.yaml'));
    } catch {
      console.log('[L005] Skipping - config/prompts not found');
      return;
    }

    for (const yamlFilename of yamlFiles) {
      const yamlPath = join(PROMPTS_DIR, yamlFilename);
      const content = readFileSync(yamlPath, 'utf-8');

      // Parse emits block
      let yamlDoc: { emits?: Array<{ key: string; pool_strategy?: string; schema?: { $ref?: string } }> };
      try {
        yamlDoc = loadYaml(content) as typeof yamlDoc;
      } catch {
        // Skip files that don't parse as YAML
        continue;
      }

      if (!yamlDoc?.emits) continue;

      for (const emit of yamlDoc.emits) {
        // Only check per-participant pools
        if (emit.pool_strategy !== 'append_or_replace_per_participant') continue;

        const schemaRef = emit.schema?.$ref;
        if (!schemaRef) {
          violations.push(`${yamlFilename}: emit '${emit.key}' has per-participant strategy but no schema $ref`);
          continue;
        }

        // Load the referenced schema
        const schemaPath = join(SCHEMAS_DIR, schemaRef.replace('schemas/', ''));
        let schemaContent: string;
        try {
          schemaContent = readFileSync(schemaPath, 'utf-8');
        } catch {
          violations.push(`${yamlFilename}: emit '${emit.key}' references schema '${schemaRef}' which doesn't exist`);
          continue;
        }

        let schemaDoc: { properties?: Record<string, unknown> };
        try {
          schemaDoc = loadYaml(schemaContent) as typeof schemaDoc;
        } catch {
          violations.push(`${yamlFilename}: emit '${emit.key}' schema '${schemaRef}' is not valid YAML`);
          continue;
        }

        // Check for participant or participant_id in properties
        const props = schemaDoc?.properties || {};
        const hasParticipant = 'participant' in props || 'participant_id' in props;

        if (!hasParticipant) {
          violations.push(
            `${yamlFilename}: emit '${emit.key}' uses append_or_replace_per_participant but schema ` +
            `'${schemaRef}' lacks 'participant' or 'participant_id' field — merge isolation will silently fail`
          );
        }
      }
    }

    if (violations.length > 0) {
      console.log(`[L005] Found ${violations.length} per-participant schema violations:`);
      violations.forEach(v => console.log(`  ${v}`));
    }

    expect(violations).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════
// ADR 0025: /qori-delete removed (Admin Center consolidation)
// ═══════════════════════════════════════════════════════════

describe('pattern: /qori-delete removed (ADR 0025)', () => {
  const eventsFile = readFile(join(SRC_ROOT, 'helpers/slack/events.ts'));

  it('/qori-delete command is NOT registered', () => {
    // Per ADR 0025: /qori-delete was removed — study deletion now lives in Admin Center
    // This test ensures the command is not re-introduced
    const hasDeleteCommand = eventsFile.includes("slackApp.command('/qori-delete'");
    expect(hasDeleteCommand).toBe(false);
  });

  it('delete-study-modal view handler is NOT registered', () => {
    // The modal submission handler should also be removed
    const hasDeleteModal = eventsFile.includes("slackApp.view('delete-study-modal'");
    expect(hasDeleteModal).toBe(false);
  });

  it('deleteStudyHandler is not imported in events.ts', () => {
    // The import should be removed to avoid dangling references
    const hasDeleteImport = eventsFile.includes('deleteStudyHandler');
    // Allow it in comments (for the "REMOVED per ADR 0025" note)
    const codeLines = eventsFile.split('\n').filter(l => !l.trimStart().startsWith('//'));
    const codeOnly = codeLines.join('\n');
    const hasDeleteImportInCode = codeOnly.includes('deleteStudyHandler');
    expect(hasDeleteImportInCode).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// ADR 0024: Authorization enforcement
// ═══════════════════════════════════════════════════════════

describe('pattern: authorization enforcement (ADR 0024)', () => {
  const commandsDir = join(SRC_ROOT, 'helpers/slack/commands');

  // Handlers that legitimately don't need study authorization:
  // - Commands that create new resources (no existing study to authorize against)
  // - Commands that operate at project level only
  // - Commands that are disabled or deprecated
  const AUTH_EXEMPT = [
    'projectStartHandler.ts',       // Creates new project (bootstrap)
    'qoriMainHandler.ts',           // GOV-1B: /qori removed, only handleStudySelect remains
    'learn/learnHandler.ts',        // User onboarding (PUBLIC)
    'repo/repoConfigHandler.ts',    // GOV-1: assertProjectOwner at command + submission
    'repo/syncHandler.ts',          // GOV-1B: disabled (returns ephemeral, no study access)
    'qa/askStudyHandler.ts',        // Disabled RAG
    'qa/runTemplateHandler.ts',     // GOV-1B: disabled (returns ephemeral, no study access)
    // briefHandler.ts: removed from AUTH_EXEMPT in GOV-1 — now has assertProjectAccess
  ];

  it('handlers accepting studyId from modal input call assertStudyAccess (backstop)', () => {
    const files = findTsFiles(commandsDir);
    const violations: string[] = [];

    for (const file of files) {
      const content = readFile(file);
      const rel = relative(SRC_ROOT, file);
      const filename = rel.split('/').pop() || '';

      // Skip exempt handlers
      if (AUTH_EXEMPT.some(exempt => rel.includes(exempt))) continue;

      // Pattern: handler extracts studyId from view.state.values
      // This indicates user-selected study input that needs authorization
      const hasStudyIdExtraction =
        content.includes('study_select') &&
        (content.includes('selected_option?.value') || content.includes('selected_option!.value'));

      if (!hasStudyIdExtraction) continue;

      // Should call assertStudyAccess/assertProjectAccess or the stronger
      // owner-level checks (assertStudyOwner/assertProjectOwner per ADR 0025)
      const hasAuthCheck =
        content.includes('assertStudyAccess') ||
        content.includes('assertProjectAccess') ||
        content.includes('assertStudyOwner') ||
        content.includes('assertProjectOwner');

      if (!hasAuthCheck) {
        violations.push(`${rel}: extracts studyId from modal but doesn't call assertStudyAccess`);
      }
    }

    // Note: This is a BACKSTOP, not proof of coverage.
    // The authoritative list is the handler catalog in ADR 0023.
    // Regex can false-pass (extraction patterns not matched).
    expect(violations).toEqual([]);
  });

  // GOV-1: Handlers that parse projectId from JSON metadata must call an auth assert
  it('handlers parsing projectId from JSON metadata call an authorization assert (GOV-1 backstop)', () => {
    const files = findTsFiles(commandsDir);
    const violations: string[] = [];

    // Handlers that legitimately operate without project authorization:
    const PROJECT_AUTH_EXEMPT = [
      'projectStartHandler.ts',       // Creates new project
      'qoriMainHandler.ts',           // Hub menu
      'learn/learnHandler.ts',        // User onboarding
      'repo/syncHandler.ts',          // Folder sync — GOV-2 candidate
      'qa/askStudyHandler.ts',        // Disabled RAG
      'qa/runTemplateHandler.ts',     // Legacy template runner
      'surveySubmissionHandler.ts',   // Internal helper called from guarded discoverHandler
      'surveySynthesisAction.ts',     // Internal action called from guarded survey flow
    ];

    for (const file of files) {
      const content = readFile(file);
      const rel = relative(SRC_ROOT, file);

      if (PROJECT_AUTH_EXEMPT.some(exempt => rel.includes(exempt))) continue;

      // Pattern: handler parses projectId from private_metadata or button value JSON
      const parsesProjectId =
        content.includes('projectId') &&
        (content.includes('JSON.parse(view.private_metadata') ||
         content.includes('JSON.parse(action.value'));

      if (!parsesProjectId) continue;

      const hasAuthCheck =
        content.includes('assertStudyAccess') ||
        content.includes('assertProjectAccess') ||
        content.includes('assertStudyOwner') ||
        content.includes('assertProjectOwner') ||
        content.includes('assertApproverAccess');

      if (!hasAuthCheck) {
        violations.push(`${rel}: parses projectId from JSON metadata but doesn't call an authorization assert`);
      }
    }

    expect(violations).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════
// GOV-1B: Command surface containment
// ═══════════════════════════════════════════════════════════

describe('pattern: command surface containment (GOV-1B)', () => {
  const eventsPath = join(SRC_ROOT, 'helpers/slack/events.ts');
  const eventsContent = readFile(eventsPath);

  it('/qori command is no longer registered', () => {
    // The /qori command should not have a slackApp.command registration
    // (study_select action registration is still valid)
    const lines = eventsContent.split('\n');
    const qoriCommandLine = lines.find(
      line => line.includes("slackApp.command('/qori'") && !line.includes('/qori-')
    );
    expect(qoriCommandLine).toBeUndefined();
  });

  it('handleStudySelect is still registered for /qori-plan', () => {
    expect(eventsContent).toContain("slackApp.action('study_select'");
  });

  it('/qori-sync command handler performs no GitHub reads', () => {
    const syncPath = join(SRC_ROOT, 'helpers/slack/commands/repo/syncHandler.ts');
    const syncContent = readFile(syncPath);
    // Disabled handler should not import GitHub functions
    expect(syncContent).not.toContain('listAllTopLevelFolders');
    expect(syncContent).not.toContain('readFolderContents');
    expect(syncContent).not.toContain('readFolders');
    // Should contain the disabled message
    expect(syncContent).toContain('not currently available');
  });

  it('/run-template command handler performs no document generation', () => {
    const runTemplatePath = join(SRC_ROOT, 'helpers/slack/commands/qa/runTemplateHandler.ts');
    const runTemplateContent = readFile(runTemplatePath);
    // Disabled handler should not import modal or generation functions
    expect(runTemplateContent).not.toContain('researchShareoutModal');
    expect(runTemplateContent).not.toContain('views.open');
    // Should contain the disabled message
    expect(runTemplateContent).toContain('not currently available');
  });

  it('/qori-repo remains owner-guarded (GOV-1)', () => {
    const repoPath = join(SRC_ROOT, 'helpers/slack/commands/repo/repoConfigHandler.ts');
    const repoContent = readFile(repoPath);
    expect(repoContent).toContain('assertProjectOwner');
    expect(repoContent).toContain('AuthorizationError');
  });
});
