/**
 * Model attribute types for Sequelize models.
 *
 * These interfaces describe the shape of each model's attributes as they
 * appear at the application layer. They will be used as generic parameters
 * on the Model class when models are migrated to .ts in Phase 3 (ADR 0014).
 *
 * Until Phase 3, these serve as reference documentation and are used by
 * service and handler types to describe what data they expect.
 *
 * DECIMAL fields (parsed_budget_amount, compensation_amount) are typed as
 * number | null. Sequelize returns DECIMAL as strings, but model getters
 * coerce to number so consumers see a consistent numeric type. See ADR 0014.
 */

import type {
  ParticipantStatus,
  OutreachMethod,
  StudyApprovalStatus,
  ObserverRole,
  ObserverStatus,
  ObserverJoinedVia,
} from './common';

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export interface UserAttributes {
  id: number;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  is_admin: boolean;
  password: string;
  created_at: Date;
  updated_at: Date;
}

export interface UserCreationAttributes
  extends Omit<UserAttributes, 'id' | 'created_at' | 'updated_at' | 'is_admin'> {
  is_admin?: boolean;
}

// ---------------------------------------------------------------------------
// ChannelConfig
// ---------------------------------------------------------------------------

export interface ChannelConfigAttributes {
  id: number;
  channel_id: string;
  github_id: string | null;
  repo_id: string | null;
  repo: string | null;
  product_folder_name: string | null;
  sub_folder_name: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ChannelConfigCreationAttributes
  extends Omit<ChannelConfigAttributes, 'id' | 'created_at' | 'updated_at'> {}

// ---------------------------------------------------------------------------
// ResearchStudy
// ---------------------------------------------------------------------------

export interface ResearchStudyAttributes {
  id: number;
  name: string;
  channel_name: string;
  description: string | null;
  link: string | null;
  path: string | null;
  sha4: string | null;
  created_by: string;
  researcher_name: string;
  researcher_email: string;
  total_participants: number;
  /** DECIMAL(10,2) — model getter coerces to number. See ADR 0014. */
  parsed_budget_amount: number | null;
  target_participants: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface ResearchStudyCreationAttributes
  extends Omit<ResearchStudyAttributes,
    'id' | 'created_at' | 'updated_at' | 'total_participants' |
    'description' | 'link' | 'path' | 'sha4' | 'parsed_budget_amount' | 'target_participants'
  > {
  total_participants?: number;
  description?: string | null;
  link?: string | null;
  path?: string | null;
  sha4?: string | null;
  parsed_budget_amount?: number | null;
  target_participants?: number | null;
}

// ---------------------------------------------------------------------------
// ResearchStudyUserRole
// ---------------------------------------------------------------------------

export interface ResearchStudyUserRoleAttributes {
  id: number;
  research_id: number;
  user_id: string;
  role: string;
  created_at: Date;
}

export interface ResearchStudyUserRoleCreationAttributes
  extends Omit<ResearchStudyUserRoleAttributes, 'id' | 'created_at'> {}

// ---------------------------------------------------------------------------
// StudyStatus
// ---------------------------------------------------------------------------

export interface StudyStatusAttributes {
  id: number;
  study_name: string | null;
  approved_by: string | null;
  requested_by: string | null;
  reason: string | null;
  status: StudyApprovalStatus;
  path: string | null;
  file_name: string | null;
  approved_at: Date;
  updated_at: Date;
  created_by: string | null;
}

export interface StudyStatusCreationAttributes
  extends Omit<StudyStatusAttributes, 'id' | 'approved_at' | 'updated_at' | 'status'> {
  status?: StudyApprovalStatus;
}

// ---------------------------------------------------------------------------
// StudyParticipant
// ---------------------------------------------------------------------------

export interface StudyParticipantAttributes {
  id: number;
  study_id: number;
  participant_code: string;
  participant_name: string;
  contact_details: string | null;
  recruitment_source: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status_select: ParticipantStatus | null;
  notes_field: string | null;
  demographics_info: Record<string, unknown> | null;
  /** DECIMAL(10,2) — model getter coerces to number. See ADR 0014. */
  compensation_amount: number | null;
  outreach_sent_at: Date | null;
  outreach_method: OutreachMethod | null;
  outreach_count: number;
  added_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface StudyParticipantCreationAttributes
  extends Omit<StudyParticipantAttributes,
    'id' | 'created_at' | 'updated_at' | 'outreach_count' | 'participant_code' |
    'contact_details' | 'recruitment_source' | 'scheduled_date' | 'scheduled_time' |
    'status_select' | 'notes_field' | 'demographics_info' | 'compensation_amount' |
    'outreach_sent_at' | 'outreach_method'
  > {
  outreach_count?: number;
  contact_details?: string | null;
  recruitment_source?: string | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  status_select?: ParticipantStatus | null;
  notes_field?: string | null;
  demographics_info?: Record<string, unknown> | null;
  compensation_amount?: number | null;
  outreach_sent_at?: Date | null;
  outreach_method?: OutreachMethod | null;
}

// ---------------------------------------------------------------------------
// SessionObserver
// ---------------------------------------------------------------------------

export interface SessionObserverAttributes {
  id: number;
  study_id: number;
  participant_id: number | null;
  session_id: string;
  /** JSONB array of Slack user IDs. Custom getter ensures always array. */
  requester_id: string[];
  /** JSONB array of display names. Custom getter ensures always array. */
  requester_name: string[];
  role: ObserverRole;
  reason: string | null;
  status: ObserverStatus;
  joined_via: ObserverJoinedVia | null;
  approved_by: string | null;
  approved_at: Date | null;
  guidelines_sent: boolean;
  guidelines_sent_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SessionObserverCreationAttributes
  extends Omit<SessionObserverAttributes,
    'id' | 'created_at' | 'updated_at' | 'status' | 'guidelines_sent' |
    'participant_id' | 'reason' | 'joined_via' | 'approved_by' | 'approved_at' | 'guidelines_sent_at'
  > {
  status?: ObserverStatus;
  guidelines_sent?: boolean;
  participant_id?: number | null;
  reason?: string | null;
  joined_via?: ObserverJoinedVia | null;
  approved_by?: string | null;
  approved_at?: Date | null;
  guidelines_sent_at?: Date | null;
}

// ---------------------------------------------------------------------------
// StudyNotes
// ---------------------------------------------------------------------------

export interface StudyNotesAttributes {
  id: number;
  study_id: number;
  study_name: string;
  filename: string;
  file_path: string | null;
  file_url: string | null;
  transcript: boolean;
  session_date: string | null;
  session_time: string | null;
  participant_name: string | null;
  researcher: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string;
}

export interface StudyNotesCreationAttributes
  extends Omit<StudyNotesAttributes,
    'id' | 'created_at' | 'updated_at' | 'transcript' |
    'file_path' | 'file_url' | 'session_date' | 'session_time' | 'participant_name' | 'researcher'
  > {
  transcript?: boolean;
  file_path?: string | null;
  file_url?: string | null;
  session_date?: string | null;
  session_time?: string | null;
  participant_name?: string | null;
  researcher?: string | null;
}

// ---------------------------------------------------------------------------
// ResearchPlan
// ---------------------------------------------------------------------------

export interface ResearchPlanAttributes {
  id: number;
  study_id: number;
  study_name: string;
  filename: string;
  file_path: string | null;
  file_url: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string;
}

export interface ResearchPlanCreationAttributes
  extends Omit<ResearchPlanAttributes, 'id' | 'created_at' | 'updated_at' | 'file_path' | 'file_url'> {
  file_path?: string | null;
  file_url?: string | null;
}

// ---------------------------------------------------------------------------
// SessionSummary
// ---------------------------------------------------------------------------

export interface SessionSummaryAttributes {
  id: number;
  study_id: number;
  study_name: string;
  filename: string;
  file_path: string | null;
  file_url: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string;
}

export interface SessionSummaryCreationAttributes
  extends Omit<SessionSummaryAttributes, 'id' | 'created_at' | 'updated_at' | 'file_path' | 'file_url'> {
  file_path?: string | null;
  file_url?: string | null;
}

// ---------------------------------------------------------------------------
// StudyVariable
// ---------------------------------------------------------------------------

export interface StudyVariableAttributes {
  id: number;
  study_name: string;
  variable_key: string;
  variable_type: string | null;
  item_key: string | null;
  value: unknown;
  participant_id: string | null;
  source_template: string;
  source_version: string | null;
  source_date: Date | null;
  value_hash: string | null;
  entry_count: number | null;
  is_pool: boolean;
  confidence: string | null;
  scope: string | null;
  discovery_artifact_id: string | null;
  stale: boolean;
  extracted_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface StudyVariableCreationAttributes
  extends Omit<StudyVariableAttributes,
    'id' | 'created_at' | 'updated_at' | 'extracted_at' | 'is_pool' | 'stale' |
    'variable_type' | 'item_key' | 'participant_id' | 'source_version' | 'source_date' |
    'value_hash' | 'entry_count' | 'confidence' | 'scope' | 'discovery_artifact_id'
  > {
  is_pool?: boolean;
  stale?: boolean;
  extracted_at?: Date;
  variable_type?: string | null;
  item_key?: string | null;
  participant_id?: string | null;
  source_version?: string | null;
  source_date?: Date | null;
  value_hash?: string | null;
  entry_count?: number | null;
  confidence?: string | null;
  scope?: string | null;
  discovery_artifact_id?: string | null;
}

// ---------------------------------------------------------------------------
// CreatedIssue
// ---------------------------------------------------------------------------

export interface CreatedIssueAttributes {
  id: number;
  study_name: string;
  audience: string;
  ticket_id: string;
  github_issue_number: number;
  github_url: string;
  github_repo: string;
  created_by: string;
  created_at: Date;
}

export interface CreatedIssueCreationAttributes
  extends Omit<CreatedIssueAttributes, 'id' | 'created_at'> {}

// ---------------------------------------------------------------------------
// SlackUserState
// ---------------------------------------------------------------------------

export interface SlackUserStateAttributes {
  slack_user_id: string;
  active_study_id: number | null;
  onboarded_at: Date | null;
  updated_at: Date;
}

export interface SlackUserStateCreationAttributes
  extends Omit<SlackUserStateAttributes, 'updated_at' | 'active_study_id' | 'onboarded_at'> {
  active_study_id?: number | null;
  onboarded_at?: Date | null;
}
