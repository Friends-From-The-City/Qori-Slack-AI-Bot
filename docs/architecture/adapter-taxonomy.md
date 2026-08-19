# Adapter Taxonomy

Qori uses an adapter model to separate its core research operations domain from the systems that deliver interactions and receive outputs. There are two adapter categories.

---

## Interaction Adapters

Interaction adapters are the surfaces through which users operate Qori. They supply identity evidence (who is the actor) and present Qori's capabilities in the conventions of their platform.

| Adapter | Status | Notes |
|---------|--------|-------|
| **Slack** | Current | Socket Mode via Bolt. Slash commands, Block Kit modals, message responses. Identity derived from Slack user ID mapped to Qori actor. |
| **Workspace** (web) | Future | Qori's own web application. OIDC authentication. Full evidence navigation, artifact lifecycle, and admin capabilities. |
| **Teams / agency messaging** | Future | Microsoft Teams or other agency-mandated messaging platforms. Same interaction contract as Slack, adapted to the platform's UI primitives. |

### Interaction Adapter Responsibilities

- Authenticate the user and establish actor identity.
- Present workflow initiation forms (modals, pages, or platform-native UI).
- Display AI-generated proposals for review and accept/reject.
- Surface notifications and work queue items.
- Translate platform-specific events (slash commands, button clicks, page navigation) into domain operations.

### Interaction Adapter Boundaries

- Interaction adapters do not contain business logic. They translate platform events into domain service calls and render domain responses in platform-native formats.
- An interaction adapter does not know about other interaction adapters. The Slack adapter has no awareness that a Workspace adapter exists.
- Domain services are adapter-agnostic. They accept typed inputs and return typed outputs without knowledge of which adapter invoked them.

---

## Implementation / Handoff Adapters

Handoff adapters are the systems that receive Qori's canonical outputs -- approved artifacts, issues, study scaffolds. They are the "delivery destination" for research work products.

| Adapter | Status | Notes |
|---------|--------|-------|
| **GitHub** | Current | Artifacts written as Markdown files to study repositories. Issues created for action items. Study folder scaffolds created on study initiation. Uses Octokit. |
| **Jira** | Future | Same artifact handoff contract -- approved artifacts are published to Jira as issues, attachments, or linked documents. |

### Handoff Adapter Responsibilities

- Receive approved, canonical artifacts from the domain layer.
- Write artifacts to the target system in the appropriate format.
- Create structural elements (repositories, folders, projects, boards) when studies are initiated.
- Create issues or work items derived from research outputs (action items, recommendations).
- Return confirmation of successful delivery (URL, ID, status).

### Handoff Adapter Boundaries

- Handoff adapters receive only approved artifacts. Draft and in-review content never reaches a handoff adapter.
- The artifact contract (`artifact.app-service`) is the same regardless of which handoff adapter is active. Switching from GitHub to Jira does not change the domain layer's publication call -- only the adapter implementation differs.
- A handoff adapter does not modify artifact content. It formats and delivers what the domain layer provides.

---

## Adapter Independence

The two adapter categories are independent:

- An interaction adapter (Slack) can work with any handoff adapter (GitHub or Jira).
- A handoff adapter (GitHub) can receive artifacts from any interaction adapter (Slack or Workspace).
- Adding a new interaction adapter requires no changes to handoff adapters, and vice versa.

This independence is maintained by ensuring that the domain layer mediates all communication. Interaction adapters call domain services. Domain services call handoff adapters. There is no direct path from an interaction adapter to a handoff adapter.

---

## Future: Jira Handoff

When Jira is introduced as a handoff adapter:

- It implements the same `artifact.app-service` contract that GitHub implements.
- Approved artifacts are published to Jira using the same domain-layer publication call.
- The organization's configuration determines which handoff adapter is active.
- Migration tooling (if needed) maps existing GitHub-hosted artifacts to their Jira equivalents.
- Both adapters may coexist during a transition period, with the organization selecting the active adapter per project or globally.
