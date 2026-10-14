import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ConnectorScopesInputSchema, DisconnectModeSchema } from "@contextos/shared";
import { and, eq, inArray } from "drizzle-orm";
import { google } from "googleapis";
import type { z } from "zod";
import type { Container } from "../../container.js";
import {
  connectorConnections,
  connectorScopes,
  identityLinks,
  memberships,
  oauthStates,
  projects,
  sourceAccess,
  sourceObjects,
  users,
  type ConnectorScopeRow,
  type JobRow,
} from "../../db/schema.js";
import { openCredentials, sealCredentials } from "../../lib/credentials.js";
import {
  AppError,
  BadRequestError,
  NotFoundError,
  UpstreamServiceError,
} from "../../lib/errors.js";
import { parseDocument } from "../../lib/documents.js";
import type { Actor } from "../../types.js";
import { requireRole } from "../identity/identity.service.js";
import { createNotifier } from "../platform/notify.js";
import { createPlatformStore } from "../platform/store.js";

const FILE_FIELDS =
  "id,name,mimeType,modifiedTime,createdTime,webViewLink,trashed,capabilities(canDownload),owners(displayName,emailAddress),driveId";
const DOC = "application/vnd.google-apps.document";
const SHEET = "application/vnd.google-apps.spreadsheet";
const SLIDE = "application/vnd.google-apps.presentation";
const FOLDER = "application/vnd.google-apps.folder";
const ALLOWED = new Set([
  DOC,
  SHEET,
  SLIDE,
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
/** FR-INT-012: manual re-sync is rate-limited to once per 10 minutes per scope. */
const SYNC_COOLDOWN_MS = 10 * 60_000;
/** Bounded backfill per run; deeper folders are walked on subsequent runs. */
const MAX_FILES_PER_RUN = 200;
const MAX_FOLDER_DEPTH = 3;
type Connection = typeof connectorConnections.$inferSelect;
type ScopesInput = z.infer<typeof ConnectorScopesInputSchema>;
type DisconnectMode = z.infer<typeof DisconnectModeSchema>;

export function createGoogleDriveService(container: Container) {
  const { db, env, identity, services, repos, audit, queue } = container;
  const store = createPlatformStore(db);
  const notifier = createNotifier(db);
  const client = () => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.CONNECTOR_TOKEN_ENCRYPTION_KEY)
      throw new AppError(
        503,
        "NOT_CONFIGURED",
        "Google OAuth and token encryption must be configured",
      );
    return new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI,
    );
  };
  const getConnection = (actor: Actor, id: string, requireConnected = true) => {
    const row = db
      .select()
      .from(connectorConnections)
      .where(
        and(
          eq(connectorConnections.id, id),
          eq(connectorConnections.workspaceId, actor.workspaceId),
          eq(connectorConnections.userId, actor.id),
          eq(connectorConnections.provider, "google_drive"),
        ),
      )
      .get();
    if (!row) throw new NotFoundError("Google connection");
    if (requireConnected && row.status !== "connected")
      throw new AppError(409, "CONFLICT", "Reconnect this Google account");
    return row;
  };
  const authorizedClient = (connection: Connection) => {
    const auth = client();
    auth.setCredentials(
      openCredentials(
        connection.credentials,
        env.CONNECTOR_TOKEN_ENCRYPTION_KEY,
        `${connection.workspaceId}:${connection.id}`,
      ),
    );
    auth.on("tokens", (tokens) => {
      const existing = openCredentials(
        connection.credentials,
        env.CONNECTOR_TOKEN_ENCRYPTION_KEY,
        `${connection.workspaceId}:${connection.id}`,
      );
      const merged = {
        ...existing,
        ...tokens,
        refresh_token: tokens.refresh_token ?? existing.refresh_token,
      };
      const credentials = sealCredentials(
        merged,
        env.CONNECTOR_TOKEN_ENCRYPTION_KEY,
        `${connection.workspaceId}:${connection.id}`,
      );
      db.update(connectorConnections)
        .set({ credentials })
        .where(eq(connectorConnections.id, connection.id))
        .run();
      connection.credentials = credentials;
    });
    return auth;
  };
  const scopesFor = (connectionId: string) =>
    db.select().from(connectorScopes).where(eq(connectorScopes.connectionId, connectionId)).all();
  const scopeView = (row: ConnectorScopeRow) => ({
    id: row.id,
    projectId: row.projectId,
    scopeType: row.scopeType,
    externalId: row.externalId,
    name: row.name,
    excluded: row.isExcluded,
    backfillFrom: row.backfillFrom?.toISOString() ?? null,
    visibility: row.visibility,
    status: row.status,
    lastSyncRequestedAt: row.lastSyncRequestedAt?.toISOString() ?? null,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    itemCount: row.itemCount,
    lastError: row.lastError,
  });
  const safeConnection = (connection: Connection) => {
    const scopes = scopesFor(connection.id);
    const synced = scopes.map((row) => row.lastSyncedAt?.getTime() ?? 0);
    return {
      id: connection.id,
      provider: connection.provider,
      status: connection.status,
      accountId: connection.accountId,
      scopes: connection.scopes,
      createdAt: connection.createdAt,
      selectedScopes: scopes.map(scopeView),
      health: {
        lastSuccessfulSyncAt:
          synced.length && Math.max(...synced) > 0
            ? new Date(Math.max(...synced)).toISOString()
            : null,
        itemsProcessed: scopes.reduce((sum, row) => sum + row.itemCount, 0),
        errors: scopes
          .filter((row) => row.lastError)
          .map((row) => ({ scopeId: row.id, error: row.lastError })),
        tokenStatus: connection.status,
      },
    };
  };
  const markReauth = (connection: Connection) => {
    db.update(connectorConnections)
      .set({ status: "needs_reauth" })
      .where(eq(connectorConnections.id, connection.id))
      .run();
    db.update(connectorScopes)
      .set({ status: "needs_reauth" })
      .where(eq(connectorScopes.connectionId, connection.id))
      .run();
    const imported = db
      .select({ id: sourceObjects.id })
      .from(sourceObjects)
      .where(eq(sourceObjects.connectionId, connection.id))
      .all();
    if (imported.length)
      db.delete(sourceAccess)
        .where(
          inArray(
            sourceAccess.sourceId,
            imported.map((row) => row.id),
          ),
        )
        .run();
    // FR-INT-011: admins are told when a connector needs re-authorisation.
    notifier.notifyAdmins(connection.workspaceId, {
      type: "connector.needs_reauth",
      category: "system",
      title: "A Google Drive connection needs re-authorisation",
      link: "/admin/integrations",
      batchKey: `connector:${connection.id}`,
      data: { connectionId: connection.id },
    });
    store.emit(connection.workspaceId, "connector.token.degraded", {
      connectorId: connection.id,
      provider: "google_drive",
      reason: "unauthorized",
    });
  };
  const actorForConnection = (connection: Connection): Actor => {
    const member = db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, connection.workspaceId),
          eq(memberships.userId, connection.userId),
        ),
      )
      .get();
    const user = db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, connection.userId))
      .get();
    return {
      id: connection.userId,
      name: user?.name ?? "Connector user",
      workspaceId: connection.workspaceId,
      role: member?.role ?? "member",
    };
  };

  const service = {
    list(actor: Actor) {
      return db
        .select()
        .from(connectorConnections)
        .where(
          and(
            eq(connectorConnections.workspaceId, actor.workspaceId),
            eq(connectorConnections.userId, actor.id),
          ),
        )
        .all()
        .map(safeConnection);
    },
    authorize(actor: Actor) {
      const auth = client();
      const state = randomBytes(32).toString("base64url");
      db.insert(oauthStates)
        .values({
          id: createHash("sha256").update(state).digest("hex"),
          workspaceId: actor.workspaceId,
          userId: actor.id,
          expiresAt: new Date(Date.now() + 600000),
        })
        .run();
      return {
        authorizationUrl: auth.generateAuthUrl({
          access_type: "offline",
          prompt: "consent",
          scope: ["openid", "email", "https://www.googleapis.com/auth/drive.readonly"],
          state,
          include_granted_scopes: true,
        }),
      };
    },
    async callback(state: string, code: string) {
      const stored = db
        .delete(oauthStates)
        .where(eq(oauthStates.id, createHash("sha256").update(state).digest("hex")))
        .returning()
        .get();
      if (!stored || stored.expiresAt <= new Date())
        throw new BadRequestError("OAuth state is invalid or expired");
      const auth = client();
      const { tokens } = await auth.getToken(code);
      if (
        !tokens.id_token ||
        !tokens.refresh_token ||
        !tokens.scope?.split(" ").includes("https://www.googleapis.com/auth/drive.readonly")
      )
        throw new BadRequestError("Grant offline Drive read access to connect this account");
      const ticket = await auth.verifyIdToken({
        idToken: tokens.id_token,
        audience: env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      const subject = payload?.sub;
      if (!subject) throw new BadRequestError("Google identity could not be verified");
      identity.requireMember(stored.workspaceId, stored.userId);
      const id = randomUUID();
      const credentials = sealCredentials(
        tokens as Record<string, unknown>,
        env.CONNECTOR_TOKEN_ENCRYPTION_KEY,
        `${stored.workspaceId}:${id}`,
      );
      const scopes = tokens.scope.split(" ");
      return db.transaction(() => {
        const connection = db
          .insert(connectorConnections)
          .values({
            id,
            workspaceId: stored.workspaceId,
            userId: stored.userId,
            provider: "google_drive",
            accountId: subject,
            scopes,
            credentials,
          })
          .returning()
          .get();
        // OAuth-verified Google identity link (PRD §6.6).
        db.insert(identityLinks)
          .values({
            id: randomUUID(),
            workspaceId: stored.workspaceId,
            userId: stored.userId,
            provider: "google",
            externalId: subject,
            email: payload?.email ?? null,
            status: "confirmed",
            source: "oauth",
            linkedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [identityLinks.workspaceId, identityLinks.userId, identityLinks.provider],
            set: {
              externalId: subject,
              email: payload?.email ?? null,
              status: "confirmed",
              source: "oauth",
              linkedAt: new Date(),
            },
          })
          .run();
        const actor: Actor = {
          id: stored.userId,
          workspaceId: stored.workspaceId,
          name: "Google connector user",
          role: "member",
        };
        audit.record({ actor, action: "connector.connect", targetType: "connector", targetId: id });
        return safeConnection(connection);
      });
    },
    async files(actor: Actor, connectionId: string, pageToken?: string, folderId?: string) {
      const connection = getConnection(actor, connectionId);
      if (folderId && !/^[a-zA-Z0-9_-]{1,200}$/.test(folderId))
        throw new BadRequestError("Invalid folder ID");
      const response = await google
        .drive({ version: "v3", auth: authorizedClient(connection) })
        .files.list({
          pageSize: 50,
          pageToken,
          q: folderId ? `'${folderId}' in parents and trashed = false` : "trashed = false",
          fields: `nextPageToken,files(${FILE_FIELDS})`,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });
      return {
        items: response.data.files ?? [],
        nextPageToken: response.data.nextPageToken ?? null,
      };
    },
    /** Selectable scopes: all of My Drive, shared drives and top-level folders, with current selections. */
    async listScopes(actor: Actor, connectionId: string, pageToken?: string) {
      const connection = getConnection(actor, connectionId);
      const drive = google.drive({ version: "v3", auth: authorizedClient(connection) });
      const [drives, folders] = await Promise.all([
        drive.drives
          .list({ pageSize: 50, fields: "drives(id,name)" })
          .catch(() => ({ data: { drives: [] } })),
        drive.files.list({
          pageSize: 100,
          pageToken,
          q: `mimeType = '${FOLDER}' and 'root' in parents and trashed = false`,
          fields: "nextPageToken,files(id,name)",
          supportsAllDrives: true,
          includeItemsFromAllDrives: false,
        }),
      ]);
      const selections = scopesFor(connection.id);
      const describe = (
        scopeType: "shared_drive" | "folder",
        externalId: string,
        name: string,
      ) => ({
        scopeType,
        externalId,
        name,
        selections: selections.filter((row) => row.externalId === externalId).map(scopeView),
      });
      return {
        items: [
          // Drive's `root` alias: documents kept loose in My Drive have no folder to pick otherwise.
          describe("folder", "root", "My Drive"),
          ...(drives.data.drives ?? [])
            .filter((d) => d.id && d.name)
            .map((d) => describe("shared_drive", d.id!, d.name!)),
          ...(folders.data.files ?? [])
            .filter((f) => f.id && f.name)
            .map((f) => describe("folder", f.id!, f.name!)),
        ],
        nextPageToken: folders.data.nextPageToken ?? null,
      };
    },
    /** Replace the selected scopes for a project (FR-INT-005/013). Owner/admin only. */
    setScopes(actor: Actor, connectionId: string, input: ScopesInput) {
      requireRole(actor, "owner", "admin");
      const connection = getConnection(actor, connectionId, false);
      identity.requireProject(actor, input.projectId);
      const rows = db.transaction(() => {
        const existing = scopesFor(connection.id).filter(
          (row) => row.projectId === input.projectId,
        );
        const keep = new Set(input.scopes.map((scope) => scope.externalId));
        for (const row of existing)
          if (!keep.has(row.externalId))
            db.delete(connectorScopes).where(eq(connectorScopes.id, row.id)).run();
        for (const scope of input.scopes) {
          const current = existing.find((row) => row.externalId === scope.externalId);
          if (current) {
            db.update(connectorScopes)
              .set({
                name: scope.name,
                scopeType: scope.scopeType,
                isExcluded: scope.excluded,
                backfillFrom: scope.backfillFrom ? new Date(scope.backfillFrom) : null,
                visibility: scope.visibility,
              })
              .where(eq(connectorScopes.id, current.id))
              .run();
            // A changed visibility applies to what the scope already imported, without a re-sync.
            if (current.visibility !== scope.visibility)
              for (const source of db
                .select({ id: sourceObjects.id, metadata: sourceObjects.metadata })
                .from(sourceObjects)
                .where(
                  and(
                    eq(sourceObjects.projectId, input.projectId),
                    eq(sourceObjects.connectionId, connection.id),
                  ),
                )
                .all())
                if (source.metadata?.scopeId === current.id)
                  db.update(sourceObjects)
                    .set({ visibility: scope.visibility })
                    .where(eq(sourceObjects.id, source.id))
                    .run();
          } else
            db.insert(connectorScopes)
              .values({
                id: randomUUID(),
                workspaceId: actor.workspaceId,
                connectionId: connection.id,
                projectId: input.projectId,
                scopeType: scope.scopeType,
                externalId: scope.externalId,
                name: scope.name,
                isExcluded: scope.excluded,
                backfillFrom: scope.backfillFrom ? new Date(scope.backfillFrom) : null,
                visibility: scope.visibility,
              })
              .run();
        }
        audit.record({
          actor,
          projectId: input.projectId,
          action: "connector.scopes",
          targetType: "connector",
          targetId: connection.id,
          metadata: { scopes: input.scopes.length },
        });
        return scopesFor(connection.id).filter((row) => row.projectId === input.projectId);
      });
      return { items: rows.map(scopeView) };
    },
    /** Queue a sync for one scope or all selected scopes; cooldown of 10 minutes per scope. */
    requestSync(actor: Actor, connectionId: string, scopeId?: string) {
      requireRole(actor, "owner", "admin", "manager");
      const connection = getConnection(actor, connectionId);
      const scopes = scopesFor(connection.id).filter(
        (row) => !row.isExcluded && (!scopeId || row.id === scopeId),
      );
      if (scopeId && !scopes.length) throw new NotFoundError("Connector scope");
      if (!scopes.length)
        throw new AppError(409, "CONFLICT", "Select at least one scope before syncing");
      const now = new Date();
      let queued = 0;
      for (const scope of scopes) {
        const recent =
          scope.lastSyncRequestedAt &&
          now.getTime() - scope.lastSyncRequestedAt.getTime() < SYNC_COOLDOWN_MS;
        if (recent) {
          if (scopeId)
            throw new AppError(
              429,
              "RATE_LIMITED",
              "This scope was synced less than 10 minutes ago",
            );
          continue;
        }
        db.update(connectorScopes)
          .set({
            lastSyncRequestedAt: now,
            status: scope.lastSyncedAt ? scope.status : "backfilling",
          })
          .where(eq(connectorScopes.id, scope.id))
          .run();
        queue.enqueue({
          projectId: scope.projectId,
          type: "sync_connector",
          payload: { connectionId: connection.id, scopeId: scope.id },
          subject: scope.name,
          dedupe: true,
        });
        queued += 1;
      }
      audit.record({
        actor,
        action: "connector.sync",
        targetType: "connector",
        targetId: connection.id,
        metadata: { queued, scopeId: scopeId ?? null },
      });
      return { queued, items: scopesFor(connection.id).map(scopeView) };
    },
    /** Job handler: walk a selected folder/shared drive, import supported files, tombstone removed ones. */
    async syncScope(job: JobRow) {
      const scope = db
        .select()
        .from(connectorScopes)
        .where(eq(connectorScopes.id, String(job.payload.scopeId)))
        .get();
      if (!scope) return;
      const connection = db
        .select()
        .from(connectorConnections)
        .where(eq(connectorConnections.id, scope.connectionId))
        .get();
      if (connection?.status !== "connected") {
        db.update(connectorScopes)
          .set({ status: "needs_reauth", lastError: "Connection is not authorised" })
          .where(eq(connectorScopes.id, scope.id))
          .run();
        return;
      }
      const actor = actorForConnection(connection);
      const drive = google.drive({ version: "v3", auth: authorizedClient(connection) });
      const seen = new Set<string>();
      let imported = 0;
      let failures = 0;
      try {
        const walk = async (parentId: string, depth: number) => {
          let pageToken: string | undefined;
          do {
            if (seen.size >= MAX_FILES_PER_RUN) return;
            const response = await drive.files.list({
              pageSize: 100,
              pageToken,
              q: `'${parentId}' in parents and trashed = false`,
              fields: `nextPageToken,files(${FILE_FIELDS})`,
              supportsAllDrives: true,
              includeItemsFromAllDrives: true,
              ...(scope.scopeType === "shared_drive"
                ? { corpora: "drive", driveId: scope.externalId }
                : {}),
            });
            for (const file of response.data.files ?? []) {
              if (!file.id || !file.mimeType) continue;
              if (file.mimeType === FOLDER) {
                if (depth < MAX_FOLDER_DEPTH) await walk(file.id, depth + 1);
                continue;
              }
              if (!ALLOWED.has(file.mimeType) || file.mimeType === SHEET || file.mimeType === SLIDE)
                continue;
              if (
                scope.backfillFrom &&
                file.modifiedTime &&
                new Date(file.modifiedTime) < scope.backfillFrom
              )
                continue;
              seen.add(file.id);
              try {
                await service.importFile(
                  actor,
                  connection.id,
                  scope.projectId,
                  file.id,
                  scope.id,
                  scope.visibility,
                );
                imported += 1;
              } catch (error) {
                failures += 1;
                const status = (error as { response?: { status?: number } }).response?.status;
                if (status === 401) throw error;
              }
              if (seen.size >= MAX_FILES_PER_RUN) return;
            }
            pageToken = response.data.nextPageToken ?? undefined;
          } while (pageToken);
        };
        await walk(scope.externalId, 0);
        // FR-INT-010: objects that disappeared from the scope are tombstoned and their claims re-evaluated.
        const project = repos.projects.findByIdUnscoped(scope.projectId);
        if (project && seen.size < MAX_FILES_PER_RUN) {
          const stale = db
            .select()
            .from(sourceObjects)
            .where(
              and(
                eq(sourceObjects.projectId, scope.projectId),
                eq(sourceObjects.connectionId, connection.id),
              ),
            )
            .all()
            .filter(
              (source) =>
                source.metadata?.scopeId === scope.id &&
                source.externalId &&
                !seen.has(source.externalId),
            );
          for (const source of stale) {
            store.insert({
              workspaceId: connection.workspaceId,
              ownerId: "system",
              kind: "tombstone",
              projectId: scope.projectId,
              status: "tombstoned",
              data: {
                sourceId: source.id,
                externalId: source.externalId,
                title: source.title,
                scopeId: scope.id,
              },
            });
            services.sources.remove(actor, project, source.id);
          }
        }
        db.update(connectorScopes)
          .set({
            status: "live",
            lastSyncedAt: new Date(),
            itemCount: seen.size,
            lastError: failures ? `${failures} files could not be imported` : null,
            cursor: { lastRunAt: new Date().toISOString(), filesSeen: seen.size, imported },
          })
          .where(eq(connectorScopes.id, scope.id))
          .run();
      } catch (error) {
        const status = (error as { response?: { status?: number } }).response?.status;
        if (status === 401) {
          markReauth(connection);
          return;
        }
        db.update(connectorScopes)
          .set({
            status: "degraded",
            lastError: error instanceof Error ? error.message : "Sync failed",
          })
          .where(eq(connectorScopes.id, scope.id))
          .run();
        throw error;
      }
    },
    async importFile(
      actor: Actor,
      connectionId: string,
      projectId: string,
      fileId: string,
      scopeId?: string,
      visibility: "workspace" | "restricted" = "restricted",
    ) {
      const connection = getConnection(actor, connectionId);
      const project = identity.requireProject(actor, projectId);
      const drive = google.drive({ version: "v3", auth: authorizedClient(connection) });
      const info = (await drive.files.get({ fileId, fields: FILE_FIELDS, supportsAllDrives: true }))
        .data;
      if (
        !info.id ||
        !info.name ||
        !info.mimeType ||
        !ALLOWED.has(info.mimeType) ||
        info.trashed ||
        info.capabilities?.canDownload === false
      )
        throw new BadRequestError("This file type or download permission is not supported");
      if (info.mimeType === SHEET || info.mimeType === SLIDE)
        throw new BadRequestError(
          "Sheets and Slides need a structure-preserving parser; they are not enabled yet",
        );
      const fileName = info.name;
      const response =
        info.mimeType === DOC
          ? await drive.files.export({ fileId, mimeType: "text/plain" }, { responseType: "stream" })
          : await drive.files.get(
              { fileId, alt: "media", supportsAllDrives: true },
              { responseType: "stream" },
            );
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of response.data) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        size += buffer.length;
        if (size > env.MAX_DOCUMENT_BYTES) {
          response.data.destroy();
          throw new BadRequestError("Document exceeds the configured size limit");
        }
        chunks.push(buffer);
      }
      const content = await parseDocument(Buffer.concat(chunks), info.mimeType);
      if (!content.trim() || content.length > 200000)
        throw new BadRequestError("No readable text, or the document exceeds the text limit");
      return db.transaction(() => {
        const existing = db
          .select()
          .from(sourceObjects)
          .where(
            and(
              eq(sourceObjects.projectId, projectId),
              eq(sourceObjects.connectionId, connection.id),
              eq(sourceObjects.externalId, fileId),
            ),
          )
          .get();
        const hash = createHash("sha256").update(content).digest("hex");
        let sourceId: string;
        const metadata = {
          mimeType: info.mimeType,
          driveId: info.driveId ?? null,
          scopeId: scopeId ?? null,
        };
        if (existing) {
          sourceId = existing.id;
          if (existing.visibility !== visibility)
            db.update(sourceObjects)
              .set({ visibility })
              .where(eq(sourceObjects.id, existing.id))
              .run();
          if (existing.contentHash !== hash) {
            db.update(sourceObjects)
              .set({
                content,
                contentHash: hash,
                title: fileName,
                status: "pending",
                sourceUpdatedAt: info.modifiedTime ? new Date(info.modifiedTime) : null,
                metadata: {
                  ...(existing.metadata ?? {}),
                  ...metadata,
                  scopeId: scopeId ?? existing.metadata?.scopeId ?? null,
                },
              })
              .where(eq(sourceObjects.id, existing.id))
              .run();
            queue.enqueue({
              projectId,
              type: "process_source",
              payload: { sourceObjectId: existing.id },
              subject: fileName,
            });
          } else if (scopeId && existing.metadata?.scopeId !== scopeId)
            db.update(sourceObjects)
              .set({ metadata: { ...(existing.metadata ?? {}), scopeId } })
              .where(eq(sourceObjects.id, existing.id))
              .run();
        } else {
          const source = services.sources.create(actor, project, {
            kind: "document",
            title: fileName,
            content,
            url: info.webViewLink ?? undefined,
            author: info.owners?.[0]?.displayName ?? undefined,
            sourceCreatedAt: info.createdTime ?? undefined,
            sourceUpdatedAt: info.modifiedTime ?? undefined,
            visibility,
          });
          sourceId = source.id;
          db.update(sourceObjects)
            .set({
              connector: "google_drive",
              externalId: fileId,
              connectionId: connection.id,
              metadata,
            })
            .where(eq(sourceObjects.id, source.id))
            .run();
        }
        db.insert(sourceAccess)
          .values({ sourceId, userId: actor.id, expiresAt: new Date(Date.now() + 60000) })
          .onConflictDoUpdate({
            target: [sourceAccess.sourceId, sourceAccess.userId],
            set: { expiresAt: new Date(Date.now() + 60000) },
          })
          .run();
        audit.record({
          actor,
          projectId,
          action: "connector.import",
          targetType: "source",
          targetId: sourceId,
        });
        return services.sources.get(project, sourceId);
      });
    },
    async refreshAccess(actor: Actor) {
      const projectIds = db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.workspaceId, actor.workspaceId))
        .all()
        .map((row) => row.id);
      if (!projectIds.length) return;
      const imported = db
        .select()
        .from(sourceObjects)
        .where(
          and(
            inArray(sourceObjects.projectId, projectIds),
            eq(sourceObjects.connector, "google_drive"),
          ),
        )
        .all();
      if (!imported.length) return;
      // Clear old grants first: provider errors must fail closed, even during revocation.
      db.delete(sourceAccess)
        .where(
          and(
            eq(sourceAccess.userId, actor.id),
            inArray(
              sourceAccess.sourceId,
              imported.map((row) => row.id),
            ),
          ),
        )
        .run();
      const connections = db
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
        .all();
      for (const source of imported) {
        // Sources kept after a disconnect have no provider to verify against: they stay hidden.
        if (!source.connectionId || !source.externalId) continue;
        for (const connection of connections) {
          try {
            const info = (
              await google.drive({ version: "v3", auth: authorizedClient(connection) }).files.get({
                fileId: source.externalId,
                fields: "id,trashed,capabilities(canDownload)",
                supportsAllDrives: true,
              })
            ).data;
            if (!info.id || info.trashed || info.capabilities?.canDownload === false) continue;
            db.insert(sourceAccess)
              .values({
                sourceId: source.id,
                userId: actor.id,
                expiresAt: new Date(Date.now() + 60000),
              })
              .onConflictDoNothing()
              .run();
            break;
          } catch (error) {
            const status = (error as { response?: { status?: number } }).response?.status;
            if (status === 401) markReauth(connection);
            // 403/404, quota errors and network errors all leave the source hidden.
          }
        }
      }
    },
    /** Disconnect with `purge` (hard delete) or `keep_derived` (claims stay, no updates; §8.12). */
    async disconnect(actor: Actor, id: string, mode: DisconnectMode = "purge") {
      const connection = getConnection(actor, id, false);
      const token = connection.credentials
        ? openCredentials(
            connection.credentials,
            env.CONNECTOR_TOKEN_ENCRYPTION_KEY,
            `${connection.workspaceId}:${id}`,
          ).refresh_token
        : undefined;
      try {
        if (typeof token === "string") await client().revokeToken(token);
      } catch (error) {
        const response = (error as { response?: { status?: number; data?: { error?: string } } })
          .response;
        if (response?.status !== 400 || response.data?.error !== "invalid_token")
          throw new UpstreamServiceError("Google token revocation failed; retry disconnect");
      }
      db.transaction(() => {
        const imported = db
          .select()
          .from(sourceObjects)
          .where(eq(sourceObjects.connectionId, id))
          .all();
        if (mode === "purge")
          for (const source of imported) {
            const project = identity.requireProject(actor, source.projectId);
            services.sources.remove(actor, project, source.id);
          }
        else
          for (const source of imported)
            db.update(sourceObjects)
              .set({
                connectionId: null,
                metadata: { ...(source.metadata ?? {}), disconnectedAt: new Date().toISOString() },
              })
              .where(eq(sourceObjects.id, source.id))
              .run();
        db.delete(connectorConnections).where(eq(connectorConnections.id, id)).run();
        audit.record({
          actor,
          action: "connector.disconnect",
          targetType: "connector",
          targetId: id,
          metadata: { mode, sources: imported.length },
        });
      });
    },
    repos,
  };
  return service;
}
