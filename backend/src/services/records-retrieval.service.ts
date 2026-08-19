/**
 * Records Retrieval Service — GOV-6
 *
 * Retrieves archived canonical records with their full governance metadata.
 * Returns stable public IDs — does NOT reconstruct from Slack or GitHub.
 *
 * Retrieval path:
 *   project → studies → evidence sources → constructs → relationships
 *   → artifacts → records-management metadata
 */

import { Op, type Sequelize } from 'sequelize';
import type { Project } from '../database/models/project';
import type { ResearchStudy } from '../database/models/research_study';
import type { EvidenceSource } from '../database/models/evidence_source';
import type { EvidenceConstruct } from '../database/models/evidence_construct';
import type { EvidenceRelationship } from '../database/models/evidence_relationship';
import type { ResearchArtifact } from '../database/models/research_artifact';
import type { RecordsManagementAssignment } from '../database/models/records_management_assignment';
import type { RecordsHold } from '../database/models/records_hold';
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

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface ProjectRecordsSummary {
  project: {
    id: number;
    public_id?: string;
    name: string;
    slug: string;
    status: string;
  };
  studies: Array<{
    id: number;
    public_id?: string;
    name: string;
    status: string;
  }>;
  evidence_sources: Array<{
    public_id: string;
    source_type: string;
    label: string;
  }>;
  evidence_constructs: Array<{
    public_id: string;
    construct_type: string;
    label: string;
    status: string;
  }>;
  evidence_relationships: Array<{
    public_id: string;
    relationship_type: string;
    source_public_id: string;
    target_public_id: string;
  }>;
  artifacts: Array<{
    public_id: string;
    artifact_type: string;
    label: string;
  }>;
  records_assignments: Array<{
    public_id: string;
    record_type: string;
    record_public_id: string;
    lifecycle_status: string;
    schedule_authority?: string;
    eligible_disposition_at: Date | null;
  }>;
  active_holds: Array<{
    public_id: string;
    hold_type: string;
    title: string;
    issued_at: Date;
  }>;
}

// ═══════════════════════════════════════════════════════════
// RETRIEVAL
// ═══════════════════════════════════════════════════════════

/**
 * Retrieve full records summary for a project, including archived records.
 * Returns stable public IDs for all canonical entities.
 */
export async function retrieveProjectRecords(
  projectId: number,
): Promise<ProjectRecordsSummary> {
  const ProjectModel = db().models.Project as typeof Project;
  const StudyModel = db().models.ResearchStudy as typeof ResearchStudy;
  const SourceModel = db().models.EvidenceSource as typeof EvidenceSource;
  const ConstructModel = db().models.EvidenceConstruct as typeof EvidenceConstruct;
  const RelModel = db().models.EvidenceRelationship as typeof EvidenceRelationship;
  const ArtifactModel = db().models.ResearchArtifact as typeof ResearchArtifact;
  const AssignmentModel = db().models.RecordsManagementAssignment as typeof RecordsManagementAssignment;
  const HoldModel = db().models.RecordsHold as typeof RecordsHold;
  const ScheduleModel = db().models.RecordsSchedule;

  const project = await ProjectModel.findByPk(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  // Parallel fetch of all related entities
  const [studies, sources, constructs, relationships, artifacts, assignments, holds] =
    await Promise.all([
      StudyModel.findAll({ where: { project_id: projectId } }),
      SourceModel.findAll({ where: { project_id: projectId } }),
      ConstructModel.findAll({ where: { project_id: projectId } }),
      RelModel.findAll({ where: { project_id: projectId } }),
      ArtifactModel.findAll({ where: { project_id: projectId } }),
      AssignmentModel.findAll({
        where: { project_id: projectId },
        include: [{ model: ScheduleModel, as: 'schedule', required: false }],
      }),
      HoldModel.findAll({ where: { project_id: projectId, status: 'active' } }),
    ]);

  return {
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      status: project.status,
    },
    studies: studies.map((s) => ({
      id: s.id,
      public_id: (s as any).public_id,
      name: s.name,
      status: (s as any).status ?? 'unknown',
    })),
    evidence_sources: sources.map((s) => ({
      public_id: s.public_id,
      source_type: s.source_type,
      label: s.label,
    })),
    evidence_constructs: constructs.map((c) => ({
      public_id: c.public_id,
      construct_type: c.construct_type,
      label: (c as any).label ?? c.construct_type,
      status: c.status,
    })),
    evidence_relationships: relationships.map((r) => ({
      public_id: r.public_id,
      relationship_type: r.relationship_type,
      source_public_id: (r as any).source_public_id ?? '',
      target_public_id: (r as any).target_public_id ?? '',
    })),
    artifacts: artifacts.map((a) => ({
      public_id: a.public_id,
      artifact_type: a.artifact_type,
      label: a.title ?? a.artifact_type,
    })),
    records_assignments: assignments.map((a) => ({
      public_id: a.public_id,
      record_type: a.record_type,
      record_public_id: a.record_public_id,
      lifecycle_status: a.lifecycle_status,
      schedule_authority: (a as any).schedule?.authority_code,
      eligible_disposition_at: a.eligible_disposition_at,
    })),
    active_holds: holds.map((h) => ({
      public_id: h.public_id,
      hold_type: h.hold_type,
      title: h.title,
      issued_at: h.issued_at,
    })),
  };
}
