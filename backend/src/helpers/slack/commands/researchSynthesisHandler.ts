/**
 * researchSynthesisHandler.ts — /qori-synthesis command and modal handlers
 *
 * Opens a progressive-disclosure modal (study → analysis method → files),
 * validates cascade prerequisites, then runs the selected synthesis YAML
 * template (affinity mapping, journey mapping, personas, etc.).
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';
import { TemplateContractError } from '../../../types/handlers';

import { researchSynthesisModal } from "../ui/researchSynthesisModal";
import { getStudiesByUser, resolveStudyFromName } from "../../../services/research_study.service";
import { getActiveStudy, setActiveStudy } from "../../../services/slack-user-state.service";
import { studyNotesService } from "../../../services";
import sessionSummaryService from "../../../services/session-summary.service";
import { getStudyStakeholderGuide } from "../../../services/study-status.service";
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepoByPath, fetchFileFromRepo, readFolderContents } from "../../../helpers/github";
import { processYamlTemplate } from "../../../helpers/yamlProcessor";
import { readStudyVariablesByContext, type VariableContext } from '../../studyVariables';
import { buildCascadeReadiness } from "../ui/cascadeReadinessBlocks";
import type { CascadeData } from "../ui/cascadeReadinessBlocks";

// ─── Types ──────────────────────────────────────────────────────

interface Study {
  id: number;
  name: string;
  path?: string | null;
  channel_name?: string | null;
  researcher_name?: string | null;
  researcher_email?: string | null;
}

interface SessionSummary {
  id: number;
  filename: string;
  file_path: string | null;
  file_url: string | null;
}

interface Transcript {
  id: number;
  filename: string;
  transcript: boolean;
  file_path: string | null;
  file_url: string | null;
}

interface StakeholderGuide {
  id: number | string;
  file_name?: string | null;
  path?: string | null;
  [key: string]: unknown;
}

interface AnalysisFile {
  name: string;
  path: string;
  label: string;
  relative_path: string;
}

interface AnalysisScan {
  folder: string;
  label: string;
}

interface FileWithContent {
  filename: string;
  file_type: string;
  file_path: string | null;
  content: string;
  githubPath: string | null;
}

interface GithubFile {
  name: string;
  path: string;
}

interface FolderRecord {
  record: SessionSummary | Transcript;
  type: 'summary' | 'transcript';
  path: string | null;
}

/** Data shape passed to synthesis YAML templates. */
interface SynthesisTemplateInput {
  selected_study: string;
  selected_session_summaries: string[];
  selected_transcripts: string[];
  selected_stakeholder_guides: string[];
  include_participant_tracker: boolean;
  include_research_plan: boolean;
  blueprint_scope: string;
  researcher_contact: string;
  detected_files: string;
  combined_file_content: string;
}

// ─── Constants ──────────────────────────────────────────────────

// Filename patterns for matching synthesis artifacts in flat 04-synthesis/
// Pattern matches the YAML output filenames (e.g., "study-affinity-map-2026-05-28.md")
const SYNTHESIS_FILE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /-affinity-map-/, label: 'Affinity map' },
  { pattern: /-journey-map-/, label: 'Journey map' },
  { pattern: /-personas-/, label: 'Personas' },
  { pattern: /-usability-issues-/, label: 'Usability issues' },
  { pattern: /-jobs-to-be-done-/, label: 'Jobs to be done' },
  { pattern: /-design-opportunities-/, label: 'Design opportunities' },
  { pattern: /_service_blueprint_/, label: 'Service blueprint' },
  { pattern: /-survey-synthesis-/, label: 'Survey synthesis' },
];

const ANALYSIS_YAML_MAPPING: Record<string, string> = {
  'affinity_mapping': 'affinity_mapping.yaml',
  'journey_mapping': 'journey_mapping.yaml',
  'persona_generation': 'persona_generator.yaml',
  'jobs_to_be_done': 'jobs_to_be_done.yaml',
  'usability_issues': 'usability_issues_extractor.yaml',
  'design_opportunities': 'design_opportunity_generator.yaml',
  'service_blueprint': 'service_blueprint.yaml'
};

const NUGGET_REQUIRED_METHODS = [
  'affinity_mapping', 'persona_generation', 'journey_mapping',
  'jobs_to_be_done', 'usability_issues', 'design_opportunities', 'service_blueprint',
];

// ─── Helper: scan synthesis folder ──────────────────────────────

async function scanAnalysisFolders(studyPath: string): Promise<AnalysisFile[]> {
  const analysisFiles: AnalysisFile[] = [];
  const decodedPath = decodeURIComponent(studyPath);
  const synthesisPath = `${decodedPath}/04-synthesis`;

  try {
    // Scan the flat 04-synthesis/ folder once
    const files: GithubFile[] = await readFolderContents(synthesisPath, process.env.GITHUB_REPO!);
    const validFiles = files.filter((f: GithubFile) =>
      f.name !== 'readme.md' && f.name !== 'README.md' && f.name !== '.gitkeep'
    );

    // Group files by type using filename patterns
    for (const { pattern, label } of SYNTHESIS_FILE_PATTERNS) {
      const matchingFiles = validFiles.filter((f: GithubFile) => pattern.test(f.name));

      if (matchingFiles.length > 0) {
        // Sort by name (descending) to get newest first (date is in filename)
        const sorted = matchingFiles.sort((a: GithubFile, b: GithubFile) => b.name.localeCompare(a.name));
        const newest = sorted[0];
        analysisFiles.push({
          name: newest.name,
          path: newest.path,
          label,
          relative_path: `04-synthesis/${newest.name}`,
        });
      }
    }
  } catch {
    // Folder doesn't exist — return empty array
  }

  return analysisFiles;
}

// ─── Command handler ────────────────────────────────────────────

const researchSynthesisHandler = async ({ ack, body, client }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> => {
  try {
    await ack();

    const studies = await getStudiesByUser(body.user_id);
    const activeStudyId: number | null = await getActiveStudy(body.user_id);
    const activeStudy = activeStudyId ? studies.find((s: Study) => s.id === activeStudyId) : null;

    await client.views.open({
      trigger_id: body.trigger_id,
      view: researchSynthesisModal(studies as Study[], activeStudy?.id ?? null, [], [], null, [])
    });

  } catch (error) {
    console.error("Error opening research synthesis modal:", error);
    const message = error instanceof Error ? error.message : String(error);

    await client.chat.postEphemeral({
      channel: body.user_id,
      user: body.user_id,
      text: `❌ Failed to open research synthesis modal: ${message}`,
    });
  }
};

// ─── Study selection change handler ─────────────────────────────

const handleStudySelectionChange = async ({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    console.log("🚀 ~ handleStudySelectionChange called");
    await ack();

    const view = body.view;
    if (!view || !view.state || !view.state.values) {
      console.error("🚨 No view state available");
      return;
    }

    const selectedStudyOption = view.state.values.study_select_block?.study_select_synthesize?.selected_option;

    if (!selectedStudyOption || selectedStudyOption.value === "no_studies") {
      console.log("🚀 ~ No study selected, clearing files");
      const studies = await getStudiesByUser(body.user.id);
      await client.views.update({
        view_id: view.id,
        view: researchSynthesisModal(studies as Study[], null, [], [], null, [])
      });
      return;
    }

    const studyId: string = selectedStudyOption.value;
    const studyName: string = selectedStudyOption.text.text;

    console.log(`🚀 ~ Study selected: ${studyName} (ID: ${studyId})`);

    const currentAnalysisMethod: string | null = view.state.values.analysis_method_selection?.analysis_method?.selected_option?.value || null;
    const studies = await getStudiesByUser(body.user.id);

    // First update: show button immediately
    let updatedModal = researchSynthesisModal(studies as Study[], studyId, [], [], currentAnalysisMethod, []);
    if (view.private_metadata) {
      updatedModal.private_metadata = view.private_metadata;
    }

    await client.views.update({
      view_id: view.id,
      view: updatedModal
    });

    console.log("✅ Modal updated with Load Files button");

    // Fetch files in background
    let sessionSummaries: SessionSummary[] = [];
    try {
      sessionSummaries = await sessionSummaryService.getSessionSummariesByStudyId(parseInt(studyId));
      console.log(`✅ Fetched ${sessionSummaries.length} session summaries`);
    } catch (error) {
      console.error("❌ Error fetching session summaries:", error);
    }

    let transcripts: Transcript[] = [];
    try {
      const allStudyNotes = await studyNotesService.getStudyNotesByStudyId(parseInt(studyId));
      transcripts = allStudyNotes
        .filter((note: { transcript: boolean }) => note.transcript === true)
        .map((note: { id: number; filename: string; file_path: string | null; file_url: string | null }) => ({
          id: note.id,
          filename: note.filename,
          transcript: true,
          file_path: note.file_path,
          file_url: note.file_url,
        }));
      console.log(`✅ Formatted ${transcripts.length} transcripts`);
    } catch (error) {
      console.error("❌ Error fetching transcripts:", error);
    }

    let stakeholderGuides: StakeholderGuide[] = [];
    try {
      const selectedStudy = studies.find((s: Study) => s.id.toString() === studyId.toString());
      if (selectedStudy) {
        stakeholderGuides = await getStudyStakeholderGuide(selectedStudy.id) as unknown as StakeholderGuide[];
        console.log(`✅ Fetched ${stakeholderGuides.length} stakeholder interview guides`);
      }
    } catch (error) {
      console.error("❌ Error fetching stakeholder guides:", error);
    }

    // Validate DB records against GitHub
    try {
      const repo = process.env.GITHUB_REPO!;
      const allRecords: FolderRecord[] = [
        ...sessionSummaries.map((s: SessionSummary) => ({ record: s, type: 'summary' as const, path: s.file_path })),
        ...transcripts.map((t: Transcript) => ({ record: t, type: 'transcript' as const, path: t.file_path })),
      ];
      const folderMap: Record<string, FolderRecord[]> = {};
      for (const r of allRecords) {
        if (!r.path) continue;
        const folder = r.path.substring(0, r.path.lastIndexOf('/'));
        if (!folderMap[folder]) folderMap[folder] = [];
        folderMap[folder].push(r);
      }

      for (const [folder, records] of Object.entries(folderMap)) {
        try {
          const githubFiles: GithubFile[] = await readFolderContents(folder, repo);
          const githubFileNames = new Set(githubFiles.map((f: GithubFile) => f.name));

          for (const r of records) {
            const fileName = r.path!.split('/').pop();
            if (!githubFileNames.has(fileName!)) {
              console.log(`🗑️ Pruning stale ${r.type} record: ${fileName}`);
              if (r.type === 'summary') {
                await sessionSummaryService.deleteSessionSummary(r.record.id);
                sessionSummaries = sessionSummaries.filter((s: SessionSummary) => s.id !== r.record.id);
              } else if (r.type === 'transcript') {
                await studyNotesService.deleteStudyNote(r.record.id);
                transcripts = transcripts.filter((t: Transcript) => t.id !== r.record.id);
              }
            }
          }
        } catch (folderError) {
          const folderErrMessage = folderError instanceof Error ? folderError.message : String(folderError);
          const folderErrStatus = (folderError as Record<string, unknown>)?.status;
          if (folderErrStatus === 404) {
            console.log(`🗑️ Folder not found in GitHub: ${folder}, pruning ${records.length} records`);
            for (const r of records) {
              if (r.type === 'summary') {
                await sessionSummaryService.deleteSessionSummary(r.record.id);
                sessionSummaries = sessionSummaries.filter((s: SessionSummary) => s.id !== r.record.id);
              } else if (r.type === 'transcript') {
                await studyNotesService.deleteStudyNote(r.record.id);
                transcripts = transcripts.filter((t: Transcript) => t.id !== r.record.id);
              }
            }
          } else {
            console.error(`⚠️ Error checking GitHub folder ${folder}:`, folderErrMessage);
          }
        }
      }

      // Validate stakeholder records
      for (const guide of [...stakeholderGuides]) {
        if (!guide.path) continue;
        try {
          const urlPath = guide.path.replace(/https:\/\/github\.com\/[^/]+\/[^/]+\/(blob|tree)\/main\//, '');
          const folder = decodeURIComponent(urlPath.substring(0, urlPath.lastIndexOf('/')));
          const fileName = decodeURIComponent(urlPath.split('/').pop()!);
          const githubFiles: GithubFile[] = await readFolderContents(folder, repo);
          if (!githubFiles.some((f: GithubFile) => f.name === fileName)) {
            console.log(`🗑️ Pruning stale stakeholder record: ${fileName}`);
            stakeholderGuides = stakeholderGuides.filter((g: StakeholderGuide) => g.id !== guide.id);
          }
        } catch (err) {
          if ((err as Record<string, unknown>)?.status === 404) {
            console.log(`🗑️ Stakeholder file folder not found, pruning: ${guide.file_name}`);
            stakeholderGuides = stakeholderGuides.filter((g: StakeholderGuide) => g.id !== guide.id);
          }
        }
      }

      console.log(`✅ GitHub validation complete: ${sessionSummaries.length} summaries, ${transcripts.length} transcripts, ${stakeholderGuides.length} stakeholder files`);
    } catch (validationError) {
      const message = validationError instanceof Error ? validationError.message : String(validationError);
      console.error("⚠️ GitHub validation failed (continuing):", message);
    }

    // Scan analysis-layer folders
    let analysisFiles: AnalysisFile[] = [];
    try {
      const selectedStudy = studies.find((s: Study) => s.id.toString() === studyId.toString());
      if (selectedStudy) {
        const resolved = await resolveStudyFromName(selectedStudy.name);
        if (resolved?.study?.path) {
          analysisFiles = await scanAnalysisFolders(resolved.study.path);
          console.log(`✅ Found ${analysisFiles.length} analysis-layer files`);
        }
      }
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : String(analysisError);
      console.error("⚠️ Analysis file scan failed:", message);
    }

    // Update modal with loaded files
    updatedModal = researchSynthesisModal(studies as Study[], studyId, sessionSummaries, transcripts, currentAnalysisMethod, stakeholderGuides, analysisFiles);
    if (view.private_metadata) {
      updatedModal.private_metadata = view.private_metadata;
    }

    if (!updatedModal.blocks || updatedModal.blocks.length === 0) {
      throw new Error("Generated modal has no blocks");
    }

    const blockIds: string[] = updatedModal.blocks.map((block: { block_id?: string }) => block.block_id).filter(Boolean) as string[];
    const uniqueBlockIds = new Set(blockIds);
    if (blockIds.length !== uniqueBlockIds.size) {
      throw new Error("Modal has duplicate block_ids");
    }

    console.log(`🚀 ~ Updating modal with ${sessionSummaries.length} summaries, ${transcripts.length} transcripts, ${analysisFiles.length} analysis files`);

    await client.views.update({
      view_id: view.id,
      view: updatedModal
    });

    console.log("✅ Modal updated successfully with files and analysis");

  } catch (error) {
    console.error("🚨 Error in handleStudySelectionChange:", error);
    const message = error instanceof Error ? error.message : String(error);

    try {
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `❌ Error loading files for selected study: ${message}`,
      });
    } catch (ephemeralError) {
      console.error("Failed to send error message:", ephemeralError);
    }
  }
};

// ─── File checkbox change handler ───────────────────────────────

const handleFileCheckboxChange = async ({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    await ack();

    const view = body.view;
    if (!view || !view.private_metadata) {
      return;
    }

    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(view.private_metadata);
    } catch (error) {
      throw error;
    }

    const actionId = (body as unknown as { actions: Array<{ action_id: string }> }).actions[0].action_id;
    const fileId = actionId.replace('file_checkbox_', '');

    const selectedFiles = metadata.selectedFiles as Array<{ id?: string; filename?: string; selected?: boolean }> | undefined;
    if (selectedFiles) {
      const file = selectedFiles.find(f => (f.id || f.filename) === fileId);
      if (file) {
        file.selected = !file.selected;
      }
    }

    const studies = await getStudiesByUser(body.user.id);
    const updatedModal = researchSynthesisModal(studies as Study[], selectedFiles as unknown as string | number | null);
    updatedModal.private_metadata = JSON.stringify(metadata);

    await client.views.update({
      view_id: view.id,
      view: updatedModal
    });

  } catch (error) {
    throw error;
  }
};

// ─── Load Files button handler ──────────────────────────────────

const handleLoadSynthesisFiles = async ({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    await ack();

    const view = body.view;
    if (!view || !view.state || !view.state.values) {
      console.error("🚨 No view state available");
      return;
    }

    const selectedStudyOption = view.state.values.study_select_block?.study_select_synthesize?.selected_option;
    const studyId: string = selectedStudyOption?.value ||
                    (body as unknown as { actions: Array<{ value: string }> }).actions[0].value;

    if (!studyId || studyId === "no_studies") {
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: "❌ Please select a study first before loading files.",
      });
      return;
    }

    console.log(`🚀 ~ Load Files button clicked for study ID: ${studyId}`);

    const currentAnalysisMethod: string | null = view.state.values.analysis_method_selection?.analysis_method?.selected_option?.value || null;

    let sessionSummaries: SessionSummary[] = [];
    try {
      sessionSummaries = await sessionSummaryService.getSessionSummariesByStudyId(parseInt(studyId));
      console.log(`✅ Fetched ${sessionSummaries.length} session summaries`);
    } catch (error) {
      console.error("❌ Error fetching session summaries:", error);
    }

    let transcripts: Transcript[] = [];
    try {
      const allStudyNotes = await studyNotesService.getStudyNotesByStudyId(parseInt(studyId));
      transcripts = allStudyNotes
        .filter((note: { transcript: boolean }) => note.transcript === true)
        .map((note: { id: number; filename: string; file_path: string | null; file_url: string | null }) => ({
          id: note.id,
          filename: note.filename,
          transcript: true,
          file_path: note.file_path,
          file_url: note.file_url,
        }));
      console.log(`✅ Formatted ${transcripts.length} transcripts`);
    } catch (error) {
      console.error("❌ Error fetching transcripts:", error);
    }

    let stakeholderGuides: StakeholderGuide[] = [];
    const studies = await getStudiesByUser(body.user.id);
    try {
      const selectedStudy = studies.find((s: Study) => s.id.toString() === studyId.toString());
      if (selectedStudy) {
        stakeholderGuides = await getStudyStakeholderGuide(selectedStudy.id) as unknown as StakeholderGuide[];
        console.log(`✅ Fetched ${stakeholderGuides.length} stakeholder interview guides`);
      }
    } catch (error) {
      console.error("❌ Error fetching stakeholder guides:", error);
    }

    // Scan analysis-layer folders
    let analysisFiles: AnalysisFile[] = [];
    let variableContext: VariableContext | null = null;
    try {
      const selectedStudy = studies.find((s: Study) => s.id.toString() === studyId.toString());
      if (selectedStudy) {
        const resolved = await resolveStudyFromName(selectedStudy.name);
        if (resolved?.study?.path) {
          analysisFiles = await scanAnalysisFolders(resolved.study.path);
          variableContext = { projectId: resolved.projectId, studyId: resolved.studyId };
          console.log(`✅ Found ${analysisFiles.length} analysis-layer files (Load Files)`);
        }
      }
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : String(analysisError);
      console.error("⚠️ Analysis file scan failed:", message);
    }

    // Read cascade variables
    let cascadeData: CascadeData | null = null;
    try {
      if (variableContext) {
        const studyVars = await readStudyVariablesByContext(variableContext);
        if (studyVars) {
          cascadeData = buildCascadeReadiness(studyVars, currentAnalysisMethod ?? '');
          if (cascadeData) {
            console.log(`✅ Cascade: ${cascadeData.available.length} variables available, ${cascadeData.missing.length} missing`);
          }
        }
      }
    } catch (cascadeError) {
      const message = cascadeError instanceof Error ? cascadeError.message : String(cascadeError);
      console.warn('⚠️ Could not read cascade variables:', message);
    }

    const updatedModal = researchSynthesisModal(studies as Study[], studyId, sessionSummaries, transcripts, currentAnalysisMethod, stakeholderGuides, analysisFiles, cascadeData);

    if (view.private_metadata) {
      updatedModal.private_metadata = view.private_metadata;
    }

    console.log(`🚀 ~ Updating modal with ${sessionSummaries.length} summaries, ${transcripts.length} transcripts, ${analysisFiles.length} analysis files`);

    await client.views.update({
      view_id: view.id,
      view: updatedModal
    });

    console.log("✅ Files loaded and modal updated successfully");

  } catch (error) {
    console.error("🚨 Error in handleLoadSynthesisFiles:", error);
    const message = error instanceof Error ? error.message : String(error);

    try {
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `❌ Error loading files: ${message}`,
      });
    } catch (ephemeralError) {
      console.error("Failed to send error message:", ephemeralError);
    }
  }
};

// ─── Load Study Notes button handler ────────────────────────────

const handleLoadStudyNotes = async ({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    await ack();

    const view = body.view;
    if (!view || !view.state || !view.state.values) {
      throw new Error("No view state available");
    }

    const selectedStudyOption = view.state.values.study_select_block?.study_select_synthesize?.selected_option;

    if (!selectedStudyOption || selectedStudyOption.value === "no_studies") {
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `❌ Please select a study first before loading notes.`,
      });
      return;
    }

    const studyId: string = selectedStudyOption.value;
    const currentAnalysisMethod: string | null = view.state.values.analysis_method_selection?.analysis_method?.selected_option?.value || null;

    let sessionSummaries: SessionSummary[] = [];
    try {
      sessionSummaries = await sessionSummaryService.getSessionSummariesByStudyId(parseInt(studyId));
    } catch (error) {
      console.error("Error fetching session summaries:", error);
    }

    let transcripts: Transcript[] = [];
    try {
      const allStudyNotes = await studyNotesService.getStudyNotesByStudyId(parseInt(studyId));
      transcripts = allStudyNotes.map((note: { id: number; filename: string; transcript: boolean; file_path: string | null; file_url: string | null }) => ({
        id: note.id,
        filename: note.filename,
        transcript: note.transcript || false,
        file_path: note.file_path,
        file_url: note.file_url,
      }));
    } catch (error) {
      console.error("Error fetching transcripts:", error);
    }

    const studies = await getStudiesByUser(body.user.id);

    let stakeholderGuides: StakeholderGuide[] = [];
    try {
      const selectedStudy = studies.find((s: Study) => s.id.toString() === studyId.toString());
      if (selectedStudy) {
        stakeholderGuides = await getStudyStakeholderGuide(selectedStudy.id) as unknown as StakeholderGuide[];
      }
    } catch (error) {
      console.error("Error fetching stakeholder guides:", error);
    }

    const updatedModal = researchSynthesisModal(studies as Study[], studyId, sessionSummaries, transcripts, currentAnalysisMethod, stakeholderGuides, []);

    await client.views.update({
      view_id: view.id,
      view: updatedModal
    });

  } catch (error) {
    throw error;
  }
};

// ─── Submission handler ─────────────────────────────────────────

const handleResearchSynthesisSubmission = async ({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    await ack();

    const selectedStudyName: string | undefined = view.state.values.study_select_block?.study_select_synthesize?.selected_option?.text?.text;
    const selectedStudyId: string | undefined = view.state.values.study_select_block?.study_select_synthesize?.selected_option?.value;
    const analysisMethod: string | undefined = view.state.values.analysis_method_selection?.analysis_method?.selected_option?.value;

    if (selectedStudyId) await setActiveStudy(body.user.id, parseInt(selectedStudyId, 10));

    // Extract selected session summaries from all checkbox blocks
    let selectedSessionSummaries: Array<{ value: string }> = [];
    Object.keys(view.state.values).forEach(key => {
      if (key.startsWith('session_summaries_list_')) {
        const blockValues = view.state.values[key]?.session_summaries_checkboxes?.selected_options || [];
        selectedSessionSummaries = selectedSessionSummaries.concat(blockValues);
      }
    });
    if (selectedSessionSummaries.length === 0) {
      selectedSessionSummaries = view.state.values.session_summaries_list?.session_summaries_checkboxes?.selected_options || [];
    }
    const selectedSummaryIds: string[] = selectedSessionSummaries.map((opt: { value: string }) => opt.value.replace('summary_', ''));

    // Extract selected transcripts
    let selectedTranscripts: Array<{ value: string }> = [];
    Object.keys(view.state.values).forEach(key => {
      if (key.startsWith('transcripts_list_')) {
        const blockValues = view.state.values[key]?.transcripts_checkboxes?.selected_options || [];
        selectedTranscripts = selectedTranscripts.concat(blockValues);
      }
    });
    if (selectedTranscripts.length === 0) {
      selectedTranscripts = view.state.values.transcripts_list?.transcripts_checkboxes?.selected_options || [];
    }
    const selectedTranscriptIds: string[] = selectedTranscripts.map((opt: { value: string }) => opt.value.replace('transcript_', ''));

    // Extract selected stakeholder guides
    let selectedStakeholderGuides: Array<{ value: string }> = [];
    Object.keys(view.state.values).forEach(key => {
      if (key.startsWith('stakeholder_guides_list_')) {
        const blockValues = view.state.values[key]?.stakeholder_guides_checkboxes?.selected_options || [];
        selectedStakeholderGuides = selectedStakeholderGuides.concat(blockValues);
      }
    });
    if (selectedStakeholderGuides.length === 0) {
      selectedStakeholderGuides = view.state.values.stakeholder_guides_list?.stakeholder_guides_checkboxes?.selected_options || [];
    }
    const selectedStakeholderGuideIds: string[] = selectedStakeholderGuides.map((opt: { value: string }) => opt.value.replace('guide_', ''));

    // Extract context data checkboxes
    const contextDataCheckboxes = view.state.values.context_data_list?.context_data_checkboxes?.selected_options || [];
    const includeParticipantTracker: boolean = contextDataCheckboxes.some((option: { value: string }) => option.value === 'participant_tracker');
    const includeResearchPlan: boolean = contextDataCheckboxes.some((option: { value: string }) => option.value === 'research_plan');

    // Validate required fields
    if (!selectedStudyId || selectedStudyId === "no_studies") {
      throw new Error("Please select a valid research study");
    }

    if (!analysisMethod) {
      throw new Error("Please select an analysis method");
    }

    const selectedAnalysisCount: number = (view.state.values.analysis_files_list_0?.analysis_files_checkboxes?.selected_options || []).length;

    if (selectedSummaryIds.length === 0 && selectedTranscriptIds.length === 0 && selectedStakeholderGuideIds.length === 0 && selectedAnalysisCount === 0 && !includeParticipantTracker && !includeResearchPlan) {
      throw new Error("Please select at least one file or data source for analysis.");
    }

    const resolved = await resolveStudyFromName(selectedStudyName!);
    if (!resolved) throw new Error(`Study "${selectedStudyName}" not found`);
    const study = resolved.study;
    const variableContext: VariableContext = { projectId: resolved.projectId, studyId: resolved.studyId };

    // Cascade validation: synthesis methods that require upstream nuggets
    if (NUGGET_REQUIRED_METHODS.includes(analysisMethod) && study?.path) {
      try {
        const studyVars = await readStudyVariablesByContext(variableContext);
        const hasNuggetCore = studyVars?.variables?.atomic_nugget_core?.value &&
          Array.isArray(studyVars.variables.atomic_nugget_core.value) &&
          studyVars.variables.atomic_nugget_core.value.length > 0;
        if (!hasNuggetCore) {
          const methodName = analysisMethod.replace(/_/g, ' ');
          throw new TemplateContractError(
            `${methodName} requires atomic_nugget_core from session summaries`,
            analysisMethod,
            'atomic_nugget_core',
            `${methodName} requires session summaries with extracted nuggets. ` +
            'Run `/qori-analyze` on session transcripts first to build the nugget pool.',
          );
        }
      } catch (validationError) {
        if (validationError instanceof TemplateContractError) {
          throw validationError;
        }
        const message = validationError instanceof Error ? validationError.message : String(validationError);
        console.warn('⚠️ Cascade validation check failed (continuing):', message);
      }
    }

    // Fetch files based on selected checkboxes
    let allFiles: Array<Record<string, unknown>> = [];

    if (selectedSummaryIds.length > 0) {
      try {
        const allSessionSummaries: SessionSummary[] = await sessionSummaryService.getSessionSummariesByStudyId(parseInt(selectedStudyId));
        const selectedSummaries = allSessionSummaries.filter((summary: SessionSummary) =>
          selectedSummaryIds.includes(summary.id.toString())
        );
        allFiles = allFiles.concat(selectedSummaries.map((summary: SessionSummary) => ({
          ...summary,
          file_type: 'session_summary',
          file_path: summary.file_path
        })));
      } catch (error) {
        console.error("Error fetching session summaries:", error);
      }
    }

    if (selectedTranscriptIds.length > 0) {
      try {
        const allStudyNotes = await studyNotesService.getStudyNotesByStudyId(parseInt(selectedStudyId));
        const selectedNotes = allStudyNotes.filter((note: { id: number }) =>
          selectedTranscriptIds.includes(note.id.toString())
        );
        allFiles = allFiles.concat(selectedNotes.map((note: { id: number; transcript: boolean; file_path: string | null; path?: string }) => ({
          ...note,
          file_type: note.transcript ? 'transcript' : 'study_note',
          file_path: note.file_path || note.path
        })));
      } catch (error) {
        console.error("Error fetching transcripts:", error);
      }
    }

    if (selectedStakeholderGuideIds.length > 0) {
      try {
        const allStakeholderGuides: StakeholderGuide[] = await getStudyStakeholderGuide(resolved.studyId) as unknown as StakeholderGuide[];
        const selectedGuides = allStakeholderGuides.filter((guide: StakeholderGuide) =>
          selectedStakeholderGuideIds.includes(guide.id.toString())
        );
        allFiles = allFiles.concat(selectedGuides.map((guide: StakeholderGuide) => {
          let filePath: string | null = guide.path ?? null;
          if (filePath && filePath.includes('github.com')) {
            const urlMatch = filePath.match(/github\.com\/[^/]+\/[^/]+\/(?:blob|tree)\/[^/]+\/(.+)$/);
            if (urlMatch) {
              filePath = decodeURIComponent(urlMatch[1]);
            } else {
              console.warn(`⚠️ Could not extract file path from URL: ${filePath}`);
              filePath = null;
            }
          }
          return {
            ...guide,
            file_type: 'stakeholder_guide',
            file_path: filePath,
            filename: guide.file_name || filePath?.split('/').pop() || 'Unknown'
          };
        }));
      } catch (error) {
        console.error("Error fetching stakeholder guides:", error);
      }
    }

    if (includeParticipantTracker) {
      console.log("Participant tracker selected - implementation needed");
    }

    if (includeResearchPlan) {
      console.log("Research plan selected - implementation needed");
    }

    // Fetch selected analysis files
    const selectedAnalysisFiles = view.state.values.analysis_files_list_0?.analysis_files_checkboxes?.selected_options || [];
    if (selectedAnalysisFiles.length > 0) {
      const decodedStudyPath = decodeURIComponent(study!.path!);
      for (const opt of selectedAnalysisFiles) {
        const relativePath: string = opt.value.replace(/^analysis_\d+_/, '');
        const fullPath = `${decodedStudyPath}/${relativePath}`;
        allFiles.push({
          filename: relativePath.split('/').pop(),
          file_type: 'analysis',
          file_path: fullPath,
        });
      }
      console.log(`✅ Added ${selectedAnalysisFiles.length} analysis files to input`);
    }

    if (allFiles.length === 0) {
      throw new Error("No files found for the selected study. Please check if files exist for the selected study.");
    }

    // Fetch file contents from GitHub in parallel
    console.log(`🚀 ~ Fetching content for ${allFiles.length} files in parallel...`);

    const fileContentPromises = allFiles.map(async (file): Promise<FileWithContent> => {
      try {
        if (!file.file_path) {
          console.warn(`🚀 ~ No file path available for file: ${file.filename}`);
          return {
            ...file,
            filename: (file.filename as string) || 'Unknown',
            file_type: (file.file_type as string) || 'unknown',
            content: '[No file path available]',
            githubPath: null
          } as FileWithContent;
        }

        const githubFile = await fetchFileFromRepoByPath(process.env.GITHUB_REPO!, file.file_path as string);
        return {
          ...file,
          filename: (file.filename as string) || 'Unknown',
          file_type: (file.file_type as string) || 'unknown',
          content: githubFile.content || '[Content not available]',
          githubPath: file.file_path as string
        } as FileWithContent;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`🚀 ~ Error fetching file ${file.filename}:`, message);
        return {
          ...file,
          filename: (file.filename as string) || 'Unknown',
          file_type: (file.file_type as string) || 'unknown',
          content: `[Error fetching content: ${message}]`,
          githubPath: (file.file_path as string) || 'unknown'
        } as FileWithContent;
      }
    });

    const filesWithContent: FileWithContent[] = await Promise.all(fileContentPromises);
    console.log(`🚀 ~ Successfully fetched content for ${filesWithContent.length} files`);

    // Build detected_files list
    const detectedFilesList: string = filesWithContent
      .filter(f => f.file_path)
      .map(f => {
        // Extract relative path from study root
        if (f.file_path) {
          const parts = (f.file_path).split('/');
          // Return last 2-3 path segments as relative path
          return parts.slice(-3).join('/');
        }
        const parts = (f.file_path || '').split('/');
        return parts.slice(-3).join('/');
      })
      .map(f => `- ${f}`)
      .join('\n');

    const analysisData: SynthesisTemplateInput = {
      selected_study: selectedStudyName!,
      selected_session_summaries: selectedSummaryIds,
      selected_transcripts: selectedTranscriptIds,
      selected_stakeholder_guides: selectedStakeholderGuideIds,
      include_participant_tracker: includeParticipantTracker,
      include_research_plan: includeResearchPlan,
      blueprint_scope: 'end_to_end',
      researcher_contact: study?.researcher_name || study?.researcher_email || '',
      detected_files: detectedFilesList || 'No files detected',
      combined_file_content: filesWithContent.map((f: FileWithContent) => f.content).join('\n\n---\n\n')
    };

    const yamlFileName = ANALYSIS_YAML_MAPPING[analysisMethod];
    if (!yamlFileName) {
      throw new Error(`Unknown analysis method: ${analysisMethod}`);
    }

    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `Generating ${analysisMethod.replace(/_/g, ' ')} for *${selectedStudyName}*... (${filesWithContent.length} files, this may take 1-2 minutes)`,
    });

    try {
      const yamlTemplateFile = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, yamlFileName);
      const renderedAnalysis = await processYamlTemplate(yamlTemplateFile.content, analysisData, study?.path ?? '', '', false, variableContext);
      console.log(`✅ Synthesis complete: ${renderedAnalysis.outputTemplate?.length || 0} chars`);

      const outputLines: string[] = renderedAnalysis.outputTemplate.split('\n').filter((line: string) => line.trim());
      const firstTwoLines: string = outputLines.slice(0, 2).join('\n');

      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `*Research Synthesis Complete!*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Research Synthesis Complete!*\n\n*Study:* ${selectedStudyName}\n*Method:* ${analysisMethod}\n*Files Analyzed:* ${filesWithContent.length} files\n• Session Summaries: ${filesWithContent.filter(f => f.file_type === 'session_summary').length}\n• Transcripts: ${filesWithContent.filter(f => f.file_type === 'transcript' || f.file_type === 'study_note').length}\n• Stakeholder Guides: ${filesWithContent.filter(f => f.file_type === 'stakeholder_guide').length}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `<${renderedAnalysis.result.url}|:github: View on GitHub>`,
            },
          },
          { type: 'divider' },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Next:* Run \`/qori-report\` to generate the research readout.`,
            },
          },
        ],
      });

      if (study?.channel_name) {
        await client.chat.postMessage({
          channel: study.channel_name,
          text: `*Research Synthesis Complete!*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: firstTwoLines,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Study:* ${selectedStudyName}\n*Method:* ${analysisMethod}\n*Files Analyzed:* ${filesWithContent.length} files`,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `To see the complete synthesis and detailed insights, please visit:\n<${renderedAnalysis.result.url}|:github: View Full Analysis on GitHub>`,
              },
            },
          ],
        });
      }

      // Track extraction in background
      if (renderedAnalysis.extractionPromise) {
        renderedAnalysis.extractionPromise.then(async (extractResult: { success: boolean; variableCount?: number; keys?: string[]; error?: string }) => {
          try {
            if (extractResult.success) {
              await client.chat.postEphemeral({
                channel: body.user.id,
                user: body.user.id,
                text: `Cascade variables extracted: ${extractResult.variableCount} items (${extractResult.keys!.join(', ')}). Downstream templates can now consume this data.`,
              });
            } else {
              await client.chat.postEphemeral({
                channel: body.user.id,
                user: body.user.id,
                text: `Warning: Variable extraction failed — ${extractResult.error}. The document was saved but cascade variables were not updated.`,
              });
            }
          } catch (msgErr) {
            const message = msgErr instanceof Error ? msgErr.message : String(msgErr);
            console.error('Failed to send extraction status message:', message);
          }
        });
      }

    } catch (error) {
      const errObj = error instanceof Error ? error : new Error(String(error));
      console.error(`❌ Synthesis failed [${yamlFileName}]: ${errObj.message}`);
      if (errObj.stack) console.error(errObj.stack.split('\n').slice(0, 5).join('\n'));

      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `*Synthesis failed*\n\n*Study:* ${selectedStudyName}\n*Method:* ${analysisMethod}\n*Error:* ${errObj.message}\n\nPlease try again or contact support.`,
      });
    }

  } catch (error) {
    console.error("Error handling research synthesis submission:", error);
    const message = error instanceof Error ? error.message : String(error);

    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `❌ Error: ${message}`,
    });
  }
};

export {
  researchSynthesisHandler,
  handleResearchSynthesisSubmission,
  handleStudySelectionChange,
  handleFileCheckboxChange,
  handleLoadStudyNotes,
  handleLoadSynthesisFiles
};
