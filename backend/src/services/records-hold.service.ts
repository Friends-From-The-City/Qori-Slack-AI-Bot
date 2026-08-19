/**
 * Records Hold Service — GOV-6
 *
 * Manages preservation/legal holds on records.
 * Project-level holds block ALL records within the project.
 * Record-level holds (via hold_targets) block specific records.
 *
 * Hold status is computed deterministically — not copied to child rows.
 */

import { Op, type Sequelize, type Transaction } from 'sequelize';
import type { RecordsHold, HoldType } from '../database/models/records_hold';
import type { RecordsHoldTarget } from '../database/models/records_hold_target';
import type { Project } from '../database/models/project';
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

function holdModel() {
  return db().models.RecordsHold as typeof RecordsHold;
}

function holdTargetModel() {
  return db().models.RecordsHoldTarget as typeof RecordsHoldTarget;
}

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface CreateHoldInput {
  project_id: number;
  hold_type: HoldType;
  title: string;
  reason?: string;
  issued_by: string;
  external_reference?: string;
  targets?: Array<{ target_type: string; target_public_id: string }>;
}

export interface EffectiveHoldResult {
  effective_hold: boolean;
  reasons: string[];
  holds: Array<{
    public_id: string;
    hold_type: HoldType;
    title: string;
    scope: 'project' | 'record';
  }>;
}

// ═══════════════════════════════════════════════════════════
// OPERATIONS
// ═══════════════════════════════════════════════════════════

/**
 * Create a preservation hold. Optionally attach specific record targets.
 * Without targets, the hold applies to the entire project.
 *
 * PLAT-2 cross-org invariant: Every target must belong to the same project
 * as the hold. Targets from a different project (and thus potentially a
 * different organization) are rejected. Fail-closed: nonexistent targets
 * are also rejected.
 */
export async function createHold(input: CreateHoldInput): Promise<RecordsHold> {
  return db().transaction(async (t: Transaction) => {
    // PLAT-2: Validate targets belong to the hold's project scope
    if (input.targets && input.targets.length > 0) {
      await validateHoldTargetsScope(input.project_id, input.targets, t);
    }

    const hold = await holdModel().create(
      {
        project_id: input.project_id,
        hold_type: input.hold_type,
        title: input.title,
        reason: input.reason ?? null,
        status: 'active',
        issued_by: input.issued_by,
        external_reference: input.external_reference ?? null,
        released_by: null,
        released_at: null,
      },
      { transaction: t },
    );

    if (input.targets && input.targets.length > 0) {
      await holdTargetModel().bulkCreate(
        input.targets.map((tgt) => ({
          hold_id: hold.id,
          target_type: tgt.target_type,
          target_public_id: tgt.target_public_id,
        })),
        { transaction: t },
      );
    }

    return hold;
  });
}

// ═══════════════════════════════════════════════════════════
// PLAT-2: CROSS-ORG HOLD TARGET VALIDATION
// ═══════════════════════════════════════════════════════════

/**
 * Tables that contain holdable records, keyed by target_type.
 * Each maps to a table with (public_id, project_id) columns.
 */
const HOLDABLE_TABLES: Record<string, string> = {
  project: 'projects',
  study: 'research_studies',
  evidence_source: 'evidence_sources',
  evidence_construct: 'evidence_constructs',
  research_artifact: 'research_artifacts',
};

/**
 * Validate that every hold target belongs to the hold's project.
 *
 * FAIL-CLOSED:
 * - Unknown target_type → reject
 * - target_public_id not found → reject
 * - target belongs to different project → reject
 *
 * Does NOT rely on caller-provided org metadata.
 * Resolves canonical target → project → compares with hold.project_id.
 */
async function validateHoldTargetsScope(
  holdProjectId: number,
  targets: Array<{ target_type: string; target_public_id: string }>,
  transaction: Transaction,
): Promise<void> {
  // Resolve the hold's project to get its organization_id
  const ProjectModel = db().models.Project as typeof Project;
  const holdProject = await ProjectModel.findByPk(holdProjectId, {
    attributes: ['id', 'organization_id'],
    transaction,
  });
  if (!holdProject) {
    throw new Error(`Hold project ${holdProjectId} not found`);
  }

  for (const target of targets) {
    const tableName = HOLDABLE_TABLES[target.target_type];
    if (!tableName) {
      throw new Error(
        `Hold target validation failed: unknown target_type "${target.target_type}". ` +
        `Supported types: ${Object.keys(HOLDABLE_TABLES).join(', ')}`,
      );
    }

    // For 'project' targets, the public_id is on the projects table itself
    // For other types, the table has project_id FK
    let targetProjectId: number;

    if (target.target_type === 'project') {
      const [rows] = await db().query(
        `SELECT id, organization_id FROM projects WHERE public_id = :publicId`,
        { replacements: { publicId: target.target_public_id }, transaction },
      ) as [Array<{ id: number; organization_id: number }>, unknown];

      if (rows.length === 0) {
        throw new Error(
          `Hold target validation failed: project with public_id "${target.target_public_id}" not found`,
        );
      }
      targetProjectId = rows[0].id;

      // For project targets, verify org match directly
      if (rows[0].organization_id !== holdProject.organization_id) {
        throw new Error(
          `Hold target validation failed: target project belongs to a different organization`,
        );
      }
    } else {
      // Study, evidence_source, evidence_construct, research_artifact — all have project_id
      const [rows] = await db().query(
        `SELECT project_id FROM "${tableName}" WHERE public_id = :publicId`,
        { replacements: { publicId: target.target_public_id }, transaction },
      ) as [Array<{ project_id: number }>, unknown];

      if (rows.length === 0) {
        throw new Error(
          `Hold target validation failed: ${target.target_type} with public_id "${target.target_public_id}" not found`,
        );
      }
      targetProjectId = rows[0].project_id;
    }

    if (targetProjectId !== holdProjectId) {
      throw new Error(
        `Hold target validation failed: ${target.target_type} "${target.target_public_id}" ` +
        `belongs to project ${targetProjectId}, not hold project ${holdProjectId}. ` +
        `Cross-project hold targets are not permitted.`,
      );
    }
  }
}

/**
 * Release a hold. Sets status='released' with actor and timestamp.
 */
export async function releaseHold(
  holdId: number,
  releasedBy: string,
): Promise<void> {
  const hold = await holdModel().findByPk(holdId);
  if (!hold) throw new Error(`Hold ${holdId} not found`);
  if (hold.status === 'released') return; // idempotent

  await holdModel().update(
    {
      status: 'released',
      released_by: releasedBy,
      released_at: new Date(),
    },
    { where: { id: holdId } },
  );
}

/**
 * Compute effective hold for a specific record within a project.
 *
 * A record is under effective hold if:
 * 1. Any active project-level hold exists (no targets = project scope), OR
 * 2. Any active hold has a target matching this record.
 *
 * Does NOT mutate child rows — computed deterministically.
 */
export async function computeEffectiveHold(
  projectId: number,
  recordType: string,
  recordPublicId: string,
): Promise<EffectiveHoldResult> {
  const reasons: string[] = [];
  const matchedHolds: EffectiveHoldResult['holds'] = [];

  // 1. Project-level holds: active holds with NO targets
  const projectHolds = await holdModel().findAll({
    where: { project_id: projectId, status: 'active' },
    include: [{
      model: holdTargetModel(),
      as: 'targets',
      required: false,
    }],
  });

  for (const hold of projectHolds) {
    // A hold with no targets = project-level hold
    const targets = (hold as any).targets as RecordsHoldTarget[] | undefined;
    if (!targets || targets.length === 0) {
      reasons.push(`Project-level ${hold.hold_type} hold: ${hold.title}`);
      matchedHolds.push({
        public_id: hold.public_id,
        hold_type: hold.hold_type,
        title: hold.title,
        scope: 'project',
      });
    } else {
      // Check if this specific record is targeted
      const hit = targets.find(
        (tgt) => tgt.target_type === recordType && tgt.target_public_id === recordPublicId,
      );
      if (hit) {
        reasons.push(`Record-level ${hold.hold_type} hold: ${hold.title}`);
        matchedHolds.push({
          public_id: hold.public_id,
          hold_type: hold.hold_type,
          title: hold.title,
          scope: 'record',
        });
      }
    }
  }

  return {
    effective_hold: matchedHolds.length > 0,
    reasons,
    holds: matchedHolds,
  };
}

/**
 * Find all active holds for a project.
 */
export async function findActiveHolds(projectId: number): Promise<RecordsHold[]> {
  return holdModel().findAll({
    where: { project_id: projectId, status: 'active' },
    include: [{ model: holdTargetModel(), as: 'targets' }],
  });
}

/**
 * Find a hold by public_id.
 */
export async function findHoldByPublicId(publicId: string): Promise<RecordsHold | null> {
  return holdModel().findOne({
    where: { public_id: publicId },
    include: [{ model: holdTargetModel(), as: 'targets' }],
  });
}
