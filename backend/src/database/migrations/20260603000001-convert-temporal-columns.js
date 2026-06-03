'use strict';

/**
 * R2: Convert STRING temporal columns to proper DATE/TIME types.
 *
 * Columns converted:
 * - study_participants.scheduled_date: STRING → DATE
 * - study_participants.scheduled_time: STRING → TIME
 * - study_notes.session_date: STRING → DATE
 * - study_notes.session_time: STRING → TIME
 *
 * Also adds research_studies.session_timezone to anchor naive times.
 * Default 'America/New_York' (VA HQ timezone). Modal can capture this later.
 *
 * Timezone rationale: Sessions are displayed to remote observers via Slack.
 * Naive DATE+TIME is ambiguous across timezones. By recording the study's
 * timezone, we can later convert to TIMESTAMPTZ or display "2pm ET".
 * Without this anchor, the timezone is unrecoverable.
 *
 * Robustness: Handles malformed strings (e.g., "TBD", "N/A", invalid dates)
 * by setting them to NULL. The safe_to_date/safe_to_time helper functions
 * catch parse failures and return NULL, then log a count of converted rows.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Add session_timezone to research_studies (anchor for naive times)
      await queryInterface.addColumn('research_studies', 'session_timezone', {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'America/New_York',
      }, { transaction });

      // Create helper functions for safe parsing (returns NULL on failure)
      await queryInterface.sequelize.query(`
        CREATE OR REPLACE FUNCTION pg_temp.safe_to_date(text) RETURNS date AS $$
        BEGIN
          IF $1 IS NULL OR TRIM($1) = '' THEN
            RETURN NULL;
          END IF;
          RETURN $1::date;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Could not parse date: %', $1;
          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE OR REPLACE FUNCTION pg_temp.safe_to_time(text) RETURNS time AS $$
        BEGIN
          IF $1 IS NULL OR TRIM($1) = '' THEN
            RETURN NULL;
          END IF;
          RETURN $1::time;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Could not parse time: %', $1;
          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
      `, { transaction });

      // Log malformed values before conversion (for audit trail)
      const [badDates] = await queryInterface.sequelize.query(`
        SELECT id, scheduled_date FROM study_participants
        WHERE scheduled_date IS NOT NULL
          AND TRIM(scheduled_date) != ''
          AND scheduled_date !~ '^\\d{4}-\\d{2}-\\d{2}$'
      `, { transaction });
      if (badDates.length > 0) {
        console.log(`⚠️  Found ${badDates.length} malformed scheduled_date values (will become NULL):`);
        badDates.slice(0, 5).forEach(row => console.log(`    id=${row.id}: "${row.scheduled_date}"`));
        if (badDates.length > 5) console.log(`    ... and ${badDates.length - 5} more`);
      }

      const [badSessionDates] = await queryInterface.sequelize.query(`
        SELECT id, session_date FROM study_notes
        WHERE session_date IS NOT NULL
          AND TRIM(session_date) != ''
          AND session_date !~ '^\\d{4}-\\d{2}-\\d{2}$'
      `, { transaction });
      if (badSessionDates.length > 0) {
        console.log(`⚠️  Found ${badSessionDates.length} malformed session_date values (will become NULL):`);
        badSessionDates.slice(0, 5).forEach(row => console.log(`    id=${row.id}: "${row.session_date}"`));
        if (badSessionDates.length > 5) console.log(`    ... and ${badSessionDates.length - 5} more`);
      }

      // Convert study_participants temporal columns using safe parsers
      await queryInterface.sequelize.query(`
        ALTER TABLE study_participants
        ALTER COLUMN scheduled_date TYPE DATE
        USING pg_temp.safe_to_date(scheduled_date)
      `, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE study_participants
        ALTER COLUMN scheduled_time TYPE TIME
        USING pg_temp.safe_to_time(scheduled_time)
      `, { transaction });

      // Convert study_notes temporal columns using safe parsers
      await queryInterface.sequelize.query(`
        ALTER TABLE study_notes
        ALTER COLUMN session_date TYPE DATE
        USING pg_temp.safe_to_date(session_date)
      `, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE study_notes
        ALTER COLUMN session_time TYPE TIME
        USING pg_temp.safe_to_time(session_time)
      `, { transaction });

      await transaction.commit();
      console.log('✅ Converted temporal columns to DATE/TIME, added session_timezone');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Revert to STRING
      await queryInterface.changeColumn('study_participants', 'scheduled_date', {
        type: Sequelize.STRING,
        allowNull: true,
      }, { transaction });

      await queryInterface.changeColumn('study_participants', 'scheduled_time', {
        type: Sequelize.STRING,
        allowNull: true,
      }, { transaction });

      await queryInterface.changeColumn('study_notes', 'session_date', {
        type: Sequelize.STRING,
        allowNull: true,
      }, { transaction });

      await queryInterface.changeColumn('study_notes', 'session_time', {
        type: Sequelize.STRING,
        allowNull: true,
      }, { transaction });

      await queryInterface.removeColumn('research_studies', 'session_timezone', { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
