// observerYamlProcessor.ts
import yaml from 'js-yaml';
import Handlebars from 'handlebars';
import { format } from 'date-fns';
import path from 'path';
import { createOrUpdateFileOnGitHub, fetchFileFromRepo, type GitHubWriteResult } from './github';

interface ObserverRequest {
  dataValues?: Record<string, unknown>;
  status?: string;
  session_id?: string;
  role?: string;
  requester_name?: string | string[];
  participant?: Participant;
  [key: string]: unknown;
}

interface Participant {
  dataValues?: Record<string, unknown>;
  id?: number;
  scheduled_date?: string;
  scheduled_time?: string;
  [key: string]: unknown;
}

interface SessionObserver {
  session_id: string;
  date_time: string;
  observers: string | string[];
  capacity: number;
  pending_count: number;
  guidelines_status: string;
}

interface RoleDistribution {
  note_taker_count: number;
  note_taker_sessions: string;
  silent_observer_count: number;
  silent_observer_sessions: string;
  pm_observer_count: number;
  pm_observer_sessions: string;
  stakeholder_count: number;
  stakeholder_sessions: string;
}

interface YamlConfig {
  output_template?: string;
  output_options?: {
    filename?: string;
    path?: string;
  };
  [key: string]: unknown;
}

interface ProcessResult {
  result: GitHubWriteResult;
  outputTemplate: string;
}

// Helper function to get observer role display name
function getObserverRoleDisplay(role: string): string {
  const roleMappings: Record<string, string> = {
    note_taker: '\u{1F4DD} Note-taker',
    silent_observer: '\u{1F441}\uFE0F Silent Observer',
    pm_observer: '\u{1F4CA} PM Observer',
    stakeholder: '\u{1F3DB}\uFE0F Stakeholder',
  };
  return roleMappings[role] || role;
}

// Helper function to check if observer section exists in content
function hasObserverSection(content: string): boolean {
  return content.includes('## Observer Management');
}

// Helper function to add observer section if it doesn't exist
function addObserverSectionIfMissing(
  content: string,
  observerRequests: ObserverRequest[],
  participants: Participant[],
): string {
  if (hasObserverSection(content)) {
    return content;
  }

  const lines = content.split('\n');
  const insertIndex = lines.length - 1;

  const sessionObservers = generateSessionObservers(observerRequests, participants);
  const roleDistribution = generateObserverRoleDistribution(observerRequests);

  const observerSection: string[] = [
    '',
    '---',
    '',
    '## Observer Management',
    '',
    '**Session Observer Assignments:**',
    '',
    '| Session | Date/Time | Observers | Capacity | Pending Requests | Guidelines Sent |',
    '|---------|-----------|-----------|----------|------------------|-----------------|',
  ];

  if (sessionObservers.length > 0) {
    sessionObservers.forEach((session) => {
      observerSection.push(
        `| ${session.session_id} | ${session.date_time || 'TBD'} | ${session.observers} | ${session.capacity}/3 | ${session.pending_count} | ${session.guidelines_status} |`,
      );
    });
  } else {
    observerSection.push('| No sessions | - | - | - | - | - |');
  }

  observerSection.push('');
  observerSection.push('**Observer Role Distribution:**');
  observerSection.push('| Role | Count | Sessions |');
  observerSection.push('|------|-------|----------|');
  observerSection.push(
    `| \u{1F4DD} Note-taker | ${roleDistribution.note_taker_count} | ${roleDistribution.note_taker_sessions} |`,
  );
  observerSection.push(
    `| \u{1F441}\uFE0F Silent Observer | ${roleDistribution.silent_observer_count} | ${roleDistribution.silent_observer_sessions} |`,
  );
  observerSection.push(
    `| \u{1F4CA} PM Observer | ${roleDistribution.pm_observer_count} | ${roleDistribution.pm_observer_sessions} |`,
  );
  observerSection.push(
    `| \u{1F3DB}\uFE0F Stakeholder | ${roleDistribution.stakeholder_count} | ${roleDistribution.stakeholder_sessions} |`,
  );

  lines.splice(insertIndex, 0, ...observerSection);

  return lines.join('\n');
}

// Helper function to generate session observer data
export function generateSessionObservers(
  observerRequests: ObserverRequest[],
  participants: Participant[],
): SessionObserver[] {
  const sessionMap: Record<string, SessionObserver> = {};

  observerRequests.forEach((request) => {
    const status = (request.dataValues?.status as string) ?? request.status;
    const sessionId = (request.dataValues?.session_id as string) ?? request.session_id;
    if (!sessionId) return;

    if (status === 'approved' || status === 'confirmed') {
      if (!sessionMap[sessionId]) {
        sessionMap[sessionId] = {
          session_id: sessionId,
          observers: [] as unknown as string,
          capacity: 0,
          pending_count: 0,
          guidelines_status: '\u23F3 Pending',
          date_time: 'TBD',
        };
      }

      const assocParticipant = (request.participant ||
        request.dataValues?.participant) as Participant | undefined;
      const participant =
        assocParticipant ||
        participants.find((p) => p.participant_code === sessionId);
      if (participant) {
        const pData = (participant.dataValues || participant) as Record<string, unknown>;
        sessionMap[sessionId].date_time =
          `${(pData.scheduled_date as string) || ''} ${(pData.scheduled_time as string) || ''}`.trim() || 'TBD';
      }

      const rawName =
        (request.dataValues?.requester_name as string | string[]) ?? request.requester_name;
      const names: string[] = Array.isArray(rawName)
        ? rawName
        : rawName
          ? [rawName]
          : [];
      const roleDisplay = getObserverRoleDisplay(
        (request.dataValues?.role as string) ?? (request.role as string) ?? '',
      );
      names.filter(Boolean).forEach((name) => {
        (sessionMap[sessionId].observers as unknown as string[]).push(
          `${name} (${roleDisplay})`,
        );
      });
    }
  });

  // Count pending requests
  observerRequests.forEach((request) => {
    const reqStatus = (request.dataValues?.status as string) ?? request.status;
    const reqSessionId = (request.dataValues?.session_id as string) ?? request.session_id;
    if (reqStatus === 'pending') {
      if (reqSessionId && sessionMap[reqSessionId]) {
        sessionMap[reqSessionId].pending_count++;
      }
    }
  });

  // Convert to array and add capacity
  Object.values(sessionMap).forEach((session) => {
    const observerList = session.observers as unknown as string[];
    session.capacity = observerList.length;
    session.observers = observerList.join(', ') || 'None';
    session.guidelines_status = session.observers !== 'None' ? '\u2705 Sent' : '\u23F3 Pending';
  });

  return Object.values(sessionMap);
}

// Helper function to generate observer role distribution
export function generateObserverRoleDistribution(
  observerRequests: ObserverRequest[],
): RoleDistribution {
  const roleCounts: Record<string, { count: number; sessions: string[] }> = {
    note_taker: { count: 0, sessions: [] },
    silent_observer: { count: 0, sessions: [] },
    pm_observer: { count: 0, sessions: [] },
    stakeholder: { count: 0, sessions: [] },
  };

  observerRequests.forEach((request) => {
    const status = (request.dataValues?.status as string) ?? request.status;
    const role = (request.dataValues?.role as string) ?? request.role;
    const sessionId = (request.dataValues?.session_id as string) ?? request.session_id;
    if (status === 'approved' || status === 'confirmed') {
      if (role && roleCounts[role]) {
        roleCounts[role].count++;
        if (sessionId && !roleCounts[role].sessions.includes(sessionId)) {
          roleCounts[role].sessions.push(sessionId);
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
    stakeholder_sessions: roleCounts.stakeholder.sessions.join(', ') || '-',
  };
}

// Generate the output content using Handlebars for observer templates
function generateObserverTemplate(
  outputTemplate: string,
  inputValues: Record<string, unknown>,
): string {
  const template = Handlebars.compile(outputTemplate, { noEscape: true });
  return template({
    ...inputValues,
    current_date: format(new Date(), 'MMMM d, yyyy'),
  });
}

// Update observer sections in existing participant tracker file
async function updateObserverSections(
  fileContent: string,
  observerRequests: ObserverRequest[],
  participants: Participant[],
): Promise<string> {
  const lines = fileContent.split('\n');
  const updatedLines: string[] = [];
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

    if (observerSectionFound && observerSectionEndIndex === -1) {
      if (
        i > observerSectionStartIndex &&
        (line.startsWith('---') || (line.includes('##') && !line.includes('Observer')))
      ) {
        observerSectionEndIndex = i;
        break;
      }
    }
  }

  if (observerSectionFound && observerSectionEndIndex === -1) {
    observerSectionEndIndex = lines.length;
  }

  // Second pass: rebuild the content
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (i === observerSectionStartIndex) {
      updatedLines.push(line);
      updatedLines.push('');

      const sessionObservers = generateSessionObservers(observerRequests, participants);
      const roleDistribution = generateObserverRoleDistribution(observerRequests);

      updatedLines.push('**Session Observer Assignments:**');
      updatedLines.push('');
      updatedLines.push(
        '| Session | Date/Time | Observers | Capacity | Pending Requests | Guidelines Sent |',
      );
      updatedLines.push(
        '|---------|-----------|-----------|----------|------------------|-----------------|',
      );

      if (sessionObservers.length > 0) {
        sessionObservers.forEach((session) => {
          updatedLines.push(
            `| ${session.session_id} | ${session.date_time || 'TBD'} | ${session.observers} | ${session.capacity}/3 | ${session.pending_count} | ${session.guidelines_status} |`,
          );
        });
      } else {
        updatedLines.push('| No sessions | - | - | - | - | - |');
      }

      updatedLines.push('');
      updatedLines.push('**Observer Role Distribution:**');
      updatedLines.push('| Role | Count | Sessions |');
      updatedLines.push('|------|-------|----------|');
      updatedLines.push(
        `| \u{1F4DD} Note-taker | ${roleDistribution.note_taker_count} | ${roleDistribution.note_taker_sessions} |`,
      );
      updatedLines.push(
        `| \u{1F441}\uFE0F Silent Observer | ${roleDistribution.silent_observer_count} | ${roleDistribution.silent_observer_sessions} |`,
      );
      updatedLines.push(
        `| \u{1F4CA} PM Observer | ${roleDistribution.pm_observer_count} | ${roleDistribution.pm_observer_sessions} |`,
      );
      updatedLines.push(
        `| \u{1F3DB}\uFE0F Stakeholder | ${roleDistribution.stakeholder_count} | ${roleDistribution.stakeholder_sessions} |`,
      );

      i = observerSectionEndIndex - 1;
      continue;
    }

    if (observerSectionFound && i > observerSectionStartIndex && i < observerSectionEndIndex) {
      continue;
    }

    updatedLines.push(line);
  }

  return updatedLines.join('\n');
}

export async function processObserverYamlTemplate(
  rawYamlContent: string,
  inputValues: Record<string, unknown>,
  baseFolderEncoded: string,
  extraFolder = '',
  observerRequests: ObserverRequest[] = [],
  participants: Participant[] = [],
): Promise<ProcessResult> {
  const yamlConfig = yaml.load(rawYamlContent) as YamlConfig | null;
  if (!yamlConfig) {
    throw new Error('Failed to parse YAML configuration');
  }

  const baseFolder = decodeURIComponent(baseFolderEncoded);

  if (!yamlConfig.output_template) {
    throw new Error('Missing output_template in YAML configuration');
  }

  const filenameTemplate =
    (yamlConfig.output_options && yamlConfig.output_options.filename) || 'participant_tracker.md';
  const filePath =
    (yamlConfig.output_options && yamlConfig.output_options.path) || '';

  const filename = generateObserverTemplate(filenameTemplate, {
    ...inputValues,
    current_date: format(new Date(), 'MMMM d, yyyy'),
  });

  const fullPath = path.posix.join(baseFolder, extraFolder, filePath, filename);

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
    console.log(
      `processObserverYamlTemplate: No existing file found, will create new one. Error: ${message}`,
    );
  }

  let updatedContent: string;
  if (existingContent) {
    console.log('processObserverYamlTemplate: Updating existing content with observer data');

    if (hasObserverSection(existingContent)) {
      updatedContent = await updateObserverSections(
        existingContent,
        observerRequests,
        participants,
      );
    } else {
      updatedContent = addObserverSectionIfMissing(
        existingContent,
        observerRequests,
        participants,
      );
    }
  } else {
    console.log(
      'processObserverYamlTemplate: No existing content found, creating new file with observer data only',
    );
    const sessionObservers = generateSessionObservers(observerRequests, participants);
    const roleDistribution = generateObserverRoleDistribution(observerRequests);

    const templateData: Record<string, unknown> = {
      ...inputValues,
      session_observers: sessionObservers,
      ...roleDistribution,
      current_date: format(new Date(), 'MMMM d, yyyy'),
    };

    updatedContent = generateObserverTemplate(yamlConfig.output_template, templateData);
  }

  const result = await createOrUpdateFileOnGitHub(fullPath, updatedContent);
  console.log(`GitHub write: ${result?.path || 'unknown path'}`);

  return { result, outputTemplate: updatedContent };
}
