/**
 * Synthesis Application Service — PLAT-3
 *
 * Extracted from researchSynthesisHandler.ts
 * Orchestrates research synthesis: cascade variable loading, content
 * aggregation, privacy gating, YAML template processing, evidence
 * construct creation (themes), and canonical reference building.
 */

import type { ApplicationContext } from '../types/application-context';
import { TemplateContractError } from '../types/handlers';
import { assertStudyAccessByActor } from '../services/authorization.service';
import { resolveStudyFromName } from '../services/research_study.service';
import sessionSummaryService from '../services/session-summary.service';
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepoByPath, fetchFileFromRepo } from '../helpers/github';
import {
  readStudyVariablesByContext,
  readUpstreamVariablesByContext,
  type VariableContext,
  type ConsumeSpec,
  type UpstreamVariables,
} from '../helpers/studyVariables';
import { TEMPLATE_CONSUMES } from '../helpers/slack/ui/cascadeReadinessBlocks';
import { createSynthesizedConstructs, type SynthesizedConstructInput } from '../services/synthesis-evidence.service';
import { enrichProjectionWithEvidenceRefs } from '../services/projection-enrichment.service';
import { attachEvidenceRefsVerified } from '../services/artifact.service';
import { buildCanonicalReferenceSection, type CanonicalRefItem } from '../services/deep-link.service';
import { getDefaultModelName } from '../helpers/modelProvider';
import sequelize from '../database';

// ─── Input/Output Types ──────────────────────────────────────────

export interface SynthesisInput {
  /** Study to synthesize */
  studyId: number;
  projectId: number;
  studyName: string;
  studyPath: string;

  /** Analysis method (affinity_mapping, journey_mapping, etc.) */
  analysisMethod: string;

  /** Actor info */
  createdByActorId: string;
}

export interface SynthesisResult {
  /** URL of the generated synthesis on GitHub */
  url: string;
  filePath: string;
  /** Cascade variables loaded count */
  cascadeVariableCount: number;
  /** Session files used as context */
  sessionFileCount: number;
  /** Cascade extraction outcome */
  extractionSuccess: boolean;
  extractionVariableCount: number;
  /** Evidence lineage */
  themeConstructCount: number;
}

// ─── Constants ──────────────────────────────────────────────────

const ANALYSIS_YAML_MAPPING: Record<string, string> = {
  affinity_mapping: 'affinity_mapping.yaml',
  journey_mapping: 'journey_mapping.yaml',
  persona_generation: 'persona_generator.yaml',
  jobs_to_be_done: 'jobs_to_be_done.yaml',
  usability_issues: 'usability_issues_extractor.yaml',
  design_opportunities: 'design_opportunity_generator.yaml',
};

// ─── Helpers ────────────────────────────────────────────────────

interface FileWithContent {
  filename: string;
  content: string;
}

async function buildCombinedFileContent(studyId: number): Promise<{ content: string; files: FileWithContent[] }> {
  const files: FileWithContent[] = [];

  try {
    const sessionSummaries = await sessionSummaryService.getSessionSummariesByStudyId(studyId);
    if (!sessionSummaries || sessionSummaries.length === 0) {
      return { content: '', files: [] };
    }

    const contentPromises = sessionSummaries
      .filter((s: { file_path: string | null }) => s.file_path)
      .map(async (summary: { filename: string; file_path: string | null }): Promise<FileWithContent> => {
        try {
          const githubFile = await fetchFileFromRepoByPath(process.env.GITHUB_REPO!, summary.file_path!);
          return { filename: summary.filename, content: (githubFile as { content: string }).content || '[Content not available]' };
        } catch {
          return { filename: summary.filename, content: '[Error fetching content]' };
        }
      });

    const fetchedFiles = await Promise.all(contentPromises);
    files.push(...fetchedFiles);

    const content = fetchedFiles.map(f => f.content).join('\n\n---\n\n');
    return { content, files };
  } catch {
    return { content: '', files: [] };
  }
}

async function buildDetectedFilesList(studyId: number): Promise<string> {
  try {
    const sessionSummaries = await sessionSummaryService.getSessionSummariesByStudyId(studyId);
    if (!sessionSummaries || sessionSummaries.length === 0) {
      return 'No session files detected';
    }
    return sessionSummaries
      .filter((s: { file_path: string | null }) => s.file_path)
      .map((s: { file_path: string | null }) => {
        const parts = (s.file_path || '').split('/');
        return `- ${parts.slice(-3).join('/')}`;
      })
      .join('\n');
  } catch {
    return 'Error loading file list';
  }
}

// ─── Main Orchestration ─────────────────────────────────────────

export async function executeSynthesis(
  ctx: ApplicationContext,
  input: SynthesisInput,
): Promise<SynthesisResult> {
  // Authorization
  await assertStudyAccessByActor(ctx.actor.id, input.studyId, ctx.organization.id);

  const variableContext: VariableContext = { projectId: input.projectId, studyId: input.studyId };

  // Validate cascade contract
  const studyVars = await readStudyVariablesByContext(variableContext);
  const hasNuggetCore = studyVars?.variables?.atomic_nugget_core?.value &&
    Array.isArray(studyVars.variables.atomic_nugget_core.value) &&
    studyVars.variables.atomic_nugget_core.value.length > 0;

  if (!hasNuggetCore) {
    const methodName = input.analysisMethod.replace(/_/g, ' ');
    throw new TemplateContractError(
      `${methodName} requires atomic_nugget_core from session summaries`,
      input.analysisMethod,
      'atomic_nugget_core',
      `${methodName} requires session summaries with extracted nuggets. Run analysis on session transcripts first.`,
    );
  }

  // Build consumes spec
  const templateConsumes = TEMPLATE_CONSUMES[input.analysisMethod] || [];
  const consumesSpec: ConsumeSpec[] = templateConsumes.map(spec => ({
    key: spec.key,
    required: spec.required,
    source: spec.source_hint?.includes('brief') ? 'research_brief' :
            spec.source_hint?.includes('affinity') ? 'affinity_mapping' :
            spec.source_hint?.includes('persona') ? 'persona_generator' :
            spec.source_hint?.includes('stakeholder') ? 'stakeholder_synthesis' :
            'session_summary',
  }));

  // Load structured cascade variables
  const upstreamVars: UpstreamVariables = await readUpstreamVariablesByContext(variableContext, consumesSpec);

  // Build raw content as context
  const { content: rawCombinedContent, files } = await buildCombinedFileContent(input.studyId);
  const detectedFiles = await buildDetectedFilesList(input.studyId);

  // Privacy gate
  const { authorizeForModel } = require('../services/content-governance.service');
  const privacyResult = authorizeForModel(
    rawCombinedContent,
    'TRUSTED_CURATED_ARTIFACT',
    { isQoriArtifact: true, upstreamPrivacyComplete: true, sourceId: `synthesis:${input.studyName}` },
  );
  const combinedFileContent = privacyResult.modelSafeContent ?? rawCombinedContent;

  // Compute canonical upstream inputs
  const EvidenceConstructModel = sequelize.models.EvidenceConstruct;
  let canonicalUpstreamInputs: string[] = [];
  try {
    const nuggetConstructs = await EvidenceConstructModel.findAll({
      where: { study_id: input.studyId, construct_type: 'nugget' },
      attributes: ['public_id'],
    });
    canonicalUpstreamInputs = nuggetConstructs.map(
      (c: unknown) => (c as { public_id: string }).public_id,
    );
  } catch { /* fallback to empty */ }

  // Build template input
  const analysisData: Record<string, unknown> = {
    selected_study: input.studyName,
    researcher_contact: '',
    detected_files: detectedFiles,
    combined_file_content: combinedFileContent,
    __artifactContext: {
      projectId: input.projectId,
      studyId: input.studyId,
      artifactType: 'synthesis',
      title: `${input.analysisMethod.replace(/_/g, ' ')} — ${input.studyName}`,
      canonicalUpstreamInputs,
      createdBy: input.createdByActorId,
    },
  };

  const yamlFileName = ANALYSIS_YAML_MAPPING[input.analysisMethod];
  if (!yamlFileName) {
    throw new Error(`Unknown analysis method: ${input.analysisMethod}`);
  }

  const yamlTemplateFile = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, yamlFileName);

  // Prepare/finalize flow
  const { prepareYamlTemplate, finalizeArtifactWrite } = require('../helpers/yamlProcessor');
  const prepared = await prepareYamlTemplate(
    yamlTemplateFile.content, analysisData, input.studyPath, '', variableContext,
  );

  if (!prepared.extractionOutcome.success) {
    throw new Error(`Cascade variable extraction failed: ${prepared.extractionOutcome.error}`);
  }

  // Create theme evidence constructs for affinity mapping
  let themeConstructCount = 0;
  let canonicalRefSection = '';

  if (input.analysisMethod === 'affinity_mapping' && prepared.extractionKeys.includes('validated_themes')) {
    try {
      const vars = await readStudyVariablesByContext(variableContext);
      const themes = vars.variables?.validated_themes;

      const nuggetConstructs = await EvidenceConstructModel.findAll({
        where: { study_id: input.studyId, construct_type: 'nugget' },
      });
      const nuggetPublicIds = new Set(
        nuggetConstructs.map((c: unknown) => (c as { public_id: string }).public_id),
      );
      const displayToPublicId = new Map(
        nuggetConstructs.map((c: unknown) => [(c as { label: string }).label, (c as { public_id: string }).public_id]),
      );

      if (Array.isArray(themes) && themes.length > 0 && nuggetPublicIds.size > 0) {
        const themeItems: SynthesizedConstructInput[] = themes.map((t: Record<string, unknown>) => {
          let evidenceIds: string[] = [];
          if (Array.isArray(t.supporting_evidence_ids) && t.supporting_evidence_ids.length > 0) {
            evidenceIds = t.supporting_evidence_ids as string[];
          } else if (Array.isArray(t.supporting_nuggets)) {
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
          projectId: input.projectId,
          studyId: input.studyId,
          constructType: 'theme',
          upstreamConstructType: 'nugget',
          relationshipType: 'SYNTHESIZED_FROM',
          suppliedEvidenceIds: nuggetPublicIds,
          cascadeVariableKey: 'validated_themes',
          templateId: 'affinity_mapping',
          templateVersion: 'v7.1',
          modelName: getDefaultModelName(),
          createdBy: input.createdByActorId,
        });

        if (result.created.length > 0) {
          themeConstructCount = result.created.length;
          await enrichProjectionWithEvidenceRefs(
            input.projectId, input.studyId, 'validated_themes', result.created,
          );

          const refItems: CanonicalRefItem[] = result.created.map(
            (c: { constructId: number; publicId: string; displayId: string }) => {
              const themeData = themes.find((t: Record<string, unknown>) => t.id === c.displayId);
              return {
                displayId: c.displayId,
                label: (themeData?.theme_name as string) || c.displayId,
                constructPublicId: c.publicId,
                constructType: 'theme',
              };
            },
          );
          canonicalRefSection = buildCanonicalReferenceSection(refItems, 'Canonical Theme References');
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Theme evidence construct creation failed (non-blocking): ${message}`);
    }
  }

  // Finalize artifact write
  const renderedAnalysis = await finalizeArtifactWrite(prepared, canonicalRefSection || undefined);

  // Attach theme evidence refs to artifact
  if (input.analysisMethod === 'affinity_mapping' && themeConstructCount > 0) {
    try {
      const vars = await readStudyVariablesByContext(variableContext);
      const themes = vars.variables?.validated_themes;
      if (Array.isArray(themes)) {
        const themeConstructPublicIds = themes
          .filter((t: Record<string, unknown>) => t.evidence_construct_ref)
          .map((t: Record<string, unknown>) => t.evidence_construct_ref);
        if (themeConstructPublicIds.length > 0) {
          const constructs = await EvidenceConstructModel.findAll({
            where: { public_id: themeConstructPublicIds },
            attributes: ['id'],
          });
          const internalIds = constructs.map((c: unknown) => (c as { id: number }).id);
          await attachEvidenceRefsVerified(
            renderedAnalysis.artifactPublicId,
            internalIds,
            { projectId: input.projectId, studyId: input.studyId, templateId: input.analysisMethod, workflow: 'synthesis' },
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Artifact→evidence attachment failed (non-blocking): ${message}`);
    }
  }

  return {
    url: renderedAnalysis.result.url,
    filePath: renderedAnalysis.result.path,
    cascadeVariableCount: Object.keys(upstreamVars).length,
    sessionFileCount: files.length,
    extractionSuccess: true,
    extractionVariableCount: prepared.extractionOutcome.variableCount || 0,
    themeConstructCount,
  };
}
