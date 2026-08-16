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
  // PART 2: CODEBOOK ANALYTIC RELEVANCE BACKFILL
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n\n=== CODEBOOK ANALYTIC RELEVANCE ===\n');

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

      // Inspect for governance-only indicators in the code definition/label.
      // This is for DIAGNOSTIC REPORTING only — classification requires review.
      const governanceIndicators = [
        /\bcontact\s+information\b/i,
        /\bpersonal\s+contact\b/i,
        /\bfollow[\s-]?up\s+contact\b/i,
        /\bsensitive\s+(personal\s+)?disclosure\b/i,
        /\bthird[\s-]?party\b.*\bdisclosure\b/i,
        /\bPII\b/i,
        /\bredact/i,
      ];

      const suggestedRelevance = governanceIndicators.some(p =>
        p.test(label) || p.test(definition),
      ) ? 'governance_only' : 'research';

      if (currentRelevance) {
        console.log(`  ${code.public_id}: "${label}" → ${currentRelevance} (already set)`);
      } else {
        console.log(`  ${code.public_id}: "${label}" → MISSING (suggested: ${suggestedRelevance})`);
        if (!dryRun && suggestedRelevance === 'governance_only') {
          await code.update({
            metadata: { ...meta, analytic_relevance: suggestedRelevance },
          });
          console.log(`    ✅ Set analytic_relevance = governance_only`);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // PART 3: SURVEY CONTEXT BACKFILL
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n\n=== SURVEY CONTEXT METADATA ===\n');

  for (const source of sources) {
    const meta = source.metadata as Record<string, unknown> | null;
    const surveyContext = meta?.survey_context as Record<string, string> | undefined;

    if (surveyContext) {
      console.log(`Source ${source.public_id}: survey_context PRESENT`);
      console.log(`  topic: "${surveyContext.topic}"`);
      console.log(`  topicSlug: "${surveyContext.topicSlug}"`);
      console.log(`  surveyName: "${surveyContext.surveyName}"`);
    } else {
      console.log(`Source ${source.public_id}: survey_context MISSING`);

      // Attempt to reconstruct from canonical DB state
      const label = source.label; // e.g., "Survey Name — filename.csv"
      const labelParts = label.split(' — ');
      const reconstructedName = labelParts[0] || 'Survey';

      // Load project for projectSlug
      const project = await sequelize.models.Project.findByPk(source.project_id);
      const projectSlug = project
        ? (project as unknown as { slug: string }).slug ?? ''
        : '';

      const reconstructed = {
        topic: reconstructedName,
        topicSlug: reconstructedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        surveyName: reconstructedName,
        questionFocus: '',
        sourceIntent: '',
        projectSlug,
      };

      console.log(`  Reconstructed: ${JSON.stringify(reconstructed)}`);

      if (!dryRun) {
        await source.update({
          metadata: { ...(meta ?? {}), survey_context: reconstructed },
        });
        console.log(`  ✅ Backfilled survey_context`);
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
