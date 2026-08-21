# Content Design

## Voice

Plain, specific, research-oriented, calm, transparent about AI. Sentence case everywhere. No exclamation marks. No jargon from the implementation layer.

## Vocabulary (canonical UI terms)

| UI term | Never say |
|---|---|
| Study | research engagement, workflow instance |
| Source | ingested file, transcript upload, input document |
| Evidence | nugget (internal name), atomic unit, extraction |
| Theme | cluster, affinity group (except in method contexts) |
| Finding | insight construct, validated output |
| Recommendation | prioritized recommendation object |
| Output / Artifact | generated document, LLM artifact |
| Analyzing interviews | processing embeddings, running LLM task |
| Ready for review | pending human validation |
| Suggested (by Qori) | AI-generated candidate |
| Published to GitHub | pushed, committed |
| Evidence is getting old (stale) | TTL expired, decay threshold |
| Carries through / from your brief | cascades, consumes, emits, variables |
| What discovery found | emitted artifacts, discovery variables |

Note: "nugget" is backend vocabulary (ADR-0037). The UI groups nuggets under **Evidence**; an individual nugget is an **evidence item**.

## Microcopy rules

1. Lead with the noun the researcher cares about: "3 findings need review", not "Review required: findings (3)".
2. Status labels are states, not verbs: Draft, Needs review, Approved, Published, Archived.
3. AI transparency formula: *what Qori did + from what + what the researcher controls.* E.g. "Qori drafted this finding from 12 evidence items across 4 interviews. Review it before it's added to the study."
4. Failure copy names the layer: "The research is approved. Publishing to GitHub failed — retry or check the connection in Admin." Never let integration failure read as research failure.
5. Waiting copy answers three questions: what's happening, can I leave, what happens next. "Analyzing 7 interviews · You can leave — we'll add the results to your Work Queue."
6. Empty states teach: first-use empties explain the workflow and offer the first action; filtered empties offer to clear filters. Never a bare "No data".
7. Confirmation dialogs state consequence, not ceremony: "Archive this study? It stays searchable and traceable, but leaves active lists."
8. Numbers are specific: "Supported by 12 evidence items from 4 interviews", never "strong evidence".
9. Dates: relative under 7 days ("2 days ago"), absolute after ("Mar 12, 2026"); staleness always absolute + duration.
10. Buttons are verb-first and specific: "Publish to GitHub", "Accept finding", "Request changes" — never "OK", "Submit", "Yes".

## Terminology governance

New UI strings that introduce a research concept must map to an entry in this file. Agency branding may change the org name shown, never the research vocabulary.


## Provenance-label voice (rule, from Block 2 review)
Provenance lines on prefilled fields name the SOURCE DOCUMENT in research language, never pipeline mechanics:
- Say "Suggested by your stakeholder synthesis — the questions it raised for user research", never "Seeded from SS-001's questions" or any cascade-variable name ("barrier coverage", "target_barriers").
- Verbs: "Suggested by / From / Recommends". Forbidden: seeded, injected, cascaded, populated, projected.
- Artifact IDs (DR-001) stay in custody chips and citations — not in sentence prose.
- The source-document name in a provenance line is ALWAYS a link to that document (opens in a peek, full view on explicit open) — provenance you can't follow isn't provenance.
- CONSUMES/EMITS/ASKS are contract vocabulary: design docs and admin diagnostics only. Researcher UI says what you get, in plain words ("You get: themes, knowledge gaps, and a recommended method"), never variable names.