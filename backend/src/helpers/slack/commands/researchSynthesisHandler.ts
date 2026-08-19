/**
 * researchSynthesisHandler.ts — /qori-synthesis command and modal handlers
 *
 * ADR 0018: Cascade-aware synthesis modal
 * - Synthesis reads structured variables from the variable store
 * - File picker removed; session/nugget stats displayed instead
 * - Raw content kept as context alongside structured cascade vars
 * - Service blueprint excluded (stays on legacy flow)
 *
 * PLAT-3: Application service is the ONLY business path.
 * Legacy fallback removed — buildSlackApplicationContext failure
 * is a hard stop (fail closed).
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';
import { buildSlackApplicationContext } from '../../../middleware/auth/slackContextBridge';
import { executeSynthesis, type SynthesisInput } from '../../../application/synthesis.app-service';

import { researchSynthesisModal, type SynthesisCascadeData, type SessionDataStats, type AvailableEnrichment, type SynthesisModalMetadata } from "../ui/researchSynthesisModal";
import { getStudiesByUser, resolveStudyFromName } from "../../../services/research_study.service";
import { getActiveStudy, setActiveStudy } from "../../../services/slack-user-state.service";
import { readStudyVariablesByContext, type VariableContext } from '../../studyVariables';
import { TEMPLATE_CONSUMES } from "../ui/cascadeReadinessBlocks";
import { assertStudyAccess } from '../../../services/authorization.service';

// ─── Types ──────────────────────────────────────────────────────

interface Study {
  id: number;
  name: string;
  path?: string | null;
  channel_name?: string | null;
  researcher_name?: string | null;
  researcher_email?: string | null;
}

// ─── Constants ──────────────────────────────────────────────────

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

    // ── PLAT-3: Application service is the ONLY path ──
    const ctx = await buildSlackApplicationContext(body.user.id, (body as any).team?.id || '');

    if (!ctx) {
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Unable to resolve your identity. Please contact your administrator to ensure your workspace is configured.',
      });
      return;
    }

    const synthesisInput: SynthesisInput = {
      studyId: resolved.studyId,
      projectId: resolved.projectId,
      studyName: selectedStudyName!,
      studyPath: study?.path ?? '',
      analysisMethod,
      createdByActorId: String(ctx.actor.id),
    };

    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `Generating ${analysisMethod.replace(/_/g, ' ')} for *${selectedStudyName}*...\n\n_This may take 1-2 minutes._`,
    });

    try {
      const result = await executeSynthesis(ctx, synthesisInput);

      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `*Research Synthesis Complete!*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Research Synthesis Complete!*\n\n*Study:* ${selectedStudyName}\n*Method:* ${analysisMethod.replace(/_/g, ' ')}\n*Cascade variables:* ${result.cascadeVariableCount}\n*Session files:* ${result.sessionFileCount}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `<${result.url}|View on GitHub>`,
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

      console.log(`✅ Synthesis created via app service for study: ${selectedStudyName}`);
    } catch (error) {
      const errObj = error instanceof Error ? error : new Error(String(error));
      console.error(`❌ Synthesis app service failed: ${errObj.message}`);

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
