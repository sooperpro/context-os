# API change requests from the frontend

Changes the web app needs from the API, written so the backend can pick them up without reading the
frontend. Each entry says what the UI does today without it, and what changes once it lands.

## Screen status

Every reference screen, the endpoints it reads, and whether they exist. **Live** means the API serves
it. **Mocked** means the screen is built and the web app answers the endpoint with schema-checked
preview data in development (`apps/web/src/mocks`), marked "Preview data" on screen. **Not built**
means the screen does not exist yet. Contracts for mocked endpoints are in
`packages/shared/src/schemas/` (`home.ts`, `contributions.ts`, `learning.ts`, `people.ts`, `manager.ts`); implement exactly that
shape, then delete the mock.

| Screen                                        | Endpoints                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Status                                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Home · employee                               | `GET /v1/me/onboarding`, `/v1/me/next-up`, `/v1/me/tasks`, `/v1/me/milestones`, `/v1/me/knowledge-updates`, `/v1/me/team-activity`, `/v1/me/people`, `/v1/me/contributions`                                                                                                                                                                                                                                                                                     | Mocked                                                                                                                                 |
| Home · manager                                | `GET /v1/team/onboarding`, `/v1/team/attention`, `/v1/team/checkins`, `/v1/team/knowledge-gaps`, `/v1/team/knowledge`                                                                                                                                                                                                                                                                                                                                           | Mocked. `/probation/team`, `/probation/employees/:id/checkins` and `/flags/queue` hold some of this data                               |
| Home · HR                                     | `GET /v1/people-ops/overview`, `/v1/people-ops/probation-reviews`, `/v1/people-ops/starters`, `/v1/people-ops/overdue-milestones`, `/v1/people-ops/templates`                                                                                                                                                                                                                                                                                                   | Mocked. Needs a role decision, see 4                                                                                                   |
| Home · admin                                  | `GET /v1/connectors`, `/v1/users`, `/v1/audit`                                                                                                                                                                                                                                                                                                                                                                                                                  | Live. `/v1/audit` needs a sort, see 5                                                                                                  |
| Home · admin                                  | `GET /v1/admin/security`, `/v1/admin/sync-runs`, `/v1/admin/ai`; `PATCH /v1/admin/ai-settings`                                                                                                                                                                                                                                                                                                                                                                  | Mocked. Security and AI answers share the admin store with the pages below, see 11                                                     |
| Knowledge Hub                                 | `GET /v1/projects`, `/v1/projects/:id/context-items`, `/v1/users`, `/v1/org/teams`                                                                                                                                                                                                                                                                                                                                                                              | Live. Project category missing, see 1                                                                                                  |
| Knowledge item page, Saved                    | Live: `GET /v1/projects/:id/hub`, `/v1/projects/:id/context-items`. Mocked: `GET /v1/me/saved`, `PUT /v1/me/saved/:targetId`                                                                                                                                                                                                                                                                                                                                    | Partly mocked, see 12                                                                                                                  |
| Project hub, Ask, Sources                     | project, hub, context, ask and source routes                                                                                                                                                                                                                                                                                                                                                                                                                    | Live                                                                                                                                   |
| Context Bot outside a project                 | `POST /v1/assistant/ask`, `/v1/assistant/answers/:id/feedback`, `/v1/assistant/gaps`                                                                                                                                                                                                                                                                                                                                                                            | Mocked, see 13. Inside a project it uses the live Ask threads                                                                          |
| Settings, Workspace setup                     | identity, workspace, notification and connector routes                                                                                                                                                                                                                                                                                                                                                                                                          | Live                                                                                                                                   |
| My roadmap, module, lesson, knowledge check   | `GET /v1/me/roadmap`, `/v1/me/modules/:id`, `/v1/me/lessons/:id`, `/v1/me/checks/:id`; `POST /v1/me/lessons/:id/complete`, `/v1/me/checks/:id/attempts`, `/v1/me/learning-ratings`, `/v1/me/learning-requests`                                                                                                                                                                                                                                                  | Mocked. Contracts in `packages/shared/src/schemas/learning.ts`; views over the existing `/learning/*` data, see 7                      |
| People directory, person profile              | `GET /v1/people?q=&filter=`, `/v1/people/experts`, `/v1/people/teams`, `/v1/people/:id`                                                                                                                                                                                                                                                                                                                                                                         | Mocked. Contracts in `packages/shared/src/schemas/people.ts`; `GET /v1/users` has names and roles only, see 8                          |
| Contributions, New contribution               | `GET /v1/me/contributions`, `/v1/me/knowledge-gaps`, `/v1/sources/search`, `/v1/contributions/reviewer`; `POST /v1/contributions`, `/v1/contributions/draft`, `/v1/contributions/:id/resubmit`                                                                                                                                                                                                                                                                  | Mocked. Contracts in `packages/shared/src/schemas/contributions.ts`; only `POST /v1/flags` exists today                                |
| Team onboarding, member, check-in (manager)   | `GET /v1/team/onboarding`, `/v1/team/check-matrix`, `/v1/team/members/:id`, `/v1/team/members/:id/checkin-prep`, `/v1/team/members/:id/assign-options`; `PATCH /v1/team/members/:id/roadmap`; `POST /v1/team/members/:id/checkins`, `/assignments`, `/roadmap`                                                                                                                                                                                                  | Mocked. Contracts in `packages/shared/src/schemas/manager.ts`; `/probation/*` holds some of this as generic records, see 9             |
| Review queue (manager)                        | `GET /v1/me/reviews`, `POST /v1/me/reviews/:id/decision`                                                                                                                                                                                                                                                                                                                                                                                                        | Mocked; `/flags/queue` covers flags only, see 9                                                                                        |
| My learning (manager)                         | `GET /v1/me/learning`, `POST /v1/me/learning/:id/add`                                                                                                                                                                                                                                                                                                                                                                                                           | Mocked, see 9                                                                                                                          |
| Onboarding, probation reviews, templates (HR) | `GET /v1/people-ops/onboardings?q=&team=&filter=`, `/v1/people-ops/onboardings/:id`, `/v1/people-ops/onboarding-options`, `/v1/people-ops/probation-reviews/:id`, `/v1/people-ops/templates/:id`, `/v1/people-ops/template-library`; `PATCH /v1/people-ops/onboardings/:id`; `POST /v1/people-ops/onboardings`, `/onboardings/:id/setup/:step`, `/probation-reviews/:id/decision`, `/reminders`, `/templates`, `/templates/:id/draft`, `/templates/:id/publish` | Mocked. Contracts in `packages/shared/src/schemas/people-ops.ts`; `/probation/plans` and `/learning/paths` are generic records, see 10 |
| Members & roles (admin)                       | Live: `GET /v1/users` (`email`, `team`, `lastActiveAt`, `invitedAt` requested), `PATCH /v1/users/:id`, `POST /v1/users/invite`, org routes. Mocked: `GET /v1/admin/members/overview`, `/v1/admin/role-requests`; `POST /v1/admin/directory-sync`, `/v1/admin/role-requests/:id/decision`                                                                                                                                                                        | Partly mocked, see 11                                                                                                                  |
| Connectors (admin)                            | `GET /v1/admin/connectors`; `POST /v1/admin/connectors/:id/authorize`, `/connect`, `/reconnect`, `/v1/admin/connector-requests`                                                                                                                                                                                                                                                                                                                                 | Mocked. Contracts in `packages/shared/src/schemas/admin.ts`; `/v1/connectors` serves Google Drive only, see 11                         |
| Access policies, AI settings (admin)          | `GET /v1/admin/access-policies`, `/v1/admin/access-preview?personId=`, `/v1/admin/ai-settings`; `POST /v1/admin/access-policies`, `/v1/admin/access-conflicts/:id/resolve`; `PATCH /v1/admin/access-policies/:id`, `/v1/admin/ai-settings`                                                                                                                                                                                                                      | Mocked, see 11                                                                                                                         |
| Audit log (admin)                             | `GET /v1/audit`                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Live. Sorted and filtered on the client until the API takes them, see 5                                                                |

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

The Audit log page (`/audit`) also filters by date range (today, 7 or 30 days), category (access,
roles, connectors, AI settings, HR records, content) and a search over actor and action. It does this
on the latest 100 entries today; `since`, `category` and `q` parameters would make it exact.

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

## 8. People directory

**Why.** The reference's People page is a directory for everyone: title, team, location and time
zone, skills, who is new or an expert, badges relative to the viewer (your manager, your buddy), what
each person owns in the Knowledge Hub, and the reporting line. `GET /v1/users` returns name, role and
status, and is admin territory ("Members & roles").

**Today.** People and profiles are built on mocks. Admins keep the live "Members & roles" page.

**Change.** Serve the contracts in `packages/shared/src/schemas/people.ts`:

- `GET /v1/people?q=&filter=all|team|experts|new`: search across name, title, team and skills, with
  `relations` to the caller and workspace totals. Readable by members and managers; guests get 403.
- `GET /v1/people/experts`: topics with the person to ask, from Knowledge Hub ownership.
- `GET /v1/people/teams`: the caller's team as an org chart, then every team with its lead and size.
- `GET /v1/people/:id`: profile with bio, manager, reports and owned Knowledge Hub items. Include
  `onboarding` only when the caller is their manager or HR.
- Profile fields (title, location, time zone, skills, bio) need a place to live: the user record, or a
  profile table synced from the identity provider.

## 9. The manager's views

**Why.** The reference gives managers Team onboarding (status, progress against plan, knowledge checks
by topic), a page per person (Context Bot insight, roadmap editing, checks, check-ins, probation
dates), a check-in form (agenda, pulse, readiness ratings with evidence, blockers, a probation
recommendation), a review queue for their team's contributions, and My learning. The API has
`/probation/team`, `/probation/employees/:id`, check-in reads and `/flags/queue` as generic records.

**Today.** All of it is built on mocks; edits, check-ins, assignments and review decisions last for the
session. Maya's progress on the manager's screens follows what she completes as Employee.

**Change.** Serve the contracts in `packages/shared/src/schemas/manager.ts`:

- Team: `GET /v1/team/onboarding` (now with `issue`), `GET /v1/team/check-matrix`, `GET /v1/team/members/:id`.
  Only the person's manager and HR may read a member.
- Roadmap edits: `PATCH /v1/team/members/:id/roadmap` with `postpone_week` and `remove`; notify the person.
- Check-ins: `GET /v1/team/members/:id/checkin-prep?type=` (suggested agenda, readiness areas with
  evidence) and `POST /v1/team/members/:id/checkins`. Ratings go to People Ops only; notes and next
  steps are shared with the person when `shareWithPerson` is true. A probation check-in requires a
  recommendation, which should reach the HR review (`/v1/people-ops/probation-reviews`).
- Assigning: `GET /v1/team/members/:id/assign-options`, `POST .../assignments` (one task) and
  `POST .../roadmap` (template, add-ons, buddy) for people without a plan.
- Reviews: `GET /v1/me/reviews` (with the current and suggested text, line by line) and
  `POST /v1/me/reviews/:id/decision`; approving publishes the contribution, requesting changes moves
  the author's contribution to `changes_requested` with the comment.
- My learning: `GET /v1/me/learning` and `POST /v1/me/learning/:id/add`.

## 10. People Ops (HR) views

**Why.** The reference gives People Ops company-wide onboarding records (assignments, a setup
checklist, milestones), the probation pipeline with the manager's recommendation and the
employment decision, and onboarding templates with versions. The API has `/probation/plans` and
`/learning/paths` as generic records and no People Ops role (see 4).

**Today.** All of it is built on mocks (`apps/web/src/mocks/people-ops.ts`); one store feeds the HR
pages and HR Home, and a manager's probation recommendation from a check-in lands in it. Changes last
for the session.

**Change.** Serve the contracts in `packages/shared/src/schemas/people-ops.ts`, readable by People Ops
only (and, for a record, the person's manager):

- Records: `GET /v1/people-ops/onboardings?q=&team=&filter=` (most urgent first, with counts per filter
  and `startingNext14Days`) and `GET /v1/people-ops/onboardings/:id` (setup steps, milestones, the last
  check-in, `probationReviewId`). `PATCH` changes the manager, buddy or template and notifies the
  person and managers; `POST .../setup/:step` marks a step done (`welcome` sends the message).
  `POST /v1/people-ops/onboardings` creates one; the account still comes from SCIM.
- Probation: `GET /v1/people-ops/probation-reviews?within=30` now returns `decision` per review and
  `recentlyCompleted`; `GET /v1/people-ops/probation-reviews/:id` has ratings, the manager's note,
  milestones and activity. `POST .../decision` (confirm, or extend by 30, 60 or 90 days, with an
  effective date, a note and whether to notify) completes it and writes the audit log. The manager's
  check-in recommendation (`POST /v1/team/members/:id/checkins`, see 9) moves a review to
  `ready_for_approval` (confirm) or `needs_hr_review` (extend, discuss).
- Reminders: `POST /v1/people-ops/reminders` with `about` (`probation_review` or `milestone`) and ids;
  answers who was reminded.
- Templates: `GET /v1/people-ops/templates` (now with status, roles, weeks and counts),
  `GET /v1/people-ops/templates/:id`, `GET /v1/people-ops/template-library`;
  `POST .../draft` saves module order per stage as a new draft version, `POST .../publish` publishes
  it with a note (active onboardings keep their version), `POST /v1/people-ops/templates` copies one
  into a new draft. Publishing writes the audit log.

## 11. The admin's workspace screens

**Why.** The reference gives admins Members & roles (seats, role counts, role requests, roles changed
in place, what each role can do), Connectors (the catalog, a read-only connect wizard, sync health and
fixes), Access policies (rules on top of mirrored permissions, conflicts, a per-person preview), AI
settings (answer rules, strictness, staleness and routing, what is never used, why answers were rated
unhelpful) and the Audit log. The API serves members, roles, invites, the org structure, Google Drive
connections and the audit log.

**Today.** Members, roles, invites, departments, teams and the audit log are live. Seats, directory
sync, role requests, the connector catalog, access policies and AI settings are mocked
(`apps/web/src/mocks/admin.ts`); one store feeds these pages and the admin Home's security and AI
cards. Changes last for the session.

**Change.** Serve the contracts in `packages/shared/src/schemas/admin.ts`, owners and admins only:

- Members: add `email`, `team`, `lastActiveAt` and `invitedAt` to `GET /v1/users` items (optional in
  `WorkspaceMemberSchema` until then). `GET /v1/admin/members/overview` (seats; directory sync
  provider and last run) and `POST /v1/admin/directory-sync` (run SCIM now; counts of changes).
- Role requests: `GET /v1/admin/role-requests`, `POST /v1/admin/role-requests/:id/decision` (approve
  changes the role; both write the audit log and tell the requester).
- Connectors: `GET /v1/admin/connectors` (catalog entries with their connection state, detail, last
  sync, progress and error), `POST .../:id/authorize` (provider consent, read-only scopes),
  `POST .../:id/connect` (scope, frequency, age cut-off; starts the first sync), `POST .../:id/reconnect`,
  and `POST /v1/admin/connector-requests`. Logos are the web app's, keyed by provider id.
- Access: `GET /v1/admin/access-policies` (policies, conflicts with resolution options, groups, people
  to preview), `POST`/`PATCH` policies, `POST /v1/admin/access-conflicts/:id/resolve`,
  `GET /v1/admin/access-preview?personId=` (what they can reach, and which rule decides). Search and
  answers must apply the same rules.
- AI: `GET /v1/admin/ai-settings` and `PATCH /v1/admin/ai-settings` (rules, strictness, stale-after
  hours, route-after asks, weekly digest); `GET /v1/admin/ai` reads the same rules. Rule ids changed to
  `cite_sources`, `access_only`, `route_unanswered`, `include_dms`, `pause_during_checks`.
- HR is still not a system role (see 4); "What each role can do" lists it as product copy.

## 12. Knowledge item pages and saved knowledge

**Why.** The reference gives every knowledge item its own page (what it says, key facts, owners and
experts, connected knowledge) and lets people save items and projects, listed under "Saved" in the
Knowledge Hub.

**Today.** The item page (`/projects/:projectId/items/:itemId`) reads the project's live
context-items list and picks the item; connected knowledge (shared sources, conflicts, dependencies)
and experts (people who own it, decision participants) are worked out on the client. Saves are
mocked (`apps/web/src/mocks/saved.ts`) and last for the session.

**Change.**

- `GET /v1/projects/:projectId/context-items/:itemId`, so the page doesn't load the whole list.
- Saved knowledge, per person: `GET /v1/me/saved` (newest first) and `PUT /v1/me/saved/:targetId`
  with `{ targetType: "context_item" | "project", projectId, saved }`. Contracts in
  `packages/shared/src/schemas/saved.ts`.

## 13. Context Bot outside a project

**Why.** In the reference, Context Bot answers on every page, not only inside a project: questions
about the company, the person's roadmap, their team, People Ops records or the workspace, scoped to
what they can access. Each page tells it what is on screen (chips, an intro, suggested questions), and
it pauses while a knowledge check is open.

**Today.** Inside a project the panel uses the live Ask threads API. Elsewhere it asks the mocked
`POST /v1/assistant/ask` (`apps/web/src/mocks/assistant.ts`), which has the reference's answers for
its suggested questions, builds probation and people answers from the other mocks, refuses pay,
performance and disciplinary questions, and says "no reliable answer" otherwise. Page context is
client-side (`useBotContext`).

**Change.** Serve the contracts in `packages/shared/src/schemas/assistant.ts`:

- `POST /v1/assistant/ask` with `{ question, page }`: retrieval across every project and record the
  person can access, answering with blocks (`[n]` cites `sources[n - 1]`), a confidence label, a
  note when a source is stale, people to ask, follow-ups and related knowledge. `outcome` is
  `no_answer` when nothing reliable is in reach (with what was searched and who might know) and
  `restricted` for pay, performance and disciplinary questions.
- `POST /v1/assistant/answers/:id/feedback` with `{ helpful, reason }`, feeding the AI settings page's
  "why answers were rated unhelpful".
- `POST /v1/assistant/gaps` with `{ question }`: records a knowledge gap and tells its owners.
- Honour the AI setting "Pause during knowledge checks" on the server too.
