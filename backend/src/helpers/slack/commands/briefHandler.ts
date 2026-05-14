/**
 * briefHandler.ts — /qori-brief submission handler
 *
 * Extracted from events.js for maintainability. Handles the research_brief_modal
 * submission: study creation, form extraction, discovery variable injection,
 * YAML processing, and result messaging.
 */

import type { ViewSubmissionContext } from '../../../types/handlers';

const { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo, readFolders, copyFilesToFolder } = require('../../github');
const { getResearchStudyWithRoles, addResearchStudyWithRoles } = require('../../../services/research_study.service');
const { getChannelConfigByChannelId } = require('../../../services/channel-config.service');
const { processYamlTemplate } = require('../../yamlProcessor');
const { addStudyStatus } = require('../../../services/study-status.service');
const { sendStudyResultMessage, generateStudyResultBlocks } = require('../ui/studyResultBlocks');
const { loadDiscoveryArtifacts, aggregateDiscoveryVariables } = require('../../discoveryLoader');
const { parseBudget, parseParticipantTarget } = require('../../../utils/budgetParser');

// ─── Discovery type maps ────────────────────────────────────────

interface DiscoveryArtifact {
  type: string;
  slug: string;
  date: string;
  variableCount: number;
}

type DiscoveryType = 'desk-research' | 'stakeholder-interviews' | 'survey-synthesis';

const typeLabels: Record<DiscoveryType, string> = {
  'desk-research': 'Desk research',
  'stakeholder-interviews': 'Stakeholder interviews',
  'survey-synthesis': 'Survey synthesis',
};

const markerPrefixes: Record<DiscoveryType, string> = {
  'desk-research': 'D',
  'stakeholder-interviews': 'S',
  'survey-synthesis': 'V',
};

// ─── Template input contract ────────────────────────────────────

/** Data shape passed to the research_brief YAML template. Co-located with handler. */
interface BriefTemplateInput {
  selected_study: string;
  lead_researcher: string;
  requestor_name: string;
  problem_statement: string;
  learning_objectives: string;
  out_of_scope: string;
  methodology: string;
  methodology_value: string;
  participant_approach: string;
  timeline_preference: string;
  start_date: string;
  decision_deadline: string;
  budget: string;
  // Discovery enrichment (optional, injected conditionally)
  discovery_count?: number;
  discovery_sources?: string;
  citation_convention?: string;
  [key: string]: unknown; // upstream discovery variables merged via Object.assign
}

// ─── Handler ────────────────────────────────────────────────────

/**
 * Handle research_brief_modal submission.
 */
async function handleBriefSubmission({ ack, body, view, client }: ViewSubmissionContext): Promise<void> {
  await ack();

  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  const { channelId } = meta as { channelId: string };

  // Helper function to extract values from different input types.
  // Returns mixed shapes depending on the element type — callers cast as needed.
  const extract = (blockId: string, actionId: string): unknown => {
    const block = values[blockId];
    if (!block) return null;
    const action = block[actionId];
    if (!action) return null;
    if (action.value !== undefined) return action.value?.trim() || null;
    if (action.selected_option !== undefined) return action.selected_option;
    if (action.selected_date !== undefined) return action.selected_date;
    if (action.selected_options !== undefined) return action.selected_options.map((opt: any) => opt.value);
    return null;
  };

  // Extract and slugify study name
  const studyNameRaw = (extract('study_name_block', 'study_name_input') as string | null) || meta.studyName;
  const studyName: string | null = studyNameRaw
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
      const userEmail: string = userInfo.user?.profile?.email || `${body.user.id}@slack.com`;
      const userName: string = userInfo.user?.real_name || userInfo.user?.profile?.display_name || body.user.id;

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
    } catch (createError: any) {
      console.error('❌ Failed to create study from brief:', createError);
      const errMsg: string = createError.message?.includes('<!DOCTYPE')
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
  const methodologyLabels: Record<string, string> = {
    usability_testing: 'Moderated usability testing',
    user_interviews: 'User interviews',
    contextual_inquiry: 'Contextual inquiry',
    concept_testing: 'Concept testing',
    survey: 'Survey research',
    card_sorting: 'Card sorting',
    tree_testing: 'Tree testing',
    mixed_methods: 'Mixed methods',
  };

  // Method: prioritize override text if filled, otherwise use radio selection
  const methodOverride = extract('method_override_block', 'method_override_input') as string | null;
  const methodRadio = extract('research_method_block', 'research_method_select') as { value: string } | null;
  const methodValue: string = methodOverride ? 'custom' : (methodRadio?.value || 'usability_testing');
  const methodLabel: string = methodOverride || methodologyLabels[methodRadio?.value || 'usability_testing'] || (methodRadio?.value || 'usability_testing');
  const leadResearcher: string = meta.leadResearcher || body.user.name || '';

  const data: BriefTemplateInput = {
    selected_study: studyName,
    lead_researcher: leadResearcher,
    requestor_name: (extract('stakeholder_block', 'stakeholder_input') as string) || '',
    problem_statement: (extract('problem_statement_block', 'problem_statement_input') as string) || '',
    learning_objectives: (extract('learning_objectives_block', 'learning_objectives_input') as string) || '',
    out_of_scope: (extract('out_of_scope_block', 'out_of_scope_input') as string) || '',
    methodology: methodLabel,
    methodology_value: methodValue,
    participant_approach: (extract('participant_approach_block', 'participant_approach_input') as string) || '',
    timeline_preference: ((extract('timeline_block', 'timeline_radio') as { value: string } | null)?.value) || 'standard',
    start_date: (extract('start_date_block', 'start_date_picker') as string) || '',
    decision_deadline: (extract('decision_deadline_block', 'decision_deadline_picker') as string) || '',
    budget: (extract('budget_block', 'budget_input') as string) || '',
  };

  // Parse budget and target participants, save to study row
  const parsedBudget: number | null = parseBudget(data.budget);
  const targetParticipants: number | null = parseParticipantTarget(data.participant_approach);
  const studyUpdates: Record<string, unknown> = {};
  if (parsedBudget !== null) studyUpdates.parsed_budget_amount = parsedBudget;
  if (targetParticipants !== null) studyUpdates.target_participants = targetParticipants;
  if (Object.keys(studyUpdates).length > 0) {
    try {
      await study.update({ ...studyUpdates, updated_at: new Date() });
      console.log(`💰 Parsed budget: ${parsedBudget}, target: ${targetParticipants} for study ${studyName}`);
    } catch (budgetErr: any) {
      console.warn('⚠️ Failed to save parsed budget/target:', budgetErr.message);
    }
  }

  // Discovery injection — brief handler does manual loading (not YAML consumes).
  // Researcher selects which artifacts to include via modal checkboxes.
  const discoverySelections = (extract('discovery_selection_block', 'discovery_selection') as string[] | null) || [];
  if (discoverySelections.length > 0) {
    const team: string = meta.team || process.env.QORI_TEAM_SLUG || 'friends-lab';
    try {
      const allArtifacts: DiscoveryArtifact[] = await loadDiscoveryArtifacts(team);
      const selectedSlugs = new Set(discoverySelections);
      const selectedArtifacts = allArtifacts.filter((a: DiscoveryArtifact) => selectedSlugs.has(`${a.type}::${a.slug}`));

      if (selectedArtifacts.length > 0) {
        const upstreamVars: Record<string, unknown> = aggregateDiscoveryVariables(selectedArtifacts);
        Object.assign(data, upstreamVars);

        // Template variables for Discovery sources appendix
        data.discovery_count = selectedArtifacts.length;
        data.discovery_sources = selectedArtifacts
          .map((a: DiscoveryArtifact) => {
            const prefix = markerPrefixes[a.type as DiscoveryType] || '?';
            return `| **${prefix}**1-${prefix}7 | ${a.slug} | ${typeLabels[a.type as DiscoveryType] || a.type} | ${a.date} | ${a.variableCount} variables |`;
          })
          .join('\n  ');
        // Pass marker convention to prompts for citation generation
        data.citation_convention = selectedArtifacts
          .map((a: DiscoveryArtifact) => `[${markerPrefixes[a.type as DiscoveryType] || '?'}N] = ${typeLabels[a.type as DiscoveryType] || a.type} (${a.slug})`)
          .join('; ');

        console.log(`✅ Injected ${Object.keys(upstreamVars).length} upstream variables from ${selectedArtifacts.length} discovery artifact(s)`);
      }
    } catch (error: any) {
      console.warn('⚠️ Failed to load discovery variables for brief, proceeding without:', error.message);
    }
  }

  console.log(`📋 Extracted research brief data: ${Object.keys(data).length} fields, study: ${data.selected_study || 'unknown'}`);

  const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "research_brief.yaml");
  const renderedYaml = await processYamlTemplate(file.content, data, study.path);

  const url: string = renderedYaml.result.url;

  const blocks = generateStudyResultBlocks(studyName, study, url, channelId, 'brief');
  await sendStudyResultMessage(client, channelId, studyName, blocks, 'brief');

  // Notify researcher via DM
  try {
    const im = await client.conversations.open({ users: body.user.id });
    if (im.channel?.id) {
      await client.chat.postMessage({
        channel: im.channel.id,
        text: `✅ *Research Brief Created*\n\n*Study:* ${studyName}\n*View:* <${url}|GitHub>\n\nThe brief has been sent to the study team for approval.\n\n*Next:* Run \`/qori-plan\` to create an execution plan once approved.`,
      });
    }
  } catch (error: any) {
    console.error('Failed to send confirmation to researcher:', error);
  }

  await addStudyStatus({
    study_name: studyName,
    path: url,
    status: 'created',
    created_by: body.user?.id || null,
  });

  console.log(`✅ Research brief created for study: ${studyName}`);
}

module.exports = { handleBriefSubmission };
