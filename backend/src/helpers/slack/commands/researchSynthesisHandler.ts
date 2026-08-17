/**
 * researchSynthesisHandler.ts — /qori-synthesis command and modal handlers
 *
 * ADR 0018: Cascade-aware synthesis modal
 * - Synthesis reads structured variables from the variable store
 * - File picker removed; session/nugget stats displayed instead
 * - Raw content kept as context alongside structured cascade vars
 * - Service blueprint excluded (stays on legacy flow)
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';
import { TemplateContractError } from '../../../types/handlers';

import { researchSynthesisModal, type SynthesisCascadeData, type SessionDataStats, type AvailableEnrichment, type SynthesisModalMetadata } from "../ui/researchSynthesisModal";
import { getStudiesByUser, resolveStudyFromName } from "../../../services/research_study.service";
import { getActiveStudy, setActiveStudy } from "../../../services/slack-user-state.service";
import sessionSummaryService from "../../../services/session-summary.service";
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepoByPath, fetchFileFromRepo } from "../../../helpers/github";
import { processYamlTemplate } from "../../../helpers/yamlProcessor";
import { readStudyVariablesByContext, readUpstreamVariablesByContext, type VariableContext, type ConsumeSpec, type UpstreamVariables } from '../../studyVariables';
import { TEMPLATE_CONSUMES } from "../ui/cascadeReadinessBlocks";
import { assertStudyAccess } from '../../../services/authorization.service';
import { createSynthesizedConstructs, type SynthesizedConstructInput } from '../../../services/synthesis-evidence.service';
import { enrichProjectionWithEvidenceRefs } from '../../../services/projection-enrichment.service';
import { getDefaultModelName } from '../../modelProvider';
import sequelize from '../../../database';

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
  participant_id?: string;
  created_at?: Date;
}

interface FileWithContent {
  filename: string;
  file_type: string;
  file_path: string | null;
  content: string;
  githubPath: string | null;
}

// ─── Constants ──────────────────────────────────────────────────

const ANALYSIS_YAML_MAPPING: Record<string, string> = {
  'affinity_mapping': 'affinity_mapping.yaml',
  'journey_mapping': 'journey_mapping.yaml',
  'persona_generation': 'persona_generator.yaml',
  'jobs_to_be_done': 'jobs_to_be_done.yaml',
  'usability_issues': 'usability_issues_extractor.yaml',
  'design_opportunities': 'design_opportunity_generator.yaml',
  // service_blueprint excluded per ADR 0018
};

// Enrichment variable labels for display
const ENRICHMENT_LABELS: Record<string, string> = {
  validated_themes: 'Validated themes',
  target_barriers: 'Target barriers',
  research_questions: 'Research questions',
  personas: 'Personas',
  participant_metadata: 'Participant metadata',
  stakeholder_constraints: 'Stakeholder constraints',
  validated_jobs: 'Jobs to be done',
};

// ─── Helper: Build session data stats ────────────────────────────

async function buildSessionDataStats(variableContext: VariableContext): Promise<SessionDataStats | null> {
  try {
    const studyVars = await readStudyVariablesByContext(variableContext);
    const nuggetCore = studyVars?.variables?.atomic_nugget_core;

    if (!nuggetCore || !nuggetCore.value || !Array.isArray(nuggetCore.value) || nuggetCore.value.length === 0) {
      return null;
    }

    const nuggets = nuggetCore.value as Array<{ participant?: string; participant_id?: string; session?: string }>;

    // Group by participant
    const participantMap = new Map<string, { count: number; session?: string }>();
    for (const nugget of nuggets) {
      const participantId = nugget.participant || nugget.participant_id || 'unknown';
      const existing = participantMap.get(participantId) || { count: 0 };
      existing.count++;
      if (nugget.session && !existing.session) {
        existing.session = nugget.session;
      }
      participantMap.set(participantId, existing);
    }

    const participantBreakdown = Array.from(participantMap.entries())
      .map(([participantId, data]) => ({
        participantId,
        nuggetCount: data.count,
        sessionDate: data.session,
      }))
      .sort((a, b) => a.participantId.localeCompare(b.participantId));

    return {
      totalSessions: participantBreakdown.length,
      totalNuggets: nuggets.length,
      participantBreakdown,
    };
  } catch (error) {
    console.error('Failed to build session data stats:', error);
    return null;
  }
}

// ─── Helper: Build available enrichments ─────────────────────────

async function buildAvailableEnrichments(
  variableContext: VariableContext,
  analysisMethod: string
): Promise<AvailableEnrichment[]> {
  const enrichments: AvailableEnrichment[] = [];
  const consumesSpec = TEMPLATE_CONSUMES[analysisMethod];
  if (!consumesSpec) return enrichments;

  try {
    const studyVars = await readStudyVariablesByContext(variableContext);
    if (!studyVars?.variables) return enrichments;

    // Find optional variables that are available
    for (const spec of consumesSpec) {
      // Skip required vars (nugget_core, nugget_detail) — they're shown in session stats
      if (spec.required) continue;
      // Skip if key is nugget-related — already shown in session stats
      if (spec.key.includes('atomic_nugget')) continue;

      const variable = studyVars.variables[spec.key];
      if (variable && variable.value) {
        const count = Array.isArray(variable.value) ? variable.value.length : 1;
        enrichments.push({
          key: spec.key,
          label: ENRICHMENT_LABELS[spec.key] || spec.label || spec.key,
          count,
          source: variable.source?.template || 'unknown',
          sourceDate: variable.source?.date,
        });
      }
    }
  } catch (error) {
    console.error('Failed to build available enrichments:', error);
  }

  return enrichments;
}

// ─── Helper: Build cascade data for modal ────────────────────────

async function buildSynthesisCascadeData(
  variableContext: VariableContext,
  analysisMethod: string
): Promise<SynthesisCascadeData> {
  const sessionStats = await buildSessionDataStats(variableContext);
  const enrichments = await buildAvailableEnrichments(variableContext, analysisMethod);

  // Check for missing required variables
  const missingRequired: Array<{ key: string; label: string; hint: string }> = [];
  const consumesSpec = TEMPLATE_CONSUMES[analysisMethod];

  if (consumesSpec) {
    try {
      const studyVars = await readStudyVariablesByContext(variableContext);
      for (const spec of consumesSpec) {
        if (spec.required) {
          const variable = studyVars?.variables?.[spec.key];
          const hasValue = variable && variable.value &&
            (Array.isArray(variable.value) ? variable.value.length > 0 : true);
          if (!hasValue) {
            missingRequired.push({
              key: spec.key,
              label: spec.label,
              hint: spec.source_hint,
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to check missing required:', error);
    }
  }

  // Ready to run if we have session stats and no missing required
  const readyToRun = sessionStats !== null && sessionStats.totalNuggets > 0 && missingRequired.length === 0;

  return {
    sessionStats,
    enrichments,
    missingRequired,
    readyToRun,
  };
}

// ─── Helper: Build detected files list from DB ───────────────────

async function buildDetectedFilesList(studyId: number): Promise<string> {
  try {
    const sessionSummaries = await sessionSummaryService.getSessionSummariesByStudyId(studyId);
    if (!sessionSummaries || sessionSummaries.length === 0) {
      return 'No session files detected';
    }

    return sessionSummaries
      .filter((s: SessionSummary) => s.file_path)
      .map((s: SessionSummary) => {
        const parts = (s.file_path || '').split('/');
        return `- ${parts.slice(-3).join('/')}`;
      })
      .join('\n');
  } catch (error) {
    console.error('Failed to build detected files list:', error);
    return 'Error loading file list';
  }
}

// ─── Helper: Build raw content from session summaries ────────────

async function buildCombinedFileContent(studyId: number): Promise<{ content: string; files: FileWithContent[] }> {
  const files: FileWithContent[] = [];

  try {
    const sessionSummaries = await sessionSummaryService.getSessionSummariesByStudyId(studyId);
    if (!sessionSummaries || sessionSummaries.length === 0) {
      return { content: '', files: [] };
    }

    // Fetch content for all session summaries in parallel
    const contentPromises = sessionSummaries
      .filter((s: SessionSummary) => s.file_path)
      .map(async (summary: SessionSummary): Promise<FileWithContent> => {
        try {
          const githubFile = await fetchFileFromRepoByPath(process.env.GITHUB_REPO!, summary.file_path!);
          return {
            filename: summary.filename,
            file_type: 'session_summary',
            file_path: summary.file_path,
            content: githubFile.content || '[Content not available]',
            githubPath: summary.file_path,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Error fetching file ${summary.filename}:`, message);
          return {
            filename: summary.filename,
            file_type: 'session_summary',
            file_path: summary.file_path,
            content: `[Error fetching content: ${message}]`,
            githubPath: summary.file_path,
          };
        }
      });

    const fetchedFiles = await Promise.all(contentPromises);
    files.push(...fetchedFiles);

    const content = fetchedFiles.map(f => f.content).join('\n\n---\n\n');
    return { content, files };
  } catch (error) {
    console.error('Failed to build combined file content:', error);
    return { content: '', files: [] };
  }
}

// ─── Command handler ────────────────────────────────────────────

const researchSynthesisHandler = async ({ ack, body, client }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> => {
  try {
    await ack();

    const studies = await getStudiesByUser(body.user_id);
    const activeStudyId: number | null = await getActiveStudy(body.user_id);
    const activeStudy = activeStudyId ? studies.find((s: Study) => s.id === activeStudyId) : null;

    // If we have an active study, build cascade data
    let cascadeData: SynthesisCascadeData | null = null;
    if (activeStudy) {
      const resolved = await resolveStudyFromName(activeStudy.name);
      if (resolved) {
        const variableContext: VariableContext = { projectId: resolved.projectId, studyId: resolved.studyId };
        cascadeData = await buildSynthesisCascadeData(variableContext, 'affinity_mapping');
      }
    }

    await client.views.open({
      trigger_id: body.trigger_id,
      view: researchSynthesisModal(studies as Study[], activeStudy?.id ?? null, 'affinity_mapping', cascadeData)
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
    await ack();

    const view = body.view;
    if (!view || !view.state || !view.state.values) {
      console.error("🚨 No view state available");
      return;
    }

    const selectedStudyOption = view.state.values.study_select_block?.study_select_synthesize?.selected_option;

    if (!selectedStudyOption || selectedStudyOption.value === "no_studies") {
      const studies = await getStudiesByUser(body.user.id);
      await client.views.update({
        view_id: view.id,
        view: researchSynthesisModal(studies as Study[], null, null, null)
      });
      return;
    }

    const studyId: string = selectedStudyOption.value;
    const studyName: string = selectedStudyOption.text.text;
    const currentAnalysisMethod: string | null = view.state.values.analysis_method_selection?.analysis_method?.selected_option?.value || 'affinity_mapping';


    const studies = await getStudiesByUser(body.user.id);
    const selectedStudy = studies.find((s: Study) => s.id.toString() === studyId.toString());

    // Build cascade data for the selected study
    let cascadeData: SynthesisCascadeData | null = null;
    if (selectedStudy) {
      const resolved = await resolveStudyFromName(selectedStudy.name);
      if (resolved) {
        const variableContext: VariableContext = { projectId: resolved.projectId, studyId: resolved.studyId };
        cascadeData = await buildSynthesisCascadeData(variableContext, currentAnalysisMethod || 'affinity_mapping');
        console.log(`✅ Cascade data: ${cascadeData.sessionStats?.totalSessions || 0} sessions, ${cascadeData.sessionStats?.totalNuggets || 0} nuggets, ${cascadeData.enrichments.length} enrichments`);
      }
    }

    await client.views.update({
      view_id: view.id,
      view: researchSynthesisModal(studies as Study[], studyId, currentAnalysisMethod, cascadeData)
    });

    console.log("✅ Modal updated with cascade data");

  } catch (error) {
    console.error("🚨 Error in handleStudySelectionChange:", error);
    const message = error instanceof Error ? error.message : String(error);

    try {
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `❌ Error loading study data: ${message}`,
      });
    } catch (ephemeralError) {
      console.error("Failed to send error message:", ephemeralError);
    }
  }
};

// ─── Analysis method change handler ──────────────────────────────

const handleAnalysisMethodChange = async ({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    await ack();

    const view = body.view;
    if (!view || !view.state || !view.state.values) {
      return;
    }

    const selectedStudyOption = view.state.values.study_select_block?.study_select_synthesize?.selected_option;
    const studyId = selectedStudyOption?.value;
    const newAnalysisMethod: string | null = view.state.values.analysis_method_selection?.analysis_method?.selected_option?.value || null;

    if (!studyId || studyId === "no_studies" || !newAnalysisMethod) {
      return;
    }

    const studies = await getStudiesByUser(body.user.id);
    const selectedStudy = studies.find((s: Study) => s.id.toString() === studyId.toString());

    // Rebuild cascade data for the new method
    let cascadeData: SynthesisCascadeData | null = null;
    if (selectedStudy) {
      const resolved = await resolveStudyFromName(selectedStudy.name);
      if (resolved) {
        const variableContext: VariableContext = { projectId: resolved.projectId, studyId: resolved.studyId };
        cascadeData = await buildSynthesisCascadeData(variableContext, newAnalysisMethod);
      }
    }

    await client.views.update({
      view_id: view.id,
      view: researchSynthesisModal(studies as Study[], studyId, newAnalysisMethod, cascadeData)
    });

  } catch (error) {
    console.error("Error in handleAnalysisMethodChange:", error);
  }
};

// ─── Submission handler ─────────────────────────────────────────

const handleResearchSynthesisSubmission = async ({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    await ack();

    const selectedStudyName: string | undefined = view.state.values.study_select_block?.study_select_synthesize?.selected_option?.text?.text;
    const selectedStudyId: string | undefined = view.state.values.study_select_block?.study_select_synthesize?.selected_option?.value;
    const analysisMethod: string | undefined = view.state.values.analysis_method_selection?.analysis_method?.selected_option?.value;

    // Validate required fields
    if (!selectedStudyId || selectedStudyId === "no_studies") {
      throw new Error("Please select a valid research study");
    }

    // Authorization check: verify user has access to this study (ADR 0024)
    await assertStudyAccess(body.user.id, parseInt(selectedStudyId, 10), client);

    if (!analysisMethod) {
      throw new Error("Please select an analysis method");
    }

    if (selectedStudyId) await setActiveStudy(body.user.id, parseInt(selectedStudyId, 10));

    const resolved = await resolveStudyFromName(selectedStudyName!);
    if (!resolved) throw new Error(`Study "${selectedStudyName}" not found`);
    const study = resolved.study;
    const variableContext: VariableContext = { projectId: resolved.projectId, studyId: resolved.studyId };

    // ─── CASCADE CONTRACT VALIDATION ─────────────────────────────────
    // ADR 0018: Cascade-aware synthesis requires atomic_nugget_core/detail

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

    // ─── BUILD CONSUMES SPEC ─────────────────────────────────────────
    // ADR 0018 amendment: All enrichments always included when available (no opt-out)

    const templateConsumes = TEMPLATE_CONSUMES[analysisMethod] || [];
    const consumesSpec: ConsumeSpec[] = templateConsumes.map(spec => ({
      key: spec.key,
      required: spec.required,
      source: spec.source_hint?.includes('brief') ? 'research_brief' :
              spec.source_hint?.includes('affinity') ? 'affinity_mapping' :
              spec.source_hint?.includes('persona') ? 'persona_generator' :
              spec.source_hint?.includes('stakeholder') ? 'stakeholder_synthesis' :
              'session_summary',
    }));

    // ─── LOAD STRUCTURED CASCADE VARIABLES ───────────────────────────
    // ADR 0018: The real wiring — read from variable store

    const upstreamVars: UpstreamVariables = await readUpstreamVariablesByContext(variableContext, consumesSpec);
    console.log(`✅ Loaded ${Object.keys(upstreamVars).length} cascade variables: ${Object.keys(upstreamVars).join(', ')}`);

    // ─── BUILD RAW CONTENT AS CONTEXT ────────────────────────────────
    // Keep raw content alongside structured vars (ADR 0018)

    const { content: rawCombinedContent, files } = await buildCombinedFileContent(parseInt(selectedStudyId));
    const detectedFiles = await buildDetectedFilesList(parseInt(selectedStudyId));

    // Privacy gate: authorize fetched content before model access (PH-3 / ADR 0035).
    // Session files are Qori-generated artifacts — TRUSTED_CURATED_ARTIFACT policy.
    const { authorizeForModel } = require('../../../services/content-governance.service');
    const privacyResult = authorizeForModel(
      rawCombinedContent,
      'TRUSTED_CURATED_ARTIFACT',
      { isQoriArtifact: true, upstreamPrivacyComplete: true, sourceId: `synthesis:${selectedStudyName}` },
    );
    const combinedFileContent = privacyResult.modelSafeContent ?? rawCombinedContent;

    console.log(`✅ Loaded ${files.length} session files as raw context (privacy: ${privacyResult.policy})`);

    // ─── BUILD TEMPLATE INPUT ────────────────────────────────────────

    const analysisData = {
      selected_study: selectedStudyName!,
      researcher_contact: study?.researcher_name || study?.researcher_email || '',
      detected_files: detectedFiles,
      combined_file_content: combinedFileContent,
      // Structured cascade vars are injected by yamlProcessor via variableContext
    };

    const yamlFileName = ANALYSIS_YAML_MAPPING[analysisMethod];
    if (!yamlFileName) {
      throw new Error(`Unknown analysis method: ${analysisMethod}`);
    }

    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `Generating ${analysisMethod.replace(/_/g, ' ')} for *${selectedStudyName}*...\n• ${Object.keys(upstreamVars).length} cascade variables loaded\n• ${files.length} session files as context\n\n_This may take 1-2 minutes._`,
    });

    try {
      const yamlTemplateFile = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, yamlFileName);
      const renderedAnalysis = await processYamlTemplate(yamlTemplateFile.content, analysisData, study?.path ?? '', '', false, variableContext);
      console.log(`✅ Synthesis complete: ${renderedAnalysis.outputTemplate?.length || 0} chars`);

      // CRITICAL: Await extraction to ensure cascade variables are committed before returning success.
      // Without this, downstream modals (readout) may read stale data. See ADR 0019.
      if (renderedAnalysis.extractionPromise) {
        const extractResult = await renderedAnalysis.extractionPromise;
        if (!extractResult.success) {
          throw new Error(`Cascade variable extraction failed: ${extractResult.error}. Document was saved but variables were not written.`);
        }
        console.log(`✅ Cascade variables committed: ${extractResult.variableCount} items (${extractResult.keys?.join(', ')})`);

        // PH-5B: Create canonical evidence constructs for synthesized themes.
        // Only for affinity_mapping — other synthesis types will be added as their
        // lineage contracts are implemented.
        if (analysisMethod === 'affinity_mapping' && extractResult.keys?.includes('validated_themes')) {
          try {
            const resolvedStudyId = parseInt(selectedStudyId);
            const vars = await readStudyVariablesByContext({ projectId: resolved.projectId, studyId: resolvedStudyId });
            const themes = vars.variables?.validated_themes;

            // Load upstream nugget evidence constructs for this study
            const EvidenceConstructModel = sequelize.models.EvidenceConstruct;
            const nuggetConstructs = await EvidenceConstructModel.findAll({
              where: { study_id: resolvedStudyId, construct_type: 'nugget' },
            });
            const nuggetPublicIds = new Set(
              nuggetConstructs.map(c => (c as unknown as { public_id: string }).public_id),
            );
            // Build display_id → public_id map for reference resolution
            const displayToPublicId = new Map(
              nuggetConstructs.map(c => [(c as unknown as { label: string }).label, (c as unknown as { public_id: string }).public_id]),
            );

            if (Array.isArray(themes) && themes.length > 0 && nuggetPublicIds.size > 0) {
              // Resolve evidence IDs: prefer explicit supporting_evidence_ids,
              // fall back to translating supporting_nuggets display IDs
              const themeItems: SynthesizedConstructInput[] = themes.map((t: Record<string, unknown>) => {
                let evidenceIds: string[] = [];
                if (Array.isArray(t.supporting_evidence_ids) && t.supporting_evidence_ids.length > 0) {
                  evidenceIds = t.supporting_evidence_ids as string[];
                } else if (Array.isArray(t.supporting_nuggets)) {
                  // Translate display IDs to canonical public_ids
                  evidenceIds = (t.supporting_nuggets as string[])
                    .map(displayId => displayToPublicId.get(displayId))
                    .filter((id): id is string => id !== undefined);
                }
                return {
                  displayId: (t.id as string) || 'theme-unknown',
                  label: (t.theme_name as string) || (t.id as string) || '',
                  payload: t,
                  proposedEvidenceIds: evidenceIds,
                };
              });

              const result = await createSynthesizedConstructs(themeItems, {
                projectId: resolved.projectId,
                studyId: resolvedStudyId,
                constructType: 'theme',
                upstreamConstructType: 'nugget',
                relationshipType: 'SYNTHESIZED_FROM',
                suppliedEvidenceIds: nuggetPublicIds,
                cascadeVariableKey: 'validated_themes',
                templateId: 'affinity_mapping',
                templateVersion: 'v7.1',
                modelName: getDefaultModelName(),
                createdBy: body.user.id,
              });

              if (result.created.length > 0) {
                console.log(`✅ Evidence lineage: ${result.created.length} theme constructs with canonical nugget refs`);
                // PH-5C: Enrich cascade projection with canonical refs
                const enriched = await enrichProjectionWithEvidenceRefs(
                  resolved.projectId, resolvedStudyId, 'validated_themes', result.created,
                );
                if (enriched > 0) {
                  console.log(`✅ Projection enriched: ${enriched} validated_themes items carry evidence_construct_ref`);
                }
              }
              if (result.rejected.length > 0) {
                console.warn(`⚠️ Evidence lineage: ${result.rejected.length} themes rejected (invalid refs): ${result.rejected.map(r => r.displayId).join(', ')}`);
              }
            } else if (nuggetPublicIds.size === 0) {
              console.log('ℹ️ No canonical nugget constructs found — skipping theme evidence lineage (PH-5A not yet run for this study)');
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`⚠️ Theme evidence construct creation failed (non-blocking): ${message}`);
          }
        }
      }

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
              text: `*Research Synthesis Complete!*\n\n*Study:* ${selectedStudyName}\n*Method:* ${analysisMethod.replace(/_/g, ' ')}\n*Cascade variables:* ${Object.keys(upstreamVars).length}\n*Session files:* ${files.length}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `<${renderedAnalysis.result.url}|View on GitHub>`,
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

      // Channel notification removed — DM notification above is sufficient

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

// ─── Legacy handlers (removed) ───────────────────────────────────
// File checkbox and load files handlers removed per ADR 0018
// Service blueprint uses legacy flow and is excluded from modal

export {
  researchSynthesisHandler,
  handleResearchSynthesisSubmission,
  handleStudySelectionChange,
  handleAnalysisMethodChange,
  buildSessionDataStats,
  buildAvailableEnrichments,
  buildSynthesisCascadeData,
};
