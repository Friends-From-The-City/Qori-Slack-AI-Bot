# Source Annotation and Evidence Promotion Architecture

**Status:** FUTURE — NOT CURRENTLY IMPLEMENTED
**Scope:** Architecture specification only. No runtime code created.
**ADR candidate:** Yes — propose ADR 0046 if approved for implementation.

This specification defines the future architecture for source-level annotation, collaboration, and explicit evidence promotion in Qori. It grounds the design in the existing evidence layer (ADRs 0028-0030, 0037) and proposes additive models that do not modify existing canonical state.

---

## 1. Current State Audit

### What Exists (CURRENT)

| Capability | Status | Evidence |
|-----------|--------|----------|
| Evidence sources (file-level) | IMPLEMENTED | `evidence_sources` table with `public_id`, `artifact_ref` (JSONB) |
| Evidence constructs (typed) | IMPLEMENTED | `evidence_constructs` with 18 construct types, candidate/accepted/rejected status |
| Evidence relationships (directed lineage) | IMPLEMENTED | `evidence_relationships` with 9 relationship types, FK-backed CHECK constraints |
| Stable UUIDs on all evidence entities | IMPLEMENTED | `public_id` on sources, constructs, relationships |
| Transactional derivation (atomic construct + lineage) | IMPLEMENTED | `evidence.service.ts:createDerivation()` |
| AI-driven nugget extraction | IMPLEMENTED | `session_summary.yaml` → `atomic_nugget_core` |
| Construct review (accept/reject) | IMPLEMENTED | UX-2B: `evidence-review.app-service.ts` |
| Subject attribution (DSAR) | IMPLEMENTED | `evidence_subject_attributions` table |

### What Does NOT Exist

| Capability | Status |
|-----------|--------|
| Sub-file content anchors (spans) | NOT IMPLEMENTED |
| Researcher annotations on sources | NOT IMPLEMENTED |
| Comments/discussion on evidence | NOT IMPLEMENTED |
| Manual nugget creation | NOT IMPLEMENTED |
| Promote-to-evidence workflow | NOT IMPLEMENTED |
| Inline transcript highlighting | NOT IMPLEMENTED |
| Stable span anchors | NOT IMPLEMENTED |
| Media clips (audio/video) | NOT IMPLEMENTED |

---

## 2. Domain Model

Five distinct concepts, never conflated:

### 2.1 Source Span

An anchored portion of source material. Immutable once created — represents "this exact content at this location."

- **Is:** A stable pointer into source content with a frozen text snapshot
- **Is NOT:** Evidence. A span is a reference, not a research conclusion.
- **Example:** Lines 45-52 of PT-003's transcript where they describe navigation frustration

### 2.2 Researcher Annotation

A working research note attached to a source, span, or evidence construct. Research-process metadata, not canonical evidence.

- **Is:** The researcher's interpretive note ("participant appears uncertain here", "compare with PT-014")
- **Is NOT:** Canonical evidence. Annotations are working objects unless explicitly promoted.
- **Lifecycle:** Created → optionally promoted to evidence candidate → optionally promoted to canonical nugget

### 2.3 Comment / Discussion

Collaboration around any research object. Comments are team communication, never evidence.

- **Is:** Discussion thread attached to a source, span, annotation, construct, finding, or artifact
- **Is NOT:** Evidence. Comments never enter the evidence graph. A comment must never silently become a canonical construct.
- **Model-safe:** Comments are NOT sent to LLM models unless explicitly required by a future contract. Default: excluded from model input.

### 2.4 Evidence Candidate

A researcher or AI-proposed span/annotation marked as potentially evidentiary. Candidate status is explicit and visible.

- **Is:** A flagged span or annotation that the researcher (or model) believes may be evidence
- **Is NOT:** Accepted evidence. Candidate is a staging state, not a canonical conclusion.
- **Reuses:** Existing `evidence_construct.status = 'candidate'` semantics (ADR 0037)

### 2.5 Promoted Evidence

A canonical evidence construct created by explicit authorized action. Only promotion creates canonical evidence from source material.

- **Is:** An `evidence_construct` record (typically `construct_type: 'nugget'`) with lineage to its source span
- **Created by:** Explicit `Promote to Evidence` action — never by span selection, annotation creation, or comment alone
- **Governed by:** Existing candidate → accepted review workflow (UX-2B)

---

## 3. Source Span Model

### Proposed Table: `research_source_spans`

Additive — no existing tables modified.

```
research_source_spans
├── id                INTEGER PK AUTO_INCREMENT
├── public_id         UUID UNIQUE NOT NULL DEFAULT randomUUID()
├── source_id         INTEGER FK → evidence_sources(id) CASCADE NOT NULL
├── project_id        INTEGER FK → projects(id) CASCADE NOT NULL
├── study_id          INTEGER FK → research_studies(id) CASCADE NULL
├── locator_type      VARCHAR(30) NOT NULL
├── locator           JSONB NOT NULL
├── redacted_text_snapshot  TEXT NOT NULL
├── content_hash      VARCHAR(64) NOT NULL
├── source_version_ref VARCHAR(64) NULL
├── anchor_status     VARCHAR(20) NOT NULL DEFAULT 'valid'
├── created_by        VARCHAR(50) NOT NULL
├── created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
├── updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
```

### Locator Types and JSONB Schemas

**`transcript` — Text-based transcript segment**
```json
{
  "start_offset": 1245,
  "end_offset": 1398,
  "participant_code": "PT-003",
  "session_identifier": "session-2026-08-15"
}
```
Offsets are character-based against the canonical approved transcript content (post-PII-review). `participant_code` uses the system-assigned code, never real names.

**`document` — Document page/paragraph**
```json
{
  "page": 3,
  "paragraph": 2,
  "start_offset": 0,
  "end_offset": 245
}
```

**`media` — Future audio/video timestamp range**
```json
{
  "start_ms": 45000,
  "end_ms": 52000
}
```
Reserved for future media support. No runtime implementation.

### Fields Explained

| Field | Purpose |
|-------|---------|
| `source_id` | FK to the canonical `evidence_source` this span references |
| `locator_type` | Determines locator schema: `transcript`, `document`, `media` |
| `locator` | JSONB with type-specific anchor coordinates |
| `redacted_text_snapshot` | Frozen text at span creation time (post-PII, participant codes only) |
| `content_hash` | SHA-256 of `redacted_text_snapshot` — detects drift if source content changes |
| `source_version_ref` | Provider-neutral opaque version identifier of the source at span creation (see below) |
| `anchor_status` | `valid`, `stale`, `broken` — see section 12 (Source Mutation) |

### Source Version Reference (Provider-Neutral)

`source_version_ref` is an opaque provider-neutral version identifier. It does NOT assume GitHub or any specific storage provider. The span architecture must not introduce a provider dependency.

| Source Origin | `source_version_ref` Value | Example |
|--------------|---------------------------|---------|
| GitHub-stored content | Commit SHA or blob SHA | `a1b2c3d4e5f6...` |
| Uploaded object/blob | Object version or immutable asset version | `v3` or `obj-uuid-v2` |
| Transcript (post-PII) | Transcript revision identifier or content hash | `rev-2` or `sha256:abc...` |
| No external version | `content_hash` value (self-referencing) | `sha256:abc...` |

When no external version system exists, `content_hash` + `created_at` together establish the version. The span records what the content looked like at creation time regardless of storage provider.

### Reuse of Existing IDs

- `source_id` references the existing `evidence_sources.id` FK — no new source model needed
- `project_id` / `study_id` follow existing evidence scoping pattern
- `public_id` follows the existing stable UUID pattern (ADR 0030)

### What This Does NOT Include

- No content storage — the span points to content in the source, storing only a snapshot
- No PII — `redacted_text_snapshot` is post-review content only. Real names never stored.
- No media content — `media` locator is coordinates only, not audio/video data
- No provider dependency — `source_version_ref` is opaque, not GitHub-specific

---

## 4. Annotation Model

### Proposed Table: `research_annotations`

```
research_annotations
├── id                INTEGER PK AUTO_INCREMENT
├── public_id         UUID UNIQUE NOT NULL DEFAULT randomUUID()
├── organization_id   INTEGER FK → organizations(id) CASCADE NOT NULL
├── project_id        INTEGER FK → projects(id) CASCADE NOT NULL
├── study_id          INTEGER FK → research_studies(id) CASCADE NULL
├── source_id         INTEGER FK → evidence_sources(id) CASCADE NULL
├── source_span_id    INTEGER FK → research_source_spans(id) SET NULL NULL
├── construct_id      INTEGER FK → evidence_constructs(id) SET NULL NULL
├── annotation_type   VARCHAR(30) NOT NULL
├── body              TEXT NOT NULL
├── status            VARCHAR(20) NOT NULL DEFAULT 'active'
├── promoted_construct_id  INTEGER FK → evidence_constructs(id) SET NULL NULL
├── created_by_actor_id    INTEGER FK → actors(id) CASCADE NOT NULL
├── created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
├── updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
```

### Annotation Types

| Type | Purpose | Promotable |
|------|---------|-----------|
| `note` | Working research observation | Yes — can become evidence candidate |
| `evidence_candidate` | Explicitly flagged as potentially evidentiary | Yes — Promote to Evidence action |

### Annotation Targets

An annotation attaches to exactly one of:
- A source (`source_id` set, others null) — file-level note
- A source span (`source_span_id` set) — span-level note
- An evidence construct (`construct_id` set) — note on existing evidence

CHECK constraint: exactly one of (`source_id`, `source_span_id`, `construct_id`) must be non-null (or `source_id` + `source_span_id` both set for span-on-source).

### Status Values

| Status | Meaning |
|--------|---------|
| `active` | Current working annotation |
| `promoted` | Annotation was promoted to canonical evidence — `promoted_construct_id` set |
| `archived` | Researcher archived the annotation |

### Why Comments Are NOT Annotations

Comments are collaboration objects (team discussion). Annotations are individual researcher working notes. The distinction matters because:

1. **Annotations may become evidence** (via explicit promotion). Comments must never become evidence.
2. **Annotations are researcher-authored working objects**. Comments are multi-party discussion.
3. **Annotation body may be included in promotion provenance**. Comment text never enters evidence or model pipelines.

Making comments a subtype of annotation would create a path where discussion text could accidentally enter the evidence graph through promotion. Separate models prevent this.

---

## 5. Comment / Collaboration Model

### Proposed Table: `research_comments`

```
research_comments
├── id                INTEGER PK AUTO_INCREMENT
├── public_id         UUID UNIQUE NOT NULL DEFAULT randomUUID()
├── organization_id   INTEGER FK → organizations(id) CASCADE NOT NULL
├── project_id        INTEGER FK → projects(id) CASCADE NOT NULL
├── study_id          INTEGER FK → research_studies(id) CASCADE NULL
├── target_type       VARCHAR(30) NOT NULL
├── target_id         INTEGER NOT NULL
├── parent_comment_id INTEGER FK → research_comments(id) SET NULL NULL
├── body              TEXT NOT NULL
├── edited_at         TIMESTAMP NULL
├── resolved          BOOLEAN NOT NULL DEFAULT FALSE
├── resolved_by       INTEGER FK → actors(id) SET NULL NULL
├── resolved_at       TIMESTAMP NULL
├── created_by_actor_id INTEGER FK → actors(id) CASCADE NOT NULL
├── created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
```

### Target Types

| target_type | target_id references | Purpose |
|------------|---------------------|---------|
| `source` | evidence_sources.id | Discussion on a source file |
| `source_span` | research_source_spans.id | Discussion on a specific span |
| `annotation` | research_annotations.id | Discussion on a researcher annotation |
| `construct` | evidence_constructs.id | Discussion on a finding/recommendation/theme |
| `artifact` | research_artifacts.id | Discussion on a generated artifact |

### Design Decisions

**Typed target reference** (target_type + target_id) rather than polymorphic FK because:
- Comments span 5+ entity types — one FK per type would be 5 nullable columns with a 5-way CHECK
- target_type + target_id is simpler and extensible
- Application code resolves target using target_type dispatch

**Threading** via `parent_comment_id` — supports reply chains without deep nesting. Flat with optional one-level replies is sufficient for research collaboration.

**Resolution** — comments can be marked resolved (e.g., "addressed in the readout"). Resolution is informational, not a gate.

**Edit history** — `edited_at` tracks last edit. Full edit history (if needed later) can be a separate audit table. Not needed for MVP.

### What Comments Are NOT

- Comments are **never sent to LLM models** unless a future explicit contract requires it. Default: excluded from all model input.
- Comments **never enter the evidence graph**. No `evidence_relationship` can originate from or terminate at a comment.
- Comments **have no canonical evidence side effects**. Creating, editing, resolving, or deleting a comment does not change any evidence construct, relationship, or status.

---

## 5.5. Construct-to-Span Provenance (FK-Backed)

### Proposed Table: `evidence_construct_source_spans`

Canonical FK-backed link between a promoted evidence construct and its exact source span. This is the persisted provenance relationship — not a JSONB-only reference.

```
evidence_construct_source_spans
├── id                INTEGER PK AUTO_INCREMENT
├── construct_id      INTEGER FK → evidence_constructs(id) CASCADE NOT NULL
├── source_span_id    INTEGER FK → research_source_spans(id) CASCADE NOT NULL
├── relationship_role VARCHAR(30) NOT NULL DEFAULT 'evidentiary_basis'
├── created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
```

**UNIQUE constraint:** `(construct_id, source_span_id, relationship_role)` — prevents duplicate linkage.

### Relationship Roles

| Role | Meaning |
|------|---------|
| `evidentiary_basis` | This span is the primary source text that the evidence construct was promoted from |
| `supporting_span` | This span provides additional supporting context (secondary reference) |

Keep the vocabulary minimal. Expand only when a concrete product need requires it.

### Design Rationale

The `evidence_relationship` table (source → construct via `DERIVED_FROM`) establishes lineage between the file-level `evidence_source` and the promoted construct. The `evidence_construct_source_spans` join table adds the sub-file precision: which exact span within that source the construct was promoted from.

The span reference MAY also appear in `evidence_relationship.provenance` JSONB for convenient rendering, but the FK-backed join table is the canonical link. If the JSONB reference and the FK disagree, the FK wins.

### Invariant

```
Promote to Evidence
  → evidence_construct created (nugget)
  → evidence_relationship: source DERIVED_FROM nugget
  → evidence_construct_source_spans: nugget → exact span (evidentiary_basis)
```

The source span remains a provenance anchor. It does NOT become an evidence graph construct or node in `evidence_relationships`.

---

## 6. Promote to Evidence — State Transition

### Flow

```
1. Researcher selects source span in transcript/source viewer
   → research_source_span created (content_hash + snapshot)

2. Researcher adds annotation (optional)
   → research_annotation created (type: 'note' or 'evidence_candidate')

3. Researcher chooses "Promote to Evidence"
   → Authorization check (project membership via assertProjectAccessByActor)
   → Privacy check (no real participant names in promoted content)
   → Governance check (source not under hold/restriction)
   
4. System creates canonical evidence_construct:
   - construct_type: 'nugget'
   - derivation_type: 'human'
   - payload: { text: span.redacted_text_snapshot, ... }
   - status: 'candidate' (enters UX-2B review pipeline)
   - created_by: actor public_id

5. System creates evidence_relationship:
   - from_source_id: span.source_id
   - to_construct_id: new nugget.id
   - relationship_type: 'DERIVED_FROM'
   - provenance: { method: 'manual_promotion', source_span_id: span.public_id }

6. System creates FK-backed span provenance:
   - evidence_construct_source_spans record:
     construct_id: new nugget.id
     source_span_id: span.id
     relationship_role: 'evidentiary_basis'

7. If annotation exists:
   - annotation.status = 'promoted'
   - annotation.promoted_construct_id = new nugget.id
   - Annotation body preserved in construct.derivation_context.researcher_note

8. Promoted nugget enters existing cascade/synthesis pipeline:
   - Available to /qori-synthesis as upstream evidence
   - Lineage visible in traceability graph
```

Steps 4, 5, 6, and 7 execute atomically within a single database transaction. If any step fails, the entire promotion rolls back.

### Promotion Invariants

| Invariant | Enforcement |
|-----------|------------|
| Explicit action required | No UI selection alone creates evidence. "Promote to Evidence" is a distinct action. |
| Auditable | `derivation_context` records span + annotation public_ids. FK-backed `evidence_construct_source_spans` provides canonical link. |
| Idempotent | Same span + same actor + same content_hash → returns existing construct (semantic_key dedup) |
| Scoped | org_id / project_id / study_id on all models; cross-org promotion impossible |
| Reversible only through governance | Once promoted, only governed disposition (reject, override) can reverse. Not a casual undo. |
| No duplicate nuggets | Semantic key: `nugget:{studyId}:manual:{content_hash}` prevents duplicate promotion of identical spans |
| Privacy preserved | `redacted_text_snapshot` is post-PII content. Real names never in promoted constructs. |

---

## 7. Authorization Model

Reuses existing project-scoped authorization (ADR 0024, PLAT-3):

| Action | Authorization |
|--------|--------------|
| Create source span | Project member (any role) |
| Create annotation | Project member (any role) |
| Create comment | Project member (any role) |
| Promote to evidence | Project member (any role) — construct created as `candidate` |
| Accept promoted evidence | Project member with review authority (UX-2B) |
| Delete annotation | Annotation creator or project owner |
| Resolve comment | Project member (any role) |
| Delete comment | Comment creator or project owner |

Cross-org access: fails closed. Organization scope enforced at query layer.

---

## 8. Privacy and Model-Input Boundaries

### Source Spans

- `redacted_text_snapshot` stores ONLY post-PII-review content
- Real participant names never appear — only `participant_code` (PT-NNN)
- Span creation blocked if source `pii_reviewed = false`
- Content hash computed on redacted content, not original

### Annotations

- Annotation `body` may contain researcher observations — these are working notes, not source material
- **Privacy classification:** Researcher-authored content, not participant data. Subject to standard organizational data policies, not PII review gates.
- **Model-safe representation:** Annotation body text MAY be included in model input ONLY when:
  1. The annotation is explicitly promoted to evidence, AND
  2. The promoted construct enters a synthesis pipeline
- Unpromoted annotations are NOT model input

### Comments

- **Default: NOT sent to models.** Comments are collaboration, not research data.
- If a future contract requires model access to comments (e.g., "Ask Qori about team discussion"), that contract must be separately approved with explicit privacy review.
- Comments may reference participants by code only (PT-NNN), never real names.

### Model-Generated Candidates (Section 10)

- AI-proposed spans/candidates follow the same privacy boundary
- Model output (proposed spans) goes through the same PII check before persisting
- Model-proposed text snapshots are AI-generated summaries, not raw source quotes — no additional PII risk beyond existing session_summary pipeline

---

## 9. Lineage Model

### Target Lineage

The canonical evidence graph is based on `evidence_constructs` and `evidence_relationships`. Source spans provide exact evidentiary provenance via FK-backed `evidence_construct_source_spans`, but spans are NOT graph nodes.

```
evidence_source (file-level)
   ↓
source_span (provenance anchor — exact text, FK-backed to construct)
   ↓
candidate/promoted nugget (evidence_construct, derivation_type: 'human')
   ↓
theme (evidence_construct, via SYNTHESIZED_FROM)
   ↓
finding (evidence_construct)
   ↓
recommendation (evidence_construct)
   ↓
artifact (research_artifact, via artifact_evidence_ref)
   ↓
implementation handoff (external, via IMPLEMENTED_BY — future CA-003)
```

### Canonical Evidence Graph Relationships

| From | To | Relationship | Provenance |
|------|----|-------------|------------|
| evidence_source | nugget | `DERIVED_FROM` (evidence_relationships) | `{ method: 'manual_promotion' }` |
| source_span | nugget | FK-backed (evidence_construct_source_spans) | `relationship_role: 'evidentiary_basis'` |
| nugget | theme | `SYNTHESIZED_FROM` (evidence_relationships) | `{ created_by_template: ... }` |
| theme | finding | `SYNTHESIZED_FROM` (evidence_relationships) | — |
| recommendation | ticket | `IMPLEMENTED_BY` (evidence_relationships) | Future (CA-003) |
| construct | artifact | `reflects` (artifact_evidence_refs) | — |

### What Does NOT Enter Lineage

- **Source spans** — provenance anchors with FK-backed link to constructs via `evidence_construct_source_spans`. Spans are NOT nodes in `evidence_relationships`. The lineage node is the promoted construct.
- **Annotations** — working notes, not evidence edges. Annotation body preserved in promoted construct's `derivation_context.researcher_note` only.
- **Comments** — collaboration objects. No `evidence_relationship` or `evidence_construct_source_spans` row touches comments.

---

## 10. Model-Generated Evidence Candidates

### Future AI Behavior

```
AI analyzes source content
  → proposes source spans with evidence_candidate annotations
  → researcher inspects proposed spans in source viewer
  → researcher accepts/promotes (or dismisses)
  → promoted spans become canonical nuggets (derivation_type: 'hybrid')
```

### Reuse of Existing Semantics

| Concept | Existing Mechanism |
|---------|-------------------|
| AI proposal | `evidence_construct.status = 'candidate'`, `derivation_type = 'model'` |
| Human acceptance | UX-2B review: candidate → accepted |
| Human rejection | UX-2B review: candidate → rejected |
| Governance override | `status = 'overridden'` (terminal) |

Model proposal alone is NEVER accepted evidence. The existing candidate/accepted review gate applies.

---

## 11. Proposed APIs

### Source Spans

```
POST   /api/v1/sources/:sourcePublicId/spans     — Create span
GET    /api/v1/sources/:sourcePublicId/spans     — List spans for source
GET    /api/v1/spans/:spanPublicId               — Get span
DELETE /api/v1/spans/:spanPublicId               — Delete span (only if no promoted evidence)
```

### Annotations

```
POST   /api/v1/spans/:spanPublicId/annotations    — Annotate a span
POST   /api/v1/sources/:sourcePublicId/annotations — Annotate a source (file-level)
GET    /api/v1/annotations/:annotationPublicId     — Get annotation
PATCH  /api/v1/annotations/:annotationPublicId     — Edit annotation body
POST   /api/v1/annotations/:annotationPublicId/promote — Promote to evidence
DELETE /api/v1/annotations/:annotationPublicId     — Delete (if not promoted)
```

### Comments

```
POST   /api/v1/comments                           — Create comment (target_type + target_id in body)
GET    /api/v1/comments?target_type=X&target_id=Y  — List comments for target
PATCH  /api/v1/comments/:commentPublicId           — Edit comment
POST   /api/v1/comments/:commentPublicId/resolve   — Resolve comment
DELETE /api/v1/comments/:commentPublicId           — Delete comment
```

All endpoints require `requireAuth` middleware. All responses use `public_id`, never internal IDs.

---

## 12. Source Mutation and Stale Anchors

### What Happens When Source Content Changes

If the underlying transcript or source document is modified after spans are created:

1. **Content hash check:** On span access, system compares `content_hash` against current source content at the span's locator coordinates.

2. **Anchor status transitions:**

| Condition | anchor_status | Meaning |
|-----------|--------------|---------|
| Content at locator matches snapshot | `valid` | Span is current |
| Content at locator differs from snapshot | `stale` | Source changed; span may not match current content |
| Source file deleted or locator invalid | `broken` | Span cannot be resolved |

3. **`redacted_text_snapshot` is NEVER modified.** The snapshot preserves what the researcher saw when they created the span. This is intentional — the historical basis of a promoted evidence nugget must not be silently rewritten by a source edit.

4. **Promoted evidence unaffected.** A source edit changes the span's `anchor_status` but does NOT change the promoted `evidence_construct`. The nugget's payload retains the original promoted text. This parallels the existing `stale_due_to_disposition` pattern (GOV-2B) — staleness is informational, not destructive.

5. **Re-anchoring strategy:**
   - Researcher can create a NEW span at the updated location
   - Original span remains with `anchor_status: 'stale'`
   - Promoted evidence retains its original lineage
   - New span can be promoted as a new nugget if the content differs materially
   - No automatic re-anchoring — researcher decides

### Version Reference

`source_version_ref` stores the provider-neutral version identifier of the source at span creation time (see Section 3, Source Version Reference). This enables:
- Deterministic content retrieval at the original version (provider-specific resolution)
- Diff between current and span-creation version where the provider supports it
- Audit trail for when the source diverged

No provider dependency is introduced. If no external versioning exists, `content_hash` + `created_at` establish the version.

---

## 13. Workspace Future Interactions (for CD)

**All of the following are FUTURE / NOT CURRENTLY IMPLEMENTED.** CD may design these interactions knowing the architecture supports them, but they are not available in Workspace v1 unless a separate implementation slice is approved.

### Text Selection → Span Creation
- Researcher selects text in transcript/source viewer
- Selection coordinates captured as locator JSONB
- Text snapshot frozen with content hash
- Span appears as highlight in viewer

### Highlight Display
- Spans rendered as colored highlights in source viewer
- Color/style indicates status: annotation, evidence candidate, promoted
- Multiple overlapping spans supported

### Add Note (Annotation)
- Researcher clicks on span → "Add Note" action
- Note text entered → `research_annotation` created (type: `note`)
- Note displayed as margin annotation in source viewer

### Evidence Candidate
- Researcher flags annotation as evidence candidate
- Or: AI proposes evidence candidate spans
- Candidate badge appears on span
- Listed in evidence candidate queue (work queue surface)

### Promote to Evidence
- Explicit "Promote to Evidence" action on candidate annotation
- Confirmation dialog with nugget type selection
- Creates canonical `evidence_construct` (nugget)
- Span highlight changes to "promoted" style
- Nugget appears in evidence browser with lineage

### Promoted State
- Promoted spans show "Evidence" badge
- Click navigates to the canonical evidence construct
- Construct shows source span in traceability panel

### Evidence Trace
- From promoted nugget → back to source span → source file
- From finding → upstream nuggets → source spans
- Bidirectional traceability (designed in `traceability-model.md`)

### Stale/Broken Source Anchor
- Stale spans show warning indicator ("Source changed since this was marked")
- Broken spans show error indicator ("Source no longer available")
- Neither state changes the promoted evidence — informational only

---

## 14. Implementation Slices

Proposed decomposition for future implementation. Do not execute during this task.

### SA-1: Stable Source Span Model
- Migration: create `research_source_spans` table + `evidence_construct_source_spans` join table
- Service: span CRUD with content hash computation, provider-neutral version resolution
- API: POST/GET/DELETE span endpoints
- **Prerequisite for:** SA-2, SA-4, SA-5, SA-6

### SA-2: Research Annotations
- Migration: create `research_annotations` table
- Service: annotation CRUD with target validation
- API: annotation endpoints
- **Requires:** SA-1 (for span annotations)

### SA-3: Comments / Collaboration
- Migration: create `research_comments` table
- Service: comment CRUD, resolution, threading
- API: comment endpoints
- **Independent of:** SA-1, SA-2 (comments can attach to existing constructs/artifacts)

### SA-4: Promote-to-Evidence Application Service + Audit
- Service: promotion workflow (authorization → privacy → construct creation → evidence_relationship + evidence_construct_source_spans → audit)
- Atomic transaction: construct + DERIVED_FROM relationship + FK-backed span link + annotation status update
- Extends: `evidence.service.ts` with human-derivation path
- **Requires:** SA-1 (source span + join table), SA-2 (annotation status update)

### SA-5: Transcript / Source Content APIs
- API: serve transcript/source content for Workspace source viewer
- Content hash computation for stale detection
- Version-aware content retrieval
- **Requires:** SA-1 (content hash comparison)

### SA-6: Workspace Source Viewer Interactions
- Frontend: text selection → span creation UI
- Frontend: annotation panel, evidence candidate badges
- Frontend: Promote to Evidence flow
- **Requires:** SA-1, SA-2, SA-4, SA-5

### SA-7: AI-Proposed Evidence Candidates
- Extend session_summary or new template to propose source spans
- Model output → evidence_candidate annotations
- Researcher review queue
- **Requires:** SA-1, SA-2, SA-4

### SA-8: Advanced Coding / Media (Later)
- Inline qualitative coding with codebook integration
- Audio/video timestamp anchors
- Media player integration
- **Requires:** SA-1 + substantial frontend investment

### Dependency Graph

```
SA-1 (spans) ──────────────────────┐
  │                                 │
  ├── SA-2 (annotations)           │
  │     │                          │
  │     ├── SA-4 (promotion) ──────┤
  │     │                          │
  │     └── SA-7 (AI candidates)   │
  │                                │
  ├── SA-5 (content APIs) ─────────┤
  │                                │
  └── SA-6 (source viewer) ────────┘
  
SA-3 (comments) ── independent, can ship anytime

SA-8 (coding/media) ── later, after SA-1 + SA-6
```

---

## 15. Risks and Open Architecture Questions

### Risks

1. **Offset stability in transcripts.** Character offsets assume stable content. If PII rescrub or post-approval edits change content, existing span offsets may be invalid. Mitigation: content_hash detection + `source_version_ref`.

2. **Snapshot storage growth.** Every span stores a text snapshot. High-annotation workflows could generate significant storage. Mitigation: snapshots are short text excerpts, not full documents.

3. **Overlapping spans.** Multiple spans may overlap the same text range. This is intentional (different annotations on overlapping regions) but complicates highlight rendering. Mitigation: frontend merge/overlap algorithm in SA-6.

4. **Promotion of AI-proposed spans.** Model-proposed spans may not align with researcher intent. Mitigation: researcher review gate (never auto-accept).

5. **Scope creep toward social platform.** Comments + annotations + threading could expand toward full collaboration. Mitigation: keep comments minimal (no reactions, no mentions, no real-time).

### Open Questions

1. **Should annotations survive source deletion?** Current proposal: `source_span_id` is SET NULL on source delete, preserving the annotation with a broken anchor. Is this correct, or should annotations cascade-delete with their source?

2. **Should promoted nuggets reference the span or the source?** Current proposal: both — `DERIVED_FROM` edge to `evidence_source`, span reference in provenance JSONB. This preserves lineage even if spans are later deleted.

3. **Comment edit history:** Is `edited_at` sufficient, or does the platform need full edit history for audit? Current proposal: `edited_at` only (minimal viable).

4. **Multi-span promotion:** Can a researcher promote multiple spans as a single nugget (composite evidence)? Current proposal: one span → one nugget. Multi-span evidence is a synthesis operation.

5. **Annotation privacy classification:** Should annotations be subject to PII review gates? Current proposal: no — annotations are researcher-authored, not participant data. But annotations could quote participants. Should annotation `body` go through PII detection?

---

## 16. What CD May Safely Design Now

CD may design FUTURE Workspace interactions for:

| Interaction | Architecture Support | Implementation Slice |
|------------|---------------------|---------------------|
| Text selection in source viewer | SA-1 (span model) | SA-6 |
| Highlight display (multi-color by status) | SA-1 (anchor_status) | SA-6 |
| Add Note on selection | SA-2 (annotation model) | SA-6 |
| Flag as evidence candidate | SA-2 (annotation_type: evidence_candidate) | SA-6 |
| Promote to Evidence action | SA-4 (promotion service) | SA-6 |
| Comment on any research object | SA-3 (comment model) | SA-3 |
| Resolve comment threads | SA-3 (resolved flag) | SA-3 |
| Evidence candidate queue in work queue | SA-2 + SA-4 | SA-6 |
| Stale/broken anchor indicator | SA-1 (anchor_status) | SA-6 |
| AI-proposed evidence badges | SA-7 | SA-7 |

**All of these are FUTURE / NOT CURRENTLY IMPLEMENTED.** They are not available in Workspace v1.

CD should:
- Design these as future states, clearly labeled
- Not promise them in v1 materials
- Plan the source viewer component knowing it will eventually support selection + annotation
- Keep the evidence browser (already designed) compatible with manually-promoted nuggets alongside AI-extracted nuggets
