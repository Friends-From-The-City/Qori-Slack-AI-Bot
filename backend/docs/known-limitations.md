# Known Limitations

Design decisions that have known limitations, documented for future consideration.

---

## 1. Non-pool variable aggregation across discovery artifacts

**File:** `src/helpers/studyVariables.ts` — `readUpstreamDiscoveryVariables`

**Current behavior:**

When multiple discovery artifacts of the same type exist in a project (e.g., two desk_research artifacts for different topics), and a downstream template consumes a non-pool variable from that type:

- **Pool variables (arrays):** All values from all artifacts are concatenated. Correct behavior.
- **Non-pool variables (scalars/objects):** Most recent artifact wins (by `source.date`).

**Why this may be limiting:**

"Most recent wins" assumes the second artifact supersedes the first. This is true for some singletons (e.g., `sample_demographics` describing overall participant pool) but not others (e.g., context-specific findings about different cohorts that should coexist).

**Example scenario where this breaks:**

1. Project runs desk research on "veteran mobile usage" — emits `sample_demographics: {total: 50, segment: 'mobile users'}`
2. Project runs desk research on "veteran accessibility needs" — emits `sample_demographics: {total: 30, segment: 'accessibility users'}`
3. Downstream stakeholder synthesis consumes `sample_demographics`
4. Result: Only sees accessibility data (most recent), loses mobile data

**Long-term fix:**

Return array of values with source attribution for all non-pool variables from multiple artifacts, letting the downstream template decide how to handle multiplicity. This requires:
- Schema change to support multiple values per variable key
- Template updates to handle multiplicity
- Extraction logic updates

**When to revisit:**

When projects routinely accumulate multiple discovery artifacts of the same type and researchers report missing data in downstream outputs.

**Filed:** 2026-05-28, Phase B-0

---

## Adding new limitations

When documenting a design limitation:

1. Describe the current behavior precisely
2. Explain why it's limiting (concrete example scenario)
3. Sketch the long-term fix
4. Define the trigger for revisiting
5. Date and phase when filed
