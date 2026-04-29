// observerYamlProcessor.js
const yaml = require('js-yaml');
const Handlebars = require('handlebars');
const { format } = require('date-fns');
const path = require('path');
const { createOrUpdateFileOnGitHub, fetchFileFromRepo } = require('./github');

// Helper function to get observer role display name
function getObserverRoleDisplay(role) {
  const roleMappings = {
    'note_taker': '📝 Note-taker',
    'silent_observer': '👁️ Silent Observer',
    'pm_observer': '📊 PM Observer',
    'stakeholder': '🏛️ Stakeholder'
  };
  return roleMappings[role] || role;
}

// Helper function to check if observer section exists in content
function hasObserverSection(content) {
  return content.includes('## Observer Management');
}

// Helper function to add observer section if it doesn't exist
function addObserverSectionIfMissing(content, observerRequests, participants) {
  if (hasObserverSection(content)) {
    return content; // Section already exists, no need to add
  }

  // Find a good place to insert the observer section (before the last section)
  const lines = content.split('\n');
  const insertIndex = lines.length - 1; // Insert before the last line

  const sessionObservers = generateSessionObservers(observerRequests, participants);
  const roleDistribution = generateObserverRoleDistribution(observerRequests);

  const observerSection = [
    '',
    '---',
    '',
    '## Observer Management',
    '',
    '**Session Observer Assignments:**',
    '',
    '| Session | Date/Time | Observers | Capacity | Pending Requests | Guidelines Sent |',
    '|---------|-----------|-----------|----------|------------------|-----------------|'
  ];

  if (sessionObservers.length > 0) {
    sessionObservers.forEach(session => {
      observerSection.push(`| ${session.session_id} | ${session.date_time || 'TBD'} | ${session.observers} | ${session.capacity}/3 | ${session.pending_count} | ${session.guidelines_status} |`);
    });
  } else {
    observerSection.push('| No sessions | - | - | - | - | - |');
  }

  observerSection.push('');
  observerSection.push('**Observer Role Distribution:**');
  observerSection.push('| Role | Count | Sessions |');
  observerSection.push('|------|-------|----------|');
  observerSection.push(`| 📝 Note-taker | ${roleDistribution.note_taker_count} | ${roleDistribution.note_taker_sessions} |`);
  observerSection.push(`| 👁️ Silent Observer | ${roleDistribution.silent_observer_count} | ${roleDistribution.silent_observer_sessions} |`);
  observerSection.push(`| 📊 PM Observer | ${roleDistribution.pm_observer_count} | ${roleDistribution.pm_observer_sessions} |`);
  observerSection.push(`| 🏛️ Stakeholder | ${roleDistribution.stakeholder_count} | ${roleDistribution.stakeholder_sessions} |`);

  // Insert the observer section
  lines.splice(insertIndex, 0, ...observerSection);

  return lines.join('\n');
}

// Helper function to generate session observer data
function generateSessionObservers(observerRequests, participants) {
  const sessionObservers = [];

  // Group observers by session
  const sessionMap = {};

  observerRequests.forEach(request => {
    if (request.status === 'approved') {
      const sessionId = request.session_id;
      if (!sessionMap[sessionId]) {
        sessionMap[sessionId] = {
          session_id: sessionId,
          observers: [],
          pending_count: 0,
          guidelines_status: '⏳ Pending'
        };
      }

      // Find participant for date/time
      const participant = participants.find(p => `PT${String(p.id).padStart(3, '0')}` === sessionId);
      if (participant) {
        sessionMap[sessionId].date_time = `${participant.scheduled_date} ${participant.scheduled_time}`;
      }

      // requester_name is a JSON array (e.g., ["Alice", "Bob"]), not a plain string.
      // Iterate over each individual observer in the array.
      const names = Array.isArray(request.requester_name) ? request.requester_name : [request.requester_name];
      names.forEach(name => {
        sessionMap[sessionId].observers.push(`${name} (${getObserverRoleDisplay(request.role)})`);
      });
    }
  });

  // Count pending requests
  observerRequests.forEach(request => {
    if (request.status === 'pending') {
      const sessionId = request.session_id;
      if (sessionMap[sessionId]) {
        sessionMap[sessionId].pending_count++;
      }
    }
  });

  // Convert to array and add capacity
  Object.values(sessionMap).forEach(session => {
    session.capacity = session.observers.length;
    session.observers = session.observers.join(', ') || 'None';
    session.guidelines_status = session.observers !== 'None' ? '✅ Sent' : '⏳ Pending';
  });

  return Object.values(sessionMap);
}

// Helper function to generate observer role distribution
function generateObserverRoleDistribution(observerRequests) {
  const roleCounts = {
    'note_taker': { count: 0, sessions: [] },
    'silent_observer': { count: 0, sessions: [] },
    'pm_observer': { count: 0, sessions: [] },
    'stakeholder': { count: 0, sessions: [] }
  };

  observerRequests.forEach(request => {
    if (request.status === 'approved') {
      if (roleCounts[request.role]) {
        roleCounts[request.role].count++;
        if (!roleCounts[request.role].sessions.includes(request.session_id)) {
          roleCounts[request.role].sessions.push(request.session_id);
        }
      }
    }
  });

  return {
    note_taker_count: roleCounts.note_taker.count,
    note_taker_sessions: roleCounts.note_taker.sessions.join(', ') || '-',
    silent_observer_count: roleCounts.silent_observer.count,
    silent_observer_sessions: roleCounts.silent_observer.sessions.join(', ') || '-',
    pm_observer_count: roleCounts.pm_observer.count,
    pm_observer_sessions: roleCounts.pm_observer.sessions.join(', ') || '-',
    stakeholder_count: roleCounts.stakeholder.count,
    stakeholder_sessions: roleCounts.stakeholder.sessions.join(', ') || '-'
  };
}

// Generate the output content using Handlebars for observer templates
function generateObserverTemplate(outputTemplate, inputValues) {
  const template = Handlebars.compile(outputTemplate, { noEscape: true });
  return template({
    ...inputValues,
    current_date: format(new Date(), 'MMMM d, yyyy'),
  });
}

// Update observer sections in existing participant tracker file
async function updateObserverSections(fileContent, observerRequests, participants) {
  const lines = fileContent.split('\n');
  const updatedLines = [];
  let inObserverSection = false;
  let observerSectionFound = false;
  let observerSectionStartIndex = -1;
  let observerSectionEndIndex = -1;

  // First pass: find the observer section boundaries
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('## Observer Management')) {
      observerSectionStartIndex = i;
      observerSectionFound = true;
    }

    // Find the end of observer section (next ## or ---)
    if (observerSectionFound && observerSectionEndIndex === -1) {
      if (i > observerSectionStartIndex && (line.startsWith('---') || (line.includes('##') && !line.includes('Observer')))) {
        observerSectionEndIndex = i;
        break;
      }
    }
  }

  // If no end found, set it to end of file
  if (observerSectionFound && observerSectionEndIndex === -1) {
    observerSectionEndIndex = lines.length;
  }

  // Second pass: rebuild the content
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // If we're at the start of observer section, replace it
    if (i === observerSectionStartIndex) {
      updatedLines.push(line); // Keep the header
      updatedLines.push('');

      // Generate session observers data
      const sessionObservers = generateSessionObservers(observerRequests, participants);
      const roleDistribution = generateObserverRoleDistribution(observerRequests);

      // Add Session Observer Assignments table
      updatedLines.push('**Session Observer Assignments:**');
      updatedLines.push('');
      updatedLines.push('| Session | Date/Time | Observers | Capacity | Pending Requests | Guidelines Sent |');
      updatedLines.push('|---------|-----------|-----------|----------|------------------|-----------------|');

      if (sessionObservers.length > 0) {
        sessionObservers.forEach(session => {
          updatedLines.push(`| ${session.session_id} | ${session.date_time || 'TBD'} | ${session.observers} | ${session.capacity}/3 | ${session.pending_count} | ${session.guidelines_status} |`);
        });
      } else {
        updatedLines.push('| No sessions | - | - | - | - | - |');
      }

      updatedLines.push('');

      // Add Observer Role Distribution table
      updatedLines.push('**Observer Role Distribution:**');
      updatedLines.push('| Role | Count | Sessions |');
      updatedLines.push('|------|-------|----------|');
      updatedLines.push(`| 📝 Note-taker | ${roleDistribution.note_taker_count} | ${roleDistribution.note_taker_sessions} |`);
      updatedLines.push(`| 👁️ Silent Observer | ${roleDistribution.silent_observer_count} | ${roleDistribution.silent_observer_sessions} |`);
      updatedLines.push(`| 📊 PM Observer | ${roleDistribution.pm_observer_count} | ${roleDistribution.pm_observer_sessions} |`);
      updatedLines.push(`| 🏛️ Stakeholder | ${roleDistribution.stakeholder_count} | ${roleDistribution.stakeholder_sessions} |`);

      // Skip to the end of the observer section
      i = observerSectionEndIndex - 1;
      continue;
    }

    // Skip lines that are within the observer section
    if (observerSectionFound && i > observerSectionStartIndex && i < observerSectionEndIndex) {
      continue;
    }

    // Add all other lines
    updatedLines.push(line);
  }

  return updatedLines.join('\n');
}

async function processObserverYamlTemplate(rawYamlContent, inputValues, baseFolderEncoded, extraFolder = 'primary-research', observerRequests = [], participants = []) {
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
  const filename = generateObserverTemplate(filenameTemplate, {
    ...inputValues,
    current_date: format(new Date(), 'MMMM d, yyyy'),
  });

  // 5. Get the full path for the file
  const fullPath = path.posix.join(baseFolder, extraFolder, filePath, filename);

  // 6. Try to fetch existing file content
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
    console.log('🚀 ~ processObserverYamlTemplate ~ No existing file found, will create new one. Error:', error.message);
  }

  // 7. Update the file content with observer data
  let updatedContent;
  if (existingContent) {
    console.log('🚀 ~ processObserverYamlTemplate ~ Updating existing content with observer data');

    // Check if observer section exists
    if (hasObserverSection(existingContent)) {
      // Update existing observer section
      updatedContent = await updateObserverSections(existingContent, observerRequests, participants);
    } else {
      // Add observer section to existing content
      updatedContent = addObserverSectionIfMissing(existingContent, observerRequests, participants);
    }
  } else {
    console.log('🚀 ~ processObserverYamlTemplate ~ No existing content found, creating new file with observer data only');
    // If no existing content, create a minimal file with just observer data
    // This is a fallback case - normally the participant processor should create the file first
    const sessionObservers = generateSessionObservers(observerRequests, participants);
    const roleDistribution = generateObserverRoleDistribution(observerRequests);

    const templateData = {
      ...inputValues,
      // Add observer data
      session_observers: sessionObservers,
      ...roleDistribution,
      current_date: format(new Date(), 'MMMM d, yyyy'),
    };

    updatedContent = generateObserverTemplate(yamlConfig.output_template, templateData);
  }

  // 8. Push the updated content to GitHub
  const result = await createOrUpdateFileOnGitHub(fullPath, updatedContent);
  console.log('GitHub write result:', result);

  return { result, outputTemplate: updatedContent };
}

module.exports = {
  processObserverYamlTemplate,
  generateSessionObservers,
  generateObserverRoleDistribution
}; 
