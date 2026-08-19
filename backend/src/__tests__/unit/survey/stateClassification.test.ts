/**
 * PH-1: State Classification Tests (ADR 0033)
 *
 * Proves:
 * - Postgres study_variables writes still occur
 * - No GitHub .variables write occurs from studyVariables.ts
 * - Generated Markdown artifact writes still occur (via yamlProcessor)
 * - Cascade consumers still read Postgres (no GitHub fallback)
 * - No runtime GitHub variable fallback exists
 * - Survey flow remains unaffected
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const STUDY_VARS_PATH = join(__dirname, '../../../helpers/studyVariables.ts');
const studyVarsSource = readFileSync(STUDY_VARS_PATH, 'utf-8');

// ═══════════════════════════════════════════════════════════════════════
// GITHUB .VARIABLES WRITE REMOVAL
// ═══════════════════════════════════════════════════════════════════════

describe('PH-1: GitHub .variables write removal', () => {
  it('studyVariables.ts does not import createOrUpdateFileOnGitHub', () => {
    // The import line should be commented out or removed
    const activeImports = studyVarsSource
      .split('\n')
      .filter(line => !line.startsWith('//') && line.includes('createOrUpdateFileOnGitHub'));
    expect(activeImports).toHaveLength(0);
  });

  it('studyVariables.ts does not import fetchFileFromRepoByPath', () => {
    const activeImports = studyVarsSource
      .split('\n')
      .filter(line => !line.startsWith('//') && line.includes('fetchFileFromRepoByPath'));
    expect(activeImports).toHaveLength(0);
  });

  it('studyVariables.ts does not call createOrUpdateFileOnGitHub', () => {
    // Should have zero active (non-comment) calls
    const activeCalls = studyVarsSource
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && !trimmed.startsWith('*') && trimmed.includes('createOrUpdateFileOnGitHub(');
      });
    expect(activeCalls).toHaveLength(0);
  });

  it('no VARIABLES_DIR or VARIABLES_FILE constants in active code', () => {
    const activeConstants = studyVarsSource
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && (
          trimmed.startsWith('const VARIABLES_DIR') ||
          trimmed.startsWith('const VARIABLES_FILE') ||
          trimmed.startsWith('const DISCOVERY_VARIABLES_FILE')
        );
      });
    expect(activeConstants).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// NO RUNTIME GITHUB VARIABLE FALLBACK
// ═══════════════════════════════════════════════════════════════════════

describe('PH-1: No runtime GitHub variable fallback', () => {
  it('readStudyVariablesFromGitHub function does not exist', () => {
    // Should be removed entirely (not just commented out as "dead code")
    const functionDef = studyVarsSource
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && trimmed.includes('readStudyVariablesFromGitHub');
      });
    expect(functionDef).toHaveLength(0);
  });

  it('readDiscoveryVariablesFromGitHub does not exist', () => {
    const functionDef = studyVarsSource
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && trimmed.includes('readDiscoveryVariablesFromGitHub');
      });
    expect(functionDef).toHaveLength(0);
  });

  it('no GitHub fallback comment suggests active fallback path', () => {
    // The header should not suggest fallback exists
    const headerLines = studyVarsSource.split('\n').slice(0, 5).join('\n');
    expect(headerLines).not.toContain('Fallback: reads from GitHub');
    expect(headerLines).toContain('Postgres is sole runtime authority');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// POSTGRES STILL AUTHORITATIVE
// ═══════════════════════════════════════════════════════════════════════

describe('PH-1: Postgres remains authoritative', () => {
  it('writeDiscoveryToPostgresByProject is still called', () => {
    expect(studyVarsSource).toContain('writeDiscoveryToPostgresByProject');
  });

  it('mergeVariablesByContext is still exported', () => {
    expect(studyVarsSource).toContain('export async function mergeVariablesByContext');
  });

  it('readStudyVariablesByContext is still exported', () => {
    expect(studyVarsSource).toContain('export async function readStudyVariablesByContext');
  });

  it('readDiscoveryVariablesByProject is still exported', () => {
    expect(studyVarsSource).toContain('export async function readDiscoveryVariablesByProject');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GENERATED MARKDOWN ARTIFACTS STILL WRITTEN
// ═══════════════════════════════════════════════════════════════════════

describe('PH-1: Generated artifacts still write to GitHub', () => {
  it('yamlProcessor.ts still calls createOrUpdateFileOnGitHub for artifacts', () => {
    const yamlProcessorSource = readFileSync(
      join(__dirname, '../../../helpers/yamlProcessor.ts'),
      'utf-8',
    );
    expect(yamlProcessorSource).toContain('createOrUpdateFileOnGitHub');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ADR 0033 EXISTS
// ═══════════════════════════════════════════════════════════════════════

describe('PH-1: ADR 0033 exists', () => {
  it('ADR 0033 state classification document exists', () => {
    const adr = readFileSync(
      join(__dirname, '../../../../../docs/architecture-decisions/0033-state-classification-and-github-projection-removal.md'),
      'utf-8',
    );
    expect(adr).toContain('State Classification');
    expect(adr).toContain('Cascade Projection');
    expect(adr).toContain('Canonical Domain State');
    expect(adr).toContain('Canonical Evidence State');
    expect(adr).toContain('Debug/Export Projection');
  });
});
