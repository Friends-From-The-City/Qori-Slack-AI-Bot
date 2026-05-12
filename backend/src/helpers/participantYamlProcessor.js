// participantYamlProcessor.js
const yaml = require('js-yaml');
const Handlebars = require('handlebars');
const { format } = require('date-fns');
const path = require('path');
const { createOrUpdateFileOnGitHub, fetchFileFromRepo } = require('./github');
const SessionObserverService = require('../services/session_observer.service');
const { PARTICIPANT_STATUS, PARTICIPANT_STATUS_LABELS } = require('../constants/participantStatus');

// Helper function to calculate recruitment breakdown
function calculateRecruitmentBreakdown(participants) {
  const breakdown = {};
  const total = participants.length;

  participants.forEach(participant => {
    const source = participant.recruitment_source || 'unknown';
    breakdown[source] = (breakdown[source] || 0) + 1;
  });

  return Object.entries(breakdown).map(([method, count]) => ({
    method: getRecruitmentSourceDisplay(method),
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0
  }));
}

// Helper function to get recruitment source display name
function getRecruitmentSourceDisplay(source) {
  const sourceMappings = {
    'internal_panel': '🗂️ Internal VA Panel',
    'calendly': '📅 Calendly Signup',
    'email_outreach': '📧 Email Outreach',
    'phone': '📞 Phone Recruitment',
    'referral': '🤝 Referral',
    'online': '🌐 Social/Website',
    'csv_import': '📊 CSV Import',
    'api_import': '🔗 API Import',
    'unknown': '❓ Unknown'
  };
  return sourceMappings[source] || source;
}

// Helper function to generate immediate actions
function generateImmediateActions(participants) {
  const actions = [];

  // Check for participants that need immediate attention
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

// Helper function to generate follow-up needed list
function generateFollowupNeeded(participants) {
  const followups = [];

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

// Helper function to generate demographics summary
function generateDemographicsSummary(participants) {
  if (participants.length === 0) return 'No demographic data available';

  const withDemographics = participants.filter(p => {
    if (!p.demographics_info) return false;

    if (typeof p.demographics_info === 'string') {
      // Handle old string format for backward compatibility
      if (p.demographics_info.trim().startsWith('{') && p.demographics_info.trim().endsWith('}')) {
        // JSON string format
        try {
          const parsed = JSON.parse(p.demographics_info);
          return Object.values(parsed).some(val => val && val !== '');
        } catch (error) {
          return false;
        }
      } else {
        // Plain text format (legacy)
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

// Helper function to generate demographic breakdowns
function generateDemographicBreakdowns(participants) {

  const raceBreakdown = {};
  const ageBreakdown = {};
  const educationBreakdown = {};
  const locationBreakdown = {};

  participants.forEach((participant, index) => {
    let demographics = participant.demographics_info;


    // Handle both old string format and new object format
    if (typeof demographics === 'string') {

      // Check if it's a JSON string
      if (demographics.trim().startsWith('{') && demographics.trim().endsWith('}')) {
        try {
          demographics = JSON.parse(demographics);
        } catch (error) {
          return;
        }
      } else {
        // Handle plain text demographics (legacy format)
        return;
      }
    }

    if (typeof demographics === 'object' && demographics) {

      // Race/Ethnicity breakdown
      if (demographics.race_ethnicity && demographics.race_ethnicity !== '') {
        const raceKey = demographics.race_ethnicity;
        raceBreakdown[raceKey] = (raceBreakdown[raceKey] || 0) + 1;
      }

      // Age Range breakdown
      if (demographics.age_range && demographics.age_range !== '') {
        const ageKey = demographics.age_range;
        ageBreakdown[ageKey] = (ageBreakdown[ageKey] || 0) + 1;
      }

      // Education Level breakdown
      if (demographics.education_level && demographics.education_level !== '') {
        const educationKey = demographics.education_level;
        educationBreakdown[educationKey] = (educationBreakdown[educationKey] || 0) + 1;
      }

      // Location Type breakdown
      if (demographics.location_type && demographics.location_type !== '') {
        const locationKey = demographics.location_type;
        locationBreakdown[locationKey] = (locationBreakdown[locationKey] || 0) + 1;
      }
    } else {
    }
  });

  const total = participants.length;

  // Convert to arrays with percentages
  const race_ethnicity_breakdown = Object.entries(raceBreakdown).map(([category, count]) => ({
    category: getRaceEthnicityDisplay(category),
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0
  }));

  const age_range_breakdown = Object.entries(ageBreakdown).map(([range, count]) => ({
    range,
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0
  }));

  const education_breakdown = Object.entries(educationBreakdown).map(([level, count]) => ({
    level: getEducationLevelDisplay(level),
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0
  }));

  const location_breakdown = Object.entries(locationBreakdown).map(([type, count]) => ({
    type: getLocationTypeDisplay(type),
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0
  }));

  const result = {
    race_ethnicity_breakdown,
    age_range_breakdown,
    education_breakdown,
    location_breakdown
  };


  return result;
}

// Helper function to get display names for race/ethnicity
function getRaceEthnicityDisplay(value) {
  const mappings = {
    'american_indian_alaska_native': 'American Indian or Alaska Native',
    'asian': 'Asian',
    'black_african_american': 'Black or African American',
    'hispanic_latino': 'Hispanic or Latino',
    'native_hawaiian_pacific_islander': 'Native Hawaiian or Other Pacific Islander',
    'white': 'White',
    'two_or_more_races': 'Two or More Races',
    'prefer_not_to_say': 'Prefer not to say'
  };
  return mappings[value] || value;
}

// Helper function to get display names for education level
function getEducationLevelDisplay(value) {
  const mappings = {
    'less_than_high_school': 'Less than high school',
    'high_school_ged': 'High school diploma/GED',
    'some_college': 'Some college',
    'associate_degree': 'Associate degree',
    'bachelors_degree': "Bachelor's degree",
    'masters_degree': "Master's degree",
    'professional_degree': 'Professional degree',
    'doctorate_degree': 'Doctorate degree',
    'prefer_not_to_say': 'Prefer not to say'
  };
  return mappings[value] || value;
}

// Helper function to get display names for location type
function getLocationTypeDisplay(value) {
  const mappings = {
    'urban': 'Urban',
    'suburban': 'Suburban',
    'rural': 'Rural',
    'prefer_not_to_say': 'Prefer not to say'
  };
  return mappings[value] || value;
}

// Helper function to generate recruitment analysis
function generateRecruitmentAnalysis(participants) {
  if (participants.length === 0) return 'No recruitment data available';

  const confirmedCount = participants.filter((p) => p.status_select === PARTICIPANT_STATUS.CONFIRMED).length;
  const contactedCount = participants.filter((p) => p.status_select === PARTICIPANT_STATUS.CONTACTED).length;
  const completedCount = participants.filter((p) => p.status_select === PARTICIPANT_STATUS.COMPLETED).length;

  const conversionRate = participants.length > 0 ? Math.round((confirmedCount / participants.length) * 100) : 0;

  return `Recruitment effectiveness: ${conversionRate}% conversion rate (${confirmedCount} confirmed of ${participants.length} recruited)`;
}

// Helper function to generate next steps recommendations
function generateNextStepsRecommendations(participants, totalCount) {
  const recommendations = [];

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

// Generate the output content using Handlebars for participant templates
function generateParticipantTemplate(outputTemplate, inputValues) {
  const template = Handlebars.compile(outputTemplate, { noEscape: true });
  return template({
    ...inputValues,
    current_date: format(new Date(), 'MMMM d, yyyy'),
  });
}

// Extract existing participants from the current file content
function extractExistingParticipants(fileContent) {
  const participants = [];
  const lines = fileContent.split('\n');
  let inParticipantTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check if we're entering the participant details table
    if (line.includes('| ID | Name/Alias | Contact | Recruited Via |') && line.includes('| Status |')) {
      inParticipantTable = true;
      continue;
    }

    // Check if we're exiting the participant details table
    if (inParticipantTable && (line.startsWith('---') || line.includes('##') || line === '')) {
      break;
    }

    // Parse participant rows
    if (inParticipantTable && line.startsWith('|') && !line.includes('|----|') && !line.includes('| ID |')) {
      const columns = line.split('|').map(col => col.trim()).filter(col => col !== '');
      if (columns.length >= 7) {
        // Use the actual ID from the file, not a counter
        const actualId = parseInt(columns[0]) || 1;
        participants.push({
          id: actualId,
          participant_name: columns[1] || '',
          contact_details: columns[2] || '',
          recruitment_source: columns[3] || '',
          scheduled_date: columns[4] || '',
          status_select: columns[5] || '',
          notes_field: columns[6] || ''
        });
      }
    }
  }

  return participants;
}

// Add new participant to the existing list
function addNewParticipant(existingParticipants, newParticipantData) {
  const nextId = existingParticipants.length > 0
    ? Math.max(...existingParticipants.map(p => p.id)) + 1
    : 1;

  const newParticipant = {
    id: nextId,
    participant_name: newParticipantData.participant_name || '',
    contact_details: newParticipantData.contact_details || '',
    recruitment_source: newParticipantData.recruitment_source || '',
    scheduled_date: newParticipantData.scheduled_date || '',
    status_select: newParticipantData.status_select || '',
    notes_field: newParticipantData.notes_field || ''
  };

  return [...existingParticipants, newParticipant];
}

// Update the file content with new participant data
function updateFileWithParticipants(fileContent, participants) {
  console.log('🚀 ~ updateFileWithParticipants ~ participants:', participants);
  const lines = fileContent.split('\n');
  const updatedLines = [];
  let inParticipantTable = false;
  let tableHeaderFound = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if we're entering the participant details table
    if (line.includes('| ID | Name/Alias | Contact | Recruited Via |') && line.includes('| Status |')) {
      console.log('🚀 ~ updateFileWithParticipants ~ Found participant table header');
      inParticipantTable = true;
      tableHeaderFound = true;
      updatedLines.push('| ID | Name/Alias | Contact | Recruited Via | Outreach Sent | Compensation | Scheduled | Status | Notes & Accommodations |');
      updatedLines.push('|----|-----------|---------|-----------------|---------------|--------------|-----------|--------|----------------------|');

      // Add all participants
      participants.forEach((participant) => {
        const outreachDisplay = participant.outreach_sent_at
          ? `${new Date(participant.outreach_sent_at).toISOString().split('T')[0]}${(participant.outreach_count || 0) > 1 ? ` (${participant.outreach_count} sent)` : ''}`
          : 'Not sent';
        const compDisplay = participant.compensation_amount ? `$${parseFloat(participant.compensation_amount)}` : '\u2014';
        const statusDisplay = PARTICIPANT_STATUS_LABELS[participant.status_select] || participant.status_select;
        const participantRow = `| ${participant.id} | ${participant.participant_name} | ${participant.contact_details} | ${participant.recruitment_source} | ${outreachDisplay} | ${compDisplay} | ${participant.scheduled_date} ${participant.scheduled_time || ''} | ${statusDisplay} | ${participant.notes_field} |`;
        console.log('🚀 ~ updateFileWithParticipants ~ Adding participant row:', participantRow);
        updatedLines.push(participantRow);
      });

      continue;
    }

    // Skip existing participant rows
    if (inParticipantTable && line.startsWith('|') && !line.includes('|----|') && !line.includes('| ID |')) {
      continue;
    }

    // Check if we're exiting the participant details table
    if (inParticipantTable && (line.startsWith('---') || line.includes('##') || line === '')) {
      inParticipantTable = false;
    }

    // Add the line if we're not in the participant table or if we haven't found the table yet
    if (!inParticipantTable || !tableHeaderFound) {
      updatedLines.push(line);
    }
  }

  return updatedLines.join('\n');
}

async function processParticipantYamlTemplate(rawYamlContent, inputValues, baseFolderEncoded, extraFolder = 'primary-research', allParticipants = null) {
  // 1. Parse the raw YAML content first
  const yamlConfig = yaml.load(rawYamlContent);
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
  let participants = [];
  let updatedContent;

  if (allParticipants && allParticipants.length > 0) {
    // Use database participants
    console.log('🚀 ~ processParticipantYamlTemplate ~ Using database participants:', allParticipants.length);

    // Calculate various counts
    const totalParticipantsCount = allParticipants.length;
    const confirmedSessionsCount = allParticipants.filter((p) => p.status_select === PARTICIPANT_STATUS.CONFIRMED).length;
    const pendingResponsesCount = allParticipants.filter((p) => p.status_select === PARTICIPANT_STATUS.CONTACTED).length;
    const completedSessionsCount = allParticipants.filter((p) => p.status_select === PARTICIPANT_STATUS.COMPLETED).length;

    // Create enhanced data object with database information
    const enhancedData = {
      ...inputValues,
      total_participants_count: totalParticipantsCount,
      confirmed_sessions_count: confirmedSessionsCount,
      pending_responses_count: pendingResponsesCount,
      completed_sessions_count: completedSessionsCount,
      total_observer_assignments: 0, // This would need to be calculated from observer data
      participants: allParticipants.map(p => ({
        id: p.id,
        participant_name: p.participant_name,
        contact_details: p.contact_details,
        recruitment_source: p.recruitment_source,
        scheduled_date: p.scheduled_date,
        scheduled_time: p.scheduled_time,
        status_select: p.status_select,
        notes_field: p.notes_field,
        demographics_info: p.demographics_info
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
          return observers.map(obs => {
            const names = Array.isArray(obs.requester_name) ? obs.requester_name : [obs.requester_name];
            return {
              session_id: obs.session_id,
              observer_names: names.join(', '),
              observer_role: obs.role || 'observer',
              status: obs.status || 'confirmed',
            };
          });
        } catch (err) {
          console.warn('⚠️ Could not fetch observer data for tracker:', err.message);
          return [];
        }
      })(),
      observer_action_items: [],
      accommodations: allParticipants.filter(p => p.notes_field && p.notes_field.trim() !== '').map(p => ({
        participant_id: p.id,
        accommodation_details: p.notes_field
      })),
      demographics_summary: generateDemographicsSummary(allParticipants),
      recruitment_analysis: generateRecruitmentAnalysis(allParticipants),
      next_steps_recommendations: generateNextStepsRecommendations(allParticipants, totalParticipantsCount)
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
      const fileName = pathParts.pop();
      const folderPath = pathParts.join('/');

      const existingFile = await fetchFileFromRepo(process.env.GITHUB_REPO, folderPath, fileName);
      if (existingFile && existingFile.content) {
        existingContent = existingFile.content;
      }
    } catch (error) {
      console.log('🚀 ~ processParticipantYamlTemplate ~ No existing file found, will create new one. Error:', error.message);
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
      const templateData = {
        ...inputValues,
        participants: updatedParticipants,
        total_participants_count: updatedParticipants.length,
        confirmed_sessions_count: updatedParticipants.filter((p) => p.status_select === PARTICIPANT_STATUS.CONFIRMED).length,
        pending_responses_count: updatedParticipants.filter((p) => p.status_select === PARTICIPANT_STATUS.CONTACTED).length,
        completed_sessions_count: updatedParticipants.filter((p) => p.status_select === PARTICIPANT_STATUS.COMPLETED).length,
        total_observer_assignments: 0,
        current_date: format(new Date(), 'MMMM d, yyyy'),
        added_by: inputValues.added_by || 'Unknown'
      };

      updatedContent = generateParticipantTemplate(yamlConfig.output_template, templateData);
    }
  }

  // 7. Push the updated content to GitHub
  const result = await createOrUpdateFileOnGitHub(fullPath, updatedContent);
  console.log(`GitHub write: ${result?.data?.content?.path || 'unknown path'}`);

  return { result, outputTemplate: updatedContent };
}

module.exports = { processParticipantYamlTemplate }; 
