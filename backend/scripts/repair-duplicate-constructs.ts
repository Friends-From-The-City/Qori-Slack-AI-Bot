/**
 * DEV-ONLY: Repair duplicate deterministic constructs + backfill metadata.
 *
 * Three repair operations:
 *
 * 1. DUPLICATE CONSTRUCTS: Retries of persistSurveyFoundation() created
 *    duplicate evidence constructs. Groups by semantic identity, reports
 *    duplicates, and with --fix retains oldest canonical per identity.
 *
 * 2. CODEBOOK ANALYTIC RELEVANCE: Backfills analytic_relevance into
 *    survey_codes.metadata for accepted codebooks that predate the
 *    governance/research classification.
 *
 * 3. SURVEY CONTEXT: Backfills evidence_source.metadata.survey_context
 *    for sources that predate context persistence.
 *
 * Usage:
 *   npx ts-node scripts/repair-duplicate-constructs.ts          # dry run
 *   npx ts-node scripts/repair-duplicate-constructs.ts --fix    # apply
 */

import '../src/database'; // initialize sequelize + models
import sequelize from '../src/database';
import { Op } from 'sequelize';
import type { EvidenceSource } from '../src/database/models/evidence_source';
import type { EvidenceConstruct } from '../src/database/models/evidence_construct';
import type { EvidenceRelationship } from '../src/database/models/evidence_relationship';
import type { SurveyCode } from '../src/database/models/survey_code';
import type { SurveyCodebook } from '../src/database/models/survey_codebook';

const EvidenceSourceModel = sequelize.models.EvidenceSource as typeof EvidenceSource;
const EvidenceConstructModel = sequelize.models.EvidenceConstruct as typeof EvidenceConstruct;
const EvidenceRelationshipModel = sequelize.models.EvidenceRelationship as typeof EvidenceRelationship;
const CodebookModel = sequelize.models.SurveyCodebook as typeof SurveyCodebook;
const CodeModel = sequelize.models.SurveyCode as typeof SurveyCode;

const dryRun = !process.argv.includes('--fix');

// Explicit allowlist for governance backfill: --governance-code-ids=uuid1,uuid2,...
const governanceArg = process.argv.find(a => a.startsWith('--governance-code-ids='));
const approvedGovernanceIds = new Set(
  governanceArg ? governanceArg.split('=')[1].split(',').filter(Boolean) : [],
);

// Explicit allowlist for research backfill: --research-code-ids=uuid1,uuid2,...
const researchArg = process.argv.find(a => a.startsWith('--research-code-ids='));
const approvedResearchIds = new Set(
  researchArg ? researchArg.split('=')[1].split(',').filter(Boolean) : [],
);

// Explicit approval for survey_context backfill: --backfill-context-ids=sourcePublicId,...
const contextArg = process.argv.find(a => a.startsWith('--backfill-context-ids='));
const approvedContextIds = new Set(
  contextArg ? contextArg.split('=')[1].split(',').filter(Boolean) : [],
);

interface ConstructInfo {
  id: number;
  public_id: string;
  construct_type: string;
  semanticKey: string;
  created_at: Date;
}

function getSemanticKey(construct: EvidenceConstruct): string {
  const type = (construct as unknown as { construct_type: string }).construct_type;
  const payload = (construct as unknown as { payload: Record<string, unknown> | null }).payload;

  switch (type) {
    case 'survey_dataset_summary':
      return 'dataset_summary';
    case 'field_distribution':
      return `field_distribution:${(payload as Record<string, unknown>)?.fieldName ?? 'unknown'}`;
    case 'cross_tab':
      return `cross_tab:${(payload as Record<string, unknown>)?.rowField ?? 'unknown'}:${(payload as Record<string, unknown>)?.colField ?? 'unknown'}`;
    default:
      return `${type}:${construct.id}`;
  }
}

async function main() {
  console.log(dryRun ? '=== DRY RUN ===' : '=== APPLYING FIXES ===');

  // Find all survey_dataset sources
  const sources = await EvidenceSourceModel.findAll({
    where: { source_type: 'survey_dataset' },
    order: [['created_at', 'ASC']],
  });

  console.log(`Found ${sources.length} survey_dataset evidence source(s)\n`);

  for (const source of sources) {
    console.log(`\n--- Source: ${source.public_id} (id=${source.id}) "${source.label}" ---`);

    // Get constructs via lineage
    const relationships = await EvidenceRelationshipModel.findAll({
      where: {
        from_source_id: source.id,
        relationship_type: 'DERIVED_FROM',
      },
    });

    const constructIds = relationships
      .map(r => (r as unknown as { to_construct_id: number | null }).to_construct_id)
      .filter((id): id is number => id !== null);

    if (constructIds.length === 0) {
      console.log('  No linked constructs');
      continue;
    }

    const constructs = await EvidenceConstructModel.findAll({
      where: { id: { [Op.in]: constructIds } },
      order: [['created_at', 'ASC']],
    });

    // Group by semantic key
    const groups = new Map<string, ConstructInfo[]>();
    for (const c of constructs) {
      const key = getSemanticKey(c);
      const info: ConstructInfo = {
        id: c.id,
        public_id: c.public_id,
        construct_type: (c as unknown as { construct_type: string }).construct_type,
        semanticKey: key,
        created_at: c.created_at,
      };
      const list = groups.get(key) ?? [];
      list.push(info);
      groups.set(key, list);
    }

    // Report
    let totalDuplicates = 0;
    const toDelete: number[] = [];

    for (const [key, items] of groups) {
      if (items.length > 1) {
        totalDuplicates += items.length - 1;
        console.log(`  DUPLICATE: ${key} — ${items.length} copies`);
        for (const item of items) {
          console.log(`    id=${item.id} public_id=${item.public_id} created_at=${item.created_at.toISOString()}`);
        }
        // Keep oldest (first by created_at ASC), mark rest for deletion
        for (let i = 1; i < items.length; i++) {
          toDelete.push(items[i].id);
        }
      } else {
        console.log(`  OK: ${key}`);
      }
    }

    console.log(`\n  Total constructs: ${constructs.length}`);
    console.log(`  Unique semantic keys: ${groups.size}`);
    console.log(`  Duplicates to remove: ${totalDuplicates}`);

    if (toDelete.length > 0 && !dryRun) {
      await sequelize.transaction(async (t) => {
        // Delete relationships pointing to duplicate constructs
        await EvidenceRelationshipModel.destroy({
          where: {
            [Op.or]: [
              { to_construct_id: { [Op.in]: toDelete } },
              { from_construct_id: { [Op.in]: toDelete } },
            ],
          },
          transaction: t,
        });
        // Delete duplicate constructs
        await EvidenceConstructModel.destroy({
          where: { id: { [Op.in]: toDelete } },
          transaction: t,
        });
        console.log(`  ✅ Removed ${toDelete.length} duplicate constructs and their relationships`);
      });
    }

    // Add semantic_key to remaining constructs that lack it
    if (!dryRun) {
      const remaining = await EvidenceConstructModel.findAll({
        where: {
          id: { [Op.in]: constructIds.filter(id => !toDelete.includes(id)) },
          derivation_type: 'deterministic',
        },
      });
      for (const c of remaining) {
        const dc = (c as unknown as { derivation_context: Record<string, unknown> | null }).derivation_context;
        if (!dc?.semantic_key) {
          const key = getSemanticKey(c);
          await c.update({
            derivation_context: { ...(dc ?? {}), semantic_key: key },
          });
          console.log(`  ✅ Added semantic_key "${key}" to construct ${c.id}`);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // PART 2: CODEBOOK ANALYTIC RELEVANCE — DIAGNOSTIC + EXPLICIT BACKFILL
  //
  // Dry-run: reports each code with current/suggested analytic_relevance.
  // Suggestions are DIAGNOSTIC ONLY — the heuristic does not constitute
  // authoritative classification.
  //
  // --fix: only applies governance_only to codes whose public_id appears
  // in --governance-code-ids=<id1>,<id2>,... (explicit allowlist).
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n\n=== CODEBOOK ANALYTIC RELEVANCE ===\n');

  if (!dryRun && approvedGovernanceIds.size === 0) {
    console.log('  (No --governance-code-ids provided. Skipping governance backfill.)');
    console.log('  To backfill, re-run with: --fix --governance-code-ids=<public_id,...>');
  }

  const codebooks = await CodebookModel.findAll({
    where: { status: 'accepted' },
    order: [['created_at', 'ASC']],
  });

  for (const cb of codebooks) {
    const cbId = (cb as unknown as { id: number }).id;
    console.log(`Codebook ${cbId} (v${(cb as unknown as { version: number }).version})`);

    const codes = await CodeModel.findAll({
      where: { codebook_id: cbId, status: 'accepted' },
      order: [['sort_order', 'ASC']],
    });

    for (const code of codes) {
      const meta = code.metadata as Record<string, unknown>;
      const currentRelevance = meta?.analytic_relevance as string | undefined;
      const label = code.label;
      const definition = code.definition;

      // Heuristic suggestion — DIAGNOSTIC ONLY, never auto-persisted
      const governanceIndicators: Array<{ pattern: RegExp; reason: string }> = [
        { pattern: /\bcontact\s+information\b/i, reason: 'mentions contact information' },
        { pattern: /\bpersonal\s+contact\b/i, reason: 'mentions personal contact' },
        { pattern: /\bfollow[\s-]?up\s+contact\b/i, reason: 'mentions follow-up contact' },
        { pattern: /\bsensitive\s+(personal\s+)?disclosure\b/i, reason: 'mentions sensitive disclosure' },
        { pattern: /\bthird[\s-]?party\b.*\bdisclosure\b/i, reason: 'mentions third-party disclosure' },
        { pattern: /\bPII\b/i, reason: 'mentions PII' },
        { pattern: /\bredact/i, reason: 'mentions redaction' },
      ];

      const matchedIndicator = governanceIndicators.find(ind =>
        ind.pattern.test(label) || ind.pattern.test(definition),
      );
      const suggestedRelevance = matchedIndicator ? 'governance_only' : 'research';
      const suggestionReason = matchedIndicator?.reason ?? 'no governance indicators detected';

      if (currentRelevance) {
        console.log(`  ${code.public_id}: "${label}"`);
        console.log(`    current: ${currentRelevance}`);
      } else {
        console.log(`  ${code.public_id}: "${label}"`);
        console.log(`    definition: "${definition.slice(0, 100)}${definition.length > 100 ? '...' : ''}"`);
        console.log(`    current: MISSING`);
        console.log(`    suggested: ${suggestedRelevance} (reason: ${suggestionReason})`);

        // Only persist if explicitly approved via allowlist flags
        if (!dryRun && approvedGovernanceIds.has(code.public_id)) {
          await code.update({
            metadata: { ...meta, analytic_relevance: 'governance_only' },
          });
          console.log(`    ✅ Set analytic_relevance = governance_only (explicitly approved)`);
        } else if (!dryRun && approvedResearchIds.has(code.public_id)) {
          await code.update({
            metadata: { ...meta, analytic_relevance: 'research' },
          });
          console.log(`    ✅ Set analytic_relevance = research (explicitly approved)`);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // PART 3: SURVEY CONTEXT — DIAGNOSTIC + EXPLICIT BACKFILL
  //
  // Dry-run: reports current survey_context presence, available canonical
  // DB state (project, evidence source metadata), and proposed recovery
  // with provenance for each field.
  //
  // --fix: only backfills sources whose public_id appears in
  // --backfill-context-ids=<id1>,<id2>,... (explicit allowlist).
  // Does NOT auto-backfill by parsing source.label.
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n\n=== SURVEY CONTEXT METADATA ===\n');

  if (!dryRun && approvedContextIds.size === 0) {
    console.log('  (No --backfill-context-ids provided. Skipping context backfill.)');
    console.log('  To backfill, re-run with: --fix --backfill-context-ids=<source_public_id,...>');
  }

  for (const source of sources) {
    const meta = source.metadata as Record<string, unknown> | null;
    const surveyContext = meta?.survey_context as Record<string, string> | undefined;

    console.log(`Source ${source.public_id} (id=${source.id})`);
    console.log(`  label: "${source.label}"`);

    if (surveyContext) {
      console.log(`  survey_context: PRESENT`);
      console.log(`    topic: "${surveyContext.topic}"`);
      console.log(`    topicSlug: "${surveyContext.topicSlug}"`);
      console.log(`    surveyName: "${surveyContext.surveyName}"`);
      console.log(`    questionFocus: "${surveyContext.questionFocus || ''}"`);
      console.log(`    sourceIntent: "${surveyContext.sourceIntent || ''}"`);
      console.log(`    projectSlug: "${surveyContext.projectSlug || ''}"`);
    } else {
      console.log(`  survey_context: MISSING`);

      // Report available canonical DB state
      const project = await sequelize.models.Project.findByPk(source.project_id);
      const projectName = project ? (project as unknown as { name: string }).name ?? '' : '';
      const projectSlug = project ? (project as unknown as { slug: string }).slug ?? '' : '';
      const projectProblem = project ? (project as unknown as { problem_statement: string | null }).problem_statement : null;

      const artifactRef = source.artifact_ref as Record<string, unknown> | null;
      const filename = artifactRef?.filename as string ?? '';

      console.log(`\n  Available canonical DB state:`);
      console.log(`    project.name: "${projectName}"`);
      console.log(`    project.slug: "${projectSlug}"`);
      console.log(`    project.problem_statement: "${projectProblem ?? '(null)'}"`);
      console.log(`    evidence_source.label: "${source.label}"`);
      console.log(`    artifact_ref.filename: "${filename}"`);
      console.log(`    source_type: "${source.source_type}"`);

      // Propose recovery with provenance for each field
      // source.label has format: "Survey Name — filename.csv"
      const labelParts = source.label.split(' — ');
      const nameFromLabel = labelParts.length > 1 ? labelParts[0] : null;

      console.log(`\n  Proposed survey_context (requires approval):`);
      console.log(`    topic: "${nameFromLabel ?? '(needs manual entry)'}" — provenance: source.label prefix${nameFromLabel ? '' : ' (UNPARSEABLE)'}`);
      console.log(`    topicSlug: "${nameFromLabel ? nameFromLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '(needs manual entry)'}" — provenance: derived from topic`);
      console.log(`    surveyName: "${nameFromLabel ?? '(needs manual entry)'}" — provenance: source.label prefix`);
      console.log(`    questionFocus: "" — provenance: not persisted in legacy flow`);
      console.log(`    sourceIntent: "" — provenance: not persisted in legacy flow`);
      console.log(`    projectSlug: "${projectSlug}" — provenance: project.slug`);

      // Only persist if explicitly approved
      if (!dryRun && approvedContextIds.has(source.public_id)) {
        // Check for explicit context override: --context-override=topic:value,topicSlug:value,...
        const overrideArg = process.argv.find(a => a.startsWith('--context-override='));
        const overrides: Record<string, string> = {};
        if (overrideArg) {
          // Parse key:value pairs separated by "|"
          for (const pair of overrideArg.split('=')[1].split('|')) {
            const [k, ...vParts] = pair.split(':');
            if (k) overrides[k] = vParts.join(':');
          }
        }

        const topic = overrides.topic ?? nameFromLabel ?? 'Survey';
        const topicSlug = overrides.topicSlug ?? topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const reconstructed = {
          topic,
          topicSlug,
          surveyName: overrides.surveyName ?? topic,
          questionFocus: overrides.questionFocus ?? '',
          sourceIntent: overrides.sourceIntent ?? '',
          projectSlug: overrides.projectSlug ?? projectSlug,
        };

        const recoveryProvenance = {
          method: 'legacy_dev_backfill',
          recovered_from: [
            'canonical project state',
            ...(overrideArg ? ['explicit CLI override'] : []),
            ...(!overrideArg && nameFromLabel ? ['source.label prefix'] : []),
            ...(nameFromLabel === null ? ['peer evidence sources for same uploaded survey'] : []),
          ],
          recovered_at: new Date().toISOString(),
          unavailable_fields: ['questionFocus', 'sourceIntent'].filter(f => !overrides[f]),
        };

        await source.update({
          metadata: {
            ...(meta ?? {}),
            survey_context: reconstructed,
            survey_context_recovery: recoveryProvenance,
          },
        });
        console.log(`\n    ✅ Backfilled survey_context (explicitly approved)`);
        console.log(`    Recovery provenance: ${JSON.stringify(recoveryProvenance)}`);
      }
    }
  }

  console.log('\nDone.');
  if (dryRun) {
    console.log('Run with --fix to apply changes.');
  }

  await sequelize.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
