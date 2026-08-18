/**
 * GOV-3A — Database Integrity Hardening Tests
 *
 * Raw-SQL tests that bypass service validation and prove PostgreSQL
 * itself rejects structurally invalid canonical state.
 *
 * For every new CHECK constraint added in GOV-3A migrations:
 * - one invalid-write test (DB rejects)
 * - one valid-write test (DB accepts)
 */

import { getTestDb, truncateAll } from './setup/testDb';

const sequelize = getTestDb();

// ─── Helpers ──────────────────────────────────────────────────────

/** Insert a project and return its id */
async function seedProject(slug = 'test-proj'): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO projects (name, slug, status, created_by, created_at, updated_at)
     VALUES ('Test', '${slug}', 'active', 'U_TEST', NOW(), NOW())
     RETURNING id`
  );
  return (rows as any[])[0].id;
}

/** Insert a study and return its id */
async function seedStudy(projectId: number, name = 'test-study'): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO research_studies (project_id, name, channel_name, created_by, researcher_name, researcher_email, created_at, updated_at)
     VALUES (${projectId}, '${name}', 'chan-test', 'U_TEST', 'Tester', 'test@test.com', NOW(), NOW())
     RETURNING id`
  );
  return (rows as any[])[0].id;
}

/** Insert an evidence source and return its id */
async function seedSource(projectId: number, studyId: number | null = null): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO evidence_sources (project_id, study_id, source_type, label, created_by, created_at, updated_at)
     VALUES (${projectId}, ${studyId ?? 'NULL'}, 'survey_dataset', 'Test Source', 'U_TEST', NOW(), NOW())
     RETURNING id`
  );
  return (rows as any[])[0].id;
}

/** Insert an evidence construct and return its id */
async function seedConstruct(projectId: number, studyId: number | null = null): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO evidence_constructs (project_id, study_id, construct_type, derivation_type, status, created_by, created_at, updated_at)
     VALUES (${projectId}, ${studyId ?? 'NULL'}, 'nugget', 'model', 'candidate', 'U_TEST', NOW(), NOW())
     RETURNING id`
  );
  return (rows as any[])[0].id;
}

/** Insert a data subject and return its id */
async function seedSubject(projectId: number): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO data_subjects (project_id, status, created_by, created_at)
     VALUES (${projectId}, 'active', 'U_TEST', NOW())
     RETURNING id`
  );
  return (rows as any[])[0].id;
}

/** Insert a participant and return its id */
async function seedParticipant(studyId: number, code = 'P01'): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO study_participants (study_id, participant_code, status_select, added_by, created_at, updated_at)
     VALUES (${studyId}, '${code}', 'not_contacted', 'U_TEST', NOW(), NOW())
     RETURNING id`
  );
  return (rows as any[])[0].id;
}

/** Insert a research artifact and return its id */
async function seedArtifact(projectId: number, studyId: number | null, semanticKey: string): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO research_artifacts (project_id, study_id, template_id, template_version, artifact_type, repo, status, semantic_key, created_by, created_at, updated_at)
     VALUES (${projectId}, ${studyId ?? 'NULL'}, 'test_template', '1.0', 'synthesis', 'test/repo', 'pending', '${semanticKey}', 'U_TEST', NOW(), NOW())
     RETURNING id`
  );
  return (rows as any[])[0].id;
}

/** Insert a codebook and return its id */
async function seedCodebook(sourceId: number, projectId: number, studyId: number | null = null): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO survey_codebooks (evidence_source_id, project_id, study_id, version, status, method, generation_metadata, created_by, created_at, updated_at)
     VALUES (${sourceId}, ${projectId}, ${studyId ?? 'NULL'}, 1, 'draft', 'scqa', '{}', 'U_TEST', NOW(), NOW())
     RETURNING id`
  );
  return (rows as any[])[0].id;
}

/** Insert a survey code and return its id */
async function seedCode(codebookId: number, codeKey = 'code-1'): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO survey_codes (codebook_id, code_key, label, definition, include_when, origin, status, sort_order, metadata, created_at, updated_at)
     VALUES (${codebookId}, '${codeKey}', 'Test Code', 'Def', 'When X', 'qori_proposed', 'proposed', 0, '{}', NOW(), NOW())
     RETURNING id`
  );
  return (rows as any[])[0].id;
}

/** Insert a qualitative entry and return its id */
async function seedQualEntry(sourceId: number, projectId: number, respondentKey = 'R01', fieldName = 'q1'): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO survey_qualitative_entries (evidence_source_id, project_id, respondent_key, display_respondent_id, field_name, field_display_name, entry_hash, pii_status, metadata, created_at, updated_at)
     VALUES (${sourceId}, ${projectId}, '${respondentKey}', '${respondentKey}', '${fieldName}', '${fieldName}', 'hash123', 'pending', '{}', NOW(), NOW())
     RETURNING id`
  );
  return (rows as any[])[0].id;
}

/** Insert a coding run and return its id */
async function seedCodingRun(sourceId: number, codebookId: number, projectId: number): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO survey_coding_runs (evidence_source_id, codebook_id, project_id, version, status, generation_metadata, created_by, created_at, updated_at)
     VALUES (${sourceId}, ${codebookId}, ${projectId}, 1, 'draft', '{}', 'U_TEST', NOW(), NOW())
     RETURNING id`
  );
  return (rows as any[])[0].id;
}

/** Expect a raw SQL statement to be rejected by PostgreSQL */
async function expectRejected(sql: string, constraintName?: string): Promise<void> {
  try {
    await sequelize.query(sql);
    throw new Error(`Expected rejection but SQL succeeded: ${sql.substring(0, 100)}...`);
  } catch (err: any) {
    if (err.message?.startsWith('Expected rejection')) throw err;
    // Verify it's a constraint violation, not a syntax error
    const isConstraintViolation =
      err.original?.code === '23514' || // CHECK violation
      err.original?.code === '23505' || // UNIQUE violation
      err.original?.code === '23503' || // FK violation
      err.original?.code === '23502';   // NOT NULL violation
    if (!isConstraintViolation) {
      throw new Error(`Expected constraint violation but got ${err.original?.code}: ${err.message}`);
    }
    if (constraintName && err.original?.constraint) {
      expect(err.original.constraint).toBe(constraintName);
    }
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe('GOV-3A Database Integrity Hardening', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // ═══════════════════════════════════════════════════════════════
  // A. EVIDENCE SOURCES
  // ═══════════════════════════════════════════════════════════════

  describe('evidence_sources.source_type CHECK', () => {
    it('rejects invalid source_type', async () => {
      const projId = await seedProject();
      await expectRejected(
        `INSERT INTO evidence_sources (project_id, source_type, label, created_by, created_at, updated_at)
         VALUES (${projId}, 'invalid_type', 'Bad', 'U_TEST', NOW(), NOW())`,
        'chk_evidence_source_type'
      );
    });

    it('accepts valid source_type', async () => {
      const projId = await seedProject();
      await sequelize.query(
        `INSERT INTO evidence_sources (project_id, source_type, label, created_by, created_at, updated_at)
         VALUES (${projId}, 'session_transcript', 'Good', 'U_TEST', NOW(), NOW())`
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // B. EVIDENCE CONSTRUCTS
  // ═══════════════════════════════════════════════════════════════

  describe('evidence_constructs CHECK constraints', () => {
    it('rejects invalid construct_type', async () => {
      const projId = await seedProject();
      await expectRejected(
        `INSERT INTO evidence_constructs (project_id, construct_type, derivation_type, status, created_by, created_at, updated_at)
         VALUES (${projId}, 'made_up_type', 'model', 'candidate', 'U_TEST', NOW(), NOW())`,
        'chk_construct_type'
      );
    });

    it('accepts valid construct_type', async () => {
      const projId = await seedProject();
      await sequelize.query(
        `INSERT INTO evidence_constructs (project_id, construct_type, derivation_type, status, created_by, created_at, updated_at)
         VALUES (${projId}, 'survey_qualitative_pattern', 'model', 'candidate', 'U_TEST', NOW(), NOW())`
      );
    });

    it('rejects invalid derivation_type', async () => {
      const projId = await seedProject();
      await expectRejected(
        `INSERT INTO evidence_constructs (project_id, construct_type, derivation_type, status, created_by, created_at, updated_at)
         VALUES (${projId}, 'nugget', 'magic', 'candidate', 'U_TEST', NOW(), NOW())`,
        'chk_construct_derivation_type'
      );
    });

    it('accepts valid derivation_type', async () => {
      const projId = await seedProject();
      await sequelize.query(
        `INSERT INTO evidence_constructs (project_id, construct_type, derivation_type, status, created_by, created_at, updated_at)
         VALUES (${projId}, 'nugget', 'hybrid', 'candidate', 'U_TEST', NOW(), NOW())`
      );
    });

    it('rejects invalid construct status', async () => {
      const projId = await seedProject();
      await expectRejected(
        `INSERT INTO evidence_constructs (project_id, construct_type, derivation_type, status, created_by, created_at, updated_at)
         VALUES (${projId}, 'nugget', 'model', 'bogus', 'U_TEST', NOW(), NOW())`,
        'chk_construct_status'
      );
    });

    it('accepts valid construct status', async () => {
      const projId = await seedProject();
      await sequelize.query(
        `INSERT INTO evidence_constructs (project_id, construct_type, derivation_type, status, created_by, created_at, updated_at)
         VALUES (${projId}, 'nugget', 'model', 'overridden', 'U_TEST', NOW(), NOW())`
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // C. EVIDENCE RELATIONSHIPS
  // ═══════════════════════════════════════════════════════════════

  describe('evidence_relationships CHECK constraints', () => {
    it('rejects invalid relationship_type', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      const constId = await seedConstruct(projId);
      await expectRejected(
        `INSERT INTO evidence_relationships (from_source_id, to_construct_id, relationship_type, created_at)
         VALUES (${srcId}, ${constId}, 'INVENTED', NOW())`,
        'chk_relationship_type'
      );
    });

    it('accepts valid relationship_type', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      const constId = await seedConstruct(projId);
      await sequelize.query(
        `INSERT INTO evidence_relationships (from_source_id, to_construct_id, relationship_type, created_at)
         VALUES (${srcId}, ${constId}, 'CONTRADICTS', NOW())`
      );
    });

    it('rejects both from endpoints null (pre-existing constraint)', async () => {
      const projId = await seedProject();
      const constId = await seedConstruct(projId);
      await expectRejected(
        `INSERT INTO evidence_relationships (from_source_id, from_construct_id, to_construct_id, relationship_type, created_at)
         VALUES (NULL, NULL, ${constId}, 'SUPPORTS', NOW())`,
        'chk_exactly_one_from'
      );
    });

    it('rejects both from endpoints set (pre-existing constraint)', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      const constId = await seedConstruct(projId);
      const constId2 = await seedConstruct(projId);
      await expectRejected(
        `INSERT INTO evidence_relationships (from_source_id, from_construct_id, to_construct_id, relationship_type, created_at)
         VALUES (${srcId}, ${constId}, ${constId2}, 'SUPPORTS', NOW())`,
        'chk_exactly_one_from'
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // D. PROJECTS
  // ═══════════════════════════════════════════════════════════════

  describe('projects.status CHECK', () => {
    it('rejects invalid project status', async () => {
      await expectRejected(
        `INSERT INTO projects (name, slug, status, created_by, created_at, updated_at)
         VALUES ('Bad', 'bad-proj', 'deleted', 'U_TEST', NOW(), NOW())`,
        'chk_project_status'
      );
    });

    it('accepts valid project status', async () => {
      await sequelize.query(
        `INSERT INTO projects (name, slug, status, created_by, created_at, updated_at)
         VALUES ('Good', 'good-proj', 'archived', 'U_TEST', NOW(), NOW())`
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // E. PROJECT MEMBERS
  // ═══════════════════════════════════════════════════════════════

  describe('project_members CHECK constraints', () => {
    it('rejects invalid member role', async () => {
      const projId = await seedProject();
      await expectRejected(
        `INSERT INTO project_members (project_id, user_id, role, source, added_at)
         VALUES (${projId}, 'U_X', 'admin', 'explicit', NOW())`,
        'chk_member_role'
      );
    });

    it('accepts valid member role', async () => {
      const projId = await seedProject();
      await sequelize.query(
        `INSERT INTO project_members (project_id, user_id, role, source, added_at)
         VALUES (${projId}, 'U_X', 'owner', 'creator', NOW())`
      );
    });

    it('rejects invalid member source', async () => {
      const projId = await seedProject();
      await expectRejected(
        `INSERT INTO project_members (project_id, user_id, role, source, added_at)
         VALUES (${projId}, 'U_Y', 'member', 'imported', NOW())`,
        'chk_member_source'
      );
    });

    it('rejects duplicate (project_id, user_id) — pre-existing uniqueness', async () => {
      const projId = await seedProject();
      await sequelize.query(
        `INSERT INTO project_members (project_id, user_id, role, source, added_at)
         VALUES (${projId}, 'U_DUP', 'member', 'explicit', NOW())`
      );
      await expectRejected(
        `INSERT INTO project_members (project_id, user_id, role, source, added_at)
         VALUES (${projId}, 'U_DUP', 'owner', 'explicit', NOW())`,
        'uq_project_members_project_user'
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // F. RESEARCH STUDIES
  // ═══════════════════════════════════════════════════════════════

  describe('research_studies.brief_status CHECK', () => {
    it('rejects invalid brief_status', async () => {
      const projId = await seedProject();
      const studyId = await seedStudy(projId);
      await expectRejected(
        `UPDATE research_studies SET brief_status = 'accepted' WHERE id = ${studyId}`,
        'chk_brief_status'
      );
    });

    it('accepts valid brief_status', async () => {
      const projId = await seedProject();
      const studyId = await seedStudy(projId);
      await sequelize.query(
        `UPDATE research_studies SET brief_status = 'approved' WHERE id = ${studyId}`
      );
    });

    it('accepts NULL brief_status', async () => {
      const projId = await seedProject();
      const studyId = await seedStudy(projId);
      await sequelize.query(
        `UPDATE research_studies SET brief_status = NULL WHERE id = ${studyId}`
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // G. RESEARCH ARTIFACTS
  // ═══════════════════════════════════════════════════════════════

  describe('research_artifacts CHECK constraints', () => {
    it('rejects invalid artifact_type', async () => {
      const projId = await seedProject();
      await expectRejected(
        `INSERT INTO research_artifacts (project_id, template_id, template_version, artifact_type, repo, status, semantic_key, created_by, created_at, updated_at)
         VALUES (${projId}, 'tmpl', '1.0', 'report', 'r/r', 'pending', 'sk-bad-1', 'U_TEST', NOW(), NOW())`,
        'chk_artifact_type'
      );
    });

    it('accepts valid artifact_type', async () => {
      const projId = await seedProject();
      await sequelize.query(
        `INSERT INTO research_artifacts (project_id, template_id, template_version, artifact_type, repo, status, semantic_key, created_by, created_at, updated_at)
         VALUES (${projId}, 'tmpl', '1.0', 'readout', 'r/r', 'pending', 'sk-good-1', 'U_TEST', NOW(), NOW())`
      );
    });

    it('rejects invalid artifact status', async () => {
      const projId = await seedProject();
      await expectRejected(
        `INSERT INTO research_artifacts (project_id, template_id, template_version, artifact_type, repo, status, semantic_key, created_by, created_at, updated_at)
         VALUES (${projId}, 'tmpl', '1.0', 'synthesis', 'r/r', 'published', 'sk-bad-2', 'U_TEST', NOW(), NOW())`,
        'chk_artifact_status'
      );
    });

    it('rejects duplicate semantic_key — pre-existing uniqueness', async () => {
      const projId = await seedProject();
      await seedArtifact(projId, null, 'dup-key');
      await expectRejected(
        `INSERT INTO research_artifacts (project_id, template_id, template_version, artifact_type, repo, status, semantic_key, created_by, created_at, updated_at)
         VALUES (${projId}, 'tmpl', '1.0', 'synthesis', 'r/r', 'pending', 'dup-key', 'U_TEST', NOW(), NOW())`,
        'research_artifacts_semantic_key_key'
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // H. ARTIFACT EVIDENCE REFS
  // ═══════════════════════════════════════════════════════════════

  describe('artifact_evidence_refs CHECK constraints', () => {
    it('rejects invalid ref_type', async () => {
      const projId = await seedProject();
      const artifactId = await seedArtifact(projId, null, 'sk-ref-1');
      const constId = await seedConstruct(projId);
      await expectRejected(
        `INSERT INTO artifact_evidence_refs (artifact_id, construct_id, ref_type, created_at)
         VALUES (${artifactId}, ${constId}, 'cites', NOW())`,
        'chk_ref_type'
      );
    });

    it('accepts valid ref_type', async () => {
      const projId = await seedProject();
      const artifactId = await seedArtifact(projId, null, 'sk-ref-2');
      const constId = await seedConstruct(projId);
      await sequelize.query(
        `INSERT INTO artifact_evidence_refs (artifact_id, construct_id, ref_type, created_at)
         VALUES (${artifactId}, ${constId}, 'reflects', NOW())`
      );
    });

    it('rejects orphan artifact FK', async () => {
      const projId = await seedProject();
      const constId = await seedConstruct(projId);
      await expectRejected(
        `INSERT INTO artifact_evidence_refs (artifact_id, construct_id, ref_type, created_at)
         VALUES (99999, ${constId}, 'reflects', NOW())`
      );
    });

    it('rejects orphan construct FK', async () => {
      const projId = await seedProject();
      const artifactId = await seedArtifact(projId, null, 'sk-ref-3');
      await expectRejected(
        `INSERT INTO artifact_evidence_refs (artifact_id, construct_id, ref_type, created_at)
         VALUES (${artifactId}, 99999, 'reflects', NOW())`
      );
    });

    it('rejects duplicate (artifact, construct, ref_type) — pre-existing uniqueness', async () => {
      const projId = await seedProject();
      const artifactId = await seedArtifact(projId, null, 'sk-ref-4');
      const constId = await seedConstruct(projId);
      await sequelize.query(
        `INSERT INTO artifact_evidence_refs (artifact_id, construct_id, ref_type, created_at)
         VALUES (${artifactId}, ${constId}, 'reflects', NOW())`
      );
      await expectRejected(
        `INSERT INTO artifact_evidence_refs (artifact_id, construct_id, ref_type, created_at)
         VALUES (${artifactId}, ${constId}, 'reflects', NOW())`,
        'uq_artifact_evidence_ref'
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // I. DISPOSITION AUDIT LOG
  // ═══════════════════════════════════════════════════════════════

  describe('disposition_audit_log CHECK constraints', () => {
    it('rejects invalid audit action', async () => {
      await expectRejected(
        `INSERT INTO disposition_audit_log (action, record_type, target_identifier, actor_user_id, authorization_basis, outcome, occurred_at)
         VALUES ('purge_all', 'participant', 'P01', 'U_TEST', 'test', 'success', NOW())`,
        'chk_audit_action'
      );
    });

    it('accepts valid audit action', async () => {
      await sequelize.query(
        `INSERT INTO disposition_audit_log (action, record_type, target_identifier, actor_user_id, authorization_basis, outcome, occurred_at)
         VALUES ('delete_participant', 'participant', 'P01', 'U_TEST', 'DSAR request', 'success', NOW())`
      );
    });

    it('rejects invalid audit outcome', async () => {
      await expectRejected(
        `INSERT INTO disposition_audit_log (action, record_type, target_identifier, actor_user_id, authorization_basis, outcome, occurred_at)
         VALUES ('delete_participant', 'participant', 'P01', 'U_TEST', 'test', 'maybe', NOW())`,
        'chk_audit_outcome'
      );
    });

    it('accepts valid audit outcome', async () => {
      await sequelize.query(
        `INSERT INTO disposition_audit_log (action, record_type, target_identifier, actor_user_id, authorization_basis, outcome, occurred_at)
         VALUES ('export_subject', 'subject', 'S01', 'U_TEST', 'DSAR', 'denied', NOW())`
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // J. SURVEY CODEBOOKS
  // ═══════════════════════════════════════════════════════════════

  describe('survey_codebooks.status CHECK', () => {
    it('rejects invalid codebook status', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      await expectRejected(
        `INSERT INTO survey_codebooks (evidence_source_id, project_id, version, status, method, generation_metadata, created_by, created_at, updated_at)
         VALUES (${srcId}, ${projId}, 1, 'published', 'scqa', '{}', 'U_TEST', NOW(), NOW())`,
        'chk_codebook_status'
      );
    });

    it('accepts valid codebook status', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      await sequelize.query(
        `INSERT INTO survey_codebooks (evidence_source_id, project_id, version, status, method, generation_metadata, created_by, created_at, updated_at)
         VALUES (${srcId}, ${projId}, 1, 'under_review', 'scqa', '{}', 'U_TEST', NOW(), NOW())`
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // K. SURVEY CODES
  // ═══════════════════════════════════════════════════════════════

  describe('survey_codes CHECK constraints', () => {
    it('rejects invalid code origin', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      const cbId = await seedCodebook(srcId, projId);
      await expectRejected(
        `INSERT INTO survey_codes (codebook_id, code_key, label, definition, include_when, origin, status, sort_order, metadata, created_at, updated_at)
         VALUES (${cbId}, 'c1', 'L', 'D', 'W', 'auto_generated', 'proposed', 0, '{}', NOW(), NOW())`,
        'chk_code_origin'
      );
    });

    it('accepts valid code origin', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      const cbId = await seedCodebook(srcId, projId);
      await sequelize.query(
        `INSERT INTO survey_codes (codebook_id, code_key, label, definition, include_when, origin, status, sort_order, metadata, created_at, updated_at)
         VALUES (${cbId}, 'c1', 'L', 'D', 'W', 'inherited', 'proposed', 0, '{}', NOW(), NOW())`
      );
    });

    it('rejects invalid code status', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      const cbId = await seedCodebook(srcId, projId);
      await expectRejected(
        `INSERT INTO survey_codes (codebook_id, code_key, label, definition, include_when, origin, status, sort_order, metadata, created_at, updated_at)
         VALUES (${cbId}, 'c2', 'L', 'D', 'W', 'qori_proposed', 'deleted', 0, '{}', NOW(), NOW())`,
        'chk_code_status'
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // L. SURVEY CODE EXAMPLES
  // ═══════════════════════════════════════════════════════════════

  describe('survey_code_examples.example_type CHECK', () => {
    it('rejects invalid example_type', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      const cbId = await seedCodebook(srcId, projId);
      const codeId = await seedCode(cbId);
      const entryId = await seedQualEntry(srcId, projId);
      await expectRejected(
        `INSERT INTO survey_code_examples (code_id, qualitative_entry_id, example_type, created_at)
         VALUES (${codeId}, ${entryId}, 'positive', NOW())`,
        'chk_code_example_type'
      );
    });

    it('accepts valid example_type', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      const cbId = await seedCodebook(srcId, projId);
      const codeId = await seedCode(cbId);
      const entryId = await seedQualEntry(srcId, projId);
      await sequelize.query(
        `INSERT INTO survey_code_examples (code_id, qualitative_entry_id, example_type, created_at)
         VALUES (${codeId}, ${entryId}, 'boundary', NOW())`
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // M. SURVEY CODING RUNS
  // ═══════════════════════════════════════════════════════════════

  describe('survey_coding_runs.status CHECK', () => {
    it('rejects invalid coding run status', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      const cbId = await seedCodebook(srcId, projId);
      await expectRejected(
        `INSERT INTO survey_coding_runs (evidence_source_id, codebook_id, project_id, version, status, generation_metadata, created_by, created_at, updated_at)
         VALUES (${srcId}, ${cbId}, ${projId}, 1, 'completed', '{}', 'U_TEST', NOW(), NOW())`,
        'chk_coding_run_status'
      );
    });

    it('accepts valid coding run status', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      const cbId = await seedCodebook(srcId, projId);
      await sequelize.query(
        `INSERT INTO survey_coding_runs (evidence_source_id, codebook_id, project_id, version, status, generation_metadata, created_by, created_at, updated_at)
         VALUES (${srcId}, ${cbId}, ${projId}, 1, 'superseded', '{}', 'U_TEST', NOW(), NOW())`
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // N. SURVEY CODING ASSIGNMENTS
  // ═══════════════════════════════════════════════════════════════

  describe('survey_coding_assignments CHECK constraints', () => {
    it('rejects invalid assignment origin', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      const cbId = await seedCodebook(srcId, projId);
      const codeId = await seedCode(cbId);
      const entryId = await seedQualEntry(srcId, projId);
      const runId = await seedCodingRun(srcId, cbId, projId);
      await expectRejected(
        `INSERT INTO survey_coding_assignments (coding_run_id, qualitative_entry_id, code_id, origin, status, created_at, updated_at)
         VALUES (${runId}, ${entryId}, ${codeId}, 'auto_detected', 'proposed', NOW(), NOW())`,
        'chk_assignment_origin'
      );
    });

    it('accepts valid assignment origin', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      const cbId = await seedCodebook(srcId, projId);
      const codeId = await seedCode(cbId);
      const entryId = await seedQualEntry(srcId, projId);
      const runId = await seedCodingRun(srcId, cbId, projId);
      await sequelize.query(
        `INSERT INTO survey_coding_assignments (coding_run_id, qualitative_entry_id, code_id, origin, status, created_at, updated_at)
         VALUES (${runId}, ${entryId}, ${codeId}, 'researcher_added', 'proposed', NOW(), NOW())`
      );
    });

    it('rejects invalid assignment status', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      const cbId = await seedCodebook(srcId, projId);
      const codeId = await seedCode(cbId);
      const entryId = await seedQualEntry(srcId, projId);
      const runId = await seedCodingRun(srcId, cbId, projId);
      await expectRejected(
        `INSERT INTO survey_coding_assignments (coding_run_id, qualitative_entry_id, code_id, origin, status, created_at, updated_at)
         VALUES (${runId}, ${entryId}, ${codeId}, 'qori_proposed', 'archived', NOW(), NOW())`,
        'chk_assignment_status'
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // O. SURVEY CODING ENTRY REVIEWS
  // ═══════════════════════════════════════════════════════════════

  describe('survey_coding_entry_reviews.status CHECK', () => {
    it('rejects invalid entry review status', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      const cbId = await seedCodebook(srcId, projId);
      const entryId = await seedQualEntry(srcId, projId);
      const runId = await seedCodingRun(srcId, cbId, projId);
      await expectRejected(
        `INSERT INTO survey_coding_entry_reviews (coding_run_id, qualitative_entry_id, status, created_at, updated_at)
         VALUES (${runId}, ${entryId}, 'approved', NOW(), NOW())`,
        'chk_entry_review_status'
      );
    });

    it('accepts valid entry review status', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      const cbId = await seedCodebook(srcId, projId);
      const entryId = await seedQualEntry(srcId, projId);
      const runId = await seedCodingRun(srcId, cbId, projId);
      await sequelize.query(
        `INSERT INTO survey_coding_entry_reviews (coding_run_id, qualitative_entry_id, status, created_at, updated_at)
         VALUES (${runId}, ${entryId}, 'no_grouping_applies', NOW(), NOW())`
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // P. SURVEY QUALITATIVE ENTRIES
  // ═══════════════════════════════════════════════════════════════

  describe('survey_qualitative_entries.pii_status CHECK', () => {
    it('rejects invalid pii_status', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      await expectRejected(
        `INSERT INTO survey_qualitative_entries (evidence_source_id, project_id, respondent_key, display_respondent_id, field_name, field_display_name, entry_hash, pii_status, metadata, created_at, updated_at)
         VALUES (${srcId}, ${projId}, 'R99', 'R99', 'q1', 'q1', 'h1', 'approved', '{}', NOW(), NOW())`,
        'chk_pii_status'
      );
    });

    it('accepts valid pii_status', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      await sequelize.query(
        `INSERT INTO survey_qualitative_entries (evidence_source_id, project_id, respondent_key, display_respondent_id, field_name, field_display_name, entry_hash, pii_status, metadata, created_at, updated_at)
         VALUES (${srcId}, ${projId}, 'R99', 'R99', 'q1', 'q1', 'h1', 'redacted', '{}', NOW(), NOW())`
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Q. CREATED ISSUES
  // ═══════════════════════════════════════════════════════════════

  describe('created_issues.status CHECK', () => {
    it('rejects invalid created issue status', async () => {
      const projId = await seedProject();
      const studyId = await seedStudy(projId);
      await expectRejected(
        `INSERT INTO created_issues (study_id, audience, ticket_id, github_issue_number, github_url, github_repo, created_by, status, created_at, updated_at)
         VALUES (${studyId}, 'design', 'T-001', 1, 'https://github.com/test/1', 'r/r', 'U_TEST', 'published', NOW(), NOW())`,
        'chk_created_issue_status'
      );
    });

    it('accepts valid created issue status', async () => {
      const projId = await seedProject();
      const studyId = await seedStudy(projId);
      await sequelize.query(
        `INSERT INTO created_issues (study_id, audience, ticket_id, github_issue_number, github_url, github_repo, created_by, status, created_at, updated_at)
         VALUES (${studyId}, 'design', 'T-001', 1, 'https://github.com/test/1', 'r/r', 'U_TEST', 'failed', NOW(), NOW())`
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // R. SURVEY FIELD SCHEMAS
  // ═══════════════════════════════════════════════════════════════

  describe('survey_field_schemas CHECK constraints', () => {
    it('rejects invalid inferred_role', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      await expectRejected(
        `INSERT INTO survey_field_schemas (evidence_source_id, field_name, inferred_role, inference_source, review_status, created_at, updated_at)
         VALUES (${srcId}, 'q1', 'binary', 'heuristic', 'pending', NOW(), NOW())`,
        'chk_inferred_role'
      );
    });

    it('accepts valid inferred_role', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      await sequelize.query(
        `INSERT INTO survey_field_schemas (evidence_source_id, field_name, inferred_role, inference_source, review_status, created_at, updated_at)
         VALUES (${srcId}, 'q1', 'ordinal', 'heuristic', 'pending', NOW(), NOW())`
      );
    });

    it('rejects invalid confirmed_role', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      await expectRejected(
        `INSERT INTO survey_field_schemas (evidence_source_id, field_name, inferred_role, confirmed_role, inference_source, review_status, created_at, updated_at)
         VALUES (${srcId}, 'q2', 'nominal', 'freeform', 'heuristic', 'pending', NOW(), NOW())`,
        'chk_confirmed_role'
      );
    });

    it('accepts NULL confirmed_role', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      await sequelize.query(
        `INSERT INTO survey_field_schemas (evidence_source_id, field_name, inferred_role, confirmed_role, inference_source, review_status, created_at, updated_at)
         VALUES (${srcId}, 'q3', 'nominal', NULL, 'heuristic', 'pending', NOW(), NOW())`
      );
    });

    it('rejects invalid review_status', async () => {
      const projId = await seedProject();
      const srcId = await seedSource(projId);
      await expectRejected(
        `INSERT INTO survey_field_schemas (evidence_source_id, field_name, inferred_role, inference_source, review_status, created_at, updated_at)
         VALUES (${srcId}, 'q4', 'nominal', 'heuristic', 'approved', NOW(), NOW())`,
        'chk_field_review_status'
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // S. STUDY VARIABLES
  // ═══════════════════════════════════════════════════════════════

  describe('study_variables.scope CHECK', () => {
    it('rejects invalid scope', async () => {
      const projId = await seedProject();
      await expectRejected(
        `INSERT INTO study_variables (project_id, variable_key, source_template, scope, extracted_at, created_at, updated_at)
         VALUES (${projId}, 'test_var', 'tmpl', 'global', NOW(), NOW(), NOW())`,
        'chk_variable_scope'
      );
    });

    it('accepts valid scope', async () => {
      const projId = await seedProject();
      await sequelize.query(
        `INSERT INTO study_variables (project_id, variable_key, source_template, scope, extracted_at, created_at, updated_at)
         VALUES (${projId}, 'test_var', 'tmpl', 'discovery', NOW(), NOW(), NOW())`
      );
    });

    it('accepts NULL scope', async () => {
      const projId = await seedProject();
      await sequelize.query(
        `INSERT INTO study_variables (project_id, variable_key, source_template, scope, extracted_at, created_at, updated_at)
         VALUES (${projId}, 'test_var2', 'tmpl', NULL, NOW(), NOW(), NOW())`
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // T. REFERENTIAL INTEGRITY (FK rejection tests)
  // ═══════════════════════════════════════════════════════════════

  describe('FK referential integrity', () => {
    it('rejects evidence_source with non-existent project', async () => {
      await expectRejected(
        `INSERT INTO evidence_sources (project_id, source_type, label, created_by, created_at, updated_at)
         VALUES (99999, 'survey_dataset', 'Orphan', 'U_TEST', NOW(), NOW())`
      );
    });

    it('rejects evidence_construct with non-existent project', async () => {
      await expectRejected(
        `INSERT INTO evidence_constructs (project_id, construct_type, derivation_type, status, created_by, created_at, updated_at)
         VALUES (99999, 'nugget', 'model', 'candidate', 'U_TEST', NOW(), NOW())`
      );
    });

    it('rejects data_subject with non-existent project', async () => {
      await expectRejected(
        `INSERT INTO data_subjects (project_id, status, created_by, created_at)
         VALUES (99999, 'active', 'U_TEST', NOW())`
      );
    });

    it('rejects data_subject_link with non-existent subject', async () => {
      const projId = await seedProject();
      const studyId = await seedStudy(projId);
      const partId = await seedParticipant(studyId);
      await expectRejected(
        `INSERT INTO data_subject_links (data_subject_id, link_type, study_id, participant_id, confidence, linked_by, linked_at)
         VALUES (99999, 'participant', ${studyId}, ${partId}, 'confirmed', 'U_TEST', NOW())`
      );
    });

    it('rejects evidence_subject_attribution with non-existent construct', async () => {
      const projId = await seedProject();
      const subjId = await seedSubject(projId);
      await expectRejected(
        `INSERT INTO evidence_subject_attributions (construct_id, data_subject_id, attribution_type, created_at)
         VALUES (99999, ${subjId}, 'direct_quote', NOW())`
      );
    });

    it('rejects evidence_subject_attribution with non-existent subject', async () => {
      const projId = await seedProject();
      const constId = await seedConstruct(projId);
      await expectRejected(
        `INSERT INTO evidence_subject_attributions (construct_id, data_subject_id, attribution_type, created_at)
         VALUES (${constId}, 99999, 'direct_quote', NOW())`
      );
    });

    it('rejects research_artifact with non-existent project', async () => {
      await expectRejected(
        `INSERT INTO research_artifacts (project_id, template_id, template_version, artifact_type, repo, status, semantic_key, created_by, created_at, updated_at)
         VALUES (99999, 'tmpl', '1.0', 'synthesis', 'r/r', 'pending', 'sk-orphan', 'U_TEST', NOW(), NOW())`
      );
    });

    it('rejects survey_codebook with non-existent source', async () => {
      const projId = await seedProject();
      await expectRejected(
        `INSERT INTO survey_codebooks (evidence_source_id, project_id, version, status, method, generation_metadata, created_by, created_at, updated_at)
         VALUES (99999, ${projId}, 1, 'draft', 'scqa', '{}', 'U_TEST', NOW(), NOW())`
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // U. PRE-EXISTING SHAPE CONSTRAINTS (regression guard)
  // ═══════════════════════════════════════════════════════════════

  describe('data_subject_links shape constraints (pre-existing)', () => {
    it('rejects participant link with missing participant_id', async () => {
      const projId = await seedProject();
      const studyId = await seedStudy(projId);
      const subjId = await seedSubject(projId);
      await expectRejected(
        `INSERT INTO data_subject_links (data_subject_id, link_type, study_id, participant_id, confidence, linked_by, linked_at)
         VALUES (${subjId}, 'participant', ${studyId}, NULL, 'confirmed', 'U_TEST', NOW())`,
        'chk_participant_link_shape'
      );
    });

    it('rejects survey_respondent link with missing evidence_source_id', async () => {
      const projId = await seedProject();
      const subjId = await seedSubject(projId);
      await expectRejected(
        `INSERT INTO data_subject_links (data_subject_id, link_type, evidence_source_id, respondent_key, confidence, linked_by, linked_at)
         VALUES (${subjId}, 'survey_respondent', NULL, 'R01', 'confirmed', 'U_TEST', NOW())`,
        'chk_survey_respondent_link_shape'
      );
    });
  });
});
