import { Model, Sequelize } from 'sequelize';
import config from '../config/sequelize';

// Import your model definition functions
import User from './models/user.model';
import ChannelConfig from './models/channel_config';
import Project from './models/project';
import ProjectMember from './models/project_member';
import ResearchStudy from './models/research_study';
import ResearchStudyUserRole from './models/research_study_user_role';
import StudyStatus from './models/study_status';
import StudyParticipant from './models/study_participant';
import SessionObserver from './models/session_observer';
import StudyNotes from './models/study_notes';
import ResearchPlan from './models/research_plan';
import SessionSummary from './models/session_summary';
import StudyVariable from './models/study_variable';
import CreatedIssue from './models/created_issue';
import SlackUserState from './models/slack_user_state';


// Set environment and configuration
const env = process.env.NODE_ENV || 'development';
const sequelizeConfig = (config as Record<string, any>)[env];

// Initialize Sequelize
const sequelize = new Sequelize(sequelizeConfig);

// List of all model definition functions
// Note: Project must be defined before ResearchStudy due to FK dependency
const modelDefiners = [
  User,
  ChannelConfig,
  Project,
  ProjectMember,
  ResearchStudy,
  ResearchStudyUserRole,
  StudyStatus,
  StudyParticipant,
  SessionObserver,
  StudyNotes,
  ResearchPlan,
  SessionSummary,
  StudyVariable,
  CreatedIssue,
  SlackUserState,
];

// Register all models with Sequelize
for (const defineModel of modelDefiners) {
  defineModel(sequelize);
}

// Run .associate() on each model if defined
Object.keys(sequelize.models).forEach((modelName) => {
  const model = sequelize.models[modelName] as typeof Model & { associate?: (models: typeof sequelize.models) => void };
  if (model.associate) {
    model.associate(sequelize.models);
  }
});

// Export Sequelize instance and models
export default sequelize;
