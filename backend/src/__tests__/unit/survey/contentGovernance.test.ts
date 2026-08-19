/**
 * Content Governance Service unit tests.
 *
 * Tests the privacy boundary that all model-facing paths must use.
 */

import {
  getAnalysisEligibleContent,
  isAnalysisEligible,
  isValidTransition,
  buildDispositionUpdate,
  isPrivacyReviewComplete,
  countByStatus,
  getRawContentForReview,
  InvalidDispositionError,
} from '../../../services/content-governance.service';

describe('getAnalysisEligibleContent', () => {
  it('returns entry_text for clear status', () => {
    expect(getAnalysisEligibleContent({
      pii_status: 'clear', entry_text: 'original text', redacted_text: null,
    })).toBe('original text');
  });

  it('returns redacted_text for redacted status', () => {
    expect(getAnalysisEligibleContent({
      pii_status: 'redacted', entry_text: 'original', redacted_text: 'safe version',
    })).toBe('safe version');
  });

  it('returns null for restricted status', () => {
    expect(getAnalysisEligibleContent({
      pii_status: 'restricted', entry_text: 'original', redacted_text: null,
    })).toBeNull();
  });

  it('returns null for pending status (fail-closed)', () => {
    expect(getAnalysisEligibleContent({
      pii_status: 'pending', entry_text: 'original', redacted_text: null,
    })).toBeNull();
  });

  it('returns null for unknown status (fail-closed)', () => {
    expect(getAnalysisEligibleContent({
      pii_status: 'unknown' as any, entry_text: 'text', redacted_text: null,
    })).toBeNull();
  });
});

describe('isAnalysisEligible', () => {
  it('clear is eligible', () => expect(isAnalysisEligible('clear')).toBe(true));
  it('redacted is eligible', () => expect(isAnalysisEligible('redacted')).toBe(true));
  it('restricted is not eligible', () => expect(isAnalysisEligible('restricted')).toBe(false));
  it('pending is not eligible', () => expect(isAnalysisEligible('pending')).toBe(false));
});

describe('disposition transitions', () => {
  it('pending → clear is valid', () => expect(isValidTransition('pending', 'clear')).toBe(true));
  it('pending → redacted is valid', () => expect(isValidTransition('pending', 'redacted')).toBe(true));
  it('pending → restricted is valid', () => expect(isValidTransition('pending', 'restricted')).toBe(true));
  it('pending → pending is invalid', () => expect(isValidTransition('pending', 'pending')).toBe(false));
  it('clear → restricted is valid (re-review)', () => expect(isValidTransition('clear', 'restricted')).toBe(true));
});

describe('buildDispositionUpdate', () => {
  it('builds clear disposition', () => {
    const result = buildDispositionUpdate('pending', 'clear', 'U_REVIEWER');
    expect(result.pii_status).toBe('clear');
    expect(result.pii_reviewed_by).toBe('U_REVIEWER');
    expect(result.pii_reviewed_at).toBeDefined();
    expect(result.redacted_text).toBeNull();
  });

  it('builds redacted disposition with text', () => {
    const result = buildDispositionUpdate('pending', 'redacted', 'U_REVIEWER', 'safe text');
    expect(result.pii_status).toBe('redacted');
    expect(result.redacted_text).toBe('safe text');
  });

  it('rejects redacted without text', () => {
    expect(() => buildDispositionUpdate('pending', 'redacted', 'U_REVIEWER', ''))
      .toThrow('Cannot set pii_status to "redacted" with empty redacted_text');
  });

  it('rejects invalid transition', () => {
    expect(() => buildDispositionUpdate('pending', 'pending', 'U_REVIEWER'))
      .toThrow(InvalidDispositionError);
  });
});

describe('isPrivacyReviewComplete', () => {
  it('returns true when all entries are terminal', () => {
    expect(isPrivacyReviewComplete([
      { pii_status: 'clear' },
      { pii_status: 'redacted' },
      { pii_status: 'restricted' },
    ])).toBe(true);
  });

  it('returns false when any entry is pending', () => {
    expect(isPrivacyReviewComplete([
      { pii_status: 'clear' },
      { pii_status: 'pending' },
    ])).toBe(false);
  });

  it('returns true for empty array', () => {
    expect(isPrivacyReviewComplete([])).toBe(true);
  });
});

describe('countByStatus', () => {
  it('counts correctly', () => {
    const counts = countByStatus([
      { pii_status: 'clear' },
      { pii_status: 'clear' },
      { pii_status: 'redacted' },
      { pii_status: 'restricted' },
      { pii_status: 'pending' },
    ]);
    expect(counts.clear).toBe(2);
    expect(counts.redacted).toBe(1);
    expect(counts.restricted).toBe(1);
    expect(counts.pending).toBe(1);
  });
});

describe('getRawContentForReview', () => {
  it('returns both original and suggested safe text', () => {
    const result = getRawContentForReview({
      entry_text: 'original PII text',
      redacted_text: 'scrubbed text',
    });
    expect(result.originalText).toBe('original PII text');
    expect(result.suggestedSafeText).toBe('scrubbed text');
  });
});
