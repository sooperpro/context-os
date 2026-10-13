import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { domainEvents, platformRecords } from "../../db/schema.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import type { Actor } from "../../types.js";

export type PlatformRecord = typeof platformRecords.$inferSelect;
export function createPlatformStore(db: Db) {
  return {
    create(
      actor: Actor,
      kind: string,
      data: Record<string, unknown>,
      options: { projectId?: string; parentId?: string; status?: string; ownerId?: string } = {},
    ): PlatformRecord {
      return db
        .insert(platformRecords)
        .values({
          id: randomUUID(),
          workspaceId: actor.workspaceId,
          ownerId: options.ownerId ?? actor.id,
          kind,
          data,
          projectId: options.projectId,
          parentId: options.parentId,
          status: options.status ?? "draft",
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
    update(
      actor: Actor,
      row: PlatformRecord,
      version: number,
      patch: { data?: Record<string, unknown>; status?: string },
    ): PlatformRecord {
      const updated = db
        .update(platformRecords)
        .set({ ...patch, version: version + 1, updatedAt: new Date() })
        .where(
          and(
            eq(platformRecords.workspaceId, actor.workspaceId),
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
    event(actor: Actor, type: string, data: Record<string, unknown>): void {
      db.insert(domainEvents)
        .values({ id: randomUUID(), workspaceId: actor.workspaceId, type, data })
        .run();
    },
  };
}
export type PlatformStore = ReturnType<typeof createPlatformStore>;
