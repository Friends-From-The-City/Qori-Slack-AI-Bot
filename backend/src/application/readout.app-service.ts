/**
 * Readout Application Service — PLAT-3
 *
 * Extracted from readoutHandler.ts
 * Orchestrates research readout generation: content aggregation from
 * research plans and session summaries, privacy gating, YAML template
 * processing, evidence construct creation (findings + recommendations),
 * canonical reference building, and targeted audience readouts.
 */

import type { ApplicationContext } from '../types/application-context';
import { assertStudyAccessByActor } from '../services/authorization.service';
import researchPlanService from '../services/research_plan.service';
import sessionSummaryService from '../services/session-summary.service';
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo, fetchFileFromRepoByPath, readFolders, readFolderContents } from '../helpers/github';
import { processYamlTemplate } from '../helpers/yamlProcessor';
import type { VariableContext } from '../helpers/studyVariables';
import { readStudyVariablesByContext } from '../helpers/studyVariables';
import { createSynthesizedConstructs } from '../services/synthesis-evidence.service';
import { enrichProjectionWithEvidenceRefs } from '../services/projection-enrichment.service';
import { attachEvidenceRefsVerified } from '../services/artifact.service';
import { computeCanonicalAnchor, resolveConstructDeepLink, buildCanonicalReferenceSection, type CanonicalRefItem } from '../services/deep-link.service';
import { authorizeForModel } from '../services/content-governance.service';
import { getDefaultModelName } from '../helpers/modelProvider';
import sequelize from '../database';

// ─── Input/Output Types ──────────────────────────────────────────

export interface ReadoutInput {
  /** Study to generate readout for */
  studyId: number;
  projectId: number;
  studyName: string;
  studyPath: string;

  /** Report type */
  reportType: 'research_readout' | 'targeted_readouts' | 'github_issues';

  /** For targeted readouts */
  targetAudiences?: string[];

  /** Team members */
  teamMembers: string;

  /** Actor info */
  createdByActorId: string;
}

export interface ReadoutResult {
  /** URL(s) of the generated readout(s) */
  urls: ReadoutUrlEntry[];
  /** Evidence lineage */
  findingConstructCount: number;
  recommendationConstructCount: number;
  /** Cascade extraction outcome */
  extractionSuccess: boolean;
}

export interface ReadoutUrlEntry {
  audience: string | null;
  url: string;
  success: boolean;
  error?: string;
}

// ─── Helpers ────────────────────────────────────────────────────

interface ContentItem {
  [filename: string]: string;
}

const ANALYSIS_SCANS = [
  { folder: '03-fieldwork/transcripts', label: 'transcripts' },
  { folder: '03-fieldwork/sessions', label: 'session summaries' },
  { folder: '04-synthesis', label: 'synthesis artifacts' },
];

async function aggregateStudyContent(
  studyId: number,
  studyPath: string,
  reportType: string,
): Promise<{ contentArray: ContentItem[]; detectedFiles: string[]; readoutLink: string }> {
  let contentArray: ContentItem[] = [];
  const detectedFiles: string[] = [];
  let readoutLink = '';

  if (reportType === 'github_issues') {
    const decodedFolderPath = decodeURIComponent(studyPath);
    const findingsPath = `${decodedFolderPath}/05-readouts`;
    readoutLink = `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/tree/main/${findingsPath}`;

    try {
      const findingsFiles = await readFolders(findingsPath, process.env.GITHUB_REPO!);
      contentArray = findingsFiles.map((file: { name: string; content: string }) => ({
        [file.name]: file.content,
      }));
      detectedFiles.push(...findingsFiles.map((file: { name: string }) => file.name));
    } catch {
      // No findings folder
    }
  } else {
    let researchPlans: Array<{ file_path: string | null; filename: string }> = [];
    let sessionSummaries: Array<{ file_path: string | null; filename: string }> = [];

    try { researchPlans = await researchPlanService.getResearchPlansByStudyId(studyId); } catch { /* */ }
    try { sessionSummaries = await sessionSummaryService.getSessionSummariesByStudyId(studyId); } catch { /* */ }

    const contentPromises: Promise<ContentItem | null>[] = [];

    for (const plan of researchPlans) {
      if (plan.file_path) {
        contentPromises.push(
          fetchFileFromRepoByPath(process.env.GITHUB_REPO!, plan.file_path)
            .then((file: { path: string; content: string }) => ({ [plan.filename || file.path.split('/').pop()!]: file.content }))
            .catch(() => null),
        );
      }
    }

    for (const summary of sessionSummaries) {
      if (summary.file_path) {
        contentPromises.push(
          fetchFileFromRepoByPath(process.env.GITHUB_REPO!, summary.file_path)
            .then((file: { path: string; content: string }) => ({ [summary.filename || file.path.split('/').pop()!]: file.content }))
            .catch(() => null),
        );
      }
    }

    const allContentResults = await Promise.all(contentPromises);
    contentArray = allContentResults.filter((item): item is ContentItem => item !== null);

    const decodedPath = decodeURIComponent(studyPath);
    const studyBase = `${decodedPath}/`;

    const plansByBase: Record<string, string> = {};
    researchPlans.forEach(plan => {
      if (plan.file_path) {
        const relativePath = plan.file_path.startsWith(decodedPath)
          ? plan.file_path.slice(decodedPath.length + 1) : plan.filename;
        const base = relativePath.replace(/_[A-Z][a-z]+ \d{1,2},? \d{4}/, '');
        if (!plansByBase[base] || relativePath > plansByBase[base]) plansByBase[base] = relativePath;
      }
    });
    Object.values(plansByBase).forEach(p => detectedFiles.push(p));

    sessionSummaries.forEach(summary => {
      if (summary.file_path) {
        const relativePath = summary.file_path.startsWith(decodedPath)
          ? summary.file_path.slice(decodedPath.length + 1) : summary.filename;
        detectedFiles.push(relativePath);
      }
    });

    for (const scan of ANALYSIS_SCANS) {
      try {
        const files = await readFolderContents(`${studyBase}${scan.folder}`, process.env.GITHUB_REPO!);
        const validFiles = files.filter((f: { name: string }) => f.name !== 'README.md' && f.name !== '.gitkeep');
        const byBase: Record<string, { name: string }> = {};
        for (const f of validFiles) {
          const base = f.name.replace(/_[A-Z][a-z]+ \d{1,2},? \d{4}/, '');
          if (!byBase[base] || f.name > byBase[base].name) byBase[base] = f;
        }
        Object.values(byBase).forEach(f => detectedFiles.push(`${scan.folder}/${f.name}`));
      } catch { /* folder doesn't exist */ }
    }
  }

  return { contentArray, detectedFiles, readoutLink };
}

// ─── Main Orchestration ─────────────────────────────────────────

export async function executeReadout(
  ctx: ApplicationContext,
  input: ReadoutInput,
): Promise<ReadoutResult> {
  await assertStudyAccessByActor(ctx.actor.id, input.studyId, ctx.organization.id);

  const variableContext: VariableContext = { projectId: input.projectId, studyId: input.studyId };

  const { contentArray, detectedFiles, readoutLink } = await aggregateStudyContent(
    input.studyId, input.studyPath, input.reportType,
  );

  let combinedContent = '';
  if (contentArray.length > 0) {
    combinedContent = contentArray.map(item => {
      const fileName = Object.keys(item)[0];
      const content = item[fileName];
      return content?.trim() ? `# ${fileName}\n\n${content}` : `# ${fileName}\n\n[File exists but content is empty]`;
    }).join('\n\n---\n\n');
  } else {
    combinedContent = '[No research plans or session summaries found for this study]';
  }

  const privacyResult = authorizeForModel(
    combinedContent, 'TRUSTED_CURATED_ARTIFACT',
    { isQoriArtifact: true, upstreamPrivacyComplete: true, sourceId: `readout:${input.studyName}` },
  );
  const authorizedContent = privacyResult.modelSafeContent ?? combinedContent;

  const detectedFilesList = detectedFiles.length > 0 ? detectedFiles.map(f => `- ${f}`).join('\n') : 'No files detected';

  const EvidenceConstructModel = sequelize.models.EvidenceConstruct;
  let canonicalReadoutInputs: string[] = [];
  try {
    const themeConstructs = await EvidenceConstructModel.findAll({
      where: { study_id: input.studyId, construct_type: 'theme' }, attributes: ['public_id'],
    });
    canonicalReadoutInputs = themeConstructs.map((c: unknown) => (c as { public_id: string }).public_id);
  } catch { /* fallback */ }

  const reportData: Record<string, unknown> = {
    selected_study: input.studyName,
    research_folder_path: input.studyPath,
    study_name: input.studyName,
    researcher_contact: '',
    study_channel: '',
    research_readout_data: authorizedContent,
    input_text: authorizedContent,
    detected_files: detectedFilesList,
    study_link: '',
    team_members: input.teamMembers,
    github_repository: `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`,
    github_repo_url: `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`,
    max_issues: '10',
    __artifactContext: {
      projectId: input.projectId, studyId: input.studyId,
      artifactType: 'readout', title: `Research readout — ${input.studyName}`,
      canonicalUpstreamInputs: canonicalReadoutInputs, createdBy: input.createdByActorId,
    },
  };

  if (input.reportType === 'github_issues' && readoutLink) reportData.readout_link = readoutLink;

  if (input.reportType === 'targeted_readouts') {
    return executeTargetedReadouts(input, reportData, variableContext, canonicalReadoutInputs);
  }

  // Research readout — prepare/finalize flow
  const { prepareYamlTemplate, finalizeArtifactWrite } = require('../helpers/yamlProcessor');
  const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, 'research_readout.yaml');
  const prepared = await prepareYamlTemplate(file.content, reportData, input.studyPath, '', variableContext);

  if (!prepared.extractionOutcome.success) {
    throw new Error(`Readout extraction failed: ${prepared.extractionOutcome.error}`);
  }

  let findingConstructCount = 0;
  let recommendationConstructCount = 0;
  const readoutConstructIds: number[] = [];
  let canonicalRefSection = '';

  if (prepared.extractionKeys.includes('prioritized_findings') || prepared.extractionKeys.includes('prioritized_recommendations')) {
    try {
      const vars = await readStudyVariablesByContext(variableContext);
      const themeConstructs = await EvidenceConstructModel.findAll({
        where: { study_id: input.studyId, construct_type: 'theme' },
      });
      type CR = { public_id: string; label: string };
      const themePublicIds = new Set(themeConstructs.map((c: unknown) => (c as CR).public_id));
      const themeDisplayToPublicId = new Map(themeConstructs.map((c: unknown) => [(c as CR).label, (c as CR).public_id]));

      const findings = vars.variables?.prioritized_findings;
      if (Array.isArray(findings) && findings.length > 0 && themePublicIds.size > 0) {
        const findingItems = findings.map((f: Record<string, unknown>) => ({
          displayId: (f.id as string) || 'finding-unknown',
          label: (f.finding as string)?.substring(0, 100) || '',
          payload: f,
          proposedEvidenceIds: Array.isArray(f.supporting_theme_evidence_ids)
            ? f.supporting_theme_evidence_ids as string[]
            : (Array.isArray(f.supporting_themes) ? (f.supporting_themes as string[]).map(d => themeDisplayToPublicId.get(d)).filter((id): id is string => !!id) : []),
        }));

        const findingResult = await createSynthesizedConstructs(findingItems, {
          projectId: input.projectId, studyId: input.studyId,
          constructType: 'finding', upstreamConstructType: 'theme',
          relationshipType: 'SYNTHESIZED_FROM', suppliedEvidenceIds: themePublicIds,
          cascadeVariableKey: 'prioritized_findings', templateId: 'research_readout',
          templateVersion: 'v7.0', modelName: getDefaultModelName(), createdBy: input.createdByActorId,
        });

        if (findingResult.created.length > 0) {
          findingConstructCount = findingResult.created.length;
          readoutConstructIds.push(...findingResult.created.map((c: { constructId: number }) => c.constructId));
          await enrichProjectionWithEvidenceRefs(input.projectId, input.studyId, 'prioritized_findings', findingResult.created);

          const findingRefItems: CanonicalRefItem[] = [];
          for (const created of findingResult.created) {
            const findingData = findings.find((f: Record<string, unknown>) => f.id === created.displayId);
            const upstreamLinks: Array<{ displayId: string; label: string; deepLink: string | null }> = [];
            for (const themeLabel of ((findingData?.supporting_themes as string[]) || [])) {
              const themePubId = themeDisplayToPublicId.get(themeLabel);
              if (themePubId) {
                const linkResult = await resolveConstructDeepLink(themePubId, input.studyId);
                upstreamLinks.push({ displayId: themeLabel, label: themeLabel, deepLink: linkResult.resolved ? linkResult.deepLink : null });
              }
            }
            findingRefItems.push({
              displayId: created.displayId,
              label: (findingData?.finding as string)?.substring(0, 100) || created.displayId,
              constructPublicId: created.publicId, constructType: 'finding', upstreamLinks,
            });
          }
          canonicalRefSection += buildCanonicalReferenceSection(findingRefItems, 'Canonical Finding References');

          const recommendations = vars.variables?.prioritized_recommendations;
          if (Array.isArray(recommendations) && recommendations.length > 0) {
            const findingPublicIds = new Set(findingResult.created.map((c: { publicId: string }) => c.publicId));
            const findingDisplayToPublicId = new Map(findingResult.created.map((c: { displayId: string; publicId: string }) => [c.displayId, c.publicId]));

            const recItems = recommendations.map((r: Record<string, unknown>) => ({
              displayId: (r.id as string) || 'rec-unknown',
              label: (r.recommendation as string)?.substring(0, 100) || '',
              payload: r,
              proposedEvidenceIds: Array.isArray(r.supporting_finding_evidence_ids)
                ? r.supporting_finding_evidence_ids as string[]
                : (Array.isArray(r.addresses_findings) ? (r.addresses_findings as string[]).map(d => findingDisplayToPublicId.get(d)).filter((id): id is string => !!id) : []),
            }));

            const recResult = await createSynthesizedConstructs(recItems, {
              projectId: input.projectId, studyId: input.studyId,
              constructType: 'recommendation', upstreamConstructType: 'finding',
              relationshipType: 'SUPPORTS', suppliedEvidenceIds: findingPublicIds,
              cascadeVariableKey: 'prioritized_recommendations', templateId: 'research_readout',
              templateVersion: 'v7.0', modelName: getDefaultModelName(), createdBy: input.createdByActorId,
            });

            if (recResult.created.length > 0) {
              recommendationConstructCount = recResult.created.length;
              readoutConstructIds.push(...recResult.created.map((c: { constructId: number }) => c.constructId));
              await enrichProjectionWithEvidenceRefs(input.projectId, input.studyId, 'prioritized_recommendations', recResult.created);

              const recRefItems: CanonicalRefItem[] = recResult.created.map((created: { displayId: string; publicId: string }) => {
                const recData = recommendations.find((r: Record<string, unknown>) => r.id === created.displayId);
                const findingLinks = ((recData?.addresses_findings as string[]) || []).map(fid => {
                  const fpid = findingDisplayToPublicId.get(fid);
                  return fpid ? { displayId: fid, label: fid, deepLink: `#${computeCanonicalAnchor(fpid)}` } : null;
                }).filter((l): l is NonNullable<typeof l> => l !== null);
                return {
                  displayId: created.displayId,
                  label: (recData?.recommendation as string)?.substring(0, 100) || created.displayId,
                  constructPublicId: created.publicId, constructType: 'recommendation', upstreamLinks: findingLinks,
                };
              });
              canonicalRefSection += buildCanonicalReferenceSection(recRefItems, 'Canonical Recommendation References');
            }
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Evidence creation failed (non-blocking): ${message}`);
    }
  }

  const renderedYaml = await finalizeArtifactWrite(prepared, canonicalRefSection || undefined);

  if (readoutConstructIds.length > 0) {
    await attachEvidenceRefsVerified(
      renderedYaml.artifactPublicId, readoutConstructIds,
      { projectId: input.projectId, studyId: input.studyId, templateId: 'research_readout', workflow: 'readout' },
    );
  }

  return {
    urls: [{ audience: null, url: renderedYaml.result.url, success: true }],
    findingConstructCount, recommendationConstructCount, extractionSuccess: true,
  };
}

// ─── Targeted Readouts ──────────────────────────────────────────

const AUDIENCE_TEMPLATE_MAP: Record<string, string> = {
  'Design Team': 'designer_readout.yaml',
  'Engineering Team': 'engineering_readout.yaml',
  'Accessibility Team': 'accessibility_readout.yaml',
  'Executive Leadership': 'leadership_readout.yaml',
  'Product Leadership': 'leadership_readout.yaml',
};

async function executeTargetedReadouts(
  input: ReadoutInput,
  reportData: Record<string, unknown>,
  variableContext: VariableContext,
  canonicalReadoutInputs: string[],
): Promise<ReadoutResult> {
  const audiences = input.targetAudiences || [];
  if (audiences.length === 0) throw new Error('At least one audience is required for targeted readouts');

  const results: ReadoutUrlEntry[] = [];

  for (const audience of audiences) {
    const templateName = AUDIENCE_TEMPLATE_MAP[audience];
    if (!templateName) continue;

    try {
      const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, templateName);
      const audienceData = {
        ...reportData,
        target_audience: audience,
        __artifactContext: {
          projectId: input.projectId, studyId: input.studyId,
          artifactType: 'readout', title: `${audience} readout — ${input.studyName}`,
          canonicalUpstreamInputs: [...canonicalReadoutInputs, `audience:${audience.toLowerCase().replace(/\s+/g, '-')}`],
          createdBy: input.createdByActorId,
        },
      };

      const rendered = await processYamlTemplate(file.content, audienceData, input.studyPath, '', false, variableContext);

      if (rendered.extractionPromise) {
        const extractResult = await rendered.extractionPromise;
        if (!extractResult.success) console.error(`${audience} extraction failed: ${extractResult.error}`);
      }

      results.push({ audience, url: rendered.result.url, success: true });
    } catch (err) {
      results.push({ audience, url: '', success: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    urls: results, findingConstructCount: 0, recommendationConstructCount: 0,
    extractionSuccess: results.some(r => r.success),
  };
}
