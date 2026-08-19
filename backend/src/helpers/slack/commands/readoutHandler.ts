/**
 * readoutHandler.ts — /qori-report command and modal handlers
 *
 * Opens a readout modal for generating research readouts, targeted readouts
 * (multi-audience), or GitHub Issues from findings. Routes to the appropriate
 * YAML template based on report type and audience selection.
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';

import { buildSlackApplicationContext } from '../../../middleware/auth/slackContextBridge';
import { executeReadout, type ReadoutInput } from '../../../application/readout.app-service';
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

    // Extract team members from form (needed by both paths)
    const selectedRoles = values.team_members?.team_members_input?.selected_options || [];
    const roleToUserMap: Record<string, string> = {};
    if (selectedStudy?.userRoles) {
      selectedStudy.userRoles.forEach((userRole) => {
        roleToUserMap[userRole.role] = userRole.user_id;
      });
    }
    const teamMemberNames: string[] = [];
    selectedRoles.forEach((roleOption: { value: string }) => {
      const role = roleOption.value;
      const userId = roleToUserMap[role];
      if (userId) {
        teamMemberNames.push(`<@${userId}>`);
      }
    });
    const teamMembers: string = teamMemberNames.join(', ') || '@team-lead';

    // ── PLAT-3: Try application service path ──
    const displayName = body.user?.name || body.user?.id;
    const appCtx = await buildSlackApplicationContext(body.user.id, (body as any).team?.id || '', displayName);

    if (appCtx) {
      console.log(`[PLAT-3] Readout: using application service path for user=${body.user.id}`);

      // Extract audiences for targeted readouts
      const selectedAudiences: string[] = reportType === 'targeted_readouts'
        ? (values.audience_selection?.audience_checkboxes?.selected_options?.map((o: any) => o.value) || [])
        : [];

      if (reportType === 'targeted_readouts' && selectedAudiences.length === 0) {
        await client.chat.postMessage({
          channel: body.user.id,
          text: '❌ Please select at least one audience for targeted readouts.',
        });
        return;
      }

      const readoutInput: ReadoutInput = {
        studyId: resolved.studyId,
        projectId: resolved.projectId,
        studyName: selectedStudyName,
        studyPath: folderPath,
        reportType: reportType as ReadoutInput['reportType'],
        targetAudiences: selectedAudiences.length > 0 ? selectedAudiences : undefined,
        teamMembers,
        createdByActorId: appCtx.actor.publicId,
      };

      if (reportType === 'targeted_readouts') {
        await client.chat.postMessage({
          channel: body.user.id,
          text: `Generating ${selectedAudiences.length} targeted readout(s) for *${selectedStudyName}*... You'll receive a notification as each completes.`,
        });
      } else {
        await client.chat.postMessage({
          channel: body.user.id,
          text: `Generating research readout for *${selectedStudyName}*... This may take a few minutes.`,
        });
      }

      try {
        const result = await executeReadout(appCtx, readoutInput);

        if (reportType === 'targeted_readouts') {
          // Send per-audience notifications
          for (const entry of result.urls) {
            if (entry.success) {
              await client.chat.postMessage({
                channel: body.user.id,
                text: `✅ *${entry.audience}* readout complete for ${selectedStudyName}`,
                blocks: [
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: `✅ *${entry.audience}* readout complete — tickets ready\n\n<${entry.url}|View on GitHub>`,
                    },
                  },
                ],
              });
            } else {
              await client.chat.postMessage({
                channel: body.user.id,
                text: `❌ Error generating *${entry.audience}* readout: ${entry.error}`,
              });
            }
          }

          // Summary message
          const succeeded = result.urls.filter(r => r.success);
          const failed = result.urls.filter(r => !r.success);
          if (succeeded.length > 0) {
            const links = succeeded.map(r => `• <${r.url}|${r.audience}>`).join('\n');
            await client.chat.postMessage({
              channel: body.user.id,
              text: `*All targeted readouts complete* (${succeeded.length}/${result.urls.length})`,
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `*All targeted readouts complete* (${succeeded.length}/${result.urls.length})\n\n${links}${failed.length > 0 ? `\n\n❌ ${failed.length} failed: ${failed.map(r => r.audience).join(', ')}` : ''}`,
                  },
                },
              ],
            });
          }
        } else {
          // Research readout — single result
          const mainUrl = result.urls[0]?.url;
          await client.chat.postMessage({
            channel: body.user.id,
            text: `✅ Report generated successfully!`,
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: `*Report ready:*\n<${mainUrl}|View Full Report on GitHub>` },
              },
              { type: 'divider' },
              {
                type: 'section',
                text: { type: 'mrkdwn', text: `*Next:* Run \`/qori-report\` again and select *Targeted Readouts* to generate audience-specific reports, or \`/qori-tickets\` to create engineering issues.` },
              },
            ],
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error handling readout (app service):', error);
        await client.chat.postMessage({
          channel: body.user.id,
          text: `❌ Error generating report: ${message}`,
        });
      }
      return;
    }

    // Legacy path: existing handler logic (no workspace binding)
    console.log(`[PLAT-3] Readout: falling back to legacy path for user=${body.user.id}`);

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
    const { createSynthesizedConstructs } = require('../../../services/synthesis-evidence.service');
    const { enrichProjectionWithEvidenceRefs } = require('../../../services/projection-enrichment.service');
    const { attachEvidenceRefsVerified } = require('../../../services/artifact.service');
    const { computeCanonicalAnchor, resolveConstructDeepLink, buildCanonicalReferenceSection } = require('../../../services/deep-link.service');
    const { prepareYamlTemplate, finalizeArtifactWrite } = require('../../yamlProcessor');
    const { getDefaultModelName } = require('../../modelProvider');
    const sequelizeDb = require('../../../database').default;
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
    const timeline: string = values.timeline?.timeline_change?.selected_option?.value || state.timeline || '';

    // teamMembers already computed above (shared with app service path)

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

    // PH-6B: Artifact identity context for research readout
    let canonicalReadoutInputs: string[] = [];
    try {
      const themeConstructs = await sequelizeDb.models.EvidenceConstruct.findAll({
        where: { study_id: resolved.studyId, construct_type: 'theme' },
        attributes: ['public_id'],
      });
      canonicalReadoutInputs = themeConstructs.map(
        (c: unknown) => (c as { public_id: string }).public_id,
      );
    } catch { /* fallback to empty */ }

    (reportData as unknown as Record<string, unknown>).__artifactContext = {
      projectId: resolved.projectId,
      studyId: resolved.studyId,
      artifactType: 'readout',
      title: `Research readout — ${selectedStudyName}`,
      canonicalUpstreamInputs: canonicalReadoutInputs,
      createdBy: body.user.id,
    };

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
            // PH-6D1: Each targeted audience gets its own artifact identity.
            // Audience is explicit in canonicalUpstreamInputs so different audiences
            // always produce distinct artifact identities, even with the same template.
            const normalizedAudience = audience.toLowerCase().replace(/\s+/g, '-');
            (audienceReportData as unknown as Record<string, unknown>).__artifactContext = {
              projectId: resolved.projectId,
              studyId: resolved.studyId,
              artifactType: 'readout',
              title: `${audience} readout — ${selectedStudyName}`,
              canonicalUpstreamInputs: [
                ...canonicalReadoutInputs,
                `audience:${normalizedAudience}`,
              ],
              createdBy: body.user.id,
            };
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
      // Research readout — PH-6D2: prepare/finalize flow with canonical references
      await client.chat.postMessage({
        channel: body.user.id,
        text: `Generating research readout for *${selectedStudyName}*... This may take a few minutes.`,
      });

      const yamlTemplateName = 'research_readout.yaml';
      const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, yamlTemplateName);

      // PREPARE: Generate + extract — no GitHub write yet
      const prepared = await prepareYamlTemplate(
        file.content, reportData, selectedStudy.path ?? '', '', variableContext,
      );

      if (!prepared.extractionOutcome.success) {
        console.error(`❌ Readout extraction failed: ${prepared.extractionOutcome.error}`);
        await client.chat.postMessage({
          channel: body.user.id,
          text: `⚠️ Report generation failed: ${prepared.extractionOutcome.error}\n\nPlease try again.`,
        });
        return;
      }
      console.log(`✅ Readout variables committed: ${prepared.extractionOutcome.variableCount} items (${prepared.extractionKeys.join(', ')})`);

      // PH-5B: Create canonical evidence constructs for findings and recommendations.
      const readoutConstructIds: number[] = [];
      const findingRefItems: Array<{ displayId: string; label: string; publicId: string; upstreamThemeLinks: Array<{ displayId: string; label: string; deepLink: string | null }> }> = [];
      const recRefItems: Array<{ displayId: string; label: string; publicId: string; findingLinks: Array<{ displayId: string; label: string; deepLink: string | null }> }> = [];

      if (prepared.extractionKeys.includes('prioritized_findings') || prepared.extractionKeys.includes('prioritized_recommendations')) {
        try {
          const resolvedStudyId = resolved.studyId;
          const { readStudyVariablesByContext: readVars } = require('../../studyVariables');
          const vars = await readVars({ projectId: resolved.projectId, studyId: resolvedStudyId });

          const EvidenceConstructModel = sequelizeDb.models.EvidenceConstruct;
          const themeConstructs = await EvidenceConstructModel.findAll({
            where: { study_id: resolvedStudyId, construct_type: 'theme' },
          });
          type ConstructRecord = { public_id: string; label: string };
          const themePublicIds = new Set(themeConstructs.map((c: unknown) => (c as ConstructRecord).public_id));
          const themeDisplayToPublicId = new Map(
            themeConstructs.map((c: unknown) => [(c as ConstructRecord).label, (c as ConstructRecord).public_id]),
          );

          // Create finding constructs
          const findings = vars.variables?.prioritized_findings;
          if (Array.isArray(findings) && findings.length > 0 && themePublicIds.size > 0) {
            const findingItems = findings.map((f: Record<string, unknown>) => {
              let evidenceIds: string[] = [];
              if (Array.isArray(f.supporting_theme_evidence_ids) && f.supporting_theme_evidence_ids.length > 0) {
                evidenceIds = f.supporting_theme_evidence_ids as string[];
              } else if (Array.isArray(f.supporting_themes)) {
                evidenceIds = (f.supporting_themes as string[])
                  .map(displayId => themeDisplayToPublicId.get(displayId))
                  .filter((id): id is string => id !== undefined);
              }
              return {
                displayId: (f.id as string) || 'finding-unknown',
                label: (f.finding as string)?.substring(0, 100) || (f.id as string) || '',
                payload: f,
                proposedEvidenceIds: evidenceIds,
              };
            });

            const findingResult = await createSynthesizedConstructs(findingItems, {
              projectId: resolved.projectId, studyId: resolvedStudyId,
              constructType: 'finding', upstreamConstructType: 'theme',
              relationshipType: 'SYNTHESIZED_FROM', suppliedEvidenceIds: themePublicIds,
              cascadeVariableKey: 'prioritized_findings', templateId: 'research_readout',
              templateVersion: 'v7.0', modelName: getDefaultModelName(), createdBy: body.user.id,
            });

            if (findingResult.created.length > 0) {
              console.log(`✅ Evidence lineage: ${findingResult.created.length} finding constructs`);
              readoutConstructIds.push(...findingResult.created.map((c: { constructId: number }) => c.constructId));
              const findingsEnriched = await enrichProjectionWithEvidenceRefs(
                resolved.projectId, resolvedStudyId, 'prioritized_findings', findingResult.created,
              );
              if (findingsEnriched > 0) console.log(`✅ Projection enriched: ${findingsEnriched} findings`);

              // PH-6D2: Resolve upstream theme deep links for each finding
              for (const created of findingResult.created) {
                const findingData = findings.find((f: Record<string, unknown>) => f.id === created.displayId);
                const themeLinks: Array<{ displayId: string; label: string; deepLink: string | null }> = [];
                const upstreamThemes = (findingData?.supporting_themes as string[]) || [];
                for (const themeLabel of upstreamThemes) {
                  const themePubId = themeDisplayToPublicId.get(themeLabel);
                  if (themePubId) {
                    const linkResult = await resolveConstructDeepLink(themePubId, resolvedStudyId);
                    themeLinks.push({
                      displayId: themeLabel,
                      label: themeLabel,
                      deepLink: linkResult.resolved ? linkResult.deepLink : null,
                    });
                  }
                }
                findingRefItems.push({
                  displayId: created.displayId,
                  label: (findingData?.finding as string)?.substring(0, 100) || created.displayId,
                  publicId: created.publicId,
                  upstreamThemeLinks: themeLinks,
                });
              }

              // Create recommendation constructs
              const recommendations = vars.variables?.prioritized_recommendations;
              if (Array.isArray(recommendations) && recommendations.length > 0) {
                const findingPublicIds = new Set(findingResult.created.map((c: { publicId: string }) => c.publicId));
                const findingDisplayToPublicId = new Map(
                  findingResult.created.map((c: { displayId: string; publicId: string }) => [c.displayId, c.publicId]),
                );

                const recItems = recommendations.map((r: Record<string, unknown>) => {
                  let evidenceIds: string[] = [];
                  if (Array.isArray(r.supporting_finding_evidence_ids) && r.supporting_finding_evidence_ids.length > 0) {
                    evidenceIds = r.supporting_finding_evidence_ids as string[];
                  } else if (Array.isArray(r.addresses_findings)) {
                    evidenceIds = (r.addresses_findings as string[])
                      .map(displayId => findingDisplayToPublicId.get(displayId))
                      .filter((id): id is string => id !== undefined);
                  }
                  return {
                    displayId: (r.id as string) || 'rec-unknown',
                    label: (r.recommendation as string)?.substring(0, 100) || (r.id as string) || '',
                    payload: r,
                    proposedEvidenceIds: evidenceIds,
                  };
                });

                const recResult = await createSynthesizedConstructs(recItems, {
                  projectId: resolved.projectId, studyId: resolvedStudyId,
                  constructType: 'recommendation', upstreamConstructType: 'finding',
                  relationshipType: 'SUPPORTS', suppliedEvidenceIds: findingPublicIds,
                  cascadeVariableKey: 'prioritized_recommendations', templateId: 'research_readout',
                  templateVersion: 'v7.0', modelName: getDefaultModelName(), createdBy: body.user.id,
                });

                if (recResult.created.length > 0) {
                  console.log(`✅ Evidence lineage: ${recResult.created.length} recommendation constructs`);
                  readoutConstructIds.push(...recResult.created.map((c: { constructId: number }) => c.constructId));
                  const recsEnriched = await enrichProjectionWithEvidenceRefs(
                    resolved.projectId, resolvedStudyId, 'prioritized_recommendations', recResult.created,
                  );
                  if (recsEnriched > 0) console.log(`✅ Projection enriched: ${recsEnriched} recommendations`);

                  // PH-6D2: Build recommendation refs with same-document finding links
                  for (const created of recResult.created) {
                    const recData = recommendations.find((r: Record<string, unknown>) => r.id === created.displayId);
                    const findingLinks: Array<{ displayId: string; label: string; deepLink: string | null }> = [];
                    const addressedFindings = (recData?.addresses_findings as string[]) || [];
                    for (const findingDisplayId of addressedFindings) {
                      const findingPubId = findingDisplayToPublicId.get(findingDisplayId);
                      if (findingPubId) {
                        // Same-document link — use local anchor
                        const anchor = computeCanonicalAnchor(findingPubId);
                        findingLinks.push({
                          displayId: findingDisplayId,
                          label: findingDisplayId,
                          deepLink: `#${anchor}`,
                        });
                      }
                    }
                    recRefItems.push({
                      displayId: created.displayId,
                      label: (recData?.recommendation as string)?.substring(0, 100) || created.displayId,
                      publicId: created.publicId,
                      findingLinks,
                    });
                  }
                }
                if (recResult.rejected.length > 0) {
                  console.warn(`⚠️ ${recResult.rejected.length} recommendations rejected (invalid refs)`);
                }
              }
            }
            if (findingResult.rejected.length > 0) {
              console.warn(`⚠️ ${findingResult.rejected.length} findings rejected (invalid refs)`);
            }
          } else if (themePublicIds.size === 0) {
            console.log('ℹ️ No canonical theme constructs found — skipping finding evidence lineage');
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`⚠️ Finding/recommendation evidence creation failed (non-blocking): ${message}`);
        }
      }

      // PH-6D2: Build canonical reference sections
      let canonicalRefSection = '';
      if (findingRefItems.length > 0) {
        const findingRefs = findingRefItems.map(f => ({
          displayId: f.displayId,
          label: f.label,
          constructPublicId: f.publicId,
          constructType: 'finding',
          upstreamLinks: f.upstreamThemeLinks,
        }));
        canonicalRefSection += buildCanonicalReferenceSection(findingRefs, 'Canonical Finding References');
      }
      if (recRefItems.length > 0) {
        const recRefs = recRefItems.map(r => ({
          displayId: r.displayId,
          label: r.label,
          constructPublicId: r.publicId,
          constructType: 'recommendation',
          upstreamLinks: r.findingLinks,
        }));
        canonicalRefSection += buildCanonicalReferenceSection(recRefs, 'Canonical Recommendation References');
      }

      // FINALIZE: Single GitHub write with canonical references
      const renderedYaml = await finalizeArtifactWrite(
        prepared,
        canonicalRefSection || undefined,
      );
      console.log(`✅ Readout finalized: ${renderedYaml.result.url}`);

      // PH-6C: Attach evidence refs (artifact now status=written)
      if (readoutConstructIds.length > 0) {
        const attachResult = await attachEvidenceRefsVerified(
          renderedYaml.artifactPublicId,
          readoutConstructIds,
          { projectId: resolved.projectId, studyId: resolved.studyId, templateId: 'research_readout', workflow: 'readout' },
        );
        if (attachResult.attached > 0) {
          console.log(`✅ Artifact→evidence: ${attachResult.attached} refs attached to readout ${renderedYaml.artifactPublicId}`);
        }
      }

      await client.chat.postMessage({
        channel: body.user.id,
        text: `✅ Report generated successfully!`,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Report ready:*\n<${renderedYaml.result.url}|View Full Report on GitHub>` },
          },
          { type: 'divider' },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Next:* Run \`/qori-report\` again and select *Targeted Readouts* to generate audience-specific reports, or \`/qori-tickets\` to create engineering issues.` },
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
