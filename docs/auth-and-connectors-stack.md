# ContextOS — Authentication, authorization, and connector stack

Reviewed on 13 October 2026 against the [product handoff](ContextOS_Knowledge_Handoff.md), package manifests, API middleware, and database schema.

Status: **proposed additions and implementation requirements**. This document adds the missing stack choices and delivery plan; the packages and features below are not installed or implemented by this review. The application still uses its development actor and manual imports.

**Sign-in update (15 October 2026).** Clerk was not adopted. Sign-in is our own: Better Auth inside the API with email and password, emailed sign-in links, Google, Microsoft, and company SSO (OIDC or SAML) once a workspace verifies its email domain. Sessions are stored in SQLite behind an HttpOnly cookie, so the web app sends no bearer token; workspaces, memberships, roles and invitations stay in the application tables. See [decisions.md](decisions.md) and [api-reference.md](api-reference.md#authentication-and-tenancy). The sign-in rows below now describe what was built; the rest of this document is the original plan.

Implementation follow-up: the later PRD backend extension installs the backend authentication/Drive/parser packages and implements a subset of these workflows. This planning document's Editor/Viewer role proposal is superseded by the PRD's Owner/Admin/Manager/Member/Guest roles plus HR (People Ops) from the [role access spec](../ContextOS_Role_Access_Spec.md). See [the implemented API guide](backend-api-use-cases.md) and [remaining release gates](backend-production-readiness.md) for current status.

## 1. Keep the current foundation

Keep React 19 + Vite + React Router, Node 24 + Hono, shared TypeScript/Zod contracts, Drizzle + SQLite/FTS5, Gemini, and the durable SQLite job worker. Authentication and Drive access fit this stack.

The handoff requires authentication, basic roles, and permission-aware ingestion and answers (§5, §7–9, §13). Real company files require source access enforcement before shared use.

## 2. Stack additions

| Capability                                          | Recommended addition                                                                                                   | Where it belongs                                     | Delivery                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------ |
| Sign-in, sessions, invitations, workspace selection | Better Auth (`better-auth`) with its magic-link and SSO plugins; sessions in SQLite behind an HttpOnly cookie          | API `modules/auth`; web sign-in and account screens  | Done (15 October)                    |
| Verify authenticated requests                       | Better Auth `getSession()` on each request, then the active workspace's membership in the application tables           | Hono middleware (`identity.authenticate`)            | Done (15 October)                    |
| Role-based authorization                            | A small shared permission catalog + server-side policies + Drizzle membership tables                                   | `packages/shared` schemas; API services/repositories | Next implementation                  |
| Drive OAuth and file APIs                           | `googleapis`, using its OAuth2 client and Drive v3 client                                                              | API connector module and worker                      | First connector                      |
| Explicit file selection                             | Google Picker browser API + enabled Drive API                                                                          | Web connection/source-selection UI                   | First connector                      |
| Token protection                                    | Built-in `node:crypto` AES-256-GCM; externally supplied encryption key; managed secret store/KMS for deployment        | API credential service                               | Before persisting OAuth tokens       |
| PDF text extraction                                 | `pdfjs-dist` (Mozilla PDF.js), isolated in a bounded worker operation                                                  | API parser module                                    | First connector                      |
| Google Docs/plain text/Markdown extraction          | Drive text export + built-in text decoding                                                                             | API parser module                                    | First connector                      |
| DOCX extraction                                     | `mammoth`, using raw-text extraction                                                                                   | API parser module                                    | After Docs/PDF pilot                 |
| Raw file storage                                    | Restricted local directory for local development; private S3-compatible storage and `@aws-sdk/client-s3` when deployed | Storage adapter                                      | Only when raw bytes must be retained |
| Browser authentication and access regression tests  | Playwright, alongside existing Vitest API tests                                                                        | Web end-to-end suite                                 | Before shared pilot                  |
| Connector monitoring                                | Existing pino/audit/jobs, extended with redaction and sync/access events                                               | API                                                  | With connector                       |

Sign-in uses [Better Auth](https://www.better-auth.com/docs) as a library inside the API: it takes a standard `Request`, so Hono hands it the `/api/v1/auth/*` routes directly, and its tables live in the same SQLite database (`auth_*`). No framework migration or hosted identity vendor is needed.

Use `googleapis` as the direct dependency; it already exposes the Google OAuth client. See the [official Node client](https://github.com/googleapis/google-api-nodejs-client). Keep the existing job queue initially; revisit PostgreSQL + pgvector and Redis/BullMQ when deployment/concurrency requires them. A separate authorization service such as OpenFGA is a later option if relationship policies outgrow relational checks.

## 3. What is missing today

| Existing implementation                  | Gap                                                                                                                                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `middleware/actor.ts` and `container.ts` | Every request receives the same development identity. There is no sign-in, token verification, session revocation handling, or organization selection.                                   |
| `middleware/project-scope.ts`            | Checks the project's workspace against that development actor; does not check authenticated membership or role.                                                                          |
| `db/schema.ts`                           | No users, workspace/project memberships, invitations, connector connections, token store, sync cursors, or source grants. Tenant scope is partly inherited through project foreign keys. |
| `modules/sources`                        | Accepts pasted text; no OAuth, file discovery, downloads, exports, or binary parsing. Connector enum values are not working integrations.                                                |
| Ask retrieval and context queries        | Accept a project scope, without a requesting-user source-access filter. Related context can combine evidence from several sources.                                                       |
| Hub snapshots and question history       | Persist project-wide generated content. Hiding citations would not remove restricted information from the generated prose.                                                               |
| `web/lib/api-client.ts` and query keys   | No session bearer token or user/organization-specific cache lifecycle.                                                                                                                   |
| Audit and retry worker                   | Useful foundation, but require identity events, credential redaction, connector jobs, and permission-revocation cleanup.                                                                 |

Adding authentication is more than replacing the actor middleware: membership, resource policies, retrieval, derived content, caches, and background jobs must all participate.

## 4. Authentication and application roles

Built: Better Auth holds user identity, sign-in methods and sessions; ContextOS's own tables hold workspaces, memberships and invitations. A session carries its active workspace, chosen through `PUT /session/workspace` and checked against an active membership on every request, never taken from a client-supplied workspace ID. ContextOS application roles live in the local membership tables as the authorization source of truth. Workspace ownership is explicit and every role change is audited.

Proposed default policy:

| Operation                                                                      | Owner | Admin                            | Editor                    | Viewer                    |
| ------------------------------------------------------------------------------ | ----- | -------------------------------- | ------------------------- | ------------------------- |
| Read authorized hub, files and answers; ask questions; submit feedback         | Yes   | Yes                              | Yes, on assigned projects | Yes, on assigned projects |
| Create projects                                                                | Yes   | Yes                              | No                        | No                        |
| Update projects; import approved sources; refresh/reprocess                    | Yes   | Yes                              | Yes, on assigned projects | No                        |
| Confirm/dispute context items                                                  | Yes   | Yes                              | Yes, on assigned projects | No                        |
| Configure project source selections and manage project members                 | Yes   | Yes                              | No                        | No                        |
| Delete a project/source, manage shared connectors, invite members/change roles | Yes   | Yes, excluding ownership changes | No                        | No                        |
| Transfer ownership or delete the workspace                                     | Yes   | No                               | No                        | No                        |

Every signed-in user may authorize or disconnect their own Google connection. Connecting that account does not permit changing shared project ingestion scopes. A project's read/edit membership restricts editor/viewer access; workspace owner/admin privileges cover administration but **never bypass source permissions**. Business roles used for onboarding (engineer, product manager, new hire) are separate from security roles.

Implementation requirements:

- Built: the session travels in an HttpOnly cookie (`credentials: "include"`); no tokens in URLs or browser storage. State-changing requests must come from a trusted origin.
- Hono verifies the token with the backend SDK, an explicit allowed-origin list (`authorizedParties`), session-token type, and expected issuer/audience as applicable. Resolve current membership and disabled state; verify current provider membership for revocation-sensitive actions rather than relying only on delayed webhook delivery or old claims.
- Extend `Actor` with the verified user/session/organization and resolved membership. Check permission in the API and scope every repository operation by workspace/project/source. UI visibility is a convenience, not an authorization check.
- Use `401` for missing/invalid authentication, `403` for denied operations, and `404` for inaccessible foreign resources when revealing existence would leak data.
- Membership and role changes take effect on the next request, because each request reads the membership; there is no identity webhook to verify. Preserve existing data by explicitly assigning the current default workspace to an organization during migration.
- Keep public liveness/readiness limited to operational health. A future local development auth mode must be explicit; startup must reject that mode in production.
- Include user ID and workspace ID in frontend cache scope; clear protected query state on sign-out or organization change.

## 5. Google Drive access and document reading

"Continue with Google" sign-in authenticates the person to ContextOS. A separate Google OAuth consent grant authorizes Drive access. Use an authorization-code flow handled by the API, offline access for refresh, and a single-use random state bound to user/workspace/connection, with expiry and an allowlisted return URL. Implement PKCE where supported by the chosen web-client flow. Never treat callback query parameters as trusted tenant identity. See [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

Choose the source-selection mode explicitly:

| Mode                                                           | OAuth scope                                      | Implication                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MVP: users explicitly select individual files in Google Picker | `https://www.googleapis.com/auth/drive.file`     | Grants access to files opened/shared with this app. This is a non-sensitive scope, but permits more than reads; implement only reads and document the consent accurately.                                                                                       |
| Later: continuously crawl chosen folders or shared drives      | `https://www.googleapis.com/auth/drive.readonly` | Can read the consenting account's accessible files; this restricted scope requires review appropriate to the deployment, and may require a security assessment when restricted data is stored/transmitted. The app still enforces the selected folder boundary. |

Selecting a folder with `drive.file` does not grant blanket access to every existing descendant. Metadata-only scopes cannot read file content. A service account reads only what is shared with it unless an administrator separately configures domain-wide delegation; do not use delegation for the first pilot. See [scope definitions and verification](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) and [Picker](https://developers.google.com/workspace/drive/picker/guides/overview).

The connector needs:

- A Google Cloud project, consent configuration/test users, enabled Drive API (and Picker API for the selection UI), web OAuth client, exact callback URL, and an origin/API-restricted Picker key. Enable Google Docs API only if structured document operations are later needed; Drive export suffices for plain text.
- Separate connections per Google account; stable verified Google subject IDs, recorded granted scopes, credential expiry, connection status and reauthorization UI. Tokens stay server-side, except a short-lived access token when necessary for Picker; never expose refresh tokens/client secrets.
- Paginated file discovery/metadata with stable file IDs, MIME type, parent/drive ID, timestamps, links, content/revision fingerprints and download capability. For shared drives use the supported `supportsAllDrives`/`includeItemsFromAllDrives` and appropriate corpora/drive ID parameters. See [shared-drive support](https://developers.google.com/workspace/drive/api/guides/enable-shareddrives).
- Google Docs: `files.export` to `text/plain`. PDFs/text/binary documents: `files.get` with `alt=media`, streamed with limits. Respect download restrictions and export size limits. For future Sheets/Slides support define worksheet/slide provenance and export handling separately. See [download/export behavior](https://developers.google.com/workspace/drive/api/guides/manage-downloads).
- PDF.js text extraction with page provenance and resource limits; scanned PDFs need a separately planned OCR step and must report “no extractable text” instead of becoming misleading empty sources. DOCX uses Mammoth raw text. Do not render unsanitized extracted HTML. See [PDF.js](https://mozilla.github.io/pdf.js/getting_started/) and [Mammoth](https://github.com/mwilliamson/mammoth.js).
- MIME allowlists, byte/page/time limits, safe generated storage paths, and handling for shortcuts and unsupported/encrypted files. Normalize readable text into the existing source/chunk/evidence pipeline.
- Idempotent backfill/manual refresh first, then durable changes-feed cursors, deletions and retry/backoff for quotas. Keep job payloads as connection/source IDs rather than tokens. See [Drive changes](https://developers.google.com/workspace/drive/api/guides/manage-changes).

## 6. Source permissions and derived content

Access requires all of: authenticated user, current workspace membership, permitted project action, selected project source, and current access to the underlying source. A shared connector's token proves the connecting account can fetch a file; it does not prove every teammate can read it.

For the first real-data pilot, use each reader's linked Google identity and delegated token to check current access and content-read restrictions for each candidate file. Require the reader's OAuth grant to cover that file. Missing connections, stale/unknown grants, revoked credentials, or failed access verification must deny that source. Reading a `permissions` list alone is insufficient for all inherited/group/shared-drive access cases; snapshot ACLs are useful metadata, not an authoritative substitute for reader access checks. See [Drive permission model](https://developers.google.com/workspace/drive/api/guides/manage-sharing).

Filter authorized source IDs before retrieving passage content or constructing prompts, on both keyword and vector paths. Do not expand related context into unreadable evidence. Existing context summaries merged across files must be treated as depending on **all** contributing sources, or regenerated from just the permitted evidence; filtering evidence rows alone does not sanitize their prose.

Apply the same dependency checks to hubs, counts, source drawers, question history, citations, downloads, learning paths and future exports. The existing project-wide hub snapshot can be served only when the reader may access its complete source dependency set; otherwise generate an access-scoped view or withhold it. Stored answers require dependency metadata and a fresh access check on read.

Cache keys include user/access scope, workspace, project and an authorization version. Permission removal invalidates dependent content. Polling/change notifications support cleanup but do not guarantee immediate revocation; for the pilot check current source access before returning content and recheck before returning a generated answer. Fail closed on verification failures. This costs API calls and should be measured before introducing caches with a documented revocation window.

## 7. Database and API additions

Proposed Drizzle migrations (not applied):

| Table/change                       | Minimum purpose                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `users`                            | Stable local ID, unique identity-provider user ID, display name, lifecycle state          |
| `workspaces` extension             | Unique external organization ID and explicit owner membership                             |
| `workspace_memberships`            | Workspace/user unique key, application role, active/revoked state                         |
| `project_memberships`              | Project/user unique key, read/edit access                                                 |
| `identity_events`                  | Verified webhook deduplication and event ordering                                         |
| `connector_connections`            | Workspace/user/provider account, scopes, status, encrypted credential reference           |
| `connector_credentials`            | Ciphertext, unique nonce, authentication tag, key version, refresh/expiry metadata        |
| `oauth_states`                     | Hashed single-use state, user/workspace binding, expiry, optional PKCE verifier           |
| `project_source_scopes`            | Explicit project/connection/file-or-folder selection, sync status/cursor                  |
| `source_objects` extension         | Connection identity, external file ID, MIME/revision, permission state/version, tombstone |
| `source_access_grants`             | Reader identity/source grants and last verification; deny when no current entitlement     |
| Derived-content dependency records | All sources used by context items, snapshots, answers and future artifacts                |

Scope connector foreign keys and upsert uniqueness to workspace/connection/project/external ID; two users/projects may ingest the same external file without crossing tenant boundaries. Add indexes for access-filtered retrieval. Store AES-GCM credentials with unique nonces and authenticated connection metadata; keep key material outside SQLite and record key version for rotation. Built-in [Node crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html) is sufficient for a local implementation, but does not encrypt the full SQLite database or raw-file volume; use encrypted storage and tested backups for deployment.

Proposed routes under `/api/v1`:

- `GET /me`; workspace membership/invitation administration; project membership administration.
- `GET /connectors`; `POST /connectors/google-drive/authorize`; `GET /connectors/google-drive/callback`.
- `GET /connectors/:connectionId/files`; `POST /projects/:projectId/source-scopes`; `POST /projects/:projectId/sync`.
- `DELETE /connectors/:connectionId` with credential revocation and dependent-content invalidation.

Extend shared Zod schemas and existing error envelopes, add `sync_connector` jobs, and expose connection health/progress. All routes above are future endpoints, not part of today's Bruno collection.

## 8. Configuration and delivery order

Configuration to add when implementation starts (not currently supported by `EnvSchema`):

| Location      | Variables                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Web           | Optional `VITE_GOOGLE_PICKER_API_KEY` / `VITE_GOOGLE_CLOUD_PROJECT_NUMBER`                                                         |
| API (built)   | `AUTH_MODE=accounts`, `AUTH_SECRET`, `AUTH_URL`, `SMTP_URL`, `EMAIL_FROM`, `MICROSOFT_CLIENT_ID/SECRET/TENANT_ID`                  |
| API connector | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `CONNECTOR_TOKEN_ENCRYPTION_KEY`, `CONNECTOR_TOKEN_KEY_VERSION` |
| API storage   | `RAW_FILE_STORAGE_DIR`, byte/page/time limits; optional deployed bucket/region configuration                                       |

Only publishable/browser-restricted values belong in `VITE_*`; all credential secrets remain in API configuration. Put placeholders in `.env.example` and update Zod validation and build/runtime environment forwarding together during implementation.

Suggested implementation sequence:

1. Done: sign-in (Better Auth), local memberships and roles, workspace selection, and protected APIs with a cookie session.
2. Add source-access policies and dependency records; close hub/history/context leakage paths before importing real private documents.
3. Register Google OAuth/Picker, add encrypted credential handling, and validate actual scopes with test accounts.
4. Implement selected-file Docs/PDF import, reader-access verification, backfill and manual sync through the existing worker.
5. Test owner/admin/editor/viewer permissions, two organizations, two Google users with different file access, access revocation, unsupported files, idempotent sync and denied downloads. Add authenticated Bruno environments using session tokens stored outside tracked files.
6. Add folder/shared-drive sync only after restricted-scope approval and permission tests; add Slack, then Jira/GitHub using the same connector contract. Deliver learning-path generation separately after the access foundation.

When step 1/3/4 implementation starts, resolve compatible versions and use these package targets:

```bash
pnpm --filter @contextos/api add googleapis pdfjs-dist
# Add DOCX support only when enabled in the parser's format allowlist:
pnpm --filter @contextos/api add mammoth
```

No production vendor plan, cloud account, OAuth registration, or dependency installation is created by this stack review.
