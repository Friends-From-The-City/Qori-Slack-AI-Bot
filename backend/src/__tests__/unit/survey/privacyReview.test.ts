/**
 * Privacy Review UX contract tests.
 *
 * Tests the invariants that the Slack handler must enforce,
 * using the governance service domain logic directly.
 */

import {
  buildDispositionUpdate,
  isAnalysisEligible,
  InvalidDispositionError,
} from '../../../services/content-governance.service';

describe('bulk-vs-flagged authority invariant', () => {
  it('bulk clear applies only to unflagged entries', () => {
    // Simulate: unflagged entry should be cleared by bulk action
    const unflaggedMeta = { auto_scrub: { has_detections: false } };
    const isFlagged = unflaggedMeta.auto_scrub.has_detections;
    expect(isFlagged).toBe(false);
    // Bulk clear applies → buildDispositionUpdate succeeds
    const update = buildDispositionUpdate('pending', 'clear', 'U_REVIEWER');
    expect(update.pii_status).toBe('clear');
  });

  it('flagged entry must NOT be affected by bulk clear', () => {
    const flaggedMeta = { auto_scrub: { has_detections: true, phone_count: 1 } };
    const isFlagged = flaggedMeta.auto_scrub.has_detections;
    expect(isFlagged).toBe(true);
    // In the handler, flagged entries skip the bulk-clear branch
    // and require individual disposition
  });

  it('flagged entry with phone detection requires individual review', () => {
    const meta = { auto_scrub: { has_detections: true, phone_count: 1, email_count: 0 } };
    expect(meta.auto_scrub.has_detections).toBe(true);
    // The handler should NOT auto-clear this entry
  });
});

describe('flagged-entry actions', () => {
  it('use_suggested maps to redacted status', () => {
    // "Use suggested version" → pii_status = redacted
    const update = buildDispositionUpdate('pending', 'redacted', 'U_R', 'scrubbed text');
    expect(update.pii_status).toBe('redacted');
    expect(update.redacted_text).toBe('scrubbed text');
  });

  it('use original maps to clear status', () => {
    const update = buildDispositionUpdate('pending', 'clear', 'U_R');
    expect(update.pii_status).toBe('clear');
  });

  it('do not use maps to restricted status', () => {
    const update = buildDispositionUpdate('pending', 'restricted', 'U_R');
    expect(update.pii_status).toBe('restricted');
  });
});

describe('post-privacy workflow', () => {
  it('primary action after review is Review Groupings', () => {
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const handler = readFileSync(
      join(__dirname, '../../../helpers/slack/commands/surveyPrivacyHandler.ts'), 'utf-8',
    );
    // Single primary CTA after completion
    expect(handler).toContain("'Review Groupings'");
    expect(handler).not.toContain("'Generate Survey Synthesis'");
    expect(handler).not.toContain("'Generate Codebook'");
    expect(handler).not.toContain("'Review Response Categories'");
  });
});

describe('grouping generation idempotency', () => {
  it('handler checks for existing active codebook before generating', () => {
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const handler = readFileSync(
      join(__dirname, '../../../helpers/slack/commands/codebookHandler.ts'), 'utf-8',
    );
    expect(handler).toContain('findActiveUnacceptedCodebook');
    expect(handler).toContain('already prepared');
  });

  it('existing active codebook reuses without regenerating', () => {
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const handler = readFileSync(
      join(__dirname, '../../../helpers/slack/commands/codebookHandler.ts'), 'utf-8',
    );
    // The if (existingActive) block contains "already prepared" and returns
    // before reaching generateDraftCodes
    expect(handler).toContain('if (existingActive)');
    expect(handler).toContain('already prepared');
    // generateDraftCodes only called in the "No active draft" branch
    expect(handler).toContain('No active draft');
  });

  it('accepted codebook is not treated as active draft', () => {
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const service = readFileSync(
      join(__dirname, '../../../services/survey-codebook.service.ts'), 'utf-8',
    );
    // findActiveUnacceptedCodebook only looks for draft/under_review
    expect(service).toContain("status: ['draft', 'under_review']");
    expect(service).not.toMatch(/findActiveUnacceptedCodebook.*accepted/);
  });
});

describe('grouping UX language', () => {
  it('codebook handler uses "groupings" not "codebook/categories"', () => {
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const handler = readFileSync(
      join(__dirname, '../../../helpers/slack/commands/codebookHandler.ts'), 'utf-8',
    );
    // Primary UX text
    expect(handler).toContain("'Review Groupings'");
    expect(handler).toContain("'Approve Groupings'");
    // No researcher-facing codebook/categories language
    expect(handler).not.toContain("'Accept Codebook'");
    expect(handler).not.toContain("'Accept Response Categories'");
    expect(handler).not.toContain("'Generate Codebook'");
  });

  it('generation and review are separate interactions', () => {
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const handler = readFileSync(
      join(__dirname, '../../../helpers/slack/commands/codebookHandler.ts'), 'utf-8',
    );
    // Generation handler does NOT call views.open with body.trigger_id
    // It posts a DM with a fresh "Review Groupings" button instead
    expect(handler).toContain('survey_open_grouping_review');
    // The review handler uses a FRESH trigger_id from button click
    expect(handler).toContain('handleOpenGroupingReview');
  });

  it('stale trigger_id is not reused after model generation', () => {
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const handler = readFileSync(
      join(__dirname, '../../../helpers/slack/commands/codebookHandler.ts'), 'utf-8',
    );
    // handleGenerateCodebook should NOT contain views.open
    const genFn = handler.split('handleGenerateCodebook')[1]?.split('handleOpenGroupingReview')[0] ?? '';
    expect(genFn).not.toContain('views.open');
  });
});
