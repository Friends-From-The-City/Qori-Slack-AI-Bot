import { Model, Sequelize } from 'sequelize';
import config from '../config/sequelize';

// Import your model definition functions
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
import DispositionAuditLog from './models/disposition_audit_log';
import EvidenceSource from './models/evidence_source';
import EvidenceConstruct from './models/evidence_construct';
import EvidenceRelationship from './models/evidence_relationship';
import SurveyFieldSchema from './models/survey_field_schema';
import SurveyQualitativeEntry from './models/survey_qualitative_entry';
import SurveyCodebook from './models/survey_codebook';
import SurveyCode from './models/survey_code';
import SurveyCodeExample from './models/survey_code_example';
import SurveyCodingRun from './models/survey_coding_run';
import SurveyCodingAssignment from './models/survey_coding_assignment';
import SurveyCodingEntryReview from './models/survey_coding_entry_review';
import ResearchArtifact from './models/research_artifact';
import ArtifactEvidenceRef from './models/artifact_evidence_ref';
import DataSubject from './models/data_subject';
import DataSubjectLink from './models/data_subject_link';
import EvidenceSubjectAttribution from './models/evidence_subject_attribution';
import RecordsSchedule from './models/records_schedule';
import RecordsManagementAssignment from './models/records_management_assignment';
import RecordsHold from './models/records_hold';
import RecordsHoldTarget from './models/records_hold_target';
import RecordsDispositionEvent from './models/records_disposition_event';
// PLAT-2: Organization/tenant isolation
import Organization from './models/organization';
import Team from './models/team';
import Actor from './models/actor';
import ActorIdentity from './models/actor_identity';
import AdapterWorkspaceBinding from './models/adapter_workspace_binding';
import RepositoryBinding from './models/repository_binding';
import ProjectMembership from './models/project_membership';


// Set environment and configuration
const env = process.env.NODE_ENV || 'development';
const sequelizeConfig = (config as Record<string, any>)[env];

// Initialize Sequelize
const sequelize = new Sequelize(sequelizeConfig);

// List of all model definition functions
// Note: Organization/Team must be defined before Project due to FK dependency
// Project must be defined before ResearchStudy due to FK dependency
const modelDefiners = [
  ChannelConfig,
  Organization,
  Team,
  Actor,
  ActorIdentity,
  AdapterWorkspaceBinding,
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
  DispositionAuditLog,
  EvidenceSource,
  EvidenceConstruct,
  EvidenceRelationship,
  SurveyFieldSchema,
  SurveyQualitativeEntry,
  SurveyCodebook,
  SurveyCode,
  SurveyCodeExample,
  SurveyCodingRun,
  SurveyCodingAssignment,
  SurveyCodingEntryReview,
  ResearchArtifact,
  ArtifactEvidenceRef,
  DataSubject,
  DataSubjectLink,
  EvidenceSubjectAttribution,
  RecordsSchedule,
  RecordsManagementAssignment,
  RecordsHold,
  RecordsHoldTarget,
  RecordsDispositionEvent,
  RepositoryBinding,
  ProjectMembership,
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
