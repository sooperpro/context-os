# ContextOS backend handoff

For the backend developer. It lists every endpoint the web app needs that the API doesn't serve
yet, where the web app fakes it today with mock ("preview") data, what each one must do, and how to
switch each mock off once the real endpoint ships.

- **Written:** October 14, 2026, from branch `feat/prototype-screens` (web app complete against the
  Oct 14 design reference).
- **Built from the code, not memory.** The endpoint list comes from the mock registry
  (`apps/web/src/mocks/endpoints.ts`) and the endpoint descriptors; the live route list comes from
  `apps/api/src/modules/*/*.routes.ts`; the rules in section 7 come from reading every mock line by line.
- **Companion doc:** `docs/api-change-requests.md` keeps the short "why" for each area (items 1–15).
  This file is the complete, endpoint-by-endpoint version. Section numbers in "Backlog: item N" point
  there.

## 0. Summary

| What                                                    | Count | Where                 |
| ------------------------------------------------------- | ----: | --------------------- |
| Endpoints the web app fakes with mock data (to build)   | **7** | Section 7, Appendix A |
| Live API routes the web app already uses                |   159 | Appendix B            |
| Live API routes the web app doesn't use yet             |    55 | Appendix C            |
| Changes needed on live endpoints                        |    10 | Section 5             |
| Decisions needed before building                        |    10 | Section 6             |
| Features with no contract yet ("coming soon" in the UI) |    13 | Section 8             |

Every web call to a literal path hits a live route, and every call through an endpoint descriptor is
mocked except the live `GET /v1/audit`: the web app calls **no endpoint that is neither live nor
mocked**.

**Important for production.** The mock layer exists only in development. A production build doesn't
contain it, so **the 7 endpoints simply 404 in production today** and the screens built on them show
their error states. Shipping these endpoints is what makes those screens real.

The 7 endpoints by area (all contributions, hidden for the demo):

| Section | Area                                                          | Endpoints | Mock file(s)                              |
| ------- | ------------------------------------------------------------- | --------: | ----------------------------------------- |
| 7.1     | Learner: roadmap, modules, lessons, checks, Home summaries    |         0 | — (live, `learning/learner.routes.ts`)    |
| 7.2     | Employee Home cards                                           |         0 | — (live)                                  |
| 7.3     | First-day welcome                                             |         0 | — (live, `platform/employee.routes.ts`)   |
| 7.4     | Saved knowledge                                               |         0 | — (live, `platform/saved.routes.ts`)      |
| 7.5     | Personal settings: Context Bot preferences and data export    |         0 | — (live, `platform/employee.routes.ts`)   |
| 7.6     | Manager: team, member pages, check-ins, assigning, Home cards |         0 | — (live, `platform/team.routes.ts`)       |
| 7.7     | People directory                                              |         0 | —                                         |
| 7.8     | Contributions and the review queue                            |         7 | `contributions.ts` (review queue is live) |
| 7.9     | HR (People Ops): onboarding, probation, templates             |         0 | — (live, `platform/people-ops.routes.ts`) |
| 7.10    | Admin                                                         |         0 | — (live)                                  |
| 7.11    | Context Bot outside projects                                  |         0 | — (live, `ask/assistant.routes.ts`)       |
| 7.12    | Tutorials (Studio)                                            |         0 | — (live, `learning/tutorials.routes.ts`)  |
|         | **Total**                                                     |     **7** |                                           |

## 1. How the web app talks to the API

- **Paths.** The web app writes paths as `/v1/...` and sends them to `VITE_API_BASE_URL` (`/api`). In
  development Vite proxies `/api` to the API (`VITE_DEV_API_PROXY_TARGET`, default
  `http://localhost:3000`), which mounts everything under `/api/v1` (`apps/api/src/app.ts`).
- **Auth.** A Clerk bearer token on every request (`Authorization: Bearer …`). With
  `AUTH_MODE=development` the API needs none.
- **Every response is validated.** `apiRequest(path, { schema })` (`apps/web/src/lib/api-client.ts`)
  parses each response with the shared Zod schema from `@contextos/shared`. **Missing or renamed
  fields, wrong enums or wrong types make the request fail in the UI** (the card shows its error
  state). Extra fields are ignored. A 204 parses `undefined`.
- **Errors.** Non-2xx responses must use the API's envelope `{ error: { code, message, details?,
requestId? } }` (`ApiErrorResponseSchema`). The UI shows `message` to people, so write it for them
  ("Choose a recommendation."). The UI doesn't read `details`, so the API's own `{ issues }` shape is
  fine.
- **Requests.** JSON bodies. Every input schema in the contracts is `.strict()`: unknown keys are a 400.
  Query parameters with no value are left out.
- **Dates.** `YYYY-MM-DD` for dates, ISO 8601 for timestamps. "Today", "this week", "overdue" and
  "Day N of 90" need the person's time zone (`/v1/users/me` `preferences.timezone`).
- **IDs.** The mocked contracts accept any string id. Fixtures use slugs (`p-maya`, `m4`, `tpl-eng-ic`);
  real ids can be UUIDs.
- **Roles.** The UI reads the caller's role from `GET /v1/workspaces/current` (`owner`, `admin`,
  `manager`, `member`, `guest`) and hides navigation by role, but **the router has no route guards**.
  Every endpoint must enforce its own permissions (403, or 404 where existence is private).
- **Text shown as-is.** Some fields are sentences the UI prints verbatim (`note`, `detail`, `label`,
  `issue`, `next`, `insight`, `result`, `lastCheckin`, `checkinSummary`). Section 7 points them out.
  Either generate them on the server (localised), or propose structured fields and we change the
  contract together.

## 2. How the mock layer works

| Piece       | File                                                            | What it does                                                                                                                                                                                                                                      |
| ----------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Switch      | `apps/web/.env` → `VITE_MOCK_API=true`                          | Turns the mock layer on in development. Ignored by production builds.                                                                                                                                                                             |
| Start-up    | `apps/web/src/main.tsx` → `mocks/browser.ts`                    | Starts an MSW service worker before the app renders. Unmocked requests pass through to the API (`onUnhandledRequest: "bypass"`).                                                                                                                  |
| Registry    | `apps/web/src/mocks/endpoints.ts`                               | The list of all 27 mocked endpoints. Only endpoints the API doesn't serve belong here.                                                                                                                                                            |
| Helpers     | `apps/web/src/mocks/define.ts`                                  | `mockGet/mockPost/mockPatch/mockPut(descriptor)(resolver)`. Bodies are validated with the input schema (400 on failure); responses are parsed with the response schema, so a mock can't drift from its contract. `MockNotFoundError` answers 404. |
| Mock data   | `apps/web/src/mocks/*.ts`, `mocks/home/*.ts`, `mocks/fixtures/` | Fixtures and in-memory state (writes last for the browser session). Dates are relative to today.                                                                                                                                                  |
| Contracts   | `packages/shared/src/schemas/*.ts`                              | The request and response schemas you implement.                                                                                                                                                                                                   |
| Descriptors | `apps/web/src/features/*/api/*.api.ts`                          | Each endpoint's `path`, `schema` and `input`, used by both the screens and the mocks.                                                                                                                                                             |
| Marker      | `components/preview-data-chip.tsx`, `lib/preview-data.ts`       | Cards built on a mocked endpoint show a **"Preview data"** chip. It disappears by itself once the endpoint isn't mocked.                                                                                                                          |
| Header      | every mock response                                             | `X-ContextOS-Mock: 1`.                                                                                                                                                                                                                            |
| Console     | browser dev tools                                               | `[mocks] 27 endpoints answered with preview data: [...]` lists exactly what never reached the API.                                                                                                                                                |
| Tests       | `apps/web/src/test/msw.ts`, `mocks/endpoints.test.ts`           | Tests use the same mocks under Node (`setupMockApi()`), with `onUnhandledRequest: "error"`. `endpoints.test.ts` checks every mock against its schema.                                                                                             |

Mocks that share state (so they must be retired together, see 3.3):

- `team.ts` imports `learnerSnapshot` from `learning.ts` (a learner's progress shows on the manager's
  screens) and `submitProbationRecommendation` from `people-ops.ts` (a manager's probation check-in
  reaches HR).
- `home/people-ops.ts` imports its counts from `people-ops.ts`.
- `assistant.ts` imports `profileByFirstName` from `people.ts` and `probationByFirstName` from
  `people-ops.ts` (Context Bot answers about people and probation).
- No app code imports from `mocks/`; only `test/msw.ts` does (the `reset*Mocks()` calls).

## 3. How to switch the mocks off

### 3.1 All at once

Set `VITE_MOCK_API=false` (or remove it) in `apps/web/.env` and restart the web dev server. Every
request then goes to the API, so the screens on the 27 endpoints show error states until those
endpoints exist. That's the same as production today. Use it to check which screens are fully real.

### 3.2 One endpoint at a time (the normal way)

Mocked requests never reach the API: MSW answers them in the browser. **To see your real endpoint in
the app, delete its mock.**

1. **Build the endpoint** in `apps/api` so it returns exactly the contract in Appendix A. Parse your
   output with the shared schema in an API test (`XSchema.parse(body)`) and add a request to the Bruno
   collection (`bruno/contextos-api/`).
2. **Delete the mock.** Remove its `mockGet(...)`/`mockPost(...)` entry from the mock file's array
   (`apps/web/src/mocks/<file>.ts`). If the array becomes empty, delete the file, remove it from
   `mocks/endpoints.ts`, and remove its `reset…Mocks()` call from `src/test/msw.ts`. Mind the shared
   helpers in section 2: keep a helper (or move it into the mock that still needs it) until every
   mock using it is gone.
3. **Fix the endpoint test list.** Remove its entry from the `EXAMPLE` map in
   `apps/web/src/mocks/endpoints.test.ts` if it has one.
4. **Move fixtures into the screen's tests.** Web tests fail on any request without a handler. For each
   failing test, serve the data inside the test:
   `mockServer.use(http.get(buildApiUrl("/v1/…"), () => HttpResponse.json(fixture)))`
   (see `features/ask/components/assistant-workspace.test.tsx`, which does this for `/v1/users/me`).
5. **Check in the browser.** Run `pnpm dev` (API and web). The card's "Preview data" chip is gone, the
   `[mocks] N endpoints…` count in the console dropped, and the response has no `X-ContextOS-Mock`
   header.
6. **Run the checks.** `pnpm check` (lint, typecheck, tests, build).
7. **Update the docs.** Mark the row Live in `docs/api-change-requests.md` ("Screen status") and in
   Appendix A here. Section 7 lists small frontend follow-ups for some endpoints (for example dropping
   a fallback); tell the frontend when one ships.

### 3.3 Retire mocks by group

Mocks in one group share data, so a half-real group shows inconsistent numbers (for example a real
check-in that never reaches the mocked HR review). Ship a group together when you can:

| Group | Mocks                                        | Ship with                                | Why                                                                                                 |
| ----- | -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A     | `account.ts` (7.5)                           | —                                        | Independent.                                                                                        |
| B     | `saved.ts` (7.4)                             | —                                        | Independent.                                                                                        |
| C     | `welcome.ts` (7.3)                           | the roadmap (7.1)                        | The welcome shows the roadmap's stages.                                                             |
| D     | `learning.ts`, `home/employee.ts` (7.1, 7.2) | the manager's team (7.6)                 | `team.ts` reads the learner's progress. If 7.1 ships first, keep `learnerSnapshot` until 7.6 ships. |
| E     | `team.ts`, `home/manager.ts` (7.6)           | HR (7.9)                                 | The probation check-in feeds the HR review.                                                         |
| F     | `people-ops.ts`, `home/people-ops.ts` (7.9)  | the manager's team (7.6)                 | As above; Context Bot also reads probation data.                                                    |
| G     | `people.ts` (7.7)                            | —                                        | Keep `profileByFirstName` until Context Bot (7.11) ships.                                           |
| H     | `contributions.ts` (7.8)                     | —                                        | The review queue is visible today; the rest is hidden for the demo.                                 |
| I     | `admin.ts`, `home/admin.ts` (7.10)           | —                                        | One admin store; the admin Home cards read it.                                                      |
| J     | `assistant.ts` (7.11)                        | after G and F, or move their two helpers | It imports from `people.ts` and `people-ops.ts`.                                                    |

## 4. What already works

The web app already runs on these live areas (full list in Appendix B): projects, the project hub,
sources and jobs, context items and verification, project Ask and Ask threads, flags and project
feedback, notifications and notification preferences, companion preferences, the Google Drive
connector, members, roles and invites, departments and teams, workspace setup, `GET /v1/users/me`
and `GET /v1/workspaces/current`, and the audit log.

## 5. Changes needed on live endpoints

1. **Project category** (backlog item 1). Add `category` (`company|product|project|process`, default
   `project`) to `projects`, make it required in `ProjectSchema` and accepted on create and update.
   Today every project counts as "Projects" in the Knowledge Hub filters.
2. **Audit log order and filters** (item 5). `GET /v1/audit` returns oldest first; the web app fetches
   100 and sorts on the client. Sort newest first (or `order=desc`) and add `since`, `category` and
   `q` so the Audit log page's filters are exact.
3. **More fields on `GET /v1/users` items** (item 11): `email`, `team`, `lastActiveAt`, `invitedAt`
   (optional in `WorkspaceMemberSchema` until then).
4. **One context item** (item 12): `GET /v1/projects/:projectId/context-items/:itemId`, so the item page
   doesn't load the whole list.
5. **HR flag on `GET /v1/workspaces/current`** (item 4), once the HR role is decided (section 6).
6. **Workspace-wide context items** (item 2, optional, for scale):
   `GET /v1/context-items?kind=&q=&limit=&cursor=` across every readable project, newest first. Today
   the Knowledge Hub calls the per-project list once per project.
7. **Bruno wait** (item 3): `03 Sources/05 Wait for Processing` gives up after 30 s; Gemini on a cold
   start often needs longer. Allow about two minutes.
8. **Probation permissions.** `/v1/probation/employees/:userId/outcome` and `POST /v1/probation/plans`
   are manager-only; in the designed flow HR decides (section 7.9). Change the policy or route HR
   decisions through the new endpoint only.
9. **Connector ids and model.** The live connector list is per user, uses `google_drive` and statuses
   `connected|needs_reauth|revoked`; the admin catalog (7.10) is workspace-wide and uses
   `google-drive` (the web app's logos are keyed by the hyphenated ids). Settle one id format and how
   per-user connections relate to the workspace catalog.
10. **Role changes reused.** Approving a role request (7.10) must follow the existing
    `PATCH /v1/users/:id` rules (only an owner grants owner; the last owner is protected) and write
    the same `user.update` audit entry.

## 6. Decisions to make before building

1. **How HR is represented** (item 4): a `people_ops` system role, or a workspace-scoped assignment
   (fits the `assignments` table and `identity.hasAssignment`). Blocks all of 7.9.
2. **One onboarding record per person.** Today the learner, manager and HR mocks each keep their own
   copy of a person's onboarding (stage, progress, buddy, template, dates) and disagree in places
   (probation date, progress). The real backend needs one record all three read, with one probation
   date.
3. **The learning model.** The screens use stages → modules → lessons (typed content blocks) → one
   knowledge check per module, from versioned templates. The existing `/v1/learning/*` routes store
   flat, project-scoped path items. Decide whether 7.1 is a view over learning paths or a new model,
   and settle the quiz rules (absolute pass mark and unlimited retakes in the UI vs 70 % and a
   10-minute lockout in the API) and sign-off for practical work.
4. **Profile fields.** Skills, bio, preferred name and pronouns have no storage (title, location, time
   zone and start date are in `memberships.organization`). The People directory and the welcome need
   them.
5. **People partner.** Shown on Home, the welcome, member pages and HR records; nothing models it.
6. **Access policy groups.** Policies target groups like "finance-leads"; the API has no group entity
   (only teams and departments). Identity-provider groups? And policies must apply to search, project
   Ask and Context Bot, not only the admin preview.
7. **Connector authorization.** The admin wizard's `authorize` contract returns an account at once;
   real OAuth redirects. Pick a flow (redirect plus status poll, or a popup) and we update the wizard.
8. **Where check-ins come from** (`GET /v1/team/checkins`): a calendar, or a cadence on the plan.
   _Decided for now:_ a cadence on the plan (weekly 1:1s, then the 30-day, 60-day and probation
   check-ins); a calendar can replace it later.
9. **Server-written text vs structured fields** (section 1), and localisation.
10. **Team vocabulary.** Mocks use three different team lists; use `/v1/org/teams` everywhere.
11. ~~Empty states for people without a plan.~~ _Decided:_ `GET /v1/me/roadmap` and
    `GET /v1/me/onboarding` answer 404; the roadmap page and Home then point to My learning.

## 7. Endpoint reference

Each endpoint: what it returns, the rules to implement, what else changes after a write, errors,
who may call it, the screens that use it, existing API code to reuse, and the mock's shortcuts that
shouldn't be copied. Counts per area are in section 0; the one-line list is Appendix A.

### 7.1 The learner: roadmap, modules, lessons, knowledge checks, Home summaries

Mock file: `apps/web/src/mocks/learning.ts` (12 endpoints, including the two Home summaries that share its
state). Contracts: `packages/shared/src/schemas/learning.ts`, `home.ts`, `manager.ts` (My learning).
Backlog: item 7. All endpoints are **for the caller only**.

**Live.** Served by `apps/api/src/modules/learning/learner.routes.ts` (tests:
`learning/tutorials.test.ts`); the mocks are test fixtures (`apps/web/src/test/learning-mocks.ts`).

- **One model.** The roadmap is the `roadmap` record HR and the manager use (7.6, 7.9). A module's
  content is a published tutorial (7.12): one assigned directly (`tutorial-<id>`), or the tutorial a
  curator marked as teaching a template module (`mod-…`). A template module nobody has written a
  tutorial for shows one honest "talk it through with your buddy, then mark it done" step; learning
  path modules show their items. Completing modules updates the roadmap record, so status, progress
  and the manager's and HR's views follow the learner.
- **Ids.** Module ids are roadmap module ids, or `tutorial-<id>` for tutorials taken in My learning.
  Lessons are `<moduleId>~<lessonId>`; a module's check is `<moduleId>~check`.
- **Lessons** are one `markdown` block (a new `LessonBlock` type; GitHub-flavoured Markdown, rendered
  without raw HTML). Lessons built on sources the learner can't open show as restricted, and check
  questions citing those sources are left out.
- **Rules.** Modules in a stage that hasn't opened are `locked` (unless someone assigned them). A
  module is done when every lesson is done and its check (if any) is passed; retakes are allowed.
  Progress is a `learning_progress` record per learner and module, pinned to the tutorial version
  they started (FR-LRN-012). Clarifications go to the tutorial's author; roadmap changes to the
  manager. `GET /v1/me/tasks` and `GET /v1/me/milestones` (7.2) are served here too.

The original handoff notes follow.

**The model the screens assume.** A person has one roadmap built from an onboarding template:
4 **stages** (Foundations wk 1–2, Product & systems 3–4, Team practice 5–8, Ownership 9–12), each with
**modules**; a module has **lessons** and at most one **knowledge check** (the check's id doubles as
its lesson id, `<moduleId>-check`). A plan lasts 90 days. The existing `/v1/learning/*` routes store
flat path items (read, watch, quiz…) per project, with no stages, lessons or lesson blocks, so these
endpoints are new views over that data or a new model. Differences to settle:

- Quiz rules: the API needs a "start" call, grades at ≥ 70 % and blocks retakes for 10 minutes after
  two attempts; the screens use an absolute pass mark ("4 of 5") and say "Retake as often as you like".
- The API requires sign-off for required items; the mock lets learners complete practical lessons.
- API ids are UUIDs; the fixtures use slugs (`m4`, `m4-l3`, `m4-check`), which some web tests use.

**How values are computed** (implement on the server):

- Module progress = 1 when done, else done lessons ÷ lessons (a check counts as a lesson).
- Overall progress = (done modules + progress of active non-practical modules) ÷ all modules.
- Stage state: `done` (all modules done), `current` (started), `next` (first future stage), `later`.
- Next module: in the current stage, the first active non-practical module, else the first to-do.
- Resume target: the first unfinished lesson (or the check), else the module.
- Finishing a module: `done`, `completedOn` today, result kept, all lessons done, a history entry,
  and the next to-do module in the stage becomes active. **Unlock the next stage** by date or when the
  previous one finishes (the mock never does).
- `status` and `expected` (where the plan expects the person today, about day ÷ 90) must be real
  calculations; the mock always answers `on_track` and 0.12.

**Cross-effects.** Completing a lesson or passing a check changes the roadmap, the module, the lesson,
Home's "Up next" and "Your onboarding", and the manager's views of that person (`/v1/team/onboarding`,
`/v1/team/members/:id`, `/v1/team/check-matrix`). The web app refetches all learning and Home data
after these writes. A manager's roadmap edits and assignments (section 7.6) must show up here too.

#### `GET /v1/me/roadmap`

- **Returns** `MyRoadmapSchema`: `template {name, version}`, `adjustedBy` (manager who adjusted it),
  `team`, `startDate`, `totalDays` (90), `status`, `expected`, `progress`, `checks {done, total}`,
  `stages[]` (`id, name, weekStart, weekEnd, startsOn, endsOn, state, goal, modules[]`; each module
  `id, number, title, kind, status, summary, lessonCount, minutes|duration, progress, dueOn,
completedOn, result, note, owner`), `probationReviewOn`, `buddy`, `history[]` newest first.
- **UI:** `/roadmap`; the first-day welcome uses `stages` and `probationReviewOn`; the request
  dialogs use `adjustedBy` as "your manager" (add a real `manager` field, `adjustedBy` can be null).
- **Decide:** the response when the caller has no plan (the schema has no empty form; 404 or an
  empty roadmap).
- **Reuse:** path assignment and version; `onboarding_plan` (`startDate`, `lengthDays`, `endDate`,
  `mentorId` = buddy).

#### `GET /v1/me/modules/:id`

- **Returns** `ModuleDetailSchema`: `id, number, title, kind, status, stage {id, name, moduleCount,
opensOn}, objective, objectives[], minutes, duration, owner, updatedAt, reviewedBy, progress,
completedOn, result, lessons[] {id, number, title, type, minutes, questionCount, done}, sources[]
{id, title, label, origin, owner, updatedAt, restrictedTo, url}, people[] {person, role},
suggestedQuestion, rating` (the caller's).
- **Rules:** a locked module is returned (200) with no lessons and `opensOn`. Sources the caller
  can't open carry `restrictedTo` ("Finance only"); the UI offers "Request access" for them (no
  endpoint yet, section 8).
- **Errors:** 404 "Module not found".
- **UI:** `/roadmap/modules/:moduleId`.

#### `GET /v1/me/lessons/:id`

- **Returns** `LessonSchema`: `id, number, title, type, minutes, done, module {id, number, title,
kind, progress}, stage {id, name}, outline[]` (the module's lessons), `basedOn[]` ("ADR-042"),
  `reviewedBy, reviewedOn, blocks[], rating`.
- **Blocks** are typed content: lede, heading, paragraph, list, flow, decision, milestones, media,
  check (the inline practice question includes its answer; it isn't graded). Text may use `**bold**`
  and `` `code` ``. Generated lessons should produce these blocks.
- **Errors:** 404 for unknown ids, **for check ids** (checks have their own endpoint) and for
  lessons in locked modules.
- **UI:** `/roadmap/lessons/:lessonId`.

#### `POST /v1/me/lessons/:id/complete`

- **Body** `LessonCompletionInputSchema` (`{}`). **Returns** `LessonCompletionSchema {moduleProgress,
next}` (`next` = the resume target, null when the module just finished).
- **Rules:** mark done; a to-do module becomes active; when every lesson is done, finish the module.
  **Be idempotent** (the mock re-runs "finish" on a done module, duplicating history and wiping the
  result). **Reject check ids** (the mock lets this complete a module without passing). Practical
  lessons should go through sign-off.
- **UI:** "Mark complete" on the lesson page, then it opens `next`.
- **Reuse:** `/v1/learning/assignments/:a/items/:i/{start,dwell,attest,signoff/request}`.

#### `GET /v1/me/checks/:id`

- **Returns** `KnowledgeCheckSchema`: `id, module {id, number, title}, stage {id, name}, passMark,
questions[] {id, prompt, options[{id, text}]}`, **never the answers**.
- **Errors:** 404 "Knowledge check not found".
- **Decide:** gating (locked module, unfinished lessons) and retakes on a done module.
- **UI:** `/roadmap/checks/:checkId`; Context Bot pauses while it is open.

#### `POST /v1/me/checks/:id/attempts`

- **Body** `CheckAttemptInputSchema` `{answers: [{questionId, optionId}]}` (min 1).
- **Returns** `CheckResultSchema`: `score, total, passMark, passed, review[] {questionId,
chosenOptionId, correctOptionId, explanation, source}`, `progress` (stage modules done, overall
  before/after, checks passed/total; only when a pass changed something), `nextModule`.
- **Rules:** grade on the server; unanswered = wrong. On a first pass: count the check, history
  "Knowledge check: <module>" with "Passed, S of T", finish the module with "Passed S of T", activate
  the next module. A fail stores nothing in the mock (store attempts for the owner's insight).
- **UI:** submit on the check page; results screen.
- **Reuse:** `POST /v1/learning/assignments/:a/items/:i/quiz/submit` (explanations keyed by `claimId`,
  not a source string).

#### `POST /v1/me/learning-ratings`

- **Body** `LearningRatingInputSchema` `{targetType module|lesson, targetId, value up|down|null}`
  (null clears). **Returns** `{value}`.
- **Rules:** one rating per caller per target; validate the target. The UI says "The owner sees your
  rating", so owners need an aggregate somewhere (not built).
- **UI:** thumbs on module and lesson pages.

#### `POST /v1/me/learning-requests` (201)

- **Body** `LearningRequestInputSchema`: `type clarification|roadmap_change`, `moduleId|null`,
  `lessonId|null`, `changeKind due_date|swap_module|add_topic|null`, `message` (1–2000).
- **Returns** `{id, recipient}`.
- **Rules:** a roadmap change goes to the caller's manager (`memberships.managerId`); a clarification
  goes to the module owner. Create a notification or inbox item. The mock stores and sends nothing.
- **UI:** "Request a change" (roadmap) and "Request clarification" (roadmap, module). The toast says
  replies show in Contributions, which is hidden for the demo.

#### `GET /v1/me/next-up` (Home)

- **Returns** `NextUpResponseSchema {item|null}`: `assignmentId, moduleId, stageName, moduleIndex,
moduleCount, title, summary, lessons[] {id, title, type, state done|current|todo}, resume,
progress, minutesLeft, owner, updatedAt, sourceCount, suggestedQuestion`.
- **Rules:** the next module (above). Should move to the next stage when one finishes (the mock
  returns null after Foundations), and offer modules assigned early.
- **UI:** employee Home hero card and the Ask band's prompt.

#### `GET /v1/me/onboarding` (Home)

- **Returns** `MyOnboardingSchema`: `startDate, totalDays, status, progress, expected, modules {done,
total}, checks {done, total}, tasks {done, total}, stages[] {id, name, weekStart, weekEnd, state,
startsOn, modules {done, total}, progress}`.
- **Rules:** same numbers as the roadmap. `tasks` must agree with `/v1/me/tasks` (the mock hard-codes
  5 of 14). Home shows pace as progress vs expected (± 0.02).
- **UI:** employee Home "Your onboarding" card and page header.
- **Reuse:** `/v1/probation/my-plan`, assignment progress.

#### `GET /v1/me/learning`

- **Returns** `MyLearningSchema`: `onboardingFinishedOn, assigned[] {id, title, kind, reason, dueOn,
lessonCount, lessonsDone, minutes}, suggested[] {id, title, kind, reason, minutes}, completed[]`.
- **Who:** people past onboarding (the manager rail links it today).
- **UI:** `/learning` ("My learning"). "Start" and "Resume" have no endpoint yet (coming soon).
- **Live** (`apps/api/src/modules/platform/manager.routes.ts`): `assigned` = the caller's learning path
  assignments, `suggested` = published paths they can read and aren't on, `completed` = finished
  assignments. `POST /v1/me/learning/:id/add` self-enrols (audit `path.enrol`).

#### `POST /v1/me/learning/:id/add`

- **Body** `{}`. **Returns** the whole `MyLearningSchema`.
- **Rules:** move a suggested course into `assigned` (reason "Added by you"). 404 unknown; 409 if it
  is already assigned.

### 7.2 Employee Home cards

Mock file: `apps/web/src/mocks/home/employee.ts` (5 endpoints, all static). Contract: `home.ts`.
Caller only. UI: `features/home/components/employee-home.tsx`.

**Live.** Tasks and milestones: `learning/learner.routes.ts` (modules due this week or overdue;
stage ends, the 30-day check-in, the 60-day readiness review and the probation review). Knowledge
updates, team activity and people: `platform/employee.routes.ts` (tests: `employee.test.ts`).
Knowledge updates are items changed in the last 14 days that the caller can open; people are the
manager, buddy, People partner (`peoplePartnerId` on the HR record), mentors and up to three domain
owners. Fixtures for tests: `apps/web/src/test/employee-mocks.ts` and `learning-mocks.ts`.

#### `GET /v1/me/tasks?from=&to=`

- **Returns** `MyTasksSchema`: `from, to, items[] {id, kind check|practical|reading|meeting, title,
details[], dueAt, state open|done, inProgress, completedAt, target}`; `target` (module, lesson or
  check) is what the task button opens.
- **Rules:** default window this week. A task linked to a lesson or check must close when the learner
  completes it (the mock never changes). "Overdue" = open and past due (computed in the UI).
- **Reuse:** path item `dueOffsetDays` and progress; probation check-ins for meetings.

#### `GET /v1/me/milestones`

- **Returns** `MilestoneListSchema` soonest first: `id, kind checkin|stage|review|readiness|probation,
title, detail, dueOn, state done|soon|later`.
- **Rules:** the probation date must match the roadmap and HR (the fixtures differ by a day).
- **Reuse:** `onboarding_plan.data.milestones`, `/v1/probation/my-plan`.

#### `GET /v1/me/knowledge-updates`

- **Returns** `KnowledgeUpdateListSchema` newest first: `id, title, origin, author, updatedAt, tag,
reason` (why this person sees it), `restrictedTo, projectId, itemId`.
- **Rules:** changes since the last visit, relevant to the person. The UI links to `/projects/:id`
  when `projectId` is set; it should open the item when `itemId` is set (we'll add that link).
- **Reuse:** context items and evidence, `source_objects`.

#### `GET /v1/me/team-activity`

- **Returns** `TeamActivityFeedSchema {team, items[] {id, kind release|schedule|joiner|event|update,
text, actor, where, at}}`.
- **Status:** the card is **hidden for the demo** (`HIDDEN.homeTeamUpdates`), so nothing calls this
  today. Nothing in the API produces this content yet (releases, Slack).

#### `GET /v1/me/people`

- **Returns** `MyPeopleSchema items[] {person, relation manager|buddy|expert|people_partner|mentor, note}`.
- **Rules:** manager from `memberships.managerId`, buddy from the `mentor` assignment, experts from
  `domain_owner`. **Nothing models the people partner yet.** Use one source for manager, buddy and
  people partner across this, the welcome and the roadmap.

### 7.3 First-day welcome

Mock file: `apps/web/src/mocks/welcome.ts`. Contract: `welcome.ts`. Backlog: item 14. Caller only.

**Live** (`platform/employee.routes.ts`). The profile is stored in `users.preferences.profile`
(location also in `memberships.organization.location`); `reminders` is the onboarding category of
`/v1/notifications/preferences`, so there is one switch. `known` topics are stored but don't make
roadmap modules optional yet.

#### `GET /v1/me/welcome`

- **Returns** `WelcomeSchema`: `firstDay, title, team, people[] {person, relation, detail}` (manager,
  buddy, people partner and how each helps), `profile {preferredName, pronouns, location, known[],
reminders}`, `knownOptions[]`, `expectations[]`, `support[]`, `completedAt`.
- **UI:** `/welcome` (full screen); employee Home shows a welcome banner until `completedAt` is set.
- **Reuse:** `users.name`, `memberships.organization`, `onboarding_plan`.

#### `POST /v1/me/welcome`

- **Body** `WelcomeInputSchema` (all required): `preferredName` (1–100), `pronouns` (≤40), `location`
  (≤100), `known[]` (≤20 × ≤60), `reminders slack|email|both`.
- **Returns** the full `WelcomeSchema` with `completedAt` set.
- **Rules:** save the profile; known topics mark matching modules optional (**the roadmap schema has no
  "optional" flag yet**, so add one); preferred name, pronouns and location show in People;
  `reminders` overlaps `/v1/notifications/preferences` (keep one).
- **Note:** "Skip for now" doesn't call the API today; the contract says skip also sets `completedAt`.

### 7.4 Saved knowledge

Live: `apps/api/src/modules/platform/saved.routes.ts` serves both endpoints (personal records, filtered by
what the caller can still open; a project slug is accepted). Contract: `saved.ts`. Backlog: item 12.

#### `GET /v1/me/saved`

- **Returns** `SavedListSchema items[] {targetType context_item|project, targetId, projectId, savedAt}`
  newest first. Titles come from the items, so drop entries the caller can no longer access.
- **UI:** "Saved" on the Knowledge Hub; the Save button on knowledge item pages.

#### `PUT /v1/me/saved/:targetId`

- **Body** `SaveInputSchema` `{targetType, projectId, saved}`.
- **Returns** the saved entry, or JSON `null` when `saved` is false.
- **Rules:** idempotent; saving again moves it to the top. **Check the target exists and the caller
  can access the project.** Key by `(targetType, targetId)`.
- **Also wanted (item 12):** `GET /v1/projects/:projectId/context-items/:itemId`, so the item page
  doesn't load the whole list.

### 7.5 Personal settings: Context Bot, connected apps, your data

Mock file: `apps/web/src/mocks/account.ts` (3 endpoints). Contract: `account.ts`. Backlog: item 15.
Caller only. UI: Settings → Preferences (Context Bot card) and Security (Connected apps, Your data).

**Live** (`platform/employee.routes.ts`). Preferences live in `users.preferences.assistant`. The data
export is built at once (profile, Ask history, shared check-ins, proposals, gaps, flags, saved items;
answers drawing on sources the person can no longer open are withheld), kept 7 days, and announced
in-app and by email with a link to `GET /v1/me/data-export/:id` (owner only). Without an email
address it answers 409.

Connected apps are live through `GET /v1/connectors` and
`DELETE /v1/connectors/:id?mode=keep_derived`. The adapter presents connector connections in the
personal settings card without inventing a second token-revocation API.

#### `GET /v1/me/assistant-preferences` and `PATCH /v1/me/assistant-preferences`

- **Returns** `AssistantPreferencesSchema {openBesideLessons, showSuggestions}` (both default true).
  PATCH takes either field (strict partial) and returns the whole object.
- **Effects:** `showSuggestions` false hides suggested questions in the panel; `openBesideLessons`
  opens Context Bot beside lessons on large screens.
- **Reuse:** `users.preferences` JSON (beside the existing `companion` preferences).

#### `POST /v1/me/data-export`

- **Body** `{}`. **Returns** `DataExportResultSchema {email, readyBy}`.
- **Rules:** queue a job that emails a download link with the profile, contributions, check-in notes
  shared with the person and Context Bot history. 202 fits better than 200. `users.email` can be null
  while the schema requires a string: decide what to answer then.

### 7.6 The manager: team, member pages, check-ins, assigning, Home cards

Mock files: `apps/web/src/mocks/team.ts` (9), `apps/web/src/mocks/home/manager.ts` (4).
Contracts: `packages/shared/src/schemas/manager.ts`, `home.ts`, `contributions.ts` (gaps). Backlog: item 9.

**Live.** Served by `apps/api/src/modules/platform/team.routes.ts` (roster, member pages, roadmap
edits, check-ins, assigning, attention, upcoming check-ins, escalations) and `manager.routes.ts`
(`/v1/team/knowledge`, `/v1/team/knowledge-gaps`, plus My learning in 7.1 and the review queue in 7.8).
Tests: `team.test.ts`, including one that parses every response with the shared schemas. The mocks
stay as fixtures for the manager screen tests (`apps/web/src/test/manager-mocks.ts`) and are no longer
in the development mock layer. What was decided:

- **Scope.** The caller's direct reports, or their whole reporting line when the workspace turns on
  `includeIndirectReports`. Without reports the team endpoints answer 403 "Team views are for
  managers" (admins and owners included: admin rights grant no people data); anyone else's member
  page is 404. People Ops (`hr`) may read member pages but not write.
- **One onboarding record.** The HR `hr_onboarding` record plus one `roadmap` record per person
  (`onboarding-roadmap.ts`), built from the HR template when one is assigned and pinned to that
  template version. Assigning a roadmap here sets HR's template, buddy and setup checklist; the buddy
  gets mentor access until 14 days after the probation review. Check-ins are children of the HR record;
  a probation check-in writes HR's recommendation (`ready_for_approval` or `needs_hr_review`). An
  off-track pulse at the last check-in makes the person at best `at_risk`.
- **Upcoming check-ins** follow the plan (decision 8): weekly 1:1s, then the 30-day, 60-day readiness
  and probation check-ins.
- **Knowledge gaps.** Unanswered Ask questions from the team in the last 30 days appear only once
  `askKAnonymityThreshold` different people asked them (Ask history is private); gaps people reported
  always appear; so do open stale or conflicting flags the team raised, with a `target` so "Review
  sources" opens the page and "Request update" adds the manager to the flag (`POST /v1/flags`).
- **Escalate** (`POST /v1/team/members/:id/escalations`, body `{}`, returns `EscalationSchema {id, to
admins|people_ops}`): waiting on access goes to the workspace admins, anything else to People Ops.
  Once a day per person (a repeat returns the first with 200). Audit `onboarding.escalate`.
- **Weekly digest.** On Mondays, when AI settings' weekly digest is on, each manager gets one
  notification with how many of their team's questions had no good answer (counts only).
- **Not yet.** Learner-side completion (lessons, check attempts, 7.1) is still mocked, so built-in
  modules don't progress from the learner's side. Modules backed by a learning path (`path-<id>`) take
  their state from the person's path assignment.

The original handoff notes follow.

**Who:** the caller's own direct reports (`memberships.managerId`), plus HR for member pages. The mock
always answers for Daniel's team (Leah, Chloe, Jonah, Maya, Arjun) and checks nothing.

**One onboarding model, please.** Today the manager mock, the HR mock and the learning mock each
keep their own copy of a person's onboarding (stage, progress, buddy, template). Only two links exist:
Maya's learning progress feeds the manager views, and a probation check-in feeds HR. Assigning a
roadmap or buddy here doesn't update the HR record, and HR edits don't reach the team view. The real
backend should have one onboarding record per person that all three read.

**Status rules to design** (the mock's values are static): `expected` ≈ day ÷ 90; `at_risk` = behind
plan, overdue modules or failed checks; `blocked` = an access blocker; `needs_setup` = no roadmap or
buddy before the start date; `ready` = starting soon and fully set up. Readiness review ≈ start + 60
days, probation review = start + 90. The UI assumes "Day X of 90".

**Server-written text.** `next` ("Week 2 check-in · Fri"), `issues`, `detail`, `label`, `result` and
the Context Bot `insight` are shown verbatim, so write them for people (and localise them).

#### `GET /v1/team/onboarding`

- **Returns** `TeamOnboardingSchema`: `team {id, name}` (required even when empty), `people[] {person,
startDate, stage` (null = "Pre-boarding"), `progress, expected, status, next, issue}`.
- **Rules:** `next` = "Assign a roadmap" when `needs_setup`, else the next upcoming item with weekday;
  `issue` = the most important problem.
- **Changes after:** assigning a roadmap (Jonah becomes `not_started`), a probation check-in (clears
  that issue), the learner's progress.
- **UI:** manager Home roster and header count; `/team` cards and status strip; the check-in person
  switcher; the person picker in assign dialogs.
- **Reuse:** `GET /v1/probation/team`, `memberships.organization.startDate/teamId`, `/v1/org/teams`.

#### `GET /v1/team/check-matrix`

- **Returns** `CheckMatrixSchema`: `topics[]` (columns), `rows[] {person, cells[]}` aligned with
  `topics`; cells `pass|fail|todo|na` (na = not in plan).
- **Rules:** the latest knowledge-check result per topic for each person onboarding (people who
  haven't started are left out).
- **UI:** "Knowledge checks" matrix on `/team`.
- **Reuse:** quiz attempts in `/v1/learning/assignments/:a/items/:i/quiz`.

#### `GET /v1/team/members/:id`

- **Returns** `TeamMemberDetailSchema`: `person, startDate, stage, status, progress, expected, buddy,
peoplePartner, readinessReviewOn, probationReviewOn, issues[]` (most important first),
  `insight {text, action kind assign_learning|escalate|start_recommendation|assign_roadmap}`,
  `modules[]` (current stage; `id, title, state done|active|todo|overdue|blocked, dueOn, completedOn,
note, postponed`; empty until a roadmap exists), `checks[]`, `upcoming[]`, `checkins[]` newest first.
- **Errors:** 404 "Team member not found".
- **Who:** the person's manager and HR only.
- **UI:** `/team/:personId`; the check-in page's evidence panel.
- **Reuse:** `/v1/probation/employees/:userId` (and `/summary`, `/checkins`),
  `/v1/learning/assignments/:id/progress`, `mentor` assignment. `insight` needs a generator (rules or LLM).

#### `PATCH /v1/team/members/:id/roadmap`

- **Body** `RoadmapEditInputSchema` `{changes: [{moduleId, action postpone_week|remove}]}` (min 1).
- **Returns** the full `TeamMemberDetailSchema`.
- **Rules:** `remove` drops the module; `postpone_week` moves `dueOn` +7 days and sets `postponed`
  (an overdue module whose new date is today or later becomes `todo`). Done modules can't change.
  **The change must reach the learner's own roadmap and tasks** (`/v1/me/roadmap`, `/v1/me/tasks`),
  and recompute status and issues. Notify the person (the UI says "{name} will be notified").
- **Errors:** 404 member; 400 unknown module ids (the mock ignores them).
- **UI:** "Edit roadmap" on the member page.

#### `GET /v1/team/members/:id/checkin-prep?type=`

- **Query:** `type weekly|day_30|readiness_60|probation` (always sent; the mock ignores it).
- **Returns** `CheckinPrepSchema {agenda[], areas[] {id, label, evidence}}`.
- **Rules:** areas are always `products`, `systems`, `practices`, `delivery`, and **must match the HR
  rating areas** (ratings are keyed by these ids). Build agenda and evidence from progress, checks and
  past check-ins; tailor by `type`.
- **UI:** `/team/:personId/check-in` (areas show only for non-weekly types).

#### `POST /v1/team/members/:id/checkins` (201)

- **Body** `CheckinInputSchema`: `type`, `pulse on_track|concerns|off_track`, `agendaCovered[]`,
  `ratings` (area id → 0–3: Not yet, Developing, Meets, Exceeds), `blockers[]
access|expectations|workload|knowledge|mentor`, `notes` and `nextSteps` (≤5000 each),
  `recommendation confirm|extend|discuss|null` (**required for `probation`**: 400 "Choose a
  recommendation."), `shareWithPerson`.
- **Returns** `CheckinRecordSchema {id, type, on, pulse, note}`.
- **Rules:** store everything (the mock drops `agendaCovered`, `blockers`, `nextSteps`,
  `shareWithPerson` and non-probation ratings). Ratings go to People Ops only; notes and next steps go
  to the person when `shareWithPerson` is true. Pulse should feed status.
- **Probation check-in:** set the HR review's `recommendation`, `recommendedOn`, ratings, manager note,
  an activity entry, and state `ready_for_approval` (confirm) or `needs_hr_review` (extend, discuss);
  clear the "Probation recommendation due" issue (see section 7.9).
- **UI:** "Save check-in" / "Save and send recommendation".
- **Reuse:** `POST /v1/probation/employees/:userId/checkins` has a different shape (`wentWell`,
  `toImprove`, `supportNeeded`); `/v1/probation/checkins/:id/respond` lets the employee reply.

#### `GET /v1/team/members/:id/assign-options`

- **Returns** `AssignOptionsSchema`: `learning {reason|null, items[] {id, title, kind
module|practical|check, detail, suggested}}`, `roadmap {templates[] {id, name, version, moduleCount,
weeks, matchesRole}, addOns[] {id, label, suggested}, buddies[]}`.
- **Rules:** templates and buddies should come from the same source as HR's options (the mock
  hard-codes them and disagrees with HR's template data). Suggest learning from the person's gaps.
- **UI:** "Assign learning" and "Assign roadmap" dialogs (from Home, `/team` and the member page).

#### `POST /v1/team/members/:id/assignments` (201)

- **Body** `LearningAssignmentInputSchema` `{itemId, dueOn, note ≤2000}`. **Returns** `{id}`.
- **Rules:** add a task to the person's roadmap and tasks, keep the note, notify them. 400 for an
  unknown item or a past due date.

#### `POST /v1/team/members/:id/roadmap` (201)

- **Body** `RoadmapAssignmentInputSchema` `{templateId, addOnIds[], buddyId}`. **Returns** `{id}`.
- **Rules:** create the plan from the template plus add-ons, set the buddy, clear setup issues; update
  the HR onboarding record and the attention list. **409 if the person already has a roadmap**; 400
  for unknown template, add-on or buddy ids (the mock ignores them).
- **Reuse:** `POST /v1/probation/plans` (409 when a plan exists), `POST /v1/learning/paths/:id/assign`.

#### `GET /v1/team/attention`

- **Returns** `AttentionListSchema items[] {id, person, severity error|warning|info|neutral, label,
title, detail, actions[] {kind, label}}`, most urgent first. Action kinds: escalate, message,
  assign_learning, review_progress, assign_roadmap, start_recommendation.
- **Rules:** derive from member state: blocked, then at risk, then needs setup, then a probation
  recommendation due soon. Must update after the writes above (the mock is static).
- **UI:** manager Home "Needs your attention" and the header count. "Message" and "Escalate" are
  "coming soon" (section 8).

#### `GET /v1/team/checkins`

- **Returns** `CheckinListSchema items[] {id, person, title, at, note}` soonest first.
- **Rules:** upcoming check-ins (the contract mentions `?upcoming=true`; the UI sends nothing). **There
  is no way to schedule check-ins yet**; decide where they come from (calendar, or a plan cadence).
- **UI:** manager Home "Upcoming check-ins" (opens the weekly check-in; "Summarize X's progress" asks
  Context Bot).

#### `GET /v1/team/knowledge-gaps`

- **Returns** `KnowledgeGapListSchema` (same shape as `/v1/me/knowledge-gaps`): `id, question, reason
no_answer|conflict|stale, detail, askedCount, section, related[], suggestedKind`, most asked first.
- **Rules:** gaps from the manager's team this month, fed by `POST /v1/assistant/gaps` and unanswered
  questions. Use the same gap ids as the employee list. Close a gap when a contribution answers it.
- **UI:** manager Home "Knowledge gaps" ("Create article" opens the editor, hidden for the demo).

#### `GET /v1/team/knowledge`

- **Returns** `TeamKnowledgeSchema {owned, needsReview, awaitingYou, queue[] {id, title, kind, author,
submittedAt}}`.
- **Rules:** `awaitingYou` = the size of `/v1/me/reviews`, `queue` = the same items (the mock
  disagrees: 3 vs 2).
- **UI:** manager Home "Team knowledge" ("Review" opens `/reviews`).
- **Reuse:** `/v1/flags/queue`; `context_items` for `owned`.

### 7.7 People directory

The screen now adapts the live `GET /v1/users`, `GET /v1/users/me`, `GET /v1/org/teams` and
`GET /v1/people/:id` responses. Contract: `people.ts`. Backlog: item 8 is now limited to richer
profile fields and avoiding per-person profile requests for expertise.
**Who:** members and managers (and admins); **guests get 403**. The mock treats everyone as Maya.
Relations (`you`, `manager`, `buddy`, `report`) are relative to the caller.

**Where profile fields live.** Title, team, location and time zone are in
`memberships.organization`; **skills and bio have no storage yet**. Decide the user record or a
profile table synced from the identity provider. The welcome's preferred name, pronouns and location
should show here.

**Route order:** `/v1/people/experts` and `/v1/people/teams` must match before `/v1/people/:id`.

#### `GET /v1/people?q=&filter=`

- **Query:** `q` (name, title, team, skills), `filter all|team|experts|new` (always sent).
- **Returns** `PeopleDirectorySchema`: `total, teamCount` (workspace totals), `items[] {id, name,
title, team {id, name}|null, location, timeZone (IANA), joinedOn, skills[], expert, isNew,
relations[]}`.
- **Rules:** `team` = the caller's team; `experts` = expert flag; `new` = joined in the last 90 days
  or starting soon. Best match first (the mock keeps fixture order). Totals must be real counts (the
  mock hard-codes 412 and 18).
- **UI:** `/people` (debounced search synced to the URL).
- **Reuse:** `GET /v1/users`, `memberships.organization`, `GET /v1/users/:id/organization`.

#### `GET /v1/people/experts`

- **Returns** `ExpertListSchema items[] {topic, area, person}` (area picks the icon).
- **Rules:** from Knowledge Hub ownership (`domain_owner` assignments).
- **UI:** "Who to ask" on `/people`.

#### `GET /v1/people/teams`

- **Returns** `TeamDirectorySchema`: `myTeam {id, name, lead, members[]}|null`, `items[] {id, name,
area, size, focus, lead, members[]}` (`members` = a few people for the avatar stack).
- **Rules:** decide team membership vs reporting line for `myTeam.members` (the mock uses reporting
  line). `size` is a real count. Teams need `area`, `focus` and `lead`, which `/v1/org/teams` lacks.
- **UI:** `/people?view=teams`.

#### `GET /v1/people/:id`

- **Returns** `PersonProfileSchema`: the directory fields plus `bio, manager, reports[], owns[] {id,
title, section, projectId|null}`, `onboarding {startedOn, status}|null`.
- **Rules:** `onboarding` only when the caller is their manager or HR (the mock always returns null).
  `owns` links to `/projects/:projectId`, or the Knowledge Hub section when `projectId` is null.
- **Errors:** 404 "Person not found". Everyone who appears as a manager must resolve (the mock 404s
  for the CEO shown in reporting lines).
- **UI:** `/people/:personId`; "Ask Context Bot about X" uses this person.

### 7.8 Contributions and the review queue

Mock file: `apps/web/src/mocks/contributions.ts` (9). Contracts: `contributions.ts`, `manager.ts`
(reviews). Backlog: items 6 and 9.

**Demo status:** the Contributions page, the editor and Home's "Your contributions" are **hidden for
the Oct 18 demo** (`apps/web/src/lib/hidden.ts`); their routes go Home. **The review queue
(`/reviews`) is not hidden**, so the two review endpoints are in use.

**Missing endpoints:** there is no way to read or edit an existing contribution or its body. Drafts
can be saved but not reopened, and "Edit and resubmit" can't edit. Add `GET /v1/contributions/:id`
and `PATCH /v1/contributions/:id` (we'll wire them).

#### `GET /v1/me/contributions`

- **Returns** `ContributionListSchema` newest first: `id, kind article|edit|glossary_term|flag, title,
section, status draft|submitted|in_review|changes_requested|published|resolved|rejected,
visibility, reviewer, reviewNote, submittedAt, publishedAt, updatedAt, impact, comments[], gapId,
sourceCount`. Flags the caller raised appear as `kind: "flag"`.
- **UI:** `/contributions` (stat tiles, list), Home "Your contributions" (hidden).
- **Reuse:** `platform_records` kind `flag` and `correction`.

#### `GET /v1/me/knowledge-gaps`

- **Returns** `KnowledgeGapListSchema`: gaps the caller could fill, most asked first. A submitted
  contribution with a `gapId` closes the gap.
- **UI:** "Write it" / "Suggest a fix" on `/contributions`; the editor reads it to prefill from `?gap=`.

#### `GET /v1/sources/search?q=&limit=`

- **Returns** `SourcePickListSchema items[] {id, projectId, title, label, origin, owner, stale}`.
- **Rules:** sources **the caller can access**, across projects, best match first, at most `limit`
  (the mock returns all 6 regardless). `stale` = the connector is failing.
- **UI:** source picker in the editor.
- **Reuse:** `GET /v1/projects/:projectId/sources` (filtered by `visibleSourceIds`), `GET /v1/search`.

#### `GET /v1/contributions/reviewer?section=&title=`

- **Returns** `SuggestedReviewerSchema {reviewer, reason}`.
- **Rules:** the owner of the matching system or project (`domain_owner`); glossary terms go to the
  team that uses them most; otherwise the author's manager.

#### `POST /v1/contributions/draft`

- **Body** `ContributionDraftInputSchema` `{kind, title ≤200, sourceIds ≤10}` (empty = pick sources).
- **Returns** `ContributionDraftSchema {body (markdown), sources[]}`.
- **Rules:** Context Bot drafts from accessible sources (LLM). The mock returns one canned draft.

#### `POST /v1/contributions` (201)

- **Body** `ContributionInputSchema`: `kind, title ≤200, section, visibility, body ≤50k, sourceIds ≤20,
gapId|null, submit`. When `submit` is true the schema also requires a title (≥4 chars), at least 40
  words and a source (400 with those messages).
- **Returns** `ContributionSchema`.
- **Rules:** **store the body** (the mock drops it). On submit: assign the suggested reviewer, put it
  in the reviewer's `/v1/me/reviews` and `/v1/team/knowledge`, close the gap. Validate sources and gap.

#### `POST /v1/contributions/:id/resubmit`

- **Body** `{}`. **Returns** `ContributionSchema`.
- **Rules:** only from `changes_requested` (409 otherwise); back into the reviewer's queue. 404 for an
  unknown id (the mock crashes with a 500).

#### `GET /v1/me/reviews`

- **Returns** `ReviewQueueSchema`: `items[] {id, title, kind, section, author, submittedAt, before[]
lines|null (new pages), after[] lines, sources[]}` oldest first, `reviewedRecently` (last 7 days).
- **Who:** the assigned reviewer.
- **UI:** `/reviews` (manager rail "Review queue"; the client diffs lines).
- **Reuse:** `/v1/flags/queue`, `/v1/corrections/:id/verify`.
- **Live** (`apps/api/src/modules/platform/manager.routes.ts`). Contributions are still mocked, so the
  queue holds Ask answers proposed for the Hub (`POST /v1/ask/messages/:id/promote`). They go to the
  project's domain owners, or to the author's manager when the project has none. Approve publishes
  the FAQ note exactly as `POST /v1/promotions/:id/decide` does; request changes rejects it with the
  comment.

#### `POST /v1/me/reviews/:id/decision`

- **Body** `ReviewDecisionInputSchema` `{decision approve|request_changes, comment ≤2000}`.
- **Returns** `ReviewDecisionSchema {id, status published|changes_requested}`.
- **Rules:** approve publishes (Context Bot can cite it) and notifies the author; request changes sets
  the author's contribution to `changes_requested` and adds the comment. Update `/v1/team/knowledge`.
  404 unknown; 409 already decided. (The mock ignores the comment and always answers 200.)

### 7.9 HR (People Ops): onboarding records, probation, templates

Mock files: `apps/web/src/mocks/home/people-ops.ts` (1 endpoint), `apps/web/src/mocks/people-ops.ts` (18).
Contracts: `packages/shared/src/schemas/people-ops.ts`, `home.ts`. Backlog: items 4 and 10.

**Live.** Served by `apps/api/src/modules/platform/people-ops.routes.ts` (tests: `people-ops.test.ts`)
for the `hr` system role only; admins and owners get 403, as the role access spec keeps onboarding
records and check-in notes away from Admin. Admins give someone the HR role on Members & roles; the web
app maps it to the People Ops persona. The mocks below stay as fixtures for the HR screen tests
(`apps/web/src/test/people-ops-mocks.ts`) and are no longer in the development mock layer. Since this
section was written the API also serves `POST /v1/people-ops/probation-reviews/:id/discuss`,
`GET /v1/people-ops/people/:id/onboarding` (the profile's onboarding card) and the manager's
`POST /v1/probation/employees/:userId/recommendation`. The manager's probation check-in
(`POST /v1/team/members/:id/checkins`, 7.6) is live too and writes the same recommendation.
The original handoff notes follow.

**One store behind all of it.** Records, probation reviews and templates live in one mock store. The
manager's probation check-in (`POST /v1/team/members/:id/checkins`, section 7.6) writes into it, and
Context Bot reads it ("Summarize Sofia's probation evidence"). Every HR write except reminders makes
the web app refetch all HR pages and the HR Home, so all the cross-effects below are visible at once.

**Actor and dates.** The mock hard-codes the HR user as Elena Brooks (`decidedBy`, `updatedBy`,
`peoplePartner`): use the caller. Dates are `YYYY-MM-DD`. Several fields are human sentences with
dates inside (`note`, `lastCheckin`, `checkinSummary`, milestone `detail`); either build them on the
server in that form or propose structured fields and we change the contract together.

**Probation state machine** (shared with the manager's check-in):
`checkins_missing` → `awaiting_manager` → manager recommends → `ready_for_approval` (confirm) or
`needs_hr_review` (extend, discuss) → HR decides → `completed`. The mock never moves a review from
`checkins_missing` to `awaiting_manager`; the real service should, from check-in records.

#### `GET /v1/people-ops/overview`

- **Returns** `PeopleOpsOverviewSchema`: `activeOnboardings {count, changeVsLastMonth}`,
  `atRiskOrBlocked {count, changeThisWeek}`, `reviewsNext30Days {count, needAction}`,
  `startingNext14Days {count, notReady}`, `teams[] {team, onTrack, atRisk, blocked}`.
- **Rules:** `reviewsNext30Days.count` = reviews dated in the next 30 days; `needAction` = reviews in
  `ready_for_approval` or `needs_hr_review`; `notReady` = starters in the next 14 days missing an
  account, a buddy or a roadmap. Everything else is aggregate counts over onboarding records.
- **Changes after:** a decision or a manager recommendation (`needAction`); assignment, setup steps
  and new onboardings (`notReady`).
- **UI:** HR Home header line, four KPI tiles, "Onboarding by team" bars (`people-ops-home.tsx`).
- **Reuse:** `platform_records` kind `onboarding_plan`, `memberships.organization.teamId`, `/org/teams`.
- **Mock quirks, don't copy:** active (23), at risk (5), starting (6) and the team bars are hard-coded
  and never change; team names here (Engineering, Sales…) differ from record teams (Platform…).
  `needAction` ignores the 30-day window. Use one team vocabulary: `/v1/org/teams`.

#### `GET /v1/people-ops/probation-reviews?within=30`

- **Query:** `within` days (the UI always sends 30). Validate it (the mock returns empty lists for NaN).
- **Returns** `ProbationReviewListSchema` `{items, recentlyCompleted}`; each review: `id, person, team,
manager, reviewOn, recommendation (confirm|extend|discuss|awaiting_manager|not_started), readiness
0..1, state, decision|null, recommendationDueOn, missingCheckins`.
- **Rules:** `items` = reviews dated today..+`within`, soonest first, any state (completed ones stay
  until their date passes). `recentlyCompleted` = past reviews with a decision made in the last
  `within` days, most recent first. `readiness` = onboarding progress; `recommendationDueOn` = review
  date − 5 days. Person, team and manager come from the onboarding record.
- **Changes after:** HR decision (state, decision), manager check-in (recommendation, state), manager
  change on the record (manager).
- **UI:** HR Home reviews table ("Review & approve", "Send reminder", "Follow up"); `/probation` list
  with chips All, Needs you, Awaiting manager, At risk, Completed, and "Recently completed".
- **Reuse:** `/v1/probation/team`, `/v1/probation/employees/:userId` (plans and check-ins; today
  manager-only, see conflicts at the end of this section).

#### `GET /v1/people-ops/starters?within=14`

- **Returns** `StarterListSchema` `items[] {id, person, team, startDate, accountsReady,
buddyAssigned, roadmapAssigned}`, start date ascending.
- **Rules:** records starting in the next `within` days. `accountsReady` = setup step `account` done;
  `buddyAssigned` = has a buddy; `roadmapAssigned` = has a template.
- **Changes after:** assignment PATCH, the `account` setup step, new onboardings.
- **UI:** HR Home "Starting soon" card (three checks and "Not ready").
- **Reuse:** `memberships.organization.startDate` / `isNewHire`, `/v1/probation/plans`.
- **Mock quirk:** "not ready" here uses 3 flags while the record uses 6 setup steps, so one person can
  be ready on Home and `needs_setup` on their record. Pick one definition (recommend the 6 steps).

#### `GET /v1/people-ops/overdue-milestones`

- **Returns** `OverdueMilestoneListSchema` `items[] {id, person, team, milestone, dueOn}`, oldest first.
- **Rules:** onboarding milestones past due and not done, plus missing check-ins. The mock is a fixed
  list that nothing clears.
- **UI:** HR Home "Overdue" card; "Follow up" posts a reminder with `about: "milestone"`.
- **Reuse:** `onboarding_plan.data.milestones[].dueDate/status`, `checkin` records.

#### `GET /v1/people-ops/templates`

- **Returns** `OnboardingTemplateListSchema` `items[] {id, name, family, version "vN", status
published|draft, activeCount, updatedAt, updatedBy, roles[], weeks, stageCount, moduleCount}`.
- **Rules:** sort by `activeCount` descending (HR Home shows the first four as "most used").
  `version` is the draft's number while a draft is open.
- **UI:** HR Home templates card; `/templates` cards and the "Start from" list in New template.
- **Reuse:** `/v1/learning/paths` (but those are project-scoped and curator-gated; HR templates are
  workspace-wide).

#### `GET /v1/people-ops/onboardings?q=&team=&filter=`

- **Query:** `q` (name, title, team, manager name; case-insensitive), `team` (exact), `filter`
  `all|attention|starting|progress` (default `all`).
- **Returns** `OnboardingRecordListSchema`: `total`, `startingNext14Days`, `teams[]`, `counts {all,
attention, starting, progress}`, `items[]` (`id` = person id, `person, team, manager, buddy,
startDate, template {id, name "Short vN"}, stage, progress, expected, status, note, setup {done,
total}`).
- **Rules:** `attention` = blocked or at risk; `starting` = start date in the future; `progress` = the
  rest. `counts` and `teams` ignore `q` and `team`. **Order most urgent first** (the contract says so;
  the mock doesn't). `total` counts everyone onboarding, including on-track people not listed. The UI
  assumes a 90-day plan ("Day N of 90").
- **Changes after:** assignment, setup steps, new onboardings, template publish (names).
- **UI:** `/onboarding`.
- **Reuse:** `/v1/probation/team`, `/v1/learning/assignments`, `memberships` (`managerId`,
  `organization.teamId/jobTitle/startDate`).
- **Mock quirk:** `total` (29) and `startingNext14Days` (6) are hard-coded.

#### `GET /v1/people-ops/onboardings/:id`

- **Path:** `id` is the person id.
- **Returns** `OnboardingRecordSchema`: the summary plus `peoplePartner`, `setupSteps[]` (in order:
  `account` "Google Workspace account", `laptop`, `roadmap`, `buddy`, `welcome`, `calendar`; each
  `{id, label, done, doneBy}`), `milestones[]` (30-day review, 60-day readiness review, probation
  review at start + 30/60/90 days; `done` when past, `soon` within 14 days, else `later`),
  `lastCheckin`, `probationReviewId`.
- **Errors:** 404 "Onboarding record not found".
- **Who:** HR and the person's manager.
- **UI:** `/onboarding/:recordId`, which links to `/probation/:probationReviewId`.
- **Reuse:** `/v1/probation/employees/:userId`, `/v1/users/:id/organization`.
- **Mock quirk:** record milestones (probation at day 90) disagree with the review dates in the
  probation list. One source of truth for the probation date, please.

#### `PATCH /v1/people-ops/onboardings/:id`

- **Body** `OnboardingAssignmentInputSchema` (strict): `{managerId?, buddyId?, templateId?}`, at least
  one ("Change something."). The UI sends one at a time.
- **Returns** `OnboardingRecordSchema`.
- **Rules:** a buddy marks setup step `buddy` done; a template marks `roadmap` done (only published
  templates should be assignable). Then refresh status for people not started yet: all 6 steps done →
  `ready`, note "Everything set up"; otherwise note "N setup step(s) left".
- **Side effects:** notify the person and managers (for a manager change, old and new). The review's
  manager and reminder recipients follow the record's manager.
- **Errors:** 404 record; 400 body; **400 for unknown manager, buddy or template ids** (the mock
  silently ignores them; don't).
- **UI:** Assignment dialog on the record page.
- **Reuse:** `PATCH /v1/users/:id` (`managerId`, cycle check), `assignments` type `mentor` (buddy),
  `/v1/learning/paths/:id/assign` (template).

#### `POST /v1/people-ops/onboardings/:id/setup/:step`

- **Path:** `step` = `account|laptop|roadmap|buddy|welcome|calendar`. **Body** `SetupStepInputSchema` (`{}`).
- **Returns** `OnboardingRecordSchema`. Idempotent. Refresh status as above.
- **Side effects:** `welcome` sends the welcome message (UI: "Welcome message sent to X").
- **Errors:** 404 record; unknown step 404 in the mock (400 is fine too). The UI only posts account,
  laptop, welcome and calendar; roadmap and buddy go through PATCH, so reject those two here unless
  something is assigned.
- **UI:** Setup card on the record page ("Mark done", "Send now").
- **Reuse:** none; there is no SCIM in the API ("Created by SCIM" is invented by the mock).

#### `GET /v1/people-ops/onboarding-options`

- **Returns** `OnboardingOptionsSchema`: `teams[]`, `managers[]`, `buddies[]`, `templates[]` (published
  only, `{id, name "Short vN"}`).
- **UI:** New onboarding and Assignment dialogs (cached 5 minutes).
- **Reuse:** `/v1/org/teams`, `GET /v1/users` (role manager; needs titles), `assignments`.
- **Mock quirk:** all lists are hard-coded.

#### `POST /v1/people-ops/onboardings`

- **Body** `NewOnboardingInputSchema` (strict): `name` (2–200), `title` (2–200), `team`, `startDate`,
  `managerId`, `buddyId|null`, `templateId|null`.
- **Returns 201** `OnboardingRecordSchema`; the UI opens `/onboarding/:id`.
- **Rules:** status `needs_setup`; `roadmap`/`buddy` steps done when given; account, laptop, welcome,
  calendar not done (the account comes from the identity provider). Note "N setup steps left" when the
  start is in the future.
- **Decide:** create the probation review at the same time (the mock doesn't), duplicate check,
  increment the template's `activeCount`.
- **Errors:** 400 body; 400 for unknown manager/buddy/template/team (the mock accepts them).
- **Reuse:** `POST /v1/probation/plans` (today manager-only, needs `projectId` and `mentorId`, 409 if
  an active plan exists, audits `onboarding.create`), `POST /v1/users/invite`.

#### `GET /v1/people-ops/probation-reviews/:id`

- **Returns** `ProbationDetailSchema`: list fields (without `missingCheckins`) plus `startDate`,
  `recommendedOn`, `ratings[] {area, level 0..3}` (null until the manager submits; areas "Knows our
  products and customers", "Understands the systems they work on", "Works with team practices",
  "Delivers independently"), `managerNote`, `milestones[] {title, detail, state done|active|overdue}`,
  `checkinSummary`, `activity[]` newest first (`kind`: started, review, recommended_confirm,
  recommended_extend, missed, decided), full `decision`.
- **Errors:** 404 "Probation review not found".
- **Who:** HR; the manager may see the evidence, not the employment decision panel.
- **UI:** `/probation/:reviewId`; Context Bot's "Summarize X's probation evidence".
- **Reuse:** `GET /v1/probation/employees/:userId/summary`.
- **Contract gap:** add `missingCheckins` to the detail (the page hard-codes "2 missing check-ins").

#### `POST /v1/people-ops/probation-reviews/:id/decision`

- **Body** `ProbationDecisionInputSchema` (strict): `outcome confirm|extend`, `extensionDays
30|60|90|null` (required for extend), `effectiveOn`, `note` (≤2000), `notify`.
- **Returns** `ProbationDetailSchema`.
- **Rules:** allowed only in `ready_for_approval` or `needs_hr_review`; **409 otherwise** (the mock
  returns 200 unchanged). Sets `state completed` and `decision {outcome confirmed|extended, extension
"N days", decidedOn today, effectiveOn, decidedBy caller, note, notified}`, prepends activity
  "<caller> recorded: confirmed / extended N days". An extension should move the probation end date
  (the mock doesn't).
- **Side effects:** audit log entry (the UI says so), notify when `notify` is true.
- **Errors:** 404, 400, 409.
- **UI:** decision form with confirmation on the review page. "Discuss with manager first" has no
  endpoint yet (it shows "coming soon").
- **Reuse:** `POST /v1/probation/employees/:userId/outcome` (records the outcome, 409 if already
  recorded, audits `onboarding.outcome`) **but it only lets the direct manager decide**; HR deciding
  needs a policy change there.

#### `POST /v1/people-ops/reminders`

- **Body** `ReminderInputSchema` (strict): `about probation_review|milestone`, `ids[]` (min 1).
- **Returns** `ReminderResultSchema` `{reminded: PersonRef[]}`, the managers reminded, de-duplicated.
- **Rules:** each id maps to its record's manager. Send the reminder (notification). Add rate
  limiting. Unknown ids: 404 (the mock 404s for reviews but skips unknown milestones silently).
- **UI:** HR Home reviews and overdue cards, `/probation` "Remind managers", the review page.
- **Reuse:** none; `domain_events` / notifications could carry it.

#### `GET /v1/people-ops/templates/:id`

- **Returns** `TemplateDetailSchema`: `id, name, family, version, status, publishedVersion` (what
  active onboardings use), `activeCount, roles[], teams[], weeks, passMark` (4; "4 of 5"),
  `updatedAt, updatedBy, stages[] {id, name, weekStart, weekEnd, modules[] {id, title, kind,
minutes|null, owner}}`, `history[] {version, on, note}` newest first.
- **Errors:** 404 "Template not found".
- **UI:** `/templates/:templateId` editor (it resets when `version` or `updatedAt` changes).
- **Reuse:** `GET /v1/learning/paths/:id`.

#### `POST /v1/people-ops/templates/:id/draft`

- **Body** `TemplateDraftInputSchema` (strict): `{stages: [{id, moduleIds[]}]}`, every stage with its
  full module order.
- **Returns** `TemplateDetailSchema`.
- **Rules:** a published template becomes a draft with version + 1; an open draft keeps its number.
  Replace each listed stage's modules (only known module ids). Stages can't be added, removed or
  renamed. **Keep the published version intact** (the mock overwrites it in place).
- **Errors:** 404, 400 (unknown stage or module ids; the mock drops them silently).
- **Reuse:** `PUT /v1/learning/paths/:id` (draft, optimistic `version`, 409 on conflict).

#### `POST /v1/people-ops/templates/:id/publish`

- **Body** `TemplatePublishInputSchema` (strict): `{stages, note ≤500}`.
- **Returns** `TemplateDetailSchema`.
- **Rules:** publishes the draft's number (or version + 1 if already published), sets `status
published`, `publishedVersion`, prepends history `{version, today, note or "Updated modules"}`.
  **Active onboardings keep their version** (the mock renames everyone's template; don't).
- **Side effects:** audit log entry.
- **Reuse:** `POST /v1/learning/paths/:id/publish` (snapshots a version, binds assignments to it,
  four-eyes rule, audits `path.publish`). Decide whether HR templates need the four-eyes rule.

#### `POST /v1/people-ops/templates`

- **Body** `NewTemplateInputSchema` (strict): `name` (≤200, may be empty), `baseId`.
- **Returns 201** `TemplateDetailSchema`; the UI opens the editor.
- **Rules:** copy the base (family, roles, teams, weeks, passMark, stages) into a new draft v1, name
  = input or "<base> (copy)", `publishedVersion null`, `activeCount 0`, history "Draft based on
  <base>". Not offered in the options until published.
- **Errors:** unknown `baseId` 404.

#### `GET /v1/people-ops/template-library`

- **Returns** `TemplateLibrarySchema` `items[]`: modules HR can add to a template (the client hides
  ones already in it).
- **UI:** "Add module" dialog in the editor (cached 5 minutes).
- **Reuse:** learning path items.

**Conflicts with existing API code to settle first**

- `/v1/probation/*/outcome` and `POST /v1/probation/plans` are manager-only; HR needs to decide.
- Learning paths are project-scoped and curator-gated; HR templates are workspace-wide.
- No SCIM: setup step `account` needs a real source (Clerk, or HR marks it).
- The manager screens' mock (`mocks/team.ts`) keeps its own member data that drifts slightly from this
  store (Maya 18% vs 15%, Support template 14 vs 8 modules). Real data removes the drift.

### 7.10 Admin: security, members, connectors, access policies, AI settings

Live, with no mocks left (`apps/web/src/mocks/admin.ts` is gone): security, sync runs, AI overview and
AI settings (`platform/admin-overview.routes.ts`); the connector catalog with authorize, connect,
reconnect, Manage (folders, sync all, stop syncing) and connector requests
(`connectors/admin-connectors.routes.ts`); members overview, directory sync and role requests
(`platform/members-admin.routes.ts`, plus `POST /v1/role-requests` and `GET /v1/role-requests/mine`
for any member); access policies, conflicts and the preview (`platform/access-policies.routes.ts`).

**Google Drive sync, as served.** Nothing touches Google while serving a page: syncing and access
are background jobs (`connectors/google-drive.ts`).

- **Schedule.** A selected folder syncs every two days (`2d`) or only on "Sync now" (`manual`); the
  10-minute cooldown on Sync now stays. Migrations 0010–0011 moved every folder on 15m, hourly or
  daily to `2d`.
- **`sync_connector`** lists the scope's metadata (1,000 files a page; shared drives and My Drive flat,
  folders walked to any depth, up to `DRIVE_MAX_FILES_PER_SCOPE`, 20,000 by default) and queues one
  `import_drive_file` job per new or changed file (Drive's modified time). Unchanged files are not
  downloaded or audited; files whose processing failed are re-queued; files gone from Drive are
  tombstoned once the whole scope was listed. Sheets, Slides and other types are counted and shown
  as the scope's `note` in Manage.
- **`import_drive_file`** downloads one file (up to `MAX_DOCUMENT_BYTES`, 50 MB), keeps up to
  `MAX_SOURCE_TEXT_CHARS` (2 million) of its text, and queues processing at bulk priority. Permanent
  problems (too large, no text, no access) are recorded so the same version isn't fetched again;
  anything else retries with backoff.
- **`refresh_access`** works out who may read a restricted scope: people the file or shared drive is
  shared with (email, domain, anyone with the link, matched to members by sign-in or connected
  Google email), plus members whose own connected Drive lists it. Stored as `source_access` grants
  valid for 30 hours and refreshed every 6 hours (and after each sync or a new Drive connection), so
  a revoked share disappears within hours and a broken refresh fails closed. My Drive scopes rely on
  sharing only.
- **Processing.** Jobs carry a priority (listing first, uploads next, bulk imports last) and a
  concurrency key (one job per source, scope or project overview at a time); the worker runs
  `WORKER_CONCURRENCY` (4) at once. Long documents are read by the AI in up to
  `EXTRACTION_MAX_WINDOWS` (4) sections of 120k characters; the rest is still searchable in chat. Chat
  scores questions against an in-memory int8 copy of each project's vectors, reloaded only when the
  project's documents change.

**Access policies as served.** Groups are team and department names from the org structure. A policy
covers projects or synced folders (`sources: [{kind, id}]`, now required in the input). Restrict: only
its groups can open the sources. Exclude: never used in answers, and only its groups can open them.
Enforcement is in `identity.visibleSourceIds` and `answerableSourceIds`, so search, the Hub and answers
follow it and admins get no bypass. Two policies naming the same source are a conflict; until resolved
the more open rule applies, and resolving removes the source from the other policies. The locked
"Mirror source permissions" entry is synthesized. Directory sync reads the Clerk organization: new
members are added, changed names updated, and members missing from it suspended (never owners or the
person running it); in development mode it records an empty run. Seats come from the organization's
member limit (`total` is null when unlimited).

**As served.** The catalog lists every integration but only Google Drive connects; the others answer 503
with a pointer to “Request a connector”. Authorize returns `{account, authorizationUrl}`: when the
admin has no Drive connection yet, `authorizationUrl` is Google's consent page and the wizard waits for
the callback. Connect also takes `projectId` (required for Drive) and `visibility`, and stores the
frequency as a per-scope schedule that the maintenance sweep honours. Security reports sign-in mode, the
last directory sync, policies and conflicts, pending role requests and retention. AI stats come from
Ask answers and their ratings over 30 days; unanswered questions appear once at least the k-anonymity
threshold of different people asked them, or as soon as someone reports a gap. `excluded` lists exclude
policies' sources. The AI settings are stored and audited; only `access_only` and citations are enforced
by the Ask pipeline today. Restricted topics (pay, bonus, performance ratings, disciplinary) are refused
before retrieval in project Ask and Context Bot alike, for every role.
Contracts: `packages/shared/src/schemas/admin.ts`, `home.ts`, `platform.ts`. Backlog: item 11.

**Who:** owners and admins only, everywhere in this section. The rail hides these pages from other
roles but the router has no guard, so **the API must return 403** (`requireRole(actor, "owner",
"admin")`). The mocks check nothing.

**Audit log.** The Audit log page groups entries by action prefix: `policy.*` Access, `ai.*` AI
settings, `connector.*` Connectors, `user.*` and `assignment.*` Roles (the existing role change is
`user.update`). **No mock writes audit entries**; role decisions, policy changes, AI settings changes
and connector changes must.

**One store.** Every admin write (except authorize and connector requests) makes the web app refetch
all admin pages and the admin Home, so the cross-effects below show immediately.

#### `GET /v1/admin/sync-runs`

- **Returns** `SyncRunListSchema` newest first: `id, connector` (display name), `startedAt, ok, detail`
  (counts or failure reason), `durationMs`. Directory (SCIM) runs belong in this list too.
- **Query:** the contract mentions `?since=`; the UI sends nothing and labels the card "Today", so
  default to the start of today.
- **UI:** admin Home "Sync activity" card.
- **Reuse:** project `jobs` (`process_source`, `refresh_hub`) are per project; there is no
  connector-level sync job yet.
- **Mock quirk:** 5 static runs, nothing adds to them.

#### `GET /v1/admin/security`

- **Returns** `SecurityOverviewSchema` items `{id sso|scim|role_requests|access_policies|data_retention,
value, state ok|attention|off}`.
- **Rules:** `access_policies` "N active · 1 conflict" (attention) or "no conflicts" (ok);
  `role_requests` "Admin, Manager · 2 pending" (attention) or "None pending" (ok); `scim` "On · last
  run <time>" (format the time on the server); `sso` from the identity provider.
- **Changes after:** directory sync, role decisions, policy create, conflict resolution.
- **UI:** admin Home "Security" card (links to /members and /access).
- **Reuse:** `GET /v1/workspaces/current` (`authentication`) for the SSO line.

#### `GET /v1/admin/ai`

- **Returns** `AiOverviewSchema`: `helpfulRate, ratings, periodDays, settings[]` (the AI rules, without
  `pause_during_checks`). Read from the same settings as `/v1/admin/ai-settings`.
- **UI:** admin Home "AI answers" card; its switches call `PATCH /v1/admin/ai-settings` with
  `{rules: {[id]: boolean}}`.

#### `GET /v1/admin/members/overview`

- **Returns** `MembersOverviewSchema`: `seats {used, total}`, `directorySync {provider, enabled,
lastRunAt}`.
- **UI:** `/members` header ("412 of 450 seats") and the "Sync now" toast.
- **Reuse:** `memberships`, `users`, Clerk organizations.
- **Mock quirk:** seats are static (412/450), not the real member count.

#### `POST /v1/admin/directory-sync`

- **Body:** `{}` (strict). **Returns** `DirectorySyncResultSchema {ranAt, created, updated, deactivated}`.
- **Rules:** run the directory (SCIM) sync now. Updates `members/overview.lastRunAt` and the security
  `scim` line; add a sync run and an audit entry.
- **Reuse:** none; there is no SCIM. Members come from Clerk today.

#### `GET /v1/admin/role-requests`

- **Returns** `RoleRequestListSchema`, open requests oldest first: `id, person, role, reason, requestedAt`.
- **UI:** "Role requests" card on `/members` (hidden when empty).
- **Missing:** there is no endpoint or screen for a member to _ask_ for a role. Decide whether
  requests come from the identity provider or need `POST /v1/role-requests`.

#### `POST /v1/admin/role-requests/:id/decision`

- **Body** `RoleRequestDecisionInputSchema` `{decision approve|decline}`. **Returns** `{id, decision}`.
- **Rules:** approve changes the role (reuse `PATCH /v1/users/:id` rules: only an owner grants owner,
  the last owner is protected). Remove the request either way. Audit entry and notify the requester.
- **Errors:** 404 "Role request not found"; 409 if already decided.
- **Contract gap:** the decline toast says the person "has been told why" but there is no reason field.

#### `GET /v1/admin/connectors`

- **Returns** `AdminConnectorListSchema` in catalog order: `id` (provider id; the web app picks the
  logo from it), `name, category, description, unit, scopeOptions[{id, name, restricted}], popular,
needsAdminOf, state healthy|syncing|error|available, detail, lastSyncAt, progress 0..1|null, error`.
- **Rules:** the workspace's connector catalog with each connection's state. While a sync runs, return
  `progress`; **the page polls every second while any connector is syncing**, so keep this cheap.
- **UI:** `/connectors` (tiles Connected, Need attention, Available; cards; wizard).
- **Reuse and mismatch:** `GET /v1/connectors` returns _per-user_ Google Drive connections with
  provider `google_drive` (underscore) and status `connected|needs_reauth|revoked`. The admin catalog
  is workspace-wide and uses `google-drive`. Settle one provider id format (the web app's logo map
  is keyed by the hyphenated ids).
- **Mock quirks:** Confluence is seeded "syncing" and never finishes, so the page polls forever.

#### `POST /v1/admin/connectors/:id/authorize`

- **Body:** `{}`. **Returns** `ConnectorConsentSchema {account}` (the account that granted read-only access).
- **UI:** connect wizard step 1 ("Waiting for X…", then "Connected as {account}").
- **Contract problem:** real OAuth redirects (`POST /v1/connectors/google-drive/authorize` returns an
  `authorizationUrl` and a callback). A synchronous `{account}` can't express that. Propose either
  `{authorizationUrl}` plus a status poll, or a popup flow, and we change the wizard.

#### `POST /v1/admin/connectors/:id/connect`

- **Body** `ConnectInputSchema`: `scopeIds[]` (min 1), `frequency 15m|hourly|daily`, `skipOlderThan
never|3y|1y`. **Returns** `AdminConnectorSchema`.
- **Rules:** store the scope and schedule, start the first sync (`state syncing`, `progress`), then
  healthy with "<count> <unit> indexed". 400 for unknown scope ids; 409 if not authorized first.
- **Contract gap:** `frequency` and `skipOlderThan` are not in the response; add them if the page
  should show them.

#### `POST /v1/admin/connectors/:id/reconnect`

- **Body** `ReconnectInputSchema` `{}`. **Returns** `AdminConnectorSchema`.
- **Rules:** renew credentials and re-sync what failed. Only for connectors in `error` (409
  otherwise). The UI shows "Fix" only on error cards.

#### `POST /v1/admin/connector-requests`

- **Body** `ConnectorRequestInputSchema` `{tool (2–200), notes (≤2000)}`. **Returns 201** `{id}`.
- **Rules:** record the request (and tell whoever handles them). The mock stores nothing.

#### `GET /v1/admin/access-policies`

- **Returns** `AccessPolicyListSchema`: `total` (including per-project rules not listed), `items`
  (`id, name, effect default|restrict|exclude, description, groups, sources[{provider, label}],
locked, conflict, updatedAt`), `conflicts[{id, title, description, options[]}]`, `groups` (names a
  policy can use), `previewPeople[{person, groups}]`.
- **Rules:** the built-in "Mirror source permissions" policy is `locked`. Conflicts: until resolved,
  **the more open rule wins**. The page shows only `conflicts[0]`.
- **UI:** `/access`.
- **Reuse:** `source_access` per-user grants, `source_objects.visibility`, `identity.visibleSourceIds`,
  `POST/DELETE /v1/projects/:projectId/sources/:sourceId/access`. **There is no group entity**;
  groups like "finance-leads" look like identity-provider groups. Search and answers (project Ask and
  Context Bot) must apply the same rules.

#### `POST /v1/admin/access-policies`

- **Body** `AccessPolicyInputSchema`: `name` (2–200), `effect restrict|exclude`, `groups[]` (min 1).
- **Returns 201** `AccessPolicySchema`.
- **Rules:** validate groups; audit `policy.create`. An `exclude` policy also appears in AI settings
  `excluded`.
- **Contract gap:** **nothing sets a policy's sources** (no field in the input, no step in the dialog).
  Add `sources` to the input and we add the picker.

#### `PATCH /v1/admin/access-policies/:id`

- **Body:** the same `AccessPolicyInputSchema` (full body). **Returns** `AccessPolicySchema`.
- **Rules:** locked policies can't change (409 or 403; the mock answers 404). Audit `policy.update`.
  The dialog says changes apply within a minute.

#### `POST /v1/admin/access-conflicts/:id/resolve`

- **Body** `ResolveConflictInputSchema` `{optionId}`. **Returns** the whole `AccessPolicyListSchema`.
- **Rules:** apply the chosen option (in the seed: `hr` removes "Comp bands" from Finance, `finance`
  adds finance-leads to HR), clear `conflict` flags, audit. **400 for an unknown option** (the mock
  accepts anything).
- **Changes after:** `conflicts` empty, security line "no conflicts", preview rows.

#### `GET /v1/admin/access-preview?personId=`

- **Returns** `AccessPreviewSchema {person, items[{provider, label, allowed, reason}]}`; `reason`
  names the rule that decides.
- **Rules:** evaluate the real policies and group membership for that person. Labels must be unique
  per person (the UI keys rows by label). 404 for an unknown person (the mock falls back to Maya).
- **Mock quirk:** hard-coded rows; only the conflict resolution changes them.

#### `GET /v1/admin/ai-settings`

- **Returns** `AiSettingsSchema`: `stats {helpfulRate, withSources, noAnswer, ratings, periodDays}`,
  `rules[]` (`cite_sources`, `access_only` locked, `route_unanswered`, `include_dms` locked,
  `pause_during_checks`), `strictness strict|balanced|lenient`, `staleAfterHours 1|2|6|24`,
  `routeAfterAsks 2|3|5`, `weeklyDigest`, `excluded[{provider, label, reason}]`,
  `unhelpfulReasons[{reason, share}]`, `unhelpfulNote`, `unanswered[{question, asks, routedTo}]`.
- **What each setting means:** strict = answer only when two or more sources agree; balanced = one
  verified source; lenient = any match, weak sources labelled unverified. `staleAfterHours` drives
  the stale-source warning in answers. `routeAfterAsks` sends an unanswered question to its owner
  after N asks. `route_unanswered` creates knowledge gaps. `cite_sources`: an answer without a source
  counts as not found. Weekly digest: managers get their team's unanswered questions on Mondays.
- **Rules:** `excluded` is derived from exclude policies (all their sources, not just the first).
  `stats` and `unhelpfulReasons` come from answer feedback (`POST /v1/assistant/answers/:id/feedback`);
  map reasons `incorrect` → "Incorrect", `out_of_date` → "Out of date", `missing_source` → "Missing a
  source", `not_relevant` → "Not relevant". `unanswered` comes from knowledge gaps.
- **UI:** `/ai`.
- **Reuse:** `workspaces.settings` JSON (with `version`) for the settings; the project `feedback`
  and `questions` tables and `companion_interaction` records for stats.

#### `PATCH /v1/admin/ai-settings`

- **Body** `AiSettingsInputSchema` (strict, all optional, at least one): `rules` (partial record of
  rule id → boolean; unknown ids 400), `strictness, staleAfterHours, routeAfterAsks, weeklyDigest`.
- **Returns** the full `AiSettingsSchema`.
- **Rules:** **400 or 409 when changing a locked rule** (the mock ignores it silently). Audit each
  change (`ai.*`). `GET /v1/admin/ai` reflects it.
- **Note:** the server should honour `pause_during_checks` for Context Bot (section 7.11); today the
  client always pauses during a check.

**Mock state that is static and will look different with real data:** seats, sync runs, AI stats,
unhelpful reasons, unanswered questions. Approving a role request doesn't change `/v1/users` in the
mock. The admin Home "Sources" card already uses live `/v1/connectors` while `/connectors` is mocked,
so the two disagree until this section ships.

### 7.12 Tutorials (Tutorial Studio)

**Live.** `apps/api/src/modules/learning/tutorials.routes.ts` (drafting: `tutorial-ai.ts`; tests:
`learning/tutorials.test.ts`). Contract: `packages/shared/src/schemas/tutorials.ts`. UI: `/tutorials`
and `/tutorials/:id` for admins, owners and People Ops (project `path_curator`s may manage their
projects' tutorials through the API).

- **Drafting (FR-LRN-001).** `POST /v1/tutorials {projectId, audience, focus?, coversModule?}` (202)
  queues `generate_tutorial`. The job writes lessons (Markdown) and a knowledge check from the
  project's **stored** knowledge: the Knowledge Hub's items with their evidence quotes, plus passages
  retrieved for the focus. It never reads Drive. Every lesson and question cites numbered sources.
- **Review (FR-LRN-004/005).** `GET`/`PATCH /v1/tutorials/:id` edit title, summary, objectives,
  lessons (Markdown, order) and questions; the Studio previews exactly what learners read. Learners
  only ever see published versions: `POST /v1/tutorials/:id/publish {updateLearners}` snapshots a
  `tutorial_version`.
- **No updates on sync (FR-LRN-008).** Each draft keeps the content hashes of its sources. A Drive
  sync never changes a tutorial; the Studio shows which sources changed or were removed ("Needs
  update"), and the curator decides to `POST /v1/tutorials/:id/regenerate`. The published version
  stays until they publish again.
- **Versions (FR-LRN-012).** People part-way through keep their version unless `updateLearners` is
  true; finished lessons stay finished.
- **Assigning.** `POST /v1/tutorials/:id/assign {userId, dueOn}` puts it on the person's roadmap when
  they're onboarding (their manager and HR see it there), otherwise in My learning; they're notified.
  Published tutorials are also modules in the template catalog (`tutorial-<id>`) and the manager's
  "Assign learning", and suggestions in My learning.

### 7.11 Context Bot outside projects

Live since the Context Bot integration: `apps/api/src/modules/ask/assistant.routes.ts` serves all three. Contract: `packages/shared/src/schemas/assistant.ts`.
Backlog: item 13. Inside a project the panel already uses the live Ask threads; these endpoints are
for every other page.

#### `POST /v1/assistant/ask`

- **Body** `AssistantAskInputSchema`: `question` (3–2000, "Ask a full question."), `page` (≤500, the
  app path the person is on).
- **Returns** `AssistantAnswerSchema`: `id, question, createdAt, outcome answered|no_answer|restricted,
confidence {level verified|partial, label}|null, blocks[]` (paragraph or list; `**bold**` and `[n]`
  markers, `[n]` cites `sources[n-1]`), `note` (e.g. a stale source), `people[{person, why}]`,
  `sources[{title, system, provider, detail, url, to, stale}]` (titles unique), `searched[]`,
  `followups[]`, `related[{kind, title, to}]`.
- **Rules:**
  1. `restricted` for pay, compensation, payroll, bonus, performance rating and disciplinary questions
     (the mock uses a keyword regex; a classifier is better). Two fixed paragraphs, and the asker's
     People partner in `people`.
  2. `answered` from retrieval across **everything the asker can access** (projects, records), with
     citations, a confidence label (`partial` when a source is a draft or stale), a `note` when a
     source hasn't synced within `staleAfterHours`, the owner in `people`, follow-ups and related links.
  3. `no_answer` when nothing reliable is in reach: one paragraph, `searched` (what was searched),
     and likely experts by page (HR pages → the People partner, admin pages → the workspace admin,
     otherwise the owner of related systems).
- **Permissions:** scope retrieval to the asker. The mock answers anyone with manager, HR and admin
  data; the real endpoint must not. Honour the AI settings (strictness, `cite_sources`,
  `pause_during_checks`).
- **UI:** the Context Bot panel on every page outside `/projects/:id` (answered, no-answer and
  restricted cards). Pages also ask it specific questions: "What does Sana work on?" (person page),
  "Summarize Leah's progress" (team member page), "Summarize Sofia's probation evidence" (HR review).
- **Reuse:** project Ask (`POST /v1/projects/:projectId/ask`, `/v1/ask/threads`, retrieval over
  `questions`, confidence `insufficient` ≈ `no_answer`, citations checked against `visibleSourceIds`),
  `/v1/companion/stuck-help`, `/v1/companion/context`.

#### `POST /v1/assistant/answers/:id/feedback`

- **Body** `AssistantFeedbackInputSchema` `{helpful, reason incorrect|out_of_date|missing_source|not_relevant|null}`.
- **Returns** `AcknowledgedSchema {ok: true}`.
- **Rules:** **upsert per (answer, user)**: thumbs up sends `{true, null}`; thumbs down sends nothing
  until a reason is picked, then `{false, reason}`, and picking another reason sends again. Feeds the
  AI settings stats and "why answers were rated unhelpful". 404 for an unknown answer.
- **Reuse:** project `feedback` (targetType `answer`), `POST /v1/flags`.

#### `POST /v1/assistant/gaps`

- **Body** `KnowledgeGapInputSchema` `{question}` (3–2000). **Returns 201** `{id, notified}` (who was
  told, e.g. "Platform knowledge owners").
- **Rules:** record a knowledge gap, de-duplicate similar questions, route it to the owners, respect
  `route_unanswered`. It should then appear in `/v1/me/knowledge-gaps`, `/v1/team/knowledge-gaps`
  and AI settings `unanswered`.
- **Reuse:** no gaps table yet; `platform_records` could hold them; notifications exist as records.

## 8. Features with no contract yet

These buttons exist in the UI but have no endpoint or contract, so they show "coming soon" (or
nothing). Each needs a contract first; the frontend will write it in `packages/shared` with you.

|   # | Feature                                                                                | Where in the UI                                                                               | Suggested endpoint                                                                                                                       |
| --: | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Request access to a restricted source                                                  | Module page sources ("Request access")                                                        | `POST /v1/access-requests {sourceId, reason}` → `{id, sentTo}`                                                                           |
|   2 | Escalate a blocked access request                                                      | Manager: member page insight, Home "Needs your attention" ("Escalate")                        | **Done:** `POST /v1/team/members/:id/escalations` (7.6)                                                                                  |
|   3 | Open and edit a saved contribution                                                     | Contributions ("Edit and resubmit", reopening drafts)                                         | `GET /v1/contributions/:id`, `PATCH /v1/contributions/:id`                                                                               |
|   4 | Ask for a role                                                                         | Nowhere yet (admins only see requests)                                                        | `POST /v1/role-requests {role, reason}`                                                                                                  |
|   5 | Schedule check-ins                                                                     | Feeds manager Home "Upcoming check-ins"                                                       | **Done for now:** a cadence on the plan (decision 8); a calendar later                                                                   |
|   6 | "Discuss with manager first" on a probation decision                                   | HR review page                                                                                | `POST /v1/people-ops/probation-reviews/:id/discussion`                                                                                   |
|   7 | Act on a knowledge gap's conflict or stale source ("Review sources", "Request update") | Manager Home "Knowledge gaps"                                                                 | **Done:** `KnowledgeGap.target`; "Request update" posts a flag (7.6)                                                                     |
|   8 | Per-person actions in the team roster ("More actions")                                 | Manager Home roster                                                                           | **Done:** open, record check-in, assign learning (no new endpoint)                                                                       |
|   9 | Owners see learning ratings                                                            | The UI tells learners "The owner sees your rating"                                            | An aggregate on the module owner's view                                                                                                  |
|  10 | Start or resume a course                                                               | My learning ("Start", "Resume")                                                               | **Done for tutorials** (they open as a module); older learning paths still have no lesson flow                                           |
|  11 | Save a Context Bot answer                                                              | Answer cards (the reference has a bookmark)                                                   | Add `answer` to `SaveInput.targetType` (`/v1/me/saved`)                                                                                  |
|  12 | Avatar shape                                                                           | Settings → Profile (reference has a shape picker; today the shape comes from the person's id) | `preferences.avatarShape` on `/v1/users/me`: one of `cookie9`, `cookie6`, `clover4`, `sunny`, `flower`, `cookie4`, `clover8`, `cookie12` |
|  13 | Unread badges on the rail                                                              | Rail items                                                                                    | Unread counts per area (for example `GET /v1/me/badges`)                                                                                 |
|  14 | Notification categories                                                                | Settings → Notifications                                                                      | Extend `/v1/notifications/preferences`                                                                                                   |
|  15 | Connector settings (change scope, frequency, pause, disconnect)                        | Connectors cards ("Connector settings")                                                       | `PATCH /v1/admin/connectors/:id`, `DELETE …`                                                                                             |
|  16 | Real links: lesson video and slides, sources and decision records in their tools       | Lesson media blocks, module sources, answer sources                                           | Fill the existing `url` fields                                                                                                           |
|  17 | Messages and calendar (Message X, Book time, Book a call, check-in agendas)            | Person, member, roadmap, HR pages                                                             | Slack and calendar integrations; a product decision first                                                                                |
|  18 | Attach a page or file to a Context Bot question ("Add context")                        | Context Bot composer (a placeholder in the reference too)                                     | Later                                                                                                                                    |

## 9. Suggested build order

1. **Decide first:** the HR role, one onboarding record, and the learning model (section 6, items 1–3).
2. **Quick wins any time:** the live changes in section 5 (audit order, user fields, one context item),
   personal settings (7.5) and saved knowledge (7.4).
3. **The employee's path:** the learner (7.1), employee Home (7.2), the welcome (7.3).
4. **Manager and HR together:** 7.6 and 7.9 share the probation flow and the onboarding record.
5. **People and Context Bot:** the directory (7.7), then Context Bot outside projects (7.11), which
   needs retrieval scoped to what the caller can access and the AI settings.
6. **Admin:** 7.10, after decisions 6 (groups) and 7 (connector authorization).
7. **Contributions:** 7.8. The pages are hidden for the Oct 18 demo, but the review queue is in use.

## 10. Definition of done for each endpoint

- [ ] Returns exactly the shared schema (parsed in an API test), with real data, for the right caller.
- [ ] Enforces who may call it (403 or 404), since the web app has no route guards.
- [ ] Errors use the envelope with messages written for people; 400, 404 and 409 where section 7 says.
- [ ] Side effects done: audit log entries, notifications, and the other endpoints that must change.
- [ ] Bruno request added to `bruno/contextos-api/`.
- [ ] The mock is deleted, the web tests serve their own fixtures, the "Preview data" chip is gone.
- [ ] `pnpm check` passes.
- [ ] `docs/api-change-requests.md` status table and Appendix A updated.

## Appendix A. Every mocked endpoint (7)

Generated from `apps/web/src/mocks/endpoints.ts` and the endpoint descriptors in
`apps/web/src/features/*/api/*.api.ts`. Schemas are exported from `@contextos/shared`
(`packages/shared/src/schemas/`). Mock files are under `apps/web/src/mocks/`. Row numbers preserve
the original catalog, so gaps identify endpoints retired from the mock layer.

|   # | Section | Method | Path                             | Request body                      | Response                  | Mock file          |
| --: | ------- | ------ | -------------------------------- | --------------------------------- | ------------------------- | ------------------ |
|  44 | 7.8     | POST   | `/v1/contributions`              | `ContributionInputSchema`         | `ContributionSchema`      | `contributions.ts` |
|  45 | 7.8     | POST   | `/v1/contributions/:id/resubmit` | `ContributionResubmitInputSchema` | `ContributionSchema`      | `contributions.ts` |
|  46 | 7.8     | POST   | `/v1/contributions/draft`        | `ContributionDraftInputSchema`    | `ContributionDraftSchema` | `contributions.ts` |
|  47 | 7.8     | GET    | `/v1/contributions/reviewer`     | —                                 | `SuggestedReviewerSchema` | `contributions.ts` |
|  48 | 7.8     | GET    | `/v1/me/contributions`           | —                                 | `ContributionListSchema`  | `contributions.ts` |
|  49 | 7.8     | GET    | `/v1/me/knowledge-gaps`          | —                                 | `KnowledgeGapListSchema`  | `contributions.ts` |
|  52 | 7.8     | GET    | `/v1/sources/search`             | —                                 | `SourcePickListSchema`    | `contributions.ts` |

## Appendix B. Live API routes the web app calls (159)

These already work. `GET /v1/audit` needs the change in section 5.

| Method | Path                                                         | API module                              |
| ------ | ------------------------------------------------------------ | --------------------------------------- |
| GET    | `/v1/ask/threads`                                            | `ask/threads.routes.ts`                 |
| POST   | `/v1/ask/threads`                                            | `ask/threads.routes.ts`                 |
| DELETE | `/v1/ask/threads/:id`                                        | `ask/threads.routes.ts`                 |
| GET    | `/v1/ask/threads/:id`                                        | `ask/threads.routes.ts`                 |
| POST   | `/v1/ask/threads/:id/messages`                               | `ask/threads.routes.ts`                 |
| POST   | `/v1/ask/messages/:id/feedback`                              | `ask/messages.routes.ts`                |
| POST   | `/v1/ask/messages/:id/promote`                               | `ask/messages.routes.ts`                |
| POST   | `/v1/assistant/ask`                                          | `ask/assistant.routes.ts`               |
| POST   | `/v1/assistant/answers/:id/feedback`                         | `ask/assistant.routes.ts`               |
| POST   | `/v1/assistant/gaps`                                         | `ask/assistant.routes.ts`               |
| GET    | `/v1/me/saved`                                               | `platform/saved.routes.ts`              |
| PUT    | `/v1/me/saved/:targetId`                                     | `platform/saved.routes.ts`              |
| GET    | `/v1/admin/security`                                         | `platform/admin-overview.routes.ts`     |
| GET    | `/v1/admin/sync-runs`                                        | `platform/admin-overview.routes.ts`     |
| GET    | `/v1/admin/ai`                                               | `platform/admin-overview.routes.ts`     |
| GET    | `/v1/admin/ai-settings`                                      | `platform/admin-overview.routes.ts`     |
| PATCH  | `/v1/admin/ai-settings`                                      | `platform/admin-overview.routes.ts`     |
| GET    | `/v1/admin/connectors`                                       | `connectors/admin-connectors.routes.ts` |
| GET    | `/v1/admin/connectors/:id/scopes`                            | `connectors/admin-connectors.routes.ts` |
| POST   | `/v1/admin/connectors/:id/sync`                              | `connectors/admin-connectors.routes.ts` |
| DELETE | `/v1/admin/connectors/:id/scopes/:scopeId`                   | `connectors/admin-connectors.routes.ts` |
| GET    | `/v1/admin/members/overview`                                 | `platform/members-admin.routes.ts`      |
| POST   | `/v1/admin/directory-sync`                                   | `platform/members-admin.routes.ts`      |
| GET    | `/v1/admin/role-requests`                                    | `platform/members-admin.routes.ts`      |
| POST   | `/v1/admin/role-requests/:id/decision`                       | `platform/members-admin.routes.ts`      |
| POST   | `/v1/role-requests`                                          | `platform/members-admin.routes.ts`      |
| GET    | `/v1/role-requests/mine`                                     | `platform/members-admin.routes.ts`      |
| GET    | `/v1/admin/access-policies`                                  | `platform/access-policies.routes.ts`    |
| POST   | `/v1/admin/access-policies`                                  | `platform/access-policies.routes.ts`    |
| PATCH  | `/v1/admin/access-policies/:id`                              | `platform/access-policies.routes.ts`    |
| DELETE | `/v1/admin/access-policies/:id`                              | `platform/access-policies.routes.ts`    |
| POST   | `/v1/admin/access-conflicts/:id/resolve`                     | `platform/access-policies.routes.ts`    |
| GET    | `/v1/admin/access-preview`                                   | `platform/access-policies.routes.ts`    |
| POST   | `/v1/admin/connectors/:id/authorize`                         | `connectors/admin-connectors.routes.ts` |
| POST   | `/v1/admin/connectors/:id/connect`                           | `connectors/admin-connectors.routes.ts` |
| POST   | `/v1/admin/connectors/:id/reconnect`                         | `connectors/admin-connectors.routes.ts` |
| POST   | `/v1/admin/connector-requests`                               | `connectors/admin-connectors.routes.ts` |
| GET    | `/v1/audit`                                                  | `identity/identity.routes.ts`           |
| GET    | `/v1/companion/preferences`                                  | `platform/companion.routes.ts`          |
| PATCH  | `/v1/companion/preferences`                                  | `platform/companion.routes.ts`          |
| GET    | `/v1/connectors`                                             | `connectors/connectors.routes.ts`       |
| DELETE | `/v1/connectors/:id`                                         | `connectors/connectors.routes.ts`       |
| GET    | `/v1/connectors/:id/files`                                   | `connectors/connectors.routes.ts`       |
| GET    | `/v1/connectors/:id/scopes`                                  | `connectors/connectors.routes.ts`       |
| PUT    | `/v1/connectors/:id/scopes`                                  | `connectors/connectors.routes.ts`       |
| POST   | `/v1/connectors/:id/sync`                                    | `connectors/connectors.routes.ts`       |
| POST   | `/v1/connectors/:id/import`                                  | `connectors/connectors.routes.ts`       |
| POST   | `/v1/connectors/google-drive/authorize`                      | `connectors/connectors.routes.ts`       |
| POST   | `/v1/flags`                                                  | `platform/knowledge.routes.ts`          |
| GET    | `/v1/evidence/:id`                                           | `context/evidence.routes.ts`            |
| GET    | `/v1/notifications`                                          | `platform/companion.routes.ts`          |
| POST   | `/v1/notifications/read-all`                                 | `platform/companion.routes.ts`          |
| PATCH  | `/v1/notifications/:id/read`                                 | `platform/companion.routes.ts`          |
| GET    | `/v1/notifications/preferences`                              | `platform/companion.routes.ts`          |
| PATCH  | `/v1/notifications/preferences`                              | `platform/companion.routes.ts`          |
| GET    | `/v1/org/departments`                                        | `workspace/workspace.routes.ts`         |
| POST   | `/v1/org/departments`                                        | `workspace/workspace.routes.ts`         |
| DELETE | `/v1/org/departments/:id`                                    | `workspace/workspace.routes.ts`         |
| PATCH  | `/v1/org/departments/:id`                                    | `workspace/workspace.routes.ts`         |
| GET    | `/v1/org/teams`                                              | `workspace/workspace.routes.ts`         |
| POST   | `/v1/org/teams`                                              | `workspace/workspace.routes.ts`         |
| DELETE | `/v1/org/teams/:id`                                          | `workspace/workspace.routes.ts`         |
| PATCH  | `/v1/org/teams/:id`                                          | `workspace/workspace.routes.ts`         |
| GET    | `/v1/projects`                                               | `projects/projects.routes.ts`           |
| POST   | `/v1/projects`                                               | `projects/projects.routes.ts`           |
| DELETE | `/v1/projects/:projectId`                                    | `projects/projects.routes.ts`           |
| GET    | `/v1/projects/:projectId`                                    | `projects/projects.routes.ts`           |
| PATCH  | `/v1/projects/:projectId`                                    | `projects/projects.routes.ts`           |
| POST   | `/v1/projects/:projectId/ask`                                | `ask/ask.routes.ts`                     |
| GET    | `/v1/projects/:projectId/context-items`                      | `context/context.routes.ts`             |
| PATCH  | `/v1/projects/:projectId/context-items/:itemId/verification` | `context/context.routes.ts`             |
| POST   | `/v1/projects/:projectId/feedback`                           | `feedback/feedback.routes.ts`           |
| GET    | `/v1/projects/:projectId/hub`                                | `hub/hub.routes.ts`                     |
| POST   | `/v1/projects/:projectId/hub/refresh`                        | `hub/hub.routes.ts`                     |
| GET    | `/v1/projects/:projectId/jobs`                               | `jobs/jobs.routes.ts`                   |
| POST   | `/v1/projects/:projectId/jobs/:jobId/retry`                  | `jobs/jobs.routes.ts`                   |
| GET    | `/v1/projects/:projectId/questions`                          | `ask/ask.routes.ts`                     |
| GET    | `/v1/projects/:projectId/sources`                            | `sources/sources.routes.ts`             |
| POST   | `/v1/projects/:projectId/sources`                            | `sources/sources.routes.ts`             |
| DELETE | `/v1/projects/:projectId/sources/:sourceId`                  | `sources/sources.routes.ts`             |
| GET    | `/v1/projects/:projectId/sources/:sourceId`                  | `sources/sources.routes.ts`             |
| POST   | `/v1/projects/:projectId/sources/:sourceId/reprocess`        | `sources/sources.routes.ts`             |
| GET    | `/v1/people/:id`                                             | `platform/knowledge.routes.ts`          |
| GET    | `/v1/users`                                                  | `identity/identity.routes.ts`           |
| PATCH  | `/v1/users/:id`                                              | `identity/identity.routes.ts`           |
| POST   | `/v1/users/invite`                                           | `identity/identity.routes.ts`           |
| GET    | `/v1/users/me`                                               | `identity/identity.routes.ts`           |
| PATCH  | `/v1/users/me`                                               | `identity/identity.routes.ts`           |
| GET    | `/v1/workspaces/current`                                     | `identity/identity.routes.ts`           |
| GET    | `/v1/workspaces/current/setup`                               | `workspace/workspace.routes.ts`         |
| PATCH  | `/v1/workspaces/current/setup`                               | `workspace/workspace.routes.ts`         |
| GET    | `/v1/people-ops/overview`                                    | platform/people-ops.routes.ts           |
| GET    | `/v1/people-ops/probation-reviews`                           | platform/people-ops.routes.ts           |
| GET    | `/v1/people-ops/probation-reviews/:id`                       | platform/people-ops.routes.ts           |
| POST   | `/v1/people-ops/probation-reviews/:id/decision`              | platform/people-ops.routes.ts           |
| POST   | `/v1/people-ops/probation-reviews/:id/discuss`               | platform/people-ops.routes.ts           |
| GET    | `/v1/people-ops/starters`                                    | platform/people-ops.routes.ts           |
| GET    | `/v1/people-ops/overdue-milestones`                          | platform/people-ops.routes.ts           |
| POST   | `/v1/people-ops/reminders`                                   | platform/people-ops.routes.ts           |
| GET    | `/v1/people-ops/onboardings`                                 | platform/people-ops.routes.ts           |
| POST   | `/v1/people-ops/onboardings`                                 | platform/people-ops.routes.ts           |
| GET    | `/v1/people-ops/onboardings/:id`                             | platform/people-ops.routes.ts           |
| PATCH  | `/v1/people-ops/onboardings/:id`                             | platform/people-ops.routes.ts           |
| POST   | `/v1/people-ops/onboardings/:id/setup/:step`                 | platform/people-ops.routes.ts           |
| GET    | `/v1/people-ops/onboarding-options`                          | platform/people-ops.routes.ts           |
| GET    | `/v1/people-ops/people/:id/onboarding`                       | platform/people-ops.routes.ts           |
| GET    | `/v1/people-ops/templates`                                   | platform/people-ops.routes.ts           |
| POST   | `/v1/people-ops/templates`                                   | platform/people-ops.routes.ts           |
| GET    | `/v1/people-ops/templates/:id`                               | platform/people-ops.routes.ts           |
| POST   | `/v1/people-ops/templates/:id/draft`                         | platform/people-ops.routes.ts           |
| POST   | `/v1/people-ops/templates/:id/publish`                       | platform/people-ops.routes.ts           |
| GET    | `/v1/people-ops/template-library`                            | platform/people-ops.routes.ts           |
| GET    | `/v1/me/learning`                                            | platform/manager.routes.ts              |
| POST   | `/v1/me/learning/:id/add`                                    | platform/manager.routes.ts              |
| GET    | `/v1/me/reviews`                                             | platform/manager.routes.ts              |
| POST   | `/v1/me/reviews/:id/decision`                                | platform/manager.routes.ts              |
| GET    | `/v1/team/knowledge`                                         | platform/manager.routes.ts              |
| GET    | `/v1/team/knowledge-gaps`                                    | platform/manager.routes.ts              |
| GET    | `/v1/team/onboarding`                                        | platform/team.routes.ts                 |
| GET    | `/v1/team/check-matrix`                                      | platform/team.routes.ts                 |
| GET    | `/v1/team/attention`                                         | platform/team.routes.ts                 |
| GET    | `/v1/team/checkins`                                          | platform/team.routes.ts                 |
| GET    | `/v1/team/members/:id`                                       | platform/team.routes.ts                 |
| PATCH  | `/v1/team/members/:id/roadmap`                               | platform/team.routes.ts                 |
| POST   | `/v1/team/members/:id/roadmap`                               | platform/team.routes.ts                 |
| GET    | `/v1/team/members/:id/checkin-prep`                          | platform/team.routes.ts                 |
| POST   | `/v1/team/members/:id/checkins`                              | platform/team.routes.ts                 |
| GET    | `/v1/team/members/:id/assign-options`                        | platform/team.routes.ts                 |
| POST   | `/v1/team/members/:id/assignments`                           | platform/team.routes.ts                 |
| POST   | `/v1/team/members/:id/escalations`                           | platform/team.routes.ts                 |
| GET    | `/v1/me/roadmap`                                             | learning/learner.routes.ts              |
| GET    | `/v1/me/modules/:id`                                         | learning/learner.routes.ts              |
| GET    | `/v1/me/lessons/:id`                                         | learning/learner.routes.ts              |
| POST   | `/v1/me/lessons/:id/complete`                                | learning/learner.routes.ts              |
| GET    | `/v1/me/checks/:id`                                          | learning/learner.routes.ts              |
| POST   | `/v1/me/checks/:id/attempts`                                 | learning/learner.routes.ts              |
| POST   | `/v1/me/learning-ratings`                                    | learning/learner.routes.ts              |
| POST   | `/v1/me/learning-requests`                                   | learning/learner.routes.ts              |
| GET    | `/v1/me/next-up`                                             | learning/learner.routes.ts              |
| GET    | `/v1/me/onboarding`                                          | learning/learner.routes.ts              |
| GET    | `/v1/me/tasks`                                               | learning/learner.routes.ts              |
| GET    | `/v1/me/milestones`                                          | learning/learner.routes.ts              |
| GET    | `/v1/me/knowledge-updates`                                   | platform/employee.routes.ts             |
| GET    | `/v1/me/team-activity`                                       | platform/employee.routes.ts             |
| GET    | `/v1/me/people`                                              | platform/employee.routes.ts             |
| GET    | `/v1/me/welcome`                                             | platform/employee.routes.ts             |
| POST   | `/v1/me/welcome`                                             | platform/employee.routes.ts             |
| GET    | `/v1/me/assistant-preferences`                               | platform/employee.routes.ts             |
| PATCH  | `/v1/me/assistant-preferences`                               | platform/employee.routes.ts             |
| POST   | `/v1/me/data-export`                                         | platform/employee.routes.ts             |
| GET    | `/v1/me/data-export/:id`                                     | platform/employee.routes.ts             |
| GET    | `/v1/tutorials`                                              | learning/tutorials.routes.ts            |
| POST   | `/v1/tutorials`                                              | learning/tutorials.routes.ts            |
| GET    | `/v1/tutorials/:id`                                          | learning/tutorials.routes.ts            |
| PATCH  | `/v1/tutorials/:id`                                          | learning/tutorials.routes.ts            |
| POST   | `/v1/tutorials/:id/regenerate`                               | learning/tutorials.routes.ts            |
| POST   | `/v1/tutorials/:id/publish`                                  | learning/tutorials.routes.ts            |
| POST   | `/v1/tutorials/:id/archive`                                  | learning/tutorials.routes.ts            |
| POST   | `/v1/tutorials/:id/assign`                                   | learning/tutorials.routes.ts            |

## Appendix C. Live API routes the web app does not call yet (55)

Many hold data the mocked endpoints will be built from (the "Reuse" lines in section 7).

| Method | Path                                                                   | API module                        |
| ------ | ---------------------------------------------------------------------- | --------------------------------- |
| GET    | `/v1/assignments`                                                      | `identity/identity.routes.ts`     |
| POST   | `/v1/assignments`                                                      | `identity/identity.routes.ts`     |
| DELETE | `/v1/assignments/:id`                                                  | `identity/identity.routes.ts`     |
| GET    | `/v1/companion/context`                                                | `platform/companion.routes.ts`    |
| POST   | `/v1/companion/interactions`                                           | `platform/companion.routes.ts`    |
| POST   | `/v1/companion/stuck-help`                                             | `platform/companion.routes.ts`    |
| GET    | `/v1/connectors/google-drive/callback`                                 | `connectors/connectors.routes.ts` |
| POST   | `/v1/corrections/:id/verify`                                           | `platform/knowledge.routes.ts`    |
| PATCH  | `/v1/flags/:id`                                                        | `platform/knowledge.routes.ts`    |
| POST   | `/v1/flags/:id/corrections`                                            | `platform/knowledge.routes.ts`    |
| GET    | `/v1/flags/queue`                                                      | `platform/knowledge.routes.ts`    |
| GET    | `/v1/gamification/me`                                                  | `platform/companion.routes.ts`    |
| GET    | `/v1/health`                                                           | `health/health.routes.ts`         |
| GET    | `/v1/health/ready`                                                     | `health/health.routes.ts`         |
| GET    | `/v1/learning/assignments`                                             | `platform/learning.routes.ts`     |
| POST   | `/v1/learning/assignments/:assignmentId/items/:itemId/attest`          | `platform/learning.routes.ts`     |
| POST   | `/v1/learning/assignments/:assignmentId/items/:itemId/dwell`           | `platform/learning.routes.ts`     |
| GET    | `/v1/learning/assignments/:assignmentId/items/:itemId/quiz`            | `platform/learning.routes.ts`     |
| POST   | `/v1/learning/assignments/:assignmentId/items/:itemId/quiz/submit`     | `platform/learning.routes.ts`     |
| POST   | `/v1/learning/assignments/:assignmentId/items/:itemId/signoff/request` | `platform/learning.routes.ts`     |
| POST   | `/v1/learning/assignments/:assignmentId/items/:itemId/start`           | `platform/learning.routes.ts`     |
| GET    | `/v1/learning/assignments/:id/progress`                                | `platform/learning.routes.ts`     |
| GET    | `/v1/learning/paths`                                                   | `platform/learning.routes.ts`     |
| POST   | `/v1/learning/paths`                                                   | `platform/learning.routes.ts`     |
| GET    | `/v1/learning/paths/:id`                                               | `platform/learning.routes.ts`     |
| PUT    | `/v1/learning/paths/:id`                                               | `platform/learning.routes.ts`     |
| POST   | `/v1/learning/paths/:id/assign`                                        | `platform/learning.routes.ts`     |
| POST   | `/v1/learning/paths/:id/items/:itemId/quiz`                            | `platform/learning.routes.ts`     |
| POST   | `/v1/learning/paths/:id/publish`                                       | `platform/learning.routes.ts`     |
| POST   | `/v1/learning/paths/generate`                                          | `platform/learning.routes.ts`     |
| POST   | `/v1/learning/signoffs/:id/decide`                                     | `platform/learning.routes.ts`     |
| POST   | `/v1/probation/checkins/:id/respond`                                   | `platform/onboarding.routes.ts`   |
| GET    | `/v1/probation/employees/:userId`                                      | `platform/onboarding.routes.ts`   |
| GET    | `/v1/probation/employees/:userId/checkins`                             | `platform/onboarding.routes.ts`   |
| POST   | `/v1/probation/employees/:userId/checkins`                             | `platform/onboarding.routes.ts`   |
| POST   | `/v1/probation/employees/:userId/milestones/verify`                    | `platform/onboarding.routes.ts`   |
| POST   | `/v1/probation/employees/:userId/outcome`                              | `platform/onboarding.routes.ts`   |
| GET    | `/v1/probation/employees/:userId/summary`                              | `platform/onboarding.routes.ts`   |
| GET    | `/v1/probation/my-plan`                                                | `platform/onboarding.routes.ts`   |
| POST   | `/v1/probation/plans`                                                  | `platform/onboarding.routes.ts`   |
| GET    | `/v1/probation/team`                                                   | `platform/onboarding.routes.ts`   |
| GET    | `/v1/projects/:projectId/conflicts`                                    | `platform/knowledge.routes.ts`    |
| GET    | `/v1/projects/:projectId/current-state`                                | `platform/knowledge.routes.ts`    |
| GET    | `/v1/projects/:projectId/decisions`                                    | `platform/knowledge.routes.ts`    |
| GET    | `/v1/projects/:projectId/decisions/:id`                                | `platform/knowledge.routes.ts`    |
| GET    | `/v1/projects/:projectId/feedback`                                     | `feedback/feedback.routes.ts`     |
| POST   | `/v1/projects/:projectId/memberships`                                  | `identity/identity.routes.ts`     |
| POST   | `/v1/projects/:projectId/sources/:sourceId/access`                     | `identity/identity.routes.ts`     |
| DELETE | `/v1/projects/:projectId/sources/:sourceId/access/:userId`             | `identity/identity.routes.ts`     |
| GET    | `/v1/projects/:projectId/timeline`                                     | `platform/knowledge.routes.ts`    |
| GET    | `/v1/search`                                                           | `platform/knowledge.routes.ts`    |
| GET    | `/v1/users/:id/organization`                                           | `workspace/workspace.routes.ts`   |
| PATCH  | `/v1/users/:id/organization`                                           | `workspace/workspace.routes.ts`   |
| POST   | `/v1/workspaces`                                                       | `workspace/workspace.routes.ts`   |
| PATCH  | `/v1/workspaces/current`                                               | `workspace/workspace.routes.ts`   |

## Appendix D. Where things live

| What                                       | Path                                                                                                                                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts (request and response schemas)   | `packages/shared/src/schemas/*.ts` (`learning.ts`, `home.ts`, `welcome.ts`, `saved.ts`, `account.ts`, `manager.ts`, `people.ts`, `contributions.ts`, `people-ops.ts`, `admin.ts`, `assistant.ts`, `platform.ts`) |
| Endpoint descriptors (path + schemas)      | `apps/web/src/features/*/api/*.api.ts`                                                                                                                                                                           |
| Query hooks (what refetches after a write) | `apps/web/src/features/*/api/*.queries.ts`                                                                                                                                                                       |
| Mocks                                      | `apps/web/src/mocks/` (registry `endpoints.ts`, helpers `define.ts`, data `fixtures/`)                                                                                                                           |
| Mock switch                                | `apps/web/.env` `VITE_MOCK_API`; example in `apps/web/.env.example`                                                                                                                                              |
| Preview chip                               | `apps/web/src/components/preview-data-chip.tsx`, `apps/web/src/lib/preview-data.ts`                                                                                                                              |
| Web API client                             | `apps/web/src/lib/api-client.ts`                                                                                                                                                                                 |
| Test setup                                 | `apps/web/src/test/msw.ts`, `apps/web/src/mocks/endpoints.test.ts`                                                                                                                                               |
| Demo-hidden features                       | `apps/web/src/lib/hidden.ts`                                                                                                                                                                                     |
| Navigation by role and persona             | `apps/web/src/components/layout/navigation.ts`                                                                                                                                                                   |
| API routes                                 | `apps/api/src/modules/*/*.routes.ts`, mounted in `apps/api/src/app.ts`                                                                                                                                           |
| API database schema                        | `apps/api/src/db/schema.ts`                                                                                                                                                                                      |
| Bruno collection                           | `bruno/contextos-api/`                                                                                                                                                                                           |
| Backlog ("why" per area)                   | `docs/api-change-requests.md`                                                                                                                                                                                    |
| Frontend plan                              | `docs/frontend-plan.md`                                                                                                                                                                                          |

Keep this file current: when an endpoint ships, update its Appendix A row (or delete it) and the
status table in `docs/api-change-requests.md`.
