const { buildReadoutModal } = require('../ui/readoutModal');
const { getResearchStudyWithRoles, getStudiesByUser } = require('../../../services/research_study.service');
const { getConfigRepo, fetchFileFromRepo, fetchFileFromRepoByPath, readFolders, parseGitHubIssues, createGitHubIssues } = require('../../github');
const { processYamlTemplate } = require('../../yamlProcessor');
const researchPlanService = require('../../../services/research_plan.service');
const sessionSummaryService = require('../../../services/session-summary.service');

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
      case 'study_selection_change':
        const selectedStudyId = action.selected_option.value;
        const selectedStudy = studies.find(s => s.id.toString() === selectedStudyId);
        updatedState.selectedStudyId = selectedStudy?.id || null;
        updatedState.selectedStudy = selectedStudy;

        // Update research files based on selected study
        updatedState.researchFiles = await getResearchFilesForStudy(selectedStudy);
        break;

      case 'select_research_readout':
        updatedState.reportType = 'research_readout';
        break;

      case 'select_targeted_readouts':
        updatedState.reportType = 'targeted_readouts';
        break;

      case 'select_github_issues':
        updatedState.reportType = 'github_issues';
        break;


      case 'target_audience_change':
        updatedState.targetAudience = action.selected_option.value;
        break;

      case 'team_members_input':
        updatedState.teamMembers = action.selected_options.map(option => option.value).join(',');
        break;

      case 'timeline_change':
        updatedState.timeline = action.selected_option.value;
        break;

      case 'issue_priority_change':
        updatedState.issuePriority = action.selected_option.value;
        break;

      case 'assignee_input':
        updatedState.assignee = action.value;
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
      
      // Create detected files list
      researchPlans.forEach(plan => {
        if (plan.filename) detectedFiles.push(plan.filename);
      });
      sessionSummaries.forEach(summary => {
        if (summary.filename) detectedFiles.push(summary.filename);
      });
    }

    console.log('Total content items fetched:', contentArray.length);
    console.log('Content array sample:', JSON.stringify(contentArray.slice(0, 2), null, 2));

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

    // Create list of detected files for the prompt
    const detectedFilesList = detectedFiles.length > 0 
      ? detectedFiles.join(', ') 
      : 'No files detected';

    // Create data object based on report type
    let reportData = {
      research_folder_path: folderPath,
      study_name: selectedStudyName,
      researcher_contact: selectedStudy?.researcher_email || 'Unknown Researcher',
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
    let yamlTemplateName = '';
    if (reportType === 'research_readout') {
      yamlTemplateName = 'research_readout.yaml';
    } else if (reportType === 'targeted_readouts') {
      yamlTemplateName = 'targeted_readouts.yaml';
      reportData.target_audience = targetAudience;
    } else if (reportType === 'github_issues') {
      yamlTemplateName = 'github_issues_generator.yaml';
    }

    const file = await fetchFileFromRepo(getConfigRepo(), "beta-test/YAML Templates", yamlTemplateName);
    const aiCheck = reportType === 'github_issues';
    const renderedYaml = await processYamlTemplate(file.content, reportData, selectedStudy.path, 'primary-research', aiCheck);

    // console.log('Generating report with data:', reportData);

    let successMessage = `✅ Report generated successfully!`;
    let blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📊 *To see the complete report, please visit:*\n<${renderedYaml.result.url}|:github: View Full Report on GitHub>`,
        },
      },
    ];

    // If this is a GitHub issues report, create the actual GitHub issues
    if (reportType === 'github_issues' && renderedYaml.aiResponses && renderedYaml.aiResponses.github_issues_complete) {
      try {
        // Parse the GitHub issues from the AI response
        const issues = parseGitHubIssues(renderedYaml.aiResponses.github_issues_complete);
        console.log("🚀 ~ handleReadoutModalSubmission ~ issues:", issues)

        // Create the issues in GitHub
        const createdIssues = await createGitHubIssues(issues);

        // Update success message to include issue creation info
        successMessage = `✅ Report generated and ${createdIssues.length} GitHub issues created successfully!`;

        // Add blocks showing the created issues
        const issueBlocks = createdIssues.map(issue => ({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🔗 *Issue #${issue.number}:* <${issue.url}|${issue.title}>\n*Priority:* ${issue.priority} | *Effort:* ${issue.effort}`,
          },
        }));

        blocks = [
          ...blocks,
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🎯 *Created ${createdIssues.length} GitHub Issues:*`,
            },
          },
          ...issueBlocks,
        ];
      } catch (error) {
        console.error('Error creating GitHub issues:', error);
        // Don't fail the whole process, just log the error
        successMessage = `✅ Report generated successfully! (Note: Some GitHub issues may not have been created due to an error)`;
      }
    }

    // Send success message with report details
    await client.chat.postMessage({
      channel: body.user.id,
      text: successMessage,
      blocks: blocks,
    });

    // Notify team members for targeted readouts
    if (reportType === 'targeted_readouts' && teamMemberUserIds.length > 0) {
      try {
        await client.chat.postMessage({
          channel: state.origin?.channel || 'general',
          text: `📢 *New Targeted Readout Report Available!*\n\n*Study:* ${selectedStudyName}\n*Target Audience:* ${targetAudience}\n*Report:* <${renderedYaml.result.url}|View Report on GitHub>\n\n*Notified:* ${teamMembers}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `📢 *New Targeted Readout Report Available!*\n\n*Study:* ${selectedStudyName}\n*Target Audience:* ${targetAudience}\n*Report:* <${renderedYaml.result.url}|View Report on GitHub>`
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `*Notified:* ${teamMembers}`
                }
              ]
            }
          ]
        });
      } catch (notificationError) {
        console.error('Error notifying team members:', notificationError);
      }
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
