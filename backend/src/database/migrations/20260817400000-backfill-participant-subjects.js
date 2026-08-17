'use strict';

/**
 * GOV-2A2: Backfill data_subject + participant link for existing participants.
 *
 * For each study_participants row without a corresponding data_subject_link,
 * creates one data_subject (project-scoped) and one participant link.
 *
 * Properties:
 * - Deterministic: processes by participant ID order
 * - Restart-safe: skips participants that already have links
 * - Idempotent: second run creates nothing
 * - Per-participant transactional (failure of one does not block others)
 *
 * Down migration: removes all SYSTEM_BACKFILL subjects and their links.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Find all participants without a subject link
    const [unlinked] = await queryInterface.sequelize.query(`
      SELECT sp.id AS participant_id, sp.study_id, rs.project_id
      FROM study_participants sp
      JOIN research_studies rs ON rs.id = sp.study_id
      LEFT JOIN data_subject_links dsl
        ON dsl.participant_id = sp.id AND dsl.link_type = 'participant'
      WHERE dsl.id IS NULL
      ORDER BY sp.id
    `);

    let created = 0;
    let skipped = 0;
    const errors = [];

    for (const row of unlinked) {
      const t = await queryInterface.sequelize.transaction();
      try {
        // Create data_subject
        const [subjectRows] = await queryInterface.sequelize.query(
          `INSERT INTO data_subjects (public_id, project_id, status, created_by, created_at)
           VALUES (gen_random_uuid(), :projectId, 'active', 'SYSTEM_BACKFILL', NOW())
           RETURNING id`,
          {
            replacements: { projectId: row.project_id },
            transaction: t,
          },
        );
        const subjectId = subjectRows[0].id;

        // Create participant link
        await queryInterface.sequelize.query(
          `INSERT INTO data_subject_links
             (data_subject_id, link_type, study_id, participant_id, confidence, linked_by, linked_at)
           VALUES
             (:subjectId, 'participant', :studyId, :participantId, 'confirmed', 'SYSTEM_BACKFILL', NOW())`,
          {
            replacements: {
              subjectId,
              studyId: row.study_id,
              participantId: row.participant_id,
            },
            transaction: t,
          },
        );

        await t.commit();
        created++;
      } catch (err) {
        await t.rollback();
        errors.push({ participantId: row.participant_id, error: err.message });
      }
    }

    // Count participants that already had links (skipped)
    const [[{ count: totalCount }]] = await queryInterface.sequelize.query(
      'SELECT COUNT(*)::int AS count FROM study_participants',
    );
    skipped = totalCount - created - errors.length;

    console.log(
      `[GOV-2A2 Backfill] Created: ${created}, Skipped: ${skipped}, Errors: ${errors.length}`,
    );
    if (errors.length > 0) {
      console.warn('[GOV-2A2 Backfill] Errors:', JSON.stringify(errors));
    }
  },

  async down(queryInterface) {
    // Remove all subjects created by the backfill
    // Links cascade from subjects (ON DELETE CASCADE)
    await queryInterface.sequelize.query(
      `DELETE FROM data_subjects WHERE created_by = 'SYSTEM_BACKFILL'`,
    );
  },
};
