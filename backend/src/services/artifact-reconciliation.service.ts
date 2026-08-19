/**
 * Artifact Reconciliation Service (GOV-2E)
 *
 * After DSAR redaction (G2-D), reconciles affected external artifacts
 * (GitHub markdown documents and issues) without prose matching, without
 * LLM calls, and without changing unrelated content.
 *
 * Remediation classes:
 *   A — DETERMINISTIC PATCH: anchor-identified block → [REDACTED — DSAR]
 *   B — DETERMINISTIC RE-RENDER: not implemented (no current template meets criteria)
 *   C — GENERATIVE REGENERATION: would require LLM → manual review
 *   D — MANUAL: no structured remediation path → manual review
 *
 * Inputs: affected construct/artifact identities from G2-D DSARDeleteResult.
 * No participant_code search. No respondent_key search. No prose matching.
 */

import { Op, type Sequelize } from 'sequelize';
import defaultSequelize from '../database';
import { computeCanonicalAnchor } from './deep-link.service';
import type { ResearchArtifact } from '../database/models/research_artifact';
import type { EvidenceConstruct } from '../database/models/evidence_construct';
import type { ArtifactEvidenceRef } from '../database/models/artifact_evidence_ref';
import type { CreatedIssue } from '../database/models/created_issue';
import type { AffectedArtifact } from './dsar-delete.service';

function models(db?: Sequelize) {
  const s = db ?? defaultSequelize;
  return {
    Artifact: s.models.ResearchArtifact as typeof ResearchArtifact,
    Construct: s.models.EvidenceConstruct as typeof EvidenceConstruct,
    ArtifactRef: s.models.ArtifactEvidenceRef as typeof ArtifactEvidenceRef,
    CreatedIssue: s.models.CreatedIssue as typeof CreatedIssue,
    db: s,
  };
}

// ─── Result types ───────────────────────────────────────────────

export type RemediationClass = 'A' | 'B' | 'C' | 'D';
export type ReconciliationOutcome =
  | 'patched'
  | 'rerendered'
  | 'manual_review_required'
  | 'failed'
  | 'already_reconciled';

export interface ReconciliationRecord {
  artifact_public_id: string;
  remediation_class: RemediationClass;
  outcome: ReconciliationOutcome;
  timestamp: string;
  github_target: string | null;
  error: string | null;
  affected_construct_public_ids: string[];
}

export interface ManualReviewItem {
  artifact_display_name: string;
  artifact_type: string;
  artifact_public_id: string;
  github_url: string | null;
  reason: string;
  affected_construct_public_ids: string[];
}

export interface ReconciliationResult {
  records: ReconciliationRecord[];
  manual_review: ManualReviewItem[];
  summary: {
    class_a_patched: number;
    class_b_rerendered: number;
    class_c_manual: number;
    class_d_manual: number;
    failed: number;
    already_reconciled: number;
  };
}

// ─── Anchor-based patching (Class A) ────────────────────────────

/**
 * Regex to find an anchored evidence block in rendered markdown.
 *
 * Matches:
 *   <a id="ev-{uuid}"></a>
 *   ### DisplayId — Label
 *   (optional content lines)
 *   ...up to the next <a id="ev-"> or ## heading or --- or EOF
 *
 * Captures the full block including anchor, heading, and content.
 */
function buildAnchorBlockRegex(anchor: string): RegExp {
  // Escape the anchor for regex
  const escaped = anchor.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  // Match from anchor tag through to the next anchor tag, ## heading, ---, or EOF
  return new RegExp(
    `(<a id="${escaped}"><\\/a>\\s*\\n` +       // anchor tag
    `(?:###[^\\n]*\\n)` +                         // ### heading line
    `(?:[\\s\\S]*?))` +                            // content (non-greedy)
    `(?=<a id="ev-|^##\\s|^---\\s*$|$(?!\\n))`,  // lookahead: next anchor, ## heading, ---, or EOF
    'm',
  );
}

/**
 * Patch a single anchored block in markdown content.
 * Returns the patched content, or null if anchor not found.
 */
export function patchAnchoredBlock(
  content: string,
  constructPublicId: string,
): { patched: string; found: boolean } {
  const anchor = computeCanonicalAnchor(constructPublicId);
  const anchorTag = `<a id="${anchor}"></a>`;

  // Check anchor exists at all
  if (!content.includes(anchorTag)) {
    return { patched: content, found: false };
  }

  // Strategy: find the anchor tag, then find the associated ### heading,
  // and replace the content block while preserving the anchor + heading structure
  const anchorIndex = content.indexOf(anchorTag);
  const afterAnchor = content.substring(anchorIndex + anchorTag.length);

  // Find the ### heading line after the anchor
  const headingMatch = afterAnchor.match(/^\s*\n(### [^\n]+)\n/);
  if (!headingMatch) {
    // Anchor exists but no heading — ambiguous structure
    return { patched: content, found: false };
  }

  const headingLine = headingMatch[1];
  const afterHeading = afterAnchor.substring(headingMatch[0].length);

  // Find the end of this block: next anchor, next ## heading, ---, or EOF
  const blockEndPatterns = [
    afterHeading.indexOf('<a id="ev-'),
    afterHeading.search(/^## /m),
    afterHeading.search(/^---\s*$/m),
  ].filter(i => i >= 0);

  const blockEnd = blockEndPatterns.length > 0
    ? Math.min(...blockEndPatterns)
    : afterHeading.length;

  // Reconstruct: anchor + heading + redacted content
  const beforeBlock = content.substring(0, anchorIndex);
  const remainingContent = afterHeading.substring(blockEnd);

  const redactedBlock =
    `${anchorTag}\n\n${headingLine}\n\n[REDACTED — DSAR]\n\n`;

  return {
    patched: beforeBlock + redactedBlock + remainingContent,
    found: true,
  };
}

/**
 * Patch multiple anchored blocks in a single markdown document.
 */
export function patchMultipleBlocks(
  content: string,
  constructPublicIds: string[],
): { patched: string; found: string[]; missing: string[] } {
  let result = content;
  const found: string[] = [];
  const missing: string[] = [];

  for (const publicId of constructPublicIds) {
    const { patched, found: wasFound } = patchAnchoredBlock(result, publicId);
    if (wasFound) {
      result = patched;
      found.push(publicId);
    } else {
      missing.push(publicId);
    }
  }

  return { patched: result, found, missing };
}

// ─── GitHub issue patching ──────────────────────────────────────

/**
 * Patch a GitHub issue body by replacing anchored blocks.
 * Issues use the same ev-{uuid} anchor format as markdown artifacts.
 */
export function patchIssueBody(
  body: string,
  constructPublicIds: string[],
): { patched: string; found: string[]; missing: string[] } {
  // Issues may use simpler block structure — try the same anchor approach
  return patchMultipleBlocks(body, constructPublicIds);
}

// ─── Classification ─────────────────────────────────────────────

/**
 * Classify an artifact for remediation.
 *
 * Class A: Written artifact with canonical anchors for affected constructs
 * Class B: Deterministic re-render (no current template qualifies — all use ai_generation_tasks)
 * Class C: Artifact was generated with LLM → cannot safely auto-regenerate
 * Class D: No structured path (no anchors, pre-PH-6D2, or unknown)
 */
export function classifyArtifact(
  artifact: ResearchArtifact,
  affectedConstructPublicIds: string[],
  artifactContent: string | null,
): RemediationClass {
  // No content available → manual review
  if (artifactContent === null) return 'D';

  // No path/url → manual review
  if (!artifact.path && !artifact.url) return 'D';

  // Check if any affected construct has an anchor in the content
  const hasAnchors = affectedConstructPublicIds.some(publicId => {
    const anchor = computeCanonicalAnchor(publicId);
    return artifactContent.includes(`<a id="${anchor}">`);
  });

  if (hasAnchors) {
    return 'A'; // Deterministic patch via anchors
  }

  // Artifact exists but no anchors for affected constructs → pre-PH-6D2 or
  // constructs were not rendered with anchors. All current templates use
  // ai_generation_tasks so Class B is not applicable.
  // This is Class C (generative) if it has a template_id, otherwise D.
  if (artifact.template_id) {
    return 'C'; // Would need LLM to regenerate
  }

  return 'D'; // No structured path
}

// ─── Core reconciliation ────────────────────────────────────────

export interface ReconcileInput {
  /** Affected artifacts from G2-D DSARDeleteResult */
  affectedArtifacts: AffectedArtifact[];
  /** The data_subject public_id (for reconciliation tracking) */
  subjectPublicId: string;
  /** Actor performing reconciliation */
  actorUserId: string;
  /** GitHub operations — injectable for testing */
  github?: {
    fetchContent: (repo: string, path: string) => Promise<string | null>;
    writeContent: (path: string, content: string) => Promise<{ sha: string; url: string }>;
    fetchIssueBody: (repo: string, issueNumber: number) => Promise<string | null>;
    updateIssueBody: (repo: string, issueNumber: number, body: string) => Promise<void>;
  };
}

/**
 * Reconcile all affected artifacts after a DSAR deletion.
 *
 * For each affected artifact:
 * 1. Group affected constructs by artifact
 * 2. Classify the artifact (A/B/C/D)
 * 3. For Class A: fetch content, patch anchored blocks, write back
 * 4. For Class C/D: add to manual review list
 *
 * Idempotent: re-running on already-patched content is safe
 * (anchor blocks already contain [REDACTED — DSAR]).
 */
export async function reconcileAffectedArtifacts(
  input: ReconcileInput,
  db?: Sequelize,
): Promise<ReconciliationResult> {
  const m = models(db);
  const records: ReconciliationRecord[] = [];
  const manualReview: ManualReviewItem[] = [];
  const summary = {
    class_a_patched: 0,
    class_b_rerendered: 0,
    class_c_manual: 0,
    class_d_manual: 0,
    failed: 0,
    already_reconciled: 0,
  };

  if (input.affectedArtifacts.length === 0) {
    return { records, manual_review: manualReview, summary };
  }

  // Group affected constructs by artifact
  const artifactGroups = new Map<number, {
    artifact_id: number;
    artifact_public_id: string;
    construct_public_ids: string[];
  }>();

  for (const affected of input.affectedArtifacts) {
    const existing = artifactGroups.get(affected.artifact_id);
    if (existing) {
      if (!existing.construct_public_ids.includes(affected.via_construct_public_id)) {
        existing.construct_public_ids.push(affected.via_construct_public_id);
      }
    } else {
      artifactGroups.set(affected.artifact_id, {
        artifact_id: affected.artifact_id,
        artifact_public_id: affected.artifact_public_id,
        construct_public_ids: [affected.via_construct_public_id],
      });
    }
  }

  // Process each artifact
  for (const [artifactId, group] of artifactGroups) {
    const artifact = await m.Artifact.findByPk(artifactId);
    if (!artifact) {
      records.push({
        artifact_public_id: group.artifact_public_id,
        remediation_class: 'D',
        outcome: 'failed',
        timestamp: new Date().toISOString(),
        github_target: null,
        error: 'artifact not found in database',
        affected_construct_public_ids: group.construct_public_ids,
      });
      summary.failed++;
      continue;
    }

    // Fetch current content from GitHub
    let content: string | null = null;
    if (artifact.path && artifact.repo && input.github?.fetchContent) {
      try {
        content = await input.github.fetchContent(artifact.repo, artifact.path);
      } catch {
        // Content fetch failure — will classify as D
      }
    }

    const remediationClass = classifyArtifact(artifact, group.construct_public_ids, content);

    if (remediationClass === 'A' && content !== null) {
      // ── Class A: Deterministic patch ──
      const { patched, found, missing } = patchMultipleBlocks(content, group.construct_public_ids);

      // Check idempotency — if patched === content, already reconciled
      if (patched === content) {
        records.push({
          artifact_public_id: group.artifact_public_id,
          remediation_class: 'A',
          outcome: 'already_reconciled',
          timestamp: new Date().toISOString(),
          github_target: artifact.url ?? artifact.path,
          error: null,
          affected_construct_public_ids: group.construct_public_ids,
        });
        summary.already_reconciled++;
        continue;
      }

      // Write patched content back to GitHub
      if (input.github?.writeContent && artifact.path) {
        try {
          const writeResult = await input.github.writeContent(artifact.path, patched);

          // Update artifact location metadata
          await m.Artifact.update(
            {
              commit_sha: writeResult.sha,
              url: writeResult.url,
              updated_at: new Date(),
            },
            { where: { id: artifactId } },
          );

          records.push({
            artifact_public_id: group.artifact_public_id,
            remediation_class: 'A',
            outcome: 'patched',
            timestamp: new Date().toISOString(),
            github_target: writeResult.url,
            error: missing.length > 0
              ? `${found.length} blocks patched, ${missing.length} anchors not found`
              : null,
            affected_construct_public_ids: group.construct_public_ids,
          });
          summary.class_a_patched++;

          // If some anchors were missing, also add to manual review
          if (missing.length > 0) {
            manualReview.push({
              artifact_display_name: artifact.title ?? artifact.template_id,
              artifact_type: artifact.artifact_type,
              artifact_public_id: group.artifact_public_id,
              github_url: writeResult.url,
              reason: `${missing.length} construct anchor(s) not found in rendered content — partial patch applied`,
              affected_construct_public_ids: missing,
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          records.push({
            artifact_public_id: group.artifact_public_id,
            remediation_class: 'A',
            outcome: 'failed',
            timestamp: new Date().toISOString(),
            github_target: artifact.url ?? artifact.path,
            error: `GitHub write failed: ${message}`,
            affected_construct_public_ids: group.construct_public_ids,
          });
          summary.failed++;
        }
      } else {
        // No GitHub writer available (test mode or missing config)
        records.push({
          artifact_public_id: group.artifact_public_id,
          remediation_class: 'A',
          outcome: 'failed',
          timestamp: new Date().toISOString(),
          github_target: artifact.path,
          error: 'no GitHub writer available',
          affected_construct_public_ids: group.construct_public_ids,
        });
        summary.failed++;
      }
    } else if (remediationClass === 'C') {
      // ── Class C: Generative — manual review ──
      records.push({
        artifact_public_id: group.artifact_public_id,
        remediation_class: 'C',
        outcome: 'manual_review_required',
        timestamp: new Date().toISOString(),
        github_target: artifact.url ?? artifact.path,
        error: null,
        affected_construct_public_ids: group.construct_public_ids,
      });
      manualReview.push({
        artifact_display_name: artifact.title ?? artifact.template_id,
        artifact_type: artifact.artifact_type,
        artifact_public_id: group.artifact_public_id,
        github_url: artifact.url,
        reason: 'Artifact was generated with LLM (ai_generation_tasks). Cannot safely auto-remediate — requires human review and potential regeneration.',
        affected_construct_public_ids: group.construct_public_ids,
      });
      summary.class_c_manual++;
    } else {
      // ── Class D: Manual review ──
      let reason = 'No structured remediation path available.';
      if (content === null && artifact.path) {
        reason = 'Could not fetch artifact content from GitHub.';
      } else if (!artifact.path && !artifact.url) {
        reason = 'Artifact has no persisted GitHub location (path/url).';
      } else if (content !== null) {
        reason = 'Affected construct anchors not found in rendered content (pre-PH-6D2 artifact).';
      }

      records.push({
        artifact_public_id: group.artifact_public_id,
        remediation_class: 'D',
        outcome: 'manual_review_required',
        timestamp: new Date().toISOString(),
        github_target: artifact.url ?? artifact.path ?? null,
        error: null,
        affected_construct_public_ids: group.construct_public_ids,
      });
      manualReview.push({
        artifact_display_name: artifact.title ?? artifact.template_id ?? 'unknown',
        artifact_type: artifact.artifact_type,
        artifact_public_id: group.artifact_public_id,
        github_url: artifact.url,
        reason,
        affected_construct_public_ids: group.construct_public_ids,
      });
      summary.class_d_manual++;
    }
  }

  // ── GitHub issues ──
  // Check for issues linked to affected constructs via CreatedIssue
  // CreatedIssue links ticket_id → construct, but currently there's no
  // direct construct_id FK. Issues are linked via ticket_id which maps to
  // ticket_candidate construct labels. Since we can't resolve via FK without
  // prose matching, issues without canonical anchor support go to manual review.
  // This is the correct behavior per spec section 4.

  return { records, manual_review: manualReview, summary };
}

/**
 * Reconcile GitHub issues affected by DSAR deletion.
 *
 * Resolves issues via CreatedIssue records, fetches body, patches anchored
 * blocks, and updates the issue.
 *
 * Issues without canonical anchors → manual review (per spec section 4).
 */
export async function reconcileAffectedIssues(
  affectedConstructPublicIds: string[],
  github: {
    fetchIssueBody: (repo: string, issueNumber: number) => Promise<string | null>;
    updateIssueBody: (repo: string, issueNumber: number, body: string) => Promise<void>;
  },
  db?: Sequelize,
): Promise<ReconciliationRecord[]> {
  const m = models(db);
  const records: ReconciliationRecord[] = [];

  // Find constructs with ticket_candidate type that are affected
  const affectedConstructs = await m.Construct.findAll({
    where: {
      public_id: { [Op.in]: affectedConstructPublicIds },
      construct_type: 'ticket_candidate',
    },
  });

  if (affectedConstructs.length === 0) return records;

  // For each ticket_candidate, find CreatedIssue by ticket_id = construct.label
  for (const construct of affectedConstructs) {
    const issue = await m.CreatedIssue.findOne({
      where: { ticket_id: construct.label ?? '' },
    });

    if (!issue || !issue.github_issue_number || !issue.github_repo) {
      continue; // No issue to patch
    }

    try {
      const body = await github.fetchIssueBody(issue.github_repo, issue.github_issue_number);
      if (!body) {
        records.push({
          artifact_public_id: issue.public_id,
          remediation_class: 'D',
          outcome: 'manual_review_required',
          timestamp: new Date().toISOString(),
          github_target: issue.github_url,
          error: 'Could not fetch issue body',
          affected_construct_public_ids: [construct.public_id],
        });
        continue;
      }

      const anchor = computeCanonicalAnchor(construct.public_id);
      if (!body.includes(`<a id="${anchor}">`)) {
        // No canonical anchor in issue → manual review
        records.push({
          artifact_public_id: issue.public_id,
          remediation_class: 'D',
          outcome: 'manual_review_required',
          timestamp: new Date().toISOString(),
          github_target: issue.github_url,
          error: 'Issue body lacks canonical anchor — pre-PH-6D2 issue',
          affected_construct_public_ids: [construct.public_id],
        });
        continue;
      }

      const { patched, found } = patchAnchoredBlock(body, construct.public_id);
      if (!found && patched === body) {
        records.push({
          artifact_public_id: issue.public_id,
          remediation_class: 'A',
          outcome: 'already_reconciled',
          timestamp: new Date().toISOString(),
          github_target: issue.github_url,
          error: null,
          affected_construct_public_ids: [construct.public_id],
        });
        continue;
      }

      await github.updateIssueBody(issue.github_repo, issue.github_issue_number, patched);

      records.push({
        artifact_public_id: issue.public_id,
        remediation_class: 'A',
        outcome: 'patched',
        timestamp: new Date().toISOString(),
        github_target: issue.github_url,
        error: null,
        affected_construct_public_ids: [construct.public_id],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      records.push({
        artifact_public_id: issue.public_id,
        remediation_class: 'A',
        outcome: 'failed',
        timestamp: new Date().toISOString(),
        github_target: issue.github_url,
        error: `Issue patch failed: ${message}`,
        affected_construct_public_ids: [construct.public_id],
      });
    }
  }

  return records;
}
