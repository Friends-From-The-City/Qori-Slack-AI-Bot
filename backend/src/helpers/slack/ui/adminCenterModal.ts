/**
 * Admin Center Modals
 *
 * Per ADR 0025: Unified interface for destructive operations,
 * gated to project owners only.
 *
 * Phase 1: DSAR, Delete Study, Manage Stakeholder
 * Phases 2-3 (Close Study, Legal Holds) tracked in ADR 0025 backlog.
 */

import type { View } from '@slack/types';
import type { Project } from '../../../database/models/project';

export interface AdminCenterMetadata {
  projectId: number;
  projectName: string;
}

export type StakeholderInfo = {
  userId: string;
  displayName: string;
} | null;

/**
 * Admin Center modal for project owners.
 *
 * Shows active actions: DSAR, Delete Study, Manage Stakeholder.
 */
export function buildAdminCenterModal(project: Project, stakeholder: StakeholderInfo): View {
  const metadata: AdminCenterMetadata = {
    projectId: project.id,
    projectName: project.name,
  };

  // Build stakeholder status text
  const stakeholderText = stakeholder
    ? `*Stakeholder:* ${stakeholder.displayName}\nApproves research briefs for this project.`
    : '*Stakeholder:* Not set\n_Brief approvals route to the project owner._';

  const stakeholderButtonText = stakeholder ? 'Change' : 'Designate';

  return {
    type: 'modal',
    callback_id: 'admin-center-main',
    title: { type: 'plain_text', text: 'Admin Center' },
    close: { type: 'plain_text', text: 'Close' },
    private_metadata: JSON.stringify(metadata),
    blocks: [
      // Header
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Project:* ${project.name}\n*Your role:* Owner`,
        },
      },
      { type: 'divider' },

      // === TEAM GOVERNANCE ===
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '*Team Governance*',
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: stakeholderText,
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: stakeholderButtonText },
          action_id: 'admin-stakeholder-manage',
        },
      },

      { type: 'divider' },

      // === DATA MANAGEMENT ===
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '*Data Management*',
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "*Participant Data*\nExport or delete a participant's data.",
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'Open' },
          action_id: 'admin-dsar-open',
          style: 'primary',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Delete Study*\nPermanently remove a study and all associated data.',
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'Open' },
          action_id: 'admin-delete-study-open',
          style: 'danger',
        },
      },

      { type: 'divider' },

      // Footer warning
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: ':warning: *Actions here cannot be undone.* All actions are logged for compliance.',
          },
        ],
      },
    ],
  };
}

/**
 * Modal shown to non-owners.
 * Explains that Admin Center requires owner role.
 *
 * Note: The `isMember` parameter is vestigial — it only affects explanatory
 * text ("You are a project member, but..." vs "You are not a member...").
 * All Admin Center operations are owner-gated per ADR 0025; members have
 * no action path here. The distinction is kept for UX clarity only.
 */
export function buildNonOwnerModal(project: Project, isMember: boolean): View {
  const memberContext = isMember
    ? 'You are a project member, but only project owners can access the Admin Center.'
    : 'You are not a member of this project.';

  return {
    type: 'modal',
    callback_id: 'admin-center-non-owner',
    title: { type: 'plain_text', text: 'Admin Center' },
    close: { type: 'plain_text', text: 'Close' },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Project:* ${project.name}`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `:lock: *Owner-Only Access*\n\n${memberContext}\n\n` +
            'Contact a project owner if you need to:\n' +
            '• Export participant data\n' +
            '• Delete a participant or study',
        },
      },
    ],
  };
}
