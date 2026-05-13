/**
 * Shared handler context types for Slack interactions.
 *
 * Individual handler-specific types (what each handler passes to templates,
 * what each handler returns) will be co-located with the handler files when
 * they migrate to .ts in Phase 4. This file defines only the shared base
 * shapes that multiple handlers use.
 *
 * These types wrap the Slack Bolt SDK types to provide a consistent contract
 * for handler functions.
 */

import type {
  AckFn,
  ViewSubmitAction,
  SlashCommand,
  BlockAction,
} from '@slack/bolt';
import type { WebClient } from '@slack/web-api';

// ---------------------------------------------------------------------------
// Slack interaction contexts
// ---------------------------------------------------------------------------

/**
 * Common shape every Slack view submission handler receives.
 * Handlers for modal submissions (e.g., /qori-plan, /qori-brief) get this.
 */
export interface ViewSubmissionContext {
  ack: AckFn<ViewSubmitAction>;
  body: ViewSubmitAction;
  view: ViewSubmitAction['view'];
  client: WebClient;
}

/**
 * Common shape every slash command handler receives.
 * Handlers for /qori-* commands get this before opening a modal.
 */
export interface SlashCommandContext {
  ack: AckFn<void>;
  body: SlashCommand;
  client: WebClient;
}

/**
 * Common shape for block action handlers (button clicks, menu selections
 * within messages or modals).
 */
export interface BlockActionContext {
  ack: AckFn<void>;
  body: BlockAction;
  client: WebClient;
}

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
