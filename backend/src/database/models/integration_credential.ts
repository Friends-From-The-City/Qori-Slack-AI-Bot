// models/integration_credential.ts
//
// WS-0: Per-org integration credential boundary.
// Stores credential REFERENCES, not raw tokens.
// Raw tokens come from deployment secret infrastructure.

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type ForeignKey,
  type Sequelize,
} from 'sequelize';

export type CredentialStatus = 'active' | 'inactive';

class IntegrationCredential extends Model<
  InferAttributes<IntegrationCredential>,
  InferCreationAttributes<IntegrationCredential>
> {
  declare id: CreationOptional<number>;
  declare organization_id: ForeignKey<number>;
  declare provider: string;
  declare credential_ref: string;
  declare config: Record<string, unknown> | null;
  declare status: CreationOptional<CredentialStatus>;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  static associate(models: Record<string, unknown>) {
    this.belongsTo(models.Organization as any, {
      foreignKey: 'organization_id',
      as: 'organization',
      onDelete: 'CASCADE',
    });
  }
}

export default (sequelize: Sequelize) => {
  IntegrationCredential.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: false },
      provider: { type: DataTypes.STRING(50), allowNull: false },
      credential_ref: { type: DataTypes.TEXT, allowNull: false },
      config: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'active',
        validate: { isIn: [['active', 'inactive']] },
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    },
    { tableName: 'integration_credentials', underscored: true, timestamps: false, sequelize },
  );

  return IntegrationCredential;
};

export type { IntegrationCredential };
