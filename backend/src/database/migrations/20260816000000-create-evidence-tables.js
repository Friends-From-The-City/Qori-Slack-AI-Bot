'use strict';

/**
 * Migration: Create evidence foundation tables
 *
 * Per ADRs 0028-0030: Introduces the canonical evidence layer alongside
 * the existing cascade variable store. Three tables:
 *
 *   evidence_sources      — metadata about evidence-bearing inputs
 *   evidence_constructs   — typed research objects with stable IDs
 *   evidence_relationships — directed typed edges (lineage graph)
 *
 * All tables are additive. The existing cascade pipeline (study_variables)
 * is unchanged. The application operates normally when these tables are empty.
 *
 * Identity: Each table has an integer PK (internal joins) and a UUID
 * public_id (durable external identity per ADR 0030).
 *
 * FK behavior:
 *   - project_id: CASCADE (project deletion removes its evidence)
 *   - study_id: CASCADE (study deletion removes study-scoped evidence;
 *     project-scoped discovery evidence has study_id = NULL and is unaffected)
 *   - relationship FKs: CASCADE (deleting a source or construct removes
 *     its relationship edges)
 *
 * Lineage integrity:
 *   - Relationship endpoints use real FK columns (from_source_id,
 *     from_construct_id, to_source_id, to_construct_id) with CHECK
 *     constraints enforcing exactly one FROM and one TO endpoint.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // ── evidence_sources ──────────────────────────────────────────────
    await queryInterface.createTable('evidence_sources', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      public_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        comment: 'Durable external identity — stable across regeneration',
      },

      // Scope
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
      study_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'research_studies', key: 'id' },
        onDelete: 'CASCADE',
        comment: 'NULL for project-scoped discovery sources; CASCADE deletes study-scoped sources with study',
      },

      // Source identity
      source_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'uploaded_document | survey_dataset | stakeholder_interview | session_transcript | session_notes | process_document | external_reference',
      },
      label: {
        type: Sequelize.STRING(500),
        allowNull: false,
        comment: 'Human-readable label for the source',
      },

      // Artifact reference (pointer to where the content lives)
      artifact_ref: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Reference to source artifact: { github_path, github_sha, study_notes_id, file_url, ... }',
      },

      // Metadata
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Source-type-specific metadata: { participant_count, date_collected, methodology, ... }',
      },

      created_by: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Slack user ID of creator',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // ── evidence_constructs ───────────────────────────────────────────
    await queryInterface.createTable('evidence_constructs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      public_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        comment: 'Durable external identity — stable across regeneration',
      },

      // Scope
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
      study_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'research_studies', key: 'id' },
        onDelete: 'CASCADE',
        comment: 'NULL for project-scoped constructs; CASCADE deletes study-scoped constructs with study',
      },

      // Type and identity
      construct_type: {
        type: Sequelize.STRING(80),
        allowNull: false,
        comment: 'knowledge_gap | barrier | research_question | stakeholder_constraint | nugget | survey_pattern | usability_finding | journey_stage | recommendation | finding | theme | persona | ticket_candidate',
      },
      label: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'Human-readable label; NULL for constructs where the payload IS the label',
      },

      // Structured payload
      payload: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Construct-type-specific structured data',
      },

      // Derivation metadata (ADR 0028)
      derivation_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'model',
        comment: 'deterministic | model | human | hybrid',
      },
      derivation_context: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: '{ model_name, model_version, template_id, template_version, method, ... }',
      },

      // Status (ADR ruling #6: human authority)
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'candidate',
        comment: 'candidate | accepted | rejected | overridden',
      },
      reviewed_by: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Slack user ID of reviewer, if reviewed',
      },
      reviewed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      // Cascade cross-reference
      cascade_variable_key: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Corresponding study_variables.variable_key, if projected to cascade',
      },

      created_by: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Slack user ID of creator',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // ── evidence_relationships ────────────────────────────────────────
    await queryInterface.createTable('evidence_relationships', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      public_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        comment: 'Durable external identity',
      },

      // FROM endpoint — exactly one must be non-null (enforced by CHECK)
      from_source_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'evidence_sources', key: 'id' },
        onDelete: 'CASCADE',
        comment: 'FK to evidence_sources — set when from is a source',
      },
      from_construct_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'evidence_constructs', key: 'id' },
        onDelete: 'CASCADE',
        comment: 'FK to evidence_constructs — set when from is a construct',
      },

      // TO endpoint — exactly one must be non-null (enforced by CHECK)
      to_source_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'evidence_sources', key: 'id' },
        onDelete: 'CASCADE',
        comment: 'FK to evidence_sources — set when to is a source',
      },
      to_construct_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'evidence_constructs', key: 'id' },
        onDelete: 'CASCADE',
        comment: 'FK to evidence_constructs — set when to is a construct',
      },

      // Relationship semantics
      relationship_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'DERIVED_FROM | SUPPORTS | ADDRESSES | TESTED_BY | CONTRADICTS | REFINES | IMPLEMENTED_BY | VALIDATES',
      },

      // Provenance
      provenance: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: '{ method, decision_basis, created_by_template, ... }',
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // ── CHECK constraints for exactly-one endpoint ────────────────────
    await queryInterface.sequelize.query(`
      ALTER TABLE evidence_relationships
      ADD CONSTRAINT chk_exactly_one_from
      CHECK (
        (from_source_id IS NOT NULL AND from_construct_id IS NULL)
        OR
        (from_source_id IS NULL AND from_construct_id IS NOT NULL)
      )
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE evidence_relationships
      ADD CONSTRAINT chk_exactly_one_to
      CHECK (
        (to_source_id IS NOT NULL AND to_construct_id IS NULL)
        OR
        (to_source_id IS NULL AND to_construct_id IS NOT NULL)
      )
    `);

    // ── Indexes ───────────────────────────────────────────────────────

    // evidence_sources
    await queryInterface.addIndex('evidence_sources', ['project_id'], {
      name: 'idx_evidence_sources_project',
    });
    await queryInterface.addIndex('evidence_sources', ['study_id'], {
      name: 'idx_evidence_sources_study',
    });
    await queryInterface.addIndex('evidence_sources', ['source_type'], {
      name: 'idx_evidence_sources_type',
    });
    await queryInterface.addIndex('evidence_sources', ['public_id'], {
      name: 'idx_evidence_sources_public_id',
      unique: true,
    });

    // evidence_constructs
    await queryInterface.addIndex('evidence_constructs', ['project_id'], {
      name: 'idx_evidence_constructs_project',
    });
    await queryInterface.addIndex('evidence_constructs', ['study_id'], {
      name: 'idx_evidence_constructs_study',
    });
    await queryInterface.addIndex('evidence_constructs', ['construct_type'], {
      name: 'idx_evidence_constructs_type',
    });
    await queryInterface.addIndex('evidence_constructs', ['status'], {
      name: 'idx_evidence_constructs_status',
    });
    await queryInterface.addIndex('evidence_constructs', ['cascade_variable_key'], {
      name: 'idx_evidence_constructs_cascade_key',
    });
    await queryInterface.addIndex('evidence_constructs', ['public_id'], {
      name: 'idx_evidence_constructs_public_id',
      unique: true,
    });

    // evidence_relationships
    await queryInterface.addIndex('evidence_relationships', ['from_source_id'], {
      name: 'idx_evidence_relationships_from_source',
    });
    await queryInterface.addIndex('evidence_relationships', ['from_construct_id'], {
      name: 'idx_evidence_relationships_from_construct',
    });
    await queryInterface.addIndex('evidence_relationships', ['to_source_id'], {
      name: 'idx_evidence_relationships_to_source',
    });
    await queryInterface.addIndex('evidence_relationships', ['to_construct_id'], {
      name: 'idx_evidence_relationships_to_construct',
    });
    await queryInterface.addIndex('evidence_relationships', ['relationship_type'], {
      name: 'idx_evidence_relationships_type',
    });
    await queryInterface.addIndex('evidence_relationships', ['public_id'], {
      name: 'idx_evidence_relationships_public_id',
      unique: true,
    });

    console.log('Created evidence_sources, evidence_constructs, evidence_relationships tables with FK-backed lineage, CHECK constraints, UUID public_ids, and indexes');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('evidence_relationships');
    await queryInterface.dropTable('evidence_constructs');
    await queryInterface.dropTable('evidence_sources');
    console.log('Dropped evidence_sources, evidence_constructs, evidence_relationships tables');
  },
};
