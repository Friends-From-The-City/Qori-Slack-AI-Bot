// models/actor_identity.ts
//
// PLAT-2: Maps provider identities to canonical actors.
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
// CreationOptional imported above for metadata default

export type IdentityProvider = 'slack' | 'oidc' | 'saml' | 'local_test';

class ActorIdentity extends Model<
  InferAttributes<ActorIdentity>,
  InferCreationAttributes<ActorIdentity>
> {
  declare id: CreationOptional<number>;
  declare actor_id: ForeignKey<number>;
  declare provider: IdentityProvider;
  declare provider_issuer: CreationOptional<string | null>;
  declare provider_subject: string;
  declare metadata: CreationOptional<Record<string, unknown>>;
  declare created_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.Actor, { foreignKey: 'actor_id', as: 'actor', onDelete: 'CASCADE' });
  }
}

export default (sequelize: Sequelize) => {
  ActorIdentity.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      actor_id: { type: DataTypes.INTEGER, allowNull: false },
      provider: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: { isIn: [['slack', 'oidc', 'saml', 'local_test']] },
      },
      provider_issuer: { type: DataTypes.TEXT, allowNull: true },
      provider_subject: { type: DataTypes.TEXT, allowNull: false },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    },
    { tableName: 'actor_identities', underscored: true, timestamps: false, sequelize },
  );

  return ActorIdentity;
};

export type { ActorIdentity };
