# ADR 0020: System-Assigned Per-Study Participant Codes

**Status:** Implemented
**Date:** 2026-06-02
**Relates to:** L005 (per-participant pool schema field)

## Context

The participant identifier (PT-XXX) had a three-way mismatch causing cascade isolation failures:

1. **Typed name** — Researcher enters "Alice" or "PT-001" freeform in `participant_name` field
2. **Derived ID** — System computed `PT-${database_id}` (global auto-increment, not per-study)
3. **LLM-guessed** — Prompt said "replace names with PT-001" but LLM invented the number

This caused:
- Cascade isolation using LLM-guessed values which were unstable across re-analysis runs
- Evidence chains breaking when re-analyzing the same session
- Nuggets accumulating instead of replacing (isolation failure)

L005 ensured the `participant` field EXISTS in pool schemas. But field presence doesn't help if the field's VALUE is LLM-guessed.

## Decision

Add `participant_code` column to `study_participants` table:
- System-assigned at participant creation time
- Per-study sequence: PT-001, PT-002, etc. (each study starts at 001)
- MAX+1 logic (delete-safe, no collisions after deletes)
- LLM receives code as input and uses it VERBATIM

### Why service layer (not model hook)

Model hooks (beforeCreate) don't have access to transactions, making atomic code generation impossible. The service layer can wrap the code generation and participant creation in a single transaction with advisory lock.

### Why advisory lock

`pg_advisory_xact_lock(study_id)` prevents race conditions during concurrent participant creates. Without it, two simultaneous creates could get the same code.

### Why MAX+1 not COUNT+1

COUNT+1 fails after deletions. If PT-001, PT-002, PT-003 exist and PT-002 is deleted, COUNT+1 would assign PT-003 to the next participant, causing a collision. MAX+1 assigns PT-004.

## Implementation

### Database

New column on `study_participants`:
- `participant_code VARCHAR(10) NOT NULL`
- Unique constraint on `(study_id, participant_code)`

### Service layer

```typescript
async getNextParticipantCode(studyId: number, transaction?: Transaction): Promise<string> {
  await sequelize.query('SELECT pg_advisory_xact_lock($1)', { bind: [studyId], transaction });

  const [result] = await sequelize.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(participant_code FROM 4) AS INTEGER)), 0) + 1 AS next_code
     FROM study_participants WHERE study_id = $1`,
    { bind: [studyId], transaction, type: QueryTypes.SELECT }
  );

  return `PT-${String(result.next_code).padStart(3, '0')}`;
}
```

`createParticipant()` wraps this in a transaction and assigns the code automatically.

### Consumption path

The key fix is in `analyzeNotesHandler.ts`. The session dropdown value IS the participant database ID. Instead of extracting `participant_id` from `note.participant_name` (freeform, non-unique), fetch the participant by database ID and use `participant.participant_code`:

```typescript
const participantDbId = parseInt(sessionId, 10);
const participant = await studyParticipantService.getParticipantById(participantDbId);
const participantCode = participant?.participant_code || 'PT-UNKNOWN';
```

No name matching. Direct ID lookup. Unambiguous.

### YAML template

`session_summary.yaml` v7.1 now instructs the LLM to use `{{participant_id}}` verbatim:

```yaml
7. PARTICIPANT IDENTIFIER RULES:
   - The system has assigned this participant the code: {{participant_id}}
   - Use this EXACT code ({{participant_id}}) throughout — do NOT invent or modify it
   - Replace any real names in the transcript with {{participant_id}}
   - Nugget IDs must follow format: nugget-{{participant_id}}-NNN
```

## Connection to L005

L005 fixed a **structural** problem: pool schemas with `append_or_replace_per_participant` strategy must include a `participant` or `participant_id` field, otherwise the merge isolation silently fails.

ADR 0020 fixes a **data integrity** problem: even with the field present, if its value is LLM-guessed, it's unstable. The cascade isolation was working mechanically (L005) but the participant values being isolated were wrong (ADR 0020).

Together they fix the cascade-isolation bug:
- L005: The field must exist (schema structure)
- ADR 0020: The field's value must be system-assigned (data integrity)

## Verification

After wipe + regenerate, verify THREE-IDENTIFIER AGREEMENT for a real participant:

```
study_participants.participant_code = "PT-001"
session_observers.session_id = "PT-001"
study_variables.value->participant = "PT-001" (nugget.participant)
```

All three MUST be the same value. Re-analysis must replace nuggets cleanly (not accumulate). Readout citations must trace back to the actual participant.

## Files Changed

| File | Change |
|------|--------|
| `migrations/20260602000000-add-participant-code.js` | Add column + constraint |
| `database/models/study_participant.ts` | Declare attribute |
| `types/models.ts` | Add to interface |
| `services/study_participant.service.ts` | `getNextParticipantCode()` + transaction |
| `commands/sessionNotesHandler.ts` | Read `participant_code` |
| `commands/fieldworkHandler.ts` | Read `participant_code` |
| `services/session_observer.service.ts` | Read `participant_code` |
| `commands/addObserverHandler.ts` | Match by `participant_code` |
| `helpers/observerYamlProcessor.ts` | Match by `participant_code` |
| `commands/analyzeNotesHandler.ts` | Fetch participant by ID, use `participant_code` |
| `config/prompts/session_summary.yaml` | Verbatim code instruction (v7.1) |
| `slack/ui/addParticipantModal.ts` | Updated hint text |

## Consequences

- Participant codes are stable across re-analysis runs
- Cascade isolation works correctly (nuggets replace instead of accumulate)
- Evidence chains are traceable from nuggets to actual participants
- Two "Alice" participants in the same study get unique codes (PT-001, PT-002)
- Modal UX no longer suggests researchers should type PT codes manually
