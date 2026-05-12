# Template Tests

Tests that verify the YAML template processor renders correct output given mock inputs. No network calls, no LLM, no database.

## Running

```bash
cd backend
npm test                          # all tests
npm test -- research_plan         # single template
npm run test:watch                # re-run on file changes
```

## Structure

```
__tests__/
  __fixtures__/     # Factory functions returning test data
  __mocks__/        # Jest mock implementations for external deps
  templates/        # One test file per YAML template
```

## How to add a test for a new template

1. Create `templates/<template_name>.test.js`
2. Copy the mock setup block from `research_plan.test.js` (the four `jest.mock()` calls)
3. Read the real YAML from `config/prompts/<template_name>.yaml`
4. Call `processYamlTemplate(rawYaml, inputs, encodedPath, extraFolder, false)`
5. Assert on `result.outputTemplate` (the rendered markdown string)

## Mocks

All four external dependencies are mocked:

| Mock | What it replaces | Default behavior |
|------|-----------------|------------------|
| `langchain.mock.js` | `helpers/langchain` | Returns `{ plan_complete: '...' }` |
| `github.mock.js` | `helpers/github` | Returns fake commit result |
| `studyVariables.mock.js` | `helpers/studyVariables` | Returns empty upstream vars |
| `variableExtractor.mock.js` | `helpers/variableExtractor` | Returns null (no extraction) |

Override per test with `mockFn.mockResolvedValueOnce(...)`.

## Fixtures

Factory functions with override support. Always returns a fresh object.

- `makeStudy(overrides)` — ResearchStudy shape
- `makeBriefUpstream(overrides)` — upstream cascade variables from a brief
- `makePlanInputs(overrides)` — modal inputs for the plan handler
- `makeParticipant(overrides)` — StudyParticipant shape
- `makeParticipantCohort(studyId)` — three participants in various statuses

## What these tests verify

- Template renders without throwing given valid mock inputs
- Handlebars variables (researcher name, study title, etc.) appear in output
- AI-generated content slots into the correct position

## Cascade contract enforcement

Templates declare upstream dependencies via `consumes` blocks in their YAML. When a consumed variable has `required: true`, the processor throws a `TemplateContractError` if that variable is missing from the study's variable store. This prevents silent rendering of broken documents.

Handlers that call `processYamlTemplate` should catch `TemplateContractError` and send the researcher a clear DM explaining what's missing and which upstream command to run. See `planHandler.js` for the reference pattern.

A variable is "missing" when no row exists in `study_variables` for that key, or the value is null/undefined. Empty arrays `[]` and empty objects `{}` are valid — they mean the upstream ran but produced no data.

## What these tests do NOT verify

- Actual LLM output quality (LLM is always mocked)
- GitHub integration (commits are mocked)
- Handler logic (Slack modal extraction, DB saves)
- End-to-end Slack flows
