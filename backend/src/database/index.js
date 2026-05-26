const { Sequelize, DataTypes } = require("sequelize");
const config = require("../config/sequelize");

// Import your model definition functions
// TypeScript models use `export default`, so we need .default for CommonJS interop
const User = require("./models/user.model").default;
const ChannelConfig = require("./models/channel_config").default;
const ResearchStudy = require("./models/research_study").default;
const ResearchStudyUserRole = require("./models/research_study_user_role").default;
const StudyStatus = require("./models/study_status").default;
const StudyParticipant = require("./models/study_participant").default;
const SessionObserver = require("./models/session_observer").default;
const StudyNotes = require("./models/study_notes").default;
const ResearchPlan = require("./models/research_plan").default;
const SessionSummary = require("./models/session_summary").default;
const StudyVariable = require("./models/study_variable").default;
const CreatedIssue = require("./models/created_issue").default;
const SlackUserState = require("./models/slack_user_state").default;
const Project = require("./models/project").default;


// Set environment and configuration
const env = process.env.NODE_ENV || "development";
const sequelizeConfig = config[env];

// Initialize Sequelize
const sequelize = new Sequelize(sequelizeConfig);

// List of all model definition functions
const modelDefiners = [
  User,
  Project,
  ChannelConfig,
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

// Register all models with Sequelize and pass DataTypes
for (const defineModel of modelDefiners) {
  defineModel(sequelize, DataTypes);
}

// Run .associate() on each model if defined
Object.keys(sequelize.models).forEach((modelName) => {
  if (sequelize.models[modelName].associate) {
    sequelize.models[modelName].associate(sequelize.models);
  }
});

// Export Sequelize instance and models
module.exports = sequelize;
