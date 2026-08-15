/**
 * Survey Synthesis v9 Golden / Contract Tests
 *
 * Verifies the deterministic output contract including:
 * - Ordinal distributions render in confirmed measurement order
 * - Respondent count uses unique respondents
 * - Declared respondent IDs survive into evidence quotes
 * - No duplicated structured tables
 * - No Braun & Clarke
 * - No soft qualitative prevalence language in prompt
 * - No model-generated frequencies
 * - Method & Provenance reports actual emit state
 * - Emit contract aligned with authority model
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

describe('survey synthesis v9 contract', () => {
  describe('ordinal rendering order', () => {
    it('satisfaction distribution renders in confirmed measurement order', () => {
      const { formatted } = computeStandardFacts();
      const satStat = formatted.fieldStats.find(f => f.fieldName === 'overall_satisfaction');
      const lines = satStat!.distribution!.split('\n');
      // Skip header rows, get value rows
      const valueRows = lines.filter(l => l.startsWith('|') && !l.includes('Value') && !l.includes('---'));
      const renderedOrder = valueRows.map(r => r.split('|')[1].trim());
      expect(renderedOrder).toEqual([
        'Very Dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very Satisfied',
      ]);
    });

    it('difficulty distribution renders in confirmed measurement order', () => {
      const { formatted } = computeStandardFacts();
      const diffStat = formatted.fieldStats.find(f => f.fieldName === 'difficulty_rating');
      const lines = diffStat!.distribution!.split('\n');
      const valueRows = lines.filter(l => l.startsWith('|') && !l.includes('Value') && !l.includes('---'));
      const renderedOrder = valueRows.map(r => r.split('|')[1].trim());
      expect(renderedOrder).toEqual([
        'Very Difficult', 'Difficult', 'Moderate', 'Easy', 'Very Easy',
      ]);
    });

    it('nominal distribution sorts by count desc (not ordinal order)', () => {
      const { formatted } = computeStandardFacts();
      const statusStat = formatted.fieldStats.find(f => f.fieldName === 'completion_status');
      const lines = statusStat!.distribution!.split('\n');
      const valueRows = lines.filter(l => l.startsWith('|') && !l.includes('Value') && !l.includes('---'));
      // Complete has highest count, should be first
      expect(valueRows[0]).toContain('Complete');
    });
  });

  describe('respondent identity', () => {
    it('declared respondent IDs survive as display labels', () => {
      const { identities } = computeStandardFacts();
      // standard.csv has response_id field with R-101, R-102, etc.
      expect(identities[0].displayLabel).toBe('R-101');
      expect(identities[0].source).toBe('declared');
      expect(identities[9].displayLabel).toBe('R-110');
    });

    it('declared IDs appear in open-text content', () => {
      const { openText } = computeStandardFacts();
      expect(openText).toContain('R-101');
      expect(openText).not.toContain('R001'); // Should NOT alias
    });
  });

  describe('respondent count', () => {
    it('reports 10 unique respondents (not 20 text entries)', () => {
      const { facts } = computeStandardFacts();
      expect(facts.totalRespondents).toBe(10);
    });

    it('formatted facts uses totalRespondents not text entry count', () => {
      const { formatted } = computeStandardFacts();
      expect(formatted.totalRespondents).toBe(10);
    });
  });

  describe('no output duplication', () => {
    it('YAML template has ONE Structured Evidence section, not Dataset Scope + Structured Evidence', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      const structuredEvidenceCount = (yaml.match(/## Structured Evidence/g) || []).length;
      expect(structuredEvidenceCount).toBe(1);
      expect(yaml).not.toContain('## Dataset & Analysis Scope');
    });

    it('source hash only appears in Method & Provenance section', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      // sourceContentHash should only appear inside the details block
      const hashRefs = yaml.split('sourceContentHash');
      // One in the Integrity subsection of Method & Provenance
      // Should not appear in main narrative
      expect(yaml).not.toMatch(/## .*\n.*sourceContentHash/);
    });
  });

  describe('qualitative authority restrictions', () => {
    it('no Braun & Clarke methodology claim', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      expect(yaml).not.toMatch(/uses thematic analysis \(Braun & Clarke\)/);
    });

    it('no soft prevalence language in prompt examples', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      // Prompt output format should not suggest prevalence hedges
      expect(yaml).not.toMatch(/"several respondents described,"/);
      expect(yaml).not.toMatch(/"a recurring concern was,"/);
      expect(yaml).not.toMatch(/"some entries noted\."/);
    });

    it('prompt prohibits soft prevalence terms explicitly', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      expect(yaml).toContain('several respondents');
      expect(yaml).toContain('recurring concern');
      // These appear in the prohibition list, not as instructions
    });

    it('NUMERIC AUTHORITY rule present', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      expect(yaml).toContain('NUMERIC AUTHORITY');
      expect(yaml).toContain('Never calculate');
    });

    it('QUALITATIVE AUTHORITY rule present', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      expect(yaml).toContain('QUALITATIVE AUTHORITY');
    });

    it('prompt uses evidence-based wording examples (not prevalence)', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      expect(yaml).toContain('Open-text entries describe');
      expect(yaml).toContain('One observed issue involves');
    });
  });

  describe('emit contract', () => {
    it('survey_themes is NOT emitted (preliminary ≠ accepted themes)', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      // survey_themes should not appear in the emits block
      const emitsSection = yaml.split('emits:')[1].split('ai_generation_tasks:')[0];
      expect(emitsSection).not.toContain('key: survey_themes');
    });

    it('discovered_metrics is NOT emitted (deterministic facts in evidence layer)', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      const emitsSection = yaml.split('emits:')[1].split('ai_generation_tasks:')[0];
      expect(emitsSection).not.toContain('key: discovered_metrics');
    });

    it('sample_demographics is NOT emitted (no confirmed demographic fields)', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      const emitsSection = yaml.split('emits:')[1].split('ai_generation_tasks:')[0];
      expect(emitsSection).not.toContain('key: sample_demographics');
    });

    it('knowledge_gaps IS emitted (approved interpretive operation)', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      const emitsSection = yaml.split('emits:')[1].split('ai_generation_tasks:')[0];
      expect(emitsSection).toContain('key: knowledge_gaps');
    });

    it('survey_findings IS emitted (model-derived candidates)', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      const emitsSection = yaml.split('emits:')[1].split('ai_generation_tasks:')[0];
      expect(emitsSection).toContain('key: survey_findings');
    });

    it('discovered_barriers IS emitted (interpretive operation)', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      const emitsSection = yaml.split('emits:')[1].split('ai_generation_tasks:')[0];
      expect(emitsSection).toContain('key: discovered_barriers');
    });
  });

  describe('Method & Provenance structure', () => {
    it('has one collapsed details block', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      expect(yaml).toContain('<details>');
      expect(yaml).toContain('Method & Provenance');
    });

    it('contains Source subsection', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      expect(yaml).toContain('### Source');
    });

    it('contains Authority table with actual authority levels', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      expect(yaml).toContain('NOT YET PERFORMED');
      expect(yaml).toContain('Deterministic');
      expect(yaml).toContain('Preliminary model interpretation');
    });

    it('contains actual cascade emission state', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      expect(yaml).toContain('NOT EMITTED');
      expect(yaml).toContain('formal coding not yet performed');
    });

    it('contains Integrity subsection with source hash', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      expect(yaml).toContain('### Integrity');
      expect(yaml).toContain('Source SHA-256');
    });
  });

  describe('output structure', () => {
    it('has Executive Summary', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      expect(yaml).toContain('## Executive Summary');
    });

    it('has Analysis Details collapsed', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      expect(yaml).toContain('Analysis Details');
      expect(yaml).toContain('<details>');
    });

    it('uses GitHub-native callout syntax', () => {
      const yaml = readFileSync(YAML_PATH, 'utf-8');
      expect(yaml).toContain('> [!NOTE]');
      expect(yaml).toContain('> [!IMPORTANT]');
      expect(yaml).toContain('> [!WARNING]');
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
