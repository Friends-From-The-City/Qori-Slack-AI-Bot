/**
 * DispositionAuditLog Model
 *
 * Per ADR 0025: Every disposition action is logged for NARA compliance.
 * Audit entries survive the deletion of the records they describe via
 * SET NULL FKs and denormalized fields.
 */

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from 'sequelize';

export type AuditAction =
  | 'delete_participant'
  | 'delete_study'
  | 'delete_subject'       // GOV-2D: subject-rooted DSAR deletion
  | 'export_participant'
  | 'export_subject'       // GOV-2C: subject-rooted DSAR export
  | 'change_stakeholder'
  | 'deletion_denied'
  | 'deletion_error'
  | 'approve_transcript'
  | 'reject_transcript'
  | 'rescrub_transcript'
  | 'review_finding'          // UX-2B: finding review decision
  | 'review_recommendation';  // UX-2B: recommendation review decision

export type AuditOutcome = 'success' | 'denied' | 'error';

class DispositionAuditLog extends Model<
  InferAttributes<DispositionAuditLog>,
  InferCreationAttributes<DispositionAuditLog>
> {
  // Primary key
  declare id: CreationOptional<number>;

  // What was affected
  declare action: AuditAction;
  declare record_type: string;
  declare target_id: number | null;
  declare target_identifier: string;

  // Context (denormalized for durability)
  declare project_id: number | null;
  declare project_name: string | null;
  declare study_id: number | null;
  declare study_name: string | null;
  declare participant_id: number | null;
  declare participant_code: string | null;

  // Who
  declare actor_user_id: string;
  declare actor_role: string | null;

  // Authorization
  declare authorization_basis: string;

  // Outcome
  declare outcome: AuditOutcome;
  declare outcome_detail: string | null;

  // Counts
  declare records_affected: Record<string, number> | null;

  // Timestamp
  declare occurred_at: CreationOptional<Date>;
}

export default (sequelize: Sequelize) => {
  DispositionAuditLog.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      action: {
        type: DataTypes.STRING(30),
        allowNull: false,
      },
      record_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      target_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      target_identifier: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      project_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      project_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      study_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      study_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      participant_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      participant_code: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      actor_user_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      actor_role: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      authorization_basis: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      outcome: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      outcome_detail: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      records_affected: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      occurred_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'disposition_audit_log',
      underscored: true,
      timestamps: false, // We manage occurred_at manually
      sequelize,
    },
  );

  return DispositionAuditLog;
};

export type { DispositionAuditLog };
