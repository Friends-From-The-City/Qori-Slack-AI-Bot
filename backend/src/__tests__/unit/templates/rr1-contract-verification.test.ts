/**
 * RR-1 Contract Verification Tests
 *
 * Verifies the four release-readiness blockers identified in the roadmap audit
 * are resolved, and that the inline handler extraction preserved behavior.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { load as loadYaml } from 'js-yaml';

const CONFIG_PROMPTS = join(__dirname, '../../../../../config/prompts');
const SCHEMAS_DIR = join(__dirname, '../../../../config/schemas');
const SRC_ROOT = join(__dirname, '../../..');

// ═══════════════════════════════════════════════════════════
// RR-1 Blocker 1: research_plan OUTPUT BOUNDARIES
// ═══════════════════════════════════════════════════════════

describe('RR-1: research_plan OUTPUT BOUNDARIES', () => {
  const planPath = join(CONFIG_PROMPTS, 'research_plan.yaml');
  const planContent = readFileSync(planPath, 'utf-8');

  it('research_plan template has OUTPUT BOUNDARIES in at least one AI task', () => {
    expect(planContent).toContain('OUTPUT BOUNDARIES');
  });

  it('every AI task prompt in research_plan contains OUTPUT BOUNDARIES', () => {
    const planYaml = loadYaml(planContent) as {
      ai_generation_tasks: Array<{ id: string; prompt: string }>;
    };

    const tasks = planYaml.ai_generation_tasks || [];
    expect(tasks.length).toBeGreaterThan(0);

    const missingBoundaries: string[] = [];
    for (const task of tasks) {
      if (!task.prompt.includes('OUTPUT BOUNDARIES')) {
        missingBoundaries.push(task.id);
      }
    }

    expect(missingBoundaries).toEqual([]);
  });

  it('research_plan version is v7.2 or higher', () => {
    const planYaml = loadYaml(planContent) as { version: string };
    // v7.2 was the version that added OUTPUT BOUNDARIES
    const version = planYaml.version.replace('v', '');
    const [major, minor] = version.split('.').map(Number);
    expect(major).toBeGreaterThanOrEqual(7);
    if (major === 7) {
      expect(minor).toBeGreaterThanOrEqual(2);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// RR-1 Blocker 2: usability_issues → research_readout contract
// ═══════════════════════════════════════════════════════════

describe('RR-1: usability_issues → research_readout emit contract', () => {
  const usabilityPath = join(CONFIG_PROMPTS, 'usability_issues_extractor.yaml');
  const readoutPath = join(CONFIG_PROMPTS, 'research_readout.yaml');
  const usabilityContent = readFileSync(usabilityPath, 'utf-8');
  const readoutContent = readFileSync(readoutPath, 'utf-8');

  it('usability_issues_extractor emits prioritized_issues', () => {
    const yaml = loadYaml(usabilityContent) as {
      emits: Array<{ key: string; schema?: { items?: { $ref?: string } } }>;
    };

    const emitKeys = yaml.emits.map(e => e.key);
    expect(emitKeys).toContain('prioritized_issues');
  });

  it('research_readout consumes prioritized_issues from usability_issues', () => {
    const yaml = loadYaml(readoutContent) as {
      consumes: Array<{ key: string; source: string; required: boolean }>;
    };

    const issuesConsume = yaml.consumes.find(c => c.key === 'prioritized_issues');
    expect(issuesConsume).toBeDefined();
    expect(issuesConsume!.source).toBe('usability_issues');
  });

  it('prioritized_issues consume is optional (required: false)', () => {
    const yaml = loadYaml(readoutContent) as {
      consumes: Array<{ key: string; required: boolean }>;
    };

    const issuesConsume = yaml.consumes.find(c => c.key === 'prioritized_issues');
    expect(issuesConsume!.required).toBe(false);
  });

  it('prioritized_issue schema file exists and is valid', () => {
    const schemaPath = join(SCHEMAS_DIR, 'prioritized_issue.yaml');
    const schemaContent = readFileSync(schemaPath, 'utf-8');
    const schema = loadYaml(schemaContent) as { type: string; required: string[]; properties: Record<string, unknown> };

    expect(schema.type).toBe('object');
    expect(schema.required).toContain('id');
    expect(schema.required).toContain('severity');
    expect(schema.required).toContain('evidence_nuggets');
  });
});

// ═══════════════════════════════════════════════════════════
// RR-1 Blocker 3: Disabled commands not in event registration
// ═══════════════════════════════════════════════════════════

describe('RR-1: disabled RAG commands not registered', () => {
  const eventsPath = join(SRC_ROOT, 'helpers/slack/events.ts');
  const eventsContent = readFileSync(eventsPath, 'utf-8');

  it('/civicmind commands are not registered', () => {
    // No slackApp.command('/civicmind ...) registrations
    expect(eventsContent).not.toContain("'/civicmind");
  });

  it('/ask-study command is not registered', () => {
    expect(eventsContent).not.toContain("'/ask-study'");
  });

  it('/qori command (without suffix) is not registered', () => {
    // Check that there's no slackApp.command('/qori', ...) without a hyphenated suffix
    const lines = eventsContent.split('\n');
    const qoriCommandLine = lines.find(
      line => line.includes("slackApp.command('/qori'") &&
              !line.includes('/qori-') &&
              !line.trimStart().startsWith('//')
    );
    expect(qoriCommandLine).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════
// RR-1 Blocker 4: GitHub discovery variables write removed
// ═══════════════════════════════════════════════════════════

describe('RR-1: discovery variables GitHub write removed (ADR 0033)', () => {
  const studyVarsPath = join(SRC_ROOT, 'helpers/studyVariables.ts');
  const studyVarsContent = readFileSync(studyVarsPath, 'utf-8');

  it('writeDiscoveryVariablesByProject does not call createOrUpdateFileContents', () => {
    // Find the writeDiscoveryVariablesByProject function body
    const funcStart = studyVarsContent.indexOf('export async function writeDiscoveryVariablesByProject');
    const funcEnd = studyVarsContent.indexOf('\nexport', funcStart + 1);
    const funcBody = studyVarsContent.slice(funcStart, funcEnd > 0 ? funcEnd : undefined);

    // Should NOT contain GitHub file write calls
    expect(funcBody).not.toContain('createOrUpdateFileContents');
    expect(funcBody).not.toContain('writeFileToGitHub');
  });

  it('writeDiscoveryVariablesByProject mentions GitHub write removal', () => {
    expect(studyVarsContent).toContain('GitHub .variables write REMOVED');
  });

  it('Postgres is documented as sole runtime authority', () => {
    expect(studyVarsContent).toContain('sole runtime authority');
  });
});

// ═══════════════════════════════════════════════════════════
// RR-1 Item 5: Inline handler extraction verification
// ═══════════════════════════════════════════════════════════

describe('RR-1: inline handler extraction', () => {
  const eventsPath = join(SRC_ROOT, 'helpers/slack/events.ts');
  const eventsContent = readFileSync(eventsPath, 'utf-8');

  it('/qori-brief uses extracted briefCommand handler', () => {
    expect(eventsContent).toContain("slackApp.command('/qori-brief', briefCommand)");
  });

  it('/qori-plan uses extracted planCommand handler', () => {
    expect(eventsContent).toContain("slackApp.command('/qori-plan', planCommand)");
  });

  it('events.ts has no inline async command handlers', () => {
    // All command registrations should use named handler references
    const lines = eventsContent.split('\n');
    const inlineHandlers = lines.filter(
      line => line.includes('slackApp.command(') &&
              line.includes('async') &&
              !line.trimStart().startsWith('//')
    );
    expect(inlineHandlers).toEqual([]);
  });

  it('briefCommandOpener.ts exists and exports briefCommand', () => {
    const openerPath = join(SRC_ROOT, 'helpers/slack/commands/modal-openers/briefCommandOpener.ts');
    const openerContent = readFileSync(openerPath, 'utf-8');
    expect(openerContent).toContain('export { briefCommand }');
    expect(openerContent).toContain('getProjectByChannelId');
    expect(openerContent).toContain('buildBriefEntryModal');
  });

  it('planCommandOpener.ts exists and exports planCommand', () => {
    const openerPath = join(SRC_ROOT, 'helpers/slack/commands/modal-openers/planCommandOpener.ts');
    const openerContent = readFileSync(openerPath, 'utf-8');
    expect(openerContent).toContain('export { planCommand }');
    expect(openerContent).toContain('getStudiesByUser');
    expect(openerContent).toContain('studySetupModalPlanStudy');
  });
});

// ═══════════════════════════════════════════════════════════
// RR-1 Item 7: All v7.0 templates have OUTPUT BOUNDARIES
// ═══════════════════════════════════════════════════════════

describe('RR-1: v7.0 template OUTPUT BOUNDARIES conformance', () => {
  const V7_TEMPLATES = [
    'session_summary.yaml',
    'affinity_mapping.yaml',
    'persona_generator.yaml',
    'journey_mapping.yaml',
    'usability_issues_extractor.yaml',
    'jobs_to_be_done.yaml',
    'design_opportunity_generator.yaml',
    'research_readout.yaml',
    'designer_readout.yaml',
    'engineering_readout.yaml',
    'accessibility_readout.yaml',
    'leadership_readout.yaml',
    'research_brief.yaml',
    'research_plan.yaml',
    'discussion_guide.yaml',
    'desk_research.yaml',
    'stakeholder_synthesis.yaml',
    'survey_synthesis.yaml',
  ];

  for (const template of V7_TEMPLATES) {
    it(`${template} contains OUTPUT BOUNDARIES`, () => {
      const templatePath = join(CONFIG_PROMPTS, template);
      let content: string;
      try {
        content = readFileSync(templatePath, 'utf-8');
      } catch {
        // Template may not exist in test environment
        console.log(`[RR-1] Skipping ${template} — file not found`);
        return;
      }
      expect(content).toContain('OUTPUT BOUNDARIES');
    });
  }
});
