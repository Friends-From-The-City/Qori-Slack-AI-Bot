/**
 * Claim Guard Unit Tests — v10.2
 *
 * Validates the post-generation claim guard that enforces the accepted
 * evidence envelope boundary on all reader-facing AI tasks.
 *
 * Tests cover:
 * - Evidence Gaps receives no raw open_text_content when accepted coding exists
 * - governance_only entries cannot appear in Evidence Gaps
 * - no_grouping / uncodable entries cannot appear in any reader-facing AI prompt
 * - Technical-failure text absent unless in accepted research evidence
 * - Caregiver/private-disclosure text absent unless in accepted evidence
 * - Unsupported qualitative ↔ structured association is rejected
 * - Unsupported psychological explanation is rejected or absent
 * - Supplied accepted evidence can still be synthesized narratively
 */

import {
  validateClaims,
  buildEvidenceEnvelope,
  buildRetryGuidance,
  type EvidenceEnvelope,
  type ClaimViolation,
} from '../../../helpers/survey/claimGuard';

// ═══════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════

function makeEnvelope(overrides?: Partial<EvidenceEnvelope>): EvidenceEnvelope {
  return {
    acceptedRespondentIds: new Set(['R001', 'R002', 'R003', 'R004', 'R005']),
    acceptedNumericValues: new Set(['10', '5', '3', '50', '30', '70', '2.5', '3.0']),
    acceptedGroupingLabels: new Set([
      'eligibility uncertainty',
      'navigation complexity',
      'straightforward completion',
    ]),
    hasQualitativeStructuredCrossTab: false,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// CLASS A — Respondent IDs not in accepted evidence
// ═══════════════════════════════════════════════════════════════════════

describe('Class A: Respondent ID validation', () => {
  const envelope = makeEnvelope();

  it('passes when all referenced respondent IDs are in accepted evidence', () => {
    const text = 'R001 described eligibility issues. R003 noted complexity.';
    const result = validateClaims(text, envelope);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('rejects respondent IDs not present in accepted evidence', () => {
    const text = 'R001 described eligibility issues. R099 reported timeout failures.';
    const result = validateClaims(text, envelope);
    expect(result.valid).toBe(false);
    const classA = result.violations.filter(v => v.class === 'A');
    expect(classA).toHaveLength(1);
    expect(classA[0].evidence).toBe('R099');
  });

  it('passes when no respondent IDs are referenced', () => {
    const text = 'The structured evidence shows neutral satisfaction ratings.';
    const result = validateClaims(text, envelope);
    const classA = result.violations.filter(v => v.class === 'A');
    expect(classA).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CLASS B — Numeric values not in deterministic facts
// ═══════════════════════════════════════════════════════════════════════

describe('Class B: Numeric value validation', () => {
  const envelope = makeEnvelope();

  it('passes when all numerics come from deterministic facts', () => {
    const text = '10 respondents completed the survey. Median satisfaction was 3.0.';
    const result = validateClaims(text, envelope);
    const classB = result.violations.filter(v => v.class === 'B');
    expect(classB).toHaveLength(0);
  });

  it('rejects fabricated numeric values', () => {
    const text = '10 respondents completed the survey. 85% reported satisfaction.';
    const result = validateClaims(text, envelope);
    const classB = result.violations.filter(v => v.class === 'B');
    expect(classB.length).toBeGreaterThanOrEqual(1);
    expect(classB.some(v => v.evidence === '85')).toBe(true);
  });

  it('ignores trivially common numbers (1-10)', () => {
    const text = 'There were 2 main patterns and 3 observations.';
    const result = validateClaims(text, envelope);
    const classB = result.violations.filter(v => v.class === 'B');
    expect(classB).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CLASS C — Qualitative grouping labels not in accepted research groupings
// ═══════════════════════════════════════════════════════════════════════

describe('Class C: Qualitative grouping label validation', () => {
  const envelope = makeEnvelope();

  it('passes when referenced grouping labels are accepted', () => {
    const text = '**Eligibility uncertainty** was the most frequent pattern.';
    const result = validateClaims(text, envelope);
    const classC = result.violations.filter(v => v.class === 'C');
    expect(classC).toHaveLength(0);
  });

  it('rejects grouping labels not in accepted research groupings', () => {
    const text = '**Session timeout** was observed in multiple responses.';
    const result = validateClaims(text, envelope);
    const classC = result.violations.filter(v => v.class === 'C');
    expect(classC.length).toBeGreaterThanOrEqual(1);
    expect(classC.some(v => v.evidence.includes('session timeout'))).toBe(true);
  });

  it('rejects governance_only grouping labels in reader-facing text', () => {
    // governance_only codes should never appear — they're not in the accepted set
    const text = '**Caregiver involvement** was noted in the responses.';
    const result = validateClaims(text, envelope);
    const classC = result.violations.filter(v => v.class === 'C');
    expect(classC.some(v => v.evidence.includes('caregiver involvement'))).toBe(true);
  });

  it('rejects no_grouping / uncodable labels', () => {
    const text = '**Repeated sign-in failure** occurred across responses.';
    const result = validateClaims(text, envelope);
    const classC = result.violations.filter(v => v.class === 'C');
    expect(classC.some(v => v.evidence.includes('repeated sign-in failure'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CLASS D — Unsupported qualitative ↔ structured association
// ═══════════════════════════════════════════════════════════════════════

describe('Class D: Unsupported association validation', () => {
  const envelope = makeEnvelope();

  it('allows descriptive comparison without implied correspondence', () => {
    const text =
      'The structured results show neutral median satisfaction and difficulty. ' +
      'Separately, accepted qualitative responses describe both smooth experiences ' +
      'and several types of friction.';
    const result = validateClaims(text, envelope);
    const classD = result.violations.filter(v => v.class === 'D');
    expect(classD).toHaveLength(0);
  });

  it('rejects "anchor the median" association', () => {
    const text = 'The smooth-experience respondents anchor the neutral median.';
    const result = validateClaims(text, envelope);
    const classD = result.violations.filter(v => v.class === 'D');
    expect(classD.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects "may explain why" association between qualitative and structured', () => {
    const text = 'Staff assistance may explain why difficulty ratings did not skew more negative.';
    const result = validateClaims(text, envelope);
    const classD = result.violations.filter(v => v.class === 'D');
    expect(classD.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects "corresponds to the distribution" language', () => {
    const text = 'The 30% straightforward group corresponds to the satisfaction distribution.';
    const result = validateClaims(text, envelope);
    const classD = result.violations.filter(v => v.class === 'D');
    expect(classD.length).toBeGreaterThanOrEqual(1);
  });

  it('allows association when deterministic cross-tab exists', () => {
    const envelopeWithCrossTab = makeEnvelope({ hasQualitativeStructuredCrossTab: true });
    const text = 'The straightforward group corresponds to the satisfaction distribution.';
    const result = validateClaims(text, envelopeWithCrossTab);
    const classD = result.violations.filter(v => v.class === 'D');
    expect(classD).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CLASS E — Prohibited causal/psychological language
// ═══════════════════════════════════════════════════════════════════════

describe('Class E: Causal and psychological language validation', () => {
  const envelope = makeEnvelope();

  it('rejects "may reflect resignation or low expectation"', () => {
    const text = 'Neutral ratings may reflect resignation or low expectation.';
    const result = validateClaims(text, envelope);
    const classE = result.violations.filter(v => v.class === 'E');
    expect(classE.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects "causes" language', () => {
    const text = 'Navigation complexity causes user abandonment.';
    const result = validateClaims(text, envelope);
    const classE = result.violations.filter(v => v.class === 'E');
    expect(classE.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects "leads to" language', () => {
    const text = 'This leads to higher dissatisfaction.';
    const result = validateClaims(text, envelope);
    const classE = result.violations.filter(v => v.class === 'E');
    expect(classE.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects "due to" language', () => {
    const text = 'The low satisfaction is due to poor interface design.';
    const result = validateClaims(text, envelope);
    const classE = result.violations.filter(v => v.class === 'E');
    expect(classE.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects "normalized the friction" psychological explanation', () => {
    const text = 'Respondents may have normalized the friction over time.';
    const result = validateClaims(text, envelope);
    const classE = result.violations.filter(v => v.class === 'E');
    expect(classE.length).toBeGreaterThanOrEqual(1);
  });

  it('allows "the available evidence does not explain" phrasing', () => {
    const text = 'The available evidence does not explain why respondents selected the neutral rating.';
    const result = validateClaims(text, envelope);
    const classE = result.violations.filter(v => v.class === 'E');
    expect(classE).toHaveLength(0);
  });

  it('allows descriptive language about patterns', () => {
    const text =
      'Three groupings emerged from the accepted coding. ' +
      'Eligibility uncertainty was the most frequent at 5 of 10 respondents.';
    const result = validateClaims(text, envelope);
    const classE = result.violations.filter(v => v.class === 'E');
    expect(classE).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// EVIDENCE ENVELOPE BUILDER
// ═══════════════════════════════════════════════════════════════════════

describe('buildEvidenceEnvelope', () => {
  it('extracts respondent IDs from qualitative coding quotes', () => {
    const data = {
      qualitative_coding: {
        recurringPatterns: [
          { label: 'Test', displayFrequency: '3 of 10', quotes: '> "quote" — R001\n>\n> "quote" — R002' },
        ],
        individualObservations: [
          { label: 'Other', displayFrequency: '1 of 10', quotes: '> "quote" — R005' },
        ],
      },
      computed_facts: { totalRespondents: 10, fieldStats: [], crossTabs: [] },
    };
    const envelope = buildEvidenceEnvelope(data);
    expect(envelope.acceptedRespondentIds.has('R001')).toBe(true);
    expect(envelope.acceptedRespondentIds.has('R002')).toBe(true);
    expect(envelope.acceptedRespondentIds.has('R005')).toBe(true);
    expect(envelope.acceptedRespondentIds.has('R099')).toBe(false);
  });

  it('extracts numeric values from computed facts', () => {
    const data = {
      qualitative_coding: null,
      computed_facts: {
        totalRespondents: 10,
        fieldStats: [
          { nPresent: 10, nMissing: 0, median: '3.0', distribution: '| 1 | 2 | 3 |\n| 20 | 30 | 50 |' },
        ],
        crossTabs: [
          { totalN: 10, cells: '| 5 | 5 |' },
        ],
      },
    };
    const envelope = buildEvidenceEnvelope(data);
    expect(envelope.acceptedNumericValues.has('10')).toBe(true);
    expect(envelope.acceptedNumericValues.has('3.0')).toBe(true);
    expect(envelope.acceptedNumericValues.has('20')).toBe(true);
    expect(envelope.acceptedNumericValues.has('30')).toBe(true);
    expect(envelope.acceptedNumericValues.has('50')).toBe(true);
  });

  it('extracts grouping labels from qualitative coding', () => {
    const data = {
      qualitative_coding: {
        recurringPatterns: [
          { label: 'Eligibility Uncertainty', displayFrequency: '5 of 10', quotes: '' },
        ],
        individualObservations: [
          { label: 'Caregiver Support', displayFrequency: '1 of 10', quotes: '' },
        ],
      },
      computed_facts: null,
    };
    const envelope = buildEvidenceEnvelope(data);
    expect(envelope.acceptedGroupingLabels.has('eligibility uncertainty')).toBe(true);
    expect(envelope.acceptedGroupingLabels.has('caregiver support')).toBe(true);
  });

  it('sets hasQualitativeStructuredCrossTab to false', () => {
    const envelope = buildEvidenceEnvelope({
      qualitative_coding: null,
      computed_facts: null,
    });
    expect(envelope.hasQualitativeStructuredCrossTab).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// EVIDENCE ENVELOPE BOUNDARY — production path
// ═══════════════════════════════════════════════════════════════════════

describe('Evidence envelope boundary (production path)', () => {
  it('technical-failure text is absent when not in accepted evidence', () => {
    const envelope = makeEnvelope();
    // Bold-formatted labels trigger grouping label check
    const text = '**Session timeout** and **repeated sign-in failure** occurred across responses.';
    const result = validateClaims(text, envelope);
    // "session timeout" and "repeated sign-in failure" are not accepted groupings
    const classC = result.violations.filter(v => v.class === 'C');
    expect(classC.length).toBeGreaterThanOrEqual(1);
  });

  it('caregiver/private-disclosure text absent unless in accepted evidence', () => {
    const envelope = makeEnvelope();
    const text = '**Caregiver involvement** was a recurring concern.';
    const result = validateClaims(text, envelope);
    const classC = result.violations.filter(v => v.class === 'C');
    expect(classC.length).toBeGreaterThanOrEqual(1);
  });

  it('accepted evidence CAN be synthesized narratively', () => {
    const envelope = makeEnvelope();
    const text =
      'The survey of 10 respondents revealed 3 qualitative groupings. ' +
      '**Eligibility uncertainty** was the most frequent. ' +
      '**Navigation complexity** was also noted. ' +
      '**Straightforward completion** described smooth experiences. ' +
      'Median satisfaction was 3.0.';
    const result = validateClaims(text, envelope);
    expect(result.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// YAML EVIDENCE BOUNDARY — open_text_content withholding
// ═══════════════════════════════════════════════════════════════════════

describe('YAML evidence_gaps task boundary', () => {
  const yamlContent = require('fs').readFileSync(
    require('path').join(__dirname, '../../../../../config/prompts/survey_synthesis.yaml'),
    'utf-8',
  );
  // Extract evidence_gaps task prompt section specifically
  const gapsMatch = yamlContent.match(/task_id:\s*"evidence_gaps"[\s\S]*?(?=\noutput_template:)/);
  const gapsSection = gapsMatch?.[0] ?? '';

  it('evidence_gaps uses accepted_qualitative_summary when available', () => {
    expect(gapsSection).toContain('accepted_qualitative_summary');
    expect(gapsSection).toContain('ONLY qualitative evidence for gap identification');
  });

  it('evidence_gaps does NOT unconditionally include open_text_content', () => {
    // open_text_content should be in elif, not the primary branch
    expect(gapsSection).toContain('{% elif open_text_content %}');
  });

  it('qualitative authority boundary rule is present in evidence_gaps', () => {
    expect(gapsSection).toContain('QUALITATIVE AUTHORITY BOUNDARY');
    expect(gapsSection).toContain('governance-only groupings');
  });

  it('governance_only entries cannot appear in evidence_gaps', () => {
    expect(gapsSection).toContain('governance-only groupings');
  });

  it('no_grouping / uncodable entries cannot appear in reader-facing AI prompt', () => {
    expect(gapsSection).toContain('no_grouping');
    expect(gapsSection).toContain('uncodable');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// RETRY GUIDANCE
// ═══════════════════════════════════════════════════════════════════════

describe('buildRetryGuidance', () => {
  it('produces structured guidance from violations', () => {
    const violations: ClaimViolation[] = [
      { class: 'A', description: 'Respondent ID "R099" not present', evidence: 'R099' },
      { class: 'D', description: 'Unsupported association', evidence: 'anchor the median' },
    ];
    const guidance = buildRetryGuidance(violations);
    expect(guidance).toContain('CLAIM VIOLATIONS');
    expect(guidance).toContain('[Class A]');
    expect(guidance).toContain('[Class D]');
    expect(guidance).toContain('R099');
    expect(guidance).toContain('anchor the median');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// INTEGRATED INTERPRETATION YAML RULES
// ═══════════════════════════════════════════════════════════════════════

describe('YAML integrated_interpretation rules', () => {
  const yaml = require('fs').readFileSync(
    require('path').join(__dirname, '../../../../../config/prompts/survey_synthesis.yaml'),
    'utf-8',
  );
  const interpretSection = yaml.split('integrated_interpretation')[1]?.split('evidence_gaps')[0] ?? '';

  it('has unsupported association rule (RULE 9)', () => {
    expect(interpretSection).toContain('RULE 9');
    expect(interpretSection).toContain('NO UNSUPPORTED ASSOCIATIONS');
  });

  it('has psychological explanation rule (RULE 10)', () => {
    expect(interpretSection).toContain('RULE 10');
    expect(interpretSection).toContain('NO UNMEASURED PSYCHOLOGICAL EXPLANATIONS');
  });

  it('prohibits "anchor the neutral median" example', () => {
    expect(interpretSection).toContain('anchor the neutral median');
  });

  it('prohibits "may explain why" example', () => {
    expect(interpretSection).toContain('may explain why');
  });

  it('prohibits "resignation or low expectation"', () => {
    expect(interpretSection).toContain('resignation or low expectation');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// EXECUTIVE SUMMARY YAML RULES
// ═══════════════════════════════════════════════════════════════════════

describe('YAML executive_summary rules', () => {
  const yaml = require('fs').readFileSync(
    require('path').join(__dirname, '../../../../../config/prompts/survey_synthesis.yaml'),
    'utf-8',
  );
  const summarySection = yaml.split('executive_summary')[1]?.split('integrated_interpretation')[0] ?? '';

  it('has unsupported association rule (RULE 7)', () => {
    expect(summarySection).toContain('RULE 7');
    expect(summarySection).toContain('NO UNSUPPORTED ASSOCIATIONS');
  });

  it('has psychological explanation rule (RULE 8)', () => {
    expect(summarySection).toContain('RULE 8');
    expect(summarySection).toContain('NO UNMEASURED PSYCHOLOGICAL EXPLANATIONS');
  });
});
