# Screen: Brief Approval (P0)

Not a separate app: approval banner + rail on brief detail (/studies/:id/brief) + work-queue item. Contract: research-brief.md approval flow; Phase 3 gate pattern 4.
States: pending_approval -> approved | changes_requested -> (resubmit) -> pending_approval. Stale-action guards ("already approved — no action needed").
Approver = stakeholder flag or owner fallback (single approver; multi-stakeholder NOT IMPLEMENTED).
Approve: contract checklist (scope/method, timeline/deadline, participants, budget) must be checked; consequence stated ("Approval unlocks the research plan").
Request changes: feedback required + files to update + priority + deadline; researcher notified with Resubmit CTA; resubmission shows prior feedback + what changed.
Decision record permanent on brief + audit trail.