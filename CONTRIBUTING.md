# Contributing to Qori

## Development workflow

### Setup

```bash
cd backend
npm install
```

### Running locally

```bash
npm run dev
```

### Type checking

The codebase is TypeScript with strict mode enabled. Type-check before committing:

```bash
npm run typecheck
```

### Tests

Tests use Jest. Run them with:

```bash
npm test
```

Watch mode for active development:

```bash
npm run test:watch
```

### Pre-PR checklist

Before opening a PR:

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm test` passes
- [ ] If the change is architectural (see `docs/architecture-decisions/README.md` for criteria), draft an ADR
- [ ] If the change introduces a new parser, ensure fuzz inputs are tested (see ADR L002)
- [ ] If the change adds a service finder with an `attributes:` whitelist, justify in a comment (see ADR L001)

CI runs the same checks on every PR. PRs that fail CI cannot merge.

## Architecture decisions

Significant decisions are documented as ADRs in `docs/architecture-decisions/`. New ADRs should follow the format documented in that directory's README. Create with:

```bash
npm run adr "title of the decision"
```

## Quarterly audit

The codebase is reviewed quarterly using the checklist at `docs/audits/quarterly-architecture-audit.md`. The Claude Code or designated reviewer runs the audit, produces a report saved as `docs/audits/YYYY-QN-audit.md`, and surfaces follow-up work.

## Questions

Open an issue or contact the project owner.
