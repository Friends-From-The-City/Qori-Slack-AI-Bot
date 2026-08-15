/**
 * SurveyCode Model
 *
 * Per Survey Slice 2A: Individual code within a versioned codebook.
 * Proposed by Qori, accepted/edited/removed by researcher.
 * No authoritative frequency counts stored here — counts computed
 * from accepted coding assignments in Slice 2B.
 */

import {
  DataTypes, Model,
  type InferAttributes, type InferCreationAttributes, type CreationOptional, type Sequelize,
} from 'sequelize';
import { randomUUID } from 'crypto';

export type CodeOrigin = 'qori_proposed' | 'researcher_added' | 'inherited';
export type CodeStatus = 'proposed' | 'accepted' | 'removed';

class SurveyCode extends Model<
  InferAttributes<SurveyCode>, InferCreationAttributes<SurveyCode>
> {
  declare id: CreationOptional<number>;
  declare public_id: CreationOptional<string>;
  declare codebook_id: number;
  declare code_key: string;
  declare label: string;
  declare definition: string;
  declare include_when: string;
  declare exclude_when: string | null;
  declare origin: CreationOptional<CodeOrigin>;
  declare status: CreationOptional<CodeStatus>;
  declare sort_order: CreationOptional<number>;
  declare metadata: Record<string, unknown>;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.SurveyCodebook, { foreignKey: 'codebook_id', as: 'codebook', onDelete: 'CASCADE' });
  }
}

export default (sequelize: Sequelize) => {
  SurveyCode.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      public_id: { type: DataTypes.UUID, allowNull: false, unique: true, defaultValue: () => randomUUID() },
      codebook_id: { type: DataTypes.INTEGER, allowNull: false },
      code_key: { type: DataTypes.TEXT, allowNull: false },
      label: { type: DataTypes.TEXT, allowNull: false },
      definition: { type: DataTypes.TEXT, allowNull: false },
      include_when: { type: DataTypes.TEXT, allowNull: false },
      exclude_when: { type: DataTypes.TEXT, allowNull: true },
      origin: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'qori_proposed' },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'proposed' },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    },
    { tableName: 'survey_codes', underscored: true, timestamps: false, sequelize },
  );
  return SurveyCode;
};

export type { SurveyCode };
