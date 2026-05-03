# Target Brief Modal — `/qori-brief`

This modal produces the brief in `01-target-brief-output.md`. The key principle: **researcher reviews and adjusts what discovery already surfaced**, rather than filling everything from scratch.

---

## Modal flow

The modal opens, queries `_discovery/` for the team, and pre-populates fields based on cascade analysis. Researcher sees what discovery already knows and either confirms or overrides.

---

## Modal layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Research Brief                                              [✕]    │
│  Define research scope for stakeholder approval. Once approved,      │
│  the research plan will elaborate execution details.                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Study name *                                                        │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ va-mobile-nav-2026                                              │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  Use kebab-case. Study folder created automatically.                 │
│                                                                      │
│  Requested by *                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ David Park, Mobile Product Manager                              │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  Stakeholder who will approve this brief.                            │
│                                                                      │
│  ─────────────────────────────────────────────────                  │
│                                                                      │
│  📋 Discovery to inform this brief                                   │
│                                                                      │
│  ✅ 3 discovery sources available — auto-selected                    │
│                                                                      │
│  ☑ 📄 va-health-benefits-mobile-app-q4-2025-analytics-summary       │
│      Desk research · 5 findings · 2026-05-01                         │
│                                                                      │
│  ☑ 🎙 stakeholder-notes-va-mobile                                    │
│      Stakeholder synthesis · 6 constraints, 5 priorities · 2026-05-03│
│                                                                      │
│  ☑ 📊 va-mobile-app-navigation-satisfaction-survey-q1-2026          │
│      Survey synthesis · 6 themes, n=30 · 2026-05-01                  │
│                                                                      │
│  Uncheck to exclude any source. Brief works without discovery — but  │
│  reads richer with it.                                               │
│                                                                      │
│  ─────────────────────────────────────────────────                  │
│                                                                      │
│  🤖 Discovery suggests:                                              │
│                                                                      │
│  Based on the selected sources, your brief can use these             │
│  pre-populated fields. Edit any to override discovery's suggestion.  │
│                                                                      │
│  Method                                                              │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Card sorting + tree testing                                     │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  ✨ Recommended by 3 discovery sources                              │
│                                                                      │
│  Participants                                                        │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 8-12 veterans, including 3 screen reader users and 2 voice     │ │
│  │ control users. Mix of ages with at least 3 aged 65+. Recruit   │ │
│  │ via VA Section 508 Office and disability services.             │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  ✨ Composition reflects discovery: AT users excluded from past     │
│  studies (SH-003), age-related complexity barriers (Survey)         │
│                                                                      │
│  Research questions                                                  │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 1. Do veterans struggle with finding features (IA) or          │ │
│  │    recognizing navigation elements (UI)?                        │ │
│  │ 2. How do veterans mentally model VA services?                  │ │
│  │ 3. Are navigation pain points universal or AT-specific?         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  ✨ Pulled from stakeholder questions for users (3 of 5 selected)   │
│                                                                      │
│  Out of scope                                                        │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ • Whether navigation is broken (already established)            │ │
│  │ • Whether prescription refill works (already established)       │ │
│  │ • Visual design or branding evaluation                          │ │
│  │ • Onboarding flow                                               │ │
│  │ • Provider-side experience                                      │ │
│  │ • Web app navigation                                            │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  ✨ First two items pre-populated — discovery already established   │
│                                                                      │
│  Risks (preview, can be edited after generation)                     │
│                                                                      │
│  ⚠ Recruiting screen reader users in 9-day window                   │
│    Source: SH-003 — zero AT users in last 3 studies                  │
│  ⚠ Card sorting tools may not be screen reader accessible           │
│    Source: Survey R021 — "Nothing works with VoiceOver"             │
│  ⚠ Engineering capacity — 4 engineers shared across entire app      │
│    Source: SH-002                                                    │
│                                                                      │
│  ─────────────────────────────────────────────────                  │
│                                                                      │
│  Researcher adds (not from discovery):                               │
│                                                                      │
│  Problem statement *                                                 │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ [Empty — researcher fills this. Discovery findings will be      │ │
│  │  woven in by Sonnet during generation.]                         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  Brief framing of the problem in your words. Discovery context      │
│  will enrich this during generation.                                 │
│                                                                      │
│  Decision deadline                                                   │
│  ┌────────────┐                                                      │
│  │ 2026-06-15 │                                                      │
│  └────────────┘                                                      │
│  When findings need to land for the Q3 redesign decision.            │
│                                                                      │
│  Budget                                                              │
│  ┌──────────┐                                                        │
│  │ $800     │                                                        │
│  └──────────┘                                                        │
│                                                                      │
│  Timeline preference                                                 │
│  ⦿ Standard (6 weeks)                                                │
│  ◯ Accelerated (4 weeks)                                             │
│  ◯ Extended (8 weeks)                                                │
│                                                                      │
│  ─────────────────────────────────────────────────                  │
│                                                                      │
│  [Cancel]                                          [Create Brief →] │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Behavior specification

### On modal open

1. **Query `_discovery/{topic}/` for the team.**
   - If team has multiple topics, modal asks researcher which topic first (separate dropdown step) OR shows all discovery flat with topic in label
   - Recommendation: separate topic step if >1 topic exists, flat list if 1 topic
   - Sort by date descending — most recent first

2. **Auto-select all discovery checkboxes.** Researcher unchecks to exclude.

3. **Pre-populate cascade-driven fields based on selected discovery:**

   - **Method** — Aggregate `methodology_recommendations` from all selected discovery. If multiple sources recommend the same method, use it with "Recommended by N sources." If conflicting, present primary + alternatives.
   
   - **Participants** — Synthesize `participant_implications` from selected discovery. Pulls from accessibility evidence, demographic patterns, stakeholder recruitment recommendations.
   
   - **Research questions** — Pull from `stakeholder_questions_for_users` (typed Blocking, Important, Validation). Pre-populate Blocking + first 1-2 Important.
   
   - **Out of scope** — Pull from `established_findings` (things discovery already established that don't need re-investigation).
   
   - **Risks preview** — Pull from `stakeholder_constraints` (those that affect study execution). Display as preview only — full risks generated by Sonnet during Generate.

4. **Researcher-only fields stay empty:**
   - Problem statement (researcher's framing — Sonnet enriches with discovery during Generate)
   - Decision deadline
   - Budget
   - Timeline preference

### On modal submit

1. Selected discovery artifacts → load full variables → inject as `upstream_*` into prompt
2. Researcher's edits to pre-populated fields → use those values (override discovery defaults)
3. Researcher's new content (problem statement, deadline, budget) → use as input
4. Generate brief using full cascade context

### When no discovery exists

Modal shows:

```
📋 Discovery to inform this brief

⚪ No discovery research available for this topic yet.

Run /qori-discover first to add desk research, stakeholder interviews, 
or survey data. Or proceed without — brief will be generated from your 
inputs alone.

[Run discovery first]    [Proceed without discovery]
```

If "Proceed without discovery" — modal collapses cascade-driven fields and asks researcher for everything (methodology, participants, questions, out of scope, risks).

---

## Visual design notes

**The ✨ sparkle markers** indicate cascade-pre-populated fields. They communicate "this came from your discovery work, not from our default template." Researchers learn the system by seeing what cascade does.

**The 📋 / 🤖 / ⚠ section headers** create visual hierarchy:
- 📋 Discovery sources (input)
- 🤖 Discovery suggests (cascade output)
- ⚠ Risks preview (cascade output, preview only)

**Slack constraint:** This modal is dense. May need to be split into two screens via Slack's multi-step modal pattern:
- Screen 1: Study name, requested by, discovery selection
- Screen 2: Cascade-pre-populated fields + researcher additions

Or accept density on single modal with clear visual breaks.

---

## What this is NOT

- **NOT showing every variable.** The pre-populated fields are SYNTHESIZED from variables, not raw lists.
- **NOT replacing researcher judgment.** Every cascade-suggestion is editable. Researcher always has final say.
- **NOT requiring discovery.** Brief works without discovery, just with less richness.

---

## The principle

When discovery exists, the brief modal should make the researcher feel: 

> "Qori already understood my problem space. I'm just confirming and adjusting what it surfaced. The brief I'm about to generate isn't from scratch — it's the next step in work I started by uploading discovery documents."

That feeling is the wow at the modal level, before the document even generates.
