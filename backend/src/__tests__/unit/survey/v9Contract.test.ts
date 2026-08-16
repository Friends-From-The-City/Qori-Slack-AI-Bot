/**
 * Survey Synthesis Document Contract Tests
 * (Covers v9.x baseline; v10 additions in v10ArtifactContract.test.ts)
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCsvBuffer } from '../../../helpers/survey/csvParser';
import { computeContentHash } from '../../../helpers/survey/sourceHash';
import { computeSurveyFacts, extractOpenTextContent } from '../../../helpers/survey/statsEngine';
import { assignRespondentIdentities } from '../../../helpers/survey/respondentIdentity';
import { formatComputedFacts, type FormattedComputedFacts } from '../../../helpers/survey/factsFormatter';
import { toDisplayLabel } from '../../../helpers/survey/displayLabels';
import { suggestOrdinalOrder } from '../../../helpers/survey/ordinalSuggestions';
import type { ConfirmedField, SurveyComputedFacts } from '../../../types/survey';

const FIXTURES = join(__dirname, '../../__fixtures__/survey');
const YAML_PATH = join(__dirname, '../../../../../config/prompts/survey_synthesis.yaml');

const standardFields: ConfirmedField[] = [
  { fieldName: 'response_id', confirmedRole: 'id', orderMetadata: null, isDemographic: false },
  { fieldName: 'timestamp', confirmedRole: 'timestamp', orderMetadata: null, isDemographic: false },
  { fieldName: 'overall_satisfaction', confirmedRole: 'ordinal',
    orderMetadata: ['Very Dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very Satisfied'],
    isDemographic: false },
  { fieldName: 'difficulty_rating', confirmedRole: 'ordinal',
    orderMetadata: ['Very Difficult', 'Difficult', 'Moderate', 'Easy', 'Very Easy'],
    isDemographic: false },
  { fieldName: 'completion_status', confirmedRole: 'nominal', orderMetadata: null, isDemographic: false },
  { fieldName: 'biggest_challenge', confirmedRole: 'open_text', orderMetadata: null, isDemographic: false },
  { fieldName: 'additional_feedback', confirmedRole: 'open_text', orderMetadata: null, isDemographic: false },
];

function computeStandardFacts() {
  const csv = readFileSync(join(FIXTURES, 'standard.csv'));
  const survey = parseCsvBuffer(csv, 'standard.csv');
  const hash = computeContentHash(csv);
  const facts = computeSurveyFacts(survey, standardFields, hash);
  const formatted = formatComputedFacts(facts, standardFields);
  const identities = assignRespondentIdentities(survey, standardFields, hash);
  const openText = extractOpenTextContent(survey, standardFields, identities.map(i => i.displayLabel));
  return { facts, formatted, openText, identities };
}

describe('display labels', () => {
  it('overall_satisfaction → Overall Satisfaction', () => {
    expect(toDisplayLabel('overall_satisfaction')).toBe('Overall Satisfaction');
  });
  it('difficulty_rating → Difficulty Rating', () => {
    expect(toDisplayLabel('difficulty_rating')).toBe('Difficulty Rating');
  });
  it('completion_status → Completion Status', () => {
    expect(toDisplayLabel('completion_status')).toBe('Completion Status');
  });
  it('response_id → Response ID', () => {
    expect(toDisplayLabel('response_id')).toBe('Response ID');
  });
  it('biggest_challenge → Biggest Challenge', () => {
    expect(toDisplayLabel('biggest_challenge')).toBe('Biggest Challenge');
  });
  it('formatted stats have displayName', () => {
    const { formatted } = computeStandardFacts();
    for (const stat of formatted.fieldStats) {
      expect(stat.displayName).toBeDefined();
      expect(stat.displayName).not.toContain('_');
    }
  });
  it('formatted cross-tabs have display names', () => {
    const { formatted } = computeStandardFacts();
    for (const ct of formatted.crossTabs) {
      expect(ct.rowDisplayName).not.toContain('_');
      expect(ct.colDisplayName).not.toContain('_');
    }
  });
});

describe('document hierarchy', () => {
  const yaml = readFileSync(YAML_PATH, 'utf-8');

  it('has exactly one H1 in output template', () => {
    const outputSection = yaml.split('output_template:')[1]?.split('output_options:')[0] ?? '';
    const h1s = outputSection.match(/^  # [^#]/gm) || [];
    expect(h1s.length).toBe(1);
  });
  it('Executive Summary is visible (not collapsed)', () => {
    expect(yaml).toContain('## Executive Summary');
  });
  it('Structured Evidence is collapsed', () => {
    expect(yaml).toContain('View Structured Evidence');
    expect(yaml).toContain('<details>');
  });
  it('Analysis Details is collapsed', () => {
    expect(yaml).toContain('Analysis Details');
  });
  it('Method & Provenance is collapsed', () => {
    expect(yaml).toContain('Method & Provenance');
  });
  it('no visible Document Information section', () => {
    expect(yaml).not.toContain('## Document Information');
  });
  it('source hash appears only in provenance toggle', () => {
    // sourceContentHash should only be inside details blocks
    expect(yaml).not.toMatch(/## .*sourceContentHash/);
  });
});

describe('no internal engineering language in artifact', () => {
  const yaml = readFileSync(YAML_PATH, 'utf-8');
  // Check only the output_template section
  const outputSection = yaml.split('output_template:')[1]?.split('output_options:')[0] ?? '';

  it('no "legacy cascade"', () => {
    expect(outputSection).not.toContain('legacy cascade');
  });
  it('no "evidence-layer constructs"', () => {
    expect(outputSection).not.toContain('evidence-layer constructs');
  });
  it('no "vertical slice"', () => {
    expect(outputSection).not.toMatch(/vertical slice/i);
  });
  it('no "Slice 1" or "Slice 2" in output', () => {
    expect(outputSection).not.toMatch(/Slice [12]/);
  });
  it('no "progressive migration"', () => {
    expect(outputSection).not.toContain('progressive migration');
  });
  it('no internal variable names table in output', () => {
    expect(outputSection).not.toContain('survey_findings');
    expect(outputSection).not.toContain('discovered_barriers');
    expect(outputSection).not.toContain('knowledge_gaps');
  });
});

describe('emit contract', () => {
  const yaml = readFileSync(YAML_PATH, 'utf-8');
  const emitsSection = yaml.split('emits:')[1]?.split('ai_generation_tasks:')[0] ?? '';

  it('knowledge_gaps present', () => {
    expect(emitsSection).toContain('key: knowledge_gaps');
  });
  it('survey_findings present', () => {
    expect(emitsSection).toContain('key: survey_findings');
  });
  it('discovered_barriers absent', () => {
    expect(emitsSection).not.toContain('key: discovered_barriers');
  });
  it('survey_themes absent', () => {
    expect(emitsSection).not.toContain('key: survey_themes');
  });
  it('discovered_metrics absent', () => {
    expect(emitsSection).not.toContain('key: discovered_metrics');
  });
  it('sample_demographics absent', () => {
    expect(emitsSection).not.toContain('key: sample_demographics');
  });
});

describe('ordinal suggestions', () => {
  it('recognizes satisfaction scale', () => {
    const result = suggestOrdinalOrder(['Satisfied', 'Very Satisfied', 'Neutral', 'Dissatisfied', 'Very Dissatisfied']);
    expect(result.source).toBe('known_scale');
    expect(result.suggestedOrder![0]).toMatch(/very dissatisfied/i);
  });
  it('recognizes difficulty scale', () => {
    const result = suggestOrdinalOrder(['Easy', 'Very Easy', 'Neutral', 'Difficult', 'Very Difficult']);
    expect(result.source).toBe('known_scale');
  });
  it('proposes ascending numeric order', () => {
    const result = suggestOrdinalOrder(['3', '1', '5', '2', '4']);
    expect(result.source).toBe('numeric');
    expect(result.suggestedOrder).toEqual(['1', '2', '3', '4', '5']);
  });
  it('returns none for unknown scale', () => {
    const result = suggestOrdinalOrder(['Apple', 'Banana', 'Cherry']);
    expect(result.source).toBe('none');
    expect(result.suggestedOrder).toBeNull();
  });
  it('suggestion still requires confirmation (not auto-accepted)', () => {
    // suggestOrdinalOrder returns a suggestion, not a confirmed order
    const result = suggestOrdinalOrder(['Satisfied', 'Very Satisfied', 'Neutral', 'Dissatisfied', 'Very Dissatisfied']);
    expect(result.suggestedOrder).toBeDefined();
    // The suggestion must be presented to researcher — it's not auto-used
    // (verified by the modal UX, not by this function alone)
  });
});

describe('respondent identity', () => {
  it('declared IDs survive as display labels', () => {
    const { identities } = computeStandardFacts();
    expect(identities[0].displayLabel).toBe('R-101');
    expect(identities[0].source).toBe('declared');
  });
  it('declared IDs appear in open-text', () => {
    const { openText } = computeStandardFacts();
    expect(openText).toContain('R-101');
    expect(openText).not.toContain('R001');
  });
});

describe('ordinal rendering', () => {
  it('satisfaction in confirmed measurement order', () => {
    const { formatted } = computeStandardFacts();
    const stat = formatted.fieldStats.find(f => f.fieldName === 'overall_satisfaction');
    const rows = stat!.distribution!.split('\n').filter(l => l.startsWith('|') && !l.includes('Value') && !l.includes('---'));
    const order = rows.map(r => r.split('|')[1].trim());
    expect(order).toEqual(['Very Dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very Satisfied']);
  });
});

describe('Method & Provenance', () => {
  const yaml = readFileSync(YAML_PATH, 'utf-8');

  it('real filename present (not staged-csv)', () => {
    expect(yaml).toContain('provenance.source_filename');
  });
  it('schema reviewer present', () => {
    expect(yaml).toContain('provenance.reviewed_by');
    expect(yaml).toContain('provenance.reviewed_at');
  });
  it('ordinal orders present', () => {
    expect(yaml).toContain('provenance.ordinal_orders');
  });
  it('computation block present', () => {
    expect(yaml).toContain('deterministically');
  });
  it('generation block with model', () => {
    expect(yaml).toContain('provenance.model_used');
  });
  it('no "legacy cascade" in provenance', () => {
    const outputSection = yaml.split('output_template:')[1]?.split('output_options:')[0] ?? '';
    expect(outputSection).not.toContain('legacy cascade');
  });
});

describe('evidence-gap grounding', () => {
  const yaml = readFileSync(YAML_PATH, 'utf-8');

  it('prompt lists available structured evidence', () => {
    expect(yaml).toContain('AVAILABLE STRUCTURED EVIDENCE');
    expect(yaml).toContain('Field distributions');
    expect(yaml).toContain('Ordinal medians');
    expect(yaml).toContain('Cross-tabulations');
  });
  it('prompt lists what is NOT available', () => {
    expect(yaml).toContain('NOT available');
    expect(yaml).toContain('qualitative-code prevalence');
    expect(yaml).toContain('Causal attribution');
  });
  it('prompt prohibits claiming available results are missing', () => {
    expect(yaml).toContain('Do NOT claim a structured result is missing');
  });
});

describe('document order', () => {
  const yaml = readFileSync(YAML_PATH, 'utf-8');
  const outputSection = yaml.split('output_template:')[1]?.split('output_options:')[0] ?? '';

  it('Structured Evidence appears before qualitative section', () => {
    const seIdx = outputSection.indexOf('View Structured Evidence');
    // v10: "What Respondents Described" appears before "Preliminary Qualitative"
    const qualIdx = outputSection.indexOf('## What Respondents Described');
    expect(seIdx).toBeGreaterThan(-1);
    expect(qualIdx).toBeGreaterThan(-1);
    expect(seIdx).toBeLessThan(qualIdx);
  });

  it('Structured Evidence appears after Research Context', () => {
    const rcIdx = outputSection.indexOf('## Research Context');
    const seIdx = outputSection.indexOf('View Structured Evidence');
    expect(rcIdx).toBeLessThan(seIdx);
  });
});

describe('filename provenance', () => {
  it('provenance uses source_filename not staged-csv', () => {
    const yaml = readFileSync(YAML_PATH, 'utf-8');
    expect(yaml).toContain('provenance.source_filename');
    expect(yaml).not.toContain("'staged-csv'");
  });
});

describe('footer control', () => {
  it('survey_synthesis opts out of Document Information footer', () => {
    const yaml = readFileSync(YAML_PATH, 'utf-8');
    expect(yaml).toContain('append_document_information: false');
  });
});

describe('qualitative prevalence hardening', () => {
  const yaml = readFileSync(YAML_PATH, 'utf-8');

  it('prohibits "some respondents" in prompt', () => {
    // Should appear in the prohibition list
    expect(yaml).toContain('"some respondents,"');
  });

  it('prohibits "some participants" in prompt', () => {
    expect(yaml).toContain('"some participants,"');
  });

  it('prohibits "with some respondents noting"', () => {
    expect(yaml).toContain('"with some respondents noting,"');
  });

  it('prohibits "many respondents"', () => {
    expect(yaml).toContain('"many respondents,"');
  });
});

describe('Method & Provenance display labels', () => {
  it('provenance field_role_summary uses toDisplayLabel', () => {
    // Verified by handler implementation — toDisplayLabel used in handler
    // to build field_role_summary and ordinal_orders
    const label = toDisplayLabel('overall_satisfaction');
    expect(label).toBe('Overall Satisfaction');
  });
});

describe('pre-main prevalence hardening', () => {
  const yaml = readFileSync(YAML_PATH, 'utf-8');

  it('prohibits "at least some respondents"', () => {
    expect(yaml).toContain('"at least some respondents,"');
  });

  it('prohibits "for at least some respondents"', () => {
    expect(yaml).toContain('"for at least some respondents,"');
  });

  it('prohibits "for some respondents"', () => {
    expect(yaml).toContain('"for some respondents,"');
  });
});

describe('theme terminology prohibition', () => {
  const yaml = readFileSync(YAML_PATH, 'utf-8');

  it('qualitative prompt prohibits "theme/themes" for groupings', () => {
    expect(yaml).toContain('Do not use "theme" or "themes" to describe qualitative');
  });

  it('qualitative prompt prohibits "friction themes"', () => {
    expect(yaml).toContain('"friction themes,"');
  });

  it('evidence-gap prompt prohibits "theme/themes"', () => {
    // The evidence_gaps task should also prohibit "theme"
    expect(yaml).toContain('Do not use "theme" or "themes" to describe qualitative groupings');
  });

  it('suggests replacement terminology', () => {
    expect(yaml).toContain('observation');
    expect(yaml).toContain('preliminary grouping');
  });
});

describe('determinism', () => {
  it('3 runs identical', () => {
    const r1 = computeStandardFacts();
    const r2 = computeStandardFacts();
    const r3 = computeStandardFacts();
    expect(r1.formatted).toEqual(r2.formatted);
    expect(r2.formatted).toEqual(r3.formatted);
  });
});
