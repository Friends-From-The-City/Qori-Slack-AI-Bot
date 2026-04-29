# 🧠 Affinity Map: va-mobile-nav-2026

**Study:** va-mobile-nav-2026
**Researcher:** Lapedra Tolson
**Date:** April 29, 2026

---

> **4 themes** from **3 participants** | **26 evidence items**

---

## At a Glance

| Theme | Evidence | Participants | Severity |
|:------|:---------|:-------------|:---------|
| Large text breaks bottom navigation completely | 6 items | PT-001, PT-003 | 🔴 Critical |
| Calendar interface blocks screen reader and large text users | 5 items | PT-001, PT-003 | 🔴 Critical |
| Continue buttons hidden below viewport cause frozen app perception | 7 items | PT-002, PT-003 | 🟡 High |
| Prescription refill proves good navigation is possible | 8 items | PT-001, PT-002, PT-003 | 🟢 Medium |

---

## Theme 1: Large Text Breaks Bottom Navigation Completely

**The Pattern:** Navigation tab labels disappear entirely when accessibility text scaling is enabled, leaving users with indistinguishable icons and no way to navigate between app sections.

### Evidence

| Type | Evidence | Source |
|:----:|----------|--------|
| 💬 | "these buttons down at the bottom — I can't read what they say anymore. I just see little pictures... these three in the middle all look the same to me. Little pictures with no words." | PT-003, 00:05:20 |
| 💬 | "I've been using this app for two years and I just learned there's a Benefits section. That tells you everything." | PT-001, 00:07:08 |
| 💬 | "If it said 'Benefits' I might have found it, but the word's too small to show up with my text size, I guess." | PT-003, 00:06:47 |
| 🔴 | Bottom navigation labels invisible with large text | PT-003 |
| 🔴 | Benefits section completely hidden from VoiceOver users | PT-001 |
| 👁️ | VoiceOver focus behavior prevents discovery of bottom navigation tabs | PT-001 |

### Implication

**Why it matters:** Users with accessibility needs cannot access entire sections of the app, creating systematic exclusion from core VA services. Two-year users remain unaware of major functionality.

**Design opportunity:** Implement responsive navigation labels that remain visible at all text sizes, and modify VoiceOver focus to include tab discovery.

---

## Theme 2: Calendar Interface Blocks Screen Reader and Large Text Users

**The Pattern:** Date picker controls are completely inaccessible to users with vision difficulties, either announcing only "button" to screen readers or remaining too small even with large text enabled.

### Evidence

| Type | Evidence | Source |
|:----:|----------|--------|
| 💬 | "It's just saying 'button' over and over. I can't tell what the dates are... they're all just 'button.' I have no idea what date I'm picking." | PT-001, 00:04:28 |
| 💬 | "Even with my big text the calendar numbers are real tiny... These numbers are so close together... I usually just call to schedule. This is too small even with my big text on." | PT-003, 00:04:08 |
| 💬 | "No, I didn't see that at all. Where was it?... Things end up off the side of the screen. I didn't even know there was an AM/PM thing." | PT-003, 00:04:55 |
| 🔴 | Calendar Interface Completely Inaccessible | PT-001 |
| 🔴 | Calendar interface unusable with accessibility settings | PT-003 |

### Implication

**Why it matters:** Appointment scheduling becomes impossible for users with accessibility needs, forcing them to abandon digital self-service in favor of phone support.

**Design opportunity:** Redesign calendar component with proper accessibility labels and responsive text scaling that maintains usability at all sizes.

---

## Theme 3: Continue Buttons Hidden Below Viewport Cause Frozen App Perception

**The Pattern:** Critical action buttons are positioned off-screen or below the fold, causing users to think the app has stopped working when they can't find the next step.

### Evidence

| Type | Evidence | Source |
|:----:|----------|--------|
| 💬 | "There's a Continue button down here. You have to scroll past the calendar to find the button? That button should be at the top, not hidden below everything. Or at least visible on the same screen as the calendar. I thought the app was frozen." | PT-002, 00:02:45 |
| 💬 | "I see something blue at the bottom but I can't tell what it says. It's like half a button. Only the top part is showing." | PT-003, 00:07:30 |
| 💬 | "Did it go through?... Oh, I see it... I didn't see that at first because with my big text it was up above where I was looking." | PT-003, 00:02:52 |
| 🔴 | Continue button hidden below calendar view | PT-002 |
| 🔴 | Critical controls hidden below fold | PT-003 |
| 🔴 | UI elements cut off and positioned off-screen | PT-003 |
| 👁️ | Participant tapped date multiple times thinking it wasn't registering | PT-002 |

### Implication

**Why it matters:** Users lose confidence in the app's functionality and may abandon tasks when they cannot see confirmation that their actions registered.

**Design opportunity:** Position primary action buttons within the same viewport as related content, especially for users with large text settings.

---

## Theme 4: Prescription Refill Proves Good Navigation Is Possible

**The Pattern:** All three participants successfully navigated prescription refills using a logical three-step flow (Health > Prescriptions > Refill), demonstrating that clear information architecture works across different user needs.

### Evidence

| Type | Evidence | Source |
|:----:|----------|--------|
| 💬 | "It's just... logical. Health, Prescriptions, Refill. Three taps, done. VoiceOver reads everything correctly. The buttons are labeled. I don't have to guess where anything is." | PT-001, 00:02:36 |
| 💬 | "It's right there. Health, Prescriptions, Refill. No guessing, no scrolling around. I wish everything else was this straightforward." | PT-002, 00:01:45 |
| 💬 | "It was OK. I know where to go for that one... That's the one thing I can do pretty good." | PT-003, 00:03:10 |
| 💬 | "The thing that bugs me most is that prescriptions prove they know how to make it easy. So why doesn't the rest of the app work the same way? It's like one team got it right and nobody else followed their lead." | PT-002, 00:07:05 |
| 🟢 | Prescription refill workflow efficiency | PT-002 |
| 🟢 | Prescription refill workflow is efficient and logical | PT-001 |
| 🟢 | Prescription refill familiarity | PT-003 |
| 👁️ | PT-002 demonstrates mastery with prescription refills, completing task through muscle memory | PT-002 |

### Implication

**Why it matters:** This workflow demonstrates that the VA app can successfully serve users with diverse accessibility needs when information architecture follows logical patterns.

**Design opportunity:** Apply the prescription refill navigation pattern (direct path, clear labels, minimal steps) to other core app functions like appointments and messaging.

---

## What's Working

Positive findings from the research:

| What Works | Evidence | Source |
|------------|----------|--------|
| Prescription refill three-step flow | "Health, Prescriptions, Refill. Three taps, done. VoiceOver reads everything correctly." | PT-001 |
| Profile section navigation | "This makes sense. It's where I'd expect it." | PT-002 |
| Task completion persistence | All assigned tasks were ultimately completed despite barriers | PT-003 |

---

## Cross-Theme Connections

Themes 1, 2, and 3 represent different manifestations of the same root cause: **responsive design failures that disproportionately impact users with accessibility needs**. Large text settings break navigation labels, calendar interfaces, and button positioning, while screen reader users face similar barriers with unlabeled controls and poor focus management.

Theme 4 serves as proof that accessible, logical design is achievable within the VA app ecosystem — the prescription refill workflow succeeds precisely because it avoids the responsive design and labeling problems that plague other features.

---

## Recommended Actions

| Priority | Action | Addresses Theme | Effort |
|:--------:|--------|-----------------|:------:|
| 1 | Fix calendar date picker accessibility labels and responsive scaling | Theme 2 | Medium |
| 2 | Implement responsive bottom navigation that maintains text labels at all accessibility text sizes | Theme 1 | High |
| 3 | Position Continue buttons within same viewport as related content | Theme 3 | Low |
| 4 | Document and replicate prescription refill navigation pattern across core workflows | Theme 4 | Medium |

---

## Methodology

**Framework:** Affinity Diagramming / KJ Method

**Approach:** Inductive clustering — themes emerged from natural patterns in the data rather than predetermined categories. Individual data points were extracted first, then grouped by similarity, then named using participant language.

**Data Sources:** PT-001, PT-002, PT-003

**Evidence Utilization:** 87% of extracted data points used in themes

---

### References

This analysis follows established qualitative research methods:

- **KJ Method** (Affinity Diagramming) — Jiro Kawakita, 1960s
- **Contextual Design** — Karen Holtzblatt & Hugh Beyer
- **Inductive Thematic Analysis** — Braun & Clarke, 2006

---

## Document Information

| Field | Value |
|-------|-------|
| Generated | April 29, 2026 at 7:45 PM UTC |
| Model | claude-sonnet-4-20250514 |
| Template | affinity_mapping v3.1 |
| Study | va-mobile-nav-2026 |
| Max tokens | 8192 |

*Generated by Qori*
