/**
 * Survey Codebook Service
 *
 * CRUD + versioning + acceptance for qualitative codebooks.
 * Accepted versions are immutable. Editing creates a new version.
 * Supersession occurs only after replacement is accepted.
 */

import { Op, type Transaction, type CreationAttributes } from 'sequelize';
import sequelize from '../database';
import type { SurveyCodebook } from '../database/models/survey_codebook';
import type { SurveyCode } from '../database/models/survey_code';
import type { SurveyCodeExample } from '../database/models/survey_code_example';
import type { SurveyQualitativeEntry } from '../database/models/survey_qualitative_entry';
import { getAnalysisEligibleContent, isPrivacyReviewComplete } from './content-governance.service';

const CodebookModel = sequelize.models.SurveyCodebook as typeof SurveyCodebook;
const CodeModel = sequelize.models.SurveyCode as typeof SurveyCode;
const ExampleModel = sequelize.models.SurveyCodeExample as typeof SurveyCodeExample;
const EntryModel = sequelize.models.SurveyQualitativeEntry as typeof SurveyQualitativeEntry;

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface ProposedCode {
  code_key: string;
  label: string;
  definition: string;
  include_when: string;
  exclude_when?: string;
  example_entry_public_ids: string[];
  analytic_relevance?: 'research' | 'governance_only';
}

export class CodebookNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodebookNotReadyError';
  }
}

export class CodebookImmutableError extends Error {
  constructor(codebookId: number) {
    super(`Codebook ${codebookId} is accepted and immutable. Create a new version to make changes.`);
    this.name = 'CodebookImmutableError';
  }
}

// ═══════════════════════════════════════════════════════════════════════
// QUALITATIVE ENTRY QUERIES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get analysis-eligible qualitative entries for codebook generation.
 * Fails if any entries remain pending (privacy review incomplete).
 */
export async function getEligibleEntries(
  evidenceSourceId: number,
): Promise<SurveyQualitativeEntry[]> {
  const allEntries = await EntryModel.findAll({
    where: { evidence_source_id: evidenceSourceId },
    order: [['field_name', 'ASC'], ['source_row_index', 'ASC']],
  });

  if (!isPrivacyReviewComplete(allEntries as Array<{ pii_status: 'pending' | 'clear' | 'redacted' | 'restricted' }>)) {
    throw new CodebookNotReadyError(
      'Privacy review is not complete. All open-text entries must be reviewed before codebook generation.',
    );
  }

  // Return only entries with eligible content (exclude restricted)
  return allEntries.filter(e => {
    const text = getAnalysisEligibleContent(e);
    return text !== null;
  });
}

// ═══════════════════════════════════════════════════════════════════════
// CODEBOOK CRUD
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a new draft codebook with proposed codes.
 */
export async function createDraftCodebook(
  evidenceSourceId: number,
  projectId: number,
  studyId: number | null,
  userId: string,
  proposedCodes: ProposedCode[],
  generationMetadata: Record<string, unknown>,
): Promise<{ codebook: SurveyCodebook; codes: SurveyCode[] }> {
  return sequelize.transaction(async (t) => {
    // Determine next version
    const maxVersion = await CodebookModel.max('version', {
      where: { evidence_source_id: evidenceSourceId },
      transaction: t,
    }) as number | null;
    const version = (maxVersion ?? 0) + 1;

    const codebook = await CodebookModel.create({
      evidence_source_id: evidenceSourceId,
      project_id: projectId,
      study_id: studyId,
      version,
      status: 'under_review',
      generation_metadata: generationMetadata,
      created_by: userId,
    } as CreationAttributes<SurveyCodebook>, { transaction: t });

    const codes: SurveyCode[] = [];
    for (let i = 0; i < proposedCodes.length; i++) {
      const pc = proposedCodes[i];

      const code = await CodeModel.create({
        codebook_id: (codebook as unknown as { id: number }).id,
        code_key: pc.code_key,
        label: pc.label,
        definition: pc.definition,
        include_when: pc.include_when,
        exclude_when: pc.exclude_when ?? null,
        origin: 'qori_proposed',
        status: 'proposed',
        sort_order: i,
        metadata: {
          ...(pc.analytic_relevance ? { analytic_relevance: pc.analytic_relevance } : {}),
        },
      } as CreationAttributes<SurveyCode>, { transaction: t });

      // Create example references
      for (const entryPublicId of pc.example_entry_public_ids) {
        const entry = await EntryModel.findOne({
          where: { public_id: entryPublicId, evidence_source_id: evidenceSourceId },
          transaction: t,
        });
        if (entry) {
          await ExampleModel.create({
            code_id: (code as unknown as { id: number }).id,
            qualitative_entry_id: (entry as unknown as { id: number }).id,
            example_type: 'include',
          } as CreationAttributes<SurveyCodeExample>, { transaction: t });
        }
      }

      codes.push(code);
    }

    return { codebook, codes };
  });
}

/**
 * Get a codebook with its codes and examples.
 */
export async function getCodebookWithCodes(
  codebookId: number,
): Promise<{ codebook: SurveyCodebook; codes: SurveyCode[] } | null> {
  const codebook = await CodebookModel.findByPk(codebookId);
  if (!codebook) return null;

  const codes = await CodeModel.findAll({
    where: { codebook_id: codebookId },
    order: [['sort_order', 'ASC']],
  });

  return { codebook, codes };
}

/**
 * Get all codebook versions for an evidence source.
 */
export async function getCodebooksForSource(
  evidenceSourceId: number,
): Promise<SurveyCodebook[]> {
  return CodebookModel.findAll({
    where: { evidence_source_id: evidenceSourceId },
    order: [['version', 'DESC']],
  });
}

/**
 * Find an active unaccepted codebook for an evidence source.
 * Returns the most recent draft or under_review codebook, or null.
 *
 * Used for idempotency: if generation succeeded but DM delivery failed,
 * retry should reuse the existing codebook rather than regenerating.
 */
export async function findActiveUnacceptedCodebook(
  evidenceSourceId: number,
): Promise<SurveyCodebook | null> {
  return CodebookModel.findOne({
    where: {
      evidence_source_id: evidenceSourceId,
      status: ['draft', 'under_review'],
    },
    order: [['version', 'DESC']],
  });
}

/**
 * Find the most recent accepted codebook for an evidence source.
 */
export async function findAcceptedCodebook(
  evidenceSourceId: number,
): Promise<SurveyCodebook | null> {
  return CodebookModel.findOne({
    where: {
      evidence_source_id: evidenceSourceId,
      status: 'accepted',
    },
    order: [['version', 'DESC']],
  });
}

// ═══════════════════════════════════════════════════════════════════════
// CODE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Update a code's status (accept/remove) or definition.
 * @throws CodebookImmutableError if codebook is accepted
 */
export async function updateCode(
  codeId: number,
  updates: Partial<Pick<SurveyCode, 'status' | 'label' | 'definition' | 'include_when' | 'exclude_when'>>,
  transaction?: Transaction,
): Promise<SurveyCode | null> {
  const code = await CodeModel.findByPk(codeId, { transaction });
  if (!code) return null;

  // Check codebook is not accepted
  const codebook = await CodebookModel.findByPk(code.codebook_id, { transaction });
  if (codebook && codebook.status === 'accepted') {
    throw new CodebookImmutableError(codebook.id);
  }

  await code.update(updates, { transaction });
  return code;
}

/**
 * Add a researcher-created code to a codebook.
 * @throws CodebookImmutableError if codebook is accepted
 */
export async function addResearcherCode(
  codebookId: number,
  codeData: { code_key: string; label: string; definition: string; include_when: string; exclude_when?: string },
  transaction?: Transaction,
): Promise<SurveyCode> {
  const codebook = await CodebookModel.findByPk(codebookId, { transaction });
  if (!codebook) throw new Error(`Codebook ${codebookId} not found`);
  if (codebook.status === 'accepted') throw new CodebookImmutableError(codebookId);

  const maxOrder = await CodeModel.max('sort_order', {
    where: { codebook_id: codebookId },
    transaction,
  }) as number | null;

  return CodeModel.create({
    codebook_id: codebookId,
    code_key: codeData.code_key,
    label: codeData.label,
    definition: codeData.definition,
    include_when: codeData.include_when,
    exclude_when: codeData.exclude_when ?? null,
    origin: 'researcher_added',
    status: 'accepted', // researcher-added codes are immediately accepted
    sort_order: (maxOrder ?? 0) + 1,
    metadata: {},
  } as CreationAttributes<SurveyCode>, { transaction });
}

// ═══════════════════════════════════════════════════════════════════════
// ACCEPTANCE + VERSIONING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Accept a codebook version. Makes it immutable.
 *
 * Validation:
 * - At least one accepted code
 * - Every accepted code has label + definition + include_when
 * - No duplicate normalized labels among accepted codes
 * - No removed code is treated as active
 *
 * If a previous version was accepted, it becomes superseded.
 */
export async function acceptCodebook(
  codebookId: number,
  userId: string,
): Promise<SurveyCodebook> {
  return sequelize.transaction(async (t) => {
    const codebook = await CodebookModel.findByPk(codebookId, { transaction: t });
    if (!codebook) throw new Error(`Codebook ${codebookId} not found`);
    if (codebook.status === 'accepted') throw new CodebookImmutableError(codebookId);

    const codes = await CodeModel.findAll({
      where: { codebook_id: codebookId },
      transaction: t,
    });

    const activeCodes = codes.filter(c => c.status === 'accepted');

    // Validate: at least one accepted code
    if (activeCodes.length === 0) {
      throw new Error('Cannot accept codebook: at least one code must be accepted.');
    }

    // Validate: no duplicate normalized labels
    const labels = new Set<string>();
    for (const code of activeCodes) {
      const normalized = code.label.toLowerCase().trim();
      if (labels.has(normalized)) {
        throw new Error(`Duplicate code label: "${code.label}". Each accepted code must have a unique label.`);
      }
      labels.add(normalized);
    }

    // Accept the codebook
    await codebook.update({
      status: 'accepted',
      reviewed_by: userId,
      reviewed_at: new Date(),
    }, { transaction: t });

    // Supersede previous accepted version if exists
    if (codebook.based_on_codebook_id) {
      const previous = await CodebookModel.findByPk(codebook.based_on_codebook_id, { transaction: t });
      if (previous && previous.status === 'accepted') {
        await previous.update({ status: 'superseded' }, { transaction: t });
      }
    } else {
      // Check for any other accepted codebook for this source
      await CodebookModel.update(
        { status: 'superseded' },
        {
          where: {
            evidence_source_id: codebook.evidence_source_id,
            status: 'accepted',
            id: { [Op.ne]: codebookId },
          },
          transaction: t,
        },
      );
    }

    return codebook;
  });
}

/**
 * Create a new version from an accepted codebook.
 * Copies active codes with origin='inherited'.
 */
export async function createNewVersion(
  acceptedCodebookId: number,
  userId: string,
): Promise<{ codebook: SurveyCodebook; codes: SurveyCode[] }> {
  return sequelize.transaction(async (t) => {
    const source = await CodebookModel.findByPk(acceptedCodebookId, { transaction: t });
    if (!source) throw new Error(`Codebook ${acceptedCodebookId} not found`);
    if (source.status !== 'accepted') throw new Error('Can only create new version from an accepted codebook');

    const maxVersion = await CodebookModel.max('version', {
      where: { evidence_source_id: source.evidence_source_id },
      transaction: t,
    }) as number | null;

    const newCodebook = await CodebookModel.create({
      evidence_source_id: source.evidence_source_id,
      project_id: source.project_id,
      study_id: source.study_id,
      version: (maxVersion ?? 0) + 1,
      status: 'draft',
      method: source.method,
      based_on_codebook_id: acceptedCodebookId,
      generation_metadata: { inherited_from: acceptedCodebookId },
      created_by: userId,
    } as CreationAttributes<SurveyCodebook>, { transaction: t });

    // Copy active codes as inherited
    const sourceCodes = await CodeModel.findAll({
      where: { codebook_id: acceptedCodebookId, status: 'accepted' },
      order: [['sort_order', 'ASC']],
      transaction: t,
    });

    const newCodes: SurveyCode[] = [];
    for (const sc of sourceCodes) {
      const nc = await CodeModel.create({
        codebook_id: (newCodebook as unknown as { id: number }).id,
        code_key: sc.code_key,
        label: sc.label,
        definition: sc.definition,
        include_when: sc.include_when,
        exclude_when: sc.exclude_when,
        origin: 'inherited',
        status: 'accepted',
        sort_order: sc.sort_order,
        metadata: { inherited_from_code_id: sc.id },
      } as CreationAttributes<SurveyCode>, { transaction: t });
      newCodes.push(nc);
    }

    return { codebook: newCodebook, codes: newCodes };
  });
}
