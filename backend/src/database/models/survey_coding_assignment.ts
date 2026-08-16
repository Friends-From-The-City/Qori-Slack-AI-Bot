import { DataTypes, Model, type InferAttributes, type InferCreationAttributes, type CreationOptional, type Sequelize } from 'sequelize';
import { randomUUID } from 'crypto';

export type AssignmentOrigin = 'qori_proposed' | 'researcher_added';
export type AssignmentStatus = 'proposed' | 'accepted' | 'rejected';

class SurveyCodingAssignment extends Model<InferAttributes<SurveyCodingAssignment>, InferCreationAttributes<SurveyCodingAssignment>> {
  declare id: CreationOptional<number>;
  declare public_id: CreationOptional<string>;
  declare coding_run_id: number;
  declare qualitative_entry_id: number;
  declare code_id: number;
  declare origin: CreationOptional<AssignmentOrigin>;
  declare status: CreationOptional<AssignmentStatus>;
  declare rationale: string | null;
  declare reviewed_by: string | null;
  declare reviewed_at: Date | null;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.SurveyCodingRun, { foreignKey: 'coding_run_id', onDelete: 'CASCADE' });
    this.belongsTo(models.SurveyQualitativeEntry, { foreignKey: 'qualitative_entry_id', onDelete: 'CASCADE' });
    this.belongsTo(models.SurveyCode, { foreignKey: 'code_id', onDelete: 'CASCADE' });
  }
}

export default (sequelize: Sequelize) => {
  SurveyCodingAssignment.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    public_id: { type: DataTypes.UUID, allowNull: false, unique: true, defaultValue: () => randomUUID() },
    coding_run_id: { type: DataTypes.INTEGER, allowNull: false },
    qualitative_entry_id: { type: DataTypes.INTEGER, allowNull: false },
    code_id: { type: DataTypes.INTEGER, allowNull: false },
    origin: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'qori_proposed' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'proposed' },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    reviewed_by: { type: DataTypes.STRING(50), allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'survey_coding_assignments', underscored: true, timestamps: false, sequelize });
  return SurveyCodingAssignment;
};

export type { SurveyCodingAssignment };
