/**
 * Schema Review validation tests.
 *
 * Covers:
 * - Ordinal order validation: incomplete order fails, duplicate fails
 * - Field count check: >100 fields rejected
 * - Pagination: getTotalPages
 */

import {
  parseSchemaReviewValues,
  OrdinalOrderValidationError,
  checkFieldCountSupported,
  getTotalPages,
} from '../../../helpers/slack/ui/surveySchemaReviewModal';
import type { SurveyField } from '../../../types/survey';

function fakeField(name: string, role: string = 'nominal'): SurveyField {
  return {
    fieldName: name,
    inferredRole: role as any,
    sampleValues: [],
    distinctCount: 3,
    presentCount: 10,
    missingCount: 0,
  };
}

describe('schema review validation', () => {
  describe('ordinal order', () => {
    it('incomplete ordinal order fails closed', () => {
      const fields = [fakeField('satisfaction', 'ordinal')];
      const allValues = new Map([['satisfaction', ['Good', 'Fair', 'Poor']]]);

      // Order only has 2 of 3 categories
      const values = {
        field_role_satisfaction: { role_select: { selected_option: { value: 'ordinal' } } },
        field_order_satisfaction: { order_input: { value: 'Good | Fair' } }, // Missing "Poor"
        field_demo_satisfaction: { demo_check: {} },
      };

      expect(() =>
        parseSchemaReviewValues(values as any, fields, allValues)
      ).toThrow(OrdinalOrderValidationError);
    });

    it('duplicate category in order fails', () => {
      const fields = [fakeField('satisfaction', 'ordinal')];
      const allValues = new Map([['satisfaction', ['Good', 'Fair', 'Poor']]]);

      const values = {
        field_role_satisfaction: { role_select: { selected_option: { value: 'ordinal' } } },
        field_order_satisfaction: { order_input: { value: 'Good | Good | Fair | Poor' } },
        field_demo_satisfaction: { demo_check: {} },
      };

      expect(() =>
        parseSchemaReviewValues(values as any, fields, allValues)
      ).toThrow(OrdinalOrderValidationError);
    });

    it('confirmed complete order succeeds', () => {
      const fields = [fakeField('satisfaction', 'ordinal')];
      const allValues = new Map([['satisfaction', ['Good', 'Fair', 'Poor']]]);

      const values = {
        field_role_satisfaction: { role_select: { selected_option: { value: 'ordinal' } } },
        field_order_satisfaction: { order_input: { value: 'Poor | Fair | Good' } },
        field_demo_satisfaction: { demo_check: {} },
      };

      const result = parseSchemaReviewValues(values as any, fields, allValues);
      expect(result[0].orderMetadata).toEqual(['Poor', 'Fair', 'Good']);
    });

    it('ordinal without order input produces null orderMetadata (no median)', () => {
      const fields = [fakeField('rating', 'ordinal')];
      const allValues = new Map([['rating', ['1', '2', '3']]]);

      const values = {
        field_role_rating: { role_select: { selected_option: { value: 'ordinal' } } },
        // No order input block at all
        field_demo_rating: { demo_check: {} },
      };

      const result = parseSchemaReviewValues(values as any, fields, allValues);
      expect(result[0].confirmedRole).toBe('ordinal');
      expect(result[0].orderMetadata).toBeNull();
    });
  });

  describe('field count limit', () => {
    it('rejects >100 fields', () => {
      const error = checkFieldCountSupported(101);
      expect(error).not.toBeNull();
      expect(error).toContain('101');
      expect(error).toContain('100');
    });

    it('accepts <=100 fields', () => {
      expect(checkFieldCountSupported(100)).toBeNull();
      expect(checkFieldCountSupported(50)).toBeNull();
      expect(checkFieldCountSupported(1)).toBeNull();
    });
  });

  describe('pagination', () => {
    it('computes correct page count', () => {
      expect(getTotalPages(1)).toBe(1);
      expect(getTotalPages(20)).toBe(1);
      expect(getTotalPages(21)).toBe(2);
      expect(getTotalPages(40)).toBe(2);
      expect(getTotalPages(41)).toBe(3);
      expect(getTotalPages(100)).toBe(5);
    });
  });
});
