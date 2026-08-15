/**
 * SurveyCodeExample Model
 *
 * Per Survey Slice 2A: FK-backed reference from a code to a qualitative
 * entry. No text duplication — the entry's eligible content is accessed
 * via the governance service.
 */

import {
  DataTypes, Model,
  type InferAttributes, type InferCreationAttributes, type CreationOptional, type Sequelize,
} from 'sequelize';

export type ExampleType = 'include' | 'boundary' | 'exclude';

class SurveyCodeExample extends Model<
  InferAttributes<SurveyCodeExample>, InferCreationAttributes<SurveyCodeExample>
> {
  declare id: CreationOptional<number>;
  declare code_id: number;
  declare qualitative_entry_id: number;
  declare example_type: CreationOptional<ExampleType>;
  declare created_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.SurveyCode, { foreignKey: 'code_id', as: 'code', onDelete: 'CASCADE' });
    this.belongsTo(models.SurveyQualitativeEntry, { foreignKey: 'qualitative_entry_id', as: 'entry', onDelete: 'CASCADE' });
  }
}

export default (sequelize: Sequelize) => {
  SurveyCodeExample.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      code_id: { type: DataTypes.INTEGER, allowNull: false },
      qualitative_entry_id: { type: DataTypes.INTEGER, allowNull: false },
      example_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'include' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    },
    { tableName: 'survey_code_examples', underscored: true, timestamps: false, sequelize },
  );
  return SurveyCodeExample;
};

export type { SurveyCodeExample };
