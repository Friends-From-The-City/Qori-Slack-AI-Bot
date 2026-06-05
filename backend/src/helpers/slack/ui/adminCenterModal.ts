/**
 * Admin Center Modals
 *
 * Per ADR 0025: Unified interface for destructive operations,
 * gated to project owners only.
 *
 * Phase 1 ACTIVE: DSAR, Delete Study
 * Phase 1 PREVIEW (disabled): Close Study, Legal Holds
 */

import type { View } from '@slack/types';
import type { Project } from '../../../database/models/project';

export interface AdminCenterMetadata {
  projectId: number;
  projectName: string;
}

/**
 * Admin Center modal for project owners.
 *
 * Shows active actions (DSAR, Delete Study) and preview actions
 * (Close Study, Legal Holds) that are visibly disabled.
 */
export function buildAdminCenterModal(project: Project): View {
  const metadata: AdminCenterMetadata = {
    projectId: project.id,
    projectName: project.name,
  };

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

      // === ACTIVE ACTIONS (Phase 1) ===
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

      // === PREVIEW ACTIONS (Future — visibly disabled) ===
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '_Coming in a future release:_',
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '~*Close Study*~\n_Mark study complete and start the data retention period._',
        },
        // NO accessory button — visibly absent
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '~*Legal Holds*~\n_View active holds on this project._',
        },
        // NO accessory button — visibly absent
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
