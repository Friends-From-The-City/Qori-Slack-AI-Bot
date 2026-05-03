/**
 * briefHandler.js — /qori-brief submission handler
 *
 * Extracted from events.js for maintainability. Handles the research_brief_modal
 * submission: study creation, form extraction, discovery variable injection,
 * YAML processing, and result messaging.
 */
const { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo, readFolders, copyFilesToFolder } = require('../../github');
const { getResearchStudyWithRoles, addResearchStudyWithRoles } = require('../../../services/research_study.service');
const { getChannelConfigByChannelId } = require('../../../services/channel-config.service');
const { processYamlTemplate } = require('../../yamlProcessor');
const { addStudyStatus } = require('../../../services/study-status.service');
const { sendStudyResultMessage, generateStudyResultBlocks } = require('../ui/studyResultBlocks');
const { loadDiscoveryArtifacts, aggregateDiscoveryVariables } = require('../../discoveryLoader');

/**
 * Handle research_brief_modal submission.
 */
async function handleBriefSubmission({ ack, body, view, client }) {
  await ack();

  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  const { channelId } = meta;

  // Helper function to extract values from different input types
  const extract = (blockId, actionId) => {
    const block = values[blockId];
    if (!block) return null;
    const action = block[actionId];
    if (!action) return null;
    if (action.value !== undefined) return action.value?.trim() || null;
    if (action.selected_option !== undefined) return action.selected_option;
    if (action.selected_date !== undefined) return action.selected_date;
    if (action.selected_options !== undefined) return action.selected_options.map(opt => opt.value);
    return null;
  };

  // Extract and slugify study name
  const studyNameRaw = extract('study_name_block', 'study_name_input') || meta.studyName;
  const studyName = studyNameRaw
    ? studyNameRaw.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
    : null;

  if (!studyName) {
    console.error('No study name provided for research brief');
    return;
  }

  console.log("🚀 ~ Research Brief ~ studyName:", studyName);

  // Fetch the full study — or create it if it doesn't exist yet
  let study = await getResearchStudyWithRoles(studyName);

  if (!study || !study.path) {
    console.log('📁 Study does not exist yet — creating from brief submission');
    try {
      const userInfo = await client.users.info({ user: body.user.id });
      const userEmail = userInfo.user.profile?.email || `${body.user.id}@slack.com`;
      const userName = userInfo.user.real_name || userInfo.user.profile?.display_name || body.user.id;

      const channelConfig = await getChannelConfigByChannelId(channelId);
      if (!channelConfig) {
        throw new Error('No channel config found — run /qori-repo first to link a repository folder');
      }

      const templateFiles = await readFolders('config/templates', getConfigRepo());
      const folderResult = await copyFilesToFolder(
        templateFiles,
        `${channelConfig.sub_folder_name}/research`,
        studyName,
        process.env.GITHUB_REPO,
        channelConfig.product_folder_name
      );

      await addResearchStudyWithRoles({
        name: studyName,
        description: `Created from research brief`,
        created_by: body.user.id,
        researcher_name: userName,
        researcher_email: userEmail,
        link: folderResult.url,
        path: folderResult.path,
        channel_name: channelId,
        assignments: [],
      });

      study = await getResearchStudyWithRoles(studyName);
      console.log(`✅ Study "${studyName}" created from brief, path: ${study.path}`);
    } catch (createError) {
      console.error('❌ Failed to create study from brief:', createError);
      const errMsg = createError.message?.includes('<!DOCTYPE')
        ? 'GitHub is temporarily unavailable. Please try again in a moment.'
        : createError.message;
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `❌ Could not create study folder: ${errMsg}`,
      });
      return;
    }
  }

  // Methodology label mapping
  const methodologyLabels = {
    usability_testing: 'Moderated usability testing',
    user_interviews: 'User interviews',
    contextual_inquiry: 'Contextual inquiry',
    concept_testing: 'Concept testing',
    survey: 'Survey research',
    card_sorting: 'Card sorting',
    tree_testing: 'Tree testing',
    mixed_methods: 'Mixed methods',
  };

  const methodValue = extract('research_method_block', 'research_method_select')?.value || 'usability_testing';
  const methodLabel = methodologyLabels[methodValue] || methodValue;
  const leadResearcher = meta.leadResearcher || body.user.name || '';

  const data = {
    selected_study: studyName,
    lead_researcher: leadResearcher,
    requestor_name: extract('stakeholder_block', 'stakeholder_input') || '',
    problem_statement: extract('problem_statement_block', 'problem_statement_input') || '',
    learning_objectives: extract('learning_objectives_block', 'learning_objectives_input') || '',
    out_of_scope: extract('out_of_scope_block', 'out_of_scope_input') || '',
    methodology: methodLabel,
    methodology_value: methodValue,
    participant_approach: extract('participant_approach_block', 'participant_approach_input') || '',
    timeline_preference: extract('timeline_block', 'timeline_radio')?.value || 'standard',
    start_date: extract('start_date_block', 'start_date_picker') || '',
    decision_deadline: extract('decision_deadline_block', 'decision_deadline_picker') || '',
    budget: extract('budget_block', 'budget_input') || '',
  };

  // Discovery injection — brief handler does manual loading (not YAML consumes).
  // Researcher selects which artifacts to include via modal checkboxes.
  const discoverySelections = extract('discovery_selection_block', 'discovery_selection') || [];
  if (discoverySelections.length > 0) {
    const team = meta.team || process.env.QORI_TEAM_SLUG || 'friends-lab';
    try {
      const allArtifacts = await loadDiscoveryArtifacts(team);
      const selectedSlugs = new Set(discoverySelections);
      const selectedArtifacts = allArtifacts.filter(a => selectedSlugs.has(`${a.type}::${a.slug}`));

      if (selectedArtifacts.length > 0) {
        const upstreamVars = aggregateDiscoveryVariables(selectedArtifacts);
        Object.assign(data, upstreamVars);

        // Template variables for Discovery sources appendix
        data.discovery_count = selectedArtifacts.length;
        const typeLabels = { 'desk-research': 'Desk research', 'stakeholder-interviews': 'Stakeholder interviews', 'survey-synthesis': 'Survey synthesis' };
        data.discovery_sources = selectedArtifacts
          .map(a => `| ${a.slug} | ${typeLabels[a.type] || a.type} | ${a.variableCount} variables | ${a.date} |`)
          .join('\n  ');

        console.log(`✅ Injected ${Object.keys(upstreamVars).length} upstream variables from ${selectedArtifacts.length} discovery artifact(s)`);
      }
    } catch (error) {
      console.warn('⚠️ Failed to load discovery variables for brief, proceeding without:', error.message);
    }
  }

  console.log('📋 Extracted research brief data:', JSON.stringify(data, null, 2));

  const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "research_brief.yaml");
  const renderedYaml = await processYamlTemplate(file.content, data, study.path);

  const url = renderedYaml.result.url;

  const blocks = generateStudyResultBlocks(studyName, study, url, channelId, 'brief');
  await sendStudyResultMessage(client, channelId, studyName, blocks, 'brief');

  // Notify researcher via DM
  try {
    const im = await client.conversations.open({ users: body.user.id });
    await client.chat.postMessage({
      channel: im.channel.id,
      text: `✅ *Research Brief Created*\n\n*Study:* ${studyName}\n*View:* <${url}|GitHub>\n\nThe brief has been sent to the study team for approval.`,
    });
  } catch (error) {
    console.error('Failed to send confirmation to researcher:', error);
  }

  await addStudyStatus({
    study_name: studyName,
    path: url,
    status: 'created',
    created_by: body.user?.id || body.user_id || null,
  });

  console.log(`✅ Research brief created for study: ${studyName}`);
}

module.exports = { handleBriefSubmission };
