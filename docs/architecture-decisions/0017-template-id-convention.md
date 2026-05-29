# ADR 0017: Template ID Convention

**Status:** Accepted
**Date:** 2026-05-27
**Author:** Phase B-0 (Cascade Fix)

## Context

YAML templates declare an `id` field that becomes the `source.template` value when
variables are written to the cascade store. Downstream templates consume these
variables by referencing the source in their `consumes` block:

```yaml
# stakeholder_synthesis.yaml
consumes:
  - key: discovered_barriers
    source: desk_research
```

A referential integrity bug occurred when three templates had mismatched IDs:

| Template File | Declared ID | Consumer References |
|---------------|-------------|---------------------|
| `desk_research.yaml` | `desk_research_processor` | `desk_research` |
| `session_summary.yaml` | `analyze_notes` | `session_summary` |
| `usability_issues_extractor.yaml` | `usability_issues_extractor` | `usability_issues` |

The filter in `readUpstreamDiscoveryVariables` compares `variable.source.template`
against `spec.source`. When these don't match, variables are silently filtered out.

## Decision

**The YAML `id` field must match the consumer-side name exactly.**

The `id` field is the canonical identifier. There are no suffixes (`_processor`,
`_extractor`), no transformations, and no mappings between declared id and
consumer-side name.

### Pattern

```yaml
# Producer template (desk_research.yaml)
id: desk_research  # ← Canonical identifier

# Consumer template (stakeholder_synthesis.yaml)
consumes:
  - key: discovered_barriers
    source: desk_research  # ← Must match id exactly
```

### Convention

1. **Template ID = consumer-side name**: When naming a template id, use the name
   that downstream consumers will reference in their `consumes.source`.

2. **No suffixes**: Avoid `_processor`, `_extractor`, `_generator` suffixes in
   the id even if the filename has them. The id is for cascade routing, not
   describing what the template does.

3. **Filename can differ**: The filename (`usability_issues_extractor.yaml`) can
   have descriptive suffixes, but the `id` field (`usability_issues`) should be
   the canonical consumer-side name.

4. **TEMPLATE_TO_DISCOVERY_TYPE mapping**: For discovery-scoped templates, the
   `TEMPLATE_TO_DISCOVERY_TYPE` constant in `studyVariables.ts` maps the id to
   the folder name. The keys in this mapping implicitly define the canonical
   consumer-side names:

   ```typescript
   const TEMPLATE_TO_DISCOVERY_TYPE: Record<string, string> = {
     'desk_research': 'desk-research',        // id → folder
     'stakeholder_synthesis': 'stakeholder-interviews',
     'survey_synthesis': 'survey-synthesis',
   };
   ```

## Worked Examples

### Fix 1: desk_research

**Before:**
- File: `desk_research.yaml`
- ID: `desk_research_processor`
- Consumer: `source: desk_research`
- Result: Variables filtered out (mismatch)

**After:**
- File: `desk_research.yaml`
- ID: `desk_research`
- Consumer: `source: desk_research`
- Result: Variables returned correctly

### Fix 2: session_summary

**Before:**
- File: `session_summary.yaml`
- ID: `analyze_notes`
- Consumer: `source: session_summary`
- Result: Variables filtered out (mismatch)

**After:**
- File: `session_summary.yaml`
- ID: `session_summary`
- Consumer: `source: session_summary`
- Result: Variables returned correctly

### Fix 3: usability_issues

**Before:**
- File: `usability_issues_extractor.yaml`
- ID: `usability_issues_extractor`
- Consumer: `source: usability_issues`
- Result: Variables filtered out (mismatch)

**After:**
- File: `usability_issues_extractor.yaml`
- ID: `usability_issues`
- Consumer: `source: usability_issues`
- Result: Variables returned correctly

## Consequences

### Positive

- Referential integrity is now enforced by a CI test that walks all YAMLs and
  fails if any `consumes.source` doesn't resolve to a declared `id`.

- The filter in `readUpstreamDiscoveryVariables` works correctly when ids match.

- No implicit transformations or mappings to reason about — what you see in
  `consumes.source` is exactly what the producer's `id` must be.

### Negative

- Existing variables in the cascade store with old `source_template` values
  (e.g., `desk_research_processor`, `analyze_notes`) are orphaned. This is
  acceptable because all existing data was test data that will be deleted.

- Template filenames can diverge from ids, which could cause confusion. Mitigated
  by this ADR documenting the convention explicitly.

## Verification

The fix is verified by:

1. **Referential integrity test** (`cascade-referential-integrity.test.ts`):
   Walks all YAMLs, builds the set of declared ids, asserts every
   `consumes.source` resolves to a known id.

2. **Source filter test** (`cascade-source-filter.test.ts`): Tests that
   variables are returned when `source.template` matches `spec.source`, and
   filtered out when they don't match.

3. **Live verification**: Three cascade chains tested in Qori-dev:
   - desk_research → stakeholder_synthesis
   - session_summary → affinity_mapping (or other consumer)
   - usability_issues → research_readout

## Related

- ADR 0007: Cascade Contracts Fail Loudly
- `docs/known-limitations.md`: Non-pool variable aggregation
- `backend/src/helpers/studyVariables.ts`: `TEMPLATE_TO_DISCOVERY_TYPE` mapping
