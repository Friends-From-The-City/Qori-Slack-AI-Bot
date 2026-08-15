/**
 * Shared handler types for Slack interactions.
 *
 * Handler-specific context types (ViewSubmissionContext, SlashCommandContext,
 * etc.) were removed in Phase 6 — handlers now use Bolt's native middleware
 * types directly (SlackViewMiddlewareArgs, SlackCommandMiddlewareArgs, etc.).
 *
 * This file retains Qori-specific types: handler results and the
 * TemplateContractError class used for cascade contract violations.
 */

// ---------------------------------------------------------------------------
// Handler result types
// ---------------------------------------------------------------------------

/**
 * Standard success result from a YAML-processing handler.
 * Returned after template processing completes and the document is committed
 * to GitHub.
 */
export interface HandlerSuccessResult {
  success: true;
  studyId: number;
  documentUrl: string;
  templateId: string;
}

/**
 * Standard error result from a handler.
 * Sent as a DM to the researcher when processing fails.
 */
export interface HandlerErrorResult {
  success: false;
  error: string;
  templateId?: string;
  /** User-facing message (may omit internal details). */
  userMessage?: string;
}

export type HandlerResult = HandlerSuccessResult | HandlerErrorResult;

// ---------------------------------------------------------------------------
// Template contract error
// ---------------------------------------------------------------------------

/**
 * Thrown when a cascade variable contract is violated.
 * See ADR 0007: cascade contracts fail loudly.
 *
 * Handlers catch this and send a DM to the researcher explaining which
 * upstream template needs to run first.
 */
export class TemplateContractError extends Error {
  constructor(
    message: string,
    public readonly templateId?: string,
    public readonly variableKey?: string,
    public readonly userMessage?: string,
  ) {
    super(message);
    this.name = 'TemplateContractError';
  }
}

// ---------------------------------------------------------------------------
// Evidence projection error
// ---------------------------------------------------------------------------

/**
 * Thrown when an accepted evidence construct fails projection validation.
 * Per ADR 0029: projection must fail closed — an accepted construct that
 * cannot satisfy its projection contract throws rather than producing
 * malformed cascade variables.
 *
 * Analogous to TemplateContractError for the evidence → cascade boundary.
 */
export class EvidenceProjectionError extends Error {
  constructor(
    message: string,
    public readonly constructType?: string,
    public readonly missingFields?: string[],
  ) {
    super(message);
    this.name = 'EvidenceProjectionError';
  }
}

// ---------------------------------------------------------------------------
// PII redaction error
// ---------------------------------------------------------------------------

/**
 * Thrown when PII redaction fails or known names are detected in a payload
 * that should have been redacted.
 *
 * FAIL-CLOSED: If this error is thrown, the API call MUST be aborted.
 * A known participant name in the payload means redaction failed.
 *
 * SECURITY: This error carries COUNT only, never actual names. The error
 * may reach Sentry/#qori-alerts — exposing names on the failure path
 * would defeat the purpose of redaction.
 */
export class PiiRedactionError extends Error {
  constructor(
    message: string,
    public readonly participantCode?: string,
    public readonly detectedCount?: number,
  ) {
    super(message);
    this.name = 'PiiRedactionError';
  }
}
