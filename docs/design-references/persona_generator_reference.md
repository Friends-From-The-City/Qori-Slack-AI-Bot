# Personas: va-mobile-nav-2026

**Study:** va-mobile-nav-2026 &nbsp; | &nbsp; **Researcher:** Lapedra Tolson &nbsp; | &nbsp; **Date:** April 29, 2026

---

## Summary

Two evidence-based personas emerged from the three participants in this study, representing distinct behavioral patterns rather than individual users. The Assisted Navigator captures the experience of veterans who rely on assistive technology and develop workarounds or fallback to phone support when accessibility fails. The Efficiency Seeker captures veterans who expect logical, fast navigation and become frustrated when the app's information architecture doesn't match their mental model. Both personas share the prescription refill workflow as a positive baseline — its success demonstrates that accessible, efficient navigation is achievable within the existing app.

> [!IMPORTANT]
> **Most actionable insight:** The two personas are not mutually exclusive — PT-003 contributes to both, demonstrating that accessibility needs and efficiency expectations co-exist in the same user. Design improvements that address one persona often help the other.

| Persona | Archetype | Based on | Key need |
|---------|-----------|----------|----------|
| 01 | The Assisted Navigator | PT-001, PT-003 | Accessible interfaces that work with assistive technology |
| 02 | The Efficiency Seeker | PT-002, PT-003 | Streamlined navigation that matches mental models |

---

## 01 &nbsp;&nbsp; The Assisted Navigator

**Based on** — PT-001, PT-003

> "I've been using this app for two years and I just learned there's a Benefits section. That tells you everything."
> — PT-001, 00:07:08

### Who they are

**Background** — Veterans who rely on VA services for healthcare and benefits, often longtime users of the system

**Tech setup** — VoiceOver screen readers or Android large text scaling (180%+), sometimes with family tech support for initial app setup

**VA usage** — Daily to weekly users, primarily prescription refills with occasional appointment scheduling

**Calling pattern** — Frequent VA phone support fallback (2–3 calls per month) when digital tasks fail

### What they're trying to do

- Refill prescriptions monthly without calling VA support — *PT-001, PT-003*
- Schedule medical appointments through the app — *PT-003*
- Check disability benefits and payment status — *PT-003*
- Send secure messages to healthcare providers — *PT-001, PT-003*

### What blocks them

| Frustration | Evidence |
|-------------|----------|
| Calendar interface completely inaccessible with screen readers or large text | PT-001, 00:04:28 · PT-003, 00:04:08 |
| Bottom navigation labels disappear with accessibility settings | PT-003, 00:05:20 |
| Critical buttons hidden below viewport or cut off | PT-001 · PT-003, 00:07:30 |
| Benefits section invisible to VoiceOver users | PT-001, 00:07:08 |

### How they cope

Immediately abandon complex tasks to call VA support, rely on family members for initial app setup and troubleshooting, develop personal workarounds for familiar tasks like prescription refills. They have NOT internalized expectations that the app should work for them across the full feature set — they've accommodated to a limited, predictable subset of functionality.

### Design implication

Comprehensive accessibility testing with actual assistive technology users to ensure core VA services remain functional with screen readers and large text settings. The current "accommodated but not served" experience requires architectural fixes, not surface-level patches.

**Confidence** — Strong (2 of 3 participants exhibit pattern with multiple evidence points across different accessibility profiles)

---

## 02 &nbsp;&nbsp; The Efficiency Seeker

**Based on** — PT-002, PT-003

> "The thing that bugs me most is that prescriptions prove they know how to make it easy. So why doesn't the rest of the app work the same way?"
> — PT-002, 00:07:05

### Who they are

**Background** — Veterans transitioning between healthcare systems (e.g., Tricare to VA) or comparing the VA app to other apps they use regularly

**Tech setup** — Standard mobile devices, comfortable with consumer apps, expect logical navigation as table stakes

**VA usage** — Weekly users who want self-service but get frustrated by complex workflows

**Mental model** — Task-based ("I want to schedule an appointment") rather than category-based ("I should look in Health")

### What they're trying to do

- Schedule appointments without multiple navigation steps — *PT-002*
- Find disability payment information quickly — *PT-002*
- Send messages to providers with minimal clicks — *PT-002*
- Update contact information efficiently — *PT-003*

### What blocks them

| Frustration | Evidence |
|-------------|----------|
| Continue buttons hidden below calendar requiring scrolling | PT-002, 00:02:45 |
| Payment information categorized under Benefits instead of Payments | PT-002, 00:04:05 |
| Frequently-used appointments buried below messaging | PT-002, 00:02:10 |
| Save buttons positioned below the fold | PT-003, 00:09:30 |

### How they cope

Use in-app search when logical navigation fails, compare the VA app unfavorably to previous systems (especially Tricare), develop muscle memory for successful workflows like prescription refills. They are MORE persistent than The Assisted Navigator but voice frustration more directly — they expect more.

### Design implication

Apply the successful prescription refill navigation pattern (Health → Prescriptions → Refill) to other core features. Ensure critical action buttons remain visible within the same viewport as their related content. Audit information architecture against task-based mental models, not internal VA categorization.

**Confidence** — Strong (2 of 3 participants exhibit pattern with consistent expressions of expectation gap)

---

## Design priorities

These design opportunities emerge from analyzing both personas together. Items that address both personas have higher leverage.

| # | Opportunity | Helps | Effort |
|:-:|-------------|-------|:------:|
| 1 | Fix calendar accessibility for screen readers and large text | The Assisted Navigator | High |
| 2 | Position Continue and Save buttons within same viewport as related content | Both | Low |
| 3 | Ensure bottom navigation labels remain visible with accessibility settings | The Assisted Navigator | Medium |
| 4 | Reorganize Health section hierarchy based on user frequency data | The Efficiency Seeker | Medium |
| 5 | Move payment information to Payments section or add cross-linking | The Efficiency Seeker | Low |
| 6 | Apply prescription refill navigation pattern to appointments and messaging | Both | Medium |

---

## Methodology

**Framework** — Evidence-based persona development

**Approach** — Composite archetypes derived from behavioral patterns across participants. Personas represent shared patterns, not 1:1 participant mappings. Each persona aggregates participants who share goals, frustrations, and coping behaviors. Cross-cutting participants (e.g., PT-003 in both personas) indicate that the patterns are dimensions of behavior rather than mutually exclusive user types.

**Why these groupings** — PT-001 and PT-003 both struggle with accessibility barriers (screen reader for PT-001, large text for PT-003) and rely on phone support as fallback when digital fails. PT-002 and PT-003 both expect efficient navigation patterns and express frustration when the app doesn't match task-based mental models. The behavioral overlap with PT-003 reflects real user complexity — accessibility needs and efficiency expectations co-exist in the same person.

**Sources analyzed** — Three session summaries (PT-001, PT-002, PT-003) and the affinity map for cross-participant pattern validation

**Limitations** — Three participants. The 2-persona model captures the strongest patterns but may underrepresent users whose primary characteristics aren't accessibility or efficiency. Findings should be validated with larger sample including veterans with low digital literacy and those new to VA services.

### References

- Cooper, A. — *The Inmates Are Running the Asylum* (1998), goal-directed personas
- Goodwin, K. — *Designing for the Digital Age* (2009)
- Nielsen Norman Group — Persona best practices and validation methods
- Pruitt, J. & Adlin, T. — *The Persona Lifecycle* (2006)

---

## Appendix

<details>
<summary><strong>Related artifacts</strong></summary>

| Artifact | Location | Status |
|----------|----------|--------|
| PT-001 session summary | [03-fieldwork/session-summaries/pt-001-session-summary.md](../../03-fieldwork/session-summaries/pt-001-session-summary.md) | Complete |
| PT-002 session summary | [03-fieldwork/session-summaries/pt-002-session-summary.md](../../03-fieldwork/session-summaries/pt-002-session-summary.md) | Complete |
| PT-003 session summary | [03-fieldwork/session-summaries/pt-003-session-summary.md](../../03-fieldwork/session-summaries/pt-003-session-summary.md) | Complete |
| Affinity map | [04-analysis/affinity-mapping/va-mobile-nav-2026-affinity-map-2026-04-30.md](../../04-analysis/affinity-mapping/va-mobile-nav-2026-affinity-map-2026-04-30.md) | Complete |
| Research plan | [01-planning/research-plan.md](../../01-planning/research-plan.md) | Complete |

</details>

<details>
<summary><strong>Validity checklist</strong></summary>

| Criterion | Verified |
|-----------|:--------:|
| Personas use archetype names, not real names | ✓ |
| Personas aggregate multiple participants (no 1:1 mapping) | ✓ |
| Fewer personas than participants (2 personas, 3 participants) | ✓ |
| All goals and frustrations cite specific participants | ✓ |
| Quotes verbatim from session summaries | ✓ |
| Design implications are specific and implementable | ✓ |
| Confidence levels declared per persona | ✓ |

</details>

---

| | |
|---|---|
| Generated | April 29, 2026 at 6:14 PM UTC |
| Model | claude-sonnet-4-6 |
| Template | persona_generator v4.3 |
| Study | va-mobile-nav-2026 |
| Max tokens | 8192 |

*Generated by Qori*
