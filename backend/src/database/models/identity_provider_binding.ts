/**
 * IdentityProviderBinding Model — PLAT-3
 *
 * Maps OIDC/SAML issuers to organizations. Separate from
 * AdapterWorkspaceBinding because Slack workspace mappings and
 * identity provider issuers are different domain concepts.
 *
 * Invariant: (provider, issuer_url) uniquely resolves to exactly one
 * organization when status='active'. Enforced by partial unique index.
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

export type IdpProvider = 'oidc' | 'saml';
export type IdpBindingStatus = 'active' | 'inactive';

class IdentityProviderBinding extends Model<
  InferAttributes<IdentityProviderBinding>,
  InferCreationAttributes<IdentityProviderBinding>
> {
  declare id: CreationOptional<number>;
  declare organization_id: ForeignKey<number>;
  declare provider: IdpProvider;
  declare issuer_url: string;
  declare client_id: string | null;
  declare status: CreationOptional<IdpBindingStatus>;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.Organization, {
      foreignKey: 'organization_id',
      as: 'organization',
      onDelete: 'CASCADE',
    });
  }
}

export default (sequelize: Sequelize) => {
  IdentityProviderBinding.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: false },
      provider: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: { isIn: [['oidc', 'saml']] },
      },
      issuer_url: { type: DataTypes.TEXT, allowNull: false },
      client_id: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'active',
        validate: { isIn: [['active', 'inactive']] },
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    },
    { tableName: 'identity_provider_bindings', underscored: true, timestamps: false, sequelize },
  );
  return IdentityProviderBinding;
};

export type { IdentityProviderBinding };
