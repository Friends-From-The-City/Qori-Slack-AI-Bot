'use strict';

/**
 * GOV-3A — Remaining domain checks + uniqueness hardening
 *
 * 1. survey_field_schemas.inferred_role / confirmed_role — SurveyFieldRole enum
 * 2. survey_field_schemas.review_status — review state enum
 * 3. study_variables.scope — scope enum
 * 4. research_studies.brief_status partial uniqueness (no duplicate slugs per project)
 *    — already exists as idx_studies_project_slug (partial). No action needed.
 */

module.exports = {
  async up(queryInterface) {
    const SURVEY_FIELD_ROLES = `('id','nominal','ordinal','continuous','multi_select','open_text','timestamp')`;

    const constraints = [
      // ── survey_field_schemas ──
      {
        table: 'survey_field_schemas',
        name: 'chk_inferred_role',
        check: `inferred_role IN ${SURVEY_FIELD_ROLES}`,
      },
      {
        table: 'survey_field_schemas',
        name: 'chk_confirmed_role',
        check: `confirmed_role IS NULL OR confirmed_role IN ${SURVEY_FIELD_ROLES}`,
      },
      {
        table: 'survey_field_schemas',
        name: 'chk_field_review_status',
        check: `review_status IN ('pending','confirmed','expired')`,
      },

      // ── study_variables ──
      {
        table: 'study_variables',
        name: 'chk_variable_scope',
        check: `scope IS NULL OR scope IN ('study','discovery')`,
      },
    ];

    for (const c of constraints) {
      await queryInterface.sequelize.query(
        `ALTER TABLE "${c.table}" ADD CONSTRAINT "${c.name}" CHECK (${c.check}) NOT VALID`
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "${c.table}" VALIDATE CONSTRAINT "${c.name}"`
      );
    }
  },

  async down(queryInterface) {
    const constraints = [
      { table: 'survey_field_schemas', name: 'chk_inferred_role' },
      { table: 'survey_field_schemas', name: 'chk_confirmed_role' },
      { table: 'survey_field_schemas', name: 'chk_field_review_status' },
      { table: 'study_variables', name: 'chk_variable_scope' },
    ];

    for (const c of constraints) {
      await queryInterface.sequelize.query(
        `ALTER TABLE "${c.table}" DROP CONSTRAINT IF EXISTS "${c.name}"`
      );
    }
  },
};
