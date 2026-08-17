/**
 * PH-4: External Side-Effect Idempotency Tests (ADR 0036)
 *
 * Structural tests proving:
 * - DB uniqueness constraint exists on semantic key
 * - CreatedIssue model has required fields
 * - ticketHandler uses idempotent pattern
 * - dead createGitHubIssues removed
 * - GitHub artifact writes unaffected
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ═══════════════════════════════════════════════════════════════════════
// CREATED ISSUE MODEL SCHEMA
// ═══════════════════════════════════════════════════════════════════════

describe('PH-4: CreatedIssue model schema', () => {
  const modelSource = readFileSync(
    join(__dirname, '../../database/models/created_issue.ts'),
    'utf-8',
  );

  it('has public_id field', () => {
    expect(modelSource).toContain('declare public_id');
    expect(modelSource).toContain('DataTypes.UUID');
  });

  it('has status field with lifecycle values', () => {
    expect(modelSource).toContain('declare status');
    expect(modelSource).toContain("defaultValue: 'created'");
  });

  it('has updated_at field', () => {
    expect(modelSource).toContain('declare updated_at');
  });

  it('github_issue_number is nullable (for pending state)', () => {
    expect(modelSource).toContain("allowNull: true,\n      },\n      github_url");
  });

  it('documents ticket_id as transitional', () => {
    expect(modelSource).toContain('Transitional');
    expect(modelSource).toContain('canonical recommendation ID');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MIGRATION
// ═══════════════════════════════════════════════════════════════════════

describe('PH-4: Migration adds uniqueness constraint', () => {
  const migrationSource = readFileSync(
    join(__dirname, '../../database/migrations/20260817000000-created-issues-idempotency.js'),
    'utf-8',
  );

  it('adds unique index on semantic key (study_id, audience, ticket_id)', () => {
    expect(migrationSource).toContain('idx_created_issues_semantic_key');
    expect(migrationSource).toContain("unique: true");
    expect(migrationSource).toContain("'study_id', 'audience', 'ticket_id'");
  });

  it('adds unique index on public_id', () => {
    expect(migrationSource).toContain('idx_created_issues_public_id');
  });

  it('audits for duplicates before applying constraint', () => {
    expect(migrationSource).toContain('HAVING COUNT(*) > 1');
    expect(migrationSource).toContain('Remove duplicates');
  });

  it('adds public_id column', () => {
    expect(migrationSource).toContain("'public_id'");
    expect(migrationSource).toContain('UUID');
  });

  it('adds status column', () => {
    expect(migrationSource).toContain("'status'");
    expect(migrationSource).toContain('pending | created | failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TICKET HANDLER IDEMPOTENT PATTERN
// ═══════════════════════════════════════════════════════════════════════

describe('PH-4: ticketHandler uses idempotent creation', () => {
  const handlerSource = readFileSync(
    join(__dirname, '../../helpers/slack/commands/ticketHandler.ts'),
    'utf-8',
  );

  it('checks existing mapping before GitHub call', () => {
    const findOneIdx = handlerSource.indexOf('CreatedIssue.findOne');
    const issuesCreateIdx = handlerSource.indexOf('octokit.rest.issues.create');
    expect(findOneIdx).toBeGreaterThan(-1);
    expect(issuesCreateIdx).toBeGreaterThan(-1);
    expect(findOneIdx).toBeLessThan(issuesCreateIdx);
  });

  it('resolves existing created issue without duplicating', () => {
    expect(handlerSource).toContain('idempotent resolve');
    expect(handlerSource).toContain("em.status === 'created'");
  });

  it('reserves pending mapping before GitHub call', () => {
    expect(handlerSource).toContain("status: 'pending'");
  });

  it('updates mapping to created after GitHub success', () => {
    expect(handlerSource).toContain("status: 'created'");
    expect(handlerSource).toContain('CreatedIssue.update');
  });

  it('handles concurrent unique constraint violation', () => {
    expect(handlerSource).toContain("dbMessage.includes('unique')");
    expect(handlerSource).toContain("dbMessage.includes('duplicate')");
  });

  it('appends qori-action-id marker to issue body', () => {
    expect(handlerSource).toContain('qori-action-id');
    expect(handlerSource).toContain('actionPublicId');
  });

  it('does NOT use title-based deduplication', () => {
    // No title matching for dedup — only semantic key
    expect(handlerSource).not.toContain('findOne({ where: { title');
    expect(handlerSource).not.toContain("title: ticket.title }");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// DEAD CODE REMOVED
// ═══════════════════════════════════════════════════════════════════════

describe('PH-4: Dead createGitHubIssues removed', () => {
  const githubSource = readFileSync(
    join(__dirname, '../../helpers/github.ts'),
    'utf-8',
  );

  it('createGitHubIssues function does not exist in active code', () => {
    const activeLines = githubSource
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && trimmed.includes('export async function createGitHubIssues');
      });
    expect(activeLines).toHaveLength(0);
  });

  it('no other file imports createGitHubIssues', () => {
    // Verify no import of the removed function exists
    const srcDir = join(__dirname, '../../');
    const fs = require('fs');
    const path = require('path');
    function findImports(dir: string): string[] {
      const results: string[] = [];
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          results.push(...findImports(full));
        } else if (entry.endsWith('.ts')) {
          const content = fs.readFileSync(full, 'utf-8');
          if (content.includes('createGitHubIssues') && !full.includes('github.ts')) {
            results.push(full);
          }
        }
      }
      return results;
    }
    const importers = findImports(srcDir);
    expect(importers).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GITHUB ARTIFACT WRITES UNAFFECTED
// ═══════════════════════════════════════════════════════════════════════

describe('PH-4: GitHub artifact writes unaffected', () => {
  it('createOrUpdateFileOnGitHub still exists in github.ts', () => {
    const githubSource = readFileSync(
      join(__dirname, '../../helpers/github.ts'),
      'utf-8',
    );
    expect(githubSource).toContain('export async function createOrUpdateFileOnGitHub');
  });

  it('yamlProcessor still uses createOrUpdateFileOnGitHub', () => {
    const yamlSource = readFileSync(
      join(__dirname, '../../helpers/yamlProcessor.ts'),
      'utf-8',
    );
    expect(yamlSource).toContain('createOrUpdateFileOnGitHub');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ADR EXISTS
// ═══════════════════════════════════════════════════════════════════════

describe('PH-4: ADR 0036 exists', () => {
  it('ADR 0036 external side-effect idempotency document exists', () => {
    const adr = readFileSync(
      join(__dirname, '../../../../docs/architecture-decisions/0036-external-side-effect-idempotency.md'),
      'utf-8',
    );
    expect(adr).toContain('External Side-Effect Idempotency');
    expect(adr).toContain('stable semantic identity');
    expect(adr).toContain('qori-action-id');
    expect(adr).toContain('Rendered prose is never an idempotency key');
  });
});
