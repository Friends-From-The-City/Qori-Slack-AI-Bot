import { DataTypes, Model, type InferAttributes, type InferCreationAttributes, type CreationOptional, type Sequelize } from 'sequelize';

export type EntryReviewStatus = 'pending' | 'reviewed' | 'no_grouping_applies' | 'uncodable';

class SurveyCodingEntryReview extends Model<InferAttributes<SurveyCodingEntryReview>, InferCreationAttributes<SurveyCodingEntryReview>> {
  declare id: CreationOptional<number>;
  declare coding_run_id: number;
  declare qualitative_entry_id: number;
  declare status: CreationOptional<EntryReviewStatus>;
  declare reviewed_by: string | null;
  declare reviewed_at: Date | null;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.SurveyCodingRun, { foreignKey: 'coding_run_id', onDelete: 'CASCADE' });
    this.belongsTo(models.SurveyQualitativeEntry, { foreignKey: 'qualitative_entry_id', onDelete: 'CASCADE' });
  }
}

export default (sequelize: Sequelize) => {
  SurveyCodingEntryReview.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    coding_run_id: { type: DataTypes.INTEGER, allowNull: false },
    qualitative_entry_id: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    reviewed_by: { type: DataTypes.STRING(50), allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
  }, { tableName: 'survey_coding_entry_reviews', underscored: true, timestamps: false, sequelize });
  return SurveyCodingEntryReview;
};

export type { SurveyCodingEntryReview };
