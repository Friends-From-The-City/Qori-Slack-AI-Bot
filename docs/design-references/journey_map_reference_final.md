# Journey Map: VA Mobile App Navigation

**Study:** va-mobile-nav-2026 &nbsp; | &nbsp; **Researcher:** Lapedra Tolson &nbsp; | &nbsp; **Date:** April 29, 2026

---

## Summary

Veterans navigate the VA mobile app through five distinct stages, from initial app launch to task completion. Critical accessibility failures concentrate in stages 1, 4, and 5 — discovery, data input, and confirmation — where assistive technology incompatibilities block task completion entirely. Stage 3 (task initiation) reveals a generic-button-label problem that compounds friction across all participants. The journey reveals a pattern: when veterans encounter even a single barrier, many abandon digital self-service in favor of phone support rather than persisting through workarounds.

> [!IMPORTANT]
> **Most critical journey moment:** Stage 4 (Data input). Calendar interface failures here block appointment scheduling entirely for VoiceOver and large-text users. Two of three participants could not complete this stage independently.

| Stage | Critical issues | Participants affected |
|-------|-----------------|----------------------|
| 01 — App launch & discovery | 3 | 2 of 3 |
| 02 — Feature location | 3 | 3 of 3 |
| 03 — Task initiation | 3 | 3 of 3 |
| 04 — Data input | 4 | 3 of 3 |
| 05 — Task completion | 3 | 1 of 3 |

---

## 01 &nbsp;&nbsp; App Launch and Navigation Discovery

Veterans open the VA mobile app and attempt to orient themselves within the primary navigation structure to locate needed services.

**Touchpoints** — Home screen → Bottom navigation tabs → Section discovery

**User emotion** — Confused

> "I've been using this app for two years and I just learned there's a Benefits section. That tells you everything."
> — PT-001, 00:07:08

#### What goes wrong

- Benefits section completely hidden from VoiceOver users — PT-001, 00:07:08
- Bottom navigation labels invisible with large text — PT-003, 00:05:20
- VoiceOver focus starts in content area instead of navigation — PT-001, 00:07:28

#### Success looks like

Users discover all available app sections within 30 seconds of opening the app, regardless of accessibility settings.

#### Design opportunity

Modify VoiceOver focus behavior to start on the tab bar, and implement responsive navigation labels that remain visible at 180% text scaling.

**Suggested owner** — Accessibility team

---

## 02 &nbsp;&nbsp; Feature Location and Access

Users navigate to specific app sections to find frequently-used features like appointments, prescriptions, or disability payments.

**Touchpoints** — Health tab → Appointments / Prescriptions, Benefits tab → Disability payments

**User emotion** — Frustrated

> "Why is this buried below messaging? I schedule appointments way more than I send messages. It should be higher up."
> — PT-002, 00:02:10

#### What goes wrong

- Appointments buried below messaging in Health section — PT-002, 00:02:10
- Disability payment information categorized under Benefits instead of Payments — PT-002, 00:04:05
- Appointments require navigating past promotional banners — PT-001, 00:03:32

#### Success looks like

Users locate frequently-used features within two taps from the home screen, without scrolling past unrelated content.

#### Design opportunity

Reorganize Health section hierarchy by usage frequency. Align section labels with user mental models — payments belong under Payments, not Benefits.

**Suggested owner** — Product team

---

## 03 &nbsp;&nbsp; Task Initiation

Veterans begin specific tasks — scheduling appointments, refilling prescriptions, composing secure messages.

**Touchpoints** — Task entry points → Action buttons → Form interfaces

**User emotion** — Uncertain

> "Action? What does that mean? Is that compose?... Why not 'compose new message' or 'write a message'?"
> — PT-001, 00:08:45

#### What goes wrong

- Generic button labels require guesswork — PT-001, 00:08:45
- Messaging requires three navigation steps (Health → Messages → Compose) — PT-002, 00:05:14
- Critical controls hidden below fold — PT-003, 00:07:30

#### Success looks like

Primary action buttons use descriptive labels and remain visible without scrolling.

#### Design opportunity

Replace generic button labels with specific action descriptions (e.g., "Compose new message" instead of "Action"). Ensure primary actions appear within the initial viewport.

**Suggested owner** — Content team

---

## 04 &nbsp;&nbsp; Data Input and Selection

Users interact with form controls, calendars, and selection interfaces to input information or make choices.

**Touchpoints** — Calendar date picker → Time selection → Provider dropdowns → Continue buttons

**User emotion** — Frustrated, blocked

> "It's just saying 'button' over and over. I can't tell what the dates are... they're all just 'button.' I have no idea what date I'm picking."
> — PT-001, 00:04:28

#### What goes wrong

- Calendar dates unreadable with VoiceOver (announces "button" repeatedly) — PT-001, 00:04:28
- Calendar interface unusable with large text — numbers remain too small — PT-003, 00:04:08
- Continue button hidden below calendar view, causing perception of frozen app — PT-002, 00:02:45
- Doctor names truncated in selection lists — PT-003, 00:08:10

#### Success looks like

Calendar announces actual dates to screen readers, remains usable at 180% text scaling, and the Continue button is visible on the same screen as date selection.

#### Design opportunity

Redesign the calendar component with proper accessibility labels and responsive layout that keeps critical actions within the viewport.

**Suggested owner** — Engineering team + Accessibility team

---

## 05 &nbsp;&nbsp; Task Completion and Confirmation

Veterans complete their intended tasks and look for confirmation that actions were successful.

**Touchpoints** — Save buttons → Confirmation messages → Success notifications

**User emotion** — Uncertain, doubtful

> "Did it go through?... Oh, I see it... I didn't see that at first because with my big text it was up above where I was looking."
> — PT-003, 00:02:52

#### What goes wrong

- Confirmation messages appear outside the viewport — PT-003, 00:02:52
- UI elements cut off and positioned off-screen — PT-003, 00:01:23
- Save buttons hidden below visible area — PT-003, 00:09:30

#### Success looks like

Confirmation messages appear within the user's current viewport. Save buttons remain visible without scrolling.

#### Design opportunity

Position confirmation messages within the user's current view. Place save buttons at the top of forms rather than hidden at the bottom.

**Suggested owner** — Design team

---

## Recommended actions

| Priority | Action | Stage | Owner | Effort |
|:--------:|--------|-------|-------|:------:|
| 1 | Fix calendar date picker accessibility labels to announce actual dates | 04 — Data input | Engineering + Accessibility | High |
| 2 | Implement responsive bottom navigation that maintains text labels at all accessibility sizes | 01 — App launch | Accessibility | High |
| 3 | Position Continue button within calendar viewport without requiring scrolling | 04 — Data input | Design | Medium |
| 4 | Reorganize Health section hierarchy based on user frequency data | 02 — Feature location | Product | Medium |
| 5 | Replace generic button labels with descriptive text | 03 — Task initiation | Content | Low |
| 6 | Move disability payment information to Payments section or add cross-linking | 02 — Feature location | Product | Low |

---

## Discussion questions

These questions emerged from the journey analysis and warrant team alignment before implementation.

1. Should we prioritize fixing the calendar accessibility issue or the navigation label visibility issue first, given both are critical blockers? — *Engineering + Accessibility teams*

2. How can we validate the proposed Health section reorganization without disrupting existing user muscle memory for prescription refills? — *Product + Design teams*

3. What's the feasibility of implementing a cross-functional messaging system that's accessible from multiple app sections? — *Engineering + Product teams*

---

## Methodology

**Framework** — Experience journey mapping

**Approach** — Stage-by-stage analysis of user actions, emotions, pain points, and opportunities derived from qualitative session data. Each stage's findings are grounded in verbatim quotes and observed behaviors. Pattern B traceability — citations are inline at each stage rather than aggregated separately.

**Data sources** — PT-001 (VoiceOver user), PT-002 (Tricare transition, weekly user), PT-003 (large text accessibility, calls VA monthly)

**Limitations** — Three participants. Strong accessibility focus reflects sample composition. Stage definitions are study-specific (mobile app navigation flow) — different study contexts would surface different stage structures.

### References

- Adaptive Path — Pioneers of journey mapping methodology
- Nielsen Norman Group — Stage-based emotion mapping framework
- Stickdorn, M. & Schneider, J. — *This Is Service Design Thinking* (2011)
- Kalbach, J. — *Mapping Experiences* (O'Reilly, 2nd ed., 2020)

---

## Appendix

<details>
<summary><strong>Related artifacts</strong></summary>

| Artifact | Location | Status |
|----------|----------|--------|
| PT-001 session summary | [03-fieldwork/session-summaries/pt-001-session-summary.md](../../03-fieldwork/session-summaries/pt-001-session-summary.md) | Complete |
| PT-002 session summary | [03-fieldwork/session-summaries/pt-002-session-summary.md](../../03-fieldwork/session-summaries/pt-002-session-summary.md) | Complete |
| PT-003 session summary | [03-fieldwork/session-summaries/pt-003-session-summary.md](../../03-fieldwork/session-summaries/pt-003-session-summary.md) | Complete |
| Observer notes | [03-fieldwork/observer-notes/](../../03-fieldwork/observer-notes/) | Complete |
| Affinity map | [04-analysis/affinity-mapping/va-mobile-nav-2026-affinity-map-2026-04-30.md](../../04-analysis/affinity-mapping/va-mobile-nav-2026-affinity-map-2026-04-30.md) | Complete |
| Research plan | [01-planning/research-plan.md](../../01-planning/research-plan.md) | Complete |

</details>

<details>
<summary><strong>Validity checklist</strong></summary>

| Criterion | Verified |
|-----------|:--------:|
| All quotes verbatim from session data | ✓ |
| Stage labels consistent throughout document | ✓ |
| Citations represent all participants in study | ✓ |
| Opportunities are specific and implementable | ✓ |
| Owners are concrete teams (not vague roles) | ✓ |

</details>

---

| | |
|---|---|
| Generated | April 29, 2026 at 5:42 PM UTC |
| Model | claude-sonnet-4-5-20251022 |
| Template | journey_mapping v3.12 |
| Study | va-mobile-nav-2026 |
| Max tokens | 8192 |

*Generated by Qori*
