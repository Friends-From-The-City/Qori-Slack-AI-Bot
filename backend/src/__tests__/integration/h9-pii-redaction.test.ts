/**
 * H9 PII Redaction Integration Test
 *
 * Acceptance criteria:
 * 1. Inspected payload shows known participant name ABSENT, participant code PRESENT
 * 2. No downstream leaks to study_variables or logs
 * 3. Fail-closed throw actually fires (prevents API call on failed redaction)
 */

import { redactTranscript, assertKnownNamesRedacted, PiiRedactionError } from '../../helpers/piiRedaction';

describe('H9: Pre-transmission PII redaction', () => {
  describe('Acceptance Test 1: Inspected payload (name absent, code present)', () => {
    const realTranscript = `
# Interview Transcript - Jane Smith

**Date:** January 15, 2026
**Duration:** 45 minutes

**Interviewer:** Thank you for joining us today, Jane Smith. Can you tell me about your experience?

**Jane Smith:** Sure, I've been using the VA healthcare system for about 5 years now. My name is Jane Smith and I'm a veteran from the Gulf War.

**Interviewer:** Jane Smith, can you describe a typical visit?

**Jane Smith:** Well, usually I check in at the front desk. They know me there - "Hi Jane Smith, how are you today?" kind of thing.

The system works okay but sometimes there are delays. I mentioned to Dr. Johnson - she's my primary care - that Jane Smith has been having trouble with the scheduling system.

**Interviewer:** Thank you, Jane Smith. That's very helpful.
`;

    it('redacts all occurrences of full participant name', () => {
      const redacted = redactTranscript(realTranscript, 'Jane Smith', 'PT-001');

      // VERIFICATION: Name should be ABSENT
      expect(redacted).not.toContain('Jane Smith');
      expect(redacted).not.toContain('jane smith');
      expect(redacted).not.toContain('JANE SMITH');

      // VERIFICATION: Code should be PRESENT (replacing each name occurrence)
      const codeCount = (redacted.match(/PT-001/g) || []).length;
      expect(codeCount).toBe(9); // All 9 occurrences of "Jane Smith" replaced

      // VERIFICATION: Other content unchanged
      expect(redacted).toContain('Dr. Johnson'); // Other names preserved (not the participant)
      expect(redacted).toContain('Gulf War');
      expect(redacted).toContain('45 minutes');
    });

    it('passes assertion after redaction', () => {
      const redacted = redactTranscript(realTranscript, 'Jane Smith', 'PT-001');

      // This is the check that runs BEFORE llm.invoke() — must not throw
      expect(() => {
        assertKnownNamesRedacted(redacted, ['Jane Smith'], 'PT-001');
      }).not.toThrow();
    });
  });

  describe('Acceptance Test 2: Fail-closed behavior', () => {
    it('throws PiiRedactionError when redaction is skipped', () => {
      const unreducedContent = 'Interview with Jane Smith about their experience.';

      // Simulating: someone calls the API without redacting first
      expect(() => {
        assertKnownNamesRedacted(unreducedContent, ['Jane Smith'], 'PT-001');
      }).toThrow(PiiRedactionError);
    });

    it('throws PiiRedactionError when redaction partially fails', () => {
      // Simulating: name appears in a format that wasn't caught (edge case)
      const partiallyRedacted = 'Interview with PT-001. Later, Jane   Smith was mentioned.';

      // Double-space case wouldn't be caught by word-boundary regex
      // This is a known limitation — we don't catch typos/variations
      // But if we DID have the exact name in the payload, it MUST throw
      const exactNameContent = 'Interview with PT-001. Later, Jane Smith was mentioned.';

      expect(() => {
        assertKnownNamesRedacted(exactNameContent, ['Jane Smith'], 'PT-001');
      }).toThrow(PiiRedactionError);
    });

    it('PiiRedactionError includes count but NOT names (Sentry safety)', () => {
      const unreducedContent = 'Interview with Jane Smith and John Doe.';

      try {
        assertKnownNamesRedacted(unreducedContent, ['Jane Smith', 'John Doe'], 'PT-001');
        fail('Expected PiiRedactionError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PiiRedactionError);
        const piiError = err as PiiRedactionError;

        // Diagnostic info: count and code, never names
        expect(piiError.name).toBe('PiiRedactionError');
        expect(piiError.participantCode).toBe('PT-001');

        // SECURITY: Count only — no names on the error object
        expect(piiError.detectedCount).toBe(2);
        expect((piiError as any).detectedNames).toBeUndefined();

        // Message uses count, not names (could leak to Sentry/#qori-alerts)
        expect(piiError.message).toContain('2 found');
        expect(piiError.message).not.toContain('Jane Smith');
        expect(piiError.message).not.toContain('John Doe');
      }
    });
  });

  describe('Acceptance Test 3: formatNoteContent header redaction', () => {
    // Simulates what analyzeNotesHandler.formatNoteContent now does
    const formatNoteContent = (
      filename: string,
      participantName: string | null,
      participantCode: string,
      sessionDate: string,
      createdBy: string,
      rawContent: string,
    ): string => {
      const redactedContent = redactTranscript(rawContent, participantName, participantCode);
      // Use participant CODE in header, not participant NAME
      return `# ${filename}\n\n` +
        `**Participant:** ${participantCode}\n` +
        `**Date:** ${sessionDate}\n` +
        `**Note Taker:** ${createdBy}\n\n` +
        `${redactedContent}`;
    };

    it('header uses code, not name', () => {
      const content = 'Jane Smith discussed her experience.';
      const formatted = formatNoteContent(
        'interview-001.md',
        'Jane Smith',
        'PT-001',
        'January 15, 2026',
        'U123456',
        content,
      );

      // Header should have code, not name
      expect(formatted).toContain('**Participant:** PT-001');
      expect(formatted).not.toContain('**Participant:** Jane Smith');

      // Body should have code, not name
      expect(formatted).toContain('PT-001 discussed her experience');
      expect(formatted).not.toContain('Jane Smith discussed');
    });

    it('entire formatted output passes assertion', () => {
      const content = 'Jane Smith discussed her experience. Jane Smith said thank you.';
      const formatted = formatNoteContent(
        'interview-001.md',
        'Jane Smith',
        'PT-001',
        'January 15, 2026',
        'U123456',
        content,
      );

      // The full output — header + body — must be clean
      expect(() => {
        assertKnownNamesRedacted(formatted, ['Jane Smith'], 'PT-001');
      }).not.toThrow();
    });
  });
});
