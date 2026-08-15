/**
 * Statistics Engine unit tests.
 *
 * Covers: distributions, ordinal median (with and without order),
 * continuous median, cross-tabs, nonresponse, determinism.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCsvBuffer } from '../../../helpers/survey/csvParser';
import { computeContentHash } from '../../../helpers/survey/sourceHash';
import { computeSurveyFacts, extractOpenTextContent } from '../../../helpers/survey/statsEngine';
import type { ConfirmedField } from '../../../types/survey';

const FIXTURES = join(__dirname, '../../__fixtures__/survey');

function standardSurvey() {
  const csv = readFileSync(join(FIXTURES, 'standard.csv'));
  return { survey: parseCsvBuffer(csv, 'standard.csv'), hash: computeContentHash(csv) };
}

const standardFields: ConfirmedField[] = [
  { fieldName: 'response_id', confirmedRole: 'id', orderMetadata: null, isDemographic: false },
  { fieldName: 'timestamp', confirmedRole: 'timestamp', orderMetadata: null, isDemographic: false },
  {
    fieldName: 'overall_satisfaction', confirmedRole: 'ordinal',
    orderMetadata: ['Very Dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very Satisfied'],
    isDemographic: false,
  },
  {
    fieldName: 'difficulty_rating', confirmedRole: 'ordinal',
    orderMetadata: ['Very Difficult', 'Difficult', 'Moderate', 'Easy', 'Very Easy'],
    isDemographic: false,
  },
  { fieldName: 'completion_status', confirmedRole: 'nominal', orderMetadata: null, isDemographic: false },
  { fieldName: 'biggest_challenge', confirmedRole: 'open_text', orderMetadata: null, isDemographic: false },
  { fieldName: 'additional_feedback', confirmedRole: 'open_text', orderMetadata: null, isDemographic: false },
];

describe('statsEngine', () => {
  describe('computeSurveyFacts', () => {
    it('computes correct total respondent count', () => {
      const { survey, hash } = standardSurvey();
      const facts = computeSurveyFacts(survey, standardFields, hash);
      expect(facts.totalRespondents).toBe(10);
    });

    it('computes ordinal distribution', () => {
      const { survey, hash } = standardSurvey();
      const facts = computeSurveyFacts(survey, standardFields, hash);

      const satStat = facts.fieldStats.find(f => f.fieldName === 'overall_satisfaction');
      expect(satStat).toBeDefined();
      expect(satStat!.distribution).toBeDefined();
      expect(satStat!.distribution!['Satisfied']).toBe(4);
      expect(satStat!.distribution!['Very Satisfied']).toBe(2);
      expect(satStat!.distribution!['Dissatisfied']).toBe(2);
    });

    it('computes ordinal median with confirmed order', () => {
      const { survey, hash } = standardSurvey();
      const facts = computeSurveyFacts(survey, standardFields, hash);

      const satStat = facts.fieldStats.find(f => f.fieldName === 'overall_satisfaction');
      expect(satStat!.median).toBeDefined();
      expect(satStat!.median).toBe('Satisfied');
    });

    it('does NOT compute ordinal median without order metadata', () => {
      const { survey, hash } = standardSurvey();
      const fieldsNoOrder = standardFields.map(f =>
        f.fieldName === 'overall_satisfaction'
          ? { ...f, orderMetadata: null }
          : f
      );
      const facts = computeSurveyFacts(survey, fieldsNoOrder, hash);

      const satStat = facts.fieldStats.find(f => f.fieldName === 'overall_satisfaction');
      expect(satStat!.median).toBeNull();
      // Distribution still computed
      expect(satStat!.distribution).toBeDefined();
    });

    it('computes nominal distribution', () => {
      const { survey, hash } = standardSurvey();
      const facts = computeSurveyFacts(survey, standardFields, hash);

      const statusStat = facts.fieldStats.find(f => f.fieldName === 'completion_status');
      expect(statusStat).toBeDefined();
      expect(statusStat!.distribution!['Complete']).toBe(7);
      expect(statusStat!.distribution!['Incomplete']).toBe(2);
      expect(statusStat!.distribution!['Partial']).toBe(1);
    });

    it('computes continuous median', () => {
      const csv = 'id,score\n1,85\n2,92\n3,78\n4,95\n5,88';
      const survey = parseCsvBuffer(csv, 'scores.csv');
      const hash = computeContentHash(csv);
      const fields: ConfirmedField[] = [
        { fieldName: 'id', confirmedRole: 'id', orderMetadata: null, isDemographic: false },
        { fieldName: 'score', confirmedRole: 'continuous', orderMetadata: null, isDemographic: false },
      ];

      const facts = computeSurveyFacts(survey, fields, hash);
      const scoreStat = facts.fieldStats.find(f => f.fieldName === 'score');
      expect(scoreStat!.median).toBe(88); // sorted: 78,85,88,92,95 → median = 88
      expect(scoreStat!.nValidNumeric).toBe(5);
      expect(scoreStat!.nInvalidNumeric).toBe(0);
    });

    it('counts missing values correctly', () => {
      const csv = readFileSync(join(FIXTURES, 'missing-values.csv'));
      const survey = parseCsvBuffer(csv, 'missing-values.csv');
      const hash = computeContentHash(csv);

      const fields: ConfirmedField[] = [
        { fieldName: 'response_id', confirmedRole: 'id', orderMetadata: null, isDemographic: false },
        { fieldName: 'overall_satisfaction', confirmedRole: 'ordinal', orderMetadata: null, isDemographic: false },
        { fieldName: 'difficulty_rating', confirmedRole: 'ordinal', orderMetadata: null, isDemographic: false },
        { fieldName: 'completion_status', confirmedRole: 'nominal', orderMetadata: null, isDemographic: false },
        { fieldName: 'biggest_challenge', confirmedRole: 'open_text', orderMetadata: null, isDemographic: false },
      ];

      const facts = computeSurveyFacts(survey, fields, hash);
      const satStat = facts.fieldStats.find(f => f.fieldName === 'overall_satisfaction');
      expect(satStat!.nPresent).toBe(3);
      expect(satStat!.nMissing).toBe(2);
    });

    it('includes nonresponse limitation note', () => {
      const { survey, hash } = standardSurvey();
      const facts = computeSurveyFacts(survey, standardFields, hash);
      expect(facts.nonresponseLimitation).toContain('cannot distinguish semantic missingness');
    });

    it('skips id and timestamp fields in statistics', () => {
      const { survey, hash } = standardSurvey();
      const facts = computeSurveyFacts(survey, standardFields, hash);

      expect(facts.fieldStats.find(f => f.fieldName === 'response_id')).toBeUndefined();
      expect(facts.fieldStats.find(f => f.fieldName === 'timestamp')).toBeUndefined();
    });
  });

  describe('cross-tabs', () => {
    it('computes completion × difficulty cross-tab', () => {
      const { survey, hash } = standardSurvey();
      const facts = computeSurveyFacts(survey, standardFields, hash);

      const ct = facts.crossTabs.find(
        c => c.rowField === 'completion_status' && c.colField === 'difficulty_rating'
      );
      expect(ct).toBeDefined();
      expect(ct!.cells['Complete']['Easy']).toBe(3);
      expect(ct!.totalN).toBeGreaterThan(0);
    });

    it('computes completion × satisfaction cross-tab', () => {
      const { survey, hash } = standardSurvey();
      const facts = computeSurveyFacts(survey, standardFields, hash);

      const ct = facts.crossTabs.find(
        c => c.rowField === 'completion_status' && c.colField === 'overall_satisfaction'
      );
      expect(ct).toBeDefined();
    });
  });

  describe('ordinal computation gate', () => {
    it('appearance order does not become measurement order', () => {
      // Even if values appear in a specific order in the CSV, no median
      // without explicit confirmed order
      const { survey, hash } = standardSurvey();
      const fieldsAppearanceOnly = standardFields.map(f =>
        f.fieldName === 'overall_satisfaction'
          ? { ...f, orderMetadata: null } // inferred as ordinal but no confirmed order
          : f
      );
      const facts = computeSurveyFacts(survey, fieldsAppearanceOnly, hash);
      const stat = facts.fieldStats.find(f => f.fieldName === 'overall_satisfaction');
      expect(stat!.median).toBeNull(); // NO median without confirmed order
      expect(stat!.distribution).toBeDefined(); // distribution IS shown
    });

    it('confirmed order produces deterministic median', () => {
      const { survey, hash } = standardSurvey();
      const facts = computeSurveyFacts(survey, standardFields, hash);
      const stat = facts.fieldStats.find(f => f.fieldName === 'overall_satisfaction');
      expect(stat!.median).toBe('Satisfied');
    });
  });

  describe('determinism', () => {
    it('same CSV + same schema produces identical facts 3 times', () => {
      const { survey, hash } = standardSurvey();

      const run1 = computeSurveyFacts(survey, standardFields, hash);
      const run2 = computeSurveyFacts(survey, standardFields, hash);
      const run3 = computeSurveyFacts(survey, standardFields, hash);

      expect(run1).toEqual(run2);
      expect(run2).toEqual(run3);
    });
  });

  describe('extractOpenTextContent', () => {
    it('extracts open-text field content with respondent labels', () => {
      const { survey } = standardSurvey();
      const labels = survey.rows.map((_, i) => `R${String(i + 1).padStart(3, '0')}`);
      const openTextFields = standardFields.filter(f => f.confirmedRole === 'open_text');

      const content = extractOpenTextContent(survey, openTextFields, labels);
      expect(content).toContain('R001');
      expect(content).toContain('biggest_challenge');
      expect(content).toContain('Finding the right form');
    });

    it('returns message when no open-text fields', () => {
      const { survey } = standardSurvey();
      const labels = survey.rows.map((_, i) => `R${String(i + 1).padStart(3, '0')}`);

      const content = extractOpenTextContent(survey, [], labels);
      expect(content).toContain('No open-text fields');
    });
  });
});
