import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { google } from "googleapis";
import type { Container } from "../../container.js";
import {
  connectorConnections,
  oauthStates,
  projects,
  sourceAccess,
  sourceObjects,
} from "../../db/schema.js";
import { openCredentials, sealCredentials } from "../../lib/credentials.js";
import {
  AppError,
  BadRequestError,
  NotFoundError,
  UpstreamServiceError,
} from "../../lib/errors.js";
import type { Actor } from "../../types.js";
import { parseDocument } from "../../lib/documents.js";

const FILE_FIELDS =
  "id,name,mimeType,modifiedTime,createdTime,webViewLink,trashed,capabilities(canDownload),owners(displayName,emailAddress),driveId";
const DOC = "application/vnd.google-apps.document";
const SHEET = "application/vnd.google-apps.spreadsheet";
const SLIDE = "application/vnd.google-apps.presentation";
const ALLOWED = new Set([
  DOC,
  SHEET,
  SLIDE,
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
type Connection = typeof connectorConnections.$inferSelect;

export function createGoogleDriveService(container: Container) {
  const { db, env, identity, services, repos, audit, queue } = container;
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
  const safeConnection = (connection: Connection) => ({
    id: connection.id,
    provider: connection.provider,
    status: connection.status,
    accountId: connection.accountId,
    scopes: connection.scopes,
    createdAt: connection.createdAt,
  });
  const markReauth = (connection: Connection) => {
    db.update(connectorConnections)
      .set({ status: "needs_reauth" })
      .where(eq(connectorConnections.id, connection.id))
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
  };
  return {
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
      const subject = ticket.getPayload()?.sub;
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
    async importFile(actor: Actor, connectionId: string, projectId: string, fileId: string) {
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
        if (existing) {
          sourceId = existing.id;
          if (existing.contentHash !== hash) {
            db.update(sourceObjects)
              .set({
                content,
                contentHash: hash,
                title: fileName,
                status: "pending",
                sourceUpdatedAt: info.modifiedTime ? new Date(info.modifiedTime) : null,
              })
              .where(eq(sourceObjects.id, existing.id))
              .run();
            queue.enqueue({
              projectId,
              type: "process_source",
              payload: { sourceObjectId: existing.id },
              subject: fileName,
            });
          }
        } else {
          const source = services.sources.create(actor, project, {
            kind: "document",
            title: fileName,
            content,
            url: info.webViewLink ?? undefined,
            author: info.owners?.[0]?.displayName ?? undefined,
            sourceCreatedAt: info.createdTime ?? undefined,
            sourceUpdatedAt: info.modifiedTime ?? undefined,
            visibility: "restricted",
          });
          sourceId = source.id;
          db.update(sourceObjects)
            .set({
              connector: "google_drive",
              externalId: fileId,
              connectionId: connection.id,
              metadata: { mimeType: info.mimeType, driveId: info.driveId ?? null },
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
        for (const connection of connections) {
          try {
            const info = (
              await google.drive({ version: "v3", auth: authorizedClient(connection) }).files.get({
                fileId: source.externalId!,
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
    async disconnect(actor: Actor, id: string) {
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
        for (const source of imported) {
          const project = identity.requireProject(actor, source.projectId);
          services.sources.remove(actor, project, source.id);
        }
        db.delete(connectorConnections).where(eq(connectorConnections.id, id)).run();
        audit.record({
          actor,
          action: "connector.disconnect",
          targetType: "connector",
          targetId: id,
        });
      });
    },
    repos,
  };
}
