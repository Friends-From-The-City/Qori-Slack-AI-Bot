# Claims Audit

Tracking defects where the system claims to do something but doesn't. These are trust-eroding bugs — the user provides input that is silently discarded.

## Active

| ID | Found | Defect | Location | Status | PR |
|----|-------|--------|----------|--------|-----|
| — | — | — | — | — | — |

## Resolved

| ID | Found | Resolved | Defect | Resolution | PR |
|----|-------|----------|--------|------------|-----|
| CA-001 | 2026-08-14 | 2026-08-14 | Discovery modal `description` field collected but not used in prompts | Relabeled as `source_intent`, wired into all 3 discovery YAMLs, used in gap derivation | (this PR) |

---

## CA-001: Discovery description field silently ignored

**Symptom:** User fills in "What are these documents about?" field in desk research or stakeholder modals. The value is collected by the handler, passed to the YAML processor, but never used in any AI prompt. The input is discarded.

**Root cause:** The `description` input variable was declared in `desk_research.yaml` but not used in any `ai_generation_tasks` prompt. `stakeholder_synthesis.yaml` and `survey_synthesis.yaml` didn't even declare it. The handler passed it anyway (`description: description || topic`), but without YAML consumption it was silently dropped.

**Impact:** Users believe their context affects analysis; it does not. Trust erosion.

**Fix:**
1. Relabel field to "What do you need this source to tell you?" — clarifies purpose
2. Declare as input variable in all three discovery YAMLs
3. Wire into prompts: informs gap derivation context
4. Add to survey modal (was missing entirely)

**Defect class:** Same as inert `rescrub_threshold` field removed in #268 — input that ignores user's answer.
