// models/organization_branding.ts
//
// WS-0: Bounded branding configuration per organization.
// No arbitrary CSS/JS injection. Validated content types for logos.

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type ForeignKey,
  type Sequelize,
} from 'sequelize';

/** Allowed logo content types */
export const ALLOWED_LOGO_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/webp',
] as const;

/** Maximum logo file size: 2MB */
export const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;

class OrganizationBranding extends Model<
  InferAttributes<OrganizationBranding>,
  InferCreationAttributes<OrganizationBranding>
> {
  declare id: CreationOptional<number>;
  declare organization_id: ForeignKey<number>;
  declare display_name: string | null;
  declare short_name: string | null;
  declare logo_asset_ref: string | null;
  declare logo_alt_text: string | null;
  declare logo_content_type: string | null;
  declare logo_size_bytes: number | null;
  declare favicon_asset_ref: string | null;
  declare theme_tokens: Record<string, unknown> | null;
  declare public_url: string | null;
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
  OrganizationBranding.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      display_name: { type: DataTypes.TEXT, allowNull: true },
      short_name: { type: DataTypes.STRING(50), allowNull: true },
      logo_asset_ref: { type: DataTypes.TEXT, allowNull: true },
      logo_alt_text: { type: DataTypes.TEXT, allowNull: true },
      logo_content_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        validate: {
          isIn: [ALLOWED_LOGO_CONTENT_TYPES as unknown as string[]],
        },
      },
      logo_size_bytes: { type: DataTypes.INTEGER, allowNull: true },
      favicon_asset_ref: { type: DataTypes.TEXT, allowNull: true },
      theme_tokens: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
      public_url: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    },
    { tableName: 'organization_branding', underscored: true, timestamps: false, sequelize },
  );

  return OrganizationBranding;
};

export type { OrganizationBranding };
