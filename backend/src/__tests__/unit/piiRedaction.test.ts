/**
 * Unit tests for PII redaction functions (H9 remediation)
 */

import {
  redactTranscript,
  assertKnownNamesRedacted,
  PiiRedactionError,
} from '../../helpers/piiRedaction';

describe('piiRedaction', () => {
  describe('redactTranscript', () => {
    it('replaces full participant name with code', () => {
      const content = 'Interview with Jane Smith about their experience.';
      const result = redactTranscript(content, 'Jane Smith', 'PT-001');
      expect(result).toBe('Interview with PT-001 about their experience.');
    });

    it('is case-insensitive', () => {
      const content = 'jane smith said something. JANE SMITH confirmed.';
      const result = redactTranscript(content, 'Jane Smith', 'PT-001');
      expect(result).toBe('PT-001 said something. PT-001 confirmed.');
    });

    it('handles multiple occurrences', () => {
      const content = 'John Doe mentioned that John Doe was present.';
      const result = redactTranscript(content, 'John Doe', 'PT-002');
      expect(result).toBe('PT-002 mentioned that PT-002 was present.');
    });

    it('respects word boundaries', () => {
      const content = 'John Doe is not JohnDoe or John Doer.';
      const result = redactTranscript(content, 'John Doe', 'PT-002');
      expect(result).toBe('PT-002 is not JohnDoe or John Doer.');
    });

    it('returns original content if name is null', () => {
      const content = 'Some content here.';
      const result = redactTranscript(content, null, 'PT-001');
      expect(result).toBe('Some content here.');
    });

    it('returns original content if name is too short (length <= 2)', () => {
      const content = 'Al said something.';
      const result = redactTranscript(content, 'Al', 'PT-001');
      expect(result).toBe('Al said something.');
    });

    it('handles names with special regex characters', () => {
      const content = 'Interview with John (Jack) Smith.';
      const result = redactTranscript(content, 'John (Jack) Smith', 'PT-003');
      expect(result).toBe('Interview with PT-003.');
    });

    it('returns empty string if content is empty', () => {
      const result = redactTranscript('', 'Jane Smith', 'PT-001');
      expect(result).toBe('');
    });

    it('handles transcript with multiple lines', () => {
      const content = `Line 1: Jane Smith spoke.
Line 2: More content.
Line 3: Jane Smith concluded.`;
      const result = redactTranscript(content, 'Jane Smith', 'PT-001');
      expect(result).toBe(`Line 1: PT-001 spoke.
Line 2: More content.
Line 3: PT-001 concluded.`);
    });
  });

  describe('assertKnownNamesRedacted', () => {
    it('does not throw when names are properly redacted', () => {
      const payload = 'Interview with PT-001 about their experience.';
      expect(() => {
        assertKnownNamesRedacted(payload, ['Jane Smith'], 'PT-001');
      }).not.toThrow();
    });

    it('throws PiiRedactionError when a known name is detected', () => {
      const payload = 'Interview with Jane Smith about their experience.';
      expect(() => {
        assertKnownNamesRedacted(payload, ['Jane Smith'], 'PT-001');
      }).toThrow(PiiRedactionError);
    });

    it('includes detected COUNT (not names) in the error', () => {
      const payload = 'Interview with Jane Smith about their experience.';
      try {
        assertKnownNamesRedacted(payload, ['Jane Smith'], 'PT-001');
        fail('Expected error to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PiiRedactionError);
        const piiError = err as PiiRedactionError;
        // SECURITY: Count only, never names — error may reach Sentry/#qori-alerts
        expect(piiError.detectedCount).toBe(1);
        expect(piiError.participantCode).toBe('PT-001');
        // Verify no detectedNames property exists
        expect((piiError as any).detectedNames).toBeUndefined();
      }
    });

    it('skips names that are too short (length <= 2)', () => {
      const payload = 'Al said something about Al.';
      expect(() => {
        assertKnownNamesRedacted(payload, ['Al'], 'PT-001');
      }).not.toThrow();
    });

    it('handles null/undefined names in the array', () => {
      const payload = 'Interview with PT-001.';
      expect(() => {
        assertKnownNamesRedacted(payload, [null, undefined, 'Jane Smith'], 'PT-001');
      }).not.toThrow();
    });

    it('counts multiple detected names', () => {
      const payload = 'Jane Smith and John Doe were present.';
      try {
        assertKnownNamesRedacted(payload, ['Jane Smith', 'John Doe'], 'PT-001');
        fail('Expected error to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PiiRedactionError);
        const piiError = err as PiiRedactionError;
        // SECURITY: Count only — 2 distinct names detected
        expect(piiError.detectedCount).toBe(2);
        expect(piiError.message).toContain('2 found');
      }
    });

    it('is case-insensitive when detecting names', () => {
      const payload = 'JANE SMITH mentioned something.';
      expect(() => {
        assertKnownNamesRedacted(payload, ['Jane Smith'], 'PT-001');
      }).toThrow(PiiRedactionError);
    });
  });

  describe('integration: redact then assert', () => {
    it('passes assertion after proper redaction', () => {
      const original = 'Jane Smith said: "I work with Jane Smith daily."';
      const redacted = redactTranscript(original, 'Jane Smith', 'PT-001');

      expect(redacted).toBe('PT-001 said: "I work with PT-001 daily."');
      expect(() => {
        assertKnownNamesRedacted(redacted, ['Jane Smith'], 'PT-001');
      }).not.toThrow();
    });

    it('fails assertion if redaction was skipped', () => {
      const original = 'Jane Smith said something.';
      // Intentionally skip redaction
      expect(() => {
        assertKnownNamesRedacted(original, ['Jane Smith'], 'PT-001');
      }).toThrow(PiiRedactionError);
    });
  });
});
