# Flow: Start a Study

**Actors**: Researcher (lead). **Entry**: Home → "New study", Project page → "New study", or ⌘K.

1. **Initiate** — Dialog: study name, project (pre-filled from context), method (select), research questions (optional now). One screen, ≤5 fields; everything else is post-creation. *A11y checkpoint: dialog trap, error summary.*
2. **Study created** — Lands on Study Overview in first-use empty state: the Overview teaches the workflow ("Add sources → Qori extracts evidence → review findings") with "Add sources" primary.
3. **Add sources** — Sources tab, FileUpload: per-file staged progress (Uploading → Privacy check → Ready). PII notice shown before upload (ADR-0026: scrubbing at ingestion). Files needing privacy review are flagged, not silently blocked. *Checkpoint: per-file status announced.*
4. **Analyze** — "Analyze sources" primary → confirmation states what will happen ("Qori will extract evidence and draft themes from 7 sources. You review everything before it becomes part of the study."). ProgressStepper begins; banner: leave-safe, Work Queue on completion.
5. **Review outputs** — Completion → Work Queue item "Evidence extracted from 7 sources — review themes". Suggested themes/findings render with AI-suggested treatment until accepted.

**Failure paths**: upload fails (per-file retry), privacy review required (routes to authorized reviewer's queue), analysis fails mid-step (stepper stops at step, cause + Retry), duplicate study name (inline validation).

**Slack parity**: `/qori-plan` remains; a study started in Slack appears identically in the Workspace — canonical state is Core.
