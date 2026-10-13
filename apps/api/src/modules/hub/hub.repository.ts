import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { hubSnapshots, type HubSnapshotRow } from "../../db/schema.js";

export const OVERVIEW_SECTION = "overview";

export function createHubRepository(db: Db) {
  return {
    getSnapshot(projectId: string, section: string): HubSnapshotRow | undefined {
      return db
        .select()
        .from(hubSnapshots)
        .where(and(eq(hubSnapshots.projectId, projectId), eq(hubSnapshots.section, section)))
        .get();
    },

    upsertSnapshot(row: {
      projectId: string;
      section: string;
      data: Record<string, unknown>;
      model: string;
      promptVersion: string;
    }): HubSnapshotRow {
      return db
        .insert(hubSnapshots)
        .values({ id: randomUUID(), ...row, stale: false, generatedAt: new Date() })
        .onConflictDoUpdate({
          target: [hubSnapshots.projectId, hubSnapshots.section],
          set: {
            data: row.data,
            model: row.model,
            promptVersion: row.promptVersion,
            stale: false,
            generatedAt: new Date(),
          },
        })
        .returning()
        .get();
    },

    deleteSnapshot(projectId: string, section: string): void {
      db.delete(hubSnapshots)
        .where(and(eq(hubSnapshots.projectId, projectId), eq(hubSnapshots.section, section)))
        .run();
    },

    markStale(projectId: string): void {
      db.update(hubSnapshots)
        .set({ stale: true })
        .where(eq(hubSnapshots.projectId, projectId))
        .run();
    },
  };
}

export type HubRepository = ReturnType<typeof createHubRepository>;
