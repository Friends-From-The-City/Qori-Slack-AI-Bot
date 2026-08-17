# Getting Started with Qori

Qori is an AI-powered research operations platform for VA UX research teams. It runs in Slack using slash commands that guide you through research workflows.

## Quick Start

### 1. Join the Qori workspace

Ask your team lead to add you to the Slack workspace with Qori installed.

### 2. Try the tutorial

Type `/qori-learn` in any channel for an interactive walkthrough.

### 3. Create a research project

Use `/qori-start` to create your first project. This sets up:
- A project record with you as the owner
- An optional dedicated Slack channel
- A GitHub folder for your research artifacts

---

## Core Concepts

### Slash Commands

Qori uses Slack slash commands to launch different features. See the [Commands Reference](commands.md) for the complete list.

### Modals

When you run a command, Qori opens a modal (popup form) in Slack. Fill in the fields and click Submit to generate your output.

### GitHub Integration

Qori saves all outputs to GitHub repositories, organized by project and study.

---

## Typical Research Workflow

### Phase 1: Setup
1. **Create project** - `/qori-start` sets up your workspace
2. **Pre-study research** - `/qori-discover` for desk research, stakeholder interviews, surveys

### Phase 2: Planning
1. **Research brief** - `/qori-brief` creates a brief and starts a new study
2. **Research plan** - `/qori-plan` generates an execution plan (after brief approval)

### Phase 3: Fieldwork
1. **Manage participants** - `/qori-fieldwork` for participant tracking, outreach, and observer assignment
2. **Session notes** - Upload transcripts and take notes through the fieldwork hub

### Phase 4: Analysis
1. **Analyze sessions** - `/qori-analyze` processes session data
2. **Cross-session synthesis** - `/qori-synthesis` identifies patterns across sessions

### Phase 5: Reporting
1. **Stakeholder readout** - `/qori-report` generates stakeholder reports
2. **Action items** - `/qori-tickets` creates GitHub issues from findings

---

## Getting Help

### Interactive Tutorial

Type `/qori-learn` for a guided tour of all features.

### Documentation

Browse the full documentation in the `/docs/help/` folder:

- [Commands Reference](commands.md)
- [FAQ](faq.md)

### Support Channel

Post questions in the team's support channel for help.

---

## Tips for Success

1. **Start with `/qori-start`** - Always create a project before diving into research
2. **Brief before plan** - The research brief is the approval gate; the plan elaborates
3. **Check your outputs** - Review AI-generated content before sharing
4. **Use `/qori-learn`** anytime for help
