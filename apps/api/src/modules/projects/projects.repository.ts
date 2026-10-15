import type { ProjectStats } from "@contextos/shared";
import { and, count, desc, eq, isNull, max } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import {
  contextItems,
  projects,
  questions,
  sourceObjects,
  type ProjectRow,
} from "../../db/schema.js";

export function createProjectRepository(db: Db) {
  return {
    list(workspaceId: string): ProjectRow[] {
      return db
        .select()
        .from(projects)
        .where(eq(projects.workspaceId, workspaceId))
        .orderBy(desc(projects.updatedAt))
        .all();
    },

    findById(id: string, workspaceId: string): ProjectRow | undefined {
      return db
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), eq(projects.workspaceId, workspaceId)))
        .get();
    },

    findBySlug(slug: string, workspaceId: string): ProjectRow | undefined {
      return db
        .select()
        .from(projects)
        .where(and(eq(projects.slug, slug), eq(projects.workspaceId, workspaceId)))
        .get();
    },

    slugTaken(workspaceId: string, slug: string, exceptId?: string): boolean {
      const row = this.findBySlug(slug, workspaceId);
      return !!row && row.id !== exceptId;
    },

    /** Legacy rows created before slugs existed. */
    listWithoutSlug(): ProjectRow[] {
      return db.select().from(projects).where(isNull(projects.slug)).all();
    },

    /** For background jobs that already hold a trusted project id (no actor in scope). */
    findByIdUnscoped(id: string): ProjectRow | undefined {
      return db.select().from(projects).where(eq(projects.id, id)).get();
    },

    insert(row: typeof projects.$inferInsert): ProjectRow {
      return db.insert(projects).values(row).returning().get();
    },

    update(
      id: string,
      patch: Partial<Pick<ProjectRow, "name" | "description" | "slug" | "category">>,
    ): ProjectRow | undefined {
      return db
        .update(projects)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning()
        .get();
    },

    touch(id: string): void {
      db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, id)).run();
    },

    delete(id: string): boolean {
      return (
        db.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id }).all().length >
        0
      );
    },

    stats(projectId: string): ProjectStats {
      const sources = db
        .select({ total: count(), lastProcessedAt: max(sourceObjects.processedAt) })
        .from(sourceObjects)
        .where(eq(sourceObjects.projectId, projectId))
        .get();
      const ready = db
        .select({ total: count() })
        .from(sourceObjects)
        .where(and(eq(sourceObjects.projectId, projectId), eq(sourceObjects.status, "ready")))
        .get();
      const items = db
        .select({ total: count() })
        .from(contextItems)
        .where(eq(contextItems.projectId, projectId))
        .get();
      const asked = db
        .select({ total: count() })
        .from(questions)
        .where(eq(questions.projectId, projectId))
        .get();
      return {
        sources: sources?.total ?? 0,
        readySources: ready?.total ?? 0,
        contextItems: items?.total ?? 0,
        questions: asked?.total ?? 0,
        lastProcessedAt: sources?.lastProcessedAt ? sources.lastProcessedAt.toISOString() : null,
      };
    },
  };
}

export type ProjectRepository = ReturnType<typeof createProjectRepository>;
