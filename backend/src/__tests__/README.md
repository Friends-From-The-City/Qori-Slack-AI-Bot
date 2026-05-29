# Test Infrastructure

This directory contains test infrastructure and tests for the Qori backend.

## Directory Structure

```
__tests__/
├── __helpers__/                    # Shared test helpers
│   ├── slack-client-mock.ts        # WebClient mock for modal flow tests
│   └── view-state-builders.ts      # View state builders for handler tests
│
├── integration/                    # Integration tests (require Postgres)
│   ├── setup/
│   │   ├── testDb.ts              # Test database helper
│   │   ├── globalSetup.ts         # Jest global setup
│   │   └── globalTeardown.ts      # Jest global teardown
│   ├── cascade-variable-store.test.ts  # Cascade store behavior contract
│   ├── cascade-flow.test.ts       # Cascade consumption/emission
│   ├── compensation-flow.test.ts  # DECIMAL coercion tests
│   ├── outreach-flow.test.ts      # Participant outreach tests
│   ├── modal-flows.test.ts        # Modal callback chain tests
│   ├── pattern-enforcement.test.ts # Codebase pattern assertions
│   └── ...
│
├── unit/
│   └── templates/                  # YAML template tests
│       ├── __fixtures__/
│       │   └── llm-responses.ts   # Canned LLM responses
│       ├── __helpers__/
│       │   └── template-test-harness.ts  # Template processing mock
│       ├── research-brief.test.ts
│       ├── research-plan.test.ts
│       ├── session-summary.test.ts
│       ├── research-readout.test.ts
│       └── desk-research.test.ts
│
└── parsers/                        # Parser unit tests
    ├── budgetParser.test.ts
    └── compensationCalculator.test.ts
```

## Running Tests

```bash
# Unit tests (no database required)
npm test

# Integration tests (requires Postgres qori_test database)
npm run test:integration

# Both
npm run test:all
```

## Test Database Setup

Integration tests require a local Postgres database:

```bash
createdb qori_test
```

Environment variables (optional, defaults work for local development):
- `TEST_DB_USER` — default: `$USER` or `qori_test`
- `TEST_DB_PASSWORD` — default: empty
- `TEST_DB_NAME` — default: `qori_test`
- `TEST_DB_HOST` — default: `localhost`
- `TEST_DB_PORT` — default: `5432`

---

## LLM Mock Harness Maintenance

The template test harness (`unit/templates/__helpers__/template-test-harness.ts`) and LLM response fixtures (`unit/templates/__fixtures__/llm-responses.ts`) provide deterministic testing without actual API calls.

### When to Update Fixtures

Update `llm-responses.ts` when:

1. **Template task_ids change** — If a YAML template renames or adds AI generation tasks, update the corresponding fixture keys.

2. **Response structure changes** — If a template's expected output format changes (e.g., new sections, different JSON extraction schema), update the mock responses to match.

3. **New template added to test set** — Add a new entry to `llmResponseFixtures` with responses for all task_ids the template uses.

4. **Extract schema changes** — If `emits` specs change (new fields, different types), update the mock extracted values in the fixture.

### How to Update

1. Run the template with real LLM to capture realistic output.
2. Copy the relevant sections into the fixture file, anonymizing any sensitive content.
3. Ensure the fixture response includes all sections the test assertions check for.

### Fixture Drift Warning

Fixtures can drift from reality if templates evolve without updating tests. Signs of drift:

- Tests pass but real LLM output looks different
- New template sections aren't being tested
- Tests fail after template version bump

When reviewing template changes, check if the corresponding fixture needs updating.

### Template Change Checklist

When modifying a YAML template (`config/prompts/*.yaml`):

1. **Check task_ids** — Run `grep "task_id:" config/prompts/<template>.yaml` and compare against keys in `llm-responses.ts`
2. **Run template test** — `npm test -- --testPathPatterns="<template-name>"`
3. **Look for `[MOCK: ... not provided]`** — This indicates a missing fixture for a task_id
4. **Update fixture if needed** — Add realistic response text for any new task_ids
5. **Verify emits still match** — If `emits` changed, update test assertions

Example workflow for `research_brief.yaml` change:
```bash
# Check current task_ids
grep "task_id:" config/prompts/research_brief.yaml

# Run tests
npm test -- --testPathPatterns="research-brief"

# If tests fail or show [MOCK:...], update:
# src/__tests__/unit/templates/__fixtures__/llm-responses.ts
```

---

## Slack Client Mock Usage

The `slack-client-mock.ts` helper provides a mock WebClient for testing modal callback handlers.

### Basic Usage

```typescript
import { createSlackClientMock, expectModalOpened } from '../__helpers__/slack-client-mock';

const mock = createSlackClientMock();

// Call handler with mock client
await handler({ client: mock.client, /* ... */ });

// Assert
expect(mock.viewsOpened).toHaveLength(1);
expectModalOpened(mock, 'my_modal_callback_id');
```

### Captured Calls

- `mock.viewsOpened` — `views.open()` calls
- `mock.viewsUpdated` — `views.update()` calls
- `mock.viewsPushed` — `views.push()` calls
- `mock.messagesPosted` — `chat.postMessage()` calls
- `mock.usersQueried` — `users.info()` calls

---

## View State Builders Usage

The `view-state-builders.ts` helpers generate realistic `view.state.values` structures.

```typescript
import { buildBriefViewState, buildPrivateMetadata, buildMockView } from '../__helpers__/view-state-builders';

const viewState = buildBriefViewState({
  studyName: 'mobile-nav-study',
  problemStatement: 'Veterans struggle to navigate...',
});

const view = buildMockView('research_brief_modal', viewState, {
  channelId: 'C_TEST',
  userId: 'U_RESEARCHER',
});
```

---

## Pattern Enforcement Tests

`pattern-enforcement.test.ts` contains grep-based assertions that scan the codebase for anti-patterns.

### Verifying Assertions

Before declaring pattern assertions green, verify they actually catch violations:

1. Create a temporary fixture file with a known-bad pattern
2. Run the test — it should fail
3. Remove the fixture
4. Run the test — it should pass

This confirms the grep patterns match real anti-patterns, not just nothing.

---

## Cascade Variable Store Tests

`cascade-variable-store.test.ts` defines the behavior contract for the cascade store.

### Architectural Note

These tests are designed to survive the Phase 2B schema change:

**Current schema (2A):**
- `study_name`: STRING (denormalized)
- `scope`: 'study' | 'discovery'

**Future schema (2B):**
- `project_id`: INTEGER FK (NOT NULL)
- `study_id`: INTEGER FK (NULL for project-scoped)

When 2B lands, update the test fixtures to use FK values while preserving the same behavioral assertions.

---

## Cascade Contract Enforcement

Templates declare upstream dependencies via `consumes` blocks in their YAML. When a consumed variable has `required: true`, the processor throws a `TemplateContractError` if that variable is missing.

Handlers that call `processYamlTemplate` should catch `TemplateContractError` and send the researcher a clear DM explaining what's missing. See `planHandler.ts` for the reference pattern.

A variable is "missing" when no row exists in `study_variables` for that key, or the value is null/undefined. Empty arrays `[]` and empty objects `{}` are valid.

---

## What These Tests Verify

- Template renders without throwing given valid mock inputs
- Handlebars variables appear in output
- AI-generated content slots into correct position
- Cascade store read/write/merge behavior
- Pool merge strategies (replace, append, per-participant)
- Scope isolation (study vs discovery)
- Pattern enforcement across codebase

## What These Tests Do NOT Verify

- Actual LLM output quality (LLM is mocked)
- GitHub integration (commits are mocked)
- End-to-end Slack flows
- Real network calls
