/**
 * EvidenceConstruct Model
 *
 * Per ADRs 0028-0030: A typed research object with stable database identity,
 * structured payload, derivation metadata, and acceptance status.
 *
 * Constructs represent meaningful research objects that persist independently
 * of rendered documents: knowledge gaps, barriers, findings, recommendations,
 * themes, nuggets, etc.
 *
 * Identity (ADR 0030):
 *   id        — internal relational PK
 *   public_id — durable UUID for external references, exports, provenance
 *
 * The typed core + JSONB payload pattern avoids a separate table per construct
 * type while keeping identity and lineage relational.
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

export type ConstructType =
  | 'knowledge_gap'
  | 'barrier'
  | 'research_question'
  | 'stakeholder_constraint'
  | 'nugget'
  | 'survey_pattern'
  | 'survey_dataset_summary'
  | 'field_distribution'
  | 'cross_tab'
  | 'usability_finding'
  | 'journey_stage'
  | 'recommendation'
  | 'finding'
  | 'theme'
  | 'persona'
  | 'ticket_candidate'
  | 'survey_qualitative_pattern'
  | 'survey_individual_observation';

export type DerivationType = 'deterministic' | 'model' | 'human' | 'hybrid';

export type ConstructStatus = 'candidate' | 'accepted' | 'rejected' | 'overridden';

export interface DerivationContext {
  model_name?: string;
  model_version?: string;
  template_id?: string;
  template_version?: string;
  method?: string;
  [key: string]: unknown;
}

class EvidenceConstruct extends Model<
  InferAttributes<EvidenceConstruct>,
  InferCreationAttributes<EvidenceConstruct>
> {
  declare id: CreationOptional<number>;
  declare public_id: CreationOptional<string>;
  declare project_id: number;
  declare study_id: number | null;
  declare construct_type: ConstructType;
  declare label: string | null;
  declare payload: Record<string, unknown> | null;
  declare derivation_type: CreationOptional<DerivationType>;
  declare derivation_context: DerivationContext | null;
  declare status: CreationOptional<ConstructStatus>;
  declare reviewed_by: string | null;
  declare reviewed_at: Date | null;
  declare cascade_variable_key: string | null;
  declare created_by: string;
  /** GOV-2B: Underlying evidence was affected by a governed disposition event.
   * Orthogonal to review status (candidate/accepted/rejected/overridden). */
  declare stale_due_to_disposition: CreationOptional<boolean>;
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
  EvidenceConstruct.init(
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
      construct_type: {
        type: DataTypes.STRING(80),
        allowNull: false,
        validate: {
          isIn: [[
            'knowledge_gap', 'barrier', 'research_question',
            'stakeholder_constraint', 'nugget', 'survey_pattern',
            'survey_dataset_summary', 'field_distribution', 'cross_tab',
            'usability_finding', 'journey_stage', 'recommendation',
            'finding', 'theme', 'persona', 'ticket_candidate',
            'survey_qualitative_pattern', 'survey_individual_observation',
          ]],
        },
      },
      label: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      payload: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      derivation_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'model',
        validate: {
          isIn: [['deterministic', 'model', 'human', 'hybrid']],
        },
      },
      derivation_context: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'candidate',
        validate: {
          isIn: [['candidate', 'accepted', 'rejected', 'overridden']],
        },
      },
      reviewed_by: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      reviewed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      cascade_variable_key: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      created_by: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      stale_due_to_disposition: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
      tableName: 'evidence_constructs',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return EvidenceConstruct;
};

export type { EvidenceConstruct };
