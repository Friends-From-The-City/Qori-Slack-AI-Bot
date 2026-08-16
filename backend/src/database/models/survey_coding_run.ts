import { DataTypes, Model, type InferAttributes, type InferCreationAttributes, type CreationOptional, type Sequelize } from 'sequelize';
import { randomUUID } from 'crypto';

export type CodingRunStatus = 'draft' | 'under_review' | 'accepted' | 'superseded';

class SurveyCodingRun extends Model<InferAttributes<SurveyCodingRun>, InferCreationAttributes<SurveyCodingRun>> {
  declare id: CreationOptional<number>;
  declare public_id: CreationOptional<string>;
  declare evidence_source_id: number;
  declare codebook_id: number;
  declare project_id: number;
  declare study_id: number | null;
  declare version: CreationOptional<number>;
  declare status: CreationOptional<CodingRunStatus>;
  declare based_on_run_id: number | null;
  declare generation_metadata: Record<string, unknown>;
  declare created_by: string;
  declare reviewed_by: string | null;
  declare reviewed_at: Date | null;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.EvidenceSource, { foreignKey: 'evidence_source_id', onDelete: 'CASCADE' });
    this.belongsTo(models.SurveyCodebook, { foreignKey: 'codebook_id', onDelete: 'CASCADE' });
    this.belongsTo(models.Project, { foreignKey: 'project_id', onDelete: 'CASCADE' });
    this.belongsTo(models.ResearchStudy, { foreignKey: 'study_id', onDelete: 'CASCADE' });
  }
}

export default (sequelize: Sequelize) => {
  SurveyCodingRun.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    public_id: { type: DataTypes.UUID, allowNull: false, unique: true, defaultValue: () => randomUUID() },
    evidence_source_id: { type: DataTypes.INTEGER, allowNull: false },
    codebook_id: { type: DataTypes.INTEGER, allowNull: false },
    project_id: { type: DataTypes.INTEGER, allowNull: false },
    study_id: { type: DataTypes.INTEGER, allowNull: true },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    based_on_run_id: { type: DataTypes.INTEGER, allowNull: true },
    generation_metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_by: { type: DataTypes.STRING(50), allowNull: false },
    reviewed_by: { type: DataTypes.STRING(50), allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'survey_coding_runs', underscored: true, timestamps: false, sequelize });
  return SurveyCodingRun;
};

export type { SurveyCodingRun };
