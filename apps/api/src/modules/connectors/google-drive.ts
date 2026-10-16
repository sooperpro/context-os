import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ConnectorScopesInputSchema, DisconnectModeSchema } from "@contextos/shared";
import { and, eq, inArray } from "drizzle-orm";
import { google, type drive_v3 } from "googleapis";
import type { z } from "zod";
import type { Container } from "../../container.js";
import {
  connectorConnections,
  connectorScopes,
  identityLinks,
  memberships,
  oauthStates,
  sourceAccess,
  sourceObjects,
  users,
  type ConnectorScopeRow,
  type JobRow,
  type ProjectRow,
  type SourceObjectRow,
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
import { JOB_PRIORITY } from "../jobs/jobs.queue.js";
import { createNotifier } from "../platform/notify.js";
import { createPlatformStore } from "../platform/store.js";

const FILE_FIELDS =
  "id,name,mimeType,modifiedTime,createdTime,webViewLink,trashed,size,capabilities(canDownload),owners(displayName,emailAddress),driveId,permissions(type,emailAddress,domain,deleted)";
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
/** Folder nesting a sync follows (Drive allows deep trees; this only stops pathological ones). */
const MAX_FOLDER_DEPTH = 25;
/** What one listing call returns per file: enough to diff, import and decide who may read it. */
const LIST_FIELDS =
  "nextPageToken,files(id,name,mimeType,modifiedTime,createdTime,webViewLink,size,capabilities(canDownload),owners(displayName),driveId,permissions(type,emailAddress,domain,deleted))";
const SHORTCUT = "application/vnd.google-apps.shortcut";
/** Grants outlive a missed refresh or two (refreshes run every 6 hours), then fail closed. */
const ACCESS_TTL_MS = 30 * 3_600_000;
type Connection = typeof connectorConnections.$inferSelect;
type ScopesInput = z.infer<typeof ConnectorScopesInputSchema>;
type DisconnectMode = z.infer<typeof DisconnectModeSchema>;

/** Who a Drive file is shared with; null when the connected account can't see its sharing. */
export interface Sharing {
  emails: string[];
  domains: string[];
  anyone: boolean;
}
/** A file as a scope listing saw it (stored on its import job). */
export interface ListedFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  createdTime: string | null;
  webViewLink: string | null;
  /** Bytes for uploaded files; null for Google Docs, which are exported. */
  size: number | null;
  owner: string | null;
  driveId: string | null;
  sharing: Sharing | null;
}
interface ScopeListing {
  files: Map<string, ListedFile>;
  skipped: { sheetsAndSlides: number; otherTypes: number };
  /** False when the listing stopped at the per-scope limit. */
  complete: boolean;
}
type RejectionReason = "too_large" | "no_text" | "no_access" | "unreadable";
interface Rejection {
  modifiedTime: string | null;
  reason: RejectionReason;
}
/** What the last sync of a scope did, kept on `connector_scopes.cursor`. */
export interface ScopeCursor {
  lastRunAt?: string;
  filesSeen?: number;
  /** New or changed files this sync picked up (each imported by its own job). */
  imported?: number;
  retried?: number;
  removed?: number;
  skipped?: ScopeListing["skipped"];
  /** Files whose current version can't be imported, so the next sync doesn't download them again. */
  rejected?: Record<string, Rejection>;
  /** When `refresh_access` last worked out who may read the scope. */
  accessSyncedAt?: string;
}

type DriveFileInfo = {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  modifiedTime?: string | null;
  createdTime?: string | null;
  webViewLink?: string | null;
  size?: string | null;
  owners?: Array<{ displayName?: string | null }> | null;
  driveId?: string | null;
  permissions?: DrivePermission[] | null;
};
type DrivePermission = {
  type?: string | null;
  emailAddress?: string | null;
  domain?: string | null;
  deleted?: boolean | null;
};

export const toSharing = (permissions: DrivePermission[]): Sharing => {
  const live = permissions.filter((permission) => !permission.deleted);
  return {
    emails: live.flatMap((permission) =>
      (permission.type === "user" || permission.type === "group") && permission.emailAddress
        ? [permission.emailAddress.toLowerCase()]
        : [],
    ),
    domains: live.flatMap((permission) =>
      permission.type === "domain" && permission.domain ? [permission.domain.toLowerCase()] : [],
    ),
    anyone: live.some((permission) => permission.type === "anyone"),
  };
};
const mergeSharing = (file: Sharing | null | undefined, drive: Sharing | null) =>
  !drive
    ? (file ?? null)
    : {
        emails: [...new Set([...(file?.emails ?? []), ...drive.emails])],
        domains: [...new Set([...(file?.domains ?? []), ...drive.domains])],
        anyone: Boolean(file?.anyone) || drive.anyone,
      };
const toListedFile = (file: DriveFileInfo): ListedFile => ({
  id: file.id!,
  name: file.name ?? "Untitled",
  mimeType: file.mimeType!,
  modifiedTime: file.modifiedTime ?? null,
  createdTime: file.createdTime ?? null,
  webViewLink: file.webViewLink ?? null,
  size: file.size ? Number(file.size) : null,
  owner: file.owners?.[0]?.displayName ?? null,
  driveId: file.driveId ?? null,
  // `permissions` is only returned for files the account can share.
  sharing: file.permissions ? toSharing(file.permissions) : null,
});
/** Same Drive version as what we stored: no download needed. */
const sameVersion = (source: SourceObjectRow, file: ListedFile) => {
  const stored =
    (source.metadata?.driveModifiedTime as string | undefined) ??
    source.sourceUpdatedAt?.toISOString();
  return Boolean(
    stored && file.modifiedTime && Date.parse(stored) === Date.parse(file.modifiedTime),
  );
};
const statusOf = (error: unknown) =>
  (error as { response?: { status?: number } } | null)?.response?.status;
const rejectionReason = (error: unknown): RejectionReason => {
  const status = statusOf(error);
  if (status === 403 || status === 404) return "no_access";
  const message = error instanceof Error ? error.message : "";
  if (/size limit/i.test(message)) return "too_large";
  if (/readable text/i.test(message)) return "no_text";
  return "unreadable";
};
const cursorOf = (scope: ConnectorScopeRow) => (scope.cursor ?? {}) as ScopeCursor;
/** A scope's schedule; anything retired (15m, hourly, daily) reads as every two days. */
export const syncFrequencyOf = (scope: ConnectorScopeRow): "2d" | "manual" =>
  scope.syncFrequency === "manual" ? "manual" : "2d";

/** The background jobs for one scope share a key, so a sync and an access refresh never overlap. */
export const scopeSyncJob = (scope: ConnectorScopeRow) => ({
  projectId: scope.projectId,
  type: "sync_connector" as const,
  payload: { connectionId: scope.connectionId, scopeId: scope.id },
  subject: scope.name,
  dedupe: true,
  priority: JOB_PRIORITY.sync,
  concurrencyKey: `scope:${scope.id}`,
});
export const accessJob = (scope: ConnectorScopeRow) => ({
  projectId: scope.projectId,
  type: "refresh_access" as const,
  payload: { scopeId: scope.id },
  subject: scope.name,
  dedupe: true,
  priority: JOB_PRIORITY.sync,
  concurrencyKey: `scope:${scope.id}`,
});

const REASON_LABEL: Record<RejectionReason, string> = {
  too_large: "too large",
  no_text: "without readable text",
  no_access: "not downloadable",
  unreadable: "unreadable",
};
/** What the last sync left out, for people: "8 Sheets or Slides skipped · 2 too large". */
export function scopeNote(cursor: ScopeCursor | null | undefined): string | null {
  if (!cursor) return null;
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const parts: string[] = [];
  if (cursor.skipped?.sheetsAndSlides)
    parts.push(
      `${plural(cursor.skipped.sheetsAndSlides, "Sheet or Slide", "Sheets or Slides")} skipped`,
    );
  if (cursor.skipped?.otherTypes)
    parts.push(`${plural(cursor.skipped.otherTypes, "file")} of other types skipped`);
  const reasons = new Map<RejectionReason, number>();
  for (const entry of Object.values(cursor.rejected ?? {}))
    reasons.set(entry.reason, (reasons.get(entry.reason) ?? 0) + 1);
  for (const [reason, count] of reasons)
    parts.push(`${plural(count, "file")} ${REASON_LABEL[reason]}`);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Every supported file in a scope, from paged metadata listings (1,000 files a page). Shared drives
 * and My Drive are listed flat; folders are walked breadth-first. Sheets, Slides and other types are
 * counted, not listed.
 */
async function listScopeFiles(
  drive: drive_v3.Drive,
  scope: ConnectorScopeRow,
  max: number,
  fields: string = LIST_FIELDS,
): Promise<ScopeListing> {
  const files = new Map<string, ListedFile>();
  const skipped = { sheetsAndSlides: 0, otherTypes: 0 };
  const folders: Array<{ id: string; depth: number }> = [];
  const take = (file: DriveFileInfo, depth: number) => {
    if (!file.id || !file.mimeType) return;
    if (file.mimeType === FOLDER) {
      if (depth < MAX_FOLDER_DEPTH) folders.push({ id: file.id, depth: depth + 1 });
      return;
    }
    if (file.mimeType === SHORTCUT) return;
    if (file.mimeType === SHEET || file.mimeType === SLIDE) {
      skipped.sheetsAndSlides += 1;
      return;
    }
    if (!ALLOWED.has(file.mimeType)) {
      skipped.otherTypes += 1;
      return;
    }
    if (scope.backfillFrom && file.modifiedTime && new Date(file.modifiedTime) < scope.backfillFrom)
      return;
    files.set(file.id, toListedFile(file));
  };
  const pages = async (q: string, extra: Record<string, string>, depth: number) => {
    let pageToken: string | undefined;
    do {
      if (files.size >= max) return;
      const response = await drive.files.list({
        pageSize: 1000,
        pageToken,
        q,
        fields,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        ...extra,
      });
      for (const file of response.data.files ?? []) {
        take(file, depth);
        if (files.size >= max) return;
      }
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);
  };
  if (scope.scopeType === "shared_drive")
    await pages(
      "trashed = false",
      { corpora: "drive", driveId: scope.externalId },
      MAX_FOLDER_DEPTH,
    );
  else if (scope.externalId === "root")
    // My Drive: everything the account owns, wherever it sits.
    await pages("'me' in owners and trashed = false", { corpora: "user" }, MAX_FOLDER_DEPTH);
  else {
    folders.push({ id: scope.externalId, depth: 0 });
    for (let next = folders.shift(); next && files.size < max; next = folders.shift())
      await pages(`'${next.id}' in parents and trashed = false`, {}, next.depth);
  }
  return { files, skipped, complete: files.size < max };
}

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
    frequency: syncFrequencyOf(row),
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

  const scopeRow = (id: string) =>
    db.select().from(connectorScopes).where(eq(connectorScopes.id, id)).get();
  const connectionRow = (id: string) =>
    db.select().from(connectorConnections).where(eq(connectorConnections.id, id)).get();

  /** Download and parse one file. Docs are exported as text; text past the limit is cut. */
  const download = async (drive: drive_v3.Drive, file: ListedFile) => {
    const response =
      file.mimeType === DOC
        ? await drive.files.export(
            { fileId: file.id, mimeType: "text/plain" },
            { responseType: "stream" },
          )
        : await drive.files.get(
            { fileId: file.id, alt: "media", supportsAllDrives: true },
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
    const text = (
      await parseDocument(Buffer.concat(chunks), file.mimeType, {
        timeoutMs: env.DOCUMENT_PARSE_TIMEOUT_MS,
        memoryMb: env.DOCUMENT_PARSE_MEMORY_MB,
      })
    ).trim();
    if (!text) throw new BadRequestError("No readable text in this document");
    const truncated = text.length > env.MAX_SOURCE_TEXT_CHARS;
    return { content: truncated ? text.slice(0, env.MAX_SOURCE_TEXT_CHARS) : text, truncated };
  };

  /**
   * Keep a downloaded file as a source (call inside a transaction). New and changed files are
   * queued for processing and audited; an unchanged one only has its details refreshed.
   */
  const storeFile = (
    actor: Actor,
    connection: Connection,
    project: ProjectRow,
    file: ListedFile,
    document: { content: string; truncated: boolean },
    options: { scopeId: string | null; visibility: "workspace" | "restricted"; priority: number },
  ) => {
    const { content, truncated } = document;
    const existing = db
      .select()
      .from(sourceObjects)
      .where(
        and(
          eq(sourceObjects.projectId, project.id),
          eq(sourceObjects.connectionId, connection.id),
          eq(sourceObjects.externalId, file.id),
        ),
      )
      .get();
    const hash = createHash("sha256").update(content).digest("hex");
    const metadata = {
      mimeType: file.mimeType,
      driveId: file.driveId,
      scopeId: options.scopeId ?? (existing?.metadata?.scopeId as string | undefined) ?? null,
      driveModifiedTime: file.modifiedTime,
      sharing: file.sharing,
      ...(truncated ? { truncated: true } : {}),
    };
    let sourceId: string;
    let changed = true;
    if (existing) {
      sourceId = existing.id;
      changed = existing.contentHash !== hash;
      db.update(sourceObjects)
        .set({
          visibility: options.visibility,
          metadata: { ...(existing.metadata ?? {}), ...metadata },
          ...(changed
            ? {
                content,
                contentHash: hash,
                title: file.name,
                status: "pending" as const,
                sourceUpdatedAt: file.modifiedTime ? new Date(file.modifiedTime) : null,
              }
            : {}),
        })
        .where(eq(sourceObjects.id, existing.id))
        .run();
      if (changed)
        queue.enqueue({
          projectId: project.id,
          type: "process_source",
          payload: { sourceObjectId: existing.id },
          subject: file.name,
          dedupe: true,
          priority: options.priority,
          concurrencyKey: `source:${existing.id}`,
        });
    } else {
      const source = services.sources.create(
        actor,
        project,
        {
          kind: "document",
          title: file.name,
          content,
          url: file.webViewLink ?? undefined,
          author: file.owner ?? undefined,
          sourceCreatedAt: file.createdTime ?? undefined,
          sourceUpdatedAt: file.modifiedTime ?? undefined,
          visibility: options.visibility,
        },
        { priority: options.priority },
      );
      sourceId = source.id;
      db.update(sourceObjects)
        .set({
          connector: "google_drive",
          externalId: file.id,
          connectionId: connection.id,
          metadata,
        })
        .where(eq(sourceObjects.id, source.id))
        .run();
    }
    // Readers from what we know now; `refresh_access` adds people whose own Drive lists it.
    const viewers = (existing?.metadata?.driveViewers as string[] | undefined) ?? [];
    grant(
      sourceId,
      readersOf(memberDirectory(connection.workspaceId), connection.userId, file.sharing, viewers),
      new Date(Date.now() + ACCESS_TTL_MS),
    );
    if (changed)
      audit.record({
        actor,
        projectId: project.id,
        action: "connector.import",
        targetType: "source",
        targetId: sourceId,
        metadata: existing ? { updated: true } : undefined,
      });
    return services.sources.get(project, sourceId);
  };

  /** Remember (or forget) that a file's current version can't be imported. */
  const setRejection = (scopeId: string, fileId: string, rejection: Rejection | null) =>
    db.transaction(() => {
      const scope = scopeRow(scopeId);
      if (!scope) return;
      const cursor = cursorOf(scope);
      if (!rejection && !cursor.rejected?.[fileId]) return;
      const rejected = { ...(cursor.rejected ?? {}) };
      if (rejection) rejected[fileId] = rejection;
      else delete rejected[fileId];
      db.update(connectorScopes)
        .set({ cursor: { ...cursor, rejected } })
        .where(eq(connectorScopes.id, scopeId))
        .run();
    });
  const markAccessSynced = (scopeId: string) => {
    const scope = scopeRow(scopeId);
    if (!scope) return;
    db.update(connectorScopes)
      .set({
        cursor: { ...cursorOf(scope), accessSyncedAt: new Date().toISOString() },
      })
      .where(eq(connectorScopes.id, scopeId))
      .run();
  };

  /** Active members by email (their sign-in email and the Google account they connected). */
  const memberDirectory = (workspaceId: string) => {
    const members = db
      .select({ userId: memberships.userId, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.status, "active")))
      .all();
    // Google accounts connected through OAuth (the email Google verified), in addition to sign-in
    // emails. A linked email never takes over an address another member signs in with, and one
    // claimed by two people counts for neither.
    const linked = db
      .select({ userId: identityLinks.userId, email: identityLinks.email })
      .from(identityLinks)
      .where(
        and(
          eq(identityLinks.workspaceId, workspaceId),
          eq(identityLinks.provider, "google"),
          eq(identityLinks.status, "confirmed"),
          eq(identityLinks.source, "oauth"),
        ),
      )
      .all();
    const active = new Set(members.map((row) => row.userId));
    const byEmail = new Map<string, string>();
    for (const row of members)
      if (row.email && active.has(row.userId)) byEmail.set(row.email.toLowerCase(), row.userId);
    const claims = new Map<string, Set<string>>();
    for (const row of linked)
      if (row.email && active.has(row.userId))
        claims.set(
          row.email.toLowerCase(),
          (claims.get(row.email.toLowerCase()) ?? new Set()).add(row.userId),
        );
    for (const [email, userIds] of claims)
      if (!byEmail.has(email) && userIds.size === 1) byEmail.set(email, [...userIds][0]!);
    return { byEmail, all: [...active] };
  };
  const readersOf = (
    directory: ReturnType<typeof memberDirectory>,
    ownerId: string,
    sharing: Sharing | null | undefined,
    viewers: string[],
  ) => {
    if (sharing?.anyone) return directory.all;
    const readers = new Set([ownerId, ...viewers]);
    for (const email of sharing?.emails ?? []) {
      const userId = directory.byEmail.get(email);
      if (userId) readers.add(userId);
    }
    if (sharing?.domains.length)
      for (const [email, userId] of directory.byEmail)
        if (sharing.domains.includes(email.split("@")[1] ?? "")) readers.add(userId);
    return [...readers];
  };
  /** Replace a Drive source's readers (call inside a transaction). */
  const grant = (sourceId: string, userIds: string[], expiresAt: Date) => {
    db.delete(sourceAccess).where(eq(sourceAccess.sourceId, sourceId)).run();
    if (userIds.length)
      db.insert(sourceAccess)
        .values(userIds.map((userId) => ({ sourceId, userId, expiresAt })))
        .onConflictDoNothing()
        .run();
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
        // Their own Drive may open files in restricted scopes others connected.
        service.queueAccessRefresh(stored.workspaceId);
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
    setScopes(actor: Actor, connectionId: string, scopesInput: ScopesInput) {
      requireRole(actor, "owner", "admin");
      const connection = getConnection(actor, connectionId, false);
      // Without a project the folders feed the workspace's "Company knowledge" (N-18).
      const projectId = scopesInput.projectId
        ? identity.requireProject(actor, scopesInput.projectId).id
        : services.projects.companyKnowledge(actor).id;
      const input = { ...scopesInput, projectId };
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
                ...(scope.frequency ? { syncFrequency: scope.frequency } : {}),
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
                syncFrequency: scope.frequency ?? "2d",
              })
              .run();
        }
        // Who may read a restricted scope is worked out in the background.
        for (const row of scopesFor(connection.id))
          if (
            row.projectId === input.projectId &&
            row.visibility === "restricted" &&
            !row.isExcluded
          )
            queue.enqueue(accessJob(row));
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
        queue.enqueue(scopeSyncJob(scope));
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
    /**
     * Job handler (`sync_connector`): list everything in a selected folder, shared drive or My Drive
     * (metadata only), then queue one `import_drive_file` job per new or changed file. Unchanged files
     * aren't downloaded again, files that failed before are retried, and files removed from Drive
     * are tombstoned once the whole scope has been listed.
     */
    async syncScope(job: JobRow) {
      const scope = scopeRow(String(job.payload.scopeId));
      if (!scope) return;
      const connection = connectionRow(scope.connectionId);
      if (connection?.status !== "connected") {
        db.update(connectorScopes)
          .set({ status: "needs_reauth", lastError: "Connection is not authorised" })
          .where(eq(connectorScopes.id, scope.id))
          .run();
        return;
      }
      const drive = google.drive({ version: "v3", auth: authorizedClient(connection) });
      let listing: ScopeListing;
      try {
        listing = await listScopeFiles(drive, scope, env.DRIVE_MAX_FILES_PER_SCOPE);
      } catch (error) {
        if (statusOf(error) === 401) {
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
      const project = repos.projects.findByIdUnscoped(scope.projectId);
      if (!project) return;
      const actor = actorForConnection(connection);
      // Everything below is synchronous: it reads the current rows after the listing finished.
      db.transaction(() => {
        const current = scopeRow(scope.id);
        if (!current) return;
        const cursor = cursorOf(current);
        const rejected: Record<string, Rejection> = {};
        const existing = new Map(
          db
            .select()
            .from(sourceObjects)
            .where(
              and(
                eq(sourceObjects.projectId, scope.projectId),
                eq(sourceObjects.connectionId, connection.id),
              ),
            )
            .all()
            .filter((row) => row.externalId)
            .map((row) => [row.externalId!, row]),
        );
        let queued = 0;
        let retried = 0;
        for (const file of listing.files.values()) {
          const previous = cursor.rejected?.[file.id];
          if (previous?.modifiedTime === file.modifiedTime) {
            rejected[file.id] = previous; // The same version failed for good last time.
            continue;
          }
          if (file.size !== null && file.size > env.MAX_DOCUMENT_BYTES) {
            rejected[file.id] = { modifiedTime: file.modifiedTime, reason: "too_large" };
            continue;
          }
          const source = existing.get(file.id);
          if (!source || !sameVersion(source, file)) {
            queue.enqueue({
              projectId: scope.projectId,
              type: "import_drive_file",
              payload: { scopeId: scope.id, file },
              subject: file.name,
              dedupe: true,
              priority: JOB_PRIORITY.bulk,
              concurrencyKey: `drive-file:${scope.projectId}:${file.id}`,
              maxAttempts: 4,
            });
            queued += 1;
            continue;
          }
          // Unchanged: no download. Keep its scope and sharing current; retry failed processing.
          db.update(sourceObjects)
            .set({
              metadata: { ...(source.metadata ?? {}), scopeId: scope.id, sharing: file.sharing },
            })
            .where(eq(sourceObjects.id, source.id))
            .run();
          if (source.status === "failed") {
            queue.enqueue({
              projectId: scope.projectId,
              type: "process_source",
              payload: { sourceObjectId: source.id },
              subject: source.title,
              dedupe: true,
              priority: JOB_PRIORITY.bulk,
              concurrencyKey: `source:${source.id}`,
            });
            retried += 1;
          }
        }
        // FR-INT-010: files gone from the scope are tombstoned and their claims re-evaluated. Only
        // after a complete listing: a partial one can't tell "removed" from "not listed".
        let removed = 0;
        if (listing.complete)
          for (const source of existing.values())
            if (source.metadata?.scopeId === scope.id && !listing.files.has(source.externalId!)) {
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
              removed += 1;
            }
        const next: ScopeCursor = {
          ...cursor,
          lastRunAt: new Date().toISOString(),
          filesSeen: listing.files.size,
          imported: queued,
          retried,
          removed,
          skipped: listing.skipped,
          rejected,
        };
        db.update(connectorScopes)
          .set({
            status: "live",
            lastSyncedAt: new Date(),
            // Files it keeps in sync: listed and importable.
            itemCount: listing.files.size - Object.keys(rejected).length,
            lastError: listing.complete
              ? null
              : `Only the first ${env.DRIVE_MAX_FILES_PER_SCOPE.toLocaleString("en-US")} files are synced`,
            cursor: next as Record<string, unknown>,
          })
          .where(eq(connectorScopes.id, scope.id))
          .run();
        // Who may read what was listed, worked out in the background too.
        if (scope.visibility === "restricted") queue.enqueue(accessJob(scope));
      });
    },
    /**
     * Job handler (`import_drive_file`): download one listed file, keep it as text, and queue its
     * processing. Permanent problems (too large, no readable text, no access) are recorded on the
     * scope so the same version isn't downloaded again; anything else is retried with backoff.
     */
    async importListedFile(job: JobRow) {
      const scope = scopeRow(String(job.payload.scopeId));
      if (!scope) return;
      const connection = connectionRow(scope.connectionId);
      if (connection?.status !== "connected") return;
      const project = repos.projects.findByIdUnscoped(scope.projectId);
      if (!project) return;
      const file = job.payload.file as ListedFile;
      const drive = google.drive({ version: "v3", auth: authorizedClient(connection) });
      try {
        const document = await download(drive, file);
        db.transaction(() => {
          storeFile(actorForConnection(connection), connection, project, file, document, {
            scopeId: scope.id,
            visibility: scope.visibility,
            priority: JOB_PRIORITY.bulk,
          });
          setRejection(scope.id, file.id, null);
        });
      } catch (error) {
        const status = statusOf(error);
        if (status === 401) {
          markReauth(connection);
          return;
        }
        if (error instanceof BadRequestError || status === 403 || status === 404) {
          setRejection(scope.id, file.id, {
            modifiedTime: file.modifiedTime,
            reason: rejectionReason(error),
          });
          return;
        }
        throw error;
      }
    },
    /** Import one file by id (the "Add from Drive" picker). */
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
      const file = toListedFile(info);
      const document = await download(drive, file);
      return db.transaction(() =>
        storeFile(actor, connection, project, file, document, {
          scopeId: scopeId ?? null,
          visibility,
          priority: JOB_PRIORITY.interactive,
        }),
      );
    },
    /**
     * Job handler (`refresh_access`): who may read a restricted scope's files. People the file or
     * shared drive is shared with (by email, their domain, or anyone with the link), plus everyone
     * whose own connected Drive lists the file. Stored as grants that expire unless refreshed, so
     * requests never call Google and a broken refresh fails closed.
     */
    async refreshScopeAccess(job: JobRow) {
      const scope = scopeRow(String(job.payload.scopeId));
      if (!scope) return;
      const connection = connectionRow(scope.connectionId);
      if (connection?.status !== "connected") return;
      if (scope.visibility !== "restricted") {
        markAccessSynced(scope.id);
        return;
      }
      const owner = google.drive({ version: "v3", auth: authorizedClient(connection) });
      let listing: ScopeListing;
      try {
        listing = await listScopeFiles(owner, scope, env.DRIVE_MAX_FILES_PER_SCOPE);
      } catch (error) {
        if (statusOf(error) === 401) {
          markReauth(connection);
          return;
        }
        throw error;
      }
      // A shared drive's members can read all of it.
      let driveSharing: Sharing | null = null;
      if (scope.scopeType === "shared_drive")
        try {
          const members = await owner.permissions.list({
            fileId: scope.externalId,
            supportsAllDrives: true,
            fields: "permissions(type,emailAddress,domain,deleted)",
          });
          driveSharing = toSharing(members.data.permissions ?? []);
        } catch {
          // Only organisers may list members; their own Drive listings still count below.
        }
      // Other members who connected Google Drive: what their account lists in this scope. My Drive
      // is personal ("root" is each person's own), so it relies on the file's sharing only.
      const viewers = new Map<string, Set<string>>();
      if (scope.externalId !== "root")
        for (const other of db
          .select()
          .from(connectorConnections)
          .where(
            and(
              eq(connectorConnections.workspaceId, connection.workspaceId),
              eq(connectorConnections.provider, "google_drive"),
              eq(connectorConnections.status, "connected"),
            ),
          )
          .all()
          .filter((row) => row.userId !== connection.userId)) {
          try {
            const theirs = await listScopeFiles(
              google.drive({ version: "v3", auth: authorizedClient(other) }),
              scope,
              env.DRIVE_MAX_FILES_PER_SCOPE,
              "nextPageToken,files(id,mimeType)",
            );
            for (const id of theirs.files.keys())
              viewers.set(id, (viewers.get(id) ?? new Set()).add(other.userId));
          } catch (error) {
            if (statusOf(error) === 401) markReauth(other);
            // 403/404: they can't open the scope, so they get nothing from it.
          }
        }
      db.transaction(() => {
        const directory = memberDirectory(connection.workspaceId);
        const expiresAt = new Date(Date.now() + ACCESS_TTL_MS);
        for (const source of db
          .select()
          .from(sourceObjects)
          .where(
            and(
              eq(sourceObjects.projectId, scope.projectId),
              eq(sourceObjects.connectionId, connection.id),
            ),
          )
          .all()) {
          if (source.metadata?.scopeId !== scope.id || !source.externalId) continue;
          const listed = listing.files.get(source.externalId);
          const sharing = mergeSharing(
            listed ? listed.sharing : (source.metadata.sharing as Sharing | null | undefined),
            driveSharing,
          );
          const fileViewers = [...(viewers.get(source.externalId) ?? [])];
          db.update(sourceObjects)
            .set({ metadata: { ...source.metadata, sharing, driveViewers: fileViewers } })
            .where(eq(sourceObjects.id, source.id))
            .run();
          grant(
            source.id,
            readersOf(directory, connection.userId, sharing, fileViewers),
            expiresAt,
          );
        }
        markAccessSynced(scope.id);
      });
    },
    /** A member connected Google Drive: work out what they can read, in the background. */
    queueAccessRefresh(workspaceId: string) {
      for (const scope of db
        .select()
        .from(connectorScopes)
        .where(
          and(
            eq(connectorScopes.workspaceId, workspaceId),
            eq(connectorScopes.visibility, "restricted"),
            eq(connectorScopes.isExcluded, false),
          ),
        )
        .all())
        queue.enqueue(accessJob(scope));
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
        else {
          for (const source of imported)
            db.update(sourceObjects)
              .set({
                connectionId: null,
                metadata: { ...(source.metadata ?? {}), disconnectedAt: new Date().toISOString() },
              })
              .where(eq(sourceObjects.id, source.id))
              .run();
          // With no provider left to check sharing against, restricted ones stay hidden.
          if (imported.length)
            db.delete(sourceAccess)
              .where(
                inArray(
                  sourceAccess.sourceId,
                  imported.map((row) => row.id),
                ),
              )
              .run();
        }
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
