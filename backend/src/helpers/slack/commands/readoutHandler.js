const { buildReadoutModal } = require('../ui/readoutModal');
const { getResearchStudyWithRoles, getStudiesByUser } = require('../../../services/research_study.service');
const { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo, fetchFileFromRepoByPath, readFolders, readFolderContents, parseGitHubIssues, createGitHubIssues } = require('../../github');
const { processYamlTemplate } = require('../../yamlProcessor');
const researchPlanService = require('../../../services/research_plan.service');
const sessionSummaryService = require('../../../services/session-summary.service');

// Check if prioritized_findings exists for a study (needed for targeted readouts)
async function checkReadoutExists(studyPath) {
  try {
    const sequelize = require('../../../database');
    const StudyVariable = sequelize.models?.StudyVariable;
    if (!StudyVariable) return false;

    const studySlug = studyPath.split('/').pop() || studyPath;
    const row = await StudyVariable.findOne({
      where: {
        study_name: studySlug,
        variable_key: 'prioritized_findings',
        scope: 'study',
      },
      attributes: ['id', 'value'],
    });

    if (!row || !row.value) return false;

    // Build stats string for modal display
    const findingsCount = Array.isArray(row.value) ? row.value.length : 0;
    return { exists: true, findingsCount };
  } catch (err) {
    console.warn('⚠️ Could not check readout existence:', err.message);
    return false;
  }
}

// Handler for opening the readout modal
const openReadoutModal = async ({ ack, body, client, command }) => {
  try {
    await ack();

    // Fetch available research studies
    const studies = await getStudiesByUser(body.user_id);

    // Mock research files for demonstration - in real implementation, this would come from the study
    const mockResearchFiles = [
      { name: 'Accessibility test results', type: 'document' },
      { name: 'WCAG compliance audit', type: 'audit' },
      { name: 'User testing with assistive tech', type: 'testing' },
      { name: 'Accessibility metrics', type: 'metrics' }
    ];

    const initialState = {
      availableStudies: studies,
      selectedStudy: studies.length > 0 ? studies[0] : null,
      reportType: 'research_readout',
      targetAudience: 'Design Team',
      teamMembers: '@team-lead',
      timeline: 'Immediate (1-2 weeks)',
      // researchFiles: mockResearchFiles,
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

    try {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: `❌ Error opening readout modal: ${error.message}`
      });
    } catch (chatError) {
      console.error('Error sending error message:', chatError);
    }
  }
};

// Handler for modal interactions (button clicks, dropdown changes)
const handleReadoutModalInteraction = async ({ ack, body, client, action }) => {
  try {
    await ack();

    const currentState = JSON.parse(body.view.private_metadata || '{}');
    // Rebuild full state with available studies
    const studies = await getStudiesByUser(body.user.id);
    const selectedStudy = currentState.selectedStudyId ?
      studies.find(s => s.id === currentState.selectedStudyId) : null;

    let updatedState = {
      ...currentState,
      availableStudies: studies,
      selectedStudy: selectedStudy
    };

    switch (action.action_id) {
      case 'study_selection_change': {
        const newStudyId = action.selected_option.value;
        const newStudy = studies.find(s => s.id.toString() === newStudyId);
        updatedState.selectedStudyId = newStudy?.id || null;
        updatedState.selectedStudy = newStudy;

        // Check readout existence for the new study
        if (newStudy?.path) {
          const readoutCheck = await checkReadoutExists(newStudy.path);
          updatedState.hasReadout = readoutCheck && readoutCheck.exists;
          updatedState.readoutStats = readoutCheck ? `• ${readoutCheck.findingsCount} findings available` : null;
        }
        break;
      }

      case 'select_research_readout':
        updatedState.reportType = 'research_readout';
        break;

      case 'select_targeted_readouts': {
        updatedState.reportType = 'targeted_readouts';
        // Check readout existence for current study
        const currentStudy = updatedState.selectedStudy;
        if (currentStudy?.path) {
          const readoutCheck = await checkReadoutExists(currentStudy.path);
          updatedState.hasReadout = readoutCheck && readoutCheck.exists;
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

    // Update the modal with new state, ensuring availableStudies is included
    const modalState = {
      ...updatedState,
      availableStudies: studies
    };
    const updatedView = buildReadoutModal(modalState);

    await client.views.update({
      view_id: body.view.id,
      view: updatedView
    });

  } catch (error) {
    console.error('Error handling readout modal interaction:', error);
  }
};

// Handler for modal submission (Generate Report button)
const handleReadoutModalSubmission = async ({ ack, body, view, client }) => {
  try {
    await ack();

    const values = view.state.values;
    const state = JSON.parse(view.private_metadata || '{}');

    // Extract form values
    const selectedStudyId = values.study_selection?.study_selection_change?.selected_option?.value;
    const selectedStudyName = values.study_selection?.study_selection_change?.selected_option?.text?.text;

    if (!selectedStudyName) {
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Please select a research study before generating the report.',
        response_type: 'ephemeral'
      });
      return;
    }

    const selectedStudy = await getResearchStudyWithRoles(selectedStudyName);
    const folderPath = selectedStudy.path;
    const reportType = state.reportType;

    let contentArray = [];
    let researchPlans = [];
    let sessionSummaries = [];
    let detectedFiles = [];

    // For github_issues, fetch files from findings folder
    let readoutLink = '';
    if (reportType === 'github_issues') {
      // Decode the folderPath first (it's URL encoded from the database)
      const decodedFolderPath = decodeURIComponent(folderPath);
      const findingsPath = `${decodedFolderPath}/primary-research/05-findings`;
      // Construct the GitHub URL for the findings folder
      readoutLink = `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/tree/main/${findingsPath}`;
      console.log(`Fetching files from findings folder: ${findingsPath}`);
      console.log(`Original folderPath: ${folderPath}`);
      console.log(`Decoded folderPath: ${decodedFolderPath}`);
      
      try {
        const findingsFiles = await readFolders(findingsPath, process.env.GITHUB_REPO);
        console.log(`Found ${findingsFiles.length} files in findings folder`);
        
        // Format files into the same structure as other content
        contentArray = findingsFiles.map(file => ({
          [file.name]: file.content
        }));
        
        // Create detected files list
        detectedFiles = findingsFiles.map(file => file.name);
      } catch (error) {
        console.error('Error fetching findings folder:', error);
        if (error.status === 404) {
          console.warn(`⚠️ Findings folder not found at: ${findingsPath}`);
          console.warn(`This folder may not exist yet. Please create it or check the path.`);
        }
        contentArray = [];
        detectedFiles = [];
      }
    } else {
      // For other report types, fetch research plans and session summaries
      try {
        researchPlans = await researchPlanService.getResearchPlansByStudyName(selectedStudyName);
        console.log(`Found ${researchPlans.length} research plans`);
      } catch (error) {
        console.error('Error fetching research plans:', error);
      }

      try {
        sessionSummaries = await sessionSummaryService.getSessionSummariesByStudyName(selectedStudyName);
        console.log(`Found ${sessionSummaries.length} session summaries`);
      } catch (error) {
        console.error('Error fetching session summaries:', error);
      }

      // Fetch content from GitHub for all research plans and session summaries
      const contentPromises = [];

      // Fetch research plan content
      for (const plan of researchPlans) {
        if (plan.file_path) {
          contentPromises.push(
            fetchFileFromRepoByPath(process.env.GITHUB_REPO, plan.file_path)
              .then(file => ({
                [plan.filename || file.path.split('/').pop()]: file.content
              }))
              .catch(error => {
                console.log(`Error fetching research plan ${plan.filename}:`, error.message);
                return null;
              })
          );
        }
      }

      // Fetch session summary content
      for (const summary of sessionSummaries) {
        if (summary.file_path) {
          contentPromises.push(
            fetchFileFromRepoByPath(process.env.GITHUB_REPO, summary.file_path)
              .then(file => ({
                [summary.filename || file.path.split('/').pop()]: file.content
              }))
              .catch(error => {
                console.log(`Error fetching session summary ${summary.filename}:`, error.message);
                return null;
              })
          );
        }
      }

      // Fetch participant tracker file
      try {
        const decodedFolderPath = decodeURIComponent(folderPath);
        const participantTrackerPath = `${decodedFolderPath}/primary-research/02-participants/${selectedStudyName}_participant_tracker.md`;
        const participantTrackerFilename = `${selectedStudyName}_participant_tracker.md`;
        
        console.log(`Fetching participant tracker from: ${participantTrackerPath}`);
        
        contentPromises.push(
          fetchFileFromRepoByPath(process.env.GITHUB_REPO, participantTrackerPath)
            .then(file => ({
              [participantTrackerFilename]: file.content
            }))
            .catch(error => {
              console.log(`Error fetching participant tracker ${participantTrackerFilename}:`, error.message);
              return null;
            })
        );
        
        // Add to detected files list
        detectedFiles.push(participantTrackerFilename);
      } catch (error) {
        console.error('Error setting up participant tracker fetch:', error);
      }

      // Wait for all content to be fetched
      const allContentResults = await Promise.all(contentPromises);

      // Filter out null results (failed fetches) and flatten
      contentArray = allContentResults.filter(item => item !== null);

      // Build detected files list with relative paths (relative to primary-research/)
      // so the LLM can construct ../path links from the 05-findings/ output folder
      const decodedPath = decodeURIComponent(folderPath);
      const primaryResearchBase = `${decodedPath}/primary-research/`;

      // Deduplicate research plans — keep only the latest version by date
      const plansByBase = {};
      researchPlans.forEach(plan => {
        if (plan.file_path) {
          const relativePath = plan.file_path.includes('primary-research/')
            ? plan.file_path.split('primary-research/')[1]
            : plan.filename;
          const base = relativePath.replace(/_[A-Z][a-z]+ \d{1,2},? \d{4}/, '');
          if (!plansByBase[base] || relativePath > plansByBase[base]) {
            plansByBase[base] = relativePath;
          }
        }
      });
      Object.values(plansByBase).forEach(p => detectedFiles.push(p));
      sessionSummaries.forEach(summary => {
        if (summary.file_path) {
          const relativePath = summary.file_path.includes('primary-research/')
            ? summary.file_path.split('primary-research/')[1]
            : summary.filename;
          detectedFiles.push(relativePath);
        }
      });

      // Scan analysis-layer folders for additional artifacts
      const analysisScans = [
        { folder: '03-fieldwork/transcripts', label: 'transcripts' },
        { folder: '03-fieldwork/coded-transcript-analysis', label: 'coded transcripts' },
        { folder: '04-analysis/affinity-mapping', label: 'affinity mapping' },
        { folder: '04-analysis/journey-mapping', label: 'journey mapping' },
        { folder: '04-analysis/personas', label: 'personas' },
        { folder: '04-analysis/usability-issues', label: 'usability issues' },
        { folder: '04-analysis/jobs-to-be-done', label: 'jobs to be done' },
        { folder: '04-analysis/design-opportunities', label: 'design opportunities' },
        { folder: '04-analysis/service-blueprint', label: 'service blueprint' },
      ];

      for (const scan of analysisScans) {
        try {
          const scanPath = `${primaryResearchBase}${scan.folder}`;
          const files = await readFolderContents(scanPath, process.env.GITHUB_REPO);
          const validFiles = files.filter(f => f.name !== 'README.md' && f.name !== '.gitkeep');

          // Group by base name (strip date suffix) and keep only the latest version.
          // Files like "study_affinity_mapping_April 24, 2026.md" and
          // "study_affinity_mapping_April 29, 2026.md" share the same base.
          // Date pattern: _Month DD, YYYY or _Month D, YYYY at end of filename before .ext
          const byBase = {};
          for (const f of validFiles) {
            const base = f.name.replace(/_[A-Z][a-z]+ \d{1,2},? \d{4}/, '');
            if (!byBase[base] || f.name > byBase[base].name) {
              byBase[base] = f;
            }
          }
          Object.values(byBase).forEach(f => {
            detectedFiles.push(`${scan.folder}/${f.name}`);
          });
        } catch (err) {
          // Folder doesn't exist — skip silently
        }
      }

      console.log('Detected files with paths:', detectedFiles);
    }

    console.log('Total content items fetched:', contentArray.length);
    console.log(`Content array: ${contentArray.length} items, first: ${contentArray[0]?.filename || 'unknown'}`);

    // Create combined content string from all files for AI processing
    let combinedContent = '';
    if (contentArray.length > 0) {
      const contentParts = contentArray.map(item => {
        const fileName = Object.keys(item)[0];
        const content = item[fileName];
        // Check if content is actually present and not empty
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
    
    // Both input_text and research_readout_data will contain all the content
    const inputText = combinedContent;
    const researchReadoutData = combinedContent;
    
    console.log('Combined content length:', combinedContent.length);
    if (combinedContent.length > 0) {
      console.log('Content preview (first 500 chars):', combinedContent.substring(0, 500));
    }

    const targetAudience = values.target_audience?.target_audience_change?.selected_option?.value || state.targetAudience;
    const selectedRoles = values.team_members?.team_members_input?.selected_options || [];
    const timeline = values.timeline?.timeline_change?.selected_option?.value || state.timeline;

    // Get actual user names from selected roles
    const roleToUserMap = {};
    if (selectedStudy && selectedStudy.userRoles) {
      selectedStudy.userRoles.forEach(userRole => {
        roleToUserMap[userRole.role] = userRole.user_id;
      });
    }

    // Map selected roles to user IDs and names
    const teamMemberUserIds = [];
    const teamMemberNames = [];

    selectedRoles.forEach(roleOption => {
      const role = roleOption.value;
      const userId = roleToUserMap[role];
      if (userId) {
        teamMemberUserIds.push(userId);
        teamMemberNames.push(`<@${userId}>`);
      }
    });

    const teamMembers = teamMemberNames.join(', ') || '@team-lead';

    // Create list of detected files for the prompt (one per line for LLM clarity)
    const detectedFilesList = detectedFiles.length > 0
      ? detectedFiles.map(f => `- ${f}`).join('\n')
      : 'No files detected';

    // Create data object based on report type
    let reportData = {
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

    // Add readout_link for github_issues
    if (reportType === 'github_issues' && readoutLink) {
      reportData.readout_link = readoutLink;
    }
    
    console.log('Report data keys:', Object.keys(reportData));
    console.log('Input text length:', inputText.length);
    console.log('Research readout data length:', researchReadoutData.length);
    console.log('Detected files:', detectedFilesList);
    console.log('Research plans count:', researchPlans.length);
    console.log('Session summaries count:', sessionSummaries.length);
    console.log('Both variables contain all content:', inputText.length > 0 && researchReadoutData.length > 0);
    
    // Log a sample of the content to verify it's not empty
    if (inputText.length > 0) {
      console.log('Content preview (first 1000 chars):', inputText.substring(0, 1000));
    } else {
      console.warn('⚠️ WARNING: input_text is empty!');
    }
    // Route based on report type
    if (reportType === 'targeted_readouts') {
      // Multi-audience parallel generation
      const audienceTemplateMap = {
        'Design Team': 'designer_readout.yaml',
        'Engineering Team': 'engineering_readout.yaml',
        'Accessibility Team': 'accessibility_readout.yaml',
        'Executive Leadership': 'leadership_readout.yaml',
        'Product Leadership': 'leadership_readout.yaml',
      };

      const selectedAudiences = values.audience_selection?.audience_checkboxes?.selected_options?.map(o => o.value) || [];

      if (selectedAudiences.length === 0) {
        await client.chat.postMessage({
          channel: body.user.id,
          text: '❌ Please select at least one audience for targeted readouts.',
        });
        return;
      }

      // Acknowledge immediately
      await client.chat.postMessage({
        channel: body.user.id,
        text: `🔄 Generating ${selectedAudiences.length} targeted readout(s) for *${selectedStudyName}*... You'll receive a notification as each completes.`,
      });

      // Generate sequentially to avoid GitHub SHA conflicts from parallel commits.
      // AI generation runs concurrently (LLM calls), but GitHub writes serialize.
      // Background IIFE so the modal closes immediately.
      (async () => {
        const results = [];
        for (const audience of selectedAudiences) {
          const templateName = audienceTemplateMap[audience];
          if (!templateName) {
            console.warn(`⚠️ No template for audience: ${audience}`);
            continue;
          }

          try {
            const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, templateName);
            const audienceReportData = { ...reportData, target_audience: audience };
            const rendered = await processYamlTemplate(file.content, audienceReportData, selectedStudy.path, 'primary-research');

            results.push({ audience, url: rendered.result.url, success: true });

            await client.chat.postMessage({
              channel: body.user.id,
              text: `✅ *${audience}* readout complete for ${selectedStudyName}`,
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `✅ *${audience}* readout complete\n\n<${rendered.result.url}|View on GitHub>`,
                  },
                },
              ],
            });
          } catch (err) {
            console.error(`❌ Error generating ${audience} readout:`, err.message);
            results.push({ audience, error: err.message, success: false });

            await client.chat.postMessage({
              channel: body.user.id,
              text: `❌ Error generating *${audience}* readout: ${err.message}`,
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
            text: `📊 *All targeted readouts complete* (${succeeded.length}/${results.length})`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `📊 *All targeted readouts complete* (${succeeded.length}/${results.length})\n\n${links}${failed.length > 0 ? `\n\n❌ ${failed.length} failed: ${failed.map(r => r.audience).join(', ')}` : ''}`,
                },
              },
            ],
          });
        }
      })();


    } else {
      // Research readout (existing flow)
      const yamlTemplateName = 'research_readout.yaml';
      const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, yamlTemplateName);
      const renderedYaml = await processYamlTemplate(file.content, reportData, selectedStudy.path, 'primary-research');

      await client.chat.postMessage({
        channel: body.user.id,
        text: `✅ Report generated successfully!`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📊 *Report ready:*\n<${renderedYaml.result.url}|View Full Report on GitHub>`,
            },
          },
        ],
      });
    }


  } catch (error) {
    console.error('Error handling readout modal submission:', error);

    await client.chat.postMessage({
      channel: body.user.id,
      text: `❌ Error generating report: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
};

// Helper function to get research files for a study
const getResearchFilesForStudy = async (study) => {
  // In a real implementation, this would fetch actual files from the study
  // For now, return mock data
  return [
    { name: 'Accessibility test results', type: 'document' },
    { name: 'WCAG compliance audit', type: 'audit' },
    { name: 'User testing with assistive tech', type: 'testing' },
    { name: 'Accessibility metrics', type: 'metrics' }
  ];
};

// Helper function to get display name for report type
const getReportTypeDisplayName = (reportType) => {
  switch (reportType) {
    case 'research_readout':
      return 'Research Readout';
    case 'targeted_readouts':
      return 'Targeted Readouts';
    case 'github_issues':
      return 'GitHub Issues';
    default:
      return 'Unknown Report Type';
  }
};

module.exports = {
  openReadoutModal,
  handleReadoutModalInteraction,
  handleReadoutModalSubmission
};
