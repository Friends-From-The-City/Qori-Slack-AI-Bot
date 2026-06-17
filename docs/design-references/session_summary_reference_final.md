# Session Summary: PT-001

**Study:** va-mobile-nav-2026 &nbsp; | &nbsp; **Researcher:** Lapedra Tolson &nbsp; | &nbsp; **Date:** May 19, 2026

---

## Summary

PT-001 is an experienced VoiceOver user who has used the VA mobile app daily for two years, primarily for monthly prescription refills. The session surfaced four pain points concentrated around accessibility failures in core navigation, two clear successes that demonstrate accessible design is achievable within the existing app, and a behavioral pattern of abandoning digital tasks in favor of phone support when navigation friction becomes too high.

> [!IMPORTANT]
> **Most striking observation:** PT-001 has used this app for two years without knowing the Benefits section existed. The bottom navigation tab was never discoverable through VoiceOver focus behavior.

---

## Participant context

**Background** — Veteran using VA services daily for two years

**App usage** — Daily user, primarily prescription refills (estimated ~30 sessions per month)

**Assistive technology** — VoiceOver screen reader

**Calling pattern** — Calls VA support at least monthly when unable to complete digital tasks

PT-001 has developed VoiceOver workarounds for the app's accessibility limitations but frequently abandons tasks in favor of phone support when navigation becomes too complex. This behavior pattern has implications beyond this single participant — it suggests an accommodated-but-not-served user experience.

---

## Pain points

### 01 &nbsp;&nbsp; Calendar Interface Completely Inaccessible

The calendar date picker only announces "button" repeatedly instead of actual dates, making date selection impossible for screen reader users. PT-001 attempted to schedule an appointment three times before abandoning the task.

> "It's just saying 'button' over and over. I can't tell what the dates are... they're all just 'button.' I have no idea what date I'm picking."
> — PT-001, 00:04:28

**Severity** — Critical &nbsp;|&nbsp; **Confidence** — Strong (verbatim quote + observed three task attempts + complete abandonment)

### 02 &nbsp;&nbsp; Benefits Section Hidden from VoiceOver Users

VoiceOver focus behavior prevents discovery of bottom navigation tabs. PT-001 used the app for two years without knowing the Benefits section existed — discovered it during the research session when prompted to find benefit information.

> "I've been using this app for two years and I just learned there's a Benefits section. That tells you everything."
> — PT-001, 00:07:08

**Severity** — High &nbsp;|&nbsp; **Confidence** — Strong (verbatim quote + observed in-session discovery + duration of misuse)

### 03 &nbsp;&nbsp; Appointments Buried in Navigation Hierarchy

Appointments require navigating through multiple items under the Health tab. Promotional banners interrupt the logical flow and create additional navigation friction for screen reader users. Despite being a daily user for two years, PT-001 expressed repeated difficulty finding appointments.

> "I always forget where appointments live. Is it Health? It should be its own thing... Every time I go looking for it, I have to swipe past prescriptions and whatever banners they've added."
> — PT-001, 00:03:32

**Severity** — Medium &nbsp;|&nbsp; **Confidence** — Strong (verbatim quote + observed across multiple task attempts)

### 04 &nbsp;&nbsp; Generic Button Labels Require Guesswork

Action buttons labeled generically (e.g., "Action") force users to guess functionality rather than clearly indicating purpose. Particularly problematic for screen reader users who rely on descriptive labels to navigate efficiently.

> "Action? What does that mean? Is that compose?... Why not 'compose new message' or 'write a message'?"
> — PT-001, 00:08:12

**Severity** — Medium &nbsp;|&nbsp; **Confidence** — Moderate (single observation, but consistent with broader VoiceOver labeling patterns)

---

## What worked

### Prescription refill workflow

The three-tap path (Health → Prescriptions → Refill) executed cleanly with proper VoiceOver labeling throughout. PT-001 completed the task confidently and described it without hesitation.

> "It's just... logical. Health, Prescriptions, Refill. Three taps, done. VoiceOver reads everything correctly. The buttons are labeled. I don't have to guess where anything is."
> — PT-001, 00:02:36

### Profile information architecture

Contact information updates follow an intuitive path (Profile → Personal Info → Edit) that matches user expectations. PT-001 located and edited information without difficulty.

> "This makes sense. It's where I'd expect it."
> — PT-001, 00:06:24

---

## Key insights

These insights emerged from observing PT-001's session and connect specific behaviors to broader patterns worth investigating across the participant pool.

### Logical information architecture enables confidence

When app structure matches user expectations (Health → Prescriptions → Refill), VoiceOver users navigate successfully and feel confident. Breaking this logic causes immediate confusion and task abandonment. The prescription workflow proves the team can deliver excellent UX when they prioritize logical patterns.

### Phone support as primary fallback strategy

When navigation becomes complex, PT-001 immediately abandons the app in favor of calling VA support. This is not persistence-then-failure — it's pre-emptive abandonment based on accumulated frustration. Suggests a learned behavior pattern that may exist across other participants.

> "I'd just call the 800 number at this point. That's what I always do when I can't find something."
> — PT-001, 00:06:49

### Cross-functional messaging mental model

PT-001 conceptualizes secure messaging as spanning multiple domains (health, benefits, prescriptions) rather than being contained within Health. Suggests current information architecture doesn't match user mental model — messaging is functional, not categorical.

> "Why is messaging under Health anyway? I message about benefits stuff too... I message my doctor, I message about claims, I message about prescriptions. It's not just a Health thing."
> — PT-001, 00:09:08

### VoiceOver navigation tax

Every screen requires additional swipes to navigate past headers, banners, and navigation elements. This creates cumulative friction that compounds across tasks. PT-001 has accommodated this through experience; less experienced users would likely abandon.

---

## Recommended actions

| Priority | Action | Addresses | Effort |
|:--------:|--------|-----------|:------:|
| 1 | Fix calendar date picker accessibility labels to announce actual dates | Pain point 01 | High |
| 2 | Modify VoiceOver focus behavior to start on tab bar OR add tab discovery onboarding | Pain point 02 | Medium |
| 3 | Replace generic button labels with descriptive text (e.g., "Compose new message") | Pain point 04 | Low |
| 4 | Evaluate moving appointments to dedicated tab or prominent placement | Pain point 03 | Medium |

---

## Methodology

**Session format** — Moderated remote session, 90 minutes, screen sharing with VoiceOver enabled

**Tasks attempted** — Schedule appointment, refill prescription, send secure message, locate benefits information, update contact information

**Sources analyzed** — Raw session notes or transcript (primary source for verbatim quotes and behavioral data) and 3 observer notes files

**Analysis approach** — Pain points and quotes are direct extractions from the coded transcript; opportunities and insights are reasoned inferences from behavioral patterns observed during the session.

**Limitations** — Single participant. Strong accessibility focus reflects this participant's profile, not broader VA mobile app population. Findings should be cross-referenced with sessions PT-002 and PT-003 for pattern validation.

### References

- Nielsen Norman Group — Moderated usability testing methodology
- Krug, S. — *Rocket Surgery Made Easy* (2010)
- Hall, E. — *Just Enough Research* (2nd ed., 2019)
- W3C Web Content Accessibility Guidelines (WCAG) 2.2

---

## Appendix

<details>
<summary><strong>Related artifacts</strong></summary>

| Artifact | Location | Status |
|----------|----------|--------|
| PT-001 session notes / transcript | [03-fieldwork/session-notes/pt-001-session-notes.md](../../03-fieldwork/session-notes/pt-001-session-notes.md) | Complete |
| PT-001 observer notes | [03-fieldwork/observer-notes/pt-001-observer-notes.md](../../03-fieldwork/observer-notes/pt-001-observer-notes.md) | Complete |
| Discussion guide | [01-planning/discussion-guide.md](../../01-planning/discussion-guide.md) | Complete |
| Research plan | [01-planning/research-plan.md](../../01-planning/research-plan.md) | Complete |

</details>

<details>
<summary><strong>Validity checklist</strong></summary>

| Criterion | Verified |
|-----------|:--------:|
| All quotes verbatim from session notes / transcript | ✓ |
| Pain points grounded in specific observed behaviors | ✓ |
| Inferences (insights, opportunities) traced to evidence | ✓ |
| Confidence levels declared per pain point | ✓ |
| Source documents listed in methodology | ✓ |

</details>

---

| | |
|---|---|
| Generated | May 19, 2026 at 4:18 PM UTC |
| Model | claude-sonnet-4-6 |
| Template | session_summary v1.6 |
| Study | va-mobile-nav-2026 |
| Participant | PT-001 |
| Max tokens | 8192 |

*Generated by Qori*
