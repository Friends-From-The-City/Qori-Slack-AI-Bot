/**
 * Archival Service — GOV-6
 *
 * Hardened archival that goes beyond cosmetic project.status='archived'.
 *
 * Archive operation:
 * - Marks operational status archived/inactive
 * - Preserves canonical data, evidence lineage, subject governance
 * - Preserves records assignments and search/retrieval path
 * - Does NOT delete anything
 * - Does NOT trigger disposition
 */

import type { Sequelize, Transaction } from 'sequelize';
import type { Project } from '../database/models/project';
import type { RecordsManagementAssignment } from '../database/models/records_management_assignment';
import defaultSequelize from '../database';

// ═══════════════════════════════════════════════════════════
// TEST INJECTION
// ═══════════════════════════════════════════════════════════

let _injectedSequelize: Sequelize | null = null;

export function injectSequelizeForTest(instance: Sequelize): void {
  _injectedSequelize = instance;
}

export function clearInjectedSequelize(): void {
  _injectedSequelize = null;
}

function db(): Sequelize {
  return _injectedSequelize || defaultSequelize;
}

function projectModel() {
  return db().models.Project as typeof Project;
}

function assignmentModel() {
  return db().models.RecordsManagementAssignment as typeof RecordsManagementAssignment;
}

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface ArchiveResult {
  project_id: number;
  previous_status: string;
  new_status: string;
  assignments_archived: number;
}

export interface ReactivateResult {
  project_id: number;
  previous_status: string;
  new_status: string;
  assignments_reactivated: number;
}

// ═══════════════════════════════════════════════════════════
// OPERATIONS
// ═══════════════════════════════════════════════════════════

/**
 * Archive a project.
 *
 * - Sets project status to 'archived'
 * - Transitions active/inactive record assignments to 'archived'
 * - Does NOT delete anything
 * - Does NOT trigger disposition
 * - Preserves evidence lineage, subject governance, search/retrieval
 */
export async function archiveProject(
  projectId: number,
  actorUserId: string,
): Promise<ArchiveResult> {
  return db().transaction(async (t: Transaction) => {
    const project = await projectModel().findByPk(projectId, { transaction: t });
    if (!project) throw new Error(`Project ${projectId} not found`);

    const previousStatus = project.status;

    if (previousStatus === 'archived') {
      return {
        project_id: projectId,
        previous_status: previousStatus,
        new_status: 'archived',
        assignments_archived: 0,
      };
    }

    // Update project status
    await projectModel().update(
      { status: 'archived', updated_at: new Date() },
      { where: { id: projectId }, transaction: t },
    );

    // Transition active/inactive assignments to archived
    const [assignmentsArchived] = await assignmentModel().update(
      { lifecycle_status: 'archived', updated_at: new Date() },
      {
        where: {
          project_id: projectId,
          lifecycle_status: ['active', 'inactive'],
        },
        transaction: t,
      },
    );

    return {
      project_id: projectId,
      previous_status: previousStatus,
      new_status: 'archived',
      assignments_archived: assignmentsArchived,
    };
  });
}

/**
 * Reactivate an archived project.
 *
 * - Sets project status to 'active'
 * - Transitions archived record assignments back to 'active'
 */
export async function reactivateProject(
  projectId: number,
  actorUserId: string,
): Promise<ReactivateResult> {
  return db().transaction(async (t: Transaction) => {
    const project = await projectModel().findByPk(projectId, { transaction: t });
    if (!project) throw new Error(`Project ${projectId} not found`);

    const previousStatus = project.status;

    if (previousStatus !== 'archived') {
      return {
        project_id: projectId,
        previous_status: previousStatus,
        new_status: previousStatus,
        assignments_reactivated: 0,
      };
    }

    await projectModel().update(
      { status: 'active', updated_at: new Date() },
      { where: { id: projectId }, transaction: t },
    );

    const [reactivated] = await assignmentModel().update(
      { lifecycle_status: 'active', updated_at: new Date() },
      {
        where: {
          project_id: projectId,
          lifecycle_status: 'archived',
        },
        transaction: t,
      },
    );

    return {
      project_id: projectId,
      previous_status: previousStatus,
      new_status: 'active',
      assignments_reactivated: reactivated,
    };
  });
}
