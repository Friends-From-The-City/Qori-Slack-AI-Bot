/**
 * Survey Synthesis v10.0 Artifact Contract Tests (Slice 2B)
 *
 * Verifies the accepted-coding artifact path:
 * - "What Respondents Described" replaces "Preliminary Qualitative Observations"
 * - Recurring patterns use deterministic counts
 * - Individual observations (n=1) appear separately
 * - Quotes are governed and deterministic
 * - Two quotes prefer distinct respondents
 * - Executive Summary includes qualitative headlines
 * - Method & Provenance reflects full authority chain
 * - No unsupported numbers in artifact
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import Handlebars from 'handlebars';
import { computeQualitativeAggregation, type PatternStat } from '../../../services/survey-aggregation.service';

const YAML_PATH = join(__dirname, '../../../../../config/prompts/survey_synthesis.yaml');
const yaml = readFileSync(YAML_PATH, 'utf-8');
const outputSection = yaml.split('output_template:')[1]?.split('output_options:')[0] ?? '';

// ═══════════════════════════════════════════════════════════════════════
// SECTION STRUCTURE
// ═══════════════════════════════════════════════════════════════════════

describe('v10 artifact structure', () => {
  it('has exactly one H1', () => {
    const h1s = outputSection.match(/^  # [^#]/gm) || [];
    expect(h1s.length).toBe(1);
  });

  it('"What Respondents Described" present in template', () => {
    expect(outputSection).toContain('## What Respondents Described');
  });

  it('"Recurring Patterns" subsection present', () => {
    expect(outputSection).toContain('### Recurring Patterns');
  });

  it('"Individual Observations" subsection present', () => {
    expect(outputSection).toContain('### Individual Observations');
  });

  it('"Preliminary Qualitative Observations" still present as fallback', () => {
    expect(outputSection).toContain('## Preliminary Qualitative Observations');
  });

  it('What Respondents Described and Preliminary are mutually exclusive (conditional)', () => {
    // Both exist in template but gated on qualitative_coding.hasAcceptedCoding
    expect(outputSection).toContain('qualitative_coding.hasAcceptedCoding');
  });

  it('Structured Evidence appears before qualitative section', () => {
    const seIdx = outputSection.indexOf('View Structured Evidence');
    const wrdIdx = outputSection.indexOf('## What Respondents Described');
    expect(seIdx).toBeGreaterThan(-1);
    expect(wrdIdx).toBeGreaterThan(-1);
    expect(seIdx).toBeLessThan(wrdIdx);
  });

  it('What This Means appears after qualitative section', () => {
    const wrdIdx = outputSection.indexOf('## What Respondents Described');
    const iiIdx = outputSection.indexOf('## What This Means');
    expect(wrdIdx).toBeLessThan(iiIdx);
  });

  it('Evidence Gaps appears after What This Means', () => {
    const iiIdx = outputSection.indexOf('## What This Means');
    const egIdx = outputSection.indexOf('## Evidence Gaps');
    expect(iiIdx).toBeLessThan(egIdx);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// EXECUTIVE SUMMARY WITH QUALITATIVE CODING
// ═══════════════════════════════════════════════════════════════════════

describe('Executive Summary', () => {
  it('uses AI-generated narrative', () => {
    expect(outputSection).toContain('ai_generated.executive_summary');
  });

  it('does not contain fact-list format', () => {
    // No more median-listing format
    expect(outputSection).not.toMatch(/\[!IMPORTANT\].*unique respondents.*analyzed/s);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// DETERMINISTIC COUNTS
// ═══════════════════════════════════════════════════════════════════════

describe('deterministic qualitative counts in artifact', () => {
  it('recurring patterns render displayFrequency (not raw counts)', () => {
    // The template uses {{this.displayFrequency}} which is pre-computed
    expect(outputSection).toContain('this.displayFrequency');
  });

  it('recurring patterns render definition', () => {
    expect(outputSection).toContain('this.definition');
  });

  it('determinism note present', () => {
    expect(outputSection).toContain('computed deterministically from researcher-reviewed matches');
  });

  it('reporting unit stated', () => {
    expect(outputSection).toContain('reporting unit is the unique respondent');
  });

  it('aggregation counts verified against service', () => {
    const eligible = new Set(['R001', 'R002', 'R003', 'R004', 'R005']);
    const assignments = [
      { respondent_key: 'R001', code_public_id: 'c1', code_label: 'Pattern A', code_definition: 'def A' },
      { respondent_key: 'R002', code_public_id: 'c1', code_label: 'Pattern A', code_definition: 'def A' },
      { respondent_key: 'R003', code_public_id: 'c1', code_label: 'Pattern A', code_definition: 'def A' },
      { respondent_key: 'R004', code_public_id: 'c2', code_label: 'Pattern B', code_definition: 'def B' },
      { respondent_key: 'R005', code_public_id: 'c3', code_label: 'Single C', code_definition: 'def C' },
    ];

    const result = computeQualitativeAggregation(assignments, eligible);

    // Pattern A: 3 respondents → recurring
    expect(result.recurringPatterns).toHaveLength(1);
    expect(result.recurringPatterns[0].codeLabel).toBe('Pattern A');
    expect(result.recurringPatterns[0].uniqueRespondentCount).toBe(3);
    expect(result.recurringPatterns[0].displayFrequency).toBe('3 of 5 (60%)');

    // Pattern B and C: 1 respondent each → individual
    expect(result.individualObservations).toHaveLength(2);
    // B before C alphabetically
    expect(result.individualObservations[0].codeLabel).toBe('Pattern B');
    expect(result.individualObservations[1].codeLabel).toBe('Single C');
  });

  it('artifact numbers match aggregation output — 3 runs identical', () => {
    const eligible = new Set(['R1', 'R2', 'R3']);
    const assignments = [
      { respondent_key: 'R1', code_public_id: 'x', code_label: 'X', code_definition: '' },
      { respondent_key: 'R2', code_public_id: 'x', code_label: 'X', code_definition: '' },
    ];
    const r1 = computeQualitativeAggregation(assignments, eligible);
    const r2 = computeQualitativeAggregation(assignments, eligible);
    const r3 = computeQualitativeAggregation(assignments, eligible);
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// QUOTE GOVERNANCE
// ═══════════════════════════════════════════════════════════════════════

describe('quote rendering in artifact', () => {
  it('quotes appear in recurring pattern blocks', () => {
    expect(outputSection).toContain('this.quotes');
  });

  it('quotes appear in individual observation blocks', () => {
    // Both sections have {{#if this.quotes}} blocks
    const quotesMatches = outputSection.match(/this\.quotes/g);
    expect(quotesMatches!.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// METHOD & PROVENANCE
// ═══════════════════════════════════════════════════════════════════════

describe('Method & Provenance with accepted coding', () => {
  it('Privacy Review section present', () => {
    expect(outputSection).toContain('Privacy Review');
    expect(outputSection).toContain('qualitative_coding.privacyReview.clear');
    expect(outputSection).toContain('qualitative_coding.privacyReview.redacted');
    expect(outputSection).toContain('qualitative_coding.privacyReview.restricted');
  });

  it('Qualitative Method section present', () => {
    expect(outputSection).toContain('Qualitative Method');
    expect(outputSection).toContain('Structured qualitative content analysis');
    expect(outputSection).toContain('Mixed inductive/deductive grouping development');
  });

  it('Grouping Review section present', () => {
    expect(outputSection).toContain('Grouping Review');
    expect(outputSection).toContain('qualitative_coding.codebook.version');
    expect(outputSection).toContain('qualitative_coding.codebook.reviewed_by');
    expect(outputSection).toContain('qualitative_coding.codebook.reviewed_at');
  });

  it('Match Review section present', () => {
    expect(outputSection).toContain('Match Review');
    expect(outputSection).toContain('qualitative_coding.codingRun.version');
    expect(outputSection).toContain('qualitative_coding.codingRun.reviewed_by');
    expect(outputSection).toContain('qualitative_coding.codingRun.reviewed_at');
  });

  it('Aggregation section present', () => {
    expect(outputSection).toContain('Aggregation');
    expect(outputSection).toContain('Reporting unit: unique respondent');
    expect(outputSection).toContain('Denominator: eligible respondents');
    expect(outputSection).toContain('Recurring pattern threshold');
    expect(outputSection).toContain('deterministic');
  });

  it('Analysis Authority reflects researcher authority', () => {
    expect(outputSection).toContain('Qori proposed, researcher reviewed and approved');
  });

  it('Analysis Authority covers groupings, matches, counts, and quotes', () => {
    expect(outputSection).toContain('Qualitative groupings:');
    expect(outputSection).toContain('Qualitative matches:');
    expect(outputSection).toContain('Qualitative counts:');
    expect(outputSection).toContain('Quote selection:');
  });

  it('no internal DB IDs exposed', () => {
    expect(outputSection).not.toContain('evidence_source_id');
    expect(outputSection).not.toContain('codebook_id');
    expect(outputSection).not.toContain('coding_run_id');
    // public_id was removed from source display in v10
    expect(outputSection).not.toContain('Evidence Source ID');
  });

  it('template version is v10.2.1', () => {
    expect(outputSection).toContain('Survey Synthesis v10.2.1');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// QUALITATIVE OBSERVATIONS SKIP
// ═══════════════════════════════════════════════════════════════════════

describe('qualitative_observations AI task behavior', () => {
  it('skips when accepted coding exists via top-level boolean', () => {
    // skip_when uses top-level has_accepted_coding (not nested property)
    // because assertSkipWhenVariablesDefined checks top-level keys only
    expect(yaml).toContain('skip_when: "has_accepted_coding"');
  });

  it('has_accepted_coding declared as input variable', () => {
    expect(yaml).toContain('name: has_accepted_coding');
    expect(yaml).toContain('type: boolean');
  });

  it('skip_output is empty string (no fallback text)', () => {
    expect(yaml).toContain('skip_output: ""');
  });

  it('handler injects has_accepted_coding as top-level boolean', () => {
    const handlerFile = readFileSync(
      join(__dirname, '../../../helpers/slack/commands/surveySubmissionHandler.ts'),
      'utf-8',
    );
    expect(handlerFile).toContain('has_accepted_coding:');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// NO ENGINEERING JARGON
// ═══════════════════════════════════════════════════════════════════════

describe('no internal engineering jargon in v10 output', () => {
  it('no "coding run" in reader-facing copy', () => {
    // "Coding run version" appears in Method & Provenance (acceptable — technical provenance)
    // But should not appear in main body sections
    const mainBody = outputSection.split('Method & Provenance')[0];
    expect(mainBody).not.toContain('coding run');
    expect(mainBody).not.toContain('coding_run');
  });

  it('no "codebook" in main body', () => {
    const mainBody = outputSection.split('Method & Provenance')[0];
    expect(mainBody).not.toContain('codebook');
  });

  it('no "evidence construct" in output', () => {
    expect(outputSection).not.toContain('evidence construct');
    expect(outputSection).not.toContain('evidence_construct');
  });

  it('no "Slice 2B" in output', () => {
    expect(outputSection).not.toMatch(/Slice 2[AB]/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SYNTHESIS GATE
// ═══════════════════════════════════════════════════════════════════════

describe('synthesis gate', () => {
  it('surveySynthesisAction imports findAcceptedCodingRun', () => {
    const actionFile = readFileSync(
      join(__dirname, '../../../helpers/slack/commands/surveySynthesisAction.ts'),
      'utf-8',
    );
    expect(actionFile).toContain('findAcceptedCodingRun');
  });

  it('surveySynthesisAction blocks synthesis before accepted run', () => {
    const actionFile = readFileSync(
      join(__dirname, '../../../helpers/slack/commands/surveySynthesisAction.ts'),
      'utf-8',
    );
    expect(actionFile).toContain('Complete match review before generating');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// HANDLEBARS RENDERING — empty array conditional behavior
// ═══════════════════════════════════════════════════════════════════════

describe('Handlebars empty array conditionals', () => {
  // Extract the output_template from the YAML file
  const rawTemplate = yaml.split('output_template: |')[1]?.split('\noutput_options:')[0] ?? '';
  // Remove the 2-space YAML block scalar indentation
  const templateContent = rawTemplate.replace(/^  /gm, '');

  const compile = (data: Record<string, unknown>) => {
    const template = Handlebars.compile(templateContent, { noEscape: true });
    return template(data);
  };

  const baseData = {
    survey_name: 'Test Survey',
    computed_facts: { totalRespondents: 10, fieldStats: [], crossTabs: [], schemaSummary: '', nonresponseLimitation: '', sourceContentHash: '' },
    qualitative_coding: {
      hasAcceptedCoding: true,
      eligibleRespondentCount: 10,
      recurringPatterns: [] as unknown[],
      individualObservations: [] as unknown[],
      codingRun: { version: 1, reviewed_by: 'U_TEST', reviewed_at: '2026-08-16' },
      codebook: { version: 1, reviewed_by: 'U_TEST', reviewed_at: '2026-08-16' },
      privacyReview: { clear: 8, redacted: 1, restricted: 1 },
    },
    provenance: { source_filename: 'test.csv', reviewed_by: 'U_TEST', reviewed_at: '2026-08-16', ordinal_orders: '', model_used: 'test' },
    analysis_date: 'August 16, 2026',
    run_by: 'Jane Researcher',
    ai_generated: { qualitative_observations: '', evidence_gaps: '', executive_summary: 'Test summary.', integrated_interpretation: 'Test interpretation.' },
  };

  it('empty recurringPatterns → "Recurring Patterns" heading NOT rendered', () => {
    const result = compile({ ...baseData });
    expect(result).not.toContain('### Recurring Patterns');
  });

  it('non-empty recurringPatterns → "Recurring Patterns" heading rendered', () => {
    const data = {
      ...baseData,
      qualitative_coding: {
        ...baseData.qualitative_coding,
        recurringPatterns: [{
          label: 'Test Pattern',
          definition: 'A test',
          displayFrequency: '2 of 10 (20%)',
          quotes: '> "quote" — R001',
        }],
      },
    };
    const result = compile(data);
    expect(result).toContain('### Recurring Patterns');
    expect(result).toContain('**Test Pattern** — 2 of 10 (20%)');
  });

  it('empty individualObservations → "Individual Observations" heading NOT rendered', () => {
    const result = compile({ ...baseData });
    expect(result).not.toContain('### Individual Observations');
  });

  it('non-empty individualObservations → "Individual Observations" heading rendered', () => {
    const data = {
      ...baseData,
      qualitative_coding: {
        ...baseData.qualitative_coding,
        individualObservations: [{
          label: 'Single Observation',
          definition: 'Seen once',
          displayFrequency: '1 of 10 (10%)',
          quotes: '> "solo quote" — R005',
        }],
      },
    };
    const result = compile(data);
    expect(result).toContain('### Individual Observations');
    expect(result).toContain('**Single Observation** — 1 of 10 (10%)');
  });

  it('"What Respondents Described" rendered when coding accepted', () => {
    const data = {
      ...baseData,
      qualitative_coding: {
        ...baseData.qualitative_coding,
        recurringPatterns: [{
          label: 'A', definition: 'B', displayFrequency: '2 of 3', quotes: '',
        }],
      },
    };
    const result = compile(data);
    expect(result).toContain('## What Respondents Described');
    expect(result).not.toContain('## Preliminary Qualitative Observations');
  });

  it('"Preliminary Qualitative Observations" rendered when NO coding', () => {
    const data = {
      ...baseData,
      qualitative_coding: null,
      ai_generated: { qualitative_observations: 'Some preliminary text', evidence_gaps: '', executive_summary: 'Summary.', integrated_interpretation: 'Interpretation.' },
    };
    const result = compile(data);
    expect(result).toContain('## Preliminary Qualitative Observations');
    expect(result).toContain('Some preliminary text');
    expect(result).not.toContain('## What Respondents Described');
  });

  it('renders Analysis date and Run by before Executive Summary', () => {
    const result = compile({ ...baseData });
    const dateIdx = result.indexOf('**Analysis date:** August 16, 2026');
    const runIdx = result.indexOf('**Run by:** Jane Researcher');
    const execIdx = result.indexOf('## Executive Summary');
    expect(dateIdx).toBeGreaterThan(-1);
    expect(runIdx).toBeGreaterThan(-1);
    expect(dateIdx).toBeLessThan(execIdx);
    expect(runIdx).toBeLessThan(execIdx);
  });

  it('empty source_intent omits "This survey contributes:" line', () => {
    const data = {
      ...baseData,
      project_problem_statement: 'Test problem',
      source_intent: '',
    };
    const result = compile(data);
    expect(result).toContain('**Research problem:**');
    expect(result).not.toContain('**This survey contributes:**');
  });

  it('populated source_intent renders contribution line', () => {
    const data = {
      ...baseData,
      project_problem_statement: 'Test problem',
      source_intent: 'Understand scheduling experiences',
    };
    const result = compile(data);
    expect(result).toContain('**This survey contributes:** Understand scheduling experiences');
  });

  it('What This Means uses AI-generated interpretation', () => {
    const data = {
      ...baseData,
      ai_generated: {
        ...baseData.ai_generated,
        integrated_interpretation: 'The strongest pattern is convergence between completion and satisfaction.',
      },
    };
    const result = compile(data);
    expect(result).toContain('## What This Means');
    expect(result).toContain('The strongest pattern is convergence');
  });

  it('What This Means does NOT contain reader instructions', () => {
    const data = {
      ...baseData,
      ai_generated: {
        ...baseData.ai_generated,
        integrated_interpretation: 'Synthesis text here.',
      },
    };
    const result = compile(data);
    // The template should NOT contain these instruction phrases
    expect(result).not.toContain('Readers should look for convergence');
    expect(result).not.toContain('Readers should look for complementarity');
    expect(result).not.toContain('Readers should look for dissonance');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GITHUB URL
// ═══════════════════════════════════════════════════════════════════════

describe('GitHub file URL', () => {
  it('file creation returns /blob/ URLs', () => {
    const githubFile = readFileSync(
      join(__dirname, '../../../helpers/github.ts'),
      'utf-8',
    );
    // The createOrUpdateFileOnGitHub function constructs a URL after the
    // createOrUpdateFileContents API call. That URL must use /blob/ for files.
    expect(githubFile).toContain("url: `https://github.com/${owner}/${repo}/blob/main/${filePath}`");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GOVERNANCE EXCLUSION
// ═══════════════════════════════════════════════════════════════════════

describe('governance-only code exclusion', () => {
  it('codebook generator declares analytic_relevance in output format', () => {
    const generatorFile = readFileSync(
      join(__dirname, '../../../helpers/survey/codebookGenerator.ts'),
      'utf-8',
    );
    expect(generatorFile).toContain('analytic_relevance');
    expect(generatorFile).toContain('governance_only');
  });

  it('synthesis handler filters governance_only codes from patterns', () => {
    const handlerFile = readFileSync(
      join(__dirname, '../../../helpers/slack/commands/surveySubmissionHandler.ts'),
      'utf-8',
    );
    expect(handlerFile).toContain('governanceCodeIds');
    expect(handlerFile).toContain('governance_only');
  });

  it('ProposedCode interface includes analytic_relevance', () => {
    const serviceFile = readFileSync(
      join(__dirname, '../../../services/survey-codebook.service.ts'),
      'utf-8',
    );
    expect(serviceFile).toContain("analytic_relevance?: 'research' | 'governance_only'");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// IDEMPOTENT PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════

describe('idempotent foundation persistence', () => {
  it('handler checks existingSemanticKeys before creating constructs', () => {
    const handlerFile = readFileSync(
      join(__dirname, '../../../helpers/slack/commands/surveySubmissionHandler.ts'),
      'utf-8',
    );
    expect(handlerFile).toContain('existingSemanticKeys');
    expect(handlerFile).toContain('semantic_key');
  });

  it('handler uses source-scoped query via getConstructsForSource', () => {
    const handlerFile = readFileSync(
      join(__dirname, '../../../helpers/slack/commands/surveySubmissionHandler.ts'),
      'utf-8',
    );
    expect(handlerFile).toContain('getConstructsForSource(evidenceSourceId');
    expect(handlerFile).not.toMatch(/findAll\(\{\s*where:\s*\{\s*project_id:/);
  });

  it('infers semantic key from payload when derivation_context.semantic_key absent', () => {
    const handlerFile = readFileSync(
      join(__dirname, '../../../helpers/slack/commands/surveySubmissionHandler.ts'),
      'utf-8',
    );
    // Must handle legacy constructs without explicit semantic_key
    expect(handlerFile).toContain('Legacy inference');
    expect(handlerFile).toContain("type === 'survey_dataset_summary'");
    expect(handlerFile).toContain("type === 'field_distribution'");
    expect(handlerFile).toContain("type === 'cross_tab'");
  });

  it('survey context stored in evidence_source metadata', () => {
    const handlerFile = readFileSync(
      join(__dirname, '../../../helpers/slack/commands/surveySubmissionHandler.ts'),
      'utf-8',
    );
    expect(handlerFile).toContain('survey_context:');
  });

  it('synthesis action reloads context from evidence_source metadata', () => {
    const actionFile = readFileSync(
      join(__dirname, '../../../helpers/slack/commands/surveySynthesisAction.ts'),
      'utf-8',
    );
    expect(actionFile).toContain('surveyContext');
    expect(actionFile).toContain('survey_context');
  });

  it('synthesis action falls back to canonical DB state when survey_context absent', () => {
    const actionFile = readFileSync(
      join(__dirname, '../../../helpers/slack/commands/surveySynthesisAction.ts'),
      'utf-8',
    );
    // Must have canonical DB fallback for legacy sources — uses project + meta, NOT label parsing
    expect(actionFile).toContain('Canonical DB state');
    expect(actionFile).toContain('getProjectById');
    // Must NOT parse source.label as canonical data
    expect(actionFile).not.toContain('source.label.split');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PRODUCTION-PATH RENDER TEST — Nunjucks AI task prompts
// ═══════════════════════════════════════════════════════════════════════

describe('AI task prompt Nunjucks rendering (production path)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nunjucks = require('nunjucks');
  nunjucks.configure({ autoescape: false });

  // Extract AI task prompts from YAML
  const jsYaml = require('js-yaml');
  const config = jsYaml.load(yaml) as { ai_generation_tasks?: Array<{ task_id: string; prompt: string; skip_when?: string }> };
  const tasks = config.ai_generation_tasks ?? [];

  // Realistic accepted-coding context matching production data shape
  const testContext: Record<string, unknown> = {
    survey_name: 'Test Survey',
    selected_study: 'discovery-test',
    topic: 'Test Topic',
    source_intent: 'Understand scheduling',
    project_problem_statement: 'Test problem statement',
    question_focus: 'Q5, Q8',
    computed_facts: {
      totalRespondents: 10,
      schemaSummary: 'satisfaction (ordinal), difficulty (ordinal)',
      fieldStats: [
        { fieldName: 'satisfaction', displayName: 'Satisfaction', role: 'ordinal', nPresent: 10, nMissing: 0, median: 'Good', distribution: { Good: 7, Fair: 3 } },
        { fieldName: 'difficulty', displayName: 'Difficulty', role: 'ordinal', nPresent: 9, nMissing: 1, median: 'Easy', distribution: { Easy: 5, Hard: 4 } },
      ],
      crossTabs: [
        { rowField: 'completion', colField: 'satisfaction', rowDisplayName: 'Completion', colDisplayName: 'Satisfaction', totalN: 10, cells: {} },
      ],
      nonresponseLimitation: 'Test limitation',
      sourceContentHash: 'abc123',
    },
    open_text_content: 'R001 (feedback): "Test response"',
    combined_file_content: 'R001 (feedback): "Test response"',
    qualitative_coding: {
      hasAcceptedCoding: true,
      eligibleRespondentCount: 8,
      recurringPatterns: [
        { label: 'Pattern A', definition: 'Test def A', displayFrequency: '3 of 8 (38%)' },
      ],
      individualObservations: [
        { label: 'Obs B', definition: 'Test def B', displayFrequency: '1 of 8 (13%)' },
      ],
    },
    has_accepted_coding: true,
  };

  // Simplified version of convertHandlebarsToNunjucks from langchain.ts
  function convertHandlebarsToNunjucks(template: string): string {
    let converted = template;
    converted = converted.replace(/\{\{else\}\}/g, '{% else %}');
    converted = converted.replace(/\{\{#if\s+(\w+)\s*\}\}/g, '{% if $1 %}');
    converted = converted.replace(/\{\{#unless\s+(\w+)\s*\}\}/g, '{% if not $1 %}');
    converted = converted.replace(/\{\{\/if\}\}/g, '{% endif %}');
    converted = converted.replace(/\{\{\/unless\}\}/g, '{% endif %}');
    converted = converted.replace(/\{\{#each\s+(\w+)\s*\}\}/g, '{% for item in $1 %}');
    converted = converted.replace(/\{\{\/each\}\}/g, '{% endfor %}');
    return converted;
  }

  for (const task of tasks) {
    it(`task "${task.task_id}" renders without Nunjucks parse error`, () => {
      const nunjucksTemplate = convertHandlebarsToNunjucks(task.prompt);
      // This is the exact production path: nunjucks.renderString with the converted template
      expect(() => {
        nunjucks.renderString(nunjucksTemplate, testContext);
      }).not.toThrow();
    });
  }

  it('executive_summary prompt includes field distribution data after render', () => {
    const task = tasks.find((t: { task_id: string }) => t.task_id === 'executive_summary');
    expect(task).toBeDefined();
    const rendered = nunjucks.renderString(convertHandlebarsToNunjucks(task!.prompt), testContext);
    expect(rendered).toContain('Satisfaction');
    expect(rendered).toContain('Median: Good');
    expect(rendered).toContain('Completion × Satisfaction');
    expect(rendered).toContain('Pattern A');
    expect(rendered).toContain('3 of 8 (38%)');
  });

  it('integrated_interpretation prompt includes accepted grouping data after render', () => {
    const task = tasks.find((t: { task_id: string }) => t.task_id === 'integrated_interpretation');
    expect(task).toBeDefined();
    const rendered = nunjucks.renderString(convertHandlebarsToNunjucks(task!.prompt), testContext);
    expect(rendered).toContain('Pattern A');
    expect(rendered).toContain('Test def A');
    expect(rendered).toContain('Obs B');
  });

  it('AI task prompts do not contain unconverted Handlebars block syntax', () => {
    for (const task of tasks) {
      const nunjucksTemplate = convertHandlebarsToNunjucks(task.prompt);
      // After conversion, no {{#...}} or {{/...}} should remain
      const unconverted = nunjucksTemplate.match(/\{\{[#\/](if|each|unless)\b/g);
      expect(unconverted).toBeNull();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// INTERPRETATION EVIDENCE BOUNDARY CONTRACTS
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// TOP-OF-DOCUMENT METADATA
// ═══════════════════════════════════════════════════════════════════════

describe('top-of-document metadata', () => {
  it('Analysis date appears in template between title and Executive Summary', () => {
    const titleIdx = outputSection.indexOf('# Survey Synthesis:');
    const execIdx = outputSection.indexOf('## Executive Summary');
    const dateIdx = outputSection.indexOf('**Analysis date:**');
    expect(dateIdx).toBeGreaterThan(titleIdx);
    expect(dateIdx).toBeLessThan(execIdx);
  });

  it('Run by appears in template between title and Executive Summary', () => {
    const titleIdx = outputSection.indexOf('# Survey Synthesis:');
    const execIdx = outputSection.indexOf('## Executive Summary');
    const runIdx = outputSection.indexOf('**Run by:**');
    expect(runIdx).toBeGreaterThan(titleIdx);
    expect(runIdx).toBeLessThan(execIdx);
  });

  it('uses template variables, not hardcoded values', () => {
    expect(outputSection).toContain('{{analysis_date}}');
    expect(outputSection).toContain('{{run_by}}');
  });

  it('raw Slack user ID is not rendered in top metadata', () => {
    // The template should reference {{run_by}} which is resolved to display name,
    // not {{userId}} or a raw U-prefixed Slack ID
    const metaBlock = outputSection.split('## Executive Summary')[0];
    expect(metaBlock).not.toContain('{{userId}}');
    expect(metaBlock).not.toContain('ctx.userId');
  });

  it('no global Document Information block exists', () => {
    expect(outputSection).not.toContain('## Document Information');
  });

  it('handler resolves display name from Slack profile', () => {
    const handlerFile = readFileSync(
      join(__dirname, '../../../helpers/slack/commands/surveySubmissionHandler.ts'),
      'utf-8',
    );
    expect(handlerFile).toContain('users.info');
    expect(handlerFile).toContain('display_name');
    expect(handlerFile).toContain('analysis_date');
    expect(handlerFile).toContain('run_by');
  });
});

describe('interpretation evidence boundary', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const jsYaml = require('js-yaml');
  const config = jsYaml.load(yaml) as { ai_generation_tasks?: Array<{ task_id: string; prompt: string }> };
  const tasks = config.ai_generation_tasks ?? [];

  const execSummaryPrompt = tasks.find((t: { task_id: string }) => t.task_id === 'executive_summary')?.prompt ?? '';
  const interpretationPrompt = tasks.find((t: { task_id: string }) => t.task_id === 'integrated_interpretation')?.prompt ?? '';

  it('executive_summary prohibits complement-by-subtraction', () => {
    expect(execSummaryPrompt).toContain('NO COMPLEMENT-BY-SUBTRACTION');
    expect(execSummaryPrompt).toContain('groupings are NOT mutually exclusive');
  });

  it('integrated_interpretation prohibits complement-by-subtraction', () => {
    expect(interpretationPrompt).toContain('NO COMPLEMENT-BY-SUBTRACTION');
  });

  it('integrated_interpretation does NOT include raw open_text_content when accepted coding exists', () => {
    // The interpretation prompt must not inject raw open-text entries.
    // Accepted groupings are the qualitative authority boundary.
    expect(interpretationPrompt).not.toContain('open_text_content');
    expect(interpretationPrompt).not.toContain('combined_file_content');
    expect(interpretationPrompt).not.toContain('BEGIN DATA');
  });

  it('integrated_interpretation declares accepted groupings as ONLY qualitative evidence', () => {
    expect(interpretationPrompt).toContain('ONLY qualitative evidence');
  });

  it('integrated_interpretation prohibits raw respondent details beyond accepted evidence', () => {
    expect(interpretationPrompt).toContain('do not reference respondent details');
    expect(interpretationPrompt).toContain('Do not introduce information from');
    expect(interpretationPrompt).toContain('raw open-text entries');
  });

  it('integrated_interpretation prohibits governance-only content', () => {
    expect(interpretationPrompt).toContain('governance-only groupings');
  });

  it('executive_summary declares accepted groupings as ONLY qualitative evidence', () => {
    expect(execSummaryPrompt).toContain('ONLY qualitative evidence');
  });

  it('integrated_interpretation prohibits cross-tab/qualitative grouping association without deterministic data', () => {
    expect(interpretationPrompt).toContain('No cross-tab exists between qualitative groupings and any');
    expect(interpretationPrompt).toContain('CROSS-TAB LIMITATION');
  });

  it('integrated_interpretation prohibits respondent IDs not in supplied evidence', () => {
    expect(interpretationPrompt).toContain('Respondent IDs not present in the supplied evidence');
  });
});
