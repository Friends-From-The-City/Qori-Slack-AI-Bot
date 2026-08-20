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

UX-1 design-only. No frontend code. Implementation (UX-3) begins after review of this package.
