# Research Brief: VA Mobile App Navigation Redesign

**Study:** va-mobile-nav-2026 &nbsp; | &nbsp; **Researcher:** Lapedra Tolson &nbsp; | &nbsp; **Requested by:** David Park, Mobile Product Manager &nbsp; | &nbsp; **Date:** May 3, 2026 &nbsp; | &nbsp; **Status:** Pending approval

---

## Summary

The VA Health & Benefits mobile app serves 2.1M monthly active veterans and is in navigation crisis: 45% task abandonment, 4.2/10 satisfaction, and 30% quarter-over-quarter increase in compensatory search behavior <sup>[D1]</sup>. The pattern is structural — Engineering Lead identifies React Navigation v6's 4-level nested architecture as the root technical cause <sup>[S2]</sup>, while veterans confirm the experience: "Too many layers — I get lost after two taps" <sup>[V3]</sup>. This study tests how veterans naturally organize VA services to inform the Q3 2026 information architecture redesign, with primary focus on whether the problem is the IA itself or the UI surfacing it — an Engineering-flagged distinction that determines whether the fix is 3 sprints or 8 <sup>[S2]</sup>.

| | |
|---|---|
| **Method** | Card sorting and tree testing — recommended by 3 discovery sources |
| **Participants** | 8–12 veterans, including 3 screen reader users (per accessibility evidence below) |
| **Timeline** | 6 weeks |
| **Decision deadline** | 2026-06-15 |
| **Budget** | $800 |

---

## Problem

The VA Health & Benefits mobile app's navigation system is failing its 2.1M monthly active veterans. Q4 2025 analytics show **45% overall task abandonment**, with appointments scheduling at **52%** and benefits status checks at **48%** — yet prescription refill achieves **92% completion with 8.1/10 satisfaction**, demonstrating that direct, shallow navigation works <sup>[D2]</sup>. Veterans compensate for navigation failure through search (up 30% QoQ, with "appointments" representing 22% of all searches despite being a core function) <sup>[D1]</sup> and contact center calls — **34% of mobile-tagged tickets involve agents walking veterans through navigation to features the app already supports** <sup>[D5]</sup>.

The crisis is not uniform. Veterans using assistive technology spend **2.1x longer on appointment flows**, and screen reader users rate findability **2.0 out of 10 versus 6.4 for other users** <sup>[D4, V1]</sup>. The growing AT population (9% → 12% of sessions) <sup>[D4]</sup> compounds the impact. Engineering Lead diagnoses the root cause as React Navigation v6's nested 4-level architecture creating "unpredictable navigation" with deep linking failures and inconsistent back button behavior <sup>[S1]</sup> — a structural issue that the Q3 2026 redesign window is positioned to address.

---

## What we'll learn

This study addresses the **2 blocking research questions** stakeholders identified as gating design decisions <sup>[S5]</sup>:

1. **Do veterans struggle with finding features (IA problem) or recognizing navigation elements (UI problem)?** This distinction matters because, as Engineering Lead noted, "those are different engineering problems" — IA reorganization is 3 sprints, paradigm change is 8+ <sup>[S2]</sup>.

2. **How do veterans mentally model VA services?** Stakeholder consensus and 50% of survey respondents independently flagged the Health/Benefits categorization as misaligned with veteran thinking — "What's the difference between Health and Benefits? My disability IS my health" <sup>[V4]</sup>.

We'll also address the AT-specific question stakeholders flagged as important but non-blocking <sup>[S5]</sup>:

3. **Are navigation pain points universal or specific to assistive technology?** Aggregate metrics may be hiding AT-user experience problems that need separate analysis.

---

## Method

**Approach** — Card sorting + tree testing

**Why this method:** Three discovery sources independently recommended this combination:
- Desk research: "Card sorting or tree testing studies with veterans to understand their natural categorization" <sup>[D7]</sup>
- Stakeholder synthesis (SH-001, Product Owner): "How do veterans mentally model VA services? — Card sorting + tree testing" <sup>[S5]</sup>
- Survey synthesis recommendations: "Redesign information architecture with user-centered categories" <sup>[V7]</sup>

This method directly answers Research Question 2 (mental models) and provides input for Research Question 1 (IA vs. UI distinction). Moderated usability testing on the resulting prototypes will follow in a subsequent study.

---

## Participants

**8–12 veterans, with mandatory accessibility representation:**

| Segment | Count | Rationale |
|---------|-------|-----------|
| Veterans without accessibility needs | 5–7 | Core user base validation |
| Screen reader users (VoiceOver/TalkBack) | 3 | Stakeholder-flagged exclusion gap; survey shows AT users rate findability 2.0 vs 6.4 <sup>[V1]</sup> |
| Voice control users | 2 | Per stakeholder recommendation; underrepresented in past studies <sup>[S7]</sup> |

**Demographics:**
- Mix of age ranges, with at least 3 veterans aged 65+ (survey identified age-related complexity barriers; 70% of AT users abandon tasks) <sup>[V2, V3]</sup>
- Mix of first-time and repeat disability claim filers (per researcher input)
- Mix of iOS and Android users
- Recruited via VA disability services offices and 508 Office contacts (per stakeholder recommendation to access AT users) <sup>[S7]</sup>

---

## Timeline

| Phase | Dates |
|-------|-------|
| Planning and recruitment | May 4 – May 13, 2026 |
| Fieldwork | May 14 – May 27, 2026 |
| Analysis | May 28 – June 5, 2026 |
| Findings presentation | June 6 – June 12, 2026 |

**Hard deadline:** 2026-06-15

---

## Out of scope

The following are excluded based on what discovery has already established:

- **Whether navigation is broken** — Already demonstrated by 45% abandonment and 73% of survey respondents reporting task abandonment <sup>[D2, V2]</sup>. This study tests solutions, not the problem.
- **Whether prescription refill works** — Established at 92% completion and 8.1/10 satisfaction <sup>[D2]</sup>. We'll reference this as a positive baseline, not re-validate.
- **Visual design or branding** — Per researcher scope; design system constraints already documented <sup>[S1]</sup>.
- **Onboarding flow** — Separate research planned for Q4 2026.
- **Provider-side experience** — Veteran-facing only.
- **Web app navigation** — Mobile only.

---

## Risks

| Risk | Source | Mitigation |
|------|--------|------------|
| **Recruiting screen reader users within 9-day window** — VA Section 508 Office reports zero screen reader users recruited in last 3 mobile usability studies <sup>[S7]</sup> | Stakeholder synthesis | Partner with VA Section 508 Office (SH-003) and VA disability services offices early; offer flexible scheduling and multiple session formats |
| **Card sorting tools may not be screen reader accessible** — Survey shows "Nothing works with VoiceOver except prescription refill" (R021) <sup>[V1]</sup> | Survey synthesis | Run separate sessions for screen reader users using verified-accessible tools (OptimalSort with NVDA testing, or moderated verbal sort) |
| **Terminology in card labels may bias results** — 19% of navigation complaints cite terminology mismatch; veterans use different language than VA labels <sup>[D3, V4]</sup> | Desk + survey synthesis | Pre-test card labels with 2 veterans before full sessions; provide both VA terms and veteran-friendly alternatives |
| **Engineering can't act on findings within Q3 timeline** — 4 mobile engineers shared across entire app; QA bandwidth only 2 weeks per 6-week cycle <sup>[S1]</sup> | Stakeholder synthesis | Deliver findings in 3 priority tiers (immediate IA fixes, near-term UI changes, strategic paradigm shifts) so Engineering can sequence within capacity |
| **Findings may require React Navigation v7 upgrade** — Current v6 architecture limits structural changes to 6-8 sprint cycles <sup>[S1]</sup> | Stakeholder synthesis | Brief stakeholders early on which findings would require infrastructure work; align with Engineering Lead's planned v7 upgrade timeline |

---

## Approval

- [ ] Stakeholder approves scope and method
- [ ] Stakeholder approves timeline and deadline
- [ ] Budget confirmed
- [ ] Recruitment criteria validated, including AT user representation

Once approved, the lead researcher will produce a detailed research plan covering session protocols, recruitment mechanics, and analysis approach.

---

## Discovery sources

This brief synthesized findings from 3 discovery sources. Citation markers throughout the document trace each claim to its source.

| Marker | Source | Type | Date | Findings used |
|--------|--------|------|------|---------------|
| **D**1–D7 | va-health-benefits-mobile-app-q4-2025-analytics-summary | Desk research | 2026-05-01 | 5 findings, 3 metrics, 4 recommendations |
| **S**1–S7 | stakeholder-notes-va-mobile | Stakeholder synthesis | 2026-05-03 | 6 constraints, 5 priorities, 3 alignment gaps, 5 research questions, 6 recommendations |
| **V**1–V7 | va-mobile-app-navigation-satisfaction-survey-q1-2026 | Survey synthesis | 2026-05-01 | 6 themes (n=30), 4 recommendations |

Full discovery artifacts: see `_discovery/va-mobile-navigation/` in study repository.

---

## Document Information

| Field | Value |
|-------|-------|
| Generated | May 3, 2026 |
| Model | claude-sonnet-4-5-20251022 (Generate) + claude-haiku-4-5-20251001 (Extract) |
| Template | research_brief v6.0 |
| Study | va-mobile-nav-2026 |
| Cascade | Consumed 24 variables across 3 discovery sources; emits 12 variable types for downstream use |

*Generated by Qori*
