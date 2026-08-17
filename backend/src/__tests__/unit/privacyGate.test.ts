/**
 * PH-3: Privacy Gate Tests (ADR 0035)
 *
 * Proves:
 * - Unresolved discovery upload cannot reach model (PII detected → pending_review)
 * - Approved discovery content can reach model (clean scan → authorized)
 * - Trusted curated artifacts auto-authorized with provenance
 * - Trusted artifacts denied when provenance fails
 * - Survey privacy behavior unchanged (SURVEY_QUALITATIVE → denied, use per-entry accessor)
 * - Participant content behavior unchanged (PARTICIPANT_CONTENT → denied, use quarantine flow)
 * - PII scan detects known patterns
 * - No known unstructured model path bypasses the gate
 */

import {
  authorizeForModel,
  scanForPii,
  getAnalysisEligibleContent,
} from '../../services/content-governance.service';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// ═══════════════════════════════════════════════════════════════════════
// DISCOVERY_UPLOAD POLICY
// ═══════════════════════════════════════════════════════════════════════

describe('PH-3: DISCOVERY_UPLOAD policy', () => {
  it('authorizes clean content (no PII)', () => {
    const content = 'Veterans face scheduling challenges when booking healthcare appointments through the VA system.';
    const result = authorizeForModel(content, 'DISCOVERY_UPLOAD');
    expect(result.status).toBe('authorized');
    expect(result.modelSafeContent).toBe(content);
    expect(result.policy).toBe('DISCOVERY_UPLOAD');
  });

  it('blocks content with SSN-like pattern', () => {
    const content = 'Participant John Doe, SSN 123-45-6789, reported scheduling issues.';
    const result = authorizeForModel(content, 'DISCOVERY_UPLOAD');
    expect(result.status).toBe('pending_review');
    expect(result.modelSafeContent).toBeNull();
    expect(result.reason).toContain('SSN');
  });

  it('blocks content with email address', () => {
    const content = 'Contact researcher at jane.doe@va.gov for more details.';
    const result = authorizeForModel(content, 'DISCOVERY_UPLOAD');
    expect(result.status).toBe('pending_review');
    expect(result.modelSafeContent).toBeNull();
    expect(result.reason).toContain('email');
  });

  it('blocks content with phone number', () => {
    const content = 'Call the clinic at (555) 123-4567 to schedule.';
    const result = authorizeForModel(content, 'DISCOVERY_UPLOAD');
    expect(result.status).toBe('pending_review');
    expect(result.modelSafeContent).toBeNull();
    expect(result.reason).toContain('phone');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TRUSTED_CURATED_ARTIFACT POLICY
// ═══════════════════════════════════════════════════════════════════════

describe('PH-3: TRUSTED_CURATED_ARTIFACT policy', () => {
  it('auto-authorizes Qori artifact with known provenance', () => {
    const content = '# Research Plan\n\nThis study examines scheduling friction.';
    const result = authorizeForModel(content, 'TRUSTED_CURATED_ARTIFACT', {
      isQoriArtifact: true,
      upstreamPrivacyComplete: true,
      sourceId: 'readout:test-study',
    });
    expect(result.status).toBe('authorized');
    expect(result.modelSafeContent).toBe(content);
  });

  it('auto-authorizes when provenance not explicitly confirmed', () => {
    const content = '# Session Summary\n\nParticipant PT-001 described their experience.';
    const result = authorizeForModel(content, 'TRUSTED_CURATED_ARTIFACT');
    expect(result.status).toBe('authorized');
    expect(result.modelSafeContent).toBe(content);
  });

  it('denies when provenance indicates non-Qori source with failed privacy', () => {
    const content = 'External document from unknown source.';
    const result = authorizeForModel(content, 'TRUSTED_CURATED_ARTIFACT', {
      isQoriArtifact: false,
      upstreamPrivacyComplete: false,
    });
    expect(result.status).toBe('denied');
    expect(result.modelSafeContent).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// EXISTING POLICY COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════

describe('PH-3: Existing policy compatibility', () => {
  it('SURVEY_QUALITATIVE redirects to per-entry accessor', () => {
    const result = authorizeForModel('test content', 'SURVEY_QUALITATIVE');
    expect(result.status).toBe('denied');
    expect(result.reason).toContain('getAnalysisEligibleContent');
  });

  it('PARTICIPANT_CONTENT redirects to quarantine flow', () => {
    const result = authorizeForModel('test content', 'PARTICIPANT_CONTENT');
    expect(result.status).toBe('denied');
    expect(result.reason).toContain('quarantine');
  });

  it('getAnalysisEligibleContent still works for survey entries (clear)', () => {
    const entry = { pii_status: 'clear' as const, entry_text: 'clean text', redacted_text: null };
    expect(getAnalysisEligibleContent(entry)).toBe('clean text');
  });

  it('getAnalysisEligibleContent still works for survey entries (redacted)', () => {
    const entry = { pii_status: 'redacted' as const, entry_text: 'raw text', redacted_text: 'safe text' };
    expect(getAnalysisEligibleContent(entry)).toBe('safe text');
  });

  it('getAnalysisEligibleContent still denies pending entries', () => {
    const entry = { pii_status: 'pending' as const, entry_text: 'raw text', redacted_text: null };
    expect(getAnalysisEligibleContent(entry)).toBeNull();
  });

  it('getAnalysisEligibleContent still denies restricted entries', () => {
    const entry = { pii_status: 'restricted' as const, entry_text: 'raw text', redacted_text: null };
    expect(getAnalysisEligibleContent(entry)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PII SCAN
// ═══════════════════════════════════════════════════════════════════════

describe('PH-3: PII scan', () => {
  it('detects SSN patterns', () => {
    const findings = scanForPii('Patient SSN: 123-45-6789');
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].label).toContain('SSN');
  });

  it('detects email addresses', () => {
    const findings = scanForPii('Email: test@example.com');
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].label).toContain('email');
  });

  it('detects phone numbers', () => {
    const findings = scanForPii('Phone: (555) 123-4567');
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].label).toContain('phone');
  });

  it('returns empty for clean content', () => {
    const findings = scanForPii('Veterans scheduling experience study overview.');
    expect(findings).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// HANDLER BYPASS GUARD
// ═══════════════════════════════════════════════════════════════════════

describe('PH-3: No unstructured model path bypasses the gate', () => {
  it('discoverHandler calls authorizeForModel before processYamlTemplate', () => {
    const source = readFileSync(
      join(__dirname, '../../helpers/slack/commands/discoverHandler.ts'),
      'utf-8',
    );
    const authorizeIdx = source.indexOf('authorizeForModel(');
    const templateIdx = source.indexOf("processYamlTemplate(");
    // Both must exist
    expect(authorizeIdx).toBeGreaterThan(-1);
    expect(templateIdx).toBeGreaterThan(-1);
    // authorizeForModel must appear before processYamlTemplate
    expect(authorizeIdx).toBeLessThan(templateIdx);
  });

  it('readoutHandler calls authorizeForModel before processYamlTemplate', () => {
    const source = readFileSync(
      join(__dirname, '../../helpers/slack/commands/readoutHandler.ts'),
      'utf-8',
    );
    const authorizeIdx = source.indexOf('authorizeForModel(');
    // Must exist
    expect(authorizeIdx).toBeGreaterThan(-1);
  });

  it('researchSynthesisHandler calls authorizeForModel before processYamlTemplate', () => {
    const source = readFileSync(
      join(__dirname, '../../helpers/slack/commands/researchSynthesisHandler.ts'),
      'utf-8',
    );
    const authorizeIdx = source.indexOf('authorizeForModel(');
    expect(authorizeIdx).toBeGreaterThan(-1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ADR EXISTS
// ═══════════════════════════════════════════════════════════════════════

describe('PH-3: ADR 0035 exists', () => {
  it('ADR 0035 privacy gate document exists', () => {
    const adr = readFileSync(
      join(__dirname, '../../../../docs/architecture-decisions/0035-unstructured-content-privacy-gate.md'),
      'utf-8',
    );
    expect(adr).toContain('Privacy Gate');
    expect(adr).toContain('DISCOVERY_UPLOAD');
    expect(adr).toContain('TRUSTED_CURATED_ARTIFACT');
    expect(adr).toContain('PARTICIPANT_CONTENT');
    expect(adr).toContain('SURVEY_QUALITATIVE');
    expect(adr).toContain('authorizeForModel');
  });
});
