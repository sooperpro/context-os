import {
  type AdminConnectorScope,
  ConnectInputSchema,
  ConnectorRequestInputSchema,
  ReconnectInputSchema,
  type AdminConnector,
  type ConnectorConsent,
  type ScopeVisibility,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import {
  connectorConnections,
  connectorScopes,
  identityLinks,
  jobs,
  projects,
  sourceObjects,
  users,
} from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { requireRole } from "../identity/identity.service.js";
import { createPlatformStore } from "../platform/store.js";
import {
  scopeNote,
  scopeSyncJob,
  syncFrequencyOf,
  type createGoogleDriveService,
  type ScopeCursor,
} from "./google-drive.js";

type DriveService = ReturnType<typeof createGoogleDriveService>;
type Catalog = Pick<
  AdminConnector,
  "id" | "name" | "category" | "description" | "unit" | "popular" | "needsAdminOf"
>;

const DRIVE = "google-drive";
const OPTIONS_TTL_MS = 5 * 60_000;
const IdParam = z.object({ id: z.string().min(1).max(50) });

/**
 * The integrations ContextOS lists. Google Drive is the only one implemented; the others are shown
 * so admins can see what is planned and ask for it, and answer 503 when connected.
 */
const CATALOG: Catalog[] = [
  {
    id: DRIVE,
    name: "Google Drive",
    category: "files",
    description: "Docs, PDFs, Word and text files in My Drive and shared drives.",
    unit: "Folders",
    popular: true,
    needsAdminOf: null,
  },
  ...(
    [
      [
        "onedrive",
        "Microsoft OneDrive",
        "files",
        "Files and folders in OneDrive for Business.",
        "Folders",
        true,
        "Microsoft 365",
      ],
      [
        "dropbox",
        "Dropbox",
        "files",
        "Team folders, files and Paper docs.",
        "Team folders",
        false,
        null,
      ],
      ["box", "Box", "files", "Folders and files your teams share in Box.", "Folders", false, null],
      [
        "confluence",
        "Confluence",
        "wiki",
        "Spaces, pages, blog posts and attachments.",
        "Spaces",
        false,
        null,
      ],
      [
        "notion",
        "Notion",
        "wiki",
        "Pages and databases in your teamspaces.",
        "Teamspaces",
        true,
        null,
      ],
      [
        "slack",
        "Slack",
        "chat",
        "Public channels, threads and canvases. Never DMs or private channels.",
        "Channels",
        true,
        null,
      ],
      [
        "teams",
        "Microsoft Teams",
        "chat",
        "Team channels, posts and meeting transcripts.",
        "Teams",
        false,
        "Microsoft 365",
      ],
      [
        "zoom",
        "Zoom",
        "chat",
        "Transcripts from cloud recordings, such as all-hands and demos.",
        "Recordings",
        false,
        null,
      ],
      ["loom", "Loom", "chat", "Video walkthroughs and their transcripts.", "Spaces", false, null],
      [
        "github",
        "GitHub",
        "eng",
        "READMEs, docs folders, pull requests and issues.",
        "Repositories",
        true,
        null,
      ],
      ["gitlab", "GitLab", "eng", "Repositories, merge requests and wikis.", "Groups", false, null],
      [
        "bitbucket",
        "Bitbucket",
        "eng",
        "Repositories and pull requests.",
        "Workspaces",
        false,
        null,
      ],
      [
        "jira",
        "Jira",
        "pm",
        "Projects, epics and issues, with their history.",
        "Projects",
        false,
        null,
      ],
      [
        "linear",
        "Linear",
        "pm",
        "Teams, projects, issues and project updates.",
        "Teams",
        false,
        null,
      ],
      ["asana", "Asana", "pm", "Projects, tasks and status updates.", "Projects", false, null],
      ["figma", "Figma", "design", "Files, comments and FigJam boards.", "Teams", false, null],
      [
        "salesforce",
        "Salesforce",
        "crm",
        "Knowledge articles, accounts and opportunities.",
        "Objects",
        false,
        null,
      ],
      [
        "zendesk",
        "Zendesk",
        "crm",
        "Help center articles and support macros.",
        "Content",
        false,
        null,
      ],
      [
        "web",
        "Websites",
        "other",
        "Crawl internal docs sites and public help pages.",
        "Sites",
        false,
        null,
      ],
    ] as const
  ).map(([id, name, category, description, unit, popular, needsAdminOf]) => ({
    id,
    name,
    category,
    description,
    unit,
    popular,
    needsAdminOf,
  })),
];

const available = (entry: Catalog): AdminConnector => ({
  ...entry,
  scopeOptions: [],
  state: "available",
  detail: null,
  lastSyncAt: null,
  progress: null,
  error: null,
});

const count = (value: number, one: string, many = `${one}s`) =>
  `${value.toLocaleString("en-US")} ${value === 1 ? one : many}`;

const yearsAgo = (years: number) => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
};

/**
 * Admin connector catalog (`/admin/connectors`): every integration with the workspace's connection
 * state. Google Drive's state comes from the members' Drive connections, their selected scopes, the
 * sync jobs and the documents being processed. The page polls this every second while a sync runs,
 * so it reads only the local database; Drive itself is asked only for the admin's folder list.
 */
export function createAdminConnectorRoutes(container: Container, drive: DriveService) {
  const { db, identity, queue, audit } = container;
  const store = createPlatformStore(db);
  const admin = (actor: Actor) => requireRole(actor, "owner", "admin");
  const optionCache = new Map<
    string,
    {
      at: number;
      options: AdminConnector["scopeOptions"];
      types: Map<string, "folder" | "shared_drive">;
    }
  >();

  const catalogEntry = (id: string) => {
    const entry = CATALOG.find((item) => item.id === id);
    if (!entry) throw new NotFoundError("Connector");
    return entry;
  };
  const ownConnection = (actor: Actor) =>
    db
      .select()
      .from(connectorConnections)
      .where(
        and(
          eq(connectorConnections.workspaceId, actor.workspaceId),
          eq(connectorConnections.userId, actor.id),
          eq(connectorConnections.provider, "google_drive"),
          eq(connectorConnections.status, "connected"),
        ),
      )
      .get();

  /** The admin's Drive as pickable folders (My Drive, shared drives, top-level folders), cached. */
  const scopeOptions = async (actor: Actor, fresh = false) => {
    const connection = ownConnection(actor);
    if (!connection) return { options: [], types: new Map<string, "folder" | "shared_drive">() };
    const cached = optionCache.get(connection.id);
    if (cached && !fresh && Date.now() - cached.at < OPTIONS_TTL_MS) return cached;
    try {
      const listed = await drive.listScopes(actor, connection.id);
      const value = {
        at: Date.now(),
        options: listed.items.map((item) => ({
          id: item.externalId,
          name: item.name,
          restricted: false,
        })),
        types: new Map(listed.items.map((item) => [item.externalId, item.scopeType] as const)),
      };
      optionCache.set(connection.id, value);
      return value;
    } catch {
      return { options: [], types: new Map<string, "folder" | "shared_drive">() };
    }
  };

  /** Google Drive's card: connected accounts, selected scopes, sync jobs and processing progress. */
  const driveState = (actor: Actor) => {
    const connections = db
      .select()
      .from(connectorConnections)
      .where(
        and(
          eq(connectorConnections.workspaceId, actor.workspaceId),
          eq(connectorConnections.provider, "google_drive"),
        ),
      )
      .all()
      .filter((row) => row.status !== "revoked");
    if (!connections.length) return null;
    const scopes = db
      .select()
      .from(connectorScopes)
      .where(
        inArray(
          connectorScopes.connectionId,
          connections.map((row) => row.id),
        ),
      )
      .all()
      .filter((scope) => !scope.isExcluded);
    const projectIds = db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.workspaceId, actor.workspaceId))
      .all()
      .map((row) => row.id);
    const sources = projectIds.length
      ? db
          .select({ status: sourceObjects.status })
          .from(sourceObjects)
          .where(
            and(
              inArray(sourceObjects.projectId, projectIds),
              eq(sourceObjects.connector, "google_drive"),
            ),
          )
          .all()
      : [];
    const pending = (type: "sync_connector" | "import_drive_file") =>
      projectIds.length
        ? (db
            .select({ total: sql<number>`count(*)` })
            .from(jobs)
            .where(
              and(
                inArray(jobs.projectId, projectIds),
                eq(jobs.type, type),
                inArray(jobs.status, ["queued", "running"]),
              ),
            )
            .get()?.total ?? 0)
        : 0;
    const activeSyncs = pending("sync_connector");
    // Files listed but not downloaded yet count toward the work left.
    const importing = pending("import_drive_file");
    const ready = sources.filter((source) => source.status === "ready").length;
    const settled = sources.filter((source) => ["ready", "failed"].includes(source.status)).length;
    const processing = sources.length - settled + importing;
    const lastSynced = scopes
      .map((scope) => scope.lastSyncedAt?.getTime() ?? 0)
      .reduce((max, value) => Math.max(max, value), 0);
    const lastRequested = scopes
      .map((scope) => scope.lastSyncRequestedAt?.getTime() ?? 0)
      .reduce((max, value) => Math.max(max, value), 0);

    const expired = connections.filter((row) => row.status === "needs_reauth");
    if (expired.length && !connections.some((row) => row.status === "connected"))
      return {
        state: "error" as const,
        detail: count(ready, "file") + " indexed",
        lastSyncAt: lastSynced ? new Date(lastSynced).toISOString() : null,
        progress: null,
        error: "Google Drive access expired. Sign in again from Setup to resume syncing.",
        reauth: true,
      };
    const degraded = scopes.filter((scope) => ["degraded", "needs_reauth"].includes(scope.status));
    if (degraded.length)
      return {
        state: "error" as const,
        detail: `${count(scopes.length - degraded.length, "folder")} of ${scopes.length} syncing`,
        lastSyncAt: lastSynced ? new Date(lastSynced).toISOString() : null,
        progress: null,
        error: degraded[0]!.lastError ?? `${count(degraded.length, "folder")} failed to sync`,
        reauth: degraded.some((scope) => scope.status === "needs_reauth"),
      };
    const backfilling = scopes.some((scope) => scope.status === "backfilling");
    if (backfilling || activeSyncs > 0 || processing > 0) {
      const share = sources.length + importing ? settled / (sources.length + importing) : 0;
      // Every known document is processed but Drive is still being walked for new ones.
      const walking = processing === 0 && sources.length > 0;
      return {
        state: "syncing" as const,
        detail: walking
          ? "Checking Drive for new files"
          : `${lastSynced ? "Syncing" : "First sync"} · ${Math.round(share * 100)}%`,
        lastSyncAt: lastRequested ? new Date(lastRequested).toISOString() : null,
        progress: Math.min(0.99, Math.max(0.02, share)),
        error: null,
        reauth: false,
      };
    }
    const partial = scopes.find((scope) => scope.lastError)?.lastError;
    return {
      state: "healthy" as const,
      detail: scopes.length
        ? [`${count(ready, "file")} indexed`, partial].filter(Boolean).join(" · ")
        : "Connected · no folders chosen yet",
      lastSyncAt: lastSynced
        ? new Date(lastSynced).toISOString()
        : (connections[0]?.createdAt.toISOString() ?? null),
      progress: null,
      error: null,
      reauth: false,
    };
  };

  const describe = async (actor: Actor, id: string): Promise<AdminConnector> => {
    const entry = catalogEntry(id);
    if (id !== DRIVE) return available(entry);
    const state = driveState(actor);
    const { options } = await scopeOptions(actor);
    if (!state) return { ...available(entry), scopeOptions: options };
    const { reauth: _reauth, ...rest } = state;
    return { ...entry, scopeOptions: options, ...rest };
  };

  const notAvailable = (entry: Catalog) =>
    new AppError(
      503,
      "NOT_CONFIGURED",
      `${entry.name} isn't available yet. Use “Request a connector” to tell us you need it.`,
    );

  return (
    new Hono<AppEnv>()
      .get("/admin/connectors", async (c) => {
        const actor = c.get("actor");
        admin(actor);
        const items = await Promise.all(CATALOG.map((entry) => describe(actor, entry.id)));
        return c.json({ items });
      })
      .post(
        "/admin/connectors/:id/authorize",
        zValidator("param", IdParam, validationHook),
        (c) => {
          const actor = c.get("actor");
          admin(actor);
          const entry = catalogEntry(c.req.valid("param").id);
          if (entry.id !== DRIVE) throw notAvailable(entry);
          const connection = ownConnection(actor);
          if (!connection)
            return c.json({
              account: null,
              authorizationUrl: drive.authorize(actor).authorizationUrl,
            } satisfies ConnectorConsent);
          const email = db
            .select({ email: identityLinks.email })
            .from(identityLinks)
            .where(
              and(
                eq(identityLinks.workspaceId, actor.workspaceId),
                eq(identityLinks.userId, actor.id),
                eq(identityLinks.provider, "google"),
              ),
            )
            .get()?.email;
          return c.json({
            account: email ?? connection.accountId ?? "your Google account",
            authorizationUrl: null,
          } satisfies ConnectorConsent);
        },
      )
      .post(
        "/admin/connectors/:id/connect",
        zValidator("param", IdParam, validationHook),
        zValidator("json", ConnectInputSchema, validationHook),
        async (c) => {
          const actor = c.get("actor");
          admin(actor);
          const entry = catalogEntry(c.req.valid("param").id);
          if (entry.id !== DRIVE) throw notAvailable(entry);
          const input = c.req.valid("json");
          if (!input.projectId) throw new BadRequestError("Choose the project these folders feed");
          const project = identity.requireProject(actor, input.projectId);
          const connection = ownConnection(actor);
          if (!connection) throw new AppError(409, "CONFLICT", "Authorize Google Drive first");
          const { types, options } = await scopeOptions(actor, true);
          const unknown = input.scopeIds.filter((id) => !types.has(id));
          if (unknown.length)
            throw new BadRequestError("Some of the chosen folders were not found");
          const visibility: ScopeVisibility = input.visibility ?? "restricted";
          const backfillFrom =
            input.skipOlderThan === "never"
              ? undefined
              : yearsAgo(input.skipOlderThan === "3y" ? 3 : 1);
          const existing = db
            .select()
            .from(connectorScopes)
            .where(
              and(
                eq(connectorScopes.connectionId, connection.id),
                eq(connectorScopes.projectId, project.id),
              ),
            )
            .all();
          const picked = new Set(input.scopeIds);
          drive.setScopes(actor, connection.id, {
            projectId: project.id,
            scopes: [
              ...existing
                .filter((scope) => !picked.has(scope.externalId))
                .map((scope) => ({
                  scopeType: scope.scopeType as "folder" | "shared_drive",
                  externalId: scope.externalId,
                  name: scope.name,
                  excluded: scope.isExcluded,
                  backfillFrom: scope.backfillFrom?.toISOString().slice(0, 10),
                  visibility: scope.visibility,
                  frequency: syncFrequencyOf(scope),
                })),
              ...input.scopeIds.map((id) => ({
                scopeType: types.get(id)!,
                externalId: id,
                name: options.find((option) => option.id === id)?.name ?? id,
                excluded: false,
                backfillFrom,
                visibility,
                frequency: input.frequency,
              })),
            ],
          });
          drive.requestSync(actor, connection.id);
          return c.json(await describe(actor, DRIVE));
        },
      )
      .post(
        "/admin/connectors/:id/reconnect",
        zValidator("param", IdParam, validationHook),
        zValidator("json", ReconnectInputSchema, validationHook),
        async (c) => {
          const actor = c.get("actor");
          admin(actor);
          const entry = catalogEntry(c.req.valid("param").id);
          const state = entry.id === DRIVE ? driveState(actor) : null;
          if (state?.state !== "error")
            throw new AppError(409, "CONFLICT", "Only a failing connector can be reconnected");
          if (state.reauth)
            throw new AppError(
              409,
              "CONFLICT",
              "Google Drive access expired. Open Setup and choose Connect Google Drive to sign in again.",
            );
          // Re-sync every failed scope now, whoever's connection it uses; the 10-minute cooldown is for
          // manual re-syncs of healthy scopes.
          const connectionIds = db
            .select({ id: connectorConnections.id })
            .from(connectorConnections)
            .where(eq(connectorConnections.workspaceId, actor.workspaceId))
            .all()
            .map((row) => row.id);
          const failed = connectionIds.length
            ? db
                .select()
                .from(connectorScopes)
                .where(
                  and(
                    inArray(connectorScopes.connectionId, connectionIds),
                    eq(connectorScopes.status, "degraded"),
                  ),
                )
                .all()
            : [];
          for (const scope of failed) {
            db.update(connectorScopes)
              .set({ status: "backfilling", lastError: null, lastSyncRequestedAt: new Date() })
              .where(eq(connectorScopes.id, scope.id))
              .run();
            queue.enqueue(scopeSyncJob(scope));
          }
          audit.record({
            actor,
            action: "connector.reconnect",
            targetType: "connector",
            targetId: entry.id,
            metadata: { scopes: failed.length },
          });
          return c.json(await describe(actor, entry.id));
        },
      )
      // Manage (role access spec §4.8): every folder Google Drive keeps in sync, across members.
      .get("/admin/connectors/:id/scopes", zValidator("param", IdParam, validationHook), (c) => {
        const actor = c.get("actor");
        admin(actor);
        const entry = catalogEntry(c.req.valid("param").id);
        if (entry.id !== DRIVE) return c.json({ items: [] });
        const rows = db
          .select({
            scope: connectorScopes,
            projectName: projects.name,
            ownerName: users.name,
          })
          .from(connectorScopes)
          .innerJoin(projects, eq(projects.id, connectorScopes.projectId))
          .innerJoin(
            connectorConnections,
            eq(connectorConnections.id, connectorScopes.connectionId),
          )
          .innerJoin(users, eq(users.id, connectorConnections.userId))
          .where(eq(connectorScopes.workspaceId, actor.workspaceId))
          .orderBy(projects.name, connectorScopes.name)
          .all();
        return c.json({
          items: rows.map(({ scope, projectName, ownerName }): AdminConnectorScope => ({
            id: scope.id,
            name: scope.name,
            projectId: scope.projectId,
            projectName,
            connectedBy: ownerName,
            status: scope.isExcluded ? "excluded" : scope.status,
            itemCount: scope.itemCount,
            lastSyncedAt: scope.lastSyncedAt?.toISOString() ?? null,
            lastError: scope.lastError,
            note: scopeNote(scope.cursor as ScopeCursor | null),
            frequency: syncFrequencyOf(scope),
            visibility: scope.visibility,
          })),
        });
      })
      .post("/admin/connectors/:id/sync", zValidator("param", IdParam, validationHook), (c) => {
        const actor = c.get("actor");
        admin(actor);
        const entry = catalogEntry(c.req.valid("param").id);
        if (entry.id !== DRIVE) throw notAvailable(entry);
        const now = new Date();
        let queued = 0;
        for (const { scope } of db
          .select({ scope: connectorScopes })
          .from(connectorScopes)
          .innerJoin(
            connectorConnections,
            eq(connectorConnections.id, connectorScopes.connectionId),
          )
          .where(
            and(
              eq(connectorScopes.workspaceId, actor.workspaceId),
              eq(connectorScopes.isExcluded, false),
              eq(connectorConnections.status, "connected"),
            ),
          )
          .all()) {
          // The same 10-minute cooldown as a manual re-sync of one folder.
          if (
            scope.lastSyncRequestedAt &&
            now.getTime() - scope.lastSyncRequestedAt.getTime() < 600_000
          )
            continue;
          db.update(connectorScopes)
            .set({
              lastSyncRequestedAt: now,
              status: scope.lastSyncedAt ? scope.status : "backfilling",
            })
            .where(eq(connectorScopes.id, scope.id))
            .run();
          queue.enqueue(scopeSyncJob(scope));
          queued += 1;
        }
        audit.record({
          actor,
          action: "connector.sync",
          targetType: "connector",
          targetId: entry.id,
          metadata: { queued, scope: "all" },
        });
        return c.json({ queued }, 202);
      })
      .delete(
        "/admin/connectors/:id/scopes/:scopeId",
        zValidator(
          "param",
          IdParam.extend({ scopeId: z.string().min(1).max(200) }),
          validationHook,
        ),
        (c) => {
          const actor = c.get("actor");
          admin(actor);
          const { scopeId } = c.req.valid("param");
          const scope = db
            .select()
            .from(connectorScopes)
            .where(
              and(
                eq(connectorScopes.id, scopeId),
                eq(connectorScopes.workspaceId, actor.workspaceId),
              ),
            )
            .get();
          if (!scope) throw new NotFoundError("Connector scope");
          // Stops syncing; documents already imported stay in the project until removed there.
          db.delete(connectorScopes).where(eq(connectorScopes.id, scope.id)).run();
          audit.record({
            actor,
            projectId: scope.projectId,
            action: "connector.scope.remove",
            targetType: "connector_scope",
            targetId: scope.id,
            metadata: { name: scope.name, items: scope.itemCount },
          });
          return c.body(null, 204);
        },
      )
      .post(
        "/admin/connector-requests",
        zValidator("json", ConnectorRequestInputSchema, validationHook),
        (c) => {
          const actor = c.get("actor");
          admin(actor);
          const input = c.req.valid("json");
          const request = store.create(
            actor,
            "connector_request",
            { tool: input.tool, notes: input.notes },
            { status: "open" },
          );
          audit.record({
            actor,
            action: "connector.request",
            targetType: "connector_request",
            targetId: request.id,
            metadata: { tool: input.tool },
          });
          return c.json({ id: request.id }, 201);
        },
      )
  );
}
