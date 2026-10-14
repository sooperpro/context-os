# API change requests from the frontend

Changes the web app needs from the API, written so the backend can pick them up without reading the
frontend. Each entry says what the UI does today without it, and what changes once it lands.

## 1. Store a category on projects

**Why.** The reference Knowledge Hub has eight filters: All, Company, Products, Projects, Systems,
Processes, Decisions, Glossary & FAQs. Systems, Decisions and Glossary come from context items. Company,
Products, Projects and Processes are kinds of project, and nothing stores which kind a project is.

**Today.** The web app shows all eight filters. Every project counts as "Projects". Company, Products and
Processes show an honest empty state ("No company pages yet.").

**Change.**

1. `apps/api/src/db/schema.ts`: add `category: text("category").notNull().default("project")` to
   `projects`, then `pnpm --filter @contextos/api db:generate` for the next migration after `0006`.
   Existing rows become `"project"`.
2. `packages/shared/src/schemas/project.ts`: `ProjectCategorySchema` already exists
   (`company | product | project | process`). Make `ProjectSchema.category` required, and add
   `category: ProjectCategorySchema.default("project")` to `CreateProjectInputSchema`
   (`UpdateProjectInputSchema` follows, since it is the partial of create).
3. `apps/api/src/modules/projects/`: write the field in the repository, return it from the list, get,
   create and update routes.
4. Bruno `02 Projects`: create and update send a category, and the tests assert it comes back.

**Frontend follow-up.** Drop the `?? "project"` fallback in the Knowledge Hub and add a category picker to
the New project dialog.

## 2. A workspace-wide context items list (optional, for scale)

**Today.** The Knowledge Hub requests `GET /v1/projects/:projectId/context-items` once per project to build
the Systems, Decisions and Glossary collections, the counts and "Recently updated".

**Change.** `GET /v1/context-items?kind=&q=&limit=&cursor=` across every project the caller can read,
same item schema plus `projectId`, sorted by `updatedAt` descending. One request instead of one per
project, and search can move to the server.

## 3. Widen the Bruno source-processing wait

`03 Sources/05 Wait for Processing` polls 60 times at 500 ms, so 30 seconds in total. Gemini extraction on
a cold start regularly takes longer, which fails the run although the endpoint works. Allow about two
minutes (for example 120 attempts at 1 s).
