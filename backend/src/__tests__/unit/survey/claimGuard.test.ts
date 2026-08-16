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
  buildDeterministicEvidenceGaps,
  buildDeterministicInterpretation,
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
    availableCrossTabs: [
      'Completion Status × Overall Satisfaction',
      'Completion Status × Difficulty Rating',
    ],
    hasOnlyMedian: true,
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

  it('ignores dates (year numbers and date formats)', () => {
    const text = 'Analysis date: August 16, 2026. Survey completed 2026-08-16.';
    const result = validateClaims(text, envelope);
    const classB = result.violations.filter(v => v.class === 'B');
    expect(classB).toHaveLength(0);
  });

  it('ignores numbers that are part of respondent IDs', () => {
    const text = 'R001 and R002 described their experience. T003 noted difficulties.';
    const result = validateClaims(text, envelope);
    const classB = result.violations.filter(v => v.class === 'B');
    expect(classB).toHaveLength(0);
  });

  it('allows derivable percentages from accepted numerics', () => {
    // With 3 of 10, 30% is derivable
    const text = '30% of respondents reported the pattern.';
    const result = validateClaims(text, envelope);
    const classB = result.violations.filter(v => v.class === 'B');
    expect(classB).toHaveLength(0);
  });

  it('still rejects non-derivable percentages', () => {
    // 85% is not derivable from any pair of accepted numerics
    const text = '85% of respondents were highly satisfied.';
    const result = validateClaims(text, envelope);
    const classB = result.violations.filter(v => v.class === 'B');
    expect(classB.length).toBeGreaterThanOrEqual(1);
    expect(classB.some(v => v.evidence === '85')).toBe(true);
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

  it('rejects "associated with the satisfaction" language', () => {
    const text = 'Navigation complexity is associated with the satisfaction distribution.';
    const result = validateClaims(text, envelope);
    const classD = result.violations.filter(v => v.class === 'D');
    expect(classD.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects "linked to the median" language', () => {
    const text = 'The friction pattern is linked to the median rating.';
    const result = validateClaims(text, envelope);
    const classD = result.violations.filter(v => v.class === 'D');
    expect(classD.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects "predicts the difficulty" language', () => {
    const text = 'Eligibility uncertainty predicts the difficulty score.';
    const result = validateClaims(text, envelope);
    const classD = result.violations.filter(v => v.class === 'D');
    expect(classD.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects "contributes to the rating" language', () => {
    const text = 'Navigation complexity contributes to the satisfaction rating.';
    const result = validateClaims(text, envelope);
    const classD = result.violations.filter(v => v.class === 'D');
    expect(classD.length).toBeGreaterThanOrEqual(1);
  });

  it('allows simple descriptive juxtaposition', () => {
    const text =
      'Median satisfaction was 3.0. Meanwhile, the qualitative data ' +
      'identified three distinct types of friction. These two findings ' +
      'exist alongside each other in the evidence.';
    const result = validateClaims(text, envelope);
    const classD = result.violations.filter(v => v.class === 'D');
    expect(classD).toHaveLength(0);
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

  it('rejects substantive "caused abandonment" language', () => {
    const text = 'Navigation complexity caused abandonment.';
    const result = validateClaims(text, envelope);
    const classE = result.violations.filter(v => v.class === 'E');
    expect(classE.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects "led to lower satisfaction" language', () => {
    const text = 'This led to lower satisfaction across the sample.';
    const result = validateClaims(text, envelope);
    const classE = result.violations.filter(v => v.class === 'E');
    expect(classE.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects "drove dissatisfaction" language', () => {
    const text = 'Eligibility confusion drove dissatisfaction with the process.';
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

  it('rejects "suggests trust" psychological inference', () => {
    const text = 'The pattern suggests respondent distrust of the system.';
    const result = validateClaims(text, envelope);
    const classE = result.violations.filter(v => v.class === 'E');
    expect(classE.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects "respondents frustrated" psychological inference', () => {
    const text = 'Respondents were clearly frustrated by the process.';
    const result = validateClaims(text, envelope);
    const classE = result.violations.filter(v => v.class === 'E');
    expect(classE.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects "may reflect confidence" psychological inference', () => {
    const text = 'The ratings may reflect low confidence in the system.';
    const result = validateClaims(text, envelope);
    const classE = result.violations.filter(v => v.class === 'E');
    expect(classE.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects "indicates motivation" psychological inference', () => {
    const text = 'This indicates low motivation among the sample.';
    const result = validateClaims(text, envelope);
    const classE = result.violations.filter(v => v.class === 'E');
    expect(classE.length).toBeGreaterThanOrEqual(1);
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
// FALLBACK TEXT QUALITY
// ═══════════════════════════════════════════════════════════════════════

describe('Fallback text quality', () => {
  // These match the handler's FALLBACK_TEXT values
  const fallbacks = [
    'The executive summary is not available for this run. The structured evidence and accepted qualitative findings in this report provide the available results.',
    'The integrated interpretation is not available for this run. Review the structured evidence and accepted qualitative groupings in this report to assess convergence and divergence.',
  ];

  for (const fb of fallbacks) {
    it(`fallback does not contain debug/engineering text: "${fb.slice(0, 40)}..."`, () => {
      expect(fb).not.toContain('generation failed');
      expect(fb).not.toContain('error');
      expect(fb).not.toContain('could not be generated');
      expect(fb).not.toContain('claim guard');
      expect(fb).not.toContain('validation');
      expect(fb).not.toContain('retry');
      expect(fb.trim().length).toBeGreaterThan(20);
    });
  }
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

  it('has skew-from-median rule (RULE 9)', () => {
    expect(summarySection).toContain('RULE 9');
    expect(summarySection).toContain('NO SKEW FROM MEDIAN');
  });

  it('has false absence claims rule (RULE 10)', () => {
    expect(summarySection).toContain('RULE 10');
    expect(summarySection).toContain('NO FALSE ABSENCE CLAIMS');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CLASS F — False absence claims about supplied evidence
// ═══════════════════════════════════════════════════════════════════════

describe('Class F: False absence claims (capability-flag validated)', () => {
  const envelope = makeEnvelope();

  it('rejects claim that Completion × Satisfaction cross-tab is missing when it exists', () => {
    const text = 'No Completion Status × Overall Satisfaction cross-tab exists.';
    const result = validateClaims(text, envelope);
    const classF = result.violations.filter(v => v.class === 'F');
    expect(classF.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects blanket "do not supply cell-level" when cell-level cross-tabs exist', () => {
    const text = 'The cross-tabulations do not supply deterministic cell-level values.';
    const result = validateClaims(text, envelope);
    const classF = result.violations.filter(v => v.class === 'F');
    expect(classF.length).toBeGreaterThanOrEqual(1);
  });

  it('allows true absence: "no qualitative × structured cross-tab" when flag confirms', () => {
    const text = 'No deterministic cross-tab links accepted qualitative groupings to completion status.';
    const result = validateClaims(text, envelope);
    const classF = result.violations.filter(v => v.class === 'F');
    expect(classF).toHaveLength(0);
  });

  it('allows "the evidence cannot establish respondent-level correspondence"', () => {
    const text = 'The evidence cannot establish respondent-level correspondence between groupings and outcomes.';
    const result = validateClaims(text, envelope);
    const classF = result.violations.filter(v => v.class === 'F');
    expect(classF).toHaveLength(0);
  });

  it('does not fire when no cross-tabs are available', () => {
    const emptyEnvelope = makeEnvelope({ availableCrossTabs: [] });
    const text = 'No cross-tab is available for this analysis.';
    const result = validateClaims(text, emptyEnvelope);
    const classF = result.violations.filter(v => v.class === 'F');
    expect(classF).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CLASS G — Skew/balance from median only
// ═══════════════════════════════════════════════════════════════════════

describe('Class G: Skew from median only', () => {
  const envelope = makeEnvelope();

  it('rejects "no skew" language', () => {
    const text = 'The distribution shows no skew toward either pole.';
    const result = validateClaims(text, envelope);
    const classG = result.violations.filter(v => v.class === 'G');
    expect(classG.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects "balanced distribution" language', () => {
    const text = 'Responses show a balanced distribution across categories.';
    const result = validateClaims(text, envelope);
    const classG = result.violations.filter(v => v.class === 'G');
    expect(classG.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects "evenly distributed" language', () => {
    const text = 'Satisfaction ratings were evenly distributed.';
    const result = validateClaims(text, envelope);
    const classG = result.violations.filter(v => v.class === 'G');
    expect(classG.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects "symmetric distribution" language', () => {
    const text = 'The responses show a symmetric distribution around the median.';
    const result = validateClaims(text, envelope);
    const classG = result.violations.filter(v => v.class === 'G');
    expect(classG.length).toBeGreaterThanOrEqual(1);
  });

  it('allows stating median value without skew claims', () => {
    const text = 'Median satisfaction and difficulty were both Neutral.';
    const result = validateClaims(text, envelope);
    const classG = result.violations.filter(v => v.class === 'G');
    expect(classG).toHaveLength(0);
  });

  it('allows describing distributions using deterministic counts', () => {
    const text = 'Of 10 respondents, 3 rated satisfaction as Positive, 5 as Neutral, and 2 as Negative.';
    const result = validateClaims(text, envelope);
    const classG = result.violations.filter(v => v.class === 'G');
    expect(classG).toHaveLength(0);
  });

  it('does not fire when hasOnlyMedian is false', () => {
    const envelopeWithSkew = makeEnvelope({ hasOnlyMedian: false });
    const text = 'The distribution shows no skew toward either pole.';
    const result = validateClaims(text, envelopeWithSkew);
    const classG = result.violations.filter(v => v.class === 'G');
    expect(classG).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// DETERMINISTIC EVIDENCE-GAPS FALLBACK
// ═══════════════════════════════════════════════════════════════════════

describe('Deterministic evidence-gaps fallback', () => {
  it('renders useful gaps when structural limitations are known', () => {
    const data = {
      has_accepted_coding: true,
      structured_evidence_capabilities: {
        has_qualitative_structured_cross_tabs: false,
        available_cross_tabs: ['Completion Status × Overall Satisfaction'],
        sample_size: 10,
        has_population_representativeness: false,
        has_process_sequence_data: false,
      },
    };
    const result = buildDeterministicEvidenceGaps(data);
    expect(result).toContain('Gap 1');
    expect(result).toContain('Gap 2');
    expect(result).toContain('Gap 3');
    expect(result).toContain('qualitative groupings');
    expect(result).toContain('10 respondents');
    expect(result).toContain('process sequence');
  });

  it('fallback contains no raw qualitative evidence', () => {
    const data = {
      has_accepted_coding: true,
      structured_evidence_capabilities: {
        has_qualitative_structured_cross_tabs: false,
        available_cross_tabs: [],
        sample_size: 10,
        has_population_representativeness: false,
        has_process_sequence_data: false,
      },
    };
    const result = buildDeterministicEvidenceGaps(data);
    // Must not contain raw qualitative content
    expect(result).not.toContain('session timeout');
    expect(result).not.toContain('sign-in failure');
    expect(result).not.toContain('caregiver');
    expect(result).not.toContain('R001');
    expect(result).not.toContain('R002');
  });

  it('fallback includes proper markdown formatting', () => {
    const data = {
      has_accepted_coding: true,
      structured_evidence_capabilities: {
        has_qualitative_structured_cross_tabs: false,
        available_cross_tabs: [],
        sample_size: 10,
        has_population_representativeness: false,
        has_process_sequence_data: false,
      },
    };
    const result = buildDeterministicEvidenceGaps(data);
    expect(result).toContain('### Gap');
    expect(result).toContain('| What this source establishes');
    expect(result).toContain('> [!TIP]');
    expect(result).toContain('Suggested research approach');
  });

  it('skips qualitative cross-tab gap when qualitative cross-tabs exist', () => {
    const data = {
      has_accepted_coding: true,
      structured_evidence_capabilities: {
        has_qualitative_structured_cross_tabs: true,
        available_cross_tabs: [],
        sample_size: 10,
        has_population_representativeness: false,
        has_process_sequence_data: false,
      },
    };
    const result = buildDeterministicEvidenceGaps(data);
    // Gap 1 (qualitative ↔ structured cross-tab) should be absent
    expect(result).not.toContain('linked to structured outcomes');
    expect(result).not.toContain('No deterministic cross-tab links qualitative groupings');
  });

  it('skips population gap when representativeness is available', () => {
    const data = {
      has_accepted_coding: true,
      structured_evidence_capabilities: {
        has_qualitative_structured_cross_tabs: false,
        available_cross_tabs: [],
        sample_size: 10,
        has_population_representativeness: true,
        has_process_sequence_data: false,
      },
    };
    const result = buildDeterministicEvidenceGaps(data);
    expect(result).not.toContain('generalized');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// EXTRACTION ORDERING INVARIANT
// ═══════════════════════════════════════════════════════════════════════

describe('Extraction ordering invariant', () => {
  it('claim guard runs inside executeAiGenerationTasks, before aiResponses is returned', () => {
    // This is a structural test: the claim guard validation runs per-task
    // inside executeAiGenerationTasks (langchain.ts:217-240). The aiResponses
    // dictionary only contains validated or fallback text. extractVariables
    // runs on outputTemplate which is built from aiResponses.
    //
    // Verify by reading the langchain.ts source:
    const langchain = require('fs').readFileSync(
      require('path').join(__dirname, '../../../helpers/langchain.ts'),
      'utf-8',
    );

    // 1. postValidation check happens BEFORE the task result is returned
    const validateIdx = langchain.indexOf('postValidation?.taskIds.has(task.task_id)');
    const returnIdx = langchain.indexOf('return { taskId: task.task_id, response: responseText }');
    expect(validateIdx).toBeGreaterThan(-1);
    expect(returnIdx).toBeGreaterThan(-1);
    expect(validateIdx).toBeLessThan(returnIdx);
  });

  it('rejected first-pass output is replaced, not appended', () => {
    // Verify that responseText is reassigned, not concatenated
    const langchain = require('fs').readFileSync(
      require('path').join(__dirname, '../../../helpers/langchain.ts'),
      'utf-8',
    );
    // On successful retry: responseText = retryText
    expect(langchain).toContain('responseText = retryText');
    // On failed retry: responseText = fallbackText
    expect(langchain).toContain('responseText = postValidation.fallbackText(task.task_id)');
  });

  it('extractVariables runs on outputTemplate (post-validation), not raw AI response', () => {
    const yamlProcessor = require('fs').readFileSync(
      require('path').join(__dirname, '../../../helpers/yamlProcessor.ts'),
      'utf-8',
    );
    // extractVariables receives outputTemplate, which is built from aiResponses
    expect(yamlProcessor).toContain('extractVariables(\n        outputTemplate,');
    // aiResponses is populated from executeAiGenerationTasks (which runs claim guard)
    expect(yamlProcessor).toContain('aiResponses = await executeAiGenerationTasks');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PRODUCTION FALSE-POSITIVE REGRESSION TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('Production false-positive regression', () => {
  const envelope = makeEnvelope();

  // These MUST PASS (no violations):

  it('PASS: "The small respondent count limits the confidence of broader inference."', () => {
    const text = 'The small respondent count limits the confidence of broader inference.';
    const result = validateClaims(text, envelope);
    expect(result.valid).toBe(true);
  });

  it('PASS: "The sample size limits generalizability."', () => {
    const text = 'The sample size limits generalizability.';
    const result = validateClaims(text, envelope);
    expect(result.valid).toBe(true);
  });

  it('PASS: "No deterministic cross-tab links accepted qualitative groupings to completion status."', () => {
    const text = 'No deterministic cross-tab links accepted qualitative groupings to completion status.';
    const result = validateClaims(text, envelope);
    const classF = result.violations.filter(v => v.class === 'F');
    expect(classF).toHaveLength(0);
  });

  it('PASS: "Suggested research approach:" (document structure, not grouping)', () => {
    const text = '> [!TIP]\n> **Suggested research approach:** Conduct follow-up interviews.';
    const result = validateClaims(text, envelope);
    const classC = result.violations.filter(v => v.class === 'C');
    expect(classC).toHaveLength(0);
  });

  it('PASS: "The evidence cannot establish respondent-level correspondence."', () => {
    const text = 'The evidence cannot establish respondent-level correspondence.';
    const result = validateClaims(text, envelope);
    expect(result.valid).toBe(true);
  });

  it('PASS: "design prevents causal inference"', () => {
    const text = 'The cross-sectional design prevents causal inference.';
    const result = validateClaims(text, envelope);
    const classE = result.violations.filter(v => v.class === 'E');
    expect(classE).toHaveLength(0);
  });

  it('PASS: "data do not establish" (limitation, not causal)', () => {
    const text = 'These data do not establish whether the pattern is widespread.';
    const result = validateClaims(text, envelope);
    const classE = result.violations.filter(v => v.class === 'E');
    expect(classE).toHaveLength(0);
  });

  it('PASS: "cannot determine" (limitation, not causal)', () => {
    const text = 'The survey cannot determine whether friction caused non-completion.';
    const result = validateClaims(text, envelope);
    const classE = result.violations.filter(v => v.class === 'E');
    expect(classE).toHaveLength(0);
  });

  // These MUST FAIL (violations expected):

  it('FAIL: "Eligibility uncertainty caused abandonment."', () => {
    const text = 'Eligibility uncertainty caused abandonment.';
    const result = validateClaims(text, envelope);
    const classE = result.violations.filter(v => v.class === 'E');
    expect(classE.length).toBeGreaterThanOrEqual(1);
  });

  it('FAIL: "Staff assistance resulted in completion."', () => {
    const text = 'Staff assistance resulted in completion.';
    const result = validateClaims(text, envelope);
    const classE = result.violations.filter(v => v.class === 'E');
    expect(classE.length).toBeGreaterThanOrEqual(1);
  });

  it('FAIL: "The straightforward group corresponded to higher satisfaction."', () => {
    const text = 'The straightforward group corresponded to higher satisfaction.';
    const result = validateClaims(text, envelope);
    const classD = result.violations.filter(v => v.class === 'D');
    expect(classD.length).toBeGreaterThanOrEqual(1);
  });

  it('FAIL: claim Completion × Satisfaction cross-tab missing when flag says it exists', () => {
    const text = 'No Completion Status × Overall Satisfaction cross-tab is available.';
    const result = validateClaims(text, envelope);
    const classF = result.violations.filter(v => v.class === 'F');
    expect(classF.length).toBeGreaterThanOrEqual(1);
  });

  it('FAIL: unknown qualitative grouping introduced as accepted evidence', () => {
    const text = '**Session timeout** was the most common barrier to completion.';
    const result = validateClaims(text, envelope);
    const classC = result.violations.filter(v => v.class === 'C');
    expect(classC.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// FALLBACK COPY REGRESSION
// ═══════════════════════════════════════════════════════════════════════

describe('Fallback copy quality (v10.2.1)', () => {
  const fallbacks = [
    'The executive summary is not available for this run. The structured evidence and accepted qualitative findings in this report provide the available results.',
    'The integrated interpretation is not available for this run. Review the structured evidence and accepted qualitative groupings in this report to assess convergence and divergence.',
  ];

  for (const fb of fallbacks) {
    it(`no directional wording: "${fb.slice(0, 40)}..."`, () => {
      expect(fb).not.toContain('above');
      expect(fb).not.toContain('below');
      expect(fb).not.toContain('sections above');
      expect(fb).not.toContain('sections below');
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// DETERMINISTIC INTERPRETATION FALLBACK
// ═══════════════════════════════════════════════════════════════════════

describe('Deterministic interpretation fallback', () => {
  const data = {
    has_accepted_coding: true,
    computed_facts: {
      totalRespondents: 10,
      fieldStats: [
        { displayName: 'Overall Satisfaction', role: 'ordinal', median: 'Neutral', nPresent: 10 },
        { displayName: 'Difficulty Rating', role: 'ordinal', median: 'Neutral', nPresent: 10 },
      ],
      crossTabs: [
        { rowDisplayName: 'Completion Status', colDisplayName: 'Overall Satisfaction', totalN: 10 },
        { rowDisplayName: 'Completion Status', colDisplayName: 'Difficulty Rating', totalN: 10 },
      ],
    },
    qualitative_coding: {
      recurringPatterns: [
        { label: 'Eligibility Uncertainty', displayFrequency: '3 of 8 respondents' },
        { label: 'Navigation Complexity', displayFrequency: '2 of 8 respondents' },
      ],
      individualObservations: [
        { label: 'Callback Delay', displayFrequency: '1 of 8 respondents' },
      ],
    },
    structured_evidence_capabilities: {
      has_qualitative_structured_cross_tabs: false,
      available_cross_tabs: ['Completion Status × Overall Satisfaction'],
      sample_size: 10,
      has_population_representativeness: false,
    },
  };

  it('produces useful research synthesis', () => {
    const result = buildDeterministicInterpretation(data);
    // Contains structured evidence
    expect(result).toContain('Overall Satisfaction');
    expect(result).toContain('Difficulty Rating');
    expect(result).toContain('Neutral');
    expect(result).toContain('10 respondents');
  });

  it('does NOT contain "not available for this run"', () => {
    const result = buildDeterministicInterpretation(data);
    expect(result).not.toContain('not available for this run');
    expect(result).not.toContain('not available');
  });

  it('uses accepted grouping labels', () => {
    const result = buildDeterministicInterpretation(data);
    expect(result).toContain('eligibility uncertainty');
    expect(result).toContain('navigation complexity');
    expect(result).toContain('callback delay');
  });

  it('never claims qualitative ↔ structured association without linkage', () => {
    const result = buildDeterministicInterpretation(data);
    expect(result).not.toMatch(/correspond/i);
    expect(result).not.toMatch(/anchor/i);
    expect(result).not.toMatch(/explain\w*\s+(?:why|the)/i);
    expect(result).toContain('should not be treated as respondent-level associations');
    expect(result).toContain('No deterministic cross-tab links');
  });

  it('contains respondent/sample limitation', () => {
    const result = buildDeterministicInterpretation(data);
    expect(result).toContain('10 respondents');
    expect(result).toContain('descriptive and hypothesis-generating');
  });

  it('is deterministic for identical accepted state', () => {
    const result1 = buildDeterministicInterpretation(data);
    const result2 = buildDeterministicInterpretation(data);
    expect(result1).toBe(result2);
  });

  it('includes grouping counts from displayFrequency', () => {
    const result = buildDeterministicInterpretation(data);
    expect(result).toContain('3 of 8 respondents');
    expect(result).toContain('1 of 8 respondents');
  });

  it('mentions available cross-tabulations', () => {
    const result = buildDeterministicInterpretation(data);
    expect(result).toContain('Completion Status × Overall Satisfaction');
  });

  it('does not contain raw qualitative text', () => {
    const result = buildDeterministicInterpretation(data);
    expect(result).not.toContain('session timeout');
    expect(result).not.toContain('sign-in failure');
    expect(result).not.toContain('caregiver');
    expect(result).not.toMatch(/\bR\d{3}\b/); // No respondent IDs
  });

  it('handles minimal data gracefully', () => {
    const minimalData = {
      has_accepted_coding: true,
      computed_facts: null,
      qualitative_coding: null,
      structured_evidence_capabilities: null,
    };
    const result = buildDeterministicInterpretation(minimalData);
    expect(result.length).toBeGreaterThan(10);
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('null');
  });
});
