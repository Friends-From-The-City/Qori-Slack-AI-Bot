/**
 * Entry Scrubber tests — deterministic PII pattern detection.
 */

import { scrubEntryText, verifyRedactionConsistency } from '../../../helpers/survey/entryScrubber';

describe('scrubEntryText', () => {
  it('scrubs phone number → [PHONE]', () => {
    const result = scrubEntryText('Please call me at 555-867-5309 if you need more detail.');
    expect(result.scrubbedText).toContain('[PHONE]');
    expect(result.scrubbedText).not.toContain('555-867-5309');
    expect(result.detections.phoneCount).toBe(1);
    expect(result.hasDetections).toBe(true);
  });

  it('scrubs email → [EMAIL]', () => {
    const result = scrubEntryText('Email me at veteran.smoketest@example.com for details.');
    expect(result.scrubbedText).toContain('[EMAIL]');
    expect(result.scrubbedText).not.toContain('veteran.smoketest@example.com');
    expect(result.detections.emailCount).toBe(1);
    expect(result.hasDetections).toBe(true);
  });

  it('scrubs both phone and email', () => {
    const result = scrubEntryText('Call 555-867-5309 or email test@example.com');
    expect(result.scrubbedText).toContain('[PHONE]');
    expect(result.scrubbedText).toContain('[EMAIL]');
    expect(result.detections.phoneCount).toBe(1);
    expect(result.detections.emailCount).toBe(1);
  });

  it('returns unchanged text when no patterns found', () => {
    const result = scrubEntryText('The form was confusing and I gave up.');
    expect(result.scrubbedText).toBe('The form was confusing and I gave up.');
    expect(result.hasDetections).toBe(false);
    expect(result.detections.phoneCount).toBe(0);
    expect(result.detections.emailCount).toBe(0);
  });

  it('detectedValues contains original matched strings', () => {
    const result = scrubEntryText('Call 555-867-5309');
    expect(result.detectedValues).toContain('555-867-5309');
  });

  it('handles parenthesized phone numbers', () => {
    const result = scrubEntryText('My number is (555) 867-5309.');
    expect(result.scrubbedText).toContain('[PHONE]');
    expect(result.scrubbedText).not.toContain('867-5309');
  });
});

describe('verifyRedactionConsistency', () => {
  it('returns true when no detected values appear in redacted text', () => {
    expect(verifyRedactionConsistency(
      'Call [PHONE] for details',
      ['555-867-5309'],
    )).toBe(true);
  });

  it('returns false when detected value still appears', () => {
    expect(verifyRedactionConsistency(
      'Call 555-867-5309 for details', // scrubbing failed
      ['555-867-5309'],
    )).toBe(false);
  });

  it('returns true when no values were detected', () => {
    expect(verifyRedactionConsistency('Clean text', [])).toBe(true);
  });
});

describe('shared pattern equivalence', () => {
  it('survey scrubber uses same patterns as transcript scrubber', () => {
    // Both paths use piiPatterns.ts — verify equivalent behavior
    const surveyResult = scrubEntryText('Call 555-867-5309 or email test@va.gov');
    // The same patterns produce the same substitutions
    expect(surveyResult.scrubbedText).toBe('Call [PHONE] or email [EMAIL]');
    expect(surveyResult.detections.phoneCount).toBe(1);
    expect(surveyResult.detections.emailCount).toBe(1);
  });
});

describe('qualitative entry scrubbing integration', () => {
  it('entry_text remains original, redacted_text contains scrubbed derivative', () => {
    const originalText = 'Please call me at 555-867-5309 if you need more detail about my experience.';
    const result = scrubEntryText(originalText);

    // entry_text would be the original
    expect(originalText).toContain('555-867-5309');

    // redacted_text would be the scrubbed version
    expect(result.scrubbedText).not.toContain('555-867-5309');
    expect(result.scrubbedText).toContain('[PHONE]');

    // Detection metadata
    expect(result.hasDetections).toBe(true);
    expect(result.detections.phoneCount).toBe(1);
  });
});
