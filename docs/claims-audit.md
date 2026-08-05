# Claims vs. Implementation

Every claim the system makes about its own behavior — in UI text, generated documents, ADRs, the design standard, and the patent-relevant architecture story — verified against what the code mechanically does.

**Maintained going forward:** Any new UI text or document template making a behavioral claim adds a row.

---

## Audit table

| # | Claim | Where it appears | What the code does | Status |
|---|-------|------------------|--------------------|--------|
| 1 | "All actions are logged for compliance" | Admin Center footer (`adminCenterModal.ts:128`) | Stakeholder changes were not logged until PR #229 (`f9d428c0`). Now all admin actions write audit rows. | TRUE — verified by executed audit-row test |
| 2 | PII review "N items scrubbed ✓" | PII Review DM (`sessionNotesHandler.ts`) | Scrub is partial by design (name decomposition only, not full PII detection). Checkmark implies completeness. | OPEN — assigned to PII redesign |
| 3 | "participant_metadata is cascade-required by research_readout so the cascade always receives a value" (A1 demographics ruling rationale) | `backend/docs/qori-modal-design-standard.md` R7 resolved ambiguities | Add Participant demographics never enter the cascade. `participant_metadata` is LLM-extracted from transcripts, not from DB demographics. | FALSE — correction pending in C2 PR |
| 4 | participant_metadata extraction "traceable to upstream data" | `participant_metadata.yaml` schema, session_summary cascade summary | LLM extraction was inference-capable: `background` field instructed "disability status" extraction, `accessibility` field was open-ended. No grounding rule constrained extraction to explicit statements. | FALSE → FIXED (PR #TBD) — grounding rule added, field descriptions tightened to explicit-only |

---

*Sweep of remaining claims pending — will populate additional rows from modal text, DM text, generated documents, ADRs, and RFI doc.*
