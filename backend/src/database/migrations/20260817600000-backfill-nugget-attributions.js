'use strict';

/**
 * GOV-2B: Backfill evidence_subject_attributions for existing nugget constructs.
 *
 * Legacy one-time backfill that inspects payload.participant (PT-XXX code)
 * to create canonical attribution rows. Resolution uses exact participant
 * code match through study_participants → data_subject_links, with project
 * scope verification. No names, no fuzzy matching, no prose matching.
 *
 * Unresolved/ambiguous records are skipped and logged.
 * Idempotent: rerun creates no duplicates.
 */
module.exports = {
  async up(queryInterface) {
    // Find nuggets with participant codes that don't have attributions yet
    const [nuggets] = await queryInterface.sequelize.query(`
      SELECT ec.id AS construct_id, ec.project_id, ec.study_id,
             ec.payload->>'participant' AS participant_code,
             ec.construct_type
      FROM evidence_constructs ec
      LEFT JOIN evidence_subject_attributions esa
        ON esa.construct_id = ec.id
      WHERE ec.construct_type IN ('nugget', 'survey_individual_observation')
        AND ec.payload IS NOT NULL
        AND ec.payload->>'participant' IS NOT NULL
        AND ec.payload->>'participant' != ''
        AND esa.id IS NULL
      ORDER BY ec.id
    `);

    let created = 0;
    let unresolved = 0;
    const errors = [];

    for (const nugget of nuggets) {
      const t = await queryInterface.sequelize.transaction();
      try {
        // Resolve participant by code within project scope
        const [participants] = await queryInterface.sequelize.query(
          `SELECT sp.id AS participant_id
           FROM study_participants sp
           JOIN research_studies rs ON rs.id = sp.study_id
           WHERE sp.participant_code = :code
             AND rs.project_id = :projectId
             ${nugget.study_id ? 'AND sp.study_id = :studyId' : ''}
           ORDER BY sp.id`,
          {
            replacements: {
              code: nugget.participant_code,
              projectId: nugget.project_id,
              ...(nugget.study_id ? { studyId: nugget.study_id } : {}),
            },
            transaction: t,
          },
        );

        if (participants.length !== 1) {
          await t.rollback();
          unresolved++;
          if (participants.length === 0) {
            errors.push({ constructId: nugget.construct_id, reason: `No participant for "${nugget.participant_code}"` });
          } else {
            errors.push({ constructId: nugget.construct_id, reason: `Ambiguous: ${participants.length} matches` });
          }
          continue;
        }

        const participantId = participants[0].participant_id;

        // Resolve data_subject via participant link
        const [subjectLinks] = await queryInterface.sequelize.query(
          `SELECT dsl.data_subject_id
           FROM data_subject_links dsl
           WHERE dsl.participant_id = :participantId
             AND dsl.link_type = 'participant'`,
          { replacements: { participantId }, transaction: t },
        );

        if (subjectLinks.length === 0) {
          await t.rollback();
          unresolved++;
          errors.push({ constructId: nugget.construct_id, reason: `Participant ${participantId} has no subject link` });
          continue;
        }

        const dataSubjectId = subjectLinks[0].data_subject_id;
        const attributionType = nugget.construct_type === 'survey_individual_observation'
          ? 'survey_response'
          : 'direct_quote';

        await queryInterface.sequelize.query(
          `INSERT INTO evidence_subject_attributions
             (construct_id, data_subject_id, attribution_type, created_at)
           VALUES (:constructId, :dataSubjectId, :attributionType, NOW())
           ON CONFLICT (construct_id, data_subject_id, attribution_type) DO NOTHING`,
          {
            replacements: {
              constructId: nugget.construct_id,
              dataSubjectId,
              attributionType,
            },
            transaction: t,
          },
        );

        await t.commit();
        created++;
      } catch (err) {
        await t.rollback();
        errors.push({ constructId: nugget.construct_id, reason: err.message });
      }
    }

    console.log(
      `[GOV-2B Attribution Backfill] Created: ${created}, Unresolved: ${unresolved}, Errors: ${errors.length - unresolved}`,
    );
    if (errors.length > 0) {
      console.warn('[GOV-2B Attribution Backfill] Details:', JSON.stringify(errors.slice(0, 20)));
    }
  },

  async down(queryInterface) {
    // Remove all backfilled attributions (those from the legacy migration)
    // Note: cannot distinguish from runtime-created attributions without a marker.
    // Safe approach: remove ALL attributions since none are runtime-created yet.
    await queryInterface.sequelize.query('DELETE FROM evidence_subject_attributions');
  },
};
