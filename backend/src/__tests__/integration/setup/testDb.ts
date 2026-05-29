/**
 * Test database helper — provides a Sequelize instance connected to the
 * test database, with model registration and per-test truncation.
 *
 * Usage in tests:
 *   import { getTestDb, truncateAll } from './setup/testDb';
 *
 *   const sequelize = getTestDb();
 *   beforeEach(() => truncateAll());
 *   afterAll(() => sequelize.close());
 */

import { Sequelize, Model } from 'sequelize';

// Import model definers (same list as database/index.ts)
import User from '../../../database/models/user.model';
import ChannelConfig from '../../../database/models/channel_config';
import Project from '../../../database/models/project';
import ResearchStudy from '../../../database/models/research_study';
import ResearchStudyUserRole from '../../../database/models/research_study_user_role';
import StudyStatus from '../../../database/models/study_status';
import StudyParticipant from '../../../database/models/study_participant';
import SessionObserver from '../../../database/models/session_observer';
import StudyNotes from '../../../database/models/study_notes';
import ResearchPlan from '../../../database/models/research_plan';
import SessionSummary from '../../../database/models/session_summary';
import StudyVariable from '../../../database/models/study_variable';
import CreatedIssue from '../../../database/models/created_issue';
import SlackUserState from '../../../database/models/slack_user_state';

let instance: Sequelize | null = null;

/**
 * Returns a Sequelize instance connected to the test database with all
 * models registered and associated. Singleton — safe to call multiple times.
 */
export function getTestDb(): Sequelize {
  if (instance) return instance;

  instance = new Sequelize({
    username: process.env.TEST_DB_USER ?? process.env.USER ?? 'qori_test',
    password: process.env.TEST_DB_PASSWORD ?? '',
    database: process.env.TEST_DB_NAME ?? 'qori_test',
    host: process.env.TEST_DB_HOST ?? 'localhost',
    port: parseInt(process.env.TEST_DB_PORT ?? '5432', 10),
    dialect: 'postgres',
    logging: false,
  });

  // Register all models (Project must be registered before models that depend on it)
  const modelDefiners = [
    User, ChannelConfig, Project, ResearchStudy, ResearchStudyUserRole,
    StudyStatus, StudyParticipant, SessionObserver, StudyNotes,
    ResearchPlan, SessionSummary, StudyVariable, CreatedIssue, SlackUserState,
  ];

  for (const defineModel of modelDefiners) {
    defineModel(instance);
  }

  // Run associations
  Object.keys(instance.models).forEach((modelName) => {
    const model = instance!.models[modelName] as typeof Model & { associate?: (models: Record<string, typeof Model>) => void };
    if (model.associate) {
      model.associate(instance!.models);
    }
  });

  return instance;
}

/**
 * Truncate all tables (CASCADE) for per-test isolation.
 * Call in beforeEach() to ensure each test starts with a clean database.
 */
export async function truncateAll(): Promise<void> {
  const db = getTestDb();
  // Query actual tables from pg_tables to avoid model-name vs table-name mismatches
  const [rows] = await db.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != 'SequelizeMeta'"
  );
  const tables = (rows as Array<{ tablename: string }>).map(r => `"${r.tablename}"`);
  if (tables.length > 0) {
    await db.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
  }
}
