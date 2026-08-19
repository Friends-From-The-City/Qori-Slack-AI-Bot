'use strict';

/**
 * GOV-3A — Domain Value CHECK Constraints
 *
 * Adds CHECK constraints for all enum-like string columns that are
 * currently enforced only by application/model code. Each constraint
 * is added NOT VALID then validated separately for safe deployment
 * on tables that may already have data.
 *
 * Existing CHECK constraints NOT touched (already enforced):
 * - study_participants.status_select (chk_participant_status)
 * - study_participants.outreach_method (chk_outreach_method)
 * - data_subjects.status (chk_data_subject_status)
 * - data_subject_links.link_type (chk_dsl_link_type)
 * - data_subject_links.confidence (chk_dsl_confidence)
 * - evidence_subject_attributions.attribution_type (chk_esa_attribution_type)
 */

module.exports = {
  async up(queryInterface) {
    const constraints = [
      // ── evidence_sources ──
      {
        table: 'evidence_sources',
        name: 'chk_evidence_source_type',
        check: `source_type IN ('uploaded_document','survey_dataset','stakeholder_interview','session_transcript','session_notes','process_document','external_reference')`,
      },

      // ── evidence_constructs ──
      {
        table: 'evidence_constructs',
        name: 'chk_construct_type',
        check: `construct_type IN ('knowledge_gap','barrier','research_question','stakeholder_constraint','nugget','survey_pattern','survey_dataset_summary','field_distribution','cross_tab','usability_finding','journey_stage','recommendation','finding','theme','persona','ticket_candidate','survey_qualitative_pattern','survey_individual_observation')`,
      },
      {
        table: 'evidence_constructs',
        name: 'chk_construct_derivation_type',
        check: `derivation_type IN ('deterministic','model','human','hybrid')`,
      },
      {
        table: 'evidence_constructs',
        name: 'chk_construct_status',
        check: `status IN ('candidate','accepted','rejected','overridden')`,
      },

      // ── evidence_relationships ──
      {
        table: 'evidence_relationships',
        name: 'chk_relationship_type',
        check: `relationship_type IN ('DERIVED_FROM','SYNTHESIZED_FROM','SUPPORTS','ADDRESSES','TESTED_BY','CONTRADICTS','REFINES','IMPLEMENTED_BY','VALIDATES')`,
      },

      // ── projects ──
      {
        table: 'projects',
        name: 'chk_project_status',
        check: `status IN ('active','completed','archived')`,
      },

      // ── project_members ──
      {
        table: 'project_members',
        name: 'chk_member_role',
        check: `role IN ('owner','member')`,
      },
      {
        table: 'project_members',
        name: 'chk_member_source',
        check: `source IN ('creator','channel','explicit','migrated')`,
      },

      // ── research_studies ──
      {
        table: 'research_studies',
        name: 'chk_brief_status',
        check: `brief_status IS NULL OR brief_status IN ('pending_approval','changes_requested','approved')`,
      },

      // ── research_artifacts ──
      {
        table: 'research_artifacts',
        name: 'chk_artifact_type',
        check: `artifact_type IN ('discovery','brief','plan','fieldwork','synthesis','readout','tickets')`,
      },
      {
        table: 'research_artifacts',
        name: 'chk_artifact_status',
        check: `status IN ('pending','written','failed')`,
      },

      // ── artifact_evidence_refs ──
      {
        table: 'artifact_evidence_refs',
        name: 'chk_ref_type',
        check: `ref_type IN ('reflects')`,
      },

      // ── disposition_audit_log ──
      {
        table: 'disposition_audit_log',
        name: 'chk_audit_action',
        check: `action IN ('delete_participant','delete_study','delete_subject','export_participant','export_subject','change_stakeholder','deletion_denied','deletion_error','approve_transcript','reject_transcript','rescrub_transcript')`,
      },
      {
        table: 'disposition_audit_log',
        name: 'chk_audit_outcome',
        check: `outcome IN ('success','denied','error')`,
      },

      // ── survey_codebooks ──
      {
        table: 'survey_codebooks',
        name: 'chk_codebook_status',
        check: `status IN ('draft','under_review','accepted','superseded')`,
      },

      // ── survey_codes ──
      {
        table: 'survey_codes',
        name: 'chk_code_origin',
        check: `origin IN ('qori_proposed','researcher_added','inherited')`,
      },
      {
        table: 'survey_codes',
        name: 'chk_code_status',
        check: `status IN ('proposed','accepted','removed')`,
      },

      // ── survey_code_examples ──
      {
        table: 'survey_code_examples',
        name: 'chk_code_example_type',
        check: `example_type IN ('include','boundary','exclude')`,
      },

      // ── survey_coding_runs ──
      {
        table: 'survey_coding_runs',
        name: 'chk_coding_run_status',
        check: `status IN ('draft','under_review','accepted','superseded')`,
      },

      // ── survey_coding_assignments ──
      {
        table: 'survey_coding_assignments',
        name: 'chk_assignment_origin',
        check: `origin IN ('qori_proposed','researcher_added')`,
      },
      {
        table: 'survey_coding_assignments',
        name: 'chk_assignment_status',
        check: `status IN ('proposed','accepted','rejected')`,
      },

      // ── survey_coding_entry_reviews ──
      {
        table: 'survey_coding_entry_reviews',
        name: 'chk_entry_review_status',
        check: `status IN ('pending','reviewed','no_grouping_applies','uncodable')`,
      },

      // ── survey_qualitative_entries ──
      {
        table: 'survey_qualitative_entries',
        name: 'chk_pii_status',
        check: `pii_status IN ('pending','clear','redacted','restricted')`,
      },

      // ── created_issues ──
      {
        table: 'created_issues',
        name: 'chk_created_issue_status',
        check: `status IN ('pending','created','failed')`,
      },
    ];

    // Add NOT VALID first, then validate — safe for tables with existing data
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
      { table: 'evidence_sources', name: 'chk_evidence_source_type' },
      { table: 'evidence_constructs', name: 'chk_construct_type' },
      { table: 'evidence_constructs', name: 'chk_construct_derivation_type' },
      { table: 'evidence_constructs', name: 'chk_construct_status' },
      { table: 'evidence_relationships', name: 'chk_relationship_type' },
      { table: 'projects', name: 'chk_project_status' },
      { table: 'project_members', name: 'chk_member_role' },
      { table: 'project_members', name: 'chk_member_source' },
      { table: 'research_studies', name: 'chk_brief_status' },
      { table: 'research_artifacts', name: 'chk_artifact_type' },
      { table: 'research_artifacts', name: 'chk_artifact_status' },
      { table: 'artifact_evidence_refs', name: 'chk_ref_type' },
      { table: 'disposition_audit_log', name: 'chk_audit_action' },
      { table: 'disposition_audit_log', name: 'chk_audit_outcome' },
      { table: 'survey_codebooks', name: 'chk_codebook_status' },
      { table: 'survey_codes', name: 'chk_code_origin' },
      { table: 'survey_codes', name: 'chk_code_status' },
      { table: 'survey_code_examples', name: 'chk_code_example_type' },
      { table: 'survey_coding_runs', name: 'chk_coding_run_status' },
      { table: 'survey_coding_assignments', name: 'chk_assignment_origin' },
      { table: 'survey_coding_assignments', name: 'chk_assignment_status' },
      { table: 'survey_coding_entry_reviews', name: 'chk_entry_review_status' },
      { table: 'survey_qualitative_entries', name: 'chk_pii_status' },
      { table: 'created_issues', name: 'chk_created_issue_status' },
    ];

    for (const c of constraints) {
      await queryInterface.sequelize.query(
        `ALTER TABLE "${c.table}" DROP CONSTRAINT IF EXISTS "${c.name}"`
      );
    }
  },
};
