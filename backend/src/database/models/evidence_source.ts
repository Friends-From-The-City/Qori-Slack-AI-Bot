/**
 * EvidenceSource Model
 *
 * Per ADR 0029: Represents an evidence-bearing input — an uploaded document,
 * survey dataset, stakeholder interview, session transcript, etc.
 *
 * Sources are leaf nodes in the evidence graph. They can be the origin of
 * constructs (via evidence_relationships) but cannot themselves be derived
 * from other entities.
 *
 * Identity (ADR 0030):
 *   id        — internal relational PK
 *   public_id — durable UUID for external references, exports, provenance
 *
 * Scope:
 *   - project_id is always required (CASCADE on project delete)
 *   - study_id is NULL for project-scoped discovery sources
 *   - study_id CASCADE on study delete (study-scoped evidence is deleted with study)
 */

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from 'sequelize';
import { randomUUID } from 'crypto';

export type SourceType =
  | 'uploaded_document'
  | 'survey_dataset'
  | 'stakeholder_interview'
  | 'session_transcript'
  | 'session_notes'
  | 'process_document'
  | 'external_reference';

/**
 * Reference to where the source artifact content lives.
 * Not all fields are required — depends on source_type.
 */
export interface ArtifactRef {
  github_path?: string;
  github_sha?: string;
  study_notes_id?: number;
  file_url?: string;
  [key: string]: unknown;
}

class EvidenceSource extends Model<
  InferAttributes<EvidenceSource>,
  InferCreationAttributes<EvidenceSource>
> {
  declare id: CreationOptional<number>;
  declare public_id: CreationOptional<string>;
  declare project_id: number;
  declare study_id: number | null;
  declare source_type: SourceType;
  declare label: string;
  declare artifact_ref: ArtifactRef | null;
  declare metadata: Record<string, unknown> | null;
  declare created_by: string;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.Project, {
      foreignKey: 'project_id',
      as: 'project',
      onDelete: 'CASCADE',
    });

    this.belongsTo(models.ResearchStudy, {
      foreignKey: 'study_id',
      as: 'study',
      onDelete: 'CASCADE',
    });
  }
}

export default (sequelize: Sequelize) => {
  EvidenceSource.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      public_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        defaultValue: () => randomUUID(),
      },
      project_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      study_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      source_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
          isIn: [[
            'uploaded_document', 'survey_dataset', 'stakeholder_interview',
            'session_transcript', 'session_notes', 'process_document',
            'external_reference',
          ]],
        },
      },
      label: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      artifact_ref: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
      },
    },
    {
      tableName: 'evidence_sources',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return EvidenceSource;
};

export type { EvidenceSource };
