const { Sequelize, DataTypes } = require("sequelize");
const config = require("../config/sequelize");

// Import your model definition functions
const User = require("./models/user.model");
const ChannelConfig = require("./models/channel_config");
const ResearchStudy = require("./models/research_study")
const ResearchStudyUserRole = require("./models/research_study_user_role")
const StudyStatus = require("./models/study_status")
const StudyParticipant = require("./models/study_participant")
const SessionObserver = require("./models/session_observer")
const StudyNotes = require("./models/study_notes")
const ResearchPlan = require("./models/research_plan")
const SessionSummary = require("./models/session_summary")
const StudyVariable = require("./models/study_variable")


// Set environment and configuration
const env = process.env.NODE_ENV || "development";
const sequelizeConfig = config[env];

// Initialize Sequelize
const sequelize = new Sequelize(sequelizeConfig);

// List of all model definition functions
const modelDefiners = [
  User,
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
