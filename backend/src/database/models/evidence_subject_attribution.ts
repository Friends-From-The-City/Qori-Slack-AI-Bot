/**
 * EvidenceSubjectAttribution Model
 *
 * GOV-2B: Canonical FK-based path from a data subject to evidence constructs
 * that contain or derive directly from that subject's data.
 *
 * attribution_type classifies HOW the subject's data appears:
 * - direct_quote: verbatim participant quote in construct payload
 * - paraphrase: researcher/model paraphrase of subject statement
 * - observation: observed subject behavior
 * - survey_response: survey answer linked via respondent_key
 * - behavioral_data: measured subject behavior/task completion
 *
 * After G2-B, runtime DSAR traversal uses:
 *   data_subject → evidence_subject_attributions → evidence_constructs
 * No payload/prose matching needed.
 */

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type ForeignKey,
  type Sequelize,
} from 'sequelize';

export type AttributionType =
  | 'direct_quote'
  | 'paraphrase'
  | 'observation'
  | 'survey_response'
  | 'behavioral_data';

class EvidenceSubjectAttribution extends Model<
  InferAttributes<EvidenceSubjectAttribution>,
  InferCreationAttributes<EvidenceSubjectAttribution>
> {
  declare id: CreationOptional<number>;
  declare construct_id: ForeignKey<number>;
  declare data_subject_id: ForeignKey<number>;
  declare attribution_type: AttributionType;
  declare evidence_source_id: ForeignKey<number> | null;
  declare created_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.EvidenceConstruct, {
      foreignKey: 'construct_id',
      as: 'construct',
      onDelete: 'CASCADE',
    });
    this.belongsTo(models.DataSubject, {
      foreignKey: 'data_subject_id',
      as: 'dataSubject',
      onDelete: 'CASCADE',
    });
    this.belongsTo(models.EvidenceSource, {
      foreignKey: 'evidence_source_id',
      as: 'evidenceSource',
      onDelete: 'SET NULL',
    });
  }
}

export default (sequelize: Sequelize) => {
  EvidenceSubjectAttribution.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      construct_id: { type: DataTypes.INTEGER, allowNull: false },
      data_subject_id: { type: DataTypes.INTEGER, allowNull: false },
      attribution_type: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: {
          isIn: [['direct_quote', 'paraphrase', 'observation', 'survey_response', 'behavioral_data']],
        },
      },
      evidence_source_id: { type: DataTypes.INTEGER, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'EvidenceSubjectAttribution',
      tableName: 'evidence_subject_attributions',
      timestamps: false,
    },
  );

  return EvidenceSubjectAttribution;
};

export type { EvidenceSubjectAttribution };
