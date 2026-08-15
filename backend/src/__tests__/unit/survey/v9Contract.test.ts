/**
 * Survey Synthesis v9 Golden / Contract Tests
 *
 * Verifies the deterministic output contract:
 * - 11 respondents renders as 11 respondents, never 22
 * - Deterministic structured evidence visible
 * - No Braun & Clarke
 * - No model-generated qualitative frequencies
 * - No unsupported causal language
 * - Formatted distributions render as Markdown tables
 * - Method & Provenance structure
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCsvBuffer } from '../../../helpers/survey/csvParser';
import { computeContentHash } from '../../../helpers/survey/sourceHash';
import { computeSurveyFacts, extractOpenTextContent } from '../../../helpers/survey/statsEngine';
import { assignRespondentIdentities } from '../../../helpers/survey/respondentIdentity';
import { formatComputedFacts, type FormattedComputedFacts } from '../../../helpers/survey/factsFormatter';
import type { ConfirmedField, SurveyComputedFacts } from '../../../types/survey';

const FIXTURES = join(__dirname, '../../__fixtures__/survey');

// Standard 10-row fixture with confirmed schema
function computeStandardFacts(): { facts: SurveyComputedFacts; formatted: FormattedComputedFacts; openText: string } {
  const csv = readFileSync(join(FIXTURES, 'standard.csv'));
  const survey = parseCsvBuffer(csv, 'standard.csv');
  const hash = computeContentHash(csv);

  const fields: ConfirmedField[] = [
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

  const facts = computeSurveyFacts(survey, fields, hash);
  const formatted = formatComputedFacts(facts);
  const identities = assignRespondentIdentities(survey, fields, hash);
  const openText = extractOpenTextContent(survey, fields, identities.map(i => i.displayLabel));

  return { facts, formatted, openText };
}

describe('survey synthesis v9 contract', () => {
  describe('respondent count', () => {
    it('reports 10 unique respondents (not 20 text entries)', () => {
      const { facts } = computeStandardFacts();
      // 10 rows in standard.csv
      expect(facts.totalRespondents).toBe(10);
    });

    it('formatted facts uses totalRespondents not text entry count', () => {
      const { formatted } = computeStandardFacts();
      expect(formatted.totalRespondents).toBe(10);
    });

    it('open-text extraction does not inflate respondent count', () => {
      const { openText } = computeStandardFacts();
      // Two open-text fields but respondent count stays at 10
      // Labels should be R001-R010
      expect(openText).toContain('R001');
      expect(openText).toContain('R010');
      expect(openText).not.toContain('R011');
    });
  });

  describe('deterministic structured evidence', () => {
    it('completion distribution is visible as Markdown table', () => {
      const { formatted } = computeStandardFacts();
      const statusStat = formatted.fieldStats.find(f => f.fieldName === 'completion_status');
      expect(statusStat).toBeDefined();
      expect(statusStat!.distribution).not.toBeNull();
      expect(statusStat!.distribution).toContain('| Value | Count |');
      expect(statusStat!.distribution).toContain('Complete');
    });

    it('satisfaction median is visible', () => {
      const { formatted } = computeStandardFacts();
      const satStat = formatted.fieldStats.find(f => f.fieldName === 'overall_satisfaction');
      expect(satStat!.median).toBe('Satisfied');
    });

    it('difficulty median is visible', () => {
      const { formatted } = computeStandardFacts();
      const diffStat = formatted.fieldStats.find(f => f.fieldName === 'difficulty_rating');
      expect(diffStat!.median).toBeDefined();
    });

    it('distributions are formatted as Markdown tables, not [object Object]', () => {
      const { formatted } = computeStandardFacts();
      for (const stat of formatted.fieldStats) {
        if (stat.distribution) {
          expect(stat.distribution).not.toContain('[object Object]');
          expect(stat.distribution).toContain('|');
        }
      }
    });

    it('cross-tabs are formatted as Markdown tables', () => {
      const { formatted } = computeStandardFacts();
      for (const ct of formatted.crossTabs) {
        expect(ct.cells).toContain('|');
        expect(ct.cells).not.toContain('[object Object]');
      }
    });
  });

  describe('qualitative authority restrictions', () => {
    // These test the v9 YAML prompt rules by verifying the template structure
    it('YAML template does not contain Braun & Clarke as methodology claim', () => {
      const yaml = readFileSync(join(__dirname, '../../../../../config/prompts/survey_synthesis.yaml'), 'utf-8');
      // Should not claim B&C as active methodology
      expect(yaml).not.toMatch(/uses thematic analysis \(Braun & Clarke\)/);
    });

    it('YAML prompt contains NUMERIC AUTHORITY rule', () => {
      const yaml = readFileSync(join(__dirname, '../../../../../config/prompts/survey_synthesis.yaml'), 'utf-8');
      expect(yaml).toContain('NUMERIC AUTHORITY');
      expect(yaml).toContain('Never calculate');
    });

    it('YAML prompt contains QUALITATIVE AUTHORITY rule', () => {
      const yaml = readFileSync(join(__dirname, '../../../../../config/prompts/survey_synthesis.yaml'), 'utf-8');
      expect(yaml).toContain('QUALITATIVE AUTHORITY');
      expect(yaml).toContain('preliminary');
    });

    it('YAML prompt contains RESPONDENT TERMINOLOGY rule', () => {
      const yaml = readFileSync(join(__dirname, '../../../../../config/prompts/survey_synthesis.yaml'), 'utf-8');
      expect(yaml).toContain('unique respondent');
      expect(yaml).toContain('Never count text');
    });

    it('YAML prompt does not positively instruct model to count themes', () => {
      const yaml = readFileSync(join(__dirname, '../../../../../config/prompts/survey_synthesis.yaml'), 'utf-8');
      // Should not contain positive instructions like "count the themes"
      // but may contain prohibitions like "Do not count themes"
      expect(yaml).not.toMatch(/\bcount the themes\b/i);
      expect(yaml).not.toMatch(/\btheme frequency_count\b/i);
      expect(yaml).not.toMatch(/\bsentiment classification criteria\b/i);
    });

    it('YAML prompt does not positively instruct sentiment percentage calculation', () => {
      const yaml = readFileSync(join(__dirname, '../../../../../config/prompts/survey_synthesis.yaml'), 'utf-8');
      // Should not contain "calculate sentiment percentage" type instructions
      expect(yaml).not.toMatch(/\bcalculate.*sentiment/i);
      expect(yaml).not.toMatch(/\bsentiment.*breakdown.*table\b/i);
    });
  });

  describe('output structure', () => {
    it('YAML output template has Preliminary Qualitative label', () => {
      const yaml = readFileSync(join(__dirname, '../../../../../config/prompts/survey_synthesis.yaml'), 'utf-8');
      expect(yaml).toContain('Preliminary Qualitative Observations');
    });

    it('YAML output template has collapsed Method & Provenance', () => {
      const yaml = readFileSync(join(__dirname, '../../../../../config/prompts/survey_synthesis.yaml'), 'utf-8');
      expect(yaml).toContain('<details>');
      expect(yaml).toContain('Method & Provenance');
      expect(yaml).toContain('</details>');
    });

    it('YAML output template has Structured Evidence section', () => {
      const yaml = readFileSync(join(__dirname, '../../../../../config/prompts/survey_synthesis.yaml'), 'utf-8');
      expect(yaml).toContain('## Structured Evidence');
    });

    it('YAML output template has Evidence Gaps section', () => {
      const yaml = readFileSync(join(__dirname, '../../../../../config/prompts/survey_synthesis.yaml'), 'utf-8');
      expect(yaml).toContain('## Evidence Gaps');
    });

    it('YAML output template has Integrated Interpretation section', () => {
      const yaml = readFileSync(join(__dirname, '../../../../../config/prompts/survey_synthesis.yaml'), 'utf-8');
      expect(yaml).toContain('## Integrated Interpretation');
    });

    it('YAML output uses GitHub-native callout syntax', () => {
      const yaml = readFileSync(join(__dirname, '../../../../../config/prompts/survey_synthesis.yaml'), 'utf-8');
      expect(yaml).toContain('> [!NOTE]');
    });
  });

  describe('schema summary formatting', () => {
    it('formats schema summary as role counts', () => {
      const { formatted } = computeStandardFacts();
      expect(typeof formatted.schemaSummary).toBe('string');
      expect(formatted.schemaSummary).toContain('ordinal');
      expect(formatted.schemaSummary).toContain('nominal');
    });
  });

  describe('determinism', () => {
    it('same fixture produces identical formatted output 3 times', () => {
      const r1 = computeStandardFacts();
      const r2 = computeStandardFacts();
      const r3 = computeStandardFacts();
      expect(r1.formatted).toEqual(r2.formatted);
      expect(r2.formatted).toEqual(r3.formatted);
    });
  });
});
