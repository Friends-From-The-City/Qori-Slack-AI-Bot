# Qori Development Plan

## Pending ADRs

Decisions made in conversation that should be documented but haven't been written up yet.

When closing out a sprint or before a quarterly audit, work through this list and either:
- Write the ADR, or
- Move the item to "Decided not to ADR" with a one-line reason

### Backlog

- [ ] (add items here as decisions are made in conversation)

### Decided not to ADR

_(nothing yet)_

---

## Completed Work

### 2025-01-30: Learn Qori Landing Page Redesign

Redesigned the Learn Qori documentation site to match modern SaaS landing page style (inspired by LottieFiles).

#### Changes Made

**Landing Page (`docs/learn/index.html`)**
- Split hero layout: headline + CTA on left, Slack mockup on right
- Added feature strip with 4 benefit cards at the fold:
  - Lives in Slack (yellow icon)
  - AI-Powered (green icon)
  - Privacy First (cyan icon)
  - GitHub-backed (blue icon)
- Added "Research on Autopilot" section with dark cards + video placeholder
- Redesigned commands grid with colorful icons per command
- Updated "How It Works" section with 4-step workflow
- Set max-width to 1200px (`max-w-container`) for consistent content width

**Universal Copy Updates**
- Changed headline from "AI-powered research ops for VA teams" to "Where UX research gets done"
- Updated all VA-specific language to be team-agnostic
- Changed page title, mockup content, and footer tagline

**Typography & Icons (All 10 Pages)**
- Changed font from Inter to Plus Jakarta Sans
- Lucide icons loaded on all pages
- Consistent font stack: `Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif`

**Pages Updated**
- `docs/learn/index.html` (landing page)
- `docs/learn/request/index.html`
- `docs/learn/plan/index.html`
- `docs/learn/participants/index.html`
- `docs/learn/outreach/index.html`
- `docs/learn/observe/index.html`
- `docs/learn/notes/index.html`
- `docs/learn/analyze/index.html`
- `docs/learn/synthesis/index.html`
- `docs/learn/report/index.html`

---

## Upcoming Work

### Phase 1: Documentation Site Improvements
- [ ] Add actual demo video to "Research on Autopilot" section
- [ ] Create consistent card styling across tutorial pages
- [ ] Add search functionality to docs
- [ ] Mobile responsiveness audit

### Phase 2: Core Features
- [ ] Review and update YAML workflow configurations
- [ ] Audit Slack modal JSON definitions for Block Kit compliance
- [ ] Document API integration points

### Phase 3: Testing & Quality
- [ ] Add integration tests for Slack commands
- [ ] PII redaction validation tests
- [ ] GitHub Actions CI/CD pipeline

---

## Tech Stack Reference
- **UI**: Slack Block Kit (modals)
- **AI Processing**: YAML workflow configurations
- **Storage**: GitHub repositories
- **Templating**: Handlebars/Jinja2
- **Docs**: GitHub Pages with Tailwind CSS

## Key Files
- `/slack/modals/` - Slack modal JSON definitions
- `/workflows/` - YAML AI processing configs
- `/templates/` - Output templates (markdown)
- `/study-template/` - Folder structure for new studies
- `/docs/learn/` - Documentation site (GitHub Pages)
