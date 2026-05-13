Draft a new Architecture Decision Record (ADR) based on the conversation context.

Use the existing ADRs in `docs/architecture-decisions/` as style and structure reference.

Steps:
1. Identify the decision being captured from the conversation
2. Find the next available ADR number (read filenames in docs/architecture-decisions/)
3. Slugify the title for the filename
4. Write a draft ADR following the template structure:
   - Status: Proposed
   - Date: today
   - Decision drivers
   - Context
   - Decision
   - Alternatives considered
   - Consequences
   - When to revisit
   - References
5. Update docs/architecture-decisions/README.md to add the entry to the index
6. Tell the user the draft is ready for review and suggest they edit the file before changing status to Accepted
