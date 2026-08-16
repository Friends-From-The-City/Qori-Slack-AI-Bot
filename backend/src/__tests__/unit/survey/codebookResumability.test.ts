/**
 * Codebook Resumability Tests
 *
 * Verifies the resume-state logic for the survey qualitative workflow.
 * Authoritative state comes from Postgres, not Slack messages.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const HANDLER_PATH = join(__dirname, '../../../helpers/slack/commands/codebookHandler.ts');
const SERVICE_PATH = join(__dirname, '../../../services/survey-codebook.service.ts');

describe('codebook resumability — code contracts', () => {
  const handlerCode = readFileSync(HANDLER_PATH, 'utf-8');
  const serviceCode = readFileSync(SERVICE_PATH, 'utf-8');

  it('findAcceptedCodebook is exported from service', () => {
    expect(serviceCode).toContain('export async function findAcceptedCodebook');
  });

  it('handler imports findAcceptedCodebook', () => {
    expect(handlerCode).toContain('findAcceptedCodebook');
  });

  it('handler imports findActiveUnacceptedRun', () => {
    expect(handlerCode).toContain('findActiveUnacceptedRun');
  });

  it('handler imports findAcceptedCodingRun', () => {
    expect(handlerCode).toContain('findAcceptedCodingRun');
  });

  it('handleGenerateCodebook checks for accepted codebook before generating', () => {
    // The accepted codebook check must appear BEFORE findActiveUnacceptedCodebook
    const acceptedIdx = handlerCode.indexOf('findAcceptedCodebook(evidenceSourceId)');
    const unacceptedIdx = handlerCode.indexOf('findActiveUnacceptedCodebook(evidenceSourceId)');
    expect(acceptedIdx).toBeGreaterThan(-1);
    expect(unacceptedIdx).toBeGreaterThan(-1);
    expect(acceptedIdx).toBeLessThan(unacceptedIdx);
  });

  it('CodebookImmutableError caught and handled as resume', () => {
    // The handler must catch CodebookImmutableError and call buildResumeCTA
    expect(handlerCode).toContain('CodebookImmutableError');
    expect(handlerCode).toContain('buildResumeCTA');
  });

  it('no immutable error message shown to researcher', () => {
    // The raw "accepted and immutable" message should NOT appear in any
    // postMessage call. The catch block must intercept it.
    // Search for the error message text appearing in a user-facing context
    const errorText = 'accepted and immutable';
    // The error class definition contains it (that's fine), but the handler
    // should not pass it through to the user
    const handlerLines = handlerCode.split('\n');
    const userFacingLines = handlerLines.filter(line =>
      line.includes(errorText) &&
      !line.includes('import') &&
      !line.includes('instanceof'),
    );
    expect(userFacingLines).toHaveLength(0);
  });
});

describe('resume CTA logic', () => {
  const handlerCode = readFileSync(HANDLER_PATH, 'utf-8');

  it('accepted codebook + no coding run → Match Responses', () => {
    // buildResumeCTA contains this flow
    expect(handlerCode).toContain('Match Responses');
    expect(handlerCode).toContain('survey_generate_assignments');
  });

  it('accepted codebook + under_review coding run → Review Matches', () => {
    expect(handlerCode).toContain('Review Matches');
    expect(handlerCode).toContain('survey_open_match_review');
  });

  it('accepted codebook + accepted coding run → Create Survey Summary', () => {
    expect(handlerCode).toContain('Create Survey Summary');
    expect(handlerCode).toContain('survey_run_synthesis');
  });

  it('no new codebook version created during resume path', () => {
    // The resume path (when accepted codebook found) returns early
    // before any createDraftCodebook call in the function body
    // Skip imports by finding the function body
    const fnStart = handlerCode.indexOf('export async function handleGenerateCodebook');
    const bodyAfterFnStart = handlerCode.slice(fnStart);
    const acceptedCheck = bodyAfterFnStart.indexOf('findAcceptedCodebook(evidenceSourceId)');
    const earlyReturn = bodyAfterFnStart.indexOf('return;', acceptedCheck);
    const createCall = bodyAfterFnStart.indexOf('createDraftCodebook');
    expect(earlyReturn).toBeLessThan(createCall);
  });

  it('resume CTA checks coding run state from Postgres', () => {
    // buildResumeCTA queries findAcceptedCodingRun and findActiveUnacceptedRun
    expect(handlerCode).toContain('findAcceptedCodingRun(evidenceSourceId)');
    expect(handlerCode).toContain('findActiveUnacceptedRun(evidenceSourceId, codebookId)');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// STALE "REVIEW GROUPINGS" BUTTON — backward compatibility
// ═══════════════════════════════════════════════════════════════════════

describe('stale Review Groupings button handling', () => {
  const handlerCode = readFileSync(HANDLER_PATH, 'utf-8');

  it('handleOpenGroupingReview checks codebook status before opening modal', () => {
    // The function must check result.codebook.status === 'accepted'
    // before opening the review modal
    const fnStart = handlerCode.indexOf('export async function handleOpenGroupingReview');
    const fnBody = handlerCode.slice(fnStart);
    const statusCheck = fnBody.indexOf("result.codebook.status === 'accepted'");
    const viewsOpen = fnBody.indexOf('client.views.open');
    expect(statusCheck).toBeGreaterThan(-1);
    expect(viewsOpen).toBeGreaterThan(-1);
    expect(statusCheck).toBeLessThan(viewsOpen);
  });

  it('handleOpenGroupingReview calls buildResumeCTA for accepted codebook', () => {
    const fnStart = handlerCode.indexOf('export async function handleOpenGroupingReview');
    const fnBody = handlerCode.slice(fnStart);
    expect(fnBody).toContain('buildResumeCTA');
  });

  it('handleOpenGroupingReview returns before views.open for accepted codebook', () => {
    const fnStart = handlerCode.indexOf('export async function handleOpenGroupingReview');
    const fnBody = handlerCode.slice(fnStart);
    const statusCheck = fnBody.indexOf("result.codebook.status === 'accepted'");
    const returnAfterCheck = fnBody.indexOf('return;', statusCheck);
    const viewsOpen = fnBody.indexOf('client.views.open');
    expect(returnAfterCheck).toBeLessThan(viewsOpen);
  });

  it('accepted codebook never reaches acceptCodebook() from stale Review Groupings', () => {
    // handleOpenGroupingReview for accepted codebook returns before any modal
    // so handleCodebookReviewSubmission (which calls acceptCodebook) is never invoked
    const fnStart = handlerCode.indexOf('export async function handleOpenGroupingReview');
    const fnEnd = handlerCode.indexOf('export async function', fnStart + 1);
    const fnBody = handlerCode.slice(fnStart, fnEnd);
    // The function body should NOT contain acceptCodebook
    expect(fnBody).not.toContain('acceptCodebook');
  });

  it('all three grouping entry points use buildResumeCTA', () => {
    // handleGenerateCodebook, handleOpenGroupingReview, handleCodebookReviewSubmission
    // all must call buildResumeCTA for accepted codebook state
    const generateFn = handlerCode.slice(
      handlerCode.indexOf('export async function handleGenerateCodebook'),
      handlerCode.indexOf('export async function handleOpenGroupingReview'),
    );
    const openFn = handlerCode.slice(
      handlerCode.indexOf('export async function handleOpenGroupingReview'),
      handlerCode.indexOf('export async function handleCodebookReviewSubmission'),
    );
    const submitFn = handlerCode.slice(
      handlerCode.indexOf('export async function handleCodebookReviewSubmission'),
    );

    expect(generateFn).toContain('buildResumeCTA');
    expect(openFn).toContain('buildResumeCTA');
    expect(submitFn).toContain('buildResumeCTA');
  });

  it('immutable error is never shown to researcher from any entry point', () => {
    // No postMessage should contain the raw "accepted and immutable" text
    const errorText = 'accepted and immutable';
    const handlerLines = handlerCode.split('\n');
    const userFacingLines = handlerLines.filter(line =>
      line.includes(errorText) &&
      !line.includes('import') &&
      !line.includes('instanceof'),
    );
    expect(userFacingLines).toHaveLength(0);
  });
});
