# Artifact Experience

The Workspace is the primary reading/review surface for Qori artifacts. GitHub is publication/handoff — a researcher never leaves Qori just to read a document Qori generated.

## Lifecycle

Generate → Draft → Needs review → Approved → Publish to GitHub → Published

Two independent status systems, never merged:

1. **Workflow status** (canonical, StatusBadge): Draft · Needs review · Approved · Published · Superseded · Archived.
2. **Publication status** (adapter, PublicationStatus): Not published · Publishing… · Published ↗ · Failed (Retry) · Retrying.

"Approved + GitHub publication failed" renders as a normal Approved badge plus a separate failure pill scoped to publishing. The research never looks failed because an integration failed.

## Artifact review screen (see `screens/artifact-review.md`)

- **ArtifactViewer**: rendered document with inline citation markers.
- **Provenance rail**: citations resolve to findings/evidence; click → EvidenceDrawer. The reviewer can verify any claim without leaving the document.
- **Review actions**: Approve · Request changes (comment required, routes to Work Queue of the generating researcher) · Edit (opens tracked edit mode; edits noted in history).
- **Publish**: enabled only when Approved; publish dialog shows destination repo/path (from org config) and what will be visible externally.
- **Retry publication**: idempotent (ADR-0036); failure shows cause in plain language ("GitHub token expired — an admin can fix this in Admin → Integrations") + Retry.
- **Version history**: v3 · Supersedes v2 · each version row: author/generator, date, status at that time; superseded artifacts remain readable, watermarked "Superseded".
- **Open in GitHub ↗**: always available once published.

## Generation wait state

Artifact generation uses the staged ProgressStepper ("Drafting research readout — ✓ Gathering findings · ● Writing sections (3 of 7) · ○ Checking citations"), leave-safe with Work Queue completion notice.

## States

Draft (AI-suggested treatment until first human review), needs-review (reviewer assigned or open), approved, publishing, published, publication-failed, superseded, archived, generation-failed (retry from failed step), permission-denied (named, per `states-and-feedback.md`).

## Backend Contract (UX-2B)

**Publication status API:** `GET /api/v1/artifacts/:publicId/status` returns: `public_id`, `workflow_status`, `publication_status`, `external_target`, `external_reference`, `last_attempt_at`, `retryable`, `error_code`.

**Retry:** `POST /api/v1/artifacts/:publicId/retry` — only when `publication_status = 'projection_failed'`. Transitions `projection_failed → publishing`. Does not regenerate content, does not alter workflow status, does not duplicate GitHub output (semantic_key idempotency). Already-published is idempotent no-op.

**Error codes** are sanitized: `RATE_LIMITED`, `TARGET_NOT_FOUND`, `PERMISSION_DENIED`, `CONFLICT`, `TIMEOUT`, `PROJECTION_FAILED`. No raw provider errors exposed.

**Publish gate:** `POST /api/v1/artifacts/:publicId/publish` requires workflow status `approved` or `written`. Returns `ARTIFACT_NOT_APPROVED` otherwise.

## Data contract

Artifact: id, type, body (markdown), citations map, workflow status + history, versions, publication records per adapter (state, target URL, last attempt, error cause), review threads, permissions.
