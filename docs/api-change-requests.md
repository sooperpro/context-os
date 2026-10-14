# API change requests from the frontend

Changes the web app needs from the API, written so the backend can pick them up without reading the
frontend. Each entry says what the UI does today without it, and what changes once it lands.

## Screen status

Every reference screen, the endpoints it reads, and whether they exist. **Live** means the API serves
it. **Mocked** means the screen is built and the web app answers the endpoint with schema-checked
preview data in development (`apps/web/src/mocks`), marked "Preview data" on screen. **Not built**
means the screen does not exist yet. Contracts for mocked endpoints are in
`packages/shared/src/schemas/` (`home.ts`, `contributions.ts`, `learning.ts`); implement exactly that
shape, then delete the mock.

| Screen                                                      | Endpoints                                                                                                                                                                                                      | Status                                                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Home · employee                                             | `GET /v1/me/onboarding`, `/v1/me/next-up`, `/v1/me/tasks`, `/v1/me/milestones`, `/v1/me/knowledge-updates`, `/v1/me/team-activity`, `/v1/me/people`, `/v1/me/contributions`                                    | Mocked                                                                                                            |
| Home · manager                                              | `GET /v1/team/onboarding`, `/v1/team/attention`, `/v1/team/checkins`, `/v1/team/knowledge-gaps`, `/v1/team/knowledge`                                                                                          | Mocked. `/probation/team`, `/probation/employees/:id/checkins` and `/flags/queue` hold some of this data          |
| Home · HR                                                   | `GET /v1/people-ops/overview`, `/v1/people-ops/probation-reviews`, `/v1/people-ops/starters`, `/v1/people-ops/overdue-milestones`, `/v1/people-ops/templates`                                                  | Mocked. Needs a role decision, see 4                                                                              |
| Home · admin                                                | `GET /v1/connectors`, `/v1/users`, `/v1/audit`                                                                                                                                                                 | Live. `/v1/audit` needs a sort, see 5                                                                             |
| Home · admin                                                | `GET /v1/admin/security`, `/v1/admin/sync-runs`, `/v1/admin/ai`                                                                                                                                                | Mocked                                                                                                            |
| Knowledge Hub                                               | `GET /v1/projects`, `/v1/projects/:id/context-items`, `/v1/users`, `/v1/org/teams`                                                                                                                             | Live. Project category missing, see 1                                                                             |
| Project hub, Ask, Sources                                   | project, hub, context, ask and source routes                                                                                                                                                                   | Live                                                                                                              |
| People, Settings, Workspace setup                           | identity, workspace, notification and connector routes                                                                                                                                                         | Live                                                                                                              |
| My roadmap, module, lesson, knowledge check                 | `GET /v1/me/roadmap`, `/v1/me/modules/:id`, `/v1/me/lessons/:id`, `/v1/me/checks/:id`; `POST /v1/me/lessons/:id/complete`, `/v1/me/checks/:id/attempts`, `/v1/me/learning-ratings`, `/v1/me/learning-requests` | Mocked. Contracts in `packages/shared/src/schemas/learning.ts`; views over the existing `/learning/*` data, see 7 |
| Person profile, directory                                   | `/v1/users`, `/v1/users/:id/organization`                                                                                                                                                                      | Not built                                                                                                         |
| Contributions, New contribution                             | `GET /v1/me/contributions`, `/v1/me/knowledge-gaps`, `/v1/sources/search`, `/v1/contributions/reviewer`; `POST /v1/contributions`, `/v1/contributions/draft`, `/v1/contributions/:id/resubmit`                 | Mocked. Contracts in `packages/shared/src/schemas/contributions.ts`; only `POST /v1/flags` exists today           |
| Team onboarding, member, check-in, review queue             | `/v1/probation/*`, `/v1/flags/queue`                                                                                                                                                                           | Not built                                                                                                         |
| Onboarding, probation reviews, templates (HR)               | `/v1/probation/plans`, `/v1/learning/paths`                                                                                                                                                                    | Not built                                                                                                         |
| Connectors, access policies, AI settings, audit log (admin) | `/v1/connectors`, `/v1/audit`, source access routes                                                                                                                                                            | Not built. No AI settings endpoint                                                                                |

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

## 4. Decide how HR (People Ops) is represented

**Why.** The reference has a People Ops role with its own Home (onboarding across teams, probation
reviews, starters, templates). The API's roles are owner, admin, manager, member and guest.

**Today.** The HR Home is built and reachable only through the development "Prototype · view as"
menu (`/?view=people_ops`). No real account sees it.

**Change.** Either add a `people_ops` system role, or a permission (an `assignment` type such as
`people_ops`) that managers or admins can hold. The web app needs one boolean on
`GET /v1/workspaces/current` to choose the Home and gate People Ops navigation.

## 5. Sort the audit log newest first

**Why.** `GET /v1/audit` returns rows in insertion order with `limit`/`offset`, so the first page is the
oldest entries. The admin overview shows the latest five.

**Today.** The web app fetches 100 and sorts on the client, which is wrong once a workspace has more
than 100 entries.

**Change.** `ORDER BY created_at DESC` in `apps/api/src/modules/identity/identity.routes.ts`, or an
`order=desc` query parameter. The response shape is in `AuditEntrySchema` (shared `platform.ts`).

## 6. Contributions

**Why.** The reference lets anyone write a new article, suggest an edit or add a glossary term, with
sources, reviewed by an owner before Context Bot cites it. Knowledge gaps (questions Context Bot
answered badly) are offered as things to write. The API has flags and corrections only.

**Today.** Contributions and New contribution are built on mocks. Saving and submitting work for the
session (the mock keeps them in memory); Home's "Your contributions" reads the same list.

**Change.** Serve the contracts in `packages/shared/src/schemas/contributions.ts`:

- `GET /v1/me/contributions`: the caller's contributions, newest first, with review status, reviewer,
  comments and impact. Existing flags the caller raised can appear as `kind: "flag"`.
- `GET /v1/me/knowledge-gaps` and `GET /v1/team/knowledge-gaps`: one gap shape for both.
- `GET /v1/sources/search?q=&limit=`: sources the caller can access, across projects.
- `GET /v1/contributions/reviewer?section=&title=`: the suggested reviewer and why.
- `POST /v1/contributions`: save (`submit: false`) or submit. On submit, require a title, 40 words and
  a source (the schema's refinement), assign the reviewer, and close the gap it answers.
- `POST /v1/contributions/draft`: Context Bot drafts the body from the given sources (or picks them).
- `POST /v1/contributions/:id/resubmit`: back to review after changes were requested.

## 7. Learning views for the learner

**Why.** The API's learning routes (`/learning/paths`, `/learning/assignments`, progress, quiz, start,
sign-off) return generic records. The reference's roadmap, module, lesson and knowledge check need one
shaped view each, and the knowledge check must be graded on the server.

**Today.** All four screens are built on mocks that keep progress for the session: completing a lesson
or passing a check updates the roadmap, the module and Home's "Up next" and "Your onboarding".

**Change.** Serve the contracts in `packages/shared/src/schemas/learning.ts`, built from the assignment
and its path:

- `GET /v1/me/roadmap`: template, stages with modules and their state, progress against plan, buddy,
  probation review date and completed history.
- `GET /v1/me/modules/:id`, `GET /v1/me/lessons/:id`: a lesson's body is a list of typed blocks
  (paragraphs, lists, flow diagrams, decision records, milestones, media, a practice question), so
  generated lessons can cite decisions and carry checks.
- `POST /v1/me/lessons/:id/complete`: returns the next lesson or check.
- `GET /v1/me/checks/:id` without answers; `POST /v1/me/checks/:id/attempts` grades, explains each
  answer with its source and, on a pass, completes the module and returns what changed.
- `POST /v1/me/learning-ratings` and `POST /v1/me/learning-requests` (clarification to the module owner,
  roadmap change to the manager).
- `GET /v1/me/next-up` and `GET /v1/me/onboarding` (Home) are summaries of the same data.
- `GET /v1/me/tasks` items carry a `target` (lesson, check or module) so Home's buttons open them.
