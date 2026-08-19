/**
 * approvalFlowHandler.ts — Plan & brief approval/request-changes wiring
 *
 * Extracted from events.js. These are thin wrappers that delegate to the
 * generic approval functions in requestChangesHandler.
 */

import type { AllMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';

import {
  handleApprove,
  handleApproveSubmission,
  handleRequestChanges,
  handleRequestChangesSubmission,
} from '../../requestChangesHandler';
import { buildSlackApplicationContext } from '../../../../middleware/auth/slackContextBridge';
import { executeDocumentApproval } from '../../../../application/approval.app-service';

// PLAT-3: Application service delegation wired. The approval app service
// (executeDocumentApproval) is callable from both Slack and HTTP API.
// Slack handlers currently delegate to requestChangesHandler (legacy path)
// with app service as the canonical implementation.

// ─── Plan approval ─────────────────────────────────────────────────

async function handleApprovePlan({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> {
  await ack();
  await handleApprove(body, client, 'plan');
}

async function handleConfirmApprovePlan({ ack, view, body, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  await handleApproveSubmission(ack, view, body, client);
}

async function handleRequestChangesPlan({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> {
  await ack();
  await handleRequestChanges(body, client, 'plan');
}

async function handleRequestChangesPlanModal({ ack, view, body, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  await handleRequestChangesSubmission(ack, view, body, client);
}

// ─── Brief approval ───────────────────────────────────────────────

async function handleApproveBrief({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> {
  await ack();
  await handleApprove(body, client, 'brief');
}

async function handleConfirmApproveBrief({ ack, view, body, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  await handleApproveSubmission(ack, view, body, client);
}

async function handleRequestChangesBrief({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> {
  await ack();
  await handleRequestChanges(body, client, 'brief');
}

async function handleRequestChangesBriefModal({ ack, view, body, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  await handleRequestChangesSubmission(ack, view, body, client);
}

export {
  handleApprovePlan,
  handleConfirmApprovePlan,
  handleRequestChangesPlan,
  handleRequestChangesPlanModal,
  handleApproveBrief,
  handleConfirmApproveBrief,
  handleRequestChangesBrief,
  handleRequestChangesBriefModal,
};
