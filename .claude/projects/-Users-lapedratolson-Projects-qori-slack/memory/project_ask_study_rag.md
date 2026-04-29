---
name: ask-study RAG commands disabled
description: /ask-study and /qori-ask are RAG-dependent stubs, disabled for alpha. Need Supabase + OpenAI to re-enable.
type: project
---

/ask-study exists as a stub that opens a modal saying "not available yet." /qori-ask is listed in ALPHA_POLISH.md as disabled. Both depend on the RAG pipeline (ragV2.js + Supabase vector store + OpenAI embeddings).

**Why:** RAG was disabled for alpha to reduce dependencies. Re-enabling requires provisioning Supabase, setting SUPABASE_URL/SUPABASE_ANON_KEY/OPENAI_API_KEY env vars, and restoring the call sites in events.js.

**How to apply:** When the user is ready to bring back RAG/search features, follow the "How to Re-enable RAG" section in CLAUDE.md.
