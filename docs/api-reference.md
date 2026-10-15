# ContextOS API reference

Updated: 14 October 2026. Base URL: `http://localhost:3000/api/v1`. Requirements source: [ContextOS_PRD.md](../ContextOS_PRD.md) §20 (API Specification) with the business rules of §6, §8, §13, §18 and §19.

This document lists every HTTP endpoint the backend serves, what it is for, which product surface uses it, who may call it, and the request and response shapes. It is written for frontend, Slack-app and extension integrators. Shapes marked with a schema name live in `packages/shared/src/schemas` and are validated on both sides.

Related guides: [backend-api-use-cases.md](backend-api-use-cases.md) (workflow walkthroughs and Bruno setup) and [backend-production-readiness.md](backend-production-readiness.md) (what remains before production).

## 1. Conventions

### Authentication and tenancy

- `AUTH_MODE=development` uses one configured local actor (owner of the default workspace). `AUTH_MODE=clerk` requires `Authorization: Bearer <Clerk session token>` with an active Clerk Organization; the organization maps to one workspace. Production rejects development mode.
- Every request is scoped to the caller's workspace. Resources from other workspaces answer `404`, never `403`, so their existence is not revealed.
- Public routes (no bearer): `GET /health`, `GET /health/ready`, `GET /connectors/google-drive/callback`, `POST /webhooks/:provider`.
- `POST /workspaces` needs a signed-in user but not a selected organization.

### Roles, assignments and source parity

- System roles (exactly one per member): `owner`, `admin`, `manager`, `member`, `guest` (PRD §6.2).
- Assignments are additive grants (PRD §6.3): `mentor` (scope: user), `domain_owner` (scope: workspace, project or `section` = `<projectId>:<sectionKey>`), `path_curator` (project/workspace), `bounty_sponsor`, `department_head`, `rewards_approver`, `review_cycle_admin` (workspace).
- **Permission parity (PRD §19, PP-1..PP-10)**: a role never widens content access. Every derived item (claim, hub section, answer, flag, learning item, conflict) is shown only when the caller can read the sources it rests on. Owners and admins get no bypass. Inaccessible content answers `404` or is filtered out silently.
- Manual sources are private to their creator until shared (`POST /projects/:ref/sources/:sourceId/access`); Google Drive sources are re-checked against the reader's own Google access before each protected request.

### Identifiers

- Ids are UUIDs. Project routes accept the UUID **or the project slug** (`/projects/payments-platform/hub`). A malformed reference answers `400`; an unknown one `404`.
- Users are identified by the provider user id (Clerk) or the configured development actor id.

### Request and response rules

- JSON bodies, `Content-Type: application/json`. Unknown properties are rejected on strict schemas (`400 VALIDATION_ERROR`).
- Lists return `{ "items": [...] }`; directory-style lists add `total`. Pagination uses `limit` (1–100, default 50) and `offset`.
- Dates are ISO-8601 strings in UTC; date-only fields use `YYYY-MM-DD`.
- Records that humans edit carry a `version` integer (optimistic locking, PRD §16.2). Send the version you read; a stale version answers `409 CONFLICT` and you must reload.
- Platform records (flags, corrections, bounties, paths, assignments, plans, check-ins, reward items, redemptions, kudos, badges, notifications, invitations, promotions, brag docs, reviews) share one envelope:

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "projectId": "uuid | null",
  "kind": "flag",
  "ownerId": "user id",
  "parentId": "uuid | null",
  "status": "open",
  "data": { "...kind specific fields..." },
  "version": 1,
  "createdAt": "2026-10-14T09:00:00.000Z",
  "updatedAt": "2026-10-14T09:00:00.000Z"
}
```

### Errors

Every non-2xx response uses one envelope (`ApiErrorResponseSchema`):

```json
{ "error": { "code": "FORBIDDEN", "message": "...", "details": {}, "requestId": "..." } }
```

| Status | Code                | Meaning                                                                  |
| ------ | ------------------- | ------------------------------------------------------------------------ |
| 400    | `VALIDATION_ERROR`  | Body, query or path failed schema validation (`details.issues`).         |
| 400    | `BAD_REQUEST`       | Semantically invalid request (for example a cycle in reporting lines).   |
| 401    | `UNAUTHENTICATED`   | Missing or invalid bearer token / webhook signature.                     |
| 403    | `FORBIDDEN`         | Role, assignment or anti-gaming rule denies the action.                  |
| 404    | `NOT_FOUND`         | Unknown, foreign-tenant or not-accessible resource.                      |
| 409    | `CONFLICT`          | Stale `version`, invalid state transition, duplicate or disabled module. |
| 413    | `PAYLOAD_TOO_LARGE` | Body above 2 MiB.                                                        |
| 429    | `RATE_LIMITED`      | Per-IP limit, flag/kudos/quiz/companion caps, sync cooldown.             |
| 502    | `UPSTREAM_ERROR`    | Model or provider call failed.                                           |
| 503    | `NOT_CONFIGURED`    | Clerk, Google, encryption key or a webhook secret is not configured.     |
| 504    | `TIMEOUT`           | Request exceeded 90 s.                                                   |

Rate limiting: 120 requests per minute per client IP by default (`RateLimit` headers are exposed).

### Streaming

`POST /ask/threads/:id/messages` answers `text/event-stream` with events `status`, `answer`, `done` or `error`. The `answer` event carries the final validated Answer; live token deltas are not emitted yet.

## 2. Endpoint index

| Area                     | Endpoints                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health                   | `GET /health`, `GET /health/ready`                                                                                                                                                                                                                                                                                                                                     |
| Workspace                | `GET /workspaces/current`, `POST /workspaces`, `PATCH /workspaces/current`, `PATCH /workspaces/current/settings`, `GET/PATCH /workspaces/current/setup`, `POST/DELETE /workspaces/current/deletion`                                                                                                                                                                    |
| Org structure            | `GET/POST /org/departments`, `PATCH/DELETE /org/departments/:id`, `GET/POST /org/teams`, `PATCH/DELETE /org/teams/:id`, `GET/PATCH /users/:id/organization`                                                                                                                                                                                                            |
| Users                    | `GET/PATCH /users/me`, `GET /users`, `PATCH /users/:id`, `POST /users/invite`, `GET /users/invitations`, `DELETE /users/invitations/:id`, `GET /people/:id`                                                                                                                                                                                                            |
| Identity links           | `GET /users/me/identities`, `POST /users/identities/link`, `PATCH/DELETE /users/identities/:provider`, `GET /users/identities/unlinked`, `POST /users/:id/identities`, `PATCH /users/:id/identities/:provider`                                                                                                                                                         |
| Assignments and access   | `GET/POST /assignments`, `DELETE /assignments/:id`, `POST /projects/:ref/memberships`, `POST /projects/:ref/sources/:sourceId/access`, `DELETE /projects/:ref/sources/:sourceId/access/:userId`                                                                                                                                                                        |
| Audit and continuity     | `GET /audit`, `GET /continuity/checklists`, `PATCH /continuity/checklists/:id`                                                                                                                                                                                                                                                                                         |
| Projects                 | `GET/POST /projects`, `GET/PATCH/DELETE /projects/:ref`                                                                                                                                                                                                                                                                                                                |
| Sources and jobs         | `GET/POST /projects/:ref/sources`, `GET/DELETE /projects/:ref/sources/:sourceId`, `POST /projects/:ref/sources/:sourceId/reprocess`, `GET /projects/:ref/jobs`, `POST /projects/:ref/jobs/:jobId/retry`                                                                                                                                                                |
| Context graph            | `GET /projects/:ref/context-items`, `PATCH /projects/:ref/context-items/:itemId/verification`, `GET /projects/:ref/decisions`, `GET /projects/:ref/decisions/:id`, `GET /projects/:ref/timeline`, `GET /projects/:ref/current-state`, `GET /evidence/:id`                                                                                                              |
| Hub                      | `GET /projects/:ref/hub`, `POST /projects/:ref/hub/refresh`, `GET /projects/:ref/hub/team`, `GET /projects/:ref/sections`, `GET /projects/:ref/sections/:sectionKey`, `GET /projects/:ref/health`                                                                                                                                                                      |
| Conflicts                | `GET /projects/:ref/conflicts`, `GET /projects/:ref/conflicts/:id`, `POST /projects/:ref/conflicts/:id/review`, `POST .../resolve`, `POST .../dispute`, `GET/POST /projects/:ref/canonical-sources`, `DELETE /projects/:ref/canonical-sources/:id`                                                                                                                     |
| Ask                      | `POST /projects/:ref/ask`, `GET /projects/:ref/questions`, `GET/POST /ask/threads`, `GET/DELETE /ask/threads/:id`, `POST /ask/threads/:id/messages`, `POST /ask/messages/:id/feedback`, `POST /ask/messages/:id/promote`, `GET /promotions/queue`, `POST /promotions/:id/decide`, `GET /projects/:ref/ask-usage`                                                       |
| Feedback                 | `GET/POST /projects/:ref/feedback`                                                                                                                                                                                                                                                                                                                                     |
| Flags and corrections    | `POST /flags`, `GET /flags/queue`, `GET /flags/:id`, `PATCH /flags/:id`, `POST /flags/:id/corrections`, `POST /corrections/:id/verify`                                                                                                                                                                                                                                 |
| Bounties                 | `GET/POST /bounties`, `GET /bounties/:id`, `POST /bounties/:id/{publish,claim,release,extend,submit,approve,cancel}`                                                                                                                                                                                                                                                   |
| Learning                 | `GET/POST /learning/paths`, `POST /learning/paths/generate`, `GET/PUT /learning/paths/:id`, `POST /learning/paths/:id/{publish,archive,assign,enrol}`, `POST /learning/paths/:id/items/:itemId/quiz`, `GET /learning/assignments`, `GET /learning/assignments/:id/progress`, `POST /learning/assignments/:id/rate`, item actions, `POST /learning/signoffs/:id/decide` |
| Probation                | `POST /probation/plans`, `GET /probation/my-plan`, `GET /probation/team`, `GET /probation/employees/:userId`, `POST .../pause`, `POST/GET .../checkins`, `POST /probation/checkins/:id/respond`, `POST .../milestones/verify`, `GET .../summary`, `POST .../outcome`                                                                                                   |
| Gamification             | `GET /gamification/me`, `GET /gamification/badges`, `GET /gamification/users/:id`, `GET /gamification/leaderboards`, `GET/POST /gamification/kudos`, `POST /gamification/adjustments`, `POST /gamification/ledger/:id/clawback`, `GET /gamification/anomalies`, `POST /gamification/anomalies/:id/decide`                                                              |
| Rewards                  | `GET/POST /rewards/catalog`, `PATCH/DELETE /rewards/catalog/:id`, `POST /rewards/redeem`, `GET /rewards/redemptions`, `POST /rewards/redemptions/:id/decide`                                                                                                                                                                                                           |
| EPM (Phase 2 add-on)     | `GET /epm/footprint`, `POST /epm/footprint/items/:id/annotate`, `POST /epm/brag-docs/generate`, `GET /epm/brag-docs`, `GET/PATCH /epm/brag-docs/:id`, `POST /epm/brag-docs/:id/share`, `GET /epm/shared/:id`, `GET/POST /epm/review-cycles`, `POST /epm/review-cycles/:id/advance`, `GET /epm/reviews`, `POST /epm/reviews/:id/{peers,submit,acknowledge}`             |
| Companion, notifications | `GET/PATCH /companion/preferences`, `GET /companion/context`, `POST /companion/stuck-help`, `POST /companion/interactions`, `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`, `GET/PATCH /notifications/preferences`                                                                                                              |
| Connectors               | `GET /connectors`, `POST /connectors/:provider/authorize`, `GET /connectors/google-drive/callback`, `GET /connectors/:id/files`, `GET/PUT /connectors/:id/scopes`, `POST /connectors/:id/sync`, `POST /connectors/:id/import`, `DELETE /connectors/:id`, `POST /webhooks/:provider`                                                                                    |
| Search, analytics, admin | `GET /search`, `GET /analytics/overview`, `GET /admin/export`                                                                                                                                                                                                                                                                                                          |

## 3. Health

### `GET /health` and `GET /health/ready`

Liveness and readiness (the latter runs `select 1` on SQLite and answers `503` when it fails). Used by Docker/Kubernetes probes.

```json
{
  "status": "ok",
  "timestamp": "...",
  "uptimeSeconds": 12,
  "version": "0.1.0",
  "checks": { "database": "ok" }
}
```

## 4. Workspace

### `GET /workspaces/current`

Workspace metadata, **resolved settings** (every default applied, `WorkspaceSettingsStateSchema`), active modules and the caller's role. Used by the app shell on load (PRD §10.3, §10.40).

```json
{
  "id": "uuid",
  "name": "Acme",
  "slug": "acme",
  "primaryDomain": "acme.com",
  "region": "us-east-1",
  "version": 3,
  "settings": {
    "includeIndirectReports": false,
    "gamification": {
      "enabled": true,
      "leaderboardsEnabled": true,
      "leaderboardDisabledDepartmentIds": [],
      "guestsCanEarn": false,
      "basePointScale": 1,
      "dailyMaintenanceCapRp": 150,
      "maxConcurrentMentees": 3,
      "bountyBudgetRp": 0,
      "autoPublishBounties": false
    },
    "rewards": {
      "enabled": false,
      "kcPerRp": 0.1,
      "kcExpiryMonths": 12,
      "monthlyIssuanceCapKc": 0,
      "perPersonMonthlyRedemptionCapKc": 0
    },
    "policies": {
      "probationDefaultDays": 90,
      "askKAnonymityThreshold": 3,
      "piiRedaction": false,
      "nudges": {
        "stuckHours": 48,
        "inactivityBusinessDays": 5,
        "signoffPendingHours": 72,
        "maxPerDay": 3
      },
      "retention": { "askConversationDays": 180, "auditLogDays": 365, "llmLogDays": 30 }
    },
    "epm": { "enabled": false, "disabledLocations": [], "retentionYears": 3 },
    "authority": {
      "delivery_status": ["ticket", "conversation", "document", "note", "pull_request"],
      "...": []
    },
    "deletion": null
  },
  "activeModules": { "gamification": true, "leaderboards": true, "rewards": false, "epm": false },
  "role": "owner",
  "authentication": "development"
}
```

### `POST /workspaces`

Create a workspace during the setup wizard (FR-WS-001). Body `WorkspaceCreateSchema`: `name`, `slug` (lowercase, hyphens), optional `primaryDomain` (stored unverified), `region` (only `us-east-1` is served by this deployment; others answer `503`). Clerk mode also creates the Organization and returns `organizationId`. Response `201`: the workspace row plus `organizationId`, `primaryDomainVerified: false`, `authentication`.

### `PATCH /workspaces/current` and `PATCH /workspaces/current/settings`

Owner/admin. Same handler; the second path is the PRD §20 form. Body `WorkspaceSettingsSchema`: `version` (required) and any of `name`, `timezone`, `includeIndirectReports`, `gamification`, `rewards`, `policies`, `epm`, `authority`. Each section is a **partial deep merge**; omitted fields keep their value. `policies.askKAnonymityThreshold` cannot go below 3 (fixed floor). Response: the workspace with resolved settings. Errors: `409` on a stale version.

Used by the Admin Console: gamification config (FR-ADM-004), source authority editor (FR-ADM-005), policies (FR-ADM-006), rewards and EPM toggles.

### `GET /workspaces/current/setup`, `PATCH /workspaces/current/setup`

Owner/admin. Resumable wizard progress (FR-WS-009). GET returns the setup record (`data.steps`, `status`) plus `evidence` (`completed` per step, `sync` counts of the caller's readable sources). PATCH body `{ version, step, status }` where step ∈ `connect_source | select_scopes | create_project | invite_team | assign_new_hire` and status ∈ `pending | completed | skipped`; marking a step `completed` without evidence answers `409`.

### `POST /workspaces/current/deletion`, `DELETE /workspaces/current/deletion`

Owner only (FR-ADM-008). POST body `{ "confirm": "<slug or name>" }` schedules a hard delete 7 days later (`202 { deletion: { scheduledAt, requestedBy, requestedAt } }`), notifies admins (security category) and shows under `settings.deletion`. The maintenance sweep purges the workspace when the time arrives. DELETE cancels (`204`).

## 5. Org structure

| Endpoint                        | Who                  | Purpose                                                                                                                                                     |
| ------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /org/departments`          | non-guest            | Paginated departments.                                                                                                                                      |
| `POST /org/departments`         | owner/admin          | `{ name }` → `201` department.                                                                                                                              |
| `PATCH /org/departments/:id`    | owner/admin          | `{ name }`.                                                                                                                                                 |
| `DELETE /org/departments/:id`   | owner/admin          | `204`; `409` while members or teams reference it.                                                                                                           |
| `GET /org/teams`                | non-guest            | `?departmentId=` filter.                                                                                                                                    |
| `POST /org/teams`               | owner/admin          | `{ name, departmentId, parentId? }`; nesting ≤ 3 levels, same department, no cycles (FR-WS-006).                                                            |
| `PATCH /org/teams/:id`          | owner/admin          | `{ name?, parentId? }`.                                                                                                                                     |
| `DELETE /org/teams/:id`         | owner/admin          | `204`; `409` while referenced.                                                                                                                              |
| `GET /users/:id/organization`   | self, manager, admin | `{ userId, managerId, organization }` with `departmentId`, `teamId`, `jobTitle`, `roleFamily`, `location`, `timezone`, `startDate`, `isNewHire`, `lastDay`. |
| `PATCH /users/:id/organization` | owner/admin          | `MemberOrganizationSchema`; team must belong to the department.                                                                                             |

## 6. Users and directory

### `GET /users/me`

Profile for Personal Settings and the app shell: user row (`id`, `name`, `email`, `preferences`), `role`, `workspaceId`, `managerId`, `organization`, `assignments[]`, `identities[]` (`provider`, `status`, `externalLogin`, `linkedAt`).

### `PATCH /users/me`

`ProfileUpdateSchema`: `name`, `timezone`, `leaderboardOptOut` (symmetric opt-out, §8.5), `hideTier` (hides tier/RP on the public profile). Response: user row.

### `GET /users`

Directory (People page, invite pickers, Admin → Users). Guests are refused. Query `UserDirectoryQuerySchema`: `q` (name, email, job title), `role`, `status`, `departmentId`, `teamId`, `limit`, `offset`.

```json
{
  "total": 12,
  "items": [
    {
      "id": "u1",
      "name": "Priya",
      "email": "p@acme.com",
      "role": "member",
      "status": "active",
      "managerId": "u9",
      "organization": { "departmentId": "..." },
      "tier": "keeper"
    }
  ]
}
```

`tier` is null when gamification is off or the person hides it.

### `PATCH /users/:id`

Owner/admin (Admin → Users, FR-ADM-002). `UserUpdateSchema`: `role`, `status` (`active | suspended | offboarded`), `managerId` (no cycles, no self), `guestExpiresAt` (required for guests, ≤ 180 days), `lastDay` (optional future last day, PRD §8.11). Only owners manage ownership; the last active owner cannot be removed. Suspending or offboarding atomically removes project memberships, source grants and assignments, invalidates pending OAuth state, marks connectors `needs_reauth` (offboarding also wipes credentials), freezes identity links, cancels the onboarding plan, writes a `user.<status>` outbox event and creates a **continuity checklist** for the manager with a notification. Role changes notify the user and admins (security). Response: membership row.

### `POST /users/invite`

Owner/admin, or manager for `member` invites into their own team (FR-WS-003). Body is one `InvitationSchema` (`email`, `role`, `name?`, `departmentId?`, `teamId?`, `managerId?`, `startDate?`, `isNewHire`) or `{ "invitations": [...] }` (≤ 200, CSV rows parsed client-side). Each invitation is recorded locally (`invitation` record, 14-day expiry) and, in Clerk mode, delivered as an Organization invitation. On the invitee's first sign-in the requested role, department, team, manager and start date are applied automatically. Response `201`:

```json
{
  "items": [
    {
      "email": "new@acme.com",
      "status": "pending",
      "invitationId": "uuid",
      "providerInvitationId": null,
      "requestedRole": "member",
      "delivery": "local"
    }
  ]
}
```

`status` is `already_member` or `pending` (existing invitation reused). Single-invite bodies also return the first item's fields at top level.

### `GET /users/invitations`, `DELETE /users/invitations/:id`

Owner/admin: list invitation records; revoke a pending one (`204`, also revoked in Clerk).

### `GET /people/:id`

Public profile card for the People directory: `id`, `name`, `role`, `organization`, active domain-owner assignments. Guests refused.

## 7. Identity links (PRD §6.6)

Links map a member to their identity in each connected tool for permission parity and contribution attribution. Statuses: `suggested` → `confirmed` | `rejected`; sources: `oauth`, `admin`, `user`, `auto_match`.

| Endpoint                                | Who         | Behaviour                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /users/me/identities`              | self        | `{ items }` of own links.                                                                                                                                                                                                                                                                                                                                       |
| `POST /users/identities/link`           | self        | `IdentityLinkInputSchema` `{ provider, externalId?, externalLogin?, email? }`. `google`: links the connected Drive account (`201`, confirmed, OAuth-verified) or returns `202 { status: "authorization_required", authorizationUrl }`. Other providers: creates a `suggested` link that an admin confirms. `409` if the identity is confirmed for someone else. |
| `PATCH /users/identities/:provider`     | self        | `{ status: "confirmed" \| "rejected" }` for links suggested by an admin or auto-match. User-asserted links cannot be self-confirmed (`409`).                                                                                                                                                                                                                    |
| `DELETE /users/identities/:provider`    | self        | Unlink (`204`).                                                                                                                                                                                                                                                                                                                                                 |
| `GET /users/identities/unlinked`        | owner/admin | `{ pending: [suggested links], membersWithoutLinks: [{ id, name, email, missingProviders }] }` (Admin → Users → Unlinked identities).                                                                                                                                                                                                                           |
| `POST /users/:id/identities`            | owner/admin | `AdminIdentityLinkInputSchema` (externalId required) → suggested link; the member is notified to confirm.                                                                                                                                                                                                                                                       |
| `PATCH /users/:id/identities/:provider` | owner/admin | Confirm or reject a suggested link.                                                                                                                                                                                                                                                                                                                             |

Webhook events (section 22) resolve identities through confirmed links only.

## 8. Assignments and source access

| Endpoint                                                 | Who                                                     | Purpose                                                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /assignments`                                       | owner/admin                                             | All assignments.                                                                                                                                                                  |
| `POST /assignments`                                      | owner/admin; managers for mentor/curator of own reports | `AssignmentInputSchema` `{ userId, type, scopeType: project \| user \| workspace \| section, scopeId, expiresAt? }`. Section scope ids are `<projectId>:<sectionKey>`. `201` row. |
| `DELETE /assignments/:id`                                | owner/admin                                             | `204`.                                                                                                                                                                            |
| `POST /projects/:ref/memberships`                        | owner/admin                                             | `{ userId }` grants explicit project membership (required for guests).                                                                                                            |
| `POST /projects/:ref/sources/:sourceId/access`           | owner/admin with access                                 | `{ userId, expiresAt? }` shares a **manual** source. Connected sources answer `403` (provider-controlled).                                                                        |
| `DELETE /projects/:ref/sources/:sourceId/access/:userId` | owner/admin                                             | Revoke a manual grant.                                                                                                                                                            |

## 9. Audit log and continuity

### `GET /audit`

Owner/admin (FR-ADM-007), and HR for the People Ops trail only: `onboarding.*`, `probation.*` and `user.organization.update` events (HR never sees role, access or connector changes). Query: `limit`, `offset`, `action`, `actorId`, `targetType`, `from`, `to`, `format=json|csv`. Entries are hash-chained (`previousHash`, `entryHash`) and append-only at the database level. Project-scoped rows are shown only when the caller can read every source in that project. CSV responses are themselves audited (`audit.export`). JSON: `{ total, items }`.

### `GET /continuity/checklists`, `PATCH /continuity/checklists/:id`

Knowledge continuity after offboarding (PRD §8.11). Managers see their own checklists; admins see all. Each `data.areas[]` entry is an owned area (`key`, `type`, `scopeType`, `scopeId`, `status: unowned | reassigned`, `assigneeId`, `bountyId`). PATCH `{ version, areas: [{ key, status, assigneeId? }] }`; admins reassigning also create the assignment. Areas still unowned 7 days later become "Become the owner of X" bounties (30 RP) through the maintenance sweep.

## 10. Projects

`ProjectSchema`: `id`, `workspaceId`, `name`, `slug`, `description`, `createdAt`, `updatedAt`; with stats (`ProjectWithStatsSchema`): `stats.sources`, `readySources`, `contextItems`, `questions`, `lastProcessedAt` (all computed for the caller's access).

| Endpoint                | Who                            | Notes                                                                                                                                                 |
| ----------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /projects`         | any (guests: granted projects) | `{ items: ProjectWithStats[] }`.                                                                                                                      |
| `POST /projects`        | owner/admin/manager            | `CreateProjectInputSchema` `{ name, description?, slug? }`; the slug is generated from the name when omitted (`payments-platform`, `-2`, ...). `201`. |
| `GET /projects/:ref`    | any with access                | Project with stats.                                                                                                                                   |
| `PATCH /projects/:ref`  | owner/admin/manager            | `{ name?, description?, slug? }`; duplicate slug `409`.                                                                                               |
| `DELETE /projects/:ref` | owner/admin/manager            | Cascades sources, items, hub, jobs. `204`.                                                                                                            |

## 11. Sources and jobs

| Endpoint                                          | Who                 | Purpose                                                                                                                                                                                                                                              |
| ------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /projects/:ref/sources`                      | access              | Readable sources (`SourceObjectSchema`: connector, kind, title, url, author, source/ingestion times, status `pending\|processing\|ready\|failed`, `contentLength`, `chunkCount`).                                                                    |
| `POST /projects/:ref/sources`                     | owner/admin/manager | `CreateSourceInputSchema` `{ kind: document\|conversation\|ticket\|pull_request\|note, title, content (≤ 200k chars), url?, author?, sourceCreatedAt?, sourceUpdatedAt?, visibility: restricted (default) \| workspace }`. Queues processing. `201`. |
| `GET /projects/:ref/sources/:sourceId`            | access              | Detail with `content`.                                                                                                                                                                                                                               |
| `POST /projects/:ref/sources/:sourceId/reprocess` | owner/admin/manager | Re-run the pipeline (`202`).                                                                                                                                                                                                                         |
| `DELETE /projects/:ref/sources/:sourceId`         | owner/admin/manager | Removes the source, its evidence and orphaned items; queues a hub refresh. `204`.                                                                                                                                                                    |
| `GET /projects/:ref/jobs`                         | access              | `?status=queued\|running\|done\|failed&limit=` → `JobSchema[]` (`process_source`, `refresh_hub`, `sync_connector`), filtered by the sources the caller can read.                                                                                     |
| `POST /projects/:ref/jobs/:jobId/retry`           | owner/admin/manager | Re-queue a failed job (`202`).                                                                                                                                                                                                                       |

Pipeline: chunk → FTS5 index → embeddings (best effort) → structured extraction with verbatim quote verification → merge/corroborate → **conflict materialisation** (section 13) → hub refresh.

## 12. Context graph

`ContextItemSchema` (discriminated by `kind`: `decision`, `event`, `status_claim`, `person`, `component`, `dependency`, `term`): `id`, `projectId`, `title`, `summary`, `data` (kind-specific), `eventAt`, `asOf`, `verification` (`inferred | confirmed | stale | disputed | superseded`), `confidence`, `conflictsWith[]`, `supersededBy`, `evidence[]` (`id`, `sourceObjectId`, `chunkId`, `sourceTitle`, `sourceKind`, `sourceUrl`, `sourceCreatedAt`, `quote`, `quoteVerified`), `createdAt`, `updatedAt`. Items are returned only when every supporting source is readable by the caller.

| Endpoint                                                  | Who                                      | Purpose                                                                                                  |
| --------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `GET /projects/:ref/context-items?kind=`                  | access                                   | All visible items (hub lists, flag targets, quiz authoring).                                             |
| `PATCH /projects/:ref/context-items/:itemId/verification` | domain owner with evidence access (PP-9) | `{ verification }` → item. Audited as `context_item.verify`.                                             |
| `GET /projects/:ref/decisions`                            | access                                   | Decision log cards (FR-HUB-007): statement, rationale, alternatives, participants, consequences, status. |
| `GET /projects/:ref/decisions/:id`                        | access                                   | One decision.                                                                                            |
| `GET /projects/:ref/timeline`                             | access                                   | Events and decisions (FR-HUB-008).                                                                       |
| `GET /projects/:ref/current-state`                        | access                                   | Status claims that are not stale or superseded (FR-HUB-010).                                             |

### `GET /evidence/:id`

Source Drawer payload (PRD §10.15, FR-ASK-003). `404` unless the caller can read the source. Response:

```json
{
  "id": "evidence uuid",
  "quote": "We will move billing into a dedicated ledger service",
  "quoteVerified": true,
  "span": [245, 301],
  "item": {
    "id": "...",
    "projectId": "...",
    "kind": "decision",
    "title": "...",
    "verification": "inferred",
    "confidence": "high"
  },
  "source": {
    "id": "...",
    "title": "ADR-0007",
    "kind": "document",
    "connector": "manual",
    "url": "...",
    "author": "Priya Shah",
    "sourceCreatedAt": "...",
    "sourceUpdatedAt": null
  },
  "chunk": { "id": "...", "ordinal": 2, "content": "..." },
  "context": { "before": { "id": "...", "ordinal": 1, "content": "..." }, "after": null },
  "extractionRunId": "...",
  "createdAt": "..."
}
```

## 13. Hub, sections and Knowledge Health Score

### `GET /projects/:ref/hub`

Project Hub shell (PRD §10.11). `HubSchema`: `project` (with stats), `overview` (cited overview or null when sources changed or the caller lacks complete access), `sync` (`state`, queued/running/failed counts, `lastCompletedAt`), `counts` per kind, **`khs`** (section 13 KHS), **`sections`** (ten `SectionSummarySchema` entries: `key`, `title`, `status: ready|empty`, `claims`, `lastGeneratedAt`, `lastSourceChangeAt`, `domainOwner { userId, name, scope }`) and **`team`** (`userId`, `name`, `role`, `assignments[]` including `hub_owner`).

### `POST /projects/:ref/hub/refresh`

Owner/admin/manager. Queues overview regeneration (`202` sync status).

### `GET /projects/:ref/hub/team`

`{ items }` of the project team (explicit members, scoped assignments, hub creator).

### `GET /projects/:ref/sections`

`{ khs, items: SectionSummary[] }` for the hub navigation (FR-HUB-002/004).

### `GET /projects/:ref/sections/:sectionKey`

One rendered section for the caller's permission set. Keys: `overview`, `business_context`, `architecture`, `timeline`, `decisions`, `people`, `current_state`, `dependencies`, `resources`, `glossary`. Response:

```json
{
  "key": "current_state",
  "title": "Current State",
  "status": "ready",
  "generatedAt": "...",
  "lastSourceChangeAt": "...",
  "coverage": { "sources": 4, "tools": ["manual", "google_drive"], "claims": 7 },
  "domainOwner": { "userId": "u1", "name": "Priya", "scope": "project" },
  "content": {
    "asOf": "...",
    "activeWork": [],
    "planned": [],
    "blockers": [],
    "risks": [],
    "openQuestions": [],
    "done": [],
    "unresolvedConflicts": 1,
    "recentChanges": []
  },
  "emptyState": null
}
```

Every claim in `content` carries `chip` (`Inferred | Verified | Stale | Disputed | Superseded`, FR-HUB-003), `staleCandidate` (freshness window exceeded, §8.6.4), `conflictsWith` and `evidence[]`. Empty sections answer `status: "empty"` with `emptyState.message` "Not enough source evidence yet" and suggestions (FR-HUB-005). Section-specific content keys: overview → `overview`, `claims`; business_context → `problem`, `users`, `keyDecisions`; architecture → `howItWorks`, `components`, `dependencies`; timeline → `entries[]` with `date`; decisions → `decisions`, `superseded`; people → `people[]` with `ownershipLabel: confirmed | inferred`; dependencies → `dependencies`; resources → `sources[]`; glossary → `terms`.

### `GET /projects/:ref/health`

Knowledge Health Score (PRD §8.13, FR-ANL-001): `score` (0–100), `components` (`verifiedRatio`, `staleRatio`, `disputedRatio`, `ownedRatio`, `coverageRatio`, `flagSlaRatio`), `weights`, top three `improvements` (`action`, `count`, `link`) and `computedAt`.

## 14. Conflicts and source authority (PRD §8.1.4, §8.6)

Conflicts are materialised when ingestion finds status claims about the same subject with incompatible states. Statuses: `open`, `under_review`, `auto_resolved`, `resolved`, `accepted_ambiguity`. Detection applies the authority rules: a member whose evidence outranks the others for the topic (canonical source first, then `settings.authority[topic]` by source kind) **and** is not older is `auto_resolved` by rule (losers become `superseded`, labelled and disputable). Never resolved on recency alone. Open conflicts create a draft bounty (`origin: conflict`, reward `resolve_conflict`) and notify domain owners (batched daily).

`ConflictView`: `id`, `projectId`, `subjectKey`, `subject`, `topicType`, `status`, `members[]` (full visible items), `memberCount`, `canonicalItemId`, `rationale`, `autoRule`, `resolvedBy`, `resolvedAt`, `bountyId`, `version`, timestamps. A conflict is shown only when at least two members are readable (PP-2).

| Endpoint                                      | Who                                               | Notes                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /projects/:ref/conflicts?history=`       | access                                            | Open/under review/auto-resolved/accepted conflicts; `history=true` adds resolved ones.                                                                                                                                                                                                                                                           |
| `GET /projects/:ref/conflicts/:id`            | access                                            | Side-by-side detail (PRD §10.14).                                                                                                                                                                                                                                                                                                                |
| `POST /projects/:ref/conflicts/:id/review`    | domain owner (project or `current_state` section) | `{ version }` → `under_review`.                                                                                                                                                                                                                                                                                                                  |
| `POST /projects/:ref/conflicts/:id/resolve`   | domain owner who can read all members             | `ConflictResolveInputSchema` `{ version, outcome: resolved \| accepted_ambiguity, canonicalItemId?, rationale }`. Resolved: canonical → `confirmed`, others → `superseded` with `supersededBy`; ambiguity: all members `confirmed`. Posts `resolve_conflict` RP (staleness by evidence age), cancels the auto-bounty, emits `conflict.resolved`. |
| `POST /projects/:ref/conflicts/:id/dispute`   | any reader                                        | `{ version, reason }` reopens an `auto_resolved` conflict; superseded losers become `disputed`.                                                                                                                                                                                                                                                  |
| `GET /projects/:ref/canonical-sources`        | access                                            | Sources marked canonical per topic.                                                                                                                                                                                                                                                                                                              |
| `POST /projects/:ref/canonical-sources`       | domain owner                                      | `{ sourceId, topicType }` (`architecture`, `delivery_status`, `product_requirements`, `ownership`, `process`, `customer_facts`). Canonical evidence outranks defaults.                                                                                                                                                                           |
| `DELETE /projects/:ref/canonical-sources/:id` | domain owner                                      | `204`.                                                                                                                                                                                                                                                                                                                                           |

## 15. Ask ContextOS

`AnswerSchema`: `id`, `projectId`, `question`, `answer` (inline `[n]` citations), `confidence` (`high | medium | low | insufficient`), `rationale`, `currentState { statement, asOf }`, `timelineContext`, `uncertainties[]`, `citations[]` (`ref`, `chunkId`, `sourceObjectId`, `sourceTitle`, `sourceKind`, `sourceUrl`, `sourceCreatedAt`, `excerpt`, `claim`), `relatedItems[]`, `model`, `createdAt`. Citations are validated server-side; uncited output is regenerated once and then replaced by an "insufficient evidence" answer (FR-ASK-004). Retrieval is pre-filtered by the caller's readable sources (FR-ASK-005).

| Endpoint                          | Who                                                  | Purpose                                                                                                                                                                                                                                                    |
| --------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /projects/:ref/ask`         | access                                               | `{ question }` → `201` Answer (synchronous).                                                                                                                                                                                                               |
| `GET /projects/:ref/questions`    | asker                                                | Own answer history whose sources are still readable.                                                                                                                                                                                                       |
| `POST /ask/threads`               | access                                               | `ThreadInputSchema` `{ projectId, sourceId?, title }` → `201` thread (scope: project or single source, FR-ASK-001).                                                                                                                                        |
| `GET /ask/threads`                | self                                                 | Own threads.                                                                                                                                                                                                                                               |
| `GET /ask/threads/:id`            | self                                                 | Thread with `messages[]` (answers still readable).                                                                                                                                                                                                         |
| `DELETE /ask/threads/:id`         | self                                                 | Deletes the thread and its answers (`204`).                                                                                                                                                                                                                |
| `POST /ask/threads/:id/messages`  | self                                                 | `{ question }` → SSE (`status`, `answer`, `done` / `error`).                                                                                                                                                                                               |
| `POST /ask/messages/:id/feedback` | asker                                                | `AnswerFeedbackInputSchema` `{ rating: up \| down, reason?: wrong \| outdated \| missing_source \| not_helpful \| leaked, comment? }` (reason required for `down`). `leaked` alerts admins (security) without exposing the question. → `{ id, feedback }`. |
| `POST /ask/messages/:id/promote`  | asker (not guest)                                    | `{ title?, note? }` proposes a cited answer as a hub FAQ claim (FR-ASK-009). `201` promotion record (`data.question`, `answer`, `sourceIds`). Repeat calls return the pending proposal.                                                                    |
| `GET /promotions/queue`           | proposer / domain owners                             | Pending proposals the caller may verify or owns, filtered by source access.                                                                                                                                                                                |
| `POST /promotions/:id/decide`     | domain owner (not proposer, must read cited sources) | `{ version, accepted, reason }`. Accepted → a `note` source `FAQ: <question>` is created (queued for processing, asker keeps access) and the asker earns `ask_promoted`. Response: record plus `sourceId`.                                                 |
| `GET /projects/:ref/ask-usage`    | manager/owner/admin                                  | Aggregate question **counts** per direct report (FR-ASK-014); never content.                                                                                                                                                                               |

Managers and admins never read another person's questions (decision D1); such requests answer `404`.

## 16. Feedback (compatibility)

`GET /projects/:ref/feedback` lists the caller's feedback; `POST` with `CreateFeedbackInputSchema` `{ targetType: context_item | answer | overview, targetId, kind: correct | incorrect | outdated | missing_context | conflicting, note? }`. The maintenance workflow uses flags (section 17); this endpoint remains for the current web UI.

## 17. Flags and corrections (PRD §8.1.2, FR-KM)

Flag statuses: `open → triaged → in_progress → pending_verification → resolved`, plus `rejected`, `duplicate`, `bounty_created`. Flags carry `data.sourceIds` (the evidence they depend on) and are hidden from reviewers who cannot read those sources.

### `POST /flags`

Any member including guests. `FlagInputSchema` `{ projectId, targetType: context_item | overview | answer | section | path_item, targetId, kind: stale | incorrect | missing_context | conflicting, comment?, evidenceUrl? }` (`section` targets use the section key; `path_item` uses `<pathId>:<itemId>`). Routing (FR-KM-002): the most specific domain owner (section → project → workspace), else the hub creator; stored in `data.routedTo { userId, basis }` and notified (batched hourly). An open flag on the same target and kind by another person is **merged**: the caller becomes a co-reporter and the existing flag is returned with `200` and `merged: true` (FR-KM-006). Limit 30 flags per person per day (`429`, AG-4). `201` otherwise.

### `GET /flags/queue`

My Queue (PRD §10.21, FR-KM-007):

```json
{ "items": [flags I reported, routed to me, or in my owned projects], "staleCandidates": [claims past their freshness window in my owned projects], "conflicts": [open conflicts I can resolve], "bounties": [open bounties] }
```

### `GET /flags/:id`

Reporter, routed owner or domain owner: flag with `corrections[]`.

### `PATCH /flags/:id`

Domain owner. `FlagUpdateInputSchema` `{ version, status: triaged | in_progress | resolved | rejected | duplicate | bounty_created, reason, duplicateOfId?, rewardRp? }`. Transitions: open → triaged/duplicate/rejected/bounty_created; triaged → in_progress/rejected/bounty_created; in_progress → resolved/rejected; pending_verification → rejected. Rejection needs a reason. `bounty_created` creates a draft bounty linked by `data.flagId` (reward from the base table or `rewardRp`) and credits the flagger (`flag_accepted`) and co-reporters (`flag_coreporter`). Resolution notifies the flagger.

### `POST /flags/:id/corrections`

Any reader of the flag. `{ type: contextos_note | supersede | source_edit, text, successorId?, sourceUrl? }`. Moves the flag to `pending_verification` and notifies domain owners. `201` correction record.

### `POST /corrections/:id/verify`

Domain owner, or two independent project members when no owner is assigned (FR-KM-005). `{ version, accepted, reason }`. Rules: no self-verification (AG-1); a manager verifying a direct report counts at quality 0.75 unless they are the domain owner (AG-9); reciprocal verification patterns hold the award for admin review (AG-5); flag-then-fix by the same person halves the fix reward (AG-2). Accepted: supersession marks the target `superseded` with `supersededBy`; notes become new restricted `note` sources; the flag resolves; the fixer earns `fix_stale` / `fix_incorrect` / `add_missing_context` (staleness by claim age) and the flagger `flag_accepted`. Rejected: the flag returns to `in_progress` and the author is notified.

## 18. Bounties (PRD §8.1.3, FR-GAM-005)

Bounty record `data`: `projectId`, `title`, `description`, `acceptanceCriteria`, `origin` (`manual | conflict | stale | gap | ownership | flag`), `targetType`, `targetId`, `rewardRp`, `rewardKc`, `sponsorId` (`system` for auto-created), `verifierId`, `deadline`, `claimantId`, `claimedAt`, `claimExpiresAt`, `extended`, `submission { note, evidenceUrl, correctionId, submittedAt }`, `decisions[]`, `paidAt`, `flagId`, `conflictId`. Statuses: `draft → open → claimed → submitted → paid`, plus `expired` and `cancelled`. Deadlines and the 7-day claim window are evaluated lazily on read and by the maintenance sweep.

| Endpoint                     | Who                                                                 | Notes                                                                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /bounties`              | non-guest (guests only when `guestsCanEarn`)                        | `BountyListQuerySchema`: `status`, `projectId`, `origin`, `mine`, `limit`, `offset`. Drafts are visible to their sponsor and admins only.                                                                                     |
| `POST /bounties`             | owner/admin/manager, `bounty_sponsor`, or Keeper+ tier for ≤ 50 RP  | `BountyInputSchema` `{ projectId, title, description, acceptanceCriteria, rewardRp (10–500), rewardKc, deadline?, verifierId?, targetType?, targetId?, publish }`. Budget check against `gamification.bountyBudgetRp`. `201`. |
| `GET /bounties/:id`          | access                                                              | Bounty detail (PRD §10.23).                                                                                                                                                                                                   |
| `POST /bounties/:id/publish` | admin, sponsor assignment, or the sponsor                           | `{ version }` draft → open.                                                                                                                                                                                                   |
| `POST /bounties/:id/claim`   | eligible member, not the sponsor (AG-10)                            | `{ version }` → claimed for 7 days; sponsor notified.                                                                                                                                                                         |
| `POST /bounties/:id/release` | claimant, sponsor or admin                                          | `{ version }` → open.                                                                                                                                                                                                         |
| `POST /bounties/:id/extend`  | claimant, once                                                      | `{ version }` adds 7 days.                                                                                                                                                                                                    |
| `POST /bounties/:id/submit`  | claimant                                                            | `BountySubmitInputSchema` `{ version, note, evidenceUrl?, correctionId? }` → submitted; verifier notified.                                                                                                                    |
| `POST /bounties/:id/approve` | verifier, sponsor, domain owner or admin; never the claimant (AG-1) | `BountyDecisionSchema` `{ version, approved, note }`. Approved → `paid`: `bounty_completed` RP (+ KC when enabled), linked flag resolved, `bounty.completed` event. Rejected → back to `claimed` with changes requested.      |
| `POST /bounties/:id/cancel`  | sponsor or admin                                                    | `{ version }` for draft/open bounties.                                                                                                                                                                                        |

## 19. Learning paths and checkpoints (PRD §7.6, §7.7)

Path records: `learning_path` (draft/published/archived, `data.items[]`, `quizDefinitions`, `publishedVersionId`, `ratingAvg`, `ratingCount`), immutable `path_version` snapshots, `path_assignment` (`data.userId`, `mentorId`, `startDate`, `completedAt`, `rating`), `item_progress` per learner and item (`status: in_progress | awaiting_verification | completed | skipped`, `data.dwellSeconds`, `score`, `attempts`, `completedAt`, `verifiedBy`, `stuckNotifiedAt`).

`PathItemInputSchema`: `id?`, `type` (`read | explore | watch | meet | do | quiz | reflect | link`), `title`, `objective`, `module?`, `estMinutes`, `dueOffsetDays`, `required`, `prerequisites[]`, `verification` (`engagement | quiz | event | signoff | self`), `eventTrigger?` (`github.pr.merged`, `github.pr.review_submitted`, `jira.issue.transitioned_to_done`, `jira.issue.created`, `drive.doc.edited`, `slack.message.posted_in_channel`), `sourceId?`, `sourceIds?`, `url?`. Required items cannot be self-attested except `meet` items; `event` items need an `eventTrigger`.

| Endpoint                                                 | Who                                             | Notes                                                                                                                                                                                                                                       |
| -------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /learning/paths`                                    | access                                          | Published paths, plus drafts the caller may curate. Inaccessible items render as restricted placeholders with `required: false` (PP-8).                                                                                                     |
| `POST /learning/paths`                                   | curator (owner/admin/manager/`path_curator`)    | `PathInputSchema` `{ projectId, title, roleFamily, items }` → `201` draft.                                                                                                                                                                  |
| `POST /learning/paths/generate`                          | curator                                         | `{ projectId, roleFamily, title?, targetDays }` drafts a dependency-ordered path (context → people → decisions → current state → first task) from current claims (FR-LRN-001). `409` without processed evidence.                            |
| `GET /learning/paths/:id`                                | access                                          | Rendered path.                                                                                                                                                                                                                              |
| `PUT /learning/paths/:id`                                | curator                                         | `PathInputSchema & { version }` replaces the draft.                                                                                                                                                                                         |
| `POST /learning/paths/:id/items/:itemId/quiz`            | curator                                         | 3–5 multiple-choice questions, each citing a current claim (`claimId`). Required before publishing quiz items (FR-CHK-002).                                                                                                                 |
| `POST /learning/paths/:id/publish`                       | a **different** curator                         | `{ version }` creates an immutable version; the author earns `path_published` (FR-LRN-005).                                                                                                                                                 |
| `POST /learning/paths/:id/archive`                       | curator                                         | `{ version }`.                                                                                                                                                                                                                              |
| `POST /learning/paths/:id/assign`                        | curator, the learner's manager, or their mentor | `{ userId, mentorId?, startDate }` → `201` assignment; learner notified.                                                                                                                                                                    |
| `POST /learning/paths/:id/enrol`                         | member                                          | Self-enrol in a published path (FR-LRN-011); `200` when already enrolled.                                                                                                                                                                   |
| `GET /learning/assignments`                              | self                                            | Own assignments.                                                                                                                                                                                                                            |
| `GET /learning/assignments/:id/progress`                 | learner, mentor, direct manager                 | `{ assignment, path, summary { requiredTotal, requiredCompleted, percent, remainingMinutes, upNextItemId }, items[] }`; each progress row has `stuck` (open > 48 h). Mentors/managers see pass/not-yet only (FR-CHK-007).                   |
| `POST /learning/assignments/:id/rate`                    | learner, after completion                       | `{ version, rating 1–5, comment }` (FR-LRN-013); updates the path's rating average.                                                                                                                                                         |
| `POST /learning/assignments/:a/items/:i/start`           | learner                                         | Opens an item once prerequisites are complete and the start date has passed → `201` progress.                                                                                                                                               |
| `POST /learning/assignments/:a/items/:i/dwell`           | learner                                         | `{ version }` heartbeat for engagement items (≤ 15 s credited per beat; complete at 60 s or 25% of estimate, FR-CHK-001a).                                                                                                                  |
| `GET /learning/assignments/:a/items/:i/quiz`             | learner                                         | Questions without answer keys; `404` when cited evidence is no longer current.                                                                                                                                                              |
| `POST /learning/assignments/:a/items/:i/quiz/submit`     | learner                                         | `{ version, answers[] }` → `{ progress, passed, score, assignmentCompleted, explanations }`. Pass ≥ 70%; 10-minute cooldown after two failures; first-try pass earns `quiz_passed_first_try`; third failure nudges the mentor (FR-CHK-003). |
| `POST /learning/assignments/:a/items/:i/signoff/request` | learner                                         | → `awaiting_verification`; mentor (or manager when no mentor) notified. Escalates to the other party after 72 h (FR-CHK-005).                                                                                                               |
| `POST /learning/signoffs/:progressId/decide`             | mentor or direct manager, never the learner     | `{ version, approved, note }`.                                                                                                                                                                                                              |
| `POST /learning/assignments/:a/items/:i/attest`          | learner                                         | `{ version }` self-attest optional or `meet` items.                                                                                                                                                                                         |
| `POST /learning/assignments/:a/items/:i/skip`            | learner                                         | `{ version }` skip an optional item.                                                                                                                                                                                                        |

Completion credit: when every required and accessible item is done the assignment becomes `completed`, the learner earns `path_completed` and the path author `path_learner_complete` (plus 1 RP per item, capped per path per month). Real-work `event` items are completed by webhooks (section 22).

## 20. Probation and onboarding (PRD §7.8, §8.8)

Plan record `data`: `userId`, `mentorId`, `secondaryMentorId?`, `managerId`, `projectId`, `startDate`, `endDate`, `lengthDays`, `pausedUntil`, `milestones[]` (`key`, `title`, `dueOffsetDays`, `dueDate`, `status`, `note`, `verifiedBy`, `achievedAt`), `ttfwDays`, `firstWinAt`, `fastFirstWin`, `outcome`, `outcomeNote`. Statuses: `scheduled`, `active`, `closed`, `cancelled`. Every plan response includes `health`:

```json
{
  "status": "needs_attention",
  "reasons": ["Milestone \"Week 1\" is overdue"],
  "signals": {
    "overdueMilestones": 1,
    "requiredItemsDone": 3,
    "requiredItemsTotal": 8,
    "pacePercent": 38,
    "expectedPacePercent": 45,
    "stuckItems": 0,
    "inactiveBusinessDays": 1,
    "pendingSignoffHours": null
  },
  "waitingOnMentor": false,
  "pausedUntil": null,
  "computedAt": "..."
}
```

Health follows §8.8.2 exactly and is identical for employee, mentor and manager. It is never a rating.

| Endpoint                                              | Who                                   | Notes                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /probation/plans`                               | the learner's direct manager          | `{ userId, mentorId, secondaryMentorId?, projectId, startDate, lengthDays?, milestones? }`. Defaults: workspace probation length and the Day 1 / Week 1 / Day 30 / first win / Day 90 framework. Creates mentor assignments (max 3 concurrent mentees, FR-MEN-001; scope expires 14 days after the plan). Notifies hire and mentor. `201`.                                                         |
| `GET /probation/my-plan`                              | employee                              | Own plan with health (PRD §10.16).                                                                                                                                                                                                                                                                                                                                                                 |
| `GET /probation/team`                                 | manager / mentor                      | Plans of direct reports and mentees with `relationship`, `paths { total, completed }`, `firstWin` (Team View §10.24, Mentor Dashboard §10.27). Admin rights alone give no access.                                                                                                                                                                                                                  |
| `GET /probation/employees/:userId`                    | employee, manager, mentor             | Plan with health.                                                                                                                                                                                                                                                                                                                                                                                  |
| `POST /probation/employees/:userId/pause`             | employee or manager                   | `{ version, pausedUntil }` (null resumes); health is suppressed while paused.                                                                                                                                                                                                                                                                                                                      |
| `POST /probation/employees/:userId/checkins`          | manager                               | `{ wentWell, toImprove, supportNeeded }` → `201`; employee notified (N11).                                                                                                                                                                                                                                                                                                                         |
| `GET /probation/employees/:userId/checkins`           | participants                          | Check-ins with employee responses.                                                                                                                                                                                                                                                                                                                                                                 |
| `POST /probation/checkins/:id/respond`                | employee                              | `{ version, response }`.                                                                                                                                                                                                                                                                                                                                                                           |
| `POST /probation/employees/:userId/milestones/verify` | mentor or manager, never the employee | `{ version, key, note }`. `first_win` records `ttfwDays`, compares with the department median (≥ 5 data points, trailing year), awards `first_win` (+ `fast_starter` badge when ≤ 0.8 × median), mentor `mentee_first_win` (70/30 with a secondary mentor) and `mentee_first_win_fast`. Other milestones award `onboarding_milestone`; Week 1 and Day 30 also award the mentor `mentee_milestone`. |
| `GET /probation/employees/:userId/summary`            | participants                          | Day-90 evidence pack: milestones, first win, paths, contribution counts, check-ins, health and the statement that ContextOS does not recommend pass/fail (FR-PRB-008).                                                                                                                                                                                                                             |
| `POST /probation/employees/:userId/outcome`           | HR (`hr` role) only; managers get 403 | `{ version, outcome: confirmed \| extended \| other, note, newEndDate? }` (FR-PRB-009). Managers send a recommendation instead; People Ops records the decision (role access spec §3).                                                                                                                                                                                                             |
| `POST /probation/employees/:userId/recommendation`    | the person's direct manager           | `ProbationRecommendationInputSchema` `{ recommendation: confirm \| extend \| discuss, ratings[{ area, level 0–3 }], note }`. Goes on their People Ops record: `confirm` → ready for approval, otherwise needs HR review; notifies their People partner (or every HR member). 409 once decided.                                                                                                     |

The maintenance sweep activates scheduled plans, sends overdue-milestone nudges (employee + mentor, manager at +5 days), stuck-item nudges to mentors, sign-off escalations and the "summary ready" notice seven days before the end date.

### People Ops (HR)

`apps/api/src/modules/platform/people-ops.routes.ts`. Every `/people-ops/*` route requires the `hr` role; owners and admins get 403 (role access spec §3: Admin does not see onboarding records or check-in notes). Contracts are in `packages/shared/src/schemas/people-ops.ts` and `home.ts`.

An onboarding record (`hr_onboarding`) can exist before the person has an account. With a work email, creating one sends an invitation (role `member`, manager and start date applied on first sign-in) and the record links to the account by email. Records are also backfilled for people already onboarding: an active or scheduled onboarding plan, or a membership with `organization.isNewHire` and `startDate`. Progress is required path items done across the person's path assignments; check-ins come from their onboarding plan (one expected every 30 days); the probation review lives on the record, due after the workspace's `probationDefaultDays`. Templates start as six published standard templates; modules are a built-in catalog plus the workspace's published learning paths.

| Endpoint                                                                                         | Notes                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /people-ops/overview`                                                                       | HR Home counts and onboarding by team.                                                                                                                                                                                 |
| `GET /people-ops/probation-reviews?within=30`                                                    | Reviews due in the window, soonest first, and `recentlyCompleted`.                                                                                                                                                     |
| `GET /people-ops/probation-reviews/:id`                                                          | Recommendation, ratings, milestones, activity, `missingCheckins`, decision.                                                                                                                                            |
| `POST /people-ops/probation-reviews/:id/decision`                                                | `ProbationDecisionInputSchema`. Only once the manager has recommended (409 otherwise or when decided). Closes or extends the onboarding plan, audits `probation.decision`, optionally notifies the person and manager. |
| `POST /people-ops/probation-reviews/:id/discuss`                                                 | `{ note }`. Asks the manager to talk before deciding; notifies them and audits `probation.discuss`.                                                                                                                    |
| `GET /people-ops/starters?within=14`                                                             | People starting soon; `id` is the onboarding record's id.                                                                                                                                                              |
| `GET /people-ops/overdue-milestones`                                                             | Missed 30/60-day check-ins, overdue plan milestones and late recommendations.                                                                                                                                          |
| `POST /people-ops/reminders`                                                                     | `{ about: probation_review \| milestone, ids }`. Notifies each manager once.                                                                                                                                           |
| `GET /people-ops/onboardings?q=&team=&filter=`                                                   | Most urgent first, with counts per filter.                                                                                                                                                                             |
| `POST /people-ops/onboardings`                                                                   | `NewOnboardingInputSchema` (optional `email`). The caller becomes the People partner. 409 when the person already has a record. Audits `onboarding.record.create`.                                                     |
| `GET /people-ops/onboardings/:id`                                                                | Setup steps, milestones, last check-in, probation review id once they have started.                                                                                                                                    |
| `PATCH /people-ops/onboardings/:id`                                                              | Manager (also updates their membership), buddy, published template or People partner (must have the `hr` role). Audited with before and after.                                                                         |
| `POST /people-ops/onboardings/:id/setup/:step`                                                   | Marks a setup step done; `welcome` notifies the person.                                                                                                                                                                |
| `GET /people-ops/onboarding-options`                                                             | Teams, managers, buddies, People partners and published templates.                                                                                                                                                     |
| `GET /people-ops/people/:id/onboarding`                                                          | A person's record summary for their profile card; 404 when they are not onboarding.                                                                                                                                    |
| `GET /people-ops/templates`, `GET /people-ops/templates/:id`, `GET /people-ops/template-library` | Templates and the modules that can be added.                                                                                                                                                                           |
| `POST /people-ops/templates`                                                                     | `{ name, baseId }`: a draft copy.                                                                                                                                                                                      |
| `POST /people-ops/templates/:id/draft`                                                           | Stages' module order, optional `roles` and `teams`. Editing a published template starts the next version as a draft. Unknown modules are 400.                                                                          |
| `POST /people-ops/templates/:id/publish`                                                         | As draft plus `note`; adds to the history and audits `onboarding.template.publish`.                                                                                                                                    |

## 21. Gamification (PRD §8.2–§8.5, Appendix B/C)

Reputation (RP) is posted only on verified actions to an append-only ledger (`points_ledger`: `currency rp|kc`, `action`, `amount`, `sourceId`, `reason` JSON with base and multipliers, `status posted|held|clawed_back`, `actorId`). Caps: 150 maintenance RP/day, per-action daily caps (Appendix C), monthly caps for kudos and learner completions. Tiers by rolling-365-day RP: explorer 0, contributor 100, keeper 500, steward 1500, sage 4000. Kudos Credits (KC) are issued at `rewards.kcPerRp` only when the rewards catalog is enabled.

| Endpoint                                  | Who                      | Notes                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /gamification/me`                    | self                     | `{ enabled, rewardsEnabled, lifetimeRp, activeRp, monthRp, quarterRp, tier, nextTier { tier, needed }, kcEarned, kcSpent, kcBalance, badges[], holds[] (AG-11), ledger[] }` (Rewards Center §10.28).                                                                                                                                                    |
| `GET /gamification/badges`                | self                     | Appendix B catalog with `earned` per badge; `automated: false` marks badges not yet awarded automatically (`context_champion`).                                                                                                                                                                                                                         |
| `GET /gamification/users/:id`             | non-guest                | Public profile: `tier`, `lifetimeRp`, `activeRp` (null when hidden or gamification is off), `badges`, `mentees` (Profile §10.33).                                                                                                                                                                                                                       |
| `GET /gamification/leaderboards`          | non-guest, not opted out | `LeaderboardQuerySchema` `scope: company \| department \| team \| rising_stars`, `window: month \| quarter \| all_time`, `departmentId?`, `teamId?`. Top 10 + private `self { rank, points }`; ties by earlier attainment; departments need ≥ 5 members (`suppressed`); `{ enabled: false }` when disabled; `{ optedOut: true }` for opted-out callers. |
| `POST /gamification/kudos`                | non-guest                | `KudosInputSchema` `{ toUserId, message, artifact? { type, ref } }`. 5 per month, 2 per recipient, never to self (AG-7). Recipient earns `peer_kudos_received` (15 RP/month cap) and is notified. `201`.                                                                                                                                                |
| `GET /gamification/kudos?direction=`      | self                     | `received` (default) or `given`.                                                                                                                                                                                                                                                                                                                        |
| `POST /gamification/adjustments`          | owner/admin              | `{ userId, amount (±), currency, reason }` → `201` ledger entry (`admin_adjustment`), audited, user notified.                                                                                                                                                                                                                                           |
| `POST /gamification/ledger/:id/clawback`  | owner/admin              | `{ reason }` posts a negative `clawback` entry referencing the original (AG-6); `409` when already clawed back.                                                                                                                                                                                                                                         |
| `GET /gamification/anomalies`             | owner/admin              | Held awards awaiting review (FR-ADM-009).                                                                                                                                                                                                                                                                                                               |
| `POST /gamification/anomalies/:id/decide` | owner/admin              | `{ version, decision: release \| reject, note }`; release posts the held entry.                                                                                                                                                                                                                                                                         |

Ledger actions and base RP: `flag_accepted` 5, `flag_coreporter` 2, `fix_stale` 20, `fix_incorrect` 25, `add_missing_context` 20, `resolve_conflict` 40, `verify_claim` 2, `verify_sprint_bonus` 15, `answer_captured` 15, `ask_promoted` 5, `path_published` 30, `path_learner_complete` 10, `path_item_completed_by_learner` 1, `mentee_milestone` 10, `mentee_first_win` 25, `mentee_first_win_fast` 15, `bounty_completed` (reward), `peer_kudos_received` 3, `onboarding_milestone` 10, `first_win` 30, `path_completed` 20, `quiz_passed_first_try` 3, `knowledge_capture` 10. Admin entries: `admin_adjustment`, `clawback`; KC entries: `redemption`, `redemption_refund`.

## 22. Rewards catalog (PRD §7.12)

All endpoints answer `409` until `settings.rewards.enabled` is true. Guests cannot redeem.

| Endpoint                               | Who                               | Notes                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /rewards/catalog`                 | member                            | `{ balance, items[] }`; each item adds `eligible` (department / minimum tier) and `affordable`.                                                                                                                                                                                            |
| `POST /rewards/catalog`                | owner/admin                       | `RewardItemInputSchema` `{ name, description, imageUrl?, itemType: swag \| gift_card \| experience \| time_off \| charity, kcCost, stock (null = unlimited), eligibility { departmentIds, minTier? }, approvalRequired, fulfilmentNotes, isActive }` → `201`.                              |
| `PATCH /rewards/catalog/:id`           | owner/admin                       | Partial update with `version`.                                                                                                                                                                                                                                                             |
| `DELETE /rewards/catalog/:id`          | owner/admin                       | Archives (`204`).                                                                                                                                                                                                                                                                          |
| `POST /rewards/redeem`                 | member                            | `RedeemInputSchema` `{ itemId, note, shipping? }`. Checks balance, stock, eligibility and the monthly per-person cap; debits KC immediately; shipping is stored encrypted (`503` without `CONNECTOR_TOKEN_ENCRYPTION_KEY`). `201` redemption (`pending_approval` or `fulfilment_pending`). |
| `GET /rewards/redemptions?queue=`      | self; approvers with `queue=true` | Own history, or the approval queue for `rewards_approver` assignees.                                                                                                                                                                                                                       |
| `POST /rewards/redemptions/:id/decide` | `rewards_approver`, not own       | `{ version, decision: approve \| reject \| fulfil, note }`. Rejection refunds KC and restores stock; the redeemer is notified at each step (N27).                                                                                                                                          |

KC balance = credits earned within `kcExpiryMonths` − spent (FR-RWD-006).

## 23. EPM: evidence-backed performance management (PRD §7.13, §8.10; Phase 2 add-on)

All endpoints answer `403` until `settings.epm.enabled` is true, for guests, and for locations listed in `epm.disabledLocations` (EP-10). The system never produces ratings, rankings or recommendations (EP-1); Ask content, DMs and volume metrics are excluded (EP-4).

| Endpoint                                 | Who                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /epm/footprint`                     | self; direct manager with `userId=`      | `FootprintQuerySchema` `{ from?, to?, userId? }` → `{ userId, from, to, viewer, themes { delivery, decisions_direction, knowledge_enablement, collaboration, quality_reliability, customer_impact }, recencyBias { lastQuarterShare, warning }, items[] }`. Items derive from verified ledger entries, sign-offs given and (labelled `isInferred`) documents authored under the person's name; each carries `annotation` (`note`, `hiddenInShare`, `highlighted`, `dispute`). Hidden items are omitted from the manager's evidence pack (FR-EPM-004/005). |
| `POST /epm/footprint/items/:id/annotate` | self                                     | `FootprintAnnotateSchema` `{ note?, hiddenInShare?, highlighted?, dispute? }` → `201`/`200` annotation record.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `POST /epm/brag-docs/generate`           | self                                     | `{ from, to, title? }` → `201` brag doc (`data.narrative`, `highlights`, `itemSelection`, `items`, `recencyBias`, `generationRun`). Generated only from the person's own items with no comparative language (FR-EPM-003).                                                                                                                                                                                                                                                                                                                                 |
| `GET /epm/brag-docs?shared=`             | self / recipient                         | Own docs, or `shared=true` for snapshots shared with me.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GET /epm/brag-docs/:id`                 | owner                                    | Doc with `shares[]`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `PATCH /epm/brag-docs/:id`               | owner                                    | `{ version, title?, narrative?, itemSelection? }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `POST /epm/brag-docs/:id/share`          | owner                                    | `{ version, withUserId? (direct manager), reviewId? }` → `201` immutable snapshot (`brag_share`), recipient notified (N29).                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GET /epm/shared/:id`                    | recipient or owner                       | Shared snapshot.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `GET /epm/review-cycles`                 | participants; cycle admins               | Admins see `completion { total, submitted }` only (EP-9).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `POST /epm/review-cycles`                | owner or `review_cycle_admin`            | `ReviewCycleInputSchema` `{ name, periodStart, periodEnd, participantIds, questions, calibrationEnabled }` → `201` draft.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `POST /epm/review-cycles/:id/advance`    | cycle admin                              | `{ version }` moves through draft → scheduled → self_review (creates self and manager reviews) → peer_input → manager_review → calibration (if enabled) → sharing → acknowledgement → closed (PRD §8.1.7).                                                                                                                                                                                                                                                                                                                                                |
| `GET /epm/reviews?cycleId=`              | reviewer / reviewee / manager            | Reviews visible per phase: reviewers see their own; reviewees see manager and peer reviews from `sharing` on; managers see submitted self-reviews.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `POST /epm/reviews/:id/peers`            | reviewee or manager                      | `{ version, peerIds (2–5) }` → `201` peer reviews.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `POST /epm/reviews/:id/submit`           | assigned reviewer, in the matching phase | `{ version, answers { questionIndex: text }, rating? }` (`rating` is a company-defined manual string).                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `POST /epm/reviews/:id/acknowledge`      | reviewee, acknowledgement phase          | `{ version, comment }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## 24. Companion ("Orbit") and notifications (PRD §7.20, §8.14, §13)

| Endpoint                               | Who  | Notes                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /companion/preferences`           | self | `CompanionPreferencesSchema`: `enabled`, `persona` (`orbit \| atlas \| minimal_orb`), `tone`, `proactiveNudges`, `onDemandOnly`, `snoozedUntil`, `excludedDomains`, `soundEnabled` (off by default, AA-3), `minimized`.                                                                                                                               |
| `PATCH /companion/preferences`         | self | Partial update (turn off, snooze, on-demand only, FR-MSC-005).                                                                                                                                                                                                                                                                                        |
| `GET /companion/context`               | self | Query `projectId?`, `sourceId?`, `url?` (resolved to an imported source), `assignmentId?` + `itemId?` (active checkpoint). Returns `projectId`, `projectSlug`, `sourceId`, `checkpoint { title, objective }`, three contextual `prompts`, `owners`, `decisions`, `unresolvedConflicts`, `suggestedTrigger` (`TRG-CONFLICT-PAGE`), `mentor`.           |
| `POST /companion/stuck-help`           | self | Same scope fields plus `question?`. Returns `{ answer (full Answer), bullets (≤ 3 plain-language lines), escalation { mentorId, mentorName, draftMessage, link } \| null }` (FR-MSC-003/008).                                                                                                                                                         |
| `POST /companion/interactions`         | self | `{ trigger: suggested \| opened \| dismissed \| helpful \| not_helpful \| celebrated \| escalated, triggerKey?, surface, latencyMs?, rating? }`. Enforces AA-1: proactive `suggested` needs `proactiveNudges` and not `onDemandOnly`/snoozed; max 2 per 4 hours; dormant after two dismissals in a half-day; 60 interactions per hour overall. `201`. |
| `GET /notifications`                   | self | `?unread=true&limit=&offset=` → `{ unread, items[] }`; items are delivered only once their `deliverAfter` (quiet hours / weekend suppression for nudges) has passed. `data`: `type`, `category`, `title`, `body`, `link`, `data`, `batchKey`, `nudge`, `count`, `channels`.                                                                           |
| `PATCH /notifications/:id/read`        | self | Mark read.                                                                                                                                                                                                                                                                                                                                            |
| `POST /notifications/read-all`         | self | `{ updated }`.                                                                                                                                                                                                                                                                                                                                        |
| `GET/PATCH /notifications/preferences` | self | `NotificationPreferencesSchema`: `email`, `inApp`, `quietStartHour`, `quietEndHour`, `digestFrequency`, `categories { onboarding, maintenance, bounties, gamification, system } × { inApp, email, slack }`. Security notifications cannot be disabled.                                                                                                |

Producers implemented (PRD §13): plan assigned, mentee assigned, check-in published/responded, sign-off requested/decided/escalated, quiz failed three times, item stuck, milestone achieved/overdue, probation summary ready and outcome, flag routed/resolved/rejected/converted/escalated, correction pending/rejected, conflict detected, bounty claimed/submitted/approved/changes requested, points posted/held/adjusted/clawed back, tier upgraded, badge earned, kudos received, promotion decided, identity suggested, connector needs re-auth, offboarding continuity, redemption status, review-cycle phase, brag doc shared, role change, answer-leak report and workspace deletion. Gamification notices are batched (max one per hour per person); nudges are capped at `policies.nudges.maxPerDay`. Email goes out from the maintenance sweep as one summary per person, after quiet hours, to people with email on (`modules/platform/email-delivery.ts`); Slack delivery is not implemented. A record whose in-app channel is off stays out of `GET /notifications`.

## 25. Connectors and webhooks (PRD §7.2, §17, §8.1.8)

Google Drive is the implemented provider (OAuth per user, encrypted tokens, reader-side access checks). Slack, Jira and GitHub connectors are not implemented; `POST /connectors/:provider/authorize` answers `503` for them, and their webhook receivers record events and match checkpoint triggers only.

| Endpoint                                | Who                  | Notes                                                                                                                                                                                                                                                                                    |
| --------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /connectors`                       | self                 | Own connections: `id`, `provider`, `status` (`connected \| needs_reauth`), `accountId`, `scopes`, `selectedScopes[]`, `health { lastSuccessfulSyncAt, itemsProcessed, errors[], tokenStatus }` (sync health page, FR-INT-008). Never token material.                                     |
| `POST /connectors/:provider/authorize`  | member               | `google_drive` (or `google-drive`) → `{ authorizationUrl }` with single-use state. Others `503`.                                                                                                                                                                                         |
| `GET /connectors/google-drive/callback` | public (state-bound) | Exchanges the code, verifies the Google identity, stores encrypted tokens, **confirms the `google` identity link**, then redirects the browser to Setup.                                                                                                                                 |
| `GET /connectors/:id/files`             | owner of connection  | `?folderId=&pageToken=` bounded file listing for manual selection.                                                                                                                                                                                                                       |
| `GET /connectors/:id/scopes`            | owner of connection  | Selectable shared drives and top-level folders with current `selections[]` (FR-INT-005).                                                                                                                                                                                                 |
| `PUT /connectors/:id/scopes`            | owner/admin          | `ConnectorScopesInputSchema` `{ projectId, scopes: [{ scopeType: folder \| shared_drive, externalId, name, excluded, backfillFrom? }] }` replaces the project's selection → `{ items }` (`id`, `status`, `lastSyncedAt`, `itemCount`, `lastError`).                                      |
| `POST /connectors/:id/sync`             | owner/admin/manager  | `{ scopeId? }` queues a `sync_connector` job per selected scope (`202 { queued, items }`); 10-minute cooldown per scope (`429`, FR-INT-012). The job walks the folder (≤ 3 levels, 200 files per run), imports Docs/text/PDF/DOCX, tombstones files that disappeared and records health. |
| `POST /connectors/:id/import`           | owner/admin/manager  | `{ projectId, fileId }` imports one file (`201` source detail); unchanged content is reused.                                                                                                                                                                                             |
| `DELETE /connectors/:id?mode=`          | owner of connection  | `purge` (default) deletes imported sources; `keep_derived` keeps sources and claims without updates (they stay hidden until re-verified, since parity can no longer be checked) (PRD §8.12). `204`.                                                                                      |

### `POST /webhooks/:provider` (public)

Signature-verified receivers (`slack`, `github`, `jira`, `google_drive`) that respond within the request, de-duplicate deliveries, write an outbox record per attributed workspace and match real-work checkpoint triggers through confirmed identity links (FR-CHK-004):

| Provider       | Verification                                                                                                           | Matched triggers                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `slack`        | `X-Slack-Signature` HMAC with `SLACK_SIGNING_SECRET`, 5-minute timestamp window; answers `url_verification` challenges | `message` → `slack.message.posted_in_channel`                                                              |
| `github`       | `X-Hub-Signature-256` with `GITHUB_WEBHOOK_SECRET`; `X-GitHub-Delivery` dedupe                                         | merged `pull_request` → `github.pr.merged`; `pull_request_review` submitted → `github.pr.review_submitted` |
| `jira`         | `X-Hub-Signature` with `JIRA_WEBHOOK_SECRET`                                                                           | `jira:issue_created` → `jira.issue.created`; status change to Done → `jira.issue.transitioned_to_done`     |
| `google_drive` | `X-Goog-Channel-Token` equals `GOOGLE_WEBHOOK_TOKEN`                                                                   | queues a sync for scopes whose cursor matches the channel                                                  |

Responses: `202 { accepted, matched | queued | duplicate }`; `401` bad signature; `503` when the secret is not configured.

## 26. Search, analytics and export

### `GET /search`

Global, permission-filtered search (FR-SRCH-002). `SearchQuerySchema`: `q`, `projectId?`, `types?` (comma list of `context_item`, `source`, `project`, `path`, `bounty`, `person`), `limit`, `offset`. Response `{ total, facets { type: count }, items: [{ type, kind?, id, projectId, title, snippet, link }] }`. Sources are matched with the FTS5 index plus title match; semantic reranking is not applied.

### `GET /analytics/overview`

Owner/admin or `department_head` (FR-ANL). Query `days` (7–365, default 90), `format=json|csv`. Aggregated and k-anonymous (threshold `policies.askKAnonymityThreshold`): `knowledgeHealth[]` (KHS per project), `onboarding { activePlans, closedPlans, medianTimeToFirstWinDays, pathCompletionRate, stuckHotspots }`, `contributions { flagsOpened, flagsResolved, correctionsVerified, verificationLagHours, bountiesCompleted, bountiesOpen }`, `ask { volume, helpfulRate, insufficientRate, unansweredTopics }`.

### `GET /admin/export`

Owner/admin (FR-ADM-008). JSON export of workspace metadata, members, org structure, projects with the caller-readable sources, items and conflicts, platform records, the points ledger and the audit log. Ask conversations and encrypted material are never exported. Audited.

## 27. Domain events (outbox)

`domain_events` rows (`type`, `data`, `createdAt`, `processedAt`) are written for: `flag.created`, `flag.resolved`, `conflict.detected`, `conflict.resolved`, `conflict.disputed`, `bounty.published`, `bounty.auto_created`, `bounty.completed`, `path.published`, `path.completed`, `checkpoint.dwell.verified`, `checkpoint.quiz.passed`, `checkpoint.signoff.approved`, `checkpoint.event.matched`, `onboarding.milestone.achieved`, `onboarding.first_win.achieved`, `onboarding.stuck.detected`, `points.posted`, `tier.upgraded`, `answer.promoted`, `connector.token.degraded`, `user.suspended`, `user.offboarded`, `webhook.<provider>`. No external dispatcher consumes them yet; in-process effects (ledger, notifications) run synchronously.

## 28. PRD §20 mapping and deviations

| PRD path                                                             | Implemented as                                               | Note                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `GET /projects/:slug`                                                | `GET /projects/:ref` (UUID or slug)                          | Both forms accepted everywhere.                                             |
| `POST /connectors/:provider/authorize`                               | Same; only `google_drive` is live                            | Other providers answer `503 NOT_CONFIGURED`.                                |
| `GET /connectors/:id/scopes`, `PUT`, `POST .../sync`                 | Same                                                         | Scopes are per project.                                                     |
| `DELETE /connectors/:id` (`keep_derived` / `purge`)                  | `?mode=keep_derived\|purge`                                  |                                                                             |
| `POST /learning/items/:id/{start,dwell,quiz/submit,signoff/request}` | `POST /learning/assignments/:assignmentId/items/:itemId/...` | Progress belongs to an assignment, so the assignment id is explicit.        |
| `POST /learning/signoffs/:id/decide`                                 | Same; `:id` is the progress record id                        |                                                                             |
| `POST /ask/messages/:id/{feedback,promote}`                          | Same; `:id` is the answer id                                 |                                                                             |
| `PATCH /workspaces/current/settings`                                 | Same (alias of `PATCH /workspaces/current`)                  |                                                                             |
| `POST /users/identities/link`, `DELETE /users/identities/:provider`  | Same, plus admin suggestion/confirmation endpoints           | Slack/Jira/GitHub OAuth apps are not configured; links are admin-confirmed. |
| `GET /api/v1/evidence/:id`                                           | Same                                                         |                                                                             |
| `GET /gamification/leaderboards`, `POST /gamification/kudos`         | Same                                                         |                                                                             |
| `GET /rewards/*`, `POST /rewards/*`                                  | Same, gated by `rewards.enabled`                             |                                                                             |
| `GET /epm/*`, `POST /epm/*`                                          | Same, gated by `epm.enabled`                                 | `context_champion` badge and gift-card APIs are not automated.              |

Not implemented (documented in [backend-production-readiness.md](backend-production-readiness.md)): live token streaming, Slack/Jira/GitHub ingestion connectors, email/Slack notification delivery, semantic search reranking, SAML/SCIM, billing.
