# Workstream: PII-Handling Architecture / Zero-PII Design

**Status:** Not started — requires audit before design
**Filed:** 2026-06-02
**Relates to:** ADR 0020 (system-assigned participant codes)

## Problem Statement

The participant code fix (ADR 0020) addresses one PII entry path — the participant name field. But there's another path: **outreach messages**. If Qori stores real names/emails to send recruitment/scheduling messages, PII enters the system regardless of what's in the participant field.

## Target Principle

**Qori holds ZERO participant PII.** Real names and contact info live in the researcher's own email/recruiting tools. Qori holds only:
- System-assigned code (PT-001)
- Optional alias (non-PII memory aid like "screen-reader user")
- Research data (findings, nuggets, analysis)

## Required Audit (Before Design)

### Questions to Answer

1. **How does outreach get participant name/email today?**
   - Does the outreach handler read from a contact_details field?
   - Are emails/names stored in the database?
   - Where do the outreach templates get personalization data?

2. **Does Qori SEND messages or DRAFT them?**
   - If Qori sends directly (via Slack DM, email API), it must have PII
   - If Qori drafts for the researcher to copy/paste, PII stays external

3. **What does the outreach flow actually do?**
   - Trace through `participantOutreachHandler.ts` and related files
   - Map data flow from modal input to message output
   - Identify all PII touchpoints

### Lapedra's Insight

Messages could instruct the researcher to add the real name/email in THEIR email system. Qori's tracker adds a column linking the outgoing message to the participant CODE (not storing the PII). This keeps:
- Real names → researcher's email client
- Contact info → researcher's recruiting tool
- Qori → codes + research data only

## Design Considerations (After Audit)

1. **Outreach message drafts** — Generate template text with `{{participant_code}}` placeholder; researcher fills in real name/email in their own system

2. **Tracker linkage** — Record that "outreach sent to PT-003 on 2026-06-02" without storing what name/email was used

3. **Modal changes** — Remove any PII input fields from outreach modals; reference participants by code only

4. **Data model changes** — If `contact_details` column exists, decide whether to deprecate it

5. **Migration path** — Handle existing studies that may have stored PII

## Federal Defensibility Angle

This is a federal-defensibility piece: "We store no participant PII." For VA research context, this matters for:
- Privacy Act compliance
- HIPAA considerations (if health data involved)
- IRB approval language
- Data breach risk reduction

Worth doing deliberately as a standalone design, not bolted onto the current participant code fix.

## Files to Audit

- `backend/src/helpers/slack/commands/participantOutreachHandler.ts`
- `backend/src/helpers/slack/ui/outreach/*.ts`
- `backend/src/database/models/study_participant.ts` (contact_details field?)
- Outreach-related YAML templates in `config/prompts/`

## Next Steps

1. Complete audit (answer the three questions above)
2. Document current PII touchpoints
3. Design zero-PII architecture
4. Write ADR for the approach
5. Implement changes
