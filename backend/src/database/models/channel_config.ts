// models/channel_config.ts

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from 'sequelize';

class ChannelConfig extends Model<
  InferAttributes<ChannelConfig>,
  InferCreationAttributes<ChannelConfig>
> {
  // — Attributes —
  declare id: CreationOptional<number>;
  declare channel_id: string;
  declare github_id: string | null;
  declare repo_id: string | null;
  declare repo: string | null;
  declare product_folder_name: string | null;
  declare sub_folder_name: string | null;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  // — Associations —
  static associate(_models: Record<string, any>) {
    // No associations
  }
}

export default (sequelize: Sequelize) => {
  ChannelConfig.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      channel_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      github_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      repo_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      repo: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      product_folder_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      sub_folder_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
      },
    },
    {
      tableName: 'channel_config',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return ChannelConfig;
};

export type { ChannelConfig };
