// models/repository_binding.ts
//
// PLAT-2: Maps GitHub repositories to org/team/project scope.
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

class RepositoryBinding extends Model<
  InferAttributes<RepositoryBinding>,
  InferCreationAttributes<RepositoryBinding>
> {
  declare id: CreationOptional<number>;
  declare organization_id: ForeignKey<number>;
  declare team_id: ForeignKey<number> | null;
  declare project_id: ForeignKey<number> | null;
  declare provider: string;
  declare owner: string;
  declare repository: string;
  declare default_branch: string | null;
  declare status: CreationOptional<string>;
  declare created_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization', onDelete: 'CASCADE' });
    this.belongsTo(models.Team, { foreignKey: 'team_id', as: 'team', onDelete: 'SET NULL' });
    this.belongsTo(models.Project, { foreignKey: 'project_id', as: 'project', onDelete: 'SET NULL' });
  }
}

export default (sequelize: Sequelize) => {
  RepositoryBinding.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: false },
      team_id: { type: DataTypes.INTEGER, allowNull: true },
      project_id: { type: DataTypes.INTEGER, allowNull: true },
      provider: { type: DataTypes.TEXT, allowNull: false },
      owner: { type: DataTypes.TEXT, allowNull: false },
      repository: { type: DataTypes.TEXT, allowNull: false },
      default_branch: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'active',
        validate: { isIn: [['active', 'inactive']] },
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    },
    { tableName: 'repository_bindings', underscored: true, timestamps: false, sequelize },
  );

  return RepositoryBinding;
};

export type { RepositoryBinding };
