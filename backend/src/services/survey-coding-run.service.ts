/**
 * Survey Coding Run Service
 *
 * Manages the full lifecycle of coding runs: draft creation, assignment
 * review, acceptance, versioning, and evidence construct promotion.
 *
 * Accepted runs are immutable. Editing creates a new version.
 *
 * CASCADE CONSUMER DECISION (Slice 2B):
 * - survey_themes: NOT re-enabled. "Themes" terminology retired.
 * - discovered_barriers: NOT auto-emitted from qualitative patterns.
 * - Canonical evidence lives in evidence_constructs (survey_qualitative_pattern,
 *   survey_individual_observation).
 * - survey_findings / knowledge_gaps continue through existing cascade paths
 *   only where independently justified by other evidence types.
 * - Template rendering reads from accepted evidence constructs directly.
 */

import { Op, type Transaction, type CreationAttributes } from 'sequelize';
import sequelize from '../database';
import type { SurveyCodingRun, CodingRunStatus } from '../database/models/survey_coding_run';
import type { SurveyCodingAssignment, AssignmentOrigin } from '../database/models/survey_coding_assignment';
import type { SurveyCodingEntryReview, EntryReviewStatus } from '../database/models/survey_coding_entry_review';
import type { SurveyQualitativeEntry } from '../database/models/survey_qualitative_entry';
import type { SurveyCode } from '../database/models/survey_code';
import type { SurveyCodebook } from '../database/models/survey_codebook';
import type { EvidenceConstruct } from '../database/models/evidence_construct';
import { createDerivation } from './evidence.service';
import { computeQualitativeAggregation, type PatternStat } from './survey-aggregation.service';
import { getAnalysisEligibleContent } from './content-governance.service';
import type { GeneratedAssignment } from '../helpers/survey/assignmentGenerator';

const CodingRunModel = sequelize.models.SurveyCodingRun as typeof SurveyCodingRun;
const AssignmentModel = sequelize.models.SurveyCodingAssignment as typeof SurveyCodingAssignment;
const EntryReviewModel = sequelize.models.SurveyCodingEntryReview as typeof SurveyCodingEntryReview;
const EntryModel = sequelize.models.SurveyQualitativeEntry as typeof SurveyQualitativeEntry;
const CodeModel = sequelize.models.SurveyCode as typeof SurveyCode;
const CodebookModel = sequelize.models.SurveyCodebook as typeof SurveyCodebook;

// ═══════════════════════════════════════════════════════════════════════
// ERROR CLASSES
// ═══════════════════════════════════════════════════════════════════════

export class CodingRunNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodingRunNotReadyError';
  }
}

export class CodingRunImmutableError extends Error {
  constructor(runId: number) {
    super(`Coding run ${runId} is accepted and immutable. Create a new version to make changes.`);
    this.name = 'CodingRunImmutableError';
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface CodingRunDetails {
  run: SurveyCodingRun;
  assignments: Array<SurveyCodingAssignment & {
    entry_public_id: string;
    entry_display_respondent_id: string;
    entry_field_display_name: string;
    entry_text_governed: string | null;
    entry_respondent_key: string;
    entry_source_row_index: number | null;
    code_public_id: string;
    code_label: string;
  }>;
  entryReviews: SurveyCodingEntryReview[];
  acceptedCodes: Array<{ id: number; public_id: string; label: string; definition: string; include_when: string; exclude_when: string | null; metadata: Record<string, unknown> }>;
}

// ═══════════════════════════════════════════════════════════════════════
// GUARD
// ═══════════════════════════════════════════════════════════════════════

async function guardMutable(runId: number, transaction?: Transaction): Promise<SurveyCodingRun> {
  const run = await CodingRunModel.findByPk(runId, { transaction });
  if (!run) throw new Error(`Coding run ${runId} not found`);
  if (run.status === 'accepted' || run.status === 'superseded') {
    throw new CodingRunImmutableError(runId);
  }
  return run;
}

// ═══════════════════════════════════════════════════════════════════════
// CREATE + IDEMPOTENCY
// ═══════════════════════════════════════════════════════════════════════

/**
 * Find an active unaccepted coding run for a specific evidence source AND codebook.
 * Scoped to codebook to prevent reuse across different grouping versions.
 */
export async function findActiveUnacceptedRun(
  evidenceSourceId: number,
  codebookId: number,
): Promise<SurveyCodingRun | null> {
  return CodingRunModel.findOne({
    where: {
      evidence_source_id: evidenceSourceId,
      codebook_id: codebookId,
      status: ['draft', 'under_review'],
    },
    order: [['version', 'DESC']],
  });
}

/**
 * Create a draft coding run with model-proposed assignments and entry reviews.
 *
 * Transaction: create run → resolve IDs → create assignments → create entry reviews → transition to under_review.
 */
export async function createDraftCodingRun(
  evidenceSourceId: number,
  codebookId: number,
  projectId: number,
  studyId: number | null,
  userId: string,
  generatedAssignments: GeneratedAssignment[],
  eligibleEntries: SurveyQualitativeEntry[],
  generationMetadata: Record<string, unknown>,
): Promise<{ run: SurveyCodingRun; assignmentCount: number; entryReviewCount: number }> {
  return sequelize.transaction(async (t) => {
    // Determine next version
    const maxVersion = await CodingRunModel.max('version', {
      where: { evidence_source_id: evidenceSourceId, codebook_id: codebookId },
      transaction: t,
    }) as number | null;
    const version = (maxVersion ?? 0) + 1;

    // Create run
    const run = await CodingRunModel.create({
      evidence_source_id: evidenceSourceId,
      codebook_id: codebookId,
      project_id: projectId,
      study_id: studyId,
      version,
      status: 'draft',
      generation_metadata: generationMetadata,
      created_by: userId,
    } as CreationAttributes<SurveyCodingRun>, { transaction: t });

    const runId = (run as unknown as { id: number }).id;

    // Build lookup maps
    const entryByPublicId = new Map<string, { id: number; respondent_key: string }>();
    for (const entry of eligibleEntries) {
      entryByPublicId.set(entry.public_id, {
        id: (entry as unknown as { id: number }).id,
        respondent_key: entry.respondent_key,
      });
    }

    const codeByPublicId = new Map<string, number>();
    const acceptedCodes = await CodeModel.findAll({
      where: { codebook_id: codebookId, status: 'accepted' },
      transaction: t,
    });
    for (const code of acceptedCodes) {
      codeByPublicId.set(code.public_id, (code as unknown as { id: number }).id);
    }

    // Create assignments from generated proposals
    let assignmentCount = 0;
    for (const ga of generatedAssignments) {
      const entryData = entryByPublicId.get(ga.qualitative_entry_public_id);
      if (!entryData) continue; // skip unknown entries (should not happen after validation)

      for (const codePublicId of ga.code_public_ids) {
        const codeId = codeByPublicId.get(codePublicId);
        if (!codeId) continue; // skip unknown codes

        await AssignmentModel.create({
          coding_run_id: runId,
          qualitative_entry_id: entryData.id,
          code_id: codeId,
          origin: 'qori_proposed',
          status: 'proposed',
          rationale: ga.rationale,
        } as CreationAttributes<SurveyCodingAssignment>, { transaction: t });
        assignmentCount++;
      }
    }

    // Create entry reviews for ALL eligible entries (not just those with assignments)
    let entryReviewCount = 0;
    for (const entry of eligibleEntries) {
      await EntryReviewModel.create({
        coding_run_id: runId,
        qualitative_entry_id: (entry as unknown as { id: number }).id,
        status: 'pending',
      } as CreationAttributes<SurveyCodingEntryReview>, { transaction: t });
      entryReviewCount++;
    }

    // Transition to under_review
    await run.update({ status: 'under_review' }, { transaction: t });

    return { run, assignmentCount, entryReviewCount };
  });
}

// ═══════════════════════════════════════════════════════════════════════
// READ
// ═══════════════════════════════════════════════════════════════════════

/**
 * Load a coding run with all its assignments, entry reviews, and all accepted codes
 * from the codebook (not just proposed ones — researcher needs full selection).
 */
export async function getCodingRunWithDetails(
  runId: number,
): Promise<CodingRunDetails | null> {
  const run = await CodingRunModel.findByPk(runId);
  if (!run) return null;

  // Load all assignments with entry + code data
  const rawAssignments = await AssignmentModel.findAll({
    where: { coding_run_id: runId },
    order: [['id', 'ASC']],
  });

  // Load entry and code data for each assignment
  const assignments: CodingRunDetails['assignments'] = [];
  for (const a of rawAssignments) {
    const entry = await EntryModel.findByPk(a.qualitative_entry_id);
    const code = await CodeModel.findByPk(a.code_id);
    if (!entry || !code) continue;

    assignments.push(Object.assign(a, {
      entry_public_id: entry.public_id,
      entry_display_respondent_id: entry.display_respondent_id,
      entry_field_display_name: entry.field_display_name,
      entry_text_governed: getAnalysisEligibleContent(entry),
      entry_respondent_key: entry.respondent_key,
      entry_source_row_index: entry.source_row_index,
      code_public_id: code.public_id,
      code_label: code.label,
    }));
  }

  // Load entry reviews
  const entryReviews = await EntryReviewModel.findAll({
    where: { coding_run_id: runId },
    order: [['id', 'ASC']],
  });

  // Load ALL accepted codes from the codebook (for full selection in review modal)
  const acceptedCodes = await CodeModel.findAll({
    where: { codebook_id: run.codebook_id, status: 'accepted' },
    order: [['sort_order', 'ASC']],
  });

  return {
    run,
    assignments,
    entryReviews,
    acceptedCodes: acceptedCodes.map(c => ({
      id: (c as unknown as { id: number }).id,
      public_id: c.public_id,
      label: c.label,
      definition: c.definition,
      include_when: c.include_when,
      exclude_when: c.exclude_when ?? null,
      metadata: c.metadata ?? {},
    })),
  };
}

/**
 * Find the accepted coding run for an evidence source (any codebook).
 */
export async function findAcceptedCodingRun(
  evidenceSourceId: number,
): Promise<SurveyCodingRun | null> {
  return CodingRunModel.findOne({
    where: {
      evidence_source_id: evidenceSourceId,
      status: 'accepted',
    },
    order: [['version', 'DESC']],
  });
}

// ═══════════════════════════════════════════════════════════════════════
// ASSIGNMENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Update an assignment's status (accept/reject).
 * @throws CodingRunImmutableError if run is accepted
 */
export async function updateAssignmentStatus(
  assignmentId: number,
  status: 'accepted' | 'rejected',
  userId: string,
): Promise<void> {
  const assignment = await AssignmentModel.findByPk(assignmentId);
  if (!assignment) throw new Error(`Assignment ${assignmentId} not found`);

  await guardMutable(assignment.coding_run_id);
  await assignment.update({
    status,
    reviewed_by: userId,
    reviewed_at: new Date(),
  });
}

/**
 * Add a researcher-created assignment.
 * @throws CodingRunImmutableError if run is accepted
 */
export async function addResearcherAssignment(
  runId: number,
  entryId: number,
  codeId: number,
  rationale: string | null,
  userId: string,
): Promise<SurveyCodingAssignment> {
  await guardMutable(runId);

  return AssignmentModel.create({
    coding_run_id: runId,
    qualitative_entry_id: entryId,
    code_id: codeId,
    origin: 'researcher_added',
    status: 'accepted',
    rationale,
    reviewed_by: userId,
    reviewed_at: new Date(),
  } as CreationAttributes<SurveyCodingAssignment>);
}

/**
 * Update an entry review status.
 *
 * When set to 'no_grouping_applies' or 'uncodable': rejects all
 * proposed assignments for that entry in the same transaction.
 *
 * @throws CodingRunImmutableError if run is accepted
 */
export async function updateEntryReview(
  entryReviewId: number,
  status: EntryReviewStatus,
  userId: string,
): Promise<void> {
  const review = await EntryReviewModel.findByPk(entryReviewId);
  if (!review) throw new Error(`Entry review ${entryReviewId} not found`);

  await guardMutable(review.coding_run_id);

  if (status === 'no_grouping_applies' || status === 'uncodable') {
    await sequelize.transaction(async (t) => {
      // Reject all proposed assignments for this entry
      await AssignmentModel.update(
        { status: 'rejected', reviewed_by: userId, reviewed_at: new Date() },
        {
          where: {
            coding_run_id: review.coding_run_id,
            qualitative_entry_id: review.qualitative_entry_id,
            origin: 'qori_proposed',
            status: 'proposed',
          },
          transaction: t,
        },
      );

      await review.update({
        status,
        reviewed_by: userId,
        reviewed_at: new Date(),
      }, { transaction: t });
    });
  } else {
    await review.update({
      status,
      reviewed_by: userId,
      reviewed_at: new Date(),
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BATCH REVIEW (for modal page submission)
// ═══════════════════════════════════════════════════════════════════════

export interface EntryReviewDecision {
  entryReviewId: number;
  qualitativeEntryId: number;
  /** Terminal status chosen by researcher. */
  status: EntryReviewStatus;
  /** Assignment IDs to accept (for 'reviewed' status). */
  acceptAssignmentIds: number[];
  /** Assignment IDs to reject (for 'reviewed' status). */
  rejectAssignmentIds: number[];
  /** New assignments to create (researcher-added groupings). */
  newAssignments: Array<{ codeId: number; rationale: string | null }>;
}

/**
 * Process a page of entry review decisions in a single transaction.
 */
export async function processPageReviewDecisions(
  runId: number,
  decisions: EntryReviewDecision[],
  userId: string,
): Promise<void> {
  await guardMutable(runId);

  await sequelize.transaction(async (t) => {
    for (const decision of decisions) {
      const now = new Date();

      if (decision.status === 'no_grouping_applies' || decision.status === 'uncodable') {
        // Reject all proposed assignments for this entry
        await AssignmentModel.update(
          { status: 'rejected', reviewed_by: userId, reviewed_at: now },
          {
            where: {
              coding_run_id: runId,
              qualitative_entry_id: decision.qualitativeEntryId,
              status: 'proposed',
            },
            transaction: t,
          },
        );
      } else if (decision.status === 'reviewed') {
        // Accept specified assignments
        if (decision.acceptAssignmentIds.length > 0) {
          await AssignmentModel.update(
            { status: 'accepted', reviewed_by: userId, reviewed_at: now },
            {
              where: { id: decision.acceptAssignmentIds, coding_run_id: runId },
              transaction: t,
            },
          );
        }

        // Reject specified assignments
        if (decision.rejectAssignmentIds.length > 0) {
          await AssignmentModel.update(
            { status: 'rejected', reviewed_by: userId, reviewed_at: now },
            {
              where: { id: decision.rejectAssignmentIds, coding_run_id: runId },
              transaction: t,
            },
          );
        }

        // Create researcher-added assignments
        for (const newA of decision.newAssignments) {
          await AssignmentModel.create({
            coding_run_id: runId,
            qualitative_entry_id: decision.qualitativeEntryId,
            code_id: newA.codeId,
            origin: 'researcher_added',
            status: 'accepted',
            rationale: newA.rationale,
            reviewed_by: userId,
            reviewed_at: now,
          } as CreationAttributes<SurveyCodingAssignment>, { transaction: t });
        }
      }

      // Update entry review status
      await EntryReviewModel.update(
        { status: decision.status, reviewed_by: userId, reviewed_at: now },
        {
          where: { id: decision.entryReviewId },
          transaction: t,
        },
      );
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
// ACCEPTANCE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Accept a coding run after validating all entries are resolved.
 *
 * Validation (fail-closed):
 * - Zero pending entry reviews
 * - Every eligible entry has exactly one terminal review state
 * - reviewed entries have ≥1 accepted assignment
 * - no_grouping_applies / uncodable entries have zero accepted assignments
 * - All accepted assignments reference current run + accepted codebook codes
 * - No restricted entries present
 * - No duplicate run-entry-code assignments
 *
 * After acceptance: supersedes prior accepted runs for same source+codebook.
 */
export async function acceptCodingRun(
  runId: number,
  userId: string,
): Promise<SurveyCodingRun> {
  return sequelize.transaction(async (t) => {
    const run = await CodingRunModel.findByPk(runId, { transaction: t });
    if (!run) throw new Error(`Coding run ${runId} not found`);
    if (run.status === 'accepted' || run.status === 'superseded') {
      throw new CodingRunImmutableError(runId);
    }

    // Load all entry reviews
    const reviews = await EntryReviewModel.findAll({
      where: { coding_run_id: runId },
      transaction: t,
    });

    // Validate: zero pending
    const pendingReviews = reviews.filter(r => r.status === 'pending');
    if (pendingReviews.length > 0) {
      throw new CodingRunNotReadyError(
        `Cannot accept coding run: ${pendingReviews.length} entries still pending review.`,
      );
    }

    // Load all assignments
    const allAssignments = await AssignmentModel.findAll({
      where: { coding_run_id: runId },
      transaction: t,
    });

    // Load accepted codebook codes
    const acceptedCodeIds = new Set(
      (await CodeModel.findAll({
        where: { codebook_id: run.codebook_id, status: 'accepted' },
        attributes: ['id'],
        transaction: t,
      })).map(c => (c as unknown as { id: number }).id),
    );

    // Per-entry validation
    for (const review of reviews) {
      const entryAssignments = allAssignments.filter(
        a => a.qualitative_entry_id === review.qualitative_entry_id,
      );
      const acceptedAssignments = entryAssignments.filter(a => a.status === 'accepted');

      if (review.status === 'reviewed') {
        // Reviewed entries must have ≥1 accepted assignment
        if (acceptedAssignments.length === 0) {
          throw new CodingRunNotReadyError(
            `Entry review ${review.id} is marked "reviewed" but has no accepted assignments.`,
          );
        }
      } else if (review.status === 'no_grouping_applies' || review.status === 'uncodable') {
        // No-grouping/uncodable entries must have zero accepted assignments
        if (acceptedAssignments.length > 0) {
          throw new CodingRunNotReadyError(
            `Entry review ${review.id} is "${review.status}" but has ${acceptedAssignments.length} accepted assignment(s).`,
          );
        }
      }

      // Validate accepted assignments reference current codebook codes
      for (const a of acceptedAssignments) {
        if (!acceptedCodeIds.has(a.code_id)) {
          throw new CodingRunNotReadyError(
            `Accepted assignment ${a.id} references code ${a.code_id} which is not an accepted code in the current codebook.`,
          );
        }
      }
    }

    // Check for duplicate run-entry-code assignments
    const assignmentKeys = new Set<string>();
    for (const a of allAssignments) {
      if (a.status !== 'rejected') {
        const key = `${a.qualitative_entry_id}-${a.code_id}`;
        if (assignmentKeys.has(key)) {
          throw new CodingRunNotReadyError(
            `Duplicate assignment: entry ${a.qualitative_entry_id} + code ${a.code_id} appears more than once (non-rejected).`,
          );
        }
        assignmentKeys.add(key);
      }
    }

    // Accept the run
    await run.update({
      status: 'accepted',
      reviewed_by: userId,
      reviewed_at: new Date(),
    }, { transaction: t });

    // Supersede previous accepted runs for same source+codebook
    await CodingRunModel.update(
      { status: 'superseded' },
      {
        where: {
          evidence_source_id: run.evidence_source_id,
          codebook_id: run.codebook_id,
          status: 'accepted',
          id: { [Op.ne]: runId },
        },
        transaction: t,
      },
    );

    return run;
  });
}

// ═══════════════════════════════════════════════════════════════════════
// VERSIONING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a new version from an accepted coding run.
 * Copies accepted assignments preserving original origin.
 */
export async function createNewVersion(
  acceptedRunId: number,
  userId: string,
): Promise<{ run: SurveyCodingRun; assignmentCount: number; entryReviewCount: number }> {
  return sequelize.transaction(async (t) => {
    const source = await CodingRunModel.findByPk(acceptedRunId, { transaction: t });
    if (!source) throw new Error(`Coding run ${acceptedRunId} not found`);
    if (source.status !== 'accepted') throw new Error('Can only create new version from an accepted coding run');

    const maxVersion = await CodingRunModel.max('version', {
      where: { evidence_source_id: source.evidence_source_id, codebook_id: source.codebook_id },
      transaction: t,
    }) as number | null;

    const newRun = await CodingRunModel.create({
      evidence_source_id: source.evidence_source_id,
      codebook_id: source.codebook_id,
      project_id: source.project_id,
      study_id: source.study_id,
      version: (maxVersion ?? 0) + 1,
      status: 'under_review',
      based_on_run_id: acceptedRunId,
      generation_metadata: { copied_from_run_id: acceptedRunId },
      created_by: userId,
    } as CreationAttributes<SurveyCodingRun>, { transaction: t });

    const newRunId = (newRun as unknown as { id: number }).id;

    // Copy accepted assignments preserving original origin
    const sourceAssignments = await AssignmentModel.findAll({
      where: { coding_run_id: acceptedRunId, status: 'accepted' },
      transaction: t,
    });

    let assignmentCount = 0;
    for (const sa of sourceAssignments) {
      await AssignmentModel.create({
        coding_run_id: newRunId,
        qualitative_entry_id: sa.qualitative_entry_id,
        code_id: sa.code_id,
        origin: sa.origin, // preserve original origin
        status: 'proposed', // start as proposed in new run
        rationale: sa.rationale,
      } as CreationAttributes<SurveyCodingAssignment>, { transaction: t });
      assignmentCount++;
    }

    // Create entry reviews (include entries from source that had any terminal status)
    const sourceReviews = await EntryReviewModel.findAll({
      where: { coding_run_id: acceptedRunId },
      transaction: t,
    });

    let entryReviewCount = 0;
    for (const sr of sourceReviews) {
      await EntryReviewModel.create({
        coding_run_id: newRunId,
        qualitative_entry_id: sr.qualitative_entry_id,
        status: 'pending',
      } as CreationAttributes<SurveyCodingEntryReview>, { transaction: t });
      entryReviewCount++;
    }

    return { run: newRun, assignmentCount, entryReviewCount };
  });
}

// ═══════════════════════════════════════════════════════════════════════
// EVIDENCE PROMOTION (Two-stage, idempotent — Correction #7)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Promote accepted patterns to evidence constructs.
 *
 * Called AFTER acceptCodingRun() succeeds (separate transaction).
 * Idempotent: uses coding_run_public_id + code_public_id as uniqueness key.
 * If a construct already exists for this combination, it is skipped.
 *
 * @returns Array of created evidence constructs (empty if already promoted)
 */
export async function promoteAcceptedPatterns(
  runId: number,
  projectId: number,
  studyId: number | null,
  evidenceSourceId: number,
  userId: string,
): Promise<EvidenceConstruct[]> {
  const run = await CodingRunModel.findByPk(runId);
  if (!run || run.status !== 'accepted') {
    throw new Error(`Coding run ${runId} is not accepted. Cannot promote patterns.`);
  }

  // Load codebook for version info
  const codebook = await CodebookModel.findByPk(run.codebook_id);
  if (!codebook) throw new Error(`Codebook ${run.codebook_id} not found`);

  // Load accepted assignments with entry + code info for aggregation
  const acceptedAssignments = await AssignmentModel.findAll({
    where: { coding_run_id: runId, status: 'accepted' },
  });

  if (acceptedAssignments.length === 0) return [];

  // Build assignment rows for aggregation
  const assignmentRows: Array<{ respondent_key: string; code_public_id: string; code_label: string; code_definition: string }> = [];
  const entryIds = new Set<number>();

  for (const a of acceptedAssignments) {
    const entry = await EntryModel.findByPk(a.qualitative_entry_id);
    const code = await CodeModel.findByPk(a.code_id);
    if (!entry || !code) continue;

    entryIds.add((entry as unknown as { id: number }).id);
    assignmentRows.push({
      respondent_key: entry.respondent_key,
      code_public_id: code.public_id,
      code_label: code.label,
      code_definition: code.definition,
    });
  }

  // Get all eligible respondent keys
  const allEntries = await EntryModel.findAll({
    where: { evidence_source_id: evidenceSourceId, pii_status: ['clear', 'redacted'] },
  });
  const eligibleRespondentKeys = new Set(allEntries.map(e => e.respondent_key));

  // Compute aggregation
  const aggregation = computeQualitativeAggregation(assignmentRows, eligibleRespondentKeys);

  // Load all qualitative constructs for this project once (bounded by codes × run versions)
  const EvidenceConstructModel = sequelize.models.EvidenceConstruct;
  const existingConstructs = await EvidenceConstructModel.findAll({
    where: {
      project_id: projectId,
      construct_type: ['survey_qualitative_pattern', 'survey_individual_observation'],
    },
  });

  // Build a set of already-promoted keys: "construct_type|coding_run_public_id|code_public_id"
  const promotedKeys = new Set<string>();
  for (const c of existingConstructs) {
    const payload = (c as unknown as { payload: Record<string, unknown> | null }).payload;
    const type = (c as unknown as { construct_type: string }).construct_type;
    if (payload?.coding_run_public_id && payload?.code_public_id) {
      promotedKeys.add(`${type}|${payload.coding_run_public_id}|${payload.code_public_id}`);
    }
  }

  const createdConstructs: EvidenceConstruct[] = [];

  const promotePattern = async (
    pattern: PatternStat,
    constructType: 'survey_qualitative_pattern' | 'survey_individual_observation',
  ) => {
    // Idempotency: exact match on construct_type + coding_run_public_id + code_public_id
    const key = `${constructType}|${run.public_id}|${pattern.codePublicId}`;
    if (promotedKeys.has(key)) {
      return; // Already promoted for this exact run + code + type
    }

    const result = await createDerivation({
      construct: {
        project_id: projectId,
        study_id: studyId,
        construct_type: constructType,
        label: pattern.codeLabel,
        payload: {
          code_public_id: pattern.codePublicId,
          code_label: pattern.codeLabel,
          code_definition: pattern.codeDefinition,
          codebook_public_id: codebook.public_id,
          codebook_version: codebook.version,
          coding_run_public_id: run.public_id,
          coding_run_version: run.version,
          numerator: pattern.uniqueRespondentCount,
          denominator: pattern.denominator,
          denominator_basis: pattern.denominatorBasis,
          eligible_entry_count: aggregation.eligibleRespondentCount,
          accepted_entry_count: pattern.acceptedEntryCount,
          display_frequency: pattern.displayFrequency,
          derivation_method: 'deterministic_from_accepted_coding',
          method_version: '1.0',
        },
        derivation_type: 'deterministic',
        derivation_context: {
          method: 'deterministic_from_accepted_coding',
          coding_run_id: run.public_id,
          version: '1.0',
        },
        status: 'accepted',
        created_by: userId,
      },
      relationships: [{
        from_source_id: evidenceSourceId,
        to_construct_id: 0, // sentinel: resolves to created construct
        relationship_type: 'DERIVED_FROM' as const,
        provenance: {
          method: 'deterministic_from_accepted_coding',
          coding_run_public_id: run.public_id,
          codebook_public_id: codebook.public_id,
        },
      }],
    });

    createdConstructs.push(result.construct);
  };

  // Promote recurring patterns (≥2 respondents)
  for (const pattern of aggregation.recurringPatterns) {
    await promotePattern(pattern, 'survey_qualitative_pattern');
  }

  // Promote individual observations (1 respondent)
  for (const pattern of aggregation.individualObservations) {
    await promotePattern(pattern, 'survey_individual_observation');
  }

  return createdConstructs;
}

// ═══════════════════════════════════════════════════════════════════════
// DETERMINISTIC QUOTE SELECTION
// ═══════════════════════════════════════════════════════════════════════

export interface IllustrativeQuote {
  respondentDisplayId: string;
  fieldDisplayName: string;
  governedText: string;
}

/**
 * Select up to 2 illustrative quotes per code from accepted assignments.
 * Deterministic: ORDER BY source_row_index ASC, qualitative_entry_id ASC.
 * Prefers quotes from distinct respondents.
 * Uses governed text only (clear→entry_text, redacted→redacted_text).
 */
export async function selectIllustrativeQuotes(
  runId: number,
  codePublicId: string,
): Promise<IllustrativeQuote[]> {
  const code = await CodeModel.findOne({ where: { public_id: codePublicId } });
  if (!code) return [];

  const assignments = await AssignmentModel.findAll({
    where: {
      coding_run_id: runId,
      code_id: (code as unknown as { id: number }).id,
      status: 'accepted',
    },
  });

  if (assignments.length === 0) return [];

  // Load entries for all assignments
  const entries: Array<{
    entry: SurveyQualitativeEntry;
    respondentKey: string;
    sourceRowIndex: number;
    entryId: number;
  }> = [];

  for (const a of assignments) {
    const entry = await EntryModel.findByPk(a.qualitative_entry_id);
    if (!entry) continue;

    const text = getAnalysisEligibleContent(entry);
    if (!text) continue; // restricted entries excluded

    entries.push({
      entry,
      respondentKey: entry.respondent_key,
      sourceRowIndex: entry.source_row_index ?? 0,
      entryId: (entry as unknown as { id: number }).id,
    });
  }

  // Sort deterministically
  entries.sort((a, b) => {
    if (a.sourceRowIndex !== b.sourceRowIndex) return a.sourceRowIndex - b.sourceRowIndex;
    return a.entryId - b.entryId;
  });

  if (entries.length === 0) return [];

  // Select first entry
  const first = entries[0];
  const firstText = getAnalysisEligibleContent(first.entry)!;
  const quotes: IllustrativeQuote[] = [{
    respondentDisplayId: first.entry.display_respondent_id,
    fieldDisplayName: first.entry.field_display_name,
    governedText: firstText,
  }];

  // Select second entry from a different respondent
  const second = entries.find(e => e.respondentKey !== first.respondentKey);
  if (second) {
    const secondText = getAnalysisEligibleContent(second.entry)!;
    quotes.push({
      respondentDisplayId: second.entry.display_respondent_id,
      fieldDisplayName: second.entry.field_display_name,
      governedText: secondText,
    });
  }

  return quotes;
}
