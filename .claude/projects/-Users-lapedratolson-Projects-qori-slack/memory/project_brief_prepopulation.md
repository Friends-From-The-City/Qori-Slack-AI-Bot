---
name: Brief modal pre-population from discovery cascade
description: After schema depth fix, brief modal should pre-populate fields from discovery variables — methodology, participants, out of scope, risks, research questions. Researcher reviews and adjusts, not fills from scratch.
type: project
---

Brief modal pre-population from discovery cascade — filed for implementation AFTER schema depth fix lands and is verified with deep extraction.

**Why:** Currently researcher fills brief modal from scratch, ignoring discovery recommendations already extracted. The wow moment: researcher opens modal, 60% of fields already filled with sourced recommendations.

**How to apply:** Implement in `buildBriefEntryModal` (researchBriefEntryModal.js). After loading discovery artifacts, extract recommendations and pre-fill modal fields:

- **Methodology**: Pick most-recommended method across sources, add hint "(recommended by N sources)". Map discovery recommendations to modal's radio button values.
- **Participant criteria**: Pre-fill if discovery surfaces specific demographics (e.g., screen reader users from accessibility constraints).
- **Out of scope**: Pre-fill items discovery explicitly resolved (e.g., "Navigation failure drives compensatory search behavior — already established").
- **Risks**: Pre-fill from stakeholder_constraints (those ARE the risks).
- **Research questions / learning objectives**: Pre-fill from stakeholder_questions_for_users.

Researcher can override any pre-populated field. All pre-fills are suggestions, not locks.

**Depends on:** Schema depth fix (9adac3a8) — pre-population needs rich variables (verbatim quotes, role context, research implications) to produce meaningful pre-fills.

**Order:** Schema depth → re-run /qori-discover → verify deep extraction → implement pre-population → test brief modal.
