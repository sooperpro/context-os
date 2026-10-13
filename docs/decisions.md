# Decision log

Living log of material decisions. Keep entries short; link to the implementation plan for context.

| Date       | Decision                                                        | Options considered                                 | Rationale                                                                             | Owner | Revisit trigger                                |
| ---------- | --------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- | ----- | ---------------------------------------------- |
| 2026-10-13 | Keep Node/Hono + SQLite + Gemini for the MVP                    | FastAPI + Postgres + OpenAI (brief), current stack | Stack fixed by owner; SQLite adequate for single-tenant pilot; shared TS contracts    | Owner | Multi-instance deployment or second tenant     |
| 2026-10-13 | Manual source import is the first "connector"                   | Wait for OAuth connectors; mock connectors         | Unblocks pipeline, hub and Q&A work and evaluation; OAuth needs app approvals         | Owner | Pilot connector choice                         |
| 2026-10-13 | Verified-quote evidence model                                   | Trust LLM citations; chunk-id citations only       | Quotes are checkable against source text; unverifiable quotes are flagged, not hidden | Owner | Eval shows quote verification too strict/loose |
| 2026-10-13 | FTS5 + Gemini embeddings with RRF, embeddings optional          | FTS only; external vector DB                       | Hybrid retrieval without new infrastructure; graceful degradation                     | Owner | Measured recall/latency problems               |
| 2026-10-13 | In-process SQLite job worker                                    | Redis/BullMQ; synchronous processing               | Retry-safe async pipeline with zero extra infra; flag allows split later              | Owner | Second API instance                            |
| 2026-10-13 | Identity provider deferred, `Actor` abstraction + audit log now | Clerk now                                          | Open question in brief; abstraction keeps the change local                            | Owner | Before external users                          |
