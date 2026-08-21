# Qori Workspace — UX-1 Design Package

The Qori Workspace is the **visual interaction adapter** over Qori Core. It is not a separate product, not a redesign of Qori Core, and not a marketing site. Canonical research state stays in Qori Core / Postgres; Slack remains the conversational adapter; GitHub remains the publication/handoff adapter.

## What this package contains

| File | Purpose |
|---|---|
| `product-principles.md` | Design principles + usability heuristics applied |
| `information-architecture.md` | Global/project/study IA, navigation, context model |
| `interaction-model.md` | Core interaction patterns (traceability, tags, AI wait states) |
| `responsive-layout.md` | Grid, breakpoints, per-screen responsive behavior |
| `accessibility.md` | WCAG 2.2 AA / Section 508 approach, per-pattern requirements |
| `design-system.md` | Visual language: type, color, elevation, motion |
| `design-tokens.json` | Machine-readable semantic tokens (agency-themable) |
| `component-inventory.md` | Reusable components with anatomy/states/a11y/data contracts |
| `content-design.md` | Terminology, microcopy rules, AI transparency language |
| `states-and-feedback.md` | State matrix for every screen/component class |
| `admin-model.md` | Admin IA, separation from research work |
| `traceability-model.md` | Backward/forward lineage interaction design |
| `search-and-ask-qori.md` | Unified search + Ask Qori corpus model |
| `artifact-experience.md` | Generate → review → approve → publish lifecycle |
| `branding-model.md` | Runtime agency branding (one codebase, no forks) |
| `flows/` | Six task flows |
| `screens/` | Twelve screen specs (route, data, states, breakpoints, a11y, API) |
| `wireframes/` | Wireframe notes + exported hi-fi mockup references |

## Terminology alignment with Qori Core

This package uses the cascade vocabulary already canonical in the backend (ADR-0029, ADR-0030, ADR-0037):

source → nugget → theme → finding → recommendation → artifact → GitHub handoff

The UI never shows these as database constructs. See `content-design.md` for the researcher-facing vocabulary.

## Status

UX-2 complete and user-approved (Phases 1–8): constraints, document-type inventory, gate patterns, state vocabulary, traceability system, foundations (tokens v0.2), component library, page contracts, and all six Phase 8 screen blocks + interaction layer. This package is the implementation contract for CC (UX-3).

## Approved screen mockups (project root)
Phase 8 Block 1 — Orient and Start (Home, Work Queue, New Project, Project)
Phase 8 Block 2 — Define (Discovery, Brief form, Brief approval, Plan, Guide)
Phase 8 Block 3 — Fieldwork (Study shell + lifecycle rail, Participants, Sources, PII review)
Phase 8 Block 4 — Analyze & Synthesize (Session analysis, Evidence, Synthesis, Finding review)
Phase 8 Block 5 — Deliver (Outputs + readout drawer, Artifact viewer, Tickets drawer)
Phase 8 Block 6 — Cross-cutting (Search & Ask, Survey pipeline, Admin)
Phase 8 — Interaction Layer (participant drawer, peek + trail, dialogs, ⌘K palette, toasts)

## CC implementation order (approved)
1. App shell + Home + New Project + Brief form + Brief approval (the operating loop)
2. PII review (unblocks analysis)
3. Plan + Synthesis initiation + UX-2B review UI
4. Work Queue wiring
5. Readout viewer + publish; tickets after CA-003
Design rules binding implementation: design-system.md (product-wide rules list), design-tokens.json v0.2, component-inventory.md (fixed rules header), content-design.md (provenance voice, no pipeline vocabulary), uswds-mapping.md, classifications.md.
