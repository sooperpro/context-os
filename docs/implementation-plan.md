# ContextOS — Implementation plan

**Historical V0 plan:** The sections below describe the original handoff-based prototype, not current release acceptance criteria. The requirements source is [ContextOS_PRD.md](../ContextOS_PRD.md), targeting **Phase 1 first** as selected by the owner. Use the [backend use-case guide](backend-api-use-cases.md) and [coverage/release gates](backend-production-readiness.md) for implementation status. Clerk authentication, source privacy, org management and learning foundations now exist; production accounts/live validation are deferred. Unverified extraction quotes are now discarded rather than retained, and the five-day roadmap is not used.

**Source brief:** `ContextOS_Knowledge_Handoff.md` (13 Oct 2026). This plan turns that brief into a build sequence for the stack already chosen for this repository. Sections 1–3 restate the thesis and the decisions taken; 4–7 describe what V0 implements; 8–9 list the backlog and open questions.

**Auth/connector follow-up:** [Authentication, authorization and connector stack](auth-and-connectors-stack.md) specifies proposed additions to the existing Node/React/Gemini stack, based on the product handoff and actual repository implementation.

## 1. Thesis (what we are building)

ContextOS reconstructs **how a project got here, why decisions were made, what is true now, and where the evidence lives** from a bounded set of project sources. RAG is an implementation detail; the product promise is connected, temporal, evidence-backed context for people and agents.

Non-negotiables carried into every phase:

1. Evidence before eloquence: every generated claim is traceable to a source span.
2. Temporal correctness: source time, event time and "as of" are distinct, and current state is separated from history.
3. Uncertainty is visible: insufficient or conflicting evidence is labelled, never papered over.
4. Humans can confirm, dispute or mark context stale.
5. Permission parity and tenant isolation are enforced in the data layer, never by the model.

## 2. Decisions and deviations from the brief

| #   | Decision                                                                                               | Rationale                                                                                                                                                                                                                                               | Revisit when                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **Node + Hono API, React/Vite web, SQLite via Drizzle, Gemini** instead of FastAPI / Postgres / OpenAI | The stack was chosen by the owner before the brief; the brief marks its stack as "a starting proposal". One language across the monorepo, shared Zod contracts, and SQLite is sufficient for a single-tenant pilot corpus.                              | Multi-instance deployment, >1 pilot tenant, or corpus beyond what brute-force vector scoring handles (~50k chunks). Migration path: Postgres + pgvector, same repository interfaces. |
| D2  | **Manual source import before OAuth connectors**                                                       | Connectors need app registration, admin consent and scope review (brief §8). The normalized source model, pipeline, hub and Q&A can be built and evaluated now against exported content; connectors then implement the same `SourceConnector` contract. | Pilot customer confirms which two connectors to authorise first.                                                                                                                     |
| D3  | **Hybrid retrieval = SQLite FTS5 (BM25) + Gemini embeddings with reciprocal-rank fusion**              | Meets "keyword + semantic" without a separate vector service. Embeddings are optional at runtime: if the embedding call fails the pipeline degrades to keyword search and logs it.                                                                      | Vector scoring latency or recall becomes a measured problem.                                                                                                                         |
| D4  | **Structured extraction with verified quotes**                                                         | Gemini returns JSON that must match a Zod schema; each item carries a verbatim `evidenceQuote` that the API checks against the source text. Unverifiable quotes are kept but flagged `quoteVerified=false` and the item's confidence is capped.         | Extraction eval set exists (Phase 2 exit criterion).                                                                                                                                 |
| D5  | **Relational "graph"**: typed context items + evidence rows, no graph database                         | Brief §6 recommends exactly this for MVP.                                                                                                                                                                                                               | Query patterns need multi-hop traversal.                                                                                                                                             |
| D6  | **In-process job worker on a SQLite `jobs` table**                                                     | Ingestion and extraction are asynchronous and retry-safe without Redis. `WORKER_ENABLED=false` lets the API run without the worker so it can be split into its own process later.                                                                       | Second API instance, or jobs exceed single-process throughput.                                                                                                                       |
| D7  | **V0 uses a development actor; Clerk proposed for the next phase**                                     | Project scope and audit are foundations, but authentication also requires organization mapping, memberships, roles, source permissions, access-aware generated content and cache lifecycle. See the stack extension.                                    | Before external users or shared private source data.                                                                                                                                 |
| D8  | **Learning paths, video/visual artifacts, graph UI: deferred**                                         | Brief §4 says do not prioritise generated media before facts are reliable.                                                                                                                                                                              | Hub accuracy validated in pilot.                                                                                                                                                     |

## 3. Riskiest assumptions (test first)

1. Gemini structured extraction produces decisions/events/status with quotes that actually appear in the source (D4). _Mitigation:_ server-side quote verification, confidence capping, eval set.
2. Name-based deduplication of people/components/terms is good enough for a single project corpus. _Mitigation:_ conflicts surface rather than merge; entity resolution is backlog item B6.
3. Keyword + embedding retrieval over paragraph chunks gives enough recall for onboarding questions. _Mitigation:_ evaluation questions per project (B5); relationship expansion via evidence links already included.
4. A single-process SQLite deployment suffices for the pilot (D1, D6).

## 4. V0 scope (implemented in this repository)

**Workspace & projects** — one default workspace seeded on boot; projects with stats.

**Sources** — `POST /projects/:id/sources` accepts a normalized source object (`kind`: document, conversation, ticket, pull_request, note; title, content, url, author, source timestamps). Content hash, ingestion time and processing status are recorded. Delete and reprocess are supported.

**Pipeline (jobs)** — `process_source`: chunk → FTS index (trigger-maintained) → embeddings → extraction → evidence verification → dedupe → mark ready → `refresh_hub`. `refresh_hub`: regenerate the cited project overview. Jobs retry with backoff; failures are visible in the hub's sync panel.

**Context model** — `context_items` (decision, event, status_claim, person, component, dependency, term) with `event_at`, `as_of`, `verification` (inferred/confirmed/stale/disputed/superseded) and `confidence`; `evidence` rows link items to source objects and chunks with verbatim quotes. Status claims with the same subject but different states are flagged as conflicting instead of auto-resolved.

**Hub** — overview (each field cites context items, which cite sources), timeline, decisions, current state, people & ownership, components & dependencies, terminology, sources, sync status. Honest empty states.

**Ask ContextOS** — hybrid retrieval + related items → Gemini answer constrained to numbered evidence; citations are validated server-side; answer includes confidence (incl. `insufficient`), uncertainties, current state with as-of, timeline context. Questions and answers are stored.

**Human review** — verification state per item; feedback (correct/incorrect/outdated/missing context/conflicting) on items, answers and overview; audit log of every mutation.

## 5. Architecture

```
apps/web (React)  ──HTTP/JSON (shared Zod contracts)──▶  apps/api (Hono)
                                                           ├─ middleware: request id, actor, project scope, rate limit, errors
                                                           ├─ modules: projects, sources, context, hub, ask, feedback, jobs, audit, health
                                                           ├─ lib: gemini (structured output + embeddings), chunking, retrieval (FTS5 + cosine + RRF)
                                                           ├─ jobs: SQLite queue + in-process worker (process_source, refresh_hub)
                                                           └─ db: Drizzle + better-sqlite3 (WAL), migrations incl. FTS5 virtual table + triggers
```

Layering inside a module: `routes` (validation, HTTP) → `service` (rules, Gemini orchestration, audit) → `repository` (Drizzle). Services depend on interfaces (`GeminiClient`, repositories) so tests run against an in-memory database and a fake model.

## 6. Data model (SQLite)

`workspaces`, `projects`, `source_objects`, `source_chunks` (+ `source_chunks_fts` FTS5), `extraction_runs`, `context_items`, `evidence`, `hub_snapshots`, `questions`, `feedback`, `jobs`, `audit_log`. Provenance is represented across these linked tables; not every row contains every field or a direct tenant column. See `apps/api/src/db/schema.ts`. Membership, connector, credential and source-access tables are proposed in the stack extension and are not yet implemented.

## 7. API surface (v1)

| Method           | Path                                                      | Purpose                           |
| ---------------- | --------------------------------------------------------- | --------------------------------- |
| GET/POST         | `/projects`                                               | list / create                     |
| GET/PATCH/DELETE | `/projects/:projectId`                                    | read / update / delete            |
| GET              | `/projects/:projectId/hub`                                | overview + sync + counts          |
| POST             | `/projects/:projectId/hub/refresh`                        | enqueue overview regeneration     |
| GET/POST         | `/projects/:projectId/sources`                            | list / import                     |
| GET/DELETE       | `/projects/:projectId/sources/:sourceId`                  | detail (content) / delete         |
| POST             | `/projects/:projectId/sources/:sourceId/reprocess`        | re-run pipeline                   |
| GET              | `/projects/:projectId/context-items?kind=`                | items with evidence and conflicts |
| PATCH            | `/projects/:projectId/context-items/:itemId/verification` | confirm / stale / disputed        |
| POST             | `/projects/:projectId/ask`                                | evidence-backed answer            |
| GET              | `/projects/:projectId/questions`                          | answer history                    |
| GET/POST         | `/projects/:projectId/feedback`                           | feedback                          |
| GET              | `/projects/:projectId/jobs?status=`                       | sync detail                       |
| POST             | `/projects/:projectId/jobs/:jobId/retry`                  | retry failed job                  |

Errors use the shared envelope; all project routes 404 for unknown projects before touching data.

## 8. Backlog (next two weeks, in order)

For the auth/Drive work, the required delivery dependency is B2 → B4 → B3: establish identity and source-access enforcement before exposing connected private files.

| #   | Item                                                                                                                                                                      | Why                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| B1  | Pilot persona + 20–30 real onboarding questions with expected evidence                                                                                                    | Brief §17.1–2; needed before tuning anything     |
| B2  | Clerk React/backend SDKs, organization-to-workspace mapping, membership lifecycle, local role policies, signed webhooks and web session/cache flow                        | D7; stack extension §4                           |
| B3  | Google Drive first: selected-file OAuth/Picker, encrypted refresh tokens, Docs/PDF parsing and idempotent worker backfill/manual sync                                     | User's requested integration; stack extension §5 |
| B4  | Source-access checks before ingestion exposure/retrieval, plus dependency-aware context/hub/history/citation/cache reads; implement before B3 imports shared private data | Permission parity; stack extension §6            |
| B5  | Evaluation harness: run B1 questions through `/ask`, score citation precision and temporal correctness                                                                    | Brief §14                                        |
| B6  | Entity resolution across sources (aliases, Jira keys, GitHub handles)                                                                                                     | Assumption 2                                     |
| B7  | Conflict reconciliation UI: user picks canonical claim; store resolution and sources                                                                                      | Brief §6 "handling conflicts"                    |
| B8  | Learning path generation from hub (role templates)                                                                                                                        | Brief §4.11                                      |
| B9  | Chunk-level extraction for long documents, extraction cost accounting                                                                                                     | Cost/quality                                     |
| B10 | Deployment: Docker build verification, backups of SQLite volume, observability (OpenTelemetry)                                                                            | Production readiness                             |

## 9. Open questions (unchanged from the brief, need owner decisions)

Beachhead persona; first paid buyer; which two connectors first; hosting and data residency; source-of-truth hierarchy per customer; pricing model.
