# Screen: Survey Pipeline (ADD, P2)

Stages as usa-step-indicator: Upload -> Schema review -> Privacy review -> Codebook -> Match review -> Synthesis. CURRENT runtime, verbatim statuses.
Schema: column table (20/page cap honored), role select per field, ordinal order, demographic flag. Privacy: flagged-entry table, statuses pending/clear/redacted/restricted; bulk never touches flagged rows. Codebook: keep/edit/remove/add (NO merge — not runtime). Match review: reviewed/no_grouping_applies/uncodable, pre-checked code checkboxes, bulk approve = proposed matches only. Synthesis: run when stages complete.
V1 = existing pipeline only; no survey authoring. Class: table/grid per stage + gate frame.