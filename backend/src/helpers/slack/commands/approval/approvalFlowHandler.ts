/**
 * approvalFlowHandler.ts — Plan & brief approval/request-changes wiring
 *
 * Extracted from events.js. These are thin wrappers that delegate to the
 * generic approval functions in requestChangesHandler.
 */

import type { BlockActionContext, ViewSubmissionContext } from '../../../../types/handlers';

import {
  handleApprove,
  handleApproveSubmission,
  handleRequestChanges,
  handleRequestChangesSubmission,
} from '../../requestChangesHandler';

// ─── Plan approval ─────────────────────────────────────────────────

async function handleApprovePlan({ ack, body, client }: BlockActionContext): Promise<void> {
  await ack();
  await handleApprove(body, client, 'plan');
}

async function handleConfirmApprovePlan({ ack, view, body, client }: ViewSubmissionContext): Promise<void> {
  await handleApproveSubmission(ack, view, body, client);
}

async function handleRequestChangesPlan({ ack, body, client }: BlockActionContext): Promise<void> {
  await ack();
  await handleRequestChanges(body, client, 'plan');
}

async function handleRequestChangesPlanModal({ ack, view, body, client }: ViewSubmissionContext): Promise<void> {
  await handleRequestChangesSubmission(ack, view, body, client);
}

// ─── Brief approval ───────────────────────────────────────────────

async function handleApproveBrief({ ack, body, client }: BlockActionContext): Promise<void> {
  await ack();
  await handleApprove(body, client, 'brief');
}

async function handleConfirmApproveBrief({ ack, view, body, client }: ViewSubmissionContext): Promise<void> {
  await handleApproveSubmission(ack, view, body, client);
}

async function handleRequestChangesBrief({ ack, body, client }: BlockActionContext): Promise<void> {
  await ack();
  await handleRequestChanges(body, client, 'brief');
}

async function handleRequestChangesBriefModal({ ack, view, body, client }: ViewSubmissionContext): Promise<void> {
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
