# Variable Structure Spec — Supporting the Target Brief

To produce the target brief modal and output, `study-variables.json` and discovery variable files need to contain richer, more semantically structured data than current implementation.

This document specifies what each upstream discovery template must EMIT to enable the brief's cascade behavior.

---

## The principle

**Variables must preserve source document fidelity.** If the source has 6 paragraphs about a constraint with quotes, attribution, and implications — the variable must capture all of that across structured fields. Not a summarized one-liner.

This is the schema-depth fix already in flight with CC, but specified concretely against the target brief.

---

## Discovery variable structure

### Desk research emits

When desk_research runs, it must emit (to `_discovery/{topic}/desk-research/.variables/{slug}-variables.json`):

```yaml
discovered_barriers:
  pool: true
  schema:
    type: array
    items:
      id: string                         # barrier-001 etc.
      title: string                      # "Critical Navigation Failure Indicated by High Search Reliance"
      summary: string                    # 1-2 sentences
      magnitude: string                  # "30% QoQ increase" or "45% abandonment"
      evidence: array of strings         # supporting metrics or quotes
      affected_population: string        # "2.1M monthly users" or "AT users (12% of sessions)"
      source_document: string            # "VA Health & Benefits Mobile App Q4 2025 Analytics"
      confidence: enum [Strong, Moderate, Limited]

discovered_metrics:
  pool: true
  schema:
    type: array
    items:
      id: string                         # metric-001
      metric_name: string                # "Task abandonment rate"
      value: string                      # "45%"
      context: string                    # "Overall, with appointments at 52% and benefits at 48%"
      baseline_or_target: string|null    # "vs 92% completion for prescription refill"
      source_document: string

discovered_journeys:
  pool: true
  schema:
    type: array
    items:
      id: string
      journey_name: string               # "Prescription refill"
      success_pattern: string|null       # "Direct, shallow navigation works"
      failure_pattern: string|null       # "Multi-level navigation drops users"
      completion_rate: string|null       # "92%"
      satisfaction: string|null          # "8.1/10"
      source_document: string

methodology_recommendations:
  pool: true
  schema:
    type: array
    items:
      id: string
      method: string                     # "Card sorting + tree testing"
      addresses: string                  # "Veterans' mental models for organizing VA services"
      rationale: string                  # full sentence with reasoning
      source_document: string

knowledge_gaps:
  pool: true
  schema:
    type: array
    items:
      id: string
      gap: string                        # "Veteran mental models for organizing health/benefits"
      why_matters: string                # downstream implication
      suggested_resolution: string|null  # "card sorting study with veterans"
      source_document: string

source_artifacts:
  pool: true
  schema:
    type: array
    items:
      title: string
      source_org: string                 # "VA Digital Analytics Team"
      date: string
      type: string                       # "Internal analytics report"
      contribution: string               # what this source contributed
```

---

### Stakeholder synthesis emits

When stakeholder_synthesis runs, it must emit (to `_discovery/{topic}/stakeholder-interviews/.variables/{slug}-variables.json`):

```yaml
stakeholder_constraints:
  pool: true
  schema:
    type: array
    items:
      id: string                         # constraint-001
      type: enum [Technical, Policy, Resource, Organizational]
      constraint: string                 # "React Navigation v6 nested navigators (4 levels deep)"
      impact: string                     # "Deep linking breaks, inconsistent back button behavior"
      source: string                     # "SH-002"
      source_role: string                # "Engineering Lead"
      source_team: string                # "OCTO Mobile Engineering"
      verbatim_quote: string|null        # full quote from stakeholder
      broader_pattern: string|null       # related system observation
      research_implication: string|null  # what this means for study design
      implementation_implication: string|null  # what this means for the build

stakeholder_priorities:
  pool: true
  schema:
    type: array
    items:
      id: string
      priority: string                   # "Navigation overhaul"
      stated_by: array of strings        # ["SH-001", "SH-002", "SH-003"]
      aligns_with_user_need: enum [Yes, No, Partial, Unknown]
      driver: string                     # "App store ratings, congressional inquiries"
      timeline: string|null              # "Q3 2026"
      effort_estimate: string|null       # "6-8 sprints"

alignment_gaps:
  pool: true
  schema:
    type: array
    items:
      id: string
      gap_description: string            # "Accessibility stated P1 but sprint-deprioritized"
      stated_position: string            # "All stakeholders rate accessibility P1"
      actual_behavior: string            # "Acknowledged: 'when push comes to shove, accessibility fixes get bumped'"
      acknowledged_by: string            # "SH-001"
      verbatim_quote: string|null
      consequence: string                # "9-month-old open issue on tab bar accessibility"
      addressable_in_research: boolean

stakeholder_questions_for_users:
  pool: true
  schema:
    type: array
    items:
      id: string
      priority: enum [Blocking, Important, Validation]
      question: string                   # "Do veterans struggle with finding features (IA) or recognizing navigation elements (UI)?"
      asked_by: string                   # "SH-002"
      stakeholder_insight: string        # "those are different engineering problems"
      suggested_method: string|null      # "Task-based usability testing with think-aloud"

backstage_observations:
  pool: true
  schema:
    type: array
    items:
      id: string
      title: string                      # "Requirements definition process"
      pattern_type: enum [working, broken, organizational, resource]
      observation: string                # full description
      verbatim_quote: string|null
      flow_description: string|null      # process flow if applicable
      source: string

system_failure_modes:
  pool: true
  schema:
    type: array
    items:
      id: string
      flow_name: string                  # "Screen Navigation with Assistive Technology"
      where_it_breaks: string            # "Focus management fails on every screen transition"
      consequence: string                # "15-20 extra swipes per navigation"
      source: string                     # "SH-003"
      verbatim_quote: string|null
      mermaid_diagram: string|null       # if source includes one
```

---

### Survey synthesis emits

When survey_synthesis runs, it must emit (to `_discovery/{topic}/survey-synthesis/.variables/{slug}-variables.json`):

```yaml
survey_themes:
  pool: true
  schema:
    type: array
    items:
      id: string                         # theme-001
      theme_name: string                 # "Accessibility Barriers"
      frequency_count: integer           # 6
      frequency_percentage: integer      # 20
      sentiment: enum [Negative, Positive, Mixed, Neutral]
      priority: enum [High, Medium, Low]
      pattern: string                    # full pattern description
      verbatim_quotes: array             # array of quote objects
        items:
          quote: string
          respondent: string             # "R004"

survey_findings:
  pool: true
  schema:
    type: array
    items:
      id: string
      finding: string                    # "73% of Veterans abandoned tasks due to navigation"
      metric_name: string                # "Task Abandonment Rate"
      sample_size: integer
      affected_segment: string|null      # "older veterans (65+)" or "AT users"
      supporting_quotes: array of strings
      source_question: string|null       # which survey question yielded this

survey_recommendations:
  pool: true
  schema:
    type: array
    items:
      id: string
      action: string
      based_on_theme: string             # references theme_name
      priority: enum [High, Medium, Low]
      suggested_owner: string|null

sample_demographics:
  pool: false  # single object, not pool
  schema:
    type: object
    total_responses: integer
    composition: string                  # "Mix of ages 25-75, urban and rural, 30% AT users"
    response_rate: string|null

discovered_barriers:
  # SAME schema as desk_research's discovered_barriers
  # Survey contributes barriers from its theme analysis

discovered_metrics:
  # SAME schema as desk_research's discovered_metrics
  # Survey contributes quantitative findings

knowledge_gaps:
  # SAME schema as desk_research's knowledge_gaps
  # Survey contributes what surveys couldn't reveal
```

---

## Brief consumes structure

The brief reads upstream variables and synthesizes them. It also EMITS variables for downstream use.

### Brief consumes (from selected discovery artifacts)

The brief modal aggregates variables from selected discovery artifacts:

```yaml
consumes:
  # From any selected desk_research artifact
  - key: discovered_barriers
    source: discovery_selection
    inject_as: grounding
    pool_aggregation: union  # combine across selected sources

  - key: discovered_metrics
    source: discovery_selection
    inject_as: grounding
    pool_aggregation: union

  - key: discovered_journeys
    source: discovery_selection
    inject_as: reference

  - key: methodology_recommendations
    source: discovery_selection
    inject_as: grounding   # this drives method pre-population

  # From any selected stakeholder_synthesis artifact
  - key: stakeholder_constraints
    source: discovery_selection
    inject_as: grounding   # drives risks pre-population

  - key: stakeholder_priorities
    source: discovery_selection
    inject_as: context

  - key: alignment_gaps
    source: discovery_selection
    inject_as: context

  - key: stakeholder_questions_for_users
    source: discovery_selection
    inject_as: grounding   # drives research questions pre-population

  # From any selected survey_synthesis artifact
  - key: survey_themes
    source: discovery_selection
    inject_as: reference

  - key: survey_findings
    source: discovery_selection
    inject_as: grounding

  - key: sample_demographics
    source: discovery_selection
    inject_as: context

  # Cross-source aggregations
  - key: knowledge_gaps
    source: discovery_selection
    inject_as: reference
    pool_aggregation: union
```

### Brief emits (for downstream — research_plan, discussion_guide, etc.)

```yaml
emits:
  - key: research_objectives
    schema:
      type: array
      items:
        objective: string
        addresses_research_question: string  # which RQ this objective serves
        sourced_from: array  # which discovery findings motivated this

  - key: research_questions
    schema:
      type: array
      items:
        question: string
        priority: enum [Blocking, Important, Validation]
        from_stakeholder: string|null  # which SH-XXX raised this
        method_required: string  # what method answers this

  - key: target_barriers
    schema:
      type: array
      items:
        barrier: string
        sourced_from: string  # discovered_barrier.id this validates
        target_rate: string|null  # if measurable

  - key: methodology_selection
    schema:
      type: object
      method: string
      rationale: string  # why this method
      recommended_by_sources: array  # which discovery sources recommended

  - key: participant_criteria
    schema:
      type: object
      total_count: string  # "8-12"
      segments: array
        items:
          segment_label: string  # "Screen reader users"
          count: string  # "3"
          rationale: string  # why this segment is included
          sourced_from: string  # which discovery finding motivated

  - key: timeline_envelope
    schema:
      type: object
      duration: string  # "6 weeks"
      preference_type: enum [Standard, Accelerated, Extended]
      decision_deadline: string  # "2026-06-15"

  - key: budget
    schema:
      type: object
      total: string  # "$800"
      compensation_per_participant: string|null

  - key: out_of_scope
    schema:
      type: array
      items:
        item: string
        rationale: string|null  # if "already established by discovery", note source

  - key: business_context
    schema:
      type: object
      problem_statement: string  # full paragraph
      stakeholder_context: string  # who cares and why
      decision_context: string  # what decision this enables
```

---

## Citation marker generation

The target brief has citation markers like `[D1]`, `[S2]`, `[V3]` woven through the prose. These are generated by the Generate phase, not stored as variables.

**Marker convention:**
- `D1, D2...` — Desk research findings, ordered by appearance in brief
- `S1, S2...` — Stakeholder synthesis findings
- `V1, V2...` — Survey ("V" for Voice of customer) findings

**Generation rule:** When Sonnet writes a claim, it appends a marker referencing the upstream variable that supports it. The bottom Discovery sources table maps markers to source artifacts.

**This is a prompt instruction**, not a variable structure. Detailed in next section.

---

## What this changes in CC's current implementation

### Schema changes (12 shared schemas need expansion):

1. `schemas/discovered_barrier.yaml` — expand with magnitude, affected_population, evidence, source_document
2. `schemas/stakeholder_constraint.yaml` — expand with role context, verbatim_quote, broader_pattern, implications
3. `schemas/alignment_gap.yaml` — expand with stated_position, actual_behavior, verbatim_quote, consequence
4. `schemas/validated_theme.yaml` — already exists for affinity, OK
5. NEW: `schemas/discovered_metric.yaml`
6. NEW: `schemas/discovered_journey.yaml`
7. NEW: `schemas/methodology_recommendation.yaml`
8. NEW: `schemas/stakeholder_priority.yaml`
9. NEW: `schemas/stakeholder_question.yaml`
10. NEW: `schemas/survey_theme.yaml`
11. NEW: `schemas/survey_finding.yaml`
12. NEW: `schemas/survey_recommendation.yaml`

### YAML emits updates:

1. `desk_research.yaml` — add `methodology_recommendations`, expand `discovered_barriers` schema, expand `discovered_metrics` schema
2. `stakeholder_synthesis.yaml` — expand all existing emits with verbatim quotes, role context, implications
3. `survey_synthesis.yaml` — add `survey_themes`, `survey_findings`, expand `discovered_barriers`

### Brief consumes updates:

`research_brief.yaml` consumes block needs:
- Add `methodology_recommendations` consumption
- Add `stakeholder_questions_for_users` consumption (for research questions pre-population)
- Add `survey_themes` and `survey_findings` consumption
- Set `pool_aggregation: union` on appropriate variables (combine across discovery sources)

### Extract phase prompt update:

Add to `variableExtractor.js` Haiku prompt:

```
Extract with maximum semantic fidelity. For each variable instance:
- Capture verbatim quotes when present in source
- Capture source attribution with role context (not just SH-001, but "SH-001 Product Owner, OCTO Mobile Experience")
- Capture related broader patterns from the same document
- Capture research and implementation implications when present
- Do not summarize or abbreviate

If the source document has rich content for a constraint, the extracted variable must reflect that depth across its schema fields. Thin extraction is the failure mode to avoid.
```

---

## What CC sees vs. what this becomes

**Current `study-variables.json` after stakeholder_synthesis runs:**
```json
"stakeholder_constraints": {
  "value": [
    "React Navigation v6 nested navigators (4 levels deep) - Deep linking breaks, inconsistent back button behavior",
    "..."
  ]
}
```

**Target `study-variables.json` after stakeholder_synthesis runs:**
```json
"stakeholder_constraints": {
  "value": [
    {
      "id": "constraint-001",
      "type": "Technical",
      "constraint": "React Navigation v6 nested navigators (4 levels deep)",
      "impact": "Deep linking breaks, inconsistent back button behavior",
      "source": "SH-002",
      "source_role": "Engineering Lead",
      "source_team": "OCTO Mobile Engineering",
      "verbatim_quote": "The navigation tree is about 4 levels deep in some places. Appointments alone has 3 nested stacks. Each bottom tab maintains its own state, which confuses users who expect a global back button.",
      "broader_pattern": "Multi-level navigation creates state management complexity that breaks user expectations",
      "research_implication": "Test scenarios should include deep-linking flows specifically",
      "implementation_implication": "Q3 redesign should evaluate React Navigation v7 upgrade as structural prerequisite"
    }
  ]
}
```

THAT is the data Sonnet needs to produce the target brief. Same upstream document, vastly more captured context.

---

## Summary

The variable structure changes are:
1. **Schema depth** — 4 existing schemas expand, 8 new schemas created
2. **Extract prompt update** — instruct Haiku for fidelity, not summarization
3. **YAML emits updates** — three discovery templates declare richer extraction
4. **Brief consumes updates** — read richer variables, aggregate across sources
5. **Generate prompt update** — instruct Sonnet to weave upstream into prose with citation markers

These five changes produce the target brief. No architectural rebuild. Schema and prompt depth, applied systematically.
