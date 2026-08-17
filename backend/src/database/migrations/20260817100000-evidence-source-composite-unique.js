'use strict';

/**
 * PH-5A: Add composite unique partial index to evidence_sources.
 *
 * Dedup key: (semantic_key, content_hash) from artifact_ref JSONB.
 * - Same semantic_key + same content_hash → reuse existing source
 * - Same semantic_key + different content_hash → new version allowed
 * - semantic_key alone is NOT unique (supports versioning)
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_evidence_sources_semantic_content
      ON evidence_sources ((artifact_ref->>'semantic_key'), (artifact_ref->>'content_hash'))
      WHERE artifact_ref->>'semantic_key' IS NOT NULL
        AND artifact_ref->>'content_hash' IS NOT NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_evidence_sources_semantic_content;
    `);
  },
};
