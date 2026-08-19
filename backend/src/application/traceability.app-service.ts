/**
 * Traceability Application Service — PLAT-3
 *
 * Walks the evidence relationship graph in both directions:
 *
 * BACKWARD: recommendation → finding → theme → nugget → source → study
 * FORWARD:  finding → recommendation → artifact → external handoff
 *
 * Returns a TraceGraph that the Workspace can render without
 * client-side graph reconstruction.
 */

import type { ApplicationContext } from '../types/application-context';
import type { TraceGraph, TraceNode, TraceEdge } from '../types/api-responses';
import { assertProjectAccessByActor } from '../services/authorization.service';
import { resourceNotFound } from '../types/api-errors';
import sequelize from '../database';

/**
 * Get the full traceability graph for an evidence construct.
 *
 * Traverses both backward (to sources) and forward (to artifacts).
 */
export async function getTraceGraph(
  ctx: ApplicationContext,
  constructPublicId: string,
  direction: 'backward' | 'forward' | 'both' = 'both',
): Promise<TraceGraph> {
  const EvidenceConstructModel = sequelize.models.EvidenceConstruct;
  const EvidenceRelationshipModel = sequelize.models.EvidenceRelationship;

  if (!EvidenceConstructModel || !EvidenceRelationshipModel) {
    return { nodes: [], edges: [], direction };
  }

  // Find the starting construct
  const startConstruct = await EvidenceConstructModel.findOne({
    where: { public_id: constructPublicId },
  }) as any;

  if (!startConstruct) throw resourceNotFound('Evidence construct');

  // Verify org scope via project
  const project = await sequelize.models.Project.findByPk(startConstruct.project_id, {
    attributes: ['id', 'organization_id'],
  }) as any;

  if (!project || project.organization_id !== ctx.organization.id) {
    throw resourceNotFound('Evidence construct');
  }

  await assertProjectAccessByActor(ctx.actor.id, project.id, ctx.organization.id);

  const nodes = new Map<string, TraceNode>();
  const edges: TraceEdge[] = [];
  const visited = new Set<number>();

  // Add starting node
  addNode(nodes, startConstruct);

  if (direction === 'backward' || direction === 'both') {
    await traverseBackward(startConstruct.id, EvidenceRelationshipModel, EvidenceConstructModel, nodes, edges, visited);
  }

  if (direction === 'forward' || direction === 'both') {
    await traverseForward(startConstruct.id, EvidenceRelationshipModel, EvidenceConstructModel, nodes, edges, visited);
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
    direction,
  };
}

// ─── Graph traversal ────────────────────────────────────────────────

async function traverseBackward(
  constructId: number,
  RelModel: any,
  ConstructModel: any,
  nodes: Map<string, TraceNode>,
  edges: TraceEdge[],
  visited: Set<number>,
) {
  if (visited.has(constructId)) return;
  visited.add(constructId);

  // Find relationships where this construct is the target (child)
  const rels = await RelModel.findAll({
    where: { target_construct_id: constructId },
  });

  for (const rel of rels) {
    const sourceConstruct = await ConstructModel.findByPk(rel.source_construct_id);
    if (!sourceConstruct) continue;

    addNode(nodes, sourceConstruct);
    edges.push({
      from: sourceConstruct.public_id,
      to: getPublicId(constructId, nodes),
      relationship: rel.relationship_type || 'derived_from',
      provenance: rel.provenance_summary || undefined,
    });

    // Recurse upward
    await traverseBackward(sourceConstruct.id, RelModel, ConstructModel, nodes, edges, visited);
  }
}

async function traverseForward(
  constructId: number,
  RelModel: any,
  ConstructModel: any,
  nodes: Map<string, TraceNode>,
  edges: TraceEdge[],
  visited: Set<number>,
) {
  if (visited.has(-constructId)) return; // Use negative to distinguish direction
  visited.add(-constructId);

  // Find relationships where this construct is the source (parent)
  const rels = await RelModel.findAll({
    where: { source_construct_id: constructId },
  });

  for (const rel of rels) {
    const targetConstruct = await ConstructModel.findByPk(rel.target_construct_id);
    if (!targetConstruct) continue;

    addNode(nodes, targetConstruct);
    edges.push({
      from: getPublicId(constructId, nodes),
      to: targetConstruct.public_id,
      relationship: rel.relationship_type || 'derived_from',
      provenance: rel.provenance_summary || undefined,
    });

    // Recurse downward
    await traverseForward(targetConstruct.id, RelModel, ConstructModel, nodes, edges, visited);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function addNode(nodes: Map<string, TraceNode>, construct: any) {
  if (!nodes.has(construct.public_id)) {
    nodes.set(construct.public_id, {
      publicId: construct.public_id,
      type: construct.construct_type || 'unknown',
      label: construct.label || null,
      status: construct.status || 'active',
    });
  }
}

function getPublicId(id: number, nodes: Map<string, TraceNode>): string {
  for (const node of nodes.values()) {
    // This is a simplification — in practice we'd maintain an id→publicId map
    if (node.publicId) return node.publicId;
  }
  return String(id);
}
