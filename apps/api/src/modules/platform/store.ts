import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { domainEvents, platformRecords } from "../../db/schema.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import type { Actor } from "../../types.js";

export type PlatformRecord = typeof platformRecords.$inferSelect;
export interface RecordFilter {
  projectId?: string;
  status?: string;
  ownerId?: string;
  parentId?: string;
}
export function createPlatformStore(db: Db) {
  return {
    create(
      actor: Actor,
      kind: string,
      data: Record<string, unknown>,
      options: { projectId?: string; parentId?: string; status?: string; ownerId?: string } = {},
    ): PlatformRecord {
      return this.insert({
        workspaceId: actor.workspaceId,
        ownerId: options.ownerId ?? actor.id,
        kind,
        data,
        projectId: options.projectId,
        parentId: options.parentId,
        status: options.status,
      });
    },
    /** Actor-less insert for system-owned records (owner `system`) and background work. */
    insert(input: {
      workspaceId: string;
      ownerId: string;
      kind: string;
      data: Record<string, unknown>;
      projectId?: string | null;
      parentId?: string | null;
      status?: string;
    }): PlatformRecord {
      return db
        .insert(platformRecords)
        .values({
          id: randomUUID(),
          workspaceId: input.workspaceId,
          ownerId: input.ownerId,
          kind: input.kind,
          data: input.data,
          projectId: input.projectId ?? null,
          parentId: input.parentId ?? null,
          status: input.status ?? "draft",
        })
        .returning()
        .get();
    },
    get(actor: Actor, kind: string, id: string): PlatformRecord {
      const row = db
        .select()
        .from(platformRecords)
        .where(
          and(
            eq(platformRecords.workspaceId, actor.workspaceId),
            eq(platformRecords.kind, kind),
            eq(platformRecords.id, id),
          ),
        )
        .get();
      if (!row) throw new NotFoundError(kind);
      return row;
    },
    find(workspaceId: string, kind: string, id: string): PlatformRecord | undefined {
      return db
        .select()
        .from(platformRecords)
        .where(
          and(
            eq(platformRecords.workspaceId, workspaceId),
            eq(platformRecords.kind, kind),
            eq(platformRecords.id, id),
          ),
        )
        .get();
    },
    list(actor: Actor, kind: string, limit = 50, offset = 0): PlatformRecord[] {
      return db
        .select()
        .from(platformRecords)
        .where(
          and(eq(platformRecords.workspaceId, actor.workspaceId), eq(platformRecords.kind, kind)),
        )
        .orderBy(desc(platformRecords.createdAt))
        .limit(limit)
        .offset(offset)
        .all();
    },
    listWhere(
      workspaceId: string,
      kind: string,
      filter: RecordFilter = {},
      limit = 100,
      offset = 0,
    ): PlatformRecord[] {
      return db
        .select()
        .from(platformRecords)
        .where(
          and(
            eq(platformRecords.workspaceId, workspaceId),
            eq(platformRecords.kind, kind),
            filter.projectId ? eq(platformRecords.projectId, filter.projectId) : undefined,
            filter.status ? eq(platformRecords.status, filter.status) : undefined,
            filter.ownerId ? eq(platformRecords.ownerId, filter.ownerId) : undefined,
            filter.parentId ? eq(platformRecords.parentId, filter.parentId) : undefined,
          ),
        )
        .orderBy(desc(platformRecords.createdAt))
        .limit(limit)
        .offset(offset)
        .all();
    },
    listChildren(actor: Actor, kind: string, parentId: string, limit = 1000): PlatformRecord[] {
      return db
        .select()
        .from(platformRecords)
        .where(
          and(
            eq(platformRecords.workspaceId, actor.workspaceId),
            eq(platformRecords.kind, kind),
            eq(platformRecords.parentId, parentId),
          ),
        )
        .orderBy(platformRecords.createdAt)
        .limit(limit)
        .all();
    },
    listOwned(actor: Actor, kind: string, ownerId = actor.id, limit = 100): PlatformRecord[] {
      return db
        .select()
        .from(platformRecords)
        .where(
          and(
            eq(platformRecords.workspaceId, actor.workspaceId),
            eq(platformRecords.kind, kind),
            eq(platformRecords.ownerId, ownerId),
          ),
        )
        .orderBy(desc(platformRecords.createdAt))
        .limit(limit)
        .all();
    },
    /** Optimistic-lock update: the caller's `version` must match or 409 is raised. */
    update(
      actor: Actor,
      row: PlatformRecord,
      version: number,
      patch: { data?: Record<string, unknown>; status?: string },
    ): PlatformRecord {
      return this.updateVersioned(actor.workspaceId, row, version, patch);
    },
    updateVersioned(
      workspaceId: string,
      row: PlatformRecord,
      version: number,
      patch: { data?: Record<string, unknown>; status?: string },
    ): PlatformRecord {
      const updated = db
        .update(platformRecords)
        .set({ ...patch, version: version + 1, updatedAt: new Date() })
        .where(
          and(
            eq(platformRecords.workspaceId, workspaceId),
            eq(platformRecords.kind, row.kind),
            eq(platformRecords.id, row.id),
            eq(platformRecords.version, version),
          ),
        )
        .returning()
        .get();
      if (!updated) throw new AppError(409, "CONFLICT", "The resource changed; reload and retry");
      return updated;
    },
    /** Permanently removes a record. Callers decide when that is allowed. */
    remove(row: PlatformRecord) {
      db.delete(platformRecords)
        .where(
          and(eq(platformRecords.workspaceId, row.workspaceId), eq(platformRecords.id, row.id)),
        )
        .run();
    },
    /** System update using the row's current version (background sweeps, side effects). */
    patch(row: PlatformRecord, patch: { data?: Record<string, unknown>; status?: string }) {
      return this.updateVersioned(row.workspaceId, row, row.version, patch);
    },
    event(actor: Actor, type: string, data: Record<string, unknown>): void {
      this.emit(actor.workspaceId, type, data);
    },
    emit(workspaceId: string, type: string, data: Record<string, unknown>): void {
      db.insert(domainEvents).values({ id: randomUUID(), workspaceId, type, data }).run();
    },
  };
}
export type PlatformStore = ReturnType<typeof createPlatformStore>;
