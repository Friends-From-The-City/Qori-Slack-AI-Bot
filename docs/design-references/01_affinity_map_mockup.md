# Affinity Map

**Study** &nbsp;&nbsp; va-mobile-nav-2026
**Researcher** &nbsp;&nbsp; Lapedra Tolson
**Date** &nbsp;&nbsp; April 29, 2026

---

## Summary

4 themes emerged from 3 participants and 26 evidence items. Two themes are critical accessibility barriers blocking core task completion. One theme demonstrates that accessible, logical navigation is achievable within the existing app ecosystem.

| | Theme | Severity | Evidence |
|---|---|---|---|
| 01 | Large text breaks bottom navigation completely | **Critical** | 6 items |
| 02 | Calendar interface blocks screen reader and large text users | **Critical** | 5 items |
| 03 | Continue buttons hidden below viewport cause frozen app perception | **High** | 7 items |
| 04 | Prescription refill proves good navigation is possible | **Medium** | 8 items |

---

## 01 &nbsp;&nbsp; Large Text Breaks Bottom Navigation Completely

Navigation tab labels disappear entirely when accessibility text scaling is enabled, leaving users with indistinguishable icons and no way to navigate between app sections.

#### Evidence

> "These buttons down at the bottom — I can't read what they say anymore. I just see little pictures... these three in the middle all look the same to me. Little pictures with no words."
> — PT-003, 00:05:20

> "I've been using this app for two years and I just learned there's a Benefits section. That tells you everything."
> — PT-001, 00:07:08

> "If it said 'Benefits' I might have found it, but the word's too small to show up with my text size, I guess."
> — PT-003, 00:06:47

#### Observed behavior

- Bottom navigation labels invisible with large text — PT-003
- Benefits section completely hidden from VoiceOver users — PT-001
- VoiceOver focus behavior prevents discovery of bottom navigation tabs — PT-001

#### Why it matters

Users with accessibility needs cannot access entire sections of the app, creating systematic exclusion from core VA services. Two-year users remain unaware of major functionality.

#### Design opportunity

Implement responsive navigation labels that remain visible at all text sizes, and modify VoiceOver focus to include tab discovery.

---

## 02 &nbsp;&nbsp; Calendar Interface Blocks Screen Reader and Large Text Users

Date picker controls are completely inaccessible to users with vision difficulties, either announcing only "button" to screen readers or remaining too small even with large text enabled.

#### Evidence

> "It's just saying 'button' over and over. I can't tell what the dates are... they're all just 'button.' I have no idea what date I'm picking."
> — PT-001, 00:04:28

> "Even with my big text the calendar numbers are real tiny... These numbers are so close together... I usually just call to schedule. This is too small even with my big text on."
> — PT-003, 00:04:08

#### Observed behavior

- Calendar interface completely inaccessible to screen readers — PT-001
- Calendar interface unusable with large text settings — PT-003
- AM/PM controls positioned off-screen — PT-003

#### Why it matters

Appointment scheduling becomes impossible for users with accessibility needs, forcing them to abandon digital self-service in favor of phone support.

#### Design opportunity

Redesign calendar component with proper accessibility labels and responsive text scaling that maintains usability at all sizes.

---

## 03 &nbsp;&nbsp; Continue Buttons Hidden Below Viewport Cause Frozen App Perception

Critical action buttons are positioned off-screen or below the fold, causing users to think the app has stopped working when they can't find the next step.

#### Evidence

> "There's a Continue button down here. You have to scroll past the calendar to find the button? That button should be at the top, not hidden below everything. I thought the app was frozen."
> — PT-002, 00:02:45

> "I see something blue at the bottom but I can't tell what it says. It's like half a button. Only the top part is showing."
> — PT-003, 00:07:30

#### Observed behavior

- Continue button hidden below calendar view — PT-002
- Critical controls hidden below fold — PT-003
- UI elements cut off and positioned off-screen — PT-003
- Participant tapped date multiple times thinking it wasn't registering — PT-002

#### Why it matters

Users lose confidence in the app's functionality and may abandon tasks when they cannot see confirmation that their actions registered.

#### Design opportunity

Position primary action buttons within the same viewport as related content, especially for users with large text settings.

---

## 04 &nbsp;&nbsp; Prescription Refill Proves Good Navigation Is Possible

All three participants successfully navigated prescription refills using a logical three-step flow (Health → Prescriptions → Refill), demonstrating that clear information architecture works across different user needs.

#### Evidence

> "It's just... logical. Health, Prescriptions, Refill. Three taps, done. VoiceOver reads everything correctly. The buttons are labeled. I don't have to guess where anything is."
> — PT-001, 00:02:36

> "It's right there. Health, Prescriptions, Refill. No guessing, no scrolling around. I wish everything else was this straightforward."
> — PT-002, 00:01:45

> "The thing that bugs me most is that prescriptions prove they know how to make it easy. So why doesn't the rest of the app work the same way?"
> — PT-002, 00:07:05

#### Observed behavior

- Prescription refill workflow efficiency — all participants
- Three-step flow with proper VoiceOver labeling creates confident user experience — PT-001
- Muscle memory developed through frequent successful use — PT-002

#### Why it matters

This workflow demonstrates that the VA app can successfully serve users with diverse accessibility needs when information architecture follows logical patterns.

#### Design opportunity

Apply the prescription refill navigation pattern (direct path, clear labels, minimal steps) to other core app functions like appointments and messaging.

---

## Cross-theme connections

Themes 01, 02, and 03 represent different manifestations of the same root cause: responsive design failures that disproportionately impact users with accessibility needs. Large text settings break navigation labels, calendar interfaces, and button positioning, while screen reader users face similar barriers with unlabeled controls and poor focus management.

Theme 04 serves as proof that accessible, logical design is achievable within the existing ecosystem — the prescription refill workflow succeeds precisely because it avoids the responsive design and labeling problems that plague other features.

---

## Recommended actions

| Priority | Action | Addresses | Effort |
|:---:|---|---|:---:|
| 1 | Fix calendar date picker accessibility labels and responsive scaling | Theme 02 | Medium |
| 2 | Implement responsive bottom navigation that maintains text labels at all accessibility sizes | Theme 01 | High |
| 3 | Position Continue buttons within same viewport as related content | Theme 03 | Low |
| 4 | Document and replicate prescription refill navigation pattern across core workflows | Theme 04 | Medium |

---

## Methodology

**Framework** &nbsp;&nbsp; Affinity Diagramming / KJ Method
**Approach** &nbsp;&nbsp; Inductive clustering — themes emerged from natural patterns in the data rather than predetermined categories. Individual data points were extracted first, then grouped by similarity, then named using participant language.
**Data sources** &nbsp;&nbsp; PT-001, PT-002, PT-003
**Evidence utilization** &nbsp;&nbsp; 87% of extracted data points used in themes

#### References

- KJ Method (Affinity Diagramming) — Jiro Kawakita, 1960s
- Contextual Design — Karen Holtzblatt & Hugh Beyer
- Inductive Thematic Analysis — Braun & Clarke, 2006

---

| | |
|---|---|
| Generated | April 29, 2026 at 7:45 PM UTC |
| Model | claude-sonnet-4-20250514 |
| Template | affinity_mapping v3.1 |
| Study | va-mobile-nav-2026 |
| Max tokens | 8192 |

*Generated by Qori*
