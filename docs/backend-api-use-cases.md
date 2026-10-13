# Backend API use cases and feature guide

Updated: 13 October 2026. Requirements source: [ContextOS_PRD.md](../ContextOS_PRD.md). The five-day roadmap is not used.

Release target confirmed by the owner: **complete Phase 1 first; defer subsequent phases**. Production Clerk/Google accounts will be configured later. Missing accounts do not enable bypass authentication in production or certify live integrations.

The backend now implements the workflows below in the existing Node/Hono, Drizzle/SQLite and Gemini stack. This is a substantial implementation extension, **not completion of the entire PRD or a production-readiness certification**. See [production readiness and remaining work](backend-production-readiness.md) for the outstanding requirements and external validation.

## Authentication and testing

Base URL: `http://localhost:3000/api/v1`.

`AUTH_MODE=development` uses the explicitly configured development actor. It seeds an owner membership and a workspace Domain Owner assignment for local testing. Never expose this mode to external users; production startup rejects it.

`AUTH_MODE=clerk` verifies Clerk session bearer tokens and current organization membership. Select a Clerk Organization before making protected requests. The first organization administrator to access an unlinked organization initializes its ContextOS workspace; subsequent members enter with the mapped admin/member role. Local system roles are managed through the user administration API. Existing default-workspace data is not automatically reassigned to a new organization.

Protected requests use `Authorization: Bearer <Clerk session token>`. Health endpoints remain public. `CORS_ORIGINS` is also the Clerk authorized-party origin allowlist. Production origins must be HTTPS.

`POST /workspaces` is the one protected operation that does not require an already-selected organization. It requires a valid Clerk user session, creates the provider Organization plus local owner membership, and returns `organizationId`. Activate that Organization in the frontend before using its other APIs. Development mode creates a local workspace without changing the configured development actor's workspace; it is not a multi-user/workspace-switching UI.

Errors retain the existing shared envelope:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "This operation is not permitted",
    "requestId": "..."
  }
}
```

Use `401` for missing authentication, `403` for a denied action, `404` for inaccessible/absent resources, `409` for stale versions or invalid transitions, `429` for limits/cooldowns, and `503 NOT_CONFIGURED` for integrations whose credentials are absent.

In Bruno, open `bruno/contextos-api` and choose `Local`. The collection-wide pre-request script attaches a bearer token only when `accessToken` is supplied. Real tokens belong in a git-ignored `environments/*.private.bru` environment, never in tracked collection files. Use separate tokens for the author, reviewer, learner, mentor and manager.

```bash
nvm use 24
cd bruno/contextos-api
bru run . -r --env Local --bail
```

The full run creates test data and deletes the test thread, source and project in `99 Cleanup`. Live-provider and multi-user requests skip when their prerequisite variables are absent. A skipped request is not a verified workflow. Do not run the full collection against a production tenant containing IDs you wish to keep.

## 1. Workspace, users and source access

| API                                                            | Use case and access rule                                                                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /workspaces/current`                                      | Read the current workspace and your role.                                                                                                                 |
| `GET /users/me`                                                | Read your profile, preferences and scoped assignments.                                                                                                    |
| `PATCH /users/me`                                              | Update name, timezone and leaderboard preference.                                                                                                         |
| `GET /users?limit=50&offset=0`                                 | Read the workspace directory; guests cannot browse it.                                                                                                    |
| `POST /users/invite`                                           | Owner/admin delivers a Clerk Organization invitation. Requested application role is returned as metadata; it is not automatically elevated at acceptance. |
| `PATCH /users/:id`                                             | Owner/admin changes application role, status, manager and guest expiry. The last active owner cannot be removed; only owners can manage ownership.        |
| `GET /assignments`                                             | Owner/admin reviews assignments.                                                                                                                          |
| `POST /assignments`                                            | Owner/admin grants a supported project/user/workspace assignment with optional expiry.                                                                    |
| `DELETE /assignments/:id`                                      | Owner/admin revokes an assignment.                                                                                                                        |
| `POST /projects/:projectId/memberships`                        | Grant a current workspace member access to a project; required for guests.                                                                                |
| `POST /projects/:projectId/sources/:sourceId/access`           | Owner/admin who already has access grants access to a manually imported source.                                                                           |
| `DELETE /projects/:projectId/sources/:sourceId/access/:userId` | Revoke a manual-source grant. Provider-controlled sources cannot be shared using this endpoint.                                                           |
| `GET /audit?limit=50&offset=0`                                 | Owner/admin reads workspace audit entries, subject to source access. New audit records are hash-linked and database triggers block updates/deletes.       |

System roles are `owner`, `admin`, `manager`, `member`, `guest`. Roles permit actions; they do not override source access. Current assignment scope types are project, user and workspace. Team/department/section/topic scopes from the PRD remain outstanding.

Invitations require configured Clerk credentials and an organization mapping. Suspending/offboarding a local membership blocks future authenticated requests, removes current-workspace source/project grants and assignments, invalidates pending OAuth state and requires connector re-authentication. Offboarding also erases that member's stored connector credentials and emits an outbox event with removed assignment metadata for continuity work. Reactivation does not restore grants automatically. Provider-side token/session revocation and the continuity consumer are not implemented. Guests require a future expiry within 180 days; expiry cannot be cleared while the role remains Guest. Reporting lines cannot contain cycles.

### Workspace and organization APIs

These are in Bruno folder `16`:

| API                                   | Use and authorization                                                                                                                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /workspaces`                    | Create a workspace with name, unique slug, optional primary domain and region. Domain is **unverified**; no auto-join is enabled. Only `us-east-1` is accepted by this single-region implementation; other regions return `503`. Region metadata is not deployment/residency certification. |
| `PATCH /workspaces/current`           | Owner/admin updates name, timezone and stored indirect-report policy using the current `version`. Indirect-report access is not implemented; manager APIs remain direct-report-only.                                                                                                        |
| `GET/PATCH /workspaces/current/setup` | Owner/admin reads resumable wizard progress and source sync counts, or marks a step pending/completed/skipped. Completion requires persisted workflow evidence; skipped steps can be resumed. Counts include only sources readable by the actor.                                            |
| `GET/POST /org/departments`           | Non-guests read a paginated directory; owner/admin creates departments.                                                                                                                                                                                                                     |
| `PATCH/DELETE /org/departments/:id`   | Owner/admin renames or deletes an unused department. Reassign people/remove teams before deleting.                                                                                                                                                                                          |
| `GET/POST /org/teams`                 | Non-guests list teams, optionally filtered by department; owner/admin creates teams within a current-workspace department.                                                                                                                                                                  |
| `PATCH/DELETE /org/teams/:id`         | Owner/admin renames/reparents or deletes an unused team. Nesting is limited to three levels, same department, no cycles.                                                                                                                                                                    |
| `GET /users/:id/organization`         | Self, direct manager or owner/admin reads the workspace-specific employment profile. Other callers receive `404`.                                                                                                                                                                           |
| `PATCH /users/:id/organization`       | Owner/admin sets department/team, job title, role family, location, IANA timezone, start date and new-hire flag. Team and department must match.                                                                                                                                            |

Setup steps are `connect_source`, `select_scopes`, `create_project`, `invite_team`, `assign_new_hire`. This API persists backend progress; the frontend wizard, domain verification, identity-link review and CSV/directory imports still need implementation. Clerk Organization display names are not synchronized by the workspace settings update.

Bruno workspace creation (`enableWorkspaceCreation=true`) and member organization edits (`enableOrgMutation=true`, `managedUserId`) are opt-in. Use only disposable members: cleanup clears their team/department instead of restoring prior organization assignments. Workspace creation leaves a workspace behind; no workspace-deletion workflow is implemented yet.

Manual source import is private by default:

```json
{
  "kind": "document",
  "title": "Project decision record",
  "content": "The team decided ...",
  "visibility": "restricted"
}
```

`visibility: "workspace"` deliberately shares a manual source with workspace members allowed into its project. Connected Drive sources are always restricted and use verified provider access instead of manual grants.

## 2. Project knowledge workflow

1. `POST /projects` creates a project (owner/admin/manager).
2. `POST /projects/:projectId/sources` imports readable text and queues processing.
3. `GET /projects/:projectId/jobs` and `GET /projects/:projectId/sources/:sourceId` show authorized processing status.
4. `GET /projects/:projectId/context-items?kind=decision` returns accessible extracted items and evidence.
5. `GET /projects/:projectId/hub` returns the overview, authorized counts and sync state.
6. `POST /projects/:projectId/hub/refresh` queues overview regeneration.

Project CRUD, source deletion/reprocessing, job retry and feedback remain available in folders `02`–`08` of Bruno. Ordinary members cannot create projects or run ingestion jobs. A Domain Owner assignment is required for the context verification endpoint. Unknown/inaccessible project/source IDs return `404`.

Additional read APIs:

| API                                                 | Result                                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET /projects/:projectId/decisions`                | Accessible decision cards.                                                                         |
| `GET /projects/:projectId/decisions/:id`            | One accessible decision.                                                                           |
| `GET /projects/:projectId/timeline`                 | Accessible events and decisions.                                                                   |
| `GET /projects/:projectId/current-state`            | Accessible status claims excluding stale/superseded items.                                         |
| `GET /projects/:projectId/conflicts`                | Existing detected status-claim conflicts; not a full conflict-resolution API.                      |
| `GET /search?projectId=...&q=...&limit=50&offset=0` | Project-scoped keyword search over accessible context items. Not the PRD's global semantic search. |

Both keyword and vector retrieval restrict candidate source IDs before retrieving content. Generated prose can depend on multiple sources: merged context and a project-wide overview are withheld if their complete dependencies are not accessible. This is conservative protection, not the PRD's full per-fingerprint regeneration with alternative-evidence visibility.

Generation dependencies are retained when contributing evidence is removed, so deleting one private source does not expose its merged prose through another source. Non-ready dependencies are withheld, and conflict IDs are computed only from eligible visible claims. Old hub snapshots without generation-dependency metadata are withheld until regenerated. A merged item whose deleted dependency cannot be reconstructed can remain hidden; rebuilding it from alternative evidence is outstanding, not silently claimed as implemented.

## 3. Private Ask conversations

The compatibility endpoint `POST /projects/:projectId/ask` returns a structured JSON answer. `GET /projects/:projectId/questions` returns only the caller's answers whose stored source dependencies remain accessible. Legacy answers without dependency metadata are withheld.

Thread workflow:

| API                              | Use                                                                      |
| -------------------------------- | ------------------------------------------------------------------------ |
| `POST /ask/threads`              | Create a private thread with `projectId`, optional `sourceId` and title. |
| `GET /ask/threads`               | List your own threads.                                                   |
| `GET /ask/threads/:id`           | Read your own thread and currently accessible answers.                   |
| `POST /ask/threads/:id/messages` | Submit `{ "question": "..." }` and receive SSE events.                   |
| `DELETE /ask/threads/:id`        | Delete your thread and its saved answers.                                |

SSE sends `status`, then a validated `answer`, then `done`; failures produce a safe `error` event. It currently streams the **final validated result**, not live provider token deltas. Thread ownership is enforced independently of admin/owner roles. Follow-up conversation memory and multi-project scope are not yet implemented.

The model must use valid numbered citations. Invalid/uncited output is regenerated once, then replaced with an insufficient-evidence answer if still invalid. Extraction now discards quotes that are not exact source substrings located in a chunk. Citation reference validation is not proof of semantic entailment; PRD claim-level validation/evaluation remains required.

## 4. Flag → correction → independent review

1. `POST /flags` with `projectId`, `targetType` (`context_item`, `overview`, `answer`), `targetId`, `kind` and optional comment/evidence URL.
2. `GET /flags/queue` returns your reports and accessible flags within your Domain Owner scope. Private answer reports stay private.
3. `PATCH /flags/:id` transitions `open → triaged → in_progress → resolved`; rejection requires a reason. Send the current `version`.
4. `POST /flags/:id/corrections` proposes a `contextos_note` or a `supersede` correction. A successor must be accessible.
5. `POST /corrections/:id/verify` with `version`, `accepted` and reason. The author cannot approve their own correction. An assigned Domain Owner approves, or two independent project reviewers may approve when no owner exists.

Accepted note corrections become new private source evidence and enter the processing queue. Accepted supersession corrections mark the prior item superseded. A resolved flag emits an outbox record and can award reputation under the implemented rules. Notifications, full owner routing/escalation, appeals, duplicate merging and successor graph linkage are outstanding.

Flag comments also retain source dependencies and are hidden from reviewers without those grants; legacy flags without dependency metadata are withheld. Being a Domain Owner does not bypass source access. Overview reports conservatively depend on all sources available to their reporter.

`version` is an optimistic-lock number. Every successful update increments it. A stale number returns `409`; reload the resource before retrying.

## 5. Learning paths, quizzes and progress

| API                                                                      | Use                                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `POST /learning/paths`                                                   | Curator/admin/owner creates a draft with `projectId`, title, role family and items.                                 |
| `POST /learning/paths/generate`                                          | Draft a path from accessible current context using the evidence template; generation method is labelled explicitly. |
| `GET /learning/paths` / `GET /learning/paths/:id`                        | Read published paths or drafts you may curate.                                                                      |
| `PUT /learning/paths/:id`                                                | Edit a draft using the current `version`; validates unique item IDs and acyclic, ordered prerequisites.             |
| `POST /learning/paths/:id/items/:itemId/quiz`                            | Author 3–5 multiple-choice questions with current accessible claim IDs and answer keys. Requires a quiz draft item. |
| `POST /learning/paths/:id/publish`                                       | A different authorized curator reviews and publishes an immutable version. Send `version`.                          |
| `POST /learning/paths/:id/assign`                                        | Assign a published version with learner, mentor and start date. Learner and mentor must differ.                     |
| `GET /learning/assignments`                                              | Read your own assignments.                                                                                          |
| `GET /learning/assignments/:id/progress`                                 | Learner, assigned mentor or direct manager reads progress. Quiz scores are removed from mentor/manager views.       |
| `POST /learning/assignments/:assignmentId/items/:itemId/start`           | Learner starts an unlocked item after the assignment start date.                                                    |
| `POST /learning/assignments/:assignmentId/items/:itemId/dwell`           | Engagement heartbeat with current progress version; the server bounds credited intervals.                           |
| `GET /learning/assignments/:assignmentId/items/:itemId/quiz`             | Learner reads questions/options without answer keys. Current evidence is checked.                                   |
| `POST /learning/assignments/:assignmentId/items/:itemId/quiz/submit`     | Submit version and answer indexes. Pass threshold is 70%; a ten-minute cooldown applies after two failures.         |
| `POST /learning/assignments/:assignmentId/items/:itemId/signoff/request` | Learner requests mentor/manager verification.                                                                       |
| `POST /learning/signoffs/:id/decide`                                     | Mentor/direct manager approves/rejects with version and note; learner cannot self-approve.                          |
| `POST /learning/assignments/:assignmentId/items/:itemId/attest`          | Self-attest only eligible optional/Meet items after starting them.                                                  |

Items support Read, Explore, Watch, Meet, Do, Quiz, Reflect and Link. Required items generally cannot self-attest. Quiz implementation covers multiple-choice only; other PRD question types, automated quiz generation, connector-event completion, anti-spoofed engagement measurement, path analytics and living-path updates remain outstanding.

Existing assignments retain their published snapshot when a draft changes. Inaccessible resources are rendered with neutral placeholders and `required: false`. Mentors/managers cannot read quiz scores through the progress response.

Generated items store `sourceIds` for every contributing source, alongside the compatibility `sourceId`. Rendering and completion require all dependencies, not just the first citation. Manual item authors may also supply `sourceIds`; every ID is checked against their source access.

## 6. Onboarding and manager use cases

| API                                                   | Use                                                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST /probation/plans`                               | Direct manager creates a plan for their report with mentor, start date and milestone offsets.               |
| `GET /probation/my-plan`                              | Employee reads their own plan.                                                                              |
| `GET /probation/team`                                 | Manager reads plans for direct reports.                                                                     |
| `GET /probation/employees/:userId`                    | Employee, direct manager or assigned mentor reads a plan.                                                   |
| `POST /probation/employees/:userId/checkins`          | Direct manager publishes a check-in.                                                                        |
| `GET /probation/employees/:userId/checkins`           | Authorized participants read check-ins.                                                                     |
| `POST /probation/checkins/:id/respond`                | Employee responds using the current version.                                                                |
| `POST /probation/employees/:userId/milestones/verify` | Independent mentor/manager records evidence review with milestone key, note and version.                    |
| `GET /probation/employees/:userId/summary`            | Authorized participant reads milestones and check-ins; no AI pass/fail recommendation.                      |
| `POST /probation/employees/:userId/outcome`           | Direct manager records a human decision: confirmed, extended or other. Extensions require a later end date. |

Admin privileges alone do not grant people-data access. The learner's `managerId` must be configured through user administration. Mentor viewing requires a scoped Mentor assignment; a plan's display field alone does not create that assignment. Automated business-day health scoring, scheduling, stuck alerts, leave pauses and event-verified first wins remain outstanding.

## 7. Companion, preferences, notifications and reputation

- `GET/PATCH /companion/preferences`: persist enabled/persona/tone/proactive/on-demand/snooze/excluded-domain settings for the current user.
- `GET /companion/context?projectId=...&sourceId=...`: retrieve accessible project decisions/people and three prompts.
- `POST /companion/stuck-help`: ask using an explicit project/source scope.
- `POST /companion/interactions`: record minimal interaction metadata; disabled companions reject tracking, with a 60/hour cap.
- `GET /notifications`, `PATCH /notifications/:id/read`, `GET/PATCH /notifications/preferences`: user-private notification records and preferences. Email/Slack delivery and automated notification producers are not implemented.
- `GET /gamification/me`: your append-only reputation ledger, lifetime/rolling-year RP and tier. Current awards cover accepted corrections/flags and verified onboarding milestones. The full anti-gaming engine, badges, kudos, credits, bounties and rewards remain outstanding.

These are backend capabilities. The animated widget, browser extension and their privacy/frequency rules require separate implementation.

## 8. Google Drive connection and reading files

Configure the API-only variables in `apps/api/.env.example`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and a 64-character hexadecimal `CONNECTOR_TOKEN_ENCRYPTION_KEY`. Keep real values out of source control. Register the exact callback URL with a Google web OAuth client and configure the consent screen/Drive API. This implementation requests `openid`, `email` and restricted `drive.readonly` access; obtain the required Google approval for your deployment.

1. `POST /connectors/google-drive/authorize` returns the Google consent URL, with expiring single-use state bound to the user/workspace.
2. Open it in a browser and complete consent. Google returns to `GET /connectors/google-drive/callback`; code exchange verifies Google identity and records an encrypted connection. The callback returns the connection JSON. It does not require a bearer header; its state is the authorization binding.
3. `GET /connectors` lists your connections without token material.
4. `GET /connectors/:id/files?folderId=...&pageToken=...` lists a bounded page of accessible files, including shared-drive support.
5. `POST /connectors/:id/import` with `projectId` and `fileId` imports one explicitly selected document (owner/admin/manager).
6. `DELETE /connectors/:id` revokes the credential and purges sources imported through that connection. This is destructive; run intentionally.

Supported content: Google Docs text export, plain text/Markdown, PDF text and DOCX raw text. PDFs/DOCX parse in a worker with a 30-second deadline and memory limits; PDFs cap at 200 pages. Scanned PDFs report that OCR is required. Downloads cap at 10 MB by default and extracted text at 200,000 characters. Sheets/Slides, comments, revision history and OCR are not enabled.

Repeated imports through the same connection/project/file ID reuse the source; changed content queues reprocessing. Provider ACL checks revalidate each reader using their own linked Google account before protected requests and before returning generated answers. Unknown access, provider errors, removed files and denied download capability fail closed. The first implementation checks all imported Drive objects in the workspace and needs batching/caching/load testing for scale.

This is selected-file/manual synchronization, not full folder backfill, webhook ingestion or scheduled incremental sync. OAuth, real-account ACL revocation and document parsing must be verified with live test accounts before deployment.

The implementation follows Google's [web-server OAuth guidance](https://developers.google.com/identity/protocols/oauth2/web-server) and [export format reference](https://developers.google.com/workspace/drive/api/guides/ref-export-formats). Already-revoked tokens are recognized using the documented [`invalid_token` revocation response](https://developers.google.com/identity/openid-connect/reference); disconnect is allowed for `needs_reauth` connections as well as connected ones. Provider/network revocation failures require retry before purging. Source/import mutations and their jobs/grants/audit writes are transaction-wrapped.

## Verification

The Vitest backend suite exercises the original pipeline and the new access/state workflows with in-memory SQLite and a fake Gemini client. Google contract tests mock OAuth/provider responses to exercise state replay, scope validation, encryption, ACL denial/revocation, deduplication, size limits and disconnect. Mocked success is not live integration verification. Error logging strips SDK payloads/causes, and does not store Ask queries on FTS failures. Bruno can additionally run against an isolated HTTP fixture:

```bash
# Terminal 1, from apps/api; uses an ephemeral DB and fake model
NODE_ENV=test AUTH_MODE=development GEMINI_API_KEY=smoke-fixture \
  node --import tsx src/scripts/smoke-server.ts

# Terminal 2, from bruno/contextos-api
bru run . -r --env Local \
  --env-var baseUrl=http://127.0.0.1:3001/api/v1 --bail
```

The fixture is not a production entry point. Multi-user workflows are covered by API tests and need real distinct Clerk sessions for Bruno's corresponding optional requests. The fixture does not validate Google/Clerk credentials, real Gemini quality, deployment availability or PRD performance targets.
