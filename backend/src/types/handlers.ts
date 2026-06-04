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
// PII redaction error
// ---------------------------------------------------------------------------

/**
 * Thrown when PII redaction fails or known names are detected in a payload
 * that should have been redacted.
 *
 * FAIL-CLOSED: If this error is thrown, the API call MUST be aborted.
 * A known participant name in the payload means redaction failed.
 */
export class PiiRedactionError extends Error {
  constructor(
    message: string,
    public readonly participantCode?: string,
    public readonly detectedNames?: string[],
  ) {
    super(message);
    this.name = 'PiiRedactionError';
  }
}
