/**
 * API Response Types — PLAT-3
 *
 * Standard response shapes for the application API.
 * All resource representations use public_id (UUID), never internal integer IDs.
 */

// ─── Response envelope ──────────────────────────────────────────────

export interface PaginationMeta {
  cursor?: string;
  limit: number;
  total?: number;
  hasMore: boolean;
}

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
}

// ─── Resource representations ───────────────────────────────────────

export interface ActorResource {
  public_id: string;
  display_name: string | null;
  organization_public_id: string;
}

export interface OrganizationResource {
  public_id: string;
  slug: string;
  name: string;
}

export interface ProjectResource {
  public_id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  organization_public_id: string;
  team_public_id: string | null;
  created_at: string;
}

export interface StudyResource {
  public_id: string;
  name: string;
  status: string;
  project_public_id: string;
  created_at: string;
}

export interface ArtifactResource {
  public_id: string;
  artifact_type: string;
  title: string | null;
  /** Canonical workflow status (research lifecycle) */
  workflow_status: string;
  /** Projection/publication status (external system state) */
  publication_status: string;
  template_id: string;
  template_version: string;
  project_public_id: string;
  study_public_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvidenceSourceResource {
  public_id: string;
  semantic_key: string;
  source_type: string;
  status: string;
  project_public_id: string;
  created_at: string;
}

export interface EvidenceConstructResource {
  public_id: string;
  semantic_key: string;
  construct_type: string;
  label: string | null;
  status: string;
  source_public_id: string;
  created_at: string;
}

// ─── Traceability ───────────────────────────────────────────────────

export interface TraceNode {
  publicId: string;
  type: string;
  label: string | null;
  status: string;
  /** Summary of entity provenance */
  provenance?: string;
  /** Count of supporting evidence (for findings/recommendations) */
  supportingEvidenceCount?: number;
  /** Source study context */
  studyPublicId?: string;
  /** Reserved for future taxonomy/tags */
  tags?: string[];
}

export interface TraceEdge {
  from: string;
  to: string;
  relationship: string;
  /** Provenance summary for this relationship */
  provenance?: string;
}

export interface TraceGraph {
  nodes: TraceNode[];
  edges: TraceEdge[];
  /** Direction of traversal */
  direction: 'backward' | 'forward' | 'both';
}

// ─── Me endpoint ────────────────────────────────────────────────────

export interface MeResource {
  actor: ActorResource;
  organization: OrganizationResource;
  authentication_provider: string;
  memberships: Array<{
    project_public_id: string;
    project_name: string;
    role: string;
  }>;
}

// ─── Governance ─────────────────────────────────────────────────────

export interface GovernanceResource {
  project_public_id: string;
  active_holds_count: number;
  pending_dispositions_count: number;
  records_assignments_count: number;
}
