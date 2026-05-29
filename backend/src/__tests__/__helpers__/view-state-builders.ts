/**
 * View state builders for testing modal callback handlers.
 *
 * These builders generate realistic `view.state.values` structures that match
 * what Slack sends when a modal is submitted. Use them to test handler logic
 * without needing to mock the full Slack request cycle.
 *
 * Usage:
 *   const viewState = buildBriefViewState({
 *     studyName: 'my-study',
 *     problemStatement: 'We need to understand...',
 *   });
 *   await handler({ view: { state: viewState, private_metadata: '...' }, ... });
 */

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface ViewState {
  values: Record<string, Record<string, ViewStateValue>>;
}

export interface ViewStateValue {
  type: string;
  value?: string | null;
  selected_option?: { value: string; text?: { type: string; text: string } } | null;
  selected_options?: Array<{ value: string; text?: { type: string; text: string } }>;
  selected_date?: string | null;
  selected_time?: string | null;
  selected_user?: string | null;
  selected_users?: string[];
  selected_conversations?: string[];
}

export interface PrivateMetadata {
  channelId?: string;
  userId?: string;
  studyName?: string;
  studyId?: string | number;
  projectId?: string | number;
  projectName?: string;
  rootViewId?: string;
  templateId?: string;
  scope?: string;
  [key: string]: unknown;
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function textInput(value: string | null | undefined): ViewStateValue {
  return { type: 'plain_text_input', value: value ?? null };
}

function staticSelect(value: string | null | undefined): ViewStateValue {
  return {
    type: 'static_select',
    selected_option: value ? { value, text: { type: 'plain_text', text: value } } : null,
  };
}

function multiStaticSelect(values: string[]): ViewStateValue {
  return {
    type: 'multi_static_select',
    selected_options: values.map((v) => ({ value: v, text: { type: 'plain_text', text: v } })),
  };
}

function datePicker(value: string | null | undefined): ViewStateValue {
  return { type: 'datepicker', selected_date: value ?? null };
}

function timePicker(value: string | null | undefined): ViewStateValue {
  return { type: 'timepicker', selected_time: value ?? null };
}

function userSelect(value: string | null | undefined): ViewStateValue {
  return { type: 'users_select', selected_user: value ?? null };
}

function radioButtons(value: string | null | undefined): ViewStateValue {
  return {
    type: 'radio_buttons',
    selected_option: value ? { value, text: { type: 'plain_text', text: value } } : null,
  };
}

function checkboxes(values: string[]): ViewStateValue {
  return {
    type: 'checkboxes',
    selected_options: values.map((v) => ({ value: v, text: { type: 'plain_text', text: v } })),
  };
}

// ═══════════════════════════════════════════════════════════
// BRIEF MODAL
// ═══════════════════════════════════════════════════════════

export interface BriefViewStateInput {
  studyName?: string;
  requestedBy?: string;
  problemStatement?: string;
  learningObjectives?: string;
  outOfScope?: string;
  methodology?: string;
  participantApproach?: string;
  timeline?: string;
  startDate?: string;
  decisionDeadline?: string;
  budget?: string;
  discoveryCheckboxes?: string[];
}

export function buildBriefViewState(input: BriefViewStateInput = {}): ViewState {
  return {
    values: {
      study_select_block: {
        study_select: staticSelect(input.studyName || 'test-study'),
      },
      requested_by_block: {
        requested_by_select: userSelect(input.requestedBy || 'U_RESEARCHER'),
      },
      problem_block: {
        problem_input: textInput(input.problemStatement || 'We need to understand user needs.'),
      },
      learning_objectives_block: {
        learning_objectives_input: textInput(input.learningObjectives || '1. Understand current pain points\n2. Identify opportunities'),
      },
      out_of_scope_block: {
        out_of_scope_input: textInput(input.outOfScope || 'Technical implementation details'),
      },
      methodology_block: {
        methodology_select: radioButtons(input.methodology || 'usability_testing'),
      },
      participant_approach_block: {
        participant_approach_input: textInput(input.participantApproach || 'Veterans who use VA.gov'),
      },
      timeline_block: {
        timeline_select: radioButtons(input.timeline || 'standard'),
      },
      start_date_block: {
        start_date_picker: datePicker(input.startDate || '2026-06-01'),
      },
      decision_deadline_block: {
        decision_deadline_picker: datePicker(input.decisionDeadline || '2026-06-15'),
      },
      budget_block: {
        budget_input: textInput(input.budget),
      },
      discovery_checkboxes_block: {
        discovery_checkboxes: checkboxes(input.discoveryCheckboxes || []),
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════
// PLAN MODAL
// ═══════════════════════════════════════════════════════════

export interface PlanViewStateInput {
  studyName?: string;
  leadResearcher?: string;
  startDate?: string;
  methodology?: string;
  sessionCount?: string;
  sessionDuration?: string;
  participantCriteria?: string;
  executionRisks?: string;
}

export function buildPlanViewState(input: PlanViewStateInput = {}): ViewState {
  return {
    values: {
      study_select_block: {
        study_select: staticSelect(input.studyName || 'test-study'),
      },
      lead_researcher_block: {
        lead_researcher_select: userSelect(input.leadResearcher || 'U_RESEARCHER'),
      },
      start_date_block: {
        start_date_picker: datePicker(input.startDate || '2026-06-01'),
      },
      methodology_block: {
        methodology_select: staticSelect(input.methodology || 'usability_testing'),
      },
      session_count_block: {
        session_count_input: textInput(input.sessionCount || '8'),
      },
      session_duration_block: {
        session_duration_select: staticSelect(input.sessionDuration || '60'),
      },
      participant_criteria_block: {
        participant_criteria_input: textInput(input.participantCriteria || 'Veterans with VA.gov accounts'),
      },
      execution_risks_block: {
        execution_risks_input: textInput(input.executionRisks || 'Recruitment timeline may be tight'),
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════
// FIELDWORK DASHBOARD
// ═══════════════════════════════════════════════════════════

export interface FieldworkStudyPickerInput {
  studyId?: string;
}

export function buildFieldworkStudyPickerState(input: FieldworkStudyPickerInput = {}): ViewState {
  return {
    values: {
      study_select_block: {
        study_select: staticSelect(input.studyId || '1'),
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════
// ADD PARTICIPANT MODAL
// ═══════════════════════════════════════════════════════════

export interface AddParticipantViewStateInput {
  participantName?: string;
  recruitmentSource?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  status?: string;
  notes?: string;
  raceEthnicity?: string;
  ageRange?: string;
  educationLevel?: string;
  locationType?: string;
}

export function buildAddParticipantViewState(input: AddParticipantViewStateInput = {}): ViewState {
  return {
    values: {
      participant_name_block: {
        participant_name_input: textInput(input.participantName || 'PT-001'),
      },
      recruitment_source_block: {
        recruitment_source_select: staticSelect(input.recruitmentSource || 'perigean'),
      },
      scheduled_date_block: {
        scheduled_date_picker: datePicker(input.scheduledDate || '2026-06-15'),
      },
      scheduled_time_block: {
        scheduled_time_picker: timePicker(input.scheduledTime || '10:00'),
      },
      status_block: {
        status_select: staticSelect(input.status || 'scheduled'),
      },
      notes_block: {
        notes_input: textInput(input.notes),
      },
      race_ethnicity_block: {
        race_ethnicity_select: staticSelect(input.raceEthnicity || 'prefer_not_to_say'),
      },
      age_range_block: {
        age_range_select: staticSelect(input.ageRange || '35-44'),
      },
      education_block: {
        education_select: staticSelect(input.educationLevel || 'bachelor'),
      },
      location_block: {
        location_select: staticSelect(input.locationType || 'urban'),
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════
// APPROVAL MODAL
// ═══════════════════════════════════════════════════════════

export interface ApprovalViewStateInput {
  reason?: string;
}

export function buildApprovalViewState(input: ApprovalViewStateInput = {}): ViewState {
  return {
    values: {
      reason_block: {
        reason_input: textInput(input.reason || 'Approved - looks good'),
      },
    },
  };
}

export function buildRequestChangesViewState(input: ApprovalViewStateInput = {}): ViewState {
  return {
    values: {
      reason_block: {
        reason_input: textInput(input.reason || 'Please clarify the participant criteria'),
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════
// PRIVATE METADATA BUILDER
// ═══════════════════════════════════════════════════════════

export function buildPrivateMetadata(fields: PrivateMetadata): string {
  const defaults: PrivateMetadata = {
    channelId: 'C_TEST_CHANNEL',
    userId: 'U_TEST_USER',
  };
  return JSON.stringify({ ...defaults, ...fields });
}

// ═══════════════════════════════════════════════════════════
// MOCK VIEW OBJECT
// ═══════════════════════════════════════════════════════════

export interface MockViewSubmission {
  id: string;
  type: 'modal';
  callback_id: string;
  state: ViewState;
  private_metadata: string;
  hash: string;
  title: { type: 'plain_text'; text: string };
}

export function buildMockView(
  callbackId: string,
  state: ViewState,
  privateMetadata: PrivateMetadata | string,
): MockViewSubmission {
  return {
    id: `V_MOCK_${Date.now()}`,
    type: 'modal',
    callback_id: callbackId,
    state,
    private_metadata:
      typeof privateMetadata === 'string'
        ? privateMetadata
        : buildPrivateMetadata(privateMetadata),
    hash: `hash_${Date.now()}`,
    title: { type: 'plain_text', text: 'Test Modal' },
  };
}

// ═══════════════════════════════════════════════════════════
// MOCK BODY OBJECT
// ═══════════════════════════════════════════════════════════

export interface MockBody {
  user: { id: string; name: string };
  trigger_id: string;
  view?: MockViewSubmission;
  actions?: Array<{ action_id: string; value: string }>;
}

export function buildMockBody(
  userId: string = 'U_TEST_USER',
  view?: MockViewSubmission,
  actions?: Array<{ action_id: string; value: string }>,
): MockBody {
  return {
    user: { id: userId, name: 'testuser' },
    trigger_id: `trigger_${Date.now()}`,
    view,
    actions,
  };
}
