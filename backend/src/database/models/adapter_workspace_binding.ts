// models/adapter_workspace_binding.ts
//
// PLAT-2: Maps Slack workspaces (and future adapters) to organizations.
// See ADR 0042.

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type ForeignKey,
  type Sequelize,
} from 'sequelize';

class AdapterWorkspaceBinding extends Model<
  InferAttributes<AdapterWorkspaceBinding>,
  InferCreationAttributes<AdapterWorkspaceBinding>
> {
  declare id: CreationOptional<number>;
  declare organization_id: ForeignKey<number>;
  declare provider: string;
  declare workspace_external_id: string;
  declare status: CreationOptional<string>;
  declare created_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization', onDelete: 'CASCADE' });
  }
}

export default (sequelize: Sequelize) => {
  AdapterWorkspaceBinding.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: false },
      provider: { type: DataTypes.TEXT, allowNull: false },
      workspace_external_id: { type: DataTypes.TEXT, allowNull: false },
      status: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'active',
        validate: { isIn: [['active', 'inactive']] },
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    },
    { tableName: 'adapter_workspace_bindings', underscored: true, timestamps: false, sequelize },
  );

  return AdapterWorkspaceBinding;
};

export type { AdapterWorkspaceBinding };
