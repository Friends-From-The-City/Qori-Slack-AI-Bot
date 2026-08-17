/**
 * readoutHandler.ts — /qori-report command and modal handlers
 *
 * Opens a readout modal for generating research readouts, targeted readouts
 * (multi-audience), or GitHub Issues from findings. Routes to the appropriate
 * YAML template based on report type and audience selection.
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';

import { buildReadoutModal } from '../ui/readoutModal';
import { resolveStudyFromName, getStudiesByUser } from '../../../services/research_study.service';
import type { VariableContext } from '../../studyVariables';
import { getActiveStudy, setActiveStudy } from '../../../services/slack-user-state.service';
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo, fetchFileFromRepoByPath, readFolders, readFolderContents } from '../../github';
import { processYamlTemplate } from '../../yamlProcessor';
import researchPlanService from '../../../services/research_plan.service';
import sessionSummaryService from '../../../services/session-summary.service';
import sequelize from '../../../database';
import type { StudyVariableAttributes } from '../../../types/models';
import { assertStudyAccess } from '../../../services/authorization.service';
import { postEphemeralOrDM } from '../slackHelpers';

// ─── Types ──────────────────────────────────────────────────────

interface ReadoutExistenceCheck {
  exists: true;
  findingsCount: number;
}

interface ContentItem {
  [filename: string]: string;
}

interface AnalysisScan {
  folder: string;
  label: string;
}

interface ModalStudy {
  id: number | string;
  name: string;
  path?: string | null;
}

interface ModalState {
  availableStudies: ModalStudy[];
  selectedStudy: ModalStudy | null | undefined;
  selectedStudyId?: number;
  reportType: string;
  targetAudience?: string;
  teamMembers?: string;
  timeline?: string;
  hasReadout?: boolean;
  readoutStats?: string | null;
  origin?: {
    team: string;
    channel: string;
    user: string;
    ts: string;
  };
}

/** Data shape passed to readout YAML templates. */
interface ReadoutTemplateInput {
  selected_study: string;
  research_folder_path: string;
  study_name: string;
  researcher_contact: string;
  study_channel: string;
  research_readout_data: string;
  input_text: string;
  detected_files: string;
  study_link: string;
  team_members: string;
  github_repository: string;
  github_repo_url: string;
  max_issues: string;
  readout_link?: string;
  target_audience?: string;
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Check if prioritized_findings exists for a study (needed for targeted readouts).
 */
async function checkReadoutExists(studyPath: string): Promise<ReadoutExistenceCheck | false> {
  try {
    const StudyVariable = sequelize.models?.StudyVariable;
    const ResearchStudy = sequelize.models?.ResearchStudy;
    if (!StudyVariable || !ResearchStudy) return false;

    // Find the study by path to get its ID
    const studySlug: string = studyPath.split('/').pop() || studyPath;
    const study = await ResearchStudy.findOne({
      where: { name: studySlug },
      attributes: ['id'],
    });

    if (!study) return false;
    const studyId = (study as unknown as { id: number }).id;

    const row = await StudyVariable.findOne({
      where: {
        study_id: studyId,
        variable_key: 'prioritized_findings',
        scope: 'study',
      },
      attributes: ['id', 'value'],
    });

    const typedRow = row as unknown as StudyVariableAttributes | null;
    if (!typedRow || !typedRow.value) return false;

    const findingsCount: number = Array.isArray(typedRow.value) ? typedRow.value.length : 0;
    return { exists: true, findingsCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('⚠️ Could not check readout existence:', message);
    return false;
  }
}

const ANALYSIS_SCANS: AnalysisScan[] = [
  { folder: '03-fieldwork/transcripts', label: 'transcripts' },
  { folder: '03-fieldwork/sessions', label: 'session summaries' },
  { folder: '04-synthesis', label: 'synthesis artifacts' },
];

// ─── Open modal handler ─────────────────────────────────────────

const openReadoutModal = async ({ ack, body, client, command }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> => {
  try {
    await ack();

    const studies = await getStudiesByUser(body.user_id);
    const activeStudyId: number | null = await getActiveStudy(body.user_id);
    const activeStudy = activeStudyId ? studies.find((s: { id: number }) => s.id === activeStudyId) : null;

    const initialState: ModalState = {
      availableStudies: studies,
      selectedStudy: activeStudy || (studies.length > 0 ? studies[0] : null),
      reportType: 'research_readout',
      targetAudience: 'Design Team',
      teamMembers: '@team-lead',
      timeline: 'Immediate (1-2 weeks)',
      origin: {
        team: command.team_id,
        channel: command.channel_id,
        user: command.user_id,
        ts: command.trigger_id
      }
    };

    await client.views.open({
      trigger_id: command.trigger_id,
      view: buildReadoutModal(initialState)
    });

  } catch (error) {
    console.error('Error opening readout modal:', error);
    const message = error instanceof Error ? error.message : String(error);

    try {
      await postEphemeralOrDM(
        client,
        command.channel_id,
        command.user_id,
        `❌ Error opening readout modal: ${message}`
      );
    } catch (chatError) {
      console.error('Error sending error message:', chatError);
    }
  }
};

// ─── Modal interaction handler ──────────────────────────────────

const handleReadoutModalInteraction = async ({ ack, body, client, action }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    await ack();

    const currentState = JSON.parse(body.view?.private_metadata || '{}') as ModalState;
    const studies = await getStudiesByUser(body.user.id);
    const selectedStudy = currentState.selectedStudyId
      ? studies.find((s: { id: number }) => s.id === currentState.selectedStudyId)
      : null;

    let updatedState: ModalState = {
      ...currentState,
      availableStudies: studies,
      selectedStudy: selectedStudy
    };

    switch (action.action_id) {
      case 'study_selection_change': {
        const newStudyId = (action as unknown as { selected_option: { value: string } }).selected_option.value;
        const newStudy = studies.find((s: { id: number }) => s.id.toString() === newStudyId);
        updatedState.selectedStudyId = newStudy?.id || undefined;
        updatedState.selectedStudy = newStudy;

        if (newStudy?.path) {
          const readoutCheck = await checkReadoutExists(newStudy.path);
          updatedState.hasReadout = readoutCheck ? readoutCheck.exists : false;
          updatedState.readoutStats = readoutCheck ? `• ${readoutCheck.findingsCount} findings available` : null;
        }
        break;
      }

      case 'select_research_readout':
        updatedState.reportType = 'research_readout';
        break;

      case 'select_targeted_readouts': {
        updatedState.reportType = 'targeted_readouts';
        const currentStudy = updatedState.selectedStudy as { path?: string } | null;
        if (currentStudy?.path) {
          const readoutCheck = await checkReadoutExists(currentStudy.path);
          updatedState.hasReadout = readoutCheck ? readoutCheck.exists : false;
          updatedState.readoutStats = readoutCheck ? `• ${readoutCheck.findingsCount} findings available` : null;
        }
        break;
      }

      case 'audience_checkboxes':
        // Checkboxes are handled on submit, not on change
        break;

      default:
        console.log('Unknown action:', action.action_id);
        return;
    }

    const modalState: ModalState = {
      ...updatedState,
      availableStudies: studies
    };
    const updatedView = buildReadoutModal(modalState);

    await client.views.update({
      view_id: body.view!.id,
      view: updatedView
    });

  } catch (error) {
    console.error('Error handling readout modal interaction:', error);
  }
};

// ─── Modal submission handler ───────────────────────────────────

const handleReadoutModalSubmission = async ({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    await ack();

    const values = view.state.values;
    const state = JSON.parse(view.private_metadata || '{}') as ModalState;

    const selectedStudyName: string | undefined = values.study_selection?.study_selection_change?.selected_option?.text?.text;

    if (!selectedStudyName) {
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Please select a research study before generating the report.',
      });
      return;
    }

    const resolved = await resolveStudyFromName(selectedStudyName);
    if (!resolved) {
      throw new Error(`Study "${selectedStudyName}" not found`);
    }
    const selectedStudy = resolved.study;
    const variableContext: VariableContext = { projectId: resolved.projectId, studyId: resolved.studyId };

    // Authorization check: verify user has access to this study (ADR 0024)
    await assertStudyAccess(body.user.id, resolved.studyId, client);

    if (selectedStudy) await setActiveStudy(body.user.id, selectedStudy.id);
    const folderPath: string = selectedStudy.path ?? '';
    const reportType: string = state.reportType;

    let contentArray: ContentItem[] = [];
    let researchPlans: Array<{ file_path: string | null; filename: string }> = [];
    let sessionSummaries: Array<{ file_path: string | null; filename: string }> = [];
    let detectedFiles: string[] = [];

    // For github_issues, fetch files from findings folder
    let readoutLink = '';
    if (reportType === 'github_issues') {
      const decodedFolderPath = decodeURIComponent(folderPath);
      const findingsPath = `${decodedFolderPath}/05-readouts`;
      readoutLink = `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/tree/main/${findingsPath}`;
      console.log(`Fetching files from findings folder: ${findingsPath}`);

      try {
        const findingsFiles = await readFolders(findingsPath, process.env.GITHUB_REPO!);
        console.log(`Found ${findingsFiles.length} files in findings folder`);

        contentArray = findingsFiles.map((file: { name: string; content: string }) => ({
          [file.name]: file.content
        }));

        detectedFiles = findingsFiles.map((file: { name: string }) => file.name);
      } catch (error) {
        console.error('Error fetching findings folder:', error);
        if ((error as Record<string, unknown>)?.status === 404) {
          console.warn(`⚠️ Findings folder not found at: ${findingsPath}`);
        }
        contentArray = [];
        detectedFiles = [];
      }
    } else {
      // For other report types, fetch research plans and session summaries
      try {
        researchPlans = await researchPlanService.getResearchPlansByStudyId(resolved.studyId);
        console.log(`Found ${researchPlans.length} research plans`);
      } catch (error) {
        console.error('Error fetching research plans:', error);
      }

      try {
        sessionSummaries = await sessionSummaryService.getSessionSummariesByStudyId(resolved.studyId);
        console.log(`Found ${sessionSummaries.length} session summaries`);
      } catch (error) {
        console.error('Error fetching session summaries:', error);
      }

      // Fetch content from GitHub for all research plans and session summaries
      const contentPromises: Promise<ContentItem | null>[] = [];

      for (const plan of researchPlans) {
        if (plan.file_path) {
          contentPromises.push(
            fetchFileFromRepoByPath(process.env.GITHUB_REPO!, plan.file_path)
              .then((file: { path: string; content: string }) => ({
                [plan.filename || file.path.split('/').pop()!]: file.content
              }))
              .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                console.log(`Error fetching research plan ${plan.filename}:`, message);
                return null;
              })
          );
        }
      }

      for (const summary of sessionSummaries) {
        if (summary.file_path) {
          contentPromises.push(
            fetchFileFromRepoByPath(process.env.GITHUB_REPO!, summary.file_path)
              .then((file: { path: string; content: string }) => ({
                [summary.filename || file.path.split('/').pop()!]: file.content
              }))
              .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                console.log(`Error fetching session summary ${summary.filename}:`, message);
                return null;
              })
          );
        }
      }

      // Fetch participant tracker file
      try {
        const decodedFolderPath = decodeURIComponent(folderPath);
        const participantTrackerPath = `${decodedFolderPath}/03-fieldwork/${selectedStudyName}_participant_tracker.md`;
        const participantTrackerFilename = `${selectedStudyName}_participant_tracker.md`;

        console.log(`Fetching participant tracker from: ${participantTrackerPath}`);

        contentPromises.push(
          fetchFileFromRepoByPath(process.env.GITHUB_REPO!, participantTrackerPath)
            .then((file: { content: string }) => ({
              [participantTrackerFilename]: file.content
            }))
            .catch((error: unknown) => {
              const message = error instanceof Error ? error.message : String(error);
              console.log(`Error fetching participant tracker ${participantTrackerFilename}:`, message);
              return null;
            })
        );

        detectedFiles.push(participantTrackerFilename);
      } catch (error) {
        console.error('Error setting up participant tracker fetch:', error);
      }

      const allContentResults = await Promise.all(contentPromises);
      contentArray = allContentResults.filter((item): item is ContentItem => item !== null);

      // Build detected files list with relative paths
      const decodedPath = decodeURIComponent(folderPath);
      const studyBase = `${decodedPath}/`;

      // Deduplicate research plans — keep only the latest version by date
      const plansByBase: Record<string, string> = {};
      researchPlans.forEach((plan: { file_path: string | null; filename: string }) => {
        if (plan.file_path) {
          // Extract relative path from study root
          const relativePath = plan.file_path.startsWith(decodedPath)
            ? plan.file_path.slice(decodedPath.length + 1)
            : plan.filename;
          const base = relativePath.replace(/_[A-Z][a-z]+ \d{1,2},? \d{4}/, '');
          if (!plansByBase[base] || relativePath > plansByBase[base]) {
            plansByBase[base] = relativePath;
          }
        }
      });
      Object.values(plansByBase).forEach((p: string) => detectedFiles.push(p));
      sessionSummaries.forEach((summary: { file_path: string | null; filename: string }) => {
        if (summary.file_path) {
          // Extract relative path from study root
          const relativePath = summary.file_path.startsWith(decodedPath)
            ? summary.file_path.slice(decodedPath.length + 1)
            : summary.filename;
          detectedFiles.push(relativePath);
        }
      });

      // Scan analysis-layer folders for additional artifacts
      for (const scan of ANALYSIS_SCANS) {
        try {
          const scanPath = `${studyBase}${scan.folder}`;
          const files = await readFolderContents(scanPath, process.env.GITHUB_REPO!);
          const validFiles = files.filter((f: { name: string }) => f.name !== 'README.md' && f.name !== '.gitkeep');

          const byBase: Record<string, { name: string }> = {};
          for (const f of validFiles) {
            const base = f.name.replace(/_[A-Z][a-z]+ \d{1,2},? \d{4}/, '');
            if (!byBase[base] || f.name > byBase[base].name) {
              byBase[base] = f;
            }
          }
          Object.values(byBase).forEach((f: { name: string }) => {
            detectedFiles.push(`${scan.folder}/${f.name}`);
          });
        } catch {
          // Folder doesn't exist — skip silently
        }
      }

      console.log('Detected files with paths:', detectedFiles);
    }

    console.log('Total content items fetched:', contentArray.length);

    // Create combined content string from all files for AI processing
    let combinedContent = '';
    if (contentArray.length > 0) {
      const contentParts: string[] = contentArray.map((item: ContentItem) => {
        const fileName = Object.keys(item)[0];
        const content = item[fileName];
        if (!content || content.trim().length === 0) {
          console.warn(`Warning: File ${fileName} has empty content`);
          return `# ${fileName}\n\n[File exists but content is empty]`;
        }
        return `# ${fileName}\n\n${content}`;
      });
      combinedContent = contentParts.join('\n\n---\n\n');
    } else {
      console.warn('⚠️ No content fetched! Research plans:', researchPlans.length, 'Session summaries:', sessionSummaries.length);
      combinedContent = '[No research plans or session summaries found for this study]';
    }

    // Privacy gate: authorize fetched content before model access (PH-3 / ADR 0035).
    // Content is from Qori-managed artifacts (research plans, session summaries) —
    // uses TRUSTED_CURATED_ARTIFACT policy (auto-authorized with known provenance).
    const { authorizeForModel } = require('../../../services/content-governance.service');
    const privacyResult = authorizeForModel(
      combinedContent,
      'TRUSTED_CURATED_ARTIFACT',
      { isQoriArtifact: true, upstreamPrivacyComplete: true, sourceId: `readout:${selectedStudyName}` },
    );
    const authorizedContent = privacyResult.modelSafeContent ?? combinedContent;

    const inputText = authorizedContent;
    const researchReadoutData = authorizedContent;

    console.log('Combined content length:', combinedContent.length);

    const targetAudience: string = values.target_audience?.target_audience_change?.selected_option?.value || state.targetAudience || '';
    const selectedRoles = values.team_members?.team_members_input?.selected_options || [];
    const timeline: string = values.timeline?.timeline_change?.selected_option?.value || state.timeline || '';

    // Get actual user names from selected roles
    const roleToUserMap: Record<string, string> = {};
    if (selectedStudy?.userRoles) {
      selectedStudy.userRoles.forEach((userRole) => {
        roleToUserMap[userRole.role] = userRole.user_id;
      });
    }

    const teamMemberUserIds: string[] = [];
    const teamMemberNames: string[] = [];

    selectedRoles.forEach((roleOption: { value: string }) => {
      const role = roleOption.value;
      const userId = roleToUserMap[role];
      if (userId) {
        teamMemberUserIds.push(userId);
        teamMemberNames.push(`<@${userId}>`);
      }
    });

    const teamMembers: string = teamMemberNames.join(', ') || '@team-lead';

    const detectedFilesList: string = detectedFiles.length > 0
      ? detectedFiles.map((f: string) => `- ${f}`).join('\n')
      : 'No files detected';

    const reportData: ReadoutTemplateInput = {
      selected_study: selectedStudyName,
      research_folder_path: folderPath,
      study_name: selectedStudyName,
      researcher_contact: selectedStudy?.researcher_name || selectedStudy?.researcher_email || 'Unknown Researcher',
      study_channel: state.origin?.channel || 'general',
      research_readout_data: researchReadoutData,
      input_text: inputText,
      detected_files: detectedFilesList,
      study_link: selectedStudy?.link || '',
      team_members: teamMembers,
      github_repository: `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`,
      github_repo_url: `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`,
      max_issues: '10',
    };

    if (reportType === 'github_issues' && readoutLink) {
      reportData.readout_link = readoutLink;
    }

    console.log('Report data keys:', Object.keys(reportData));

    // Route based on report type
    if (reportType === 'targeted_readouts') {
      // Multi-audience parallel generation
      const audienceTemplateMap: Record<string, string> = {
        'Design Team': 'designer_readout.yaml',
        'Engineering Team': 'engineering_readout.yaml',
        'Accessibility Team': 'accessibility_readout.yaml',
        'Executive Leadership': 'leadership_readout.yaml',
        'Product Leadership': 'leadership_readout.yaml',
      };

      const selectedAudiences: string[] = values.audience_selection?.audience_checkboxes?.selected_options?.map((o: any) => o.value) || [];

      if (selectedAudiences.length === 0) {
        await client.chat.postMessage({
          channel: body.user.id,
          text: '❌ Please select at least one audience for targeted readouts.',
        });
        return;
      }

      await client.chat.postMessage({
        channel: body.user.id,
        text: `Generating ${selectedAudiences.length} targeted readout(s) for *${selectedStudyName}*... You'll receive a notification as each completes.`,
      });

      // Background IIFE so the modal closes immediately
      (async () => {
        interface ReadoutResult {
          audience: string;
          url?: string;
          error?: string;
          success: boolean;
        }

        const results: ReadoutResult[] = [];
        for (const audience of selectedAudiences) {
          const templateName = audienceTemplateMap[audience];
          if (!templateName) {
            console.warn(`⚠️ No template for audience: ${audience}`);
            continue;
          }

          try {
            const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, templateName);
            const audienceReportData: ReadoutTemplateInput = { ...reportData, target_audience: audience };
            const rendered = await processYamlTemplate(file.content, audienceReportData, selectedStudy.path ?? '', '', false, variableContext);

            // CRITICAL: Await extraction to ensure ticket_candidates are committed before notifying user.
            // Without this, /qori-tickets won't find the tickets until extraction completes (can be 1+ min).
            if (rendered.extractionPromise) {
              const extractResult = await rendered.extractionPromise;
              if (!extractResult.success) {
                console.error(`❌ ${audience} extraction failed: ${extractResult.error}`);
              } else {
                console.log(`✅ ${audience} variables committed: ${extractResult.variableCount} items`);
              }
            }

            results.push({ audience, url: rendered.result.url, success: true });

            await client.chat.postMessage({
              channel: body.user.id,
              text: `✅ *${audience}* readout complete for ${selectedStudyName}`,
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `✅ *${audience}* readout complete — tickets ready\n\n<${rendered.result.url}|View on GitHub>`,
                  },
                },
              ],
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`❌ Error generating ${audience} readout:`, message);
            results.push({ audience, error: message, success: false });

            await client.chat.postMessage({
              channel: body.user.id,
              text: `❌ Error generating *${audience}* readout: ${message}`,
            });
          }
        }

        // Summary message after all complete
        const succeeded = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        if (succeeded.length > 0) {
          const links = succeeded.map(r => `• <${r.url}|${r.audience}>`).join('\n');
          await client.chat.postMessage({
            channel: body.user.id,
            text: `*All targeted readouts complete* (${succeeded.length}/${results.length})`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*All targeted readouts complete* (${succeeded.length}/${results.length})\n\n${links}${failed.length > 0 ? `\n\n❌ ${failed.length} failed: ${failed.map(r => r.audience).join(', ')}` : ''}`,
                },
              },
            ],
          });
        }
      })();

    } else {
      // Research readout (existing flow)
      await client.chat.postMessage({
        channel: body.user.id,
        text: `Generating research readout for *${selectedStudyName}*... This may take a few minutes.`,
      });

      const yamlTemplateName = 'research_readout.yaml';
      const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, yamlTemplateName);
      const renderedYaml = await processYamlTemplate(file.content, reportData, selectedStudy.path ?? '', '', false, variableContext);

      // CRITICAL: Await extraction to ensure cascade variables (prioritized_findings) are committed.
      // Without this, targeted readouts won't see the findings. See ADR 0019.
      if (renderedYaml.extractionPromise) {
        const extractResult = await renderedYaml.extractionPromise;
        if (!extractResult.success) {
          console.error(`❌ Readout extraction failed: ${extractResult.error}`);
          await client.chat.postMessage({
            channel: body.user.id,
            text: `⚠️ Report generated but variable extraction failed: ${extractResult.error}\n\nTargeted readouts may not work until you regenerate.`,
          });
          return;
        }
        console.log(`✅ Readout variables committed: ${extractResult.variableCount} items (${extractResult.keys?.join(', ')})`);
      }

      await client.chat.postMessage({
        channel: body.user.id,
        text: `✅ Report generated successfully!`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Report ready:*\n<${renderedYaml.result.url}|View Full Report on GitHub>`,
            },
          },
          { type: 'divider' },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Next:* Run \`/qori-report\` again and select *Targeted Readouts* to generate audience-specific reports, or \`/qori-tickets\` to create engineering issues.`,
            },
          },
        ],
      });
    }

  } catch (error) {
    console.error('Error handling readout modal submission:', error);
    const message = error instanceof Error ? error.message : String(error);

    await client.chat.postMessage({
      channel: body.user.id,
      text: `❌ Error generating report: ${message}`,
    });
  }
};

export {
  openReadoutModal,
  handleReadoutModalInteraction,
  handleReadoutModalSubmission
};
