// participantYamlProcessor.ts
import yaml from 'js-yaml';
import Handlebars from 'handlebars';
import { format } from 'date-fns';
import path from 'path';
import { createOrUpdateFileOnGitHub, fetchFileFromRepo } from './github';
import type { GitHubWriteResult } from './github';
import { PARTICIPANT_STATUS, PARTICIPANT_STATUS_LABELS } from '../constants/participantStatus';
import type { ParticipantStatus } from '../constants/participantStatus';

import SessionObserverService from '../services/session_observer.service';

// ─── Interfaces ──────────────────────────────────────────────────────

/** Demographics info can be a parsed object, a JSON string, or plain text (legacy). */
type DemographicsInfo = Record<string, string> | string | null | undefined;

/** Shape of a participant record as stored in the database / passed into this module. */
export interface ParticipantRecord {
  id: number;
  participant_name: string;
  contact_details: string | null;
  recruitment_source: string | null;
  scheduled_date: string | null;
  scheduled_time?: string | null;
  status_select: ParticipantStatus | string | null;
  notes_field: string | null;
  demographics_info?: DemographicsInfo;
  compensation_amount?: number | string | null;
  outreach_sent_at?: string | Date | null;
  outreach_count?: number;
  [key: string]: unknown;
}

/** Shape of a participant row extracted from an existing Markdown file. */
interface ExtractedParticipant {
  id: number;
  participant_name: string;
  contact_details: string;
  recruitment_source: string;
  scheduled_date: string;
  scheduled_time?: string | null;
  status_select: string;
  notes_field: string;
  outreach_sent_at?: string | Date | null;
  outreach_count?: number;
  compensation_amount?: number | string | null;
}

/** Recruitment breakdown item. */
interface RecruitmentBreakdownItem {
  method: string;
  count: number;
  percentage: number;
}

/** Follow-up action item. */
interface FollowupItem {
  participant_id: number;
  action: string;
  status: string;
}

/** Demographic breakdown item variants. */
interface RaceBreakdownItem { category: string; count: number; percentage: number; }
interface AgeBreakdownItem { range: string; count: number; percentage: number; }
interface EducationBreakdownItem { level: string; count: number; percentage: number; }
interface LocationBreakdownItem { type: string; count: number; percentage: number; }

interface DemographicBreakdowns {
  race_ethnicity_breakdown: RaceBreakdownItem[];
  age_range_breakdown: AgeBreakdownItem[];
  education_breakdown: EducationBreakdownItem[];
  location_breakdown: LocationBreakdownItem[];
}

/** Input values passed through from the Slack modal / handler. */
export interface ParticipantInputValues {
  study_id?: number;
  added_by?: string;
  participant_name?: string;
  contact_details?: string;
  recruitment_source?: string;
  scheduled_date?: string;
  scheduled_time?: string;
  status_select?: string;
  notes_field?: string;
  [key: string]: unknown;
}

/** YAML configuration shape for participant templates. */
interface ParticipantYamlConfig {
  output_template?: string;
  output_options?: {
    filename?: string;
    path?: string;
  };
  [key: string]: unknown;
}

/** Return value of processParticipantYamlTemplate. */
export interface ProcessParticipantResult {
  result: GitHubWriteResult;
  outputTemplate: string;
}

// ─── Display-name mappings ───────────────────────────────────────────

const SOURCE_MAPPINGS: Record<string, string> = {
  'internal_panel': '🗂️ Internal VA Panel',
  'calendly': '📅 Calendly Signup',
  'email_outreach': '📧 Email Outreach',
  'phone': '📞 Phone Recruitment',
  'referral': '🤝 Referral',
  'online': '🌐 Social/Website',
  'csv_import': '📊 CSV Import',
  'api_import': '🔗 API Import',
  'unknown': '❓ Unknown',
};

const RACE_ETHNICITY_MAPPINGS: Record<string, string> = {
  'american_indian_alaska_native': 'American Indian or Alaska Native',
  'asian': 'Asian',
  'black_african_american': 'Black or African American',
  'hispanic_latino': 'Hispanic or Latino',
  'native_hawaiian_pacific_islander': 'Native Hawaiian or Other Pacific Islander',
  'white': 'White',
  'two_or_more_races': 'Two or More Races',
  'prefer_not_to_say': 'Prefer not to say',
};

const EDUCATION_LEVEL_MAPPINGS: Record<string, string> = {
  'less_than_high_school': 'Less than high school',
  'high_school_ged': 'High school diploma/GED',
  'some_college': 'Some college',
  'associate_degree': 'Associate degree',
  'bachelors_degree': "Bachelor's degree",
  'masters_degree': "Master's degree",
  'professional_degree': 'Professional degree',
  'doctorate_degree': 'Doctorate degree',
  'prefer_not_to_say': 'Prefer not to say',
};

const LOCATION_TYPE_MAPPINGS: Record<string, string> = {
  'urban': 'Urban',
  'suburban': 'Suburban',
  'rural': 'Rural',
  'prefer_not_to_say': 'Prefer not to say',
};

// ─── Helper functions ────────────────────────────────────────────────

function getRecruitmentSourceDisplay(source: string): string {
  return SOURCE_MAPPINGS[source] || source;
}

function getRaceEthnicityDisplay(value: string): string {
  return RACE_ETHNICITY_MAPPINGS[value] || value;
}

function getEducationLevelDisplay(value: string): string {
  return EDUCATION_LEVEL_MAPPINGS[value] || value;
}

function getLocationTypeDisplay(value: string): string {
  return LOCATION_TYPE_MAPPINGS[value] || value;
}

function calculateRecruitmentBreakdown(participants: ParticipantRecord[]): RecruitmentBreakdownItem[] {
  const breakdown: Record<string, number> = {};
  const total = participants.length;

  participants.forEach(participant => {
    const source = participant.recruitment_source || 'unknown';
    breakdown[source] = (breakdown[source] || 0) + 1;
  });

  return Object.entries(breakdown).map(([method, count]) => ({
    method: getRecruitmentSourceDisplay(method),
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0,
  }));
}

function generateImmediateActions(participants: ParticipantRecord[]): string[] {
  const actions: string[] = [];

  const pendingParticipants = participants.filter((p) => p.status_select === PARTICIPANT_STATUS.CONTACTED);
  const reschedulingParticipants = participants.filter((p) => p.status_select === PARTICIPANT_STATUS.NEEDS_RESCHEDULE);
  const confirmedParticipants = participants.filter((p) => p.status_select === PARTICIPANT_STATUS.CONFIRMED);

  if (pendingParticipants.length > 0) {
    actions.push(`Follow up with ${pendingParticipants.length} pending participant(s)`);
  }

  if (reschedulingParticipants.length > 0) {
    actions.push(`Reschedule ${reschedulingParticipants.length} session(s)`);
  }

  if (confirmedParticipants.length === 0) {
    actions.push('Schedule first confirmed session');
  }

  if (participants.length < 3) {
    actions.push(`Recruit ${3 - participants.length} more participant(s) to reach minimum`);
  }

  return actions;
}

function generateFollowupNeeded(participants: ParticipantRecord[]): FollowupItem[] {
  const followups: FollowupItem[] = [];

  participants.forEach(participant => {
    if (participant.status_select === PARTICIPANT_STATUS.CONTACTED) {
      followups.push({
        participant_id: participant.id,
        action: 'Send follow-up email',
        status: PARTICIPANT_STATUS.CONTACTED,
      });
    } else if (participant.status_select === PARTICIPANT_STATUS.NEEDS_RESCHEDULE) {
      followups.push({
        participant_id: participant.id,
        action: 'Coordinate new session time',
        status: PARTICIPANT_STATUS.NEEDS_RESCHEDULE,
      });
    } else if (participant.status_select === PARTICIPANT_STATUS.NOT_CONTACTED && !participant.scheduled_date) {
      followups.push({
        participant_id: participant.id,
        action: 'Schedule initial session',
        status: PARTICIPANT_STATUS.NOT_CONTACTED,
      });
    }
  });

  return followups;
}

function generateDemographicsSummary(participants: ParticipantRecord[]): string {
  if (participants.length === 0) return 'No demographic data available';

  const withDemographics = participants.filter(p => {
    if (!p.demographics_info) return false;

    if (typeof p.demographics_info === 'string') {
      if (p.demographics_info.trim().startsWith('{') && p.demographics_info.trim().endsWith('}')) {
        try {
          const parsed = JSON.parse(p.demographics_info) as Record<string, unknown>;
          return Object.values(parsed).some(val => val && val !== '');
        } catch {
          return false;
        }
      } else {
        return p.demographics_info.trim() !== '';
      }
    }

    if (typeof p.demographics_info === 'object') {
      return Object.values(p.demographics_info).some(val => val && val !== '');
    }

    return false;
  });

  if (withDemographics.length === 0) return 'No demographic data collected yet';

  return `Demographics collected for ${withDemographics.length} of ${participants.length} participants`;
}

function generateDemographicBreakdowns(participants: ParticipantRecord[]): DemographicBreakdowns {
  const raceBreakdown: Record<string, number> = {};
  const ageBreakdown: Record<string, number> = {};
  const educationBreakdown: Record<string, number> = {};
  const locationBreakdown: Record<string, number> = {};

  participants.forEach((_participant) => {
    let demographics: DemographicsInfo = _participant.demographics_info;

    if (typeof demographics === 'string') {
      if (demographics.trim().startsWith('{') && demographics.trim().endsWith('}')) {
        try {
          demographics = JSON.parse(demographics) as Record<string, string>;
        } catch {
          return;
        }
      } else {
        return;
      }
    }

    if (typeof demographics === 'object' && demographics) {
      if (demographics.race_ethnicity && demographics.race_ethnicity !== '') {
        const raceKey = demographics.race_ethnicity;
        raceBreakdown[raceKey] = (raceBreakdown[raceKey] || 0) + 1;
      }

      if (demographics.age_range && demographics.age_range !== '') {
        const ageKey = demographics.age_range;
        ageBreakdown[ageKey] = (ageBreakdown[ageKey] || 0) + 1;
      }

      if (demographics.education_level && demographics.education_level !== '') {
        const educationKey = demographics.education_level;
        educationBreakdown[educationKey] = (educationBreakdown[educationKey] || 0) + 1;
      }

      if (demographics.location_type && demographics.location_type !== '') {
        const locationKey = demographics.location_type;
        locationBreakdown[locationKey] = (locationBreakdown[locationKey] || 0) + 1;
      }
    }
  });

  const total = participants.length;

  const race_ethnicity_breakdown = Object.entries(raceBreakdown).map(([category, count]) => ({
    category: getRaceEthnicityDisplay(category),
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0,
  }));

  const age_range_breakdown = Object.entries(ageBreakdown).map(([range, count]) => ({
    range,
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0,
  }));

  const education_breakdown = Object.entries(educationBreakdown).map(([level, count]) => ({
    level: getEducationLevelDisplay(level),
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0,
  }));

  const location_breakdown = Object.entries(locationBreakdown).map(([type, count]) => ({
    type: getLocationTypeDisplay(type),
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0,
  }));

  return {
    race_ethnicity_breakdown,
    age_range_breakdown,
    education_breakdown,
    location_breakdown,
  };
}

function generateRecruitmentAnalysis(participants: ParticipantRecord[]): string {
  if (participants.length === 0) return 'No recruitment data available';

  const confirmedCount = participants.filter((p) => p.status_select === PARTICIPANT_STATUS.CONFIRMED).length;

  const conversionRate = participants.length > 0 ? Math.round((confirmedCount / participants.length) * 100) : 0;

  return `Recruitment effectiveness: ${conversionRate}% conversion rate (${confirmedCount} confirmed of ${participants.length} recruited)`;
}

function generateNextStepsRecommendations(participants: ParticipantRecord[], totalCount: number): string {
  const recommendations: string[] = [];

  if (totalCount < 3) {
    recommendations.push(`Continue recruiting to reach minimum of 3 participants (${3 - totalCount} more needed)`);
  }

  const pendingCount = participants.filter((p) => p.status_select === PARTICIPANT_STATUS.CONTACTED).length;
  if (pendingCount > 0) {
    recommendations.push(`Follow up with ${pendingCount} pending participant(s)`);
  }

  const reschedulingCount = participants.filter((p) => p.status_select === PARTICIPANT_STATUS.NEEDS_RESCHEDULE).length;
  if (reschedulingCount > 0) {
    recommendations.push(`Reschedule ${reschedulingCount} session(s)`);
  }

  const confirmedCount = participants.filter((p) => p.status_select === PARTICIPANT_STATUS.CONFIRMED).length;
  if (confirmedCount === 0) {
    recommendations.push('Schedule first confirmed session');
  }

  if (recommendations.length === 0) {
    recommendations.push('All participants are on track');
  }

  return recommendations.join('; ');
}

function generateParticipantTemplate(outputTemplate: string, inputValues: Record<string, unknown>): string {
  const template = Handlebars.compile(outputTemplate, { noEscape: true });
  return template({
    ...inputValues,
    current_date: format(new Date(), 'MMMM d, yyyy'),
  });
}

function extractExistingParticipants(fileContent: string): ExtractedParticipant[] {
  const participants: ExtractedParticipant[] = [];
  const lines = fileContent.split('\n');
  let inParticipantTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.includes('| ID | Name/Alias | Contact | Recruited Via |') && line.includes('| Status |')) {
      inParticipantTable = true;
      continue;
    }

    if (inParticipantTable && (line.startsWith('---') || line.includes('##') || line === '')) {
      break;
    }

    if (inParticipantTable && line.startsWith('|') && !line.includes('|----|') && !line.includes('| ID |')) {
      const columns = line.split('|').map(col => col.trim()).filter(col => col !== '');
      if (columns.length >= 7) {
        const actualId = parseInt(columns[0]) || 1;
        participants.push({
          id: actualId,
          participant_name: columns[1] || '',
          contact_details: columns[2] || '',
          recruitment_source: columns[3] || '',
          scheduled_date: columns[4] || '',
          status_select: columns[5] || '',
          notes_field: columns[6] || '',
        });
      }
    }
  }

  return participants;
}

function addNewParticipant(existingParticipants: ExtractedParticipant[], newParticipantData: ParticipantInputValues): ExtractedParticipant[] {
  const nextId = existingParticipants.length > 0
    ? Math.max(...existingParticipants.map(p => p.id)) + 1
    : 1;

  const newParticipant: ExtractedParticipant = {
    id: nextId,
    participant_name: newParticipantData.participant_name || '',
    contact_details: newParticipantData.contact_details || '',
    recruitment_source: newParticipantData.recruitment_source || '',
    scheduled_date: newParticipantData.scheduled_date || '',
    status_select: newParticipantData.status_select || '',
    notes_field: newParticipantData.notes_field || '',
  };

  return [...existingParticipants, newParticipant];
}

function updateFileWithParticipants(fileContent: string, participants: Array<ParticipantRecord | ExtractedParticipant>): string {
  console.log('🚀 ~ updateFileWithParticipants ~ participants:', participants);
  const lines = fileContent.split('\n');
  const updatedLines: string[] = [];
  let inParticipantTable = false;
  let tableHeaderFound = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('| ID | Name/Alias | Contact | Recruited Via |') && line.includes('| Status |')) {
      console.log('🚀 ~ updateFileWithParticipants ~ Found participant table header');
      inParticipantTable = true;
      tableHeaderFound = true;
      updatedLines.push('| ID | Name/Alias | Contact | Recruited Via | Outreach Sent | Compensation | Scheduled | Status | Notes & Accommodations |');
      updatedLines.push('|----|-----------|---------|-----------------|---------------|--------------|-----------|--------|----------------------|');

      participants.forEach((participant) => {
        const outreachDisplay = participant.outreach_sent_at
          ? `${new Date(String(participant.outreach_sent_at)).toISOString().split('T')[0]}${(participant.outreach_count || 0) > 1 ? ` (${participant.outreach_count} sent)` : ''}`
          : 'Not sent';
        const compDisplay = participant.compensation_amount ? `$${parseFloat(String(participant.compensation_amount))}` : '\u2014';
        const statusDisplay = PARTICIPANT_STATUS_LABELS[participant.status_select as ParticipantStatus] || participant.status_select;
        const participantRow = `| ${participant.id} | ${participant.participant_name} | ${participant.contact_details} | ${participant.recruitment_source} | ${outreachDisplay} | ${compDisplay} | ${participant.scheduled_date} ${participant.scheduled_time || ''} | ${statusDisplay} | ${participant.notes_field} |`;
        console.log('🚀 ~ updateFileWithParticipants ~ Adding participant row:', participantRow);
        updatedLines.push(participantRow);
      });

      continue;
    }

    if (inParticipantTable && line.startsWith('|') && !line.includes('|----|') && !line.includes('| ID |')) {
      continue;
    }

    if (inParticipantTable && (line.startsWith('---') || line.includes('##') || line === '')) {
      inParticipantTable = false;
    }

    if (!inParticipantTable || !tableHeaderFound) {
      updatedLines.push(line);
    }
  }

  return updatedLines.join('\n');
}

// ─── Main export ─────────────────────────────────────────────────────

export async function processParticipantYamlTemplate(
  rawYamlContent: string,
  inputValues: ParticipantInputValues,
  baseFolderEncoded: string,
  extraFolder = 'primary-research',
  allParticipants: ParticipantRecord[] | null = null,
): Promise<ProcessParticipantResult> {
  // 1. Parse the raw YAML content first
  const yamlConfig = yaml.load(rawYamlContent) as ParticipantYamlConfig | undefined;
  if (!yamlConfig) {
    throw new Error('Failed to parse YAML configuration');
  }

  // 2. Decode base folder
  const baseFolder = decodeURIComponent(baseFolderEncoded);

  // 3. Check if output_template exists
  if (!yamlConfig.output_template) {
    throw new Error('Missing output_template in YAML configuration');
  }

  // 4. Generate filename and path from YAML configuration
  const filenameTemplate = (yamlConfig.output_options && yamlConfig.output_options.filename) || 'participant_tracker.md';
  const filePath = (yamlConfig.output_options && yamlConfig.output_options.path) || '';

  // Render filename and path with Handlebars
  const filename = generateParticipantTemplate(filenameTemplate, {
    ...inputValues,
    current_date: format(new Date(), 'MMMM d, yyyy'),
  });

  // 5. Get the full path for the file
  const fullPath = path.posix.join(baseFolder, extraFolder, filePath, filename);

  // 6. Use database participants if provided, otherwise fall back to file-based approach
  let updatedContent: string;

  if (allParticipants && allParticipants.length > 0) {
    // Use database participants
    console.log('🚀 ~ processParticipantYamlTemplate ~ Using database participants:', allParticipants.length);

    // Calculate various counts
    const totalParticipantsCount = allParticipants.length;
    const confirmedSessionsCount = allParticipants.filter((p) => p.status_select === PARTICIPANT_STATUS.CONFIRMED).length;
    const pendingResponsesCount = allParticipants.filter((p) => p.status_select === PARTICIPANT_STATUS.CONTACTED).length;
    const completedSessionsCount = allParticipants.filter((p) => p.status_select === PARTICIPANT_STATUS.COMPLETED).length;

    // Create enhanced data object with database information
    const enhancedData: Record<string, unknown> = {
      ...inputValues,
      total_participants_count: totalParticipantsCount,
      confirmed_sessions_count: confirmedSessionsCount,
      pending_responses_count: pendingResponsesCount,
      completed_sessions_count: completedSessionsCount,
      total_observer_assignments: 0,
      participants: allParticipants.map(p => ({
        id: p.id,
        participant_name: p.participant_name,
        contact_details: p.contact_details,
        recruitment_source: p.recruitment_source,
        scheduled_date: p.scheduled_date,
        scheduled_time: p.scheduled_time,
        status_select: p.status_select,
        notes_field: p.notes_field,
        demographics_info: p.demographics_info,
      })),
      // Add recruitment breakdown
      recruitment_breakdown: calculateRecruitmentBreakdown(allParticipants),
      // Add demographic breakdowns
      ...generateDemographicBreakdowns(allParticipants),
      // Add action items based on current status
      immediate_actions: generateImmediateActions(allParticipants),
      followup_needed: generateFollowupNeeded(allParticipants),
      // Add additional fields for the template
      confirmed_sessions: allParticipants.filter((p) => p.status_select === PARTICIPANT_STATUS.CONFIRMED),
      pending_sessions: allParticipants.filter((p) => p.status_select === PARTICIPANT_STATUS.CONTACTED),
      rescheduling_sessions: allParticipants.filter((p) => p.status_select === PARTICIPANT_STATUS.NEEDS_RESCHEDULE),
      session_observers: await (async () => {
        try {
          if (!inputValues.study_id) return [];
          const observers = await SessionObserverService.getObserverRequestsByStudy(inputValues.study_id);
          return (observers as Array<{ session_id: string; requester_name: string | string[]; role?: string; status?: string }>).map(obs => {
            const names = Array.isArray(obs.requester_name) ? obs.requester_name : [obs.requester_name];
            return {
              session_id: obs.session_id,
              observer_names: names.join(', '),
              observer_role: obs.role || 'observer',
              status: obs.status || 'confirmed',
            };
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn('⚠️ Could not fetch observer data for tracker:', message);
          return [];
        }
      })(),
      observer_action_items: [],
      accommodations: allParticipants.filter(p => p.notes_field && p.notes_field.trim() !== '').map(p => ({
        participant_id: p.id,
        accommodation_details: p.notes_field,
      })),
      demographics_summary: generateDemographicsSummary(allParticipants),
      recruitment_analysis: generateRecruitmentAnalysis(allParticipants),
      next_steps_recommendations: generateNextStepsRecommendations(allParticipants, totalParticipantsCount),
    };

    // Generate new content with database participants
    updatedContent = generateParticipantTemplate(yamlConfig.output_template, enhancedData);
  } else {
    // Fall back to file-based approach for backward compatibility
    console.log('🚀 ~ processParticipantYamlTemplate ~ Using file-based approach');

    // Try to fetch existing file content
    let existingContent = '';
    try {
      const pathParts = fullPath.split('/');
      const fileName = pathParts.pop()!;
      const folderPath = pathParts.join('/');

      const existingFile = await fetchFileFromRepo(process.env.GITHUB_REPO!, folderPath, fileName);
      if (existingFile && existingFile.content) {
        existingContent = existingFile.content;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log('🚀 ~ processParticipantYamlTemplate ~ No existing file found, will create new one. Error:', message);
    }

    // Extract existing participants or start with empty array
    const existingParticipants = existingContent ? extractExistingParticipants(existingContent) : [];

    // Add new participant
    const updatedParticipants = addNewParticipant(existingParticipants, inputValues);

    // Update the file content with new participants
    if (existingContent) {
      updatedContent = updateFileWithParticipants(existingContent, updatedParticipants);
    } else {
      // If no existing content, generate new content with participants
      const templateData: Record<string, unknown> = {
        ...inputValues,
        participants: updatedParticipants,
        total_participants_count: updatedParticipants.length,
        confirmed_sessions_count: updatedParticipants.filter((p) => p.status_select === PARTICIPANT_STATUS.CONFIRMED).length,
        pending_responses_count: updatedParticipants.filter((p) => p.status_select === PARTICIPANT_STATUS.CONTACTED).length,
        completed_sessions_count: updatedParticipants.filter((p) => p.status_select === PARTICIPANT_STATUS.COMPLETED).length,
        total_observer_assignments: 0,
        current_date: format(new Date(), 'MMMM d, yyyy'),
        added_by: inputValues.added_by || 'Unknown',
      };

      updatedContent = generateParticipantTemplate(yamlConfig.output_template, templateData);
    }
  }

  // 7. Push the updated content to GitHub
  const result = await createOrUpdateFileOnGitHub(fullPath, updatedContent);
  console.log(`GitHub write: ${result?.path || 'unknown path'}`);

  return { result, outputTemplate: updatedContent };
}

