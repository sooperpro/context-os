# ContextOS

ContextOS reconstructs project context from a team's existing sources: **how the project got here, why decisions were made, what is true now, and where the evidence lives**. It is built for people joining a project (and, later, agents working on it). Retrieval is an implementation detail; the product promise is connected, temporal, evidence-backed context.

- Product brief: `ContextOS_Knowledge_Handoff.md` (owner's document, not in this repo)
- Implementation plan and scope decisions: [docs/implementation-plan.md](docs/implementation-plan.md)
- Decision log: [docs/decisions.md](docs/decisions.md)

| Layer   | Stack                                                                                                                                    |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Web     | React 19, Vite 8, TypeScript, Tailwind CSS v4, shadcn/ui (Base UI, nova style), TanStack Query v5, React Router 8, react-hook-form + Zod |
| API     | Node.js 24, Hono 4, Drizzle ORM + better-sqlite3 (FTS5), `@google/genai` (Gemini for extraction, synthesis, answers, embeddings), pino   |
| Shared  | `@contextos/shared`: Zod schemas and types that define the API contract for both sides                                                   |
| Tooling | pnpm 12 workspaces + catalogs, Turborepo, TypeScript 6, ESLint 10 (type-aware), Prettier, Vitest 5, Husky + lint-staged, GitHub Actions  |

## What V0 does

1. **Projects** inside a default workspace (every table carries tenant columns; identity provider is deferred, see D7 in the plan).
2. **Sources** are imported manually as normalized source objects (document, conversation, ticket, pull request, note) with author, dates, link and content hash. OAuth connectors implement the same model later.
3. **Pipeline** (background jobs on SQLite): chunk → FTS5 index → Gemini embeddings → Gemini structured extraction → **verbatim-quote verification** → de-duplication → hub refresh. Jobs retry with backoff; failures are visible in the UI.
4. **Context model**: decisions, events, status claims, people/ownership, components, dependencies and terms, each with event time / as-of time, verification state (inferred, confirmed, stale, disputed, superseded), confidence and evidence rows pointing at source spans. Status claims about the same subject with different states are flagged as **conflicting**, never auto-resolved.
5. **Project hub**: cited overview (each paragraph lists the items it rests on; items link to sources), timeline, decisions, current state, people, components, terms, sync status, honest empty states.
6. **Ask ContextOS**: hybrid retrieval (BM25 + vectors, reciprocal rank fusion) → cited answer with confidence (including `insufficient`), uncertainties, current state with as-of date, timeline context. Citations are validated server-side against the passages the model saw.
7. **Human review**: confirm / mark stale / dispute per item, feedback on items, answers and the overview, and an audit log of every mutation.

## Repository layout

```
.
├── apps/
│   ├── api/                      # Hono HTTP API + background worker (Node)
│   │   ├── drizzle/              # SQL migrations (schema + FTS5 virtual table/triggers), committed
│   │   └── src/
│   │       ├── index.ts          # entry: DB, migrations, container, worker, server, graceful shutdown
│   │       ├── app.ts            # middleware + routes wired from the container (testable)
│   │       ├── container.ts      # composition root: repositories, services, queue, worker
│   │       ├── config/env.ts     # Zod-validated environment
│   │       ├── db/               # better-sqlite3 + Drizzle client, schema.ts, migrator
│   │       ├── lib/              # gemini (structured output + embeddings), chunking, retrieval, text, retry, logger, errors
│   │       ├── middleware/       # request id, actor, project scope, rate limit, validation hook, error envelope
│   │       ├── modules/          # projects, sources, context (extraction), hub (overview), ask (retrieval+answer),
│   │       │                     # feedback, jobs (queue, worker, handlers), audit, workspace, health
│   │       └── test/             # helpers: in-memory DB app + fake Gemini
│   └── web/                      # Vite + React SPA
│       └── src/
│           ├── app/              # providers (Query, theme, toaster) and router (code-split routes)
│           ├── components/       # ui/ (shadcn), layout/ (app shell, project layout), theme
│           ├── features/         # projects, sources (incl. source drawer), hub, ask, jobs, feedback
│           ├── lib/              # api-client, query-client, labels, format, utils
│           └── test/             # Vitest setup and render helpers
├── packages/
│   ├── shared/                   # API contract: Zod schemas + inferred types (consumed as TS source)
│   ├── eslint-config/            # shared ESLint flat configs
│   └── tsconfig/                 # shared tsconfig bases
├── docs/                         # implementation plan, decision log
├── .github/workflows/ci.yml      # lint, typecheck, test, build on push/PR
└── docker-compose.yml            # api + web (nginx)
```

## Prerequisites

- **Node.js 24** (>= 22.22 works). With nvm: `nvm install 24 && nvm use` (`.nvmrc` is present). If your nvm default is older, run `nvm use` in each shell or `nvm alias default 24`; pnpm refuses unsupported Node versions (`engineStrict`).
- **pnpm 12** via Corepack: `corepack enable` (version pinned in `package.json`).
- A **Gemini API key**: https://aistudio.google.com/apikey

## Getting started

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # set GEMINI_API_KEY
pnpm dev
```

- Web: http://localhost:5173 (proxies `/api` to the API; no CORS in development)
- API: http://localhost:3000/api/v1/health

Then: create a project → add two or three sources (paste a design doc, a decision record, an exported thread) → watch the sync badge → explore the hub → ask a question. The SQLite file lives at `apps/api/data/contextos.db` and migrations run automatically on boot.

## Scripts

| Command                  | What it does                                                               |
| ------------------------ | -------------------------------------------------------------------------- |
| `pnpm dev`               | API (tsx watch, worker enabled) + web (Vite)                               |
| `pnpm build`             | API (tsdown → `apps/api/dist/index.js`) + web (Vite → `apps/web/dist`)     |
| `pnpm check`             | lint + typecheck + test + build for every package                          |
| `pnpm lint` / `lint:fix` | ESLint (type-aware)                                                        |
| `pnpm typecheck`         | `tsc` project-wide                                                         |
| `pnpm test`              | Vitest (API: in-memory SQLite + fake Gemini; web: jsdom + Testing Library) |
| `pnpm format`            | Prettier (with Tailwind class sorting)                                     |
| `pnpm db:generate`       | Generate a SQL migration from schema changes                               |
| `pnpm db:migrate`        | Apply migrations to `DATABASE_URL`                                         |
| `pnpm db:studio`         | Drizzle Studio                                                             |

Pre-commit runs `lint-staged` (ESLint fix + Prettier on staged files) via Husky.

## API

Base path `/api/v1`. Every error uses one envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": { "issues": [] },
    "requestId": "…"
  }
}
```

| Method           | Path                                                      | Purpose                                         |
| ---------------- | --------------------------------------------------------- | ----------------------------------------------- |
| GET              | `/health`, `/health/ready`                                | liveness / readiness (checks SQLite)            |
| GET / POST       | `/projects`                                               | list / create                                   |
| GET/PATCH/DELETE | `/projects/:projectId`                                    | read / update / delete                          |
| GET              | `/projects/:projectId/hub`                                | overview + sync status + counts                 |
| POST             | `/projects/:projectId/hub/refresh`                        | queue overview regeneration                     |
| GET / POST       | `/projects/:projectId/sources`                            | list / import a source (queues processing)      |
| GET / DELETE     | `/projects/:projectId/sources/:sourceId`                  | detail with content / delete (+ orphan cleanup) |
| POST             | `/projects/:projectId/sources/:sourceId/reprocess`        | re-run the pipeline for one source              |
| GET              | `/projects/:projectId/context-items?kind=`                | items with evidence and conflict flags          |
| PATCH            | `/projects/:projectId/context-items/:itemId/verification` | confirmed / stale / disputed / …                |
| POST             | `/projects/:projectId/ask`                                | evidence-backed answer (synchronous)            |
| GET              | `/projects/:projectId/questions`                          | answer history                                  |
| GET / POST       | `/projects/:projectId/feedback`                           | feedback on items, answers, overview            |
| GET              | `/projects/:projectId/jobs?status=`                       | background job detail                           |
| POST             | `/projects/:projectId/jobs/:jobId/retry`                  | retry a failed job                              |

Request and response shapes live once in `packages/shared/src/schemas` and are validated on both sides.

### Environment (`apps/api/.env`)

| Variable                                                 | Default                        | Notes                                                                         |
| -------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| `GEMINI_API_KEY`                                         | required                       |                                                                               |
| `GEMINI_MODEL`                                           | `gemini-3.8-flash`             | Extraction, overview synthesis, answers (structured output)                   |
| `GEMINI_EMBEDDING_MODEL` / `GEMINI_EMBEDDING_DIMENSIONS` | `gemini-embedding-001` / `768` | Retrieval vectors; the pipeline degrades to keyword search if embedding fails |
| `DATABASE_URL`                                           | `./data/contextos.db`          | SQLite path, or `:memory:`                                                    |
| `WORKER_ENABLED` / `WORKER_POLL_INTERVAL_MS`             | `true` / `1000`                | Run the job worker in-process (set `false` for API-only)                      |
| `WORKSPACE_NAME`, `DEV_ACTOR_ID`, `DEV_ACTOR_NAME`       | defaults                       | Single workspace + development actor until identity is wired                  |
| `PORT` / `HOST`                                          | `3000` / `0.0.0.0`             |                                                                               |
| `CORS_ORIGINS`                                           | `http://localhost:5173`        | Comma-separated                                                               |
| `LOG_LEVEL`                                              | `info`                         | pino; pretty-printed in development                                           |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`                | `60000` / `120`                | Per client IP; `0` disables                                                   |
| `TRUST_PROXY`                                            | `false`                        | Use `X-Forwarded-For` behind a reverse proxy                                  |
| `SHUTDOWN_TIMEOUT_MS`                                    | `10000`                        | Force exit if connections do not drain                                        |

### How the pipeline works

`POST /sources` stores the source and queues `process_source`. The worker chunks the text (paragraph-aware), inserts chunks (FTS5 rows are maintained by triggers), embeds them (best effort), and asks Gemini for a strictly structured extraction (`apps/api/src/modules/context/extraction.schema.ts`). Each extracted item carries an `evidenceQuote`; the API checks the quote against the source text and the chunk it came from. Unverifiable quotes are kept but flagged (`quoteVerified=false`) and the item's confidence is capped at low. Items with the same subject across sources are merged (evidence accumulates); incompatible status claims stay separate and are flagged as conflicting. Finally `refresh_hub` regenerates the cited overview. Prompt versions are recorded on every extraction run and hub snapshot.

`POST /ask` runs keyword (BM25) and vector retrieval over the project's chunks, fuses the rankings, pulls in context items linked to the retrieved sources, and asks Gemini for a structured answer that must cite passages by number. Citations that do not map to a real passage are dropped, and an answer without citations is downgraded to low confidence. If no passages match, the API answers "insufficient" without calling the model.

## Web

- **Server state** lives in TanStack Query; every project-scoped key sits under `projectKeys.detail(id)` so one invalidation refreshes the project when background processing finishes. Hub and source lists poll only while jobs are running.
- **API calls** go through `lib/api-client.ts`, which validates every response with the shared Zod schemas and throws `ApiClientError` with the server's envelope. Failed mutations surface as toasts via a global `MutationCache`.
- **Routing**: React Router 8 data mode with code-split project routes (`app/router.tsx`).
- **UI**: shadcn/ui on Base UI (nova style). Components compose with the `render` prop, not Radix's `asChild`. `cn` comes from the `cn` package.
- **Design rules from the brief**: confirmed / inferred / stale / disputed are always visible; dates and freshness are shown where they change interpretation; every synthesis links to its evidence (source drawer); empty states say "not enough source evidence yet" rather than inventing content.

## Testing

```bash
pnpm test
pnpm --filter @contextos/api test:watch
pnpm --filter @contextos/web test:watch
```

API tests build the full app on an in-memory SQLite database with migrations applied and a fake Gemini client (`src/test/helpers.ts`), then run the job worker synchronously. They cover the ingestion pipeline (verified quotes, embedding failure degradation, retries, reprocess, orphan cleanup), conflict flagging, verification, ask (citation validation, honest insufficiency), feedback, projects and the queue/worker.

## Docker

```bash
cp apps/api/.env.example apps/api/.env   # set GEMINI_API_KEY
docker compose up --build
```

The API image runs the worker in-process and persists SQLite in the `api-data` volume. The web image serves the Vite build with nginx and proxies `/api/` to the API. The Dockerfiles have not been built on this machine (no Docker daemon available during setup); treat the first build as a verification step.

## Conventions and notes

- `packages/shared` is consumed as TypeScript source (`exports` → `src/index.ts`); no build step.
- Shared versions (TypeScript, Zod, Vitest, ESLint, Prettier, `@types/node`) are pinned in the `catalog` of `pnpm-workspace.yaml`; dependency install scripts are allow-listed there too.
- TypeScript is pinned to 6.x until `typescript-eslint` supports TypeScript 7.
- The API bundles `@contextos/shared` into `dist/index.js`; everything else stays external.
- The shadcn CLI needs network access to `ui.shadcn.com`; if that host is blocked, components can be vendored from the shadcn GitHub repository and transformed with `shadcn/utils` (see the decision log).
