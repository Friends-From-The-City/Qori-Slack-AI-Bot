'use strict';

/**
 * WS-0: Organization branding configuration.
 *
 * Bounded branding metadata per organization — display name, logo,
 * favicon, theme tokens, public hostname. No arbitrary CSS/JS injection.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('organization_branding', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'CASCADE',
      },
      display_name: { type: Sequelize.TEXT, allowNull: true },
      short_name: { type: Sequelize.STRING(50), allowNull: true },
      logo_asset_ref: { type: Sequelize.TEXT, allowNull: true },
      logo_alt_text: { type: Sequelize.TEXT, allowNull: true },
      logo_content_type: { type: Sequelize.STRING(50), allowNull: true },
      logo_size_bytes: { type: Sequelize.INTEGER, allowNull: true },
      favicon_asset_ref: { type: Sequelize.TEXT, allowNull: true },
      theme_tokens: { type: Sequelize.JSONB, allowNull: true, defaultValue: {} },
      public_url: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('organization_branding');
  },
};
