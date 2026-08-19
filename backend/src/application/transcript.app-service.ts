/**
 * Transcript Application Service — PLAT-3
 *
 * Extracted from sessionNotesHandler.ts and analyzeNotesHandler.ts
 * Orchestrates two flows:
 * 1. Transcript/notes upload with PII scrubbing and quarantine
 * 2. Session analysis (analyze notes) with cascade variable extraction
 */

import type { ApplicationContext } from '../types/application-context';
import { assertStudyAccessByActor } from '../services/authorization.service';
import { resolveStudyFromName } from '../services/research_study.service';
import { studyNotesService } from '../services';
import sessionSummaryService from '../services/session-summary.service';
import studyParticipantService from '../services/study_participant.service';
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo, fetchFileFromRepoByPath, createOrUpdateFileOnGitHub } from '../helpers/github';
import { processYamlTemplate, type DryRunResult } from '../helpers/yamlProcessor';
import { scrubTranscript, type ScrubContext } from '../helpers/transcriptScrubber';
import { redactTranscript } from '../helpers/piiRedaction';
import type { PiiRedactionContext } from '../helpers/langchain';
import { readStudyVariablesByContext, type VariableContext } from '../helpers/studyVariables';
import { resolveSessionSource, createNuggetConstructs, type NuggetInput } from '../services/session-evidence.service';
import { attachEvidenceRefsVerified } from '../services/artifact.service';
import { logDispositionAction } from '../services/audit.service';
import { getDefaultModelName } from '../helpers/modelProvider';
import { STUDY_FOLDERS } from '../config/folderStructure';

// ─── Upload Input/Output Types ──────────────────────────────────

export interface TranscriptUploadInput {
  /** Study context */
  studyId: number;
  projectId: number;
  studyName: string;
  studyPath: string;

  /** Session info */
  sessionId: string;
  participantName: string;
  participantCode: string;
  sessionDate: string;
  sessionTime: string;
  researcherName: string;

  /** Content */
  rawContent: string;
  isTranscript: boolean;

  /** PII scrubbing context */
  participantRealName: string;

  /** Actor info */
  createdByActorId: string;
}

export interface ScrubStats {
  participantName: number;
  moderatorName: number;
  speakerLabels: number;
  phoneNumbers: number;
  emailAddresses: number;
}

export interface TranscriptUploadResult {
  /** Where the content was stored */
  quarantinePath: string | null;
  finalPath: string;
  /** Scrubbing statistics */
  scrubStats: ScrubStats;
  /** Whether content is in quarantine pending review */
  pendingReview: boolean;
  /** DB note ID (for manual notes) */
  noteId: number | null;
  /** GitHub URL (for transcript uploads) */
  fileUrl: string | null;
}

export interface TranscriptApprovalInput {
  /** Paths */
  quarantinePath: string;
  finalPath: string;
  filename: string;

  /** Study context */
  studyId: number | null;
  studyName: string;
  participantCode: string;
  participantId: number | null;
  sessionDate: string;
  sessionTime: string;

  /** Actor info */
  originalUploaderId: string;
  reviewerActorId: string;
}

export interface TranscriptApprovalResult {
  finalUrl: string;
  noteId: number;
}

export interface ManualNotesApprovalInput {
  noteId: number;
  finalPath: string;
  reviewerActorId: string;
}

export interface ManualNotesApprovalResult {
  finalUrl: string;
}

// ─── Analyze Input/Output Types ─────────────────────────────────

export interface AnalyzeSessionInput {
  /** Study context */
  studyId: number;
  projectId: number;
  studyName: string;
  studyPath: string;

  /** Session info */
  participantCode: string;
  participantName: string | null;
  sessionName: string | null;

  /** Note IDs to analyze */
  transcriptNoteId: number;
  observerNoteIds: number[];

  /** Actor info */
  analyzerActorId: string;
}

export interface AnalyzeSessionResult {
  /** URL of the generated session summary */
  url: string;
  filePath: string;
  /** Summary database record ID */
  summaryId: number;
  /** Files processed */
  noteCount: number;
  /** Cascade extraction outcome */
  extractionSuccess: boolean;
  extractionVariableCount: number;
  /** Evidence lineage */
  nuggetCount: number;
}

// ─── Upload Orchestration ───────────────────────────────────────

export async function uploadTranscript(
  ctx: ApplicationContext,
  input: TranscriptUploadInput,
): Promise<TranscriptUploadResult> {
  // Authorization
  await assertStudyAccessByActor(ctx.actor.id, input.studyId, ctx.organization.id);

  // PII scrubbing
  const scrubCtx: ScrubContext = {
    participantRealName: input.participantRealName,
    participantCode: input.participantCode,
    moderatorName: input.researcherName,
  };
  const scrubResult = scrubTranscript(input.rawContent, scrubCtx);

  if (input.isTranscript) {
    // Transcript upload path: write to quarantine in GitHub
    const piiMarkerPending = '<!-- PII-STATUS: PENDING-REVIEW -->';
    const scrubbedContent = `${piiMarkerPending}
# Session Transcript: ${input.participantCode}

**Study:** ${input.studyName}
**Session date:** ${input.sessionDate}
**Session time:** ${input.sessionTime}
**Researcher:** [Moderator]
**Uploaded:** ${new Date().toISOString()}
**PII Status:** Auto-scrubbed, pending human review

---

${scrubResult.content}`;

    const transcriptFileName = `transcript_${input.sessionId}.md`;
    const quarantinePath = `${input.studyPath}/.pending-review/${transcriptFileName}`;
    const finalPath = `${input.studyPath}/${STUDY_FOLDERS.FIELDWORK_TRANSCRIPTS}/${transcriptFileName}`;

    await createOrUpdateFileOnGitHub(quarantinePath, scrubbedContent);

    return {
      quarantinePath,
      finalPath,
      scrubStats: scrubResult.stats,
      pendingReview: true,
      noteId: null,
      fileUrl: null,
    };
  } else {
    // Manual notes path: store in DB (no git until approval)
    const variableContext: VariableContext = { projectId: input.projectId, studyId: input.studyId };
    const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, 'session_notes.yaml');

    const templateData = {
      session_id: input.sessionId,
      participant_name: input.participantName,
      observer_name: input.createdByActorId,
      session_date: input.sessionDate,
      session_time: input.sessionTime,
      researcher: input.researcherName,
      slack_user_id: input.createdByActorId,
      study_name: input.studyName,
      participant_id: input.participantCode,
      structured_notes: input.rawContent,
    };

    const dryResult = await processYamlTemplate(
      file.content, templateData, input.studyPath, '', false, variableContext, undefined, true,
    ) as DryRunResult;

    const scrubCtxManual: ScrubContext = {
      participantRealName: '',
      participantCode: input.participantCode,
      moderatorName: input.researcherName,
    };
    const manualScrubResult = scrubTranscript(dryResult.content, scrubCtxManual);

    const notesFileName = `notes_${input.sessionId}.md`;
    const finalPath = dryResult.path;

    const pendingNote = await studyNotesService.createStudyNote({
      study_id: input.studyId,
      study_name: input.studyName,
      filename: notesFileName,
      file_path: finalPath,
      file_url: null,
      session_date: input.sessionDate,
      session_time: input.sessionTime,
      participant_id: input.participantCode as unknown as number,
      created_by: input.createdByActorId,
      transcript: false,
      pii_reviewed: false,
      pii_reviewed_at: null,
      pii_reviewed_by: null,
      pending_content: manualScrubResult.content,
    });

    return {
      quarantinePath: null,
      finalPath,
      scrubStats: manualScrubResult.stats,
      pendingReview: true,
      noteId: pendingNote.id,
      fileUrl: null,
    };
  }
}

// ─── Approval Orchestration ─────────────────────────────────────

export async function approveTranscript(
  ctx: ApplicationContext,
  input: TranscriptApprovalInput,
): Promise<TranscriptApprovalResult> {
  if (input.studyId) {
    await assertStudyAccessByActor(ctx.actor.id, input.studyId, ctx.organization.id);
  }

  // Read quarantine content from GitHub
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER!;
  const repo = process.env.GITHUB_REPO!;

  const quarantineFile = await octokit.rest.repos.getContent({
    owner, repo, path: input.quarantinePath,
  });

  if (!('content' in quarantineFile.data)) {
    throw new Error('Quarantine file not found or is a directory');
  }

  const rawContent = Buffer.from(quarantineFile.data.content, 'base64').toString('utf-8');
  const quarantineSha = quarantineFile.data.sha;

  // Flip PII marker
  const reviewedContent = rawContent
    .replace(/<!--\s*PII-STATUS:\s*PENDING-REVIEW\s*-->/i, '<!-- PII-STATUS: REVIEWED-CLEARED -->')
    .replace(/\*\*PII Status:\*\*\s*Auto-scrubbed,?\s*pending human review/i,
      `**PII Status:** Reviewed and cleared by ${input.reviewerActorId}`);

  // Write to final location
  const finalResult = await createOrUpdateFileOnGitHub(input.finalPath, reviewedContent);

  // Delete quarantine file
  await octokit.rest.repos.deleteFile({
    owner, repo, path: input.quarantinePath,
    message: 'Remove quarantine file after PII review approval',
    sha: quarantineSha,
  });

  // Create DB record
  const isTranscript = input.filename.startsWith('transcript_');
  const createdNote = await studyNotesService.createStudyNote({
    study_id: input.studyId ?? undefined,
    study_name: input.studyName,
    filename: input.filename,
    file_path: input.finalPath,
    file_url: finalResult.url,
    session_date: input.sessionDate,
    session_time: input.sessionTime,
    participant_id: input.participantId,
    created_by: input.originalUploaderId,
    transcript: isTranscript,
    pii_reviewed: true,
    pii_reviewed_at: new Date(),
    pii_reviewed_by: input.reviewerActorId,
  });

  // Audit log
  await logDispositionAction({
    action: 'approve_transcript',
    record_type: 'transcript',
    target_identifier: `${input.participantCode}/${input.filename}`,
    study_id: input.studyId ?? undefined,
    study_name: input.studyName,
    participant_code: input.participantCode,
    actor_user_id: input.reviewerActorId,
    authorization_basis: 'PII review attestation',
    outcome: 'success',
    outcome_detail: `quarantine=${input.quarantinePath} final=${input.finalPath}`,
  });

  return {
    finalUrl: finalResult.url,
    noteId: createdNote.id,
  };
}

export async function approveManualNotes(
  ctx: ApplicationContext,
  input: ManualNotesApprovalInput,
): Promise<ManualNotesApprovalResult> {
  const note = await studyNotesService.getStudyNoteById(input.noteId);
  const noteStudyId = note.study_id;

  if (noteStudyId) {
    await assertStudyAccessByActor(ctx.actor.id, noteStudyId, ctx.organization.id);
  }

  const pendingContent: string | null = note.pending_content;
  if (!pendingContent) {
    throw new Error('Note content not found or already approved');
  }

  const piiMarkerCleared = '<!-- PII-STATUS: REVIEWED-CLEARED -->';
  const reviewedContent = `${piiMarkerCleared}\n${pendingContent}`;

  const finalResult = await createOrUpdateFileOnGitHub(input.finalPath, reviewedContent);

  await studyNotesService.updateStudyNote(input.noteId, {
    file_url: finalResult.url,
    pii_reviewed: true,
    pii_reviewed_at: new Date(),
    pii_reviewed_by: input.reviewerActorId,
    pending_content: null,
  });

  return { finalUrl: finalResult.url };
}

// ─── Analyze Session Orchestration ──────────────────────────────

export async function analyzeSession(
  ctx: ApplicationContext,
  input: AnalyzeSessionInput,
): Promise<AnalyzeSessionResult> {
  // Authorization
  await assertStudyAccessByActor(ctx.actor.id, input.studyId, ctx.organization.id);

  const variableContext: VariableContext = { projectId: input.projectId, studyId: input.studyId };

  // Fetch transcript
  const transcript = await studyNotesService.getStudyNoteById(input.transcriptNoteId);
  if (transcript.transcript && !transcript.pii_reviewed) {
    throw new Error('Transcript has not been PII-reviewed. Review required before analysis.');
  }

  // Fetch all notes (transcript + observer notes)
  const allNoteIds = [input.transcriptNoteId, ...input.observerNoteIds];
  const noteDetails: Array<{ id: number; filename: string; transcript: boolean; created_by: string; file_path: string | null; githubContent?: string }> = [];

  for (const noteId of allNoteIds) {
    const note = await studyNotesService.getStudyNoteById(noteId);
    if (note) {
      let githubContent = '[Content not available]';
      if (note.file_path) {
        try {
          const githubFile = await fetchFileFromRepoByPath(process.env.GITHUB_REPO!, note.file_path);
          githubContent = (githubFile as { content: string }).content || '[Content not available]';
        } catch {
          githubContent = '[Error fetching content]';
        }
      }
      noteDetails.push({
        id: note.id,
        filename: note.filename,
        transcript: note.transcript,
        created_by: note.created_by,
        file_path: note.file_path,
        githubContent,
      });
    }
  }

  // Format content with PII redaction
  const formatNoteContent = (note: typeof noteDetails[0]): string => {
    const rawContent = note.githubContent || '[No content available]';
    const redactedContent = redactTranscript(rawContent, input.participantName, input.participantCode);
    return `# ${note.filename}\n\n**Participant:** ${input.participantCode}\n\n${redactedContent}`;
  };

  const transcriptNotes = noteDetails.filter(n => n.transcript === true);
  const regularNotes = noteDetails.filter(n => n.transcript !== true);

  const coded_transcript_content = transcriptNotes.map(formatNoteContent).join('\n\n---\n\n');
  const notes_content = regularNotes.map(formatNoteContent).join('\n\n---\n\n');
  const noteTakers = noteDetails.map(n => n.created_by).filter(Boolean);

  const templateData: Record<string, unknown> = {
    study_folder: input.studyName,
    study_name: input.studyName,
    session_name: input.sessionName || 'No specific session selected',
    session_date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    selected_note_files: noteDetails.map(n => n.filename),
    coded_transcript_content,
    notes_content,
    note_takers: noteTakers.join(', '),
    participant_id: input.participantCode,
    researcher_contact: '',
    analyzer: input.analyzerActorId,
  };

  // Resolve evidence source
  const governedContent = [coded_transcript_content, notes_content].filter(Boolean).join('\n\n---\n\n');
  let evidenceSourceId: number | null = null;
  let evidenceSourcePublicId: string | null = null;

  if (transcriptNotes.length > 0) {
    try {
      const primaryTranscript = transcriptNotes[0];
      const resolvedSource = await resolveSessionSource({
        projectId: input.projectId,
        studyId: input.studyId,
        studyNotesId: primaryTranscript.id,
        sourceType: primaryTranscript.transcript ? 'session_transcript' : 'session_notes',
        label: primaryTranscript.filename || 'Session transcript',
        governedContent,
        createdBy: input.analyzerActorId,
      });
      evidenceSourceId = resolvedSource.id;
      evidenceSourcePublicId = resolvedSource.publicId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Evidence source creation failed (non-blocking): ${message}`);
    }
  }

  // Artifact identity context
  templateData.__artifactContext = {
    projectId: input.projectId,
    studyId: input.studyId,
    artifactType: 'fieldwork',
    title: `Session summary — ${input.participantCode}`,
    canonicalUpstreamInputs: evidenceSourcePublicId ? [`source:${evidenceSourcePublicId}`] : [],
    createdBy: input.analyzerActorId,
  };

  // PII context for pre-transmission assertion
  const piiContext: PiiRedactionContext | undefined = input.participantName
    ? { knownNames: [input.participantName], participantCode: input.participantCode }
    : undefined;

  // Prepare and finalize
  const { prepareYamlTemplate, finalizeArtifactWrite } = require('../helpers/yamlProcessor');
  const yamlTemplateFile = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, 'session_summary.yaml');

  const prepared = await prepareYamlTemplate(
    yamlTemplateFile.content, templateData, input.studyPath, '', variableContext, piiContext,
  );

  let extractionSuccess = prepared.extractionOutcome.success;
  const extractionVariableCount = prepared.extractionOutcome.variableCount || 0;

  if (!extractionSuccess) {
    throw new Error(`Cascade variable extraction failed: ${prepared.extractionOutcome.error}`);
  }

  // Create nugget evidence constructs
  let nuggetCount = 0;
  const createdNuggetIds: number[] = [];

  if (evidenceSourceId && prepared.extractionKeys.includes('atomic_nugget_core')) {
    try {
      const vars = await readStudyVariablesByContext(variableContext);
      const nuggetCoreItems = vars.variables?.atomic_nugget_core;
      if (Array.isArray(nuggetCoreItems) && nuggetCoreItems.length > 0) {
        const thisParticipantNuggets = nuggetCoreItems.filter(
          (n: Record<string, unknown>) => n.participant === input.participantCode,
        );
        const nuggetInputs: NuggetInput[] = thisParticipantNuggets.map((n: Record<string, unknown>) => ({
          displayId: (n.id as string) || `nugget-${input.participantCode}-unknown`,
          nuggetType: (n.nugget_type as string) || 'unknown',
          severity: (n.severity as number) ?? 0,
          text: (n.text as string) || '',
          participantCode: (n.participant as string) || input.participantCode,
          session: (n.session as string) || '',
        }));

        const createdNuggets = await createNuggetConstructs(
          evidenceSourceId, input.projectId, input.studyId, nuggetInputs,
          { templateId: 'session_summary', templateVersion: 'v7.2', modelName: getDefaultModelName() },
          input.analyzerActorId,
        );
        nuggetCount = createdNuggets.length;
        createdNuggetIds.push(...createdNuggets.map(c => c.constructId));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Nugget evidence construct creation failed (non-blocking): ${message}`);
    }
  }

  // Finalize artifact write
  const renderedYaml = await finalizeArtifactWrite(prepared);

  // Attach nugget evidence refs
  if (createdNuggetIds.length > 0) {
    const attachResult = await attachEvidenceRefsVerified(
      renderedYaml.artifactPublicId, createdNuggetIds,
      { projectId: input.projectId, studyId: input.studyId, templateId: 'session_summary', workflow: 'analyze' },
    );
    if (attachResult.attached > 0) {
      nuggetCount = attachResult.attached;
    }
  }

  const { result } = renderedYaml;
  const urlParts: string[] = result.path.split('/');
  const fileName: string = urlParts[urlParts.length - 1];

  // Save session summary to DB
  const savedSummary = await sessionSummaryService.createOrUpdateSessionSummary({
    study_id: input.studyId,
    study_name: input.studyName,
    filename: fileName || 'session_summary.md',
    file_path: result.path || null,
    file_url: result.url || null,
    created_by: input.analyzerActorId,
  });

  return {
    url: result.url,
    filePath: result.path,
    summaryId: savedSummary.id,
    noteCount: noteDetails.length,
    extractionSuccess,
    extractionVariableCount,
    nuggetCount,
  };
}
