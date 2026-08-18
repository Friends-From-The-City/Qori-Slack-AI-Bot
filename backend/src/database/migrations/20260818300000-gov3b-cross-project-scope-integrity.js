'use strict';

/**
 * GOV-3B — Cross-Project Canonical Scope Integrity
 *
 * Makes PostgreSQL itself prevent canonical relationships from linking
 * objects across project boundaries.
 *
 * Strategy:
 * 1. Add UNIQUE(project_id, id) to parent tables (evidence_sources,
 *    evidence_constructs, research_artifacts) — needed as composite FK targets.
 *    These are semantically guaranteed unique since id is the PK.
 *
 * 2. Add project_id to evidence_relationships and artifact_evidence_refs.
 *
 * 3. Backfill project_id from canonical parents.
 *
 * 4. Add composite FKs so referenced records must share the same project_id.
 *
 * 5. Make project_id NOT NULL.
 *
 * Result: PostgreSQL will reject any INSERT/UPDATE that would link objects
 * from different projects — the composite FK enforces that the relationship's
 * project_id matches every endpoint's project_id.
 */

module.exports = {
  async up(queryInterface) {
    // ──────────────────────────────────────────────────────────
    // STEP 1: Add UNIQUE(project_id, id) to parent tables
    //         Required as composite FK targets
    // ──────────────────────────────────────────────────────────
    await queryInterface.sequelize.query(
      `ALTER TABLE evidence_sources
       ADD CONSTRAINT uq_evidence_sources_project_id UNIQUE (project_id, id)`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE evidence_constructs
       ADD CONSTRAINT uq_evidence_constructs_project_id UNIQUE (project_id, id)`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE research_artifacts
       ADD CONSTRAINT uq_research_artifacts_project_id UNIQUE (project_id, id)`
    );

    // ──────────────────────────────────────────────────────────
    // STEP 2: Add nullable project_id to junction tables
    // ──────────────────────────────────────────────────────────
    await queryInterface.sequelize.query(
      `ALTER TABLE evidence_relationships ADD COLUMN project_id INTEGER`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE artifact_evidence_refs ADD COLUMN project_id INTEGER`
    );

    // ──────────────────────────────────────────────────────────
    // STEP 3: Backfill project_id from canonical parents
    // ──────────────────────────────────────────────────────────

    // evidence_relationships: derive from whichever "from" endpoint is populated
    await queryInterface.sequelize.query(`
      UPDATE evidence_relationships er
      SET project_id = COALESCE(
        (SELECT es.project_id FROM evidence_sources es WHERE es.id = er.from_source_id),
        (SELECT ec.project_id FROM evidence_constructs ec WHERE ec.id = er.from_construct_id)
      )
      WHERE er.project_id IS NULL
    `);

    // artifact_evidence_refs: derive from the artifact
    await queryInterface.sequelize.query(`
      UPDATE artifact_evidence_refs aer
      SET project_id = (SELECT ra.project_id FROM research_artifacts ra WHERE ra.id = aer.artifact_id)
      WHERE aer.project_id IS NULL
    `);

    // ──────────────────────────────────────────────────────────
    // STEP 3b: Verify no NULL or conflicting project_id
    // ──────────────────────────────────────────────────────────

    // Check evidence_relationships: no NULL project_id remaining
    const [erNulls] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM evidence_relationships WHERE project_id IS NULL`
    );
    if (parseInt(erNulls[0].cnt, 10) > 0) {
      throw new Error(
        `GOV-3B PREFLIGHT FAILED: ${erNulls[0].cnt} evidence_relationships rows ` +
        `have NULL project_id after backfill. Investigate before proceeding.`
      );
    }

    // Check evidence_relationships: no cross-project endpoint conflicts
    const [erConflicts] = await queryInterface.sequelize.query(`
      SELECT er.id, er.project_id AS rel_pid,
        COALESCE(
          (SELECT es.project_id FROM evidence_sources es WHERE es.id = er.to_source_id),
          (SELECT ec.project_id FROM evidence_constructs ec WHERE ec.id = er.to_construct_id)
        ) AS to_pid
      FROM evidence_relationships er
      WHERE er.project_id != COALESCE(
        (SELECT es.project_id FROM evidence_sources es WHERE es.id = er.to_source_id),
        (SELECT ec.project_id FROM evidence_constructs ec WHERE ec.id = er.to_construct_id)
      )
    `);
    if (erConflicts.length > 0) {
      throw new Error(
        `GOV-3B PREFLIGHT FAILED: ${erConflicts.length} evidence_relationships rows ` +
        `have cross-project endpoints. IDs: ${erConflicts.map(r => r.id).join(', ')}. ` +
        `Investigate before proceeding.`
      );
    }

    // Check artifact_evidence_refs: no NULL project_id remaining
    const [aerNulls] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM artifact_evidence_refs WHERE project_id IS NULL`
    );
    if (parseInt(aerNulls[0].cnt, 10) > 0) {
      throw new Error(
        `GOV-3B PREFLIGHT FAILED: ${aerNulls[0].cnt} artifact_evidence_refs rows ` +
        `have NULL project_id after backfill. Investigate before proceeding.`
      );
    }

    // Check artifact_evidence_refs: no cross-project construct refs
    const [aerConflicts] = await queryInterface.sequelize.query(`
      SELECT aer.id, aer.project_id AS ref_pid,
        (SELECT ec.project_id FROM evidence_constructs ec WHERE ec.id = aer.construct_id) AS construct_pid
      FROM artifact_evidence_refs aer
      WHERE aer.project_id != (SELECT ec.project_id FROM evidence_constructs ec WHERE ec.id = aer.construct_id)
    `);
    if (aerConflicts.length > 0) {
      throw new Error(
        `GOV-3B PREFLIGHT FAILED: ${aerConflicts.length} artifact_evidence_refs rows ` +
        `have cross-project construct references. IDs: ${aerConflicts.map(r => r.id).join(', ')}. ` +
        `Investigate before proceeding.`
      );
    }

    // ──────────────────────────────────────────────────────────
    // STEP 4: Add composite FKs (project_id, endpoint_id)
    //         These enforce same-project scope structurally
    // ──────────────────────────────────────────────────────────

    // evidence_relationships — composite FKs for all 4 endpoint columns
    // from_source_id: (project_id, from_source_id) → evidence_sources(project_id, id)
    await queryInterface.sequelize.query(`
      ALTER TABLE evidence_relationships
      ADD CONSTRAINT fk_er_from_source_project
      FOREIGN KEY (project_id, from_source_id)
      REFERENCES evidence_sources(project_id, id)
      ON DELETE CASCADE
      NOT VALID
    `);
    await queryInterface.sequelize.query(
      `ALTER TABLE evidence_relationships VALIDATE CONSTRAINT fk_er_from_source_project`
    );

    // from_construct_id: (project_id, from_construct_id) → evidence_constructs(project_id, id)
    await queryInterface.sequelize.query(`
      ALTER TABLE evidence_relationships
      ADD CONSTRAINT fk_er_from_construct_project
      FOREIGN KEY (project_id, from_construct_id)
      REFERENCES evidence_constructs(project_id, id)
      ON DELETE CASCADE
      NOT VALID
    `);
    await queryInterface.sequelize.query(
      `ALTER TABLE evidence_relationships VALIDATE CONSTRAINT fk_er_from_construct_project`
    );

    // to_source_id: (project_id, to_source_id) → evidence_sources(project_id, id)
    await queryInterface.sequelize.query(`
      ALTER TABLE evidence_relationships
      ADD CONSTRAINT fk_er_to_source_project
      FOREIGN KEY (project_id, to_source_id)
      REFERENCES evidence_sources(project_id, id)
      ON DELETE CASCADE
      NOT VALID
    `);
    await queryInterface.sequelize.query(
      `ALTER TABLE evidence_relationships VALIDATE CONSTRAINT fk_er_to_source_project`
    );

    // to_construct_id: (project_id, to_construct_id) → evidence_constructs(project_id, id)
    await queryInterface.sequelize.query(`
      ALTER TABLE evidence_relationships
      ADD CONSTRAINT fk_er_to_construct_project
      FOREIGN KEY (project_id, to_construct_id)
      REFERENCES evidence_constructs(project_id, id)
      ON DELETE CASCADE
      NOT VALID
    `);
    await queryInterface.sequelize.query(
      `ALTER TABLE evidence_relationships VALIDATE CONSTRAINT fk_er_to_construct_project`
    );

    // artifact_evidence_refs — composite FKs for both columns
    // artifact_id: (project_id, artifact_id) → research_artifacts(project_id, id)
    await queryInterface.sequelize.query(`
      ALTER TABLE artifact_evidence_refs
      ADD CONSTRAINT fk_aer_artifact_project
      FOREIGN KEY (project_id, artifact_id)
      REFERENCES research_artifacts(project_id, id)
      ON DELETE CASCADE
      NOT VALID
    `);
    await queryInterface.sequelize.query(
      `ALTER TABLE artifact_evidence_refs VALIDATE CONSTRAINT fk_aer_artifact_project`
    );

    // construct_id: (project_id, construct_id) → evidence_constructs(project_id, id)
    await queryInterface.sequelize.query(`
      ALTER TABLE artifact_evidence_refs
      ADD CONSTRAINT fk_aer_construct_project
      FOREIGN KEY (project_id, construct_id)
      REFERENCES evidence_constructs(project_id, id)
      ON DELETE CASCADE
      NOT VALID
    `);
    await queryInterface.sequelize.query(
      `ALTER TABLE artifact_evidence_refs VALIDATE CONSTRAINT fk_aer_construct_project`
    );

    // ──────────────────────────────────────────────────────────
    // STEP 5: Make project_id NOT NULL
    // ──────────────────────────────────────────────────────────
    await queryInterface.sequelize.query(
      `ALTER TABLE evidence_relationships ALTER COLUMN project_id SET NOT NULL`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE artifact_evidence_refs ALTER COLUMN project_id SET NOT NULL`
    );

    // ──────────────────────────────────────────────────────────
    // STEP 6: Add simple FK to projects for CASCADE + query use
    // ──────────────────────────────────────────────────────────
    await queryInterface.sequelize.query(`
      ALTER TABLE evidence_relationships
      ADD CONSTRAINT fk_er_project
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE artifact_evidence_refs
      ADD CONSTRAINT fk_aer_project
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    `);

    // Index for project-scoped queries
    await queryInterface.sequelize.query(
      `CREATE INDEX idx_evidence_relationships_project ON evidence_relationships (project_id)`
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX idx_artifact_evidence_refs_project ON artifact_evidence_refs (project_id)`
    );
  },

  async down(queryInterface) {
    // Drop indexes
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS idx_artifact_evidence_refs_project`
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS idx_evidence_relationships_project`
    );

    // Drop simple project FKs
    await queryInterface.sequelize.query(
      `ALTER TABLE artifact_evidence_refs DROP CONSTRAINT IF EXISTS fk_aer_project`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE evidence_relationships DROP CONSTRAINT IF EXISTS fk_er_project`
    );

    // Drop composite FKs
    await queryInterface.sequelize.query(
      `ALTER TABLE artifact_evidence_refs DROP CONSTRAINT IF EXISTS fk_aer_construct_project`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE artifact_evidence_refs DROP CONSTRAINT IF EXISTS fk_aer_artifact_project`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE evidence_relationships DROP CONSTRAINT IF EXISTS fk_er_to_construct_project`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE evidence_relationships DROP CONSTRAINT IF EXISTS fk_er_to_source_project`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE evidence_relationships DROP CONSTRAINT IF EXISTS fk_er_from_construct_project`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE evidence_relationships DROP CONSTRAINT IF EXISTS fk_er_from_source_project`
    );

    // Drop project_id columns
    await queryInterface.sequelize.query(
      `ALTER TABLE artifact_evidence_refs DROP COLUMN IF EXISTS project_id`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE evidence_relationships DROP COLUMN IF EXISTS project_id`
    );

    // Drop parent UNIQUE constraints
    await queryInterface.sequelize.query(
      `ALTER TABLE research_artifacts DROP CONSTRAINT IF EXISTS uq_research_artifacts_project_id`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE evidence_constructs DROP CONSTRAINT IF EXISTS uq_evidence_constructs_project_id`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE evidence_sources DROP CONSTRAINT IF EXISTS uq_evidence_sources_project_id`
    );
  },
};
