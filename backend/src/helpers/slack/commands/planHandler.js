/**
 * planHandler.js — /qori-plan submission handler
 *
 * Extracted from events.js for maintainability. Handles the research_plan_modal
 * submission: form extraction, compensation calculation, cascade variable
 * consumption, YAML processing, and result messaging.
 */
const { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } = require('../../github');
const { getResearchStudyWithRoles } = require('../../../services/research_study.service');
const { processYamlTemplate, TemplateContractError } = require('../../yamlProcessor');
const { addStudyStatus } = require('../../../services/study-status.service');
const { sendStudyResultMessage, generateStudyResultBlocks } = require('../ui/studyResultBlocks');
const { calculatePerPersonCompensation } = require('../../../utils/compensationCalculator');
const research_planService = require('../../../services/research_plan.service');

/**
 * Handle research_plan_modal submission.
 */
async function handlePlanSubmission({ ack, body, view, client }) {
  await ack();

  const values = view.state.values;
  const { channelId, studyName: metaStudyName, userId } = JSON.parse(view.private_metadata || '{}');

  // Get study name from study_folder_block if available, otherwise use metadata
  const studyName = values.study_folder_block?.study_folder_input?.value || metaStudyName;

  if (!studyName) {
    throw new Error('No study selected or provided');
  }

  console.log("🚀 ~ Research Plan Generator ~ studyName:", studyName);

  // Fetch the full study with roles
  const study = await getResearchStudyWithRoles(studyName);

  // Helper function to extract values from different input types
  const extract = (blockId, actionId) => {
    const block = values[blockId];
    if (!block) return null;
    const action = block[actionId];
    if (!action) return null;
    if (action.value !== undefined) return action.value?.trim() || null;
    if (action.selected_option !== undefined) return action.selected_option.value || null;
    if (action.selected_date !== undefined) return action.selected_date;
    if (action.selected_options !== undefined) return action.selected_options.map(opt => opt.value);
    return null;
  };

  // Extract form values — plan only collects execution details
  // Scope (objectives, method, participants, context) comes from cascade
  const perParticipantComp = calculatePerPersonCompensation(study);

  const data = {
    selected_study: studyName,
    project_title: studyName,
    lead_researcher: extract('lead_researcher_block', 'lead_researcher_input'),
    note_taker: extract('note_taker_block', 'note_taker_input') || '',
    observer: extract('observer_block', 'observer_input') || '',
    recruitment_sources: extract('recruitment_source_block', 'recruitment_source_input') || '',
    operational_risks: extract('operational_risks_block', 'operational_risks_input') || '',
    per_participant_compensation: perParticipantComp
      ? `$${perParticipantComp} per participant (calculated from $${parseFloat(study.parsed_budget_amount)} ÷ ${study.target_participants} target participants)`
      : '[Standard rate, typically $50-$100 per participant for 60-90 min]',
  };

  console.log(`📋 Extracted research plan data: ${Object.keys(data).length} fields, study: ${data.study_name || 'unknown'}`);

  try {
    const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "research_plan.yaml");
    const renderedYaml = await processYamlTemplate(file.content, data, study.path);

    const url = renderedYaml.result.url;
    const urlParts = renderedYaml.result.path.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const planData = {
      study_id: study.id,
      study_name: studyName,
      filename: fileName,
      file_path: renderedYaml.result.path,
      file_url: renderedYaml.result.url,
      created_by: userId,
    };
    await research_planService.createResearchPlan(planData);
    const blocks = generateStudyResultBlocks(studyName, study, url, channelId, 'plan');
    await sendStudyResultMessage(client, channelId, studyName, blocks, 'plan');

    // Send DM with next-step suggestion
    try {
      const im = await client.conversations.open({ users: userId });
      await client.chat.postMessage({
        channel: im.channel.id,
        text: `✅ *Research Plan Created*\n\n*Study:* ${studyName}\n*View:* <${url}|GitHub>\n\n*Next:* Run \`/qori-fieldwork\` to track participants, observers, and outreach.`,
      });
    } catch (dmErr) { console.error('Failed to send plan DM:', dmErr.message); }

    // Add study status for created file
    await addStudyStatus({
      study_name: studyName,
      path: url,
      status: 'created',
      created_by: body.user?.id || body.user_id || null,
    });
  } catch (err) {
    if (err instanceof TemplateContractError) {
      // Surface contract errors as a clear DM to the researcher
      console.warn(`⚠️ Cascade contract error for plan: ${err.message}`);
      try {
        const im = await client.conversations.open({ users: userId });
        await client.chat.postMessage({
          channel: im.channel.id,
          text: `⚠️ *Could not generate the research plan*\n\n${err.userMessage}\n\nRun \`/qori-brief\` to complete the brief, then try \`/qori-plan\` again.`,
        });
      } catch (dmErr) { console.error('Failed to send contract error DM:', dmErr.message); }
    } else {
      throw err; // Re-throw non-contract errors
    }
  }
}

module.exports = { handlePlanSubmission };
