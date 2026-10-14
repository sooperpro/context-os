import { SaveInputSchema, type SavedItem } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { platformRecords, type ProjectRow } from "../../db/schema.js";
import { NotFoundError } from "../../lib/errors.js";
import { isUuid } from "../../lib/slug.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { createPlatformStore } from "./store.js";

const KIND = "saved";
const TargetParam = z.object({ targetId: z.string().min(1).max(200) });

/**
 * Saved knowledge (`/me/saved`): a person's own bookmarks of projects and context items. Entries
 * the person can no longer open are left out, so titles never leak through a save.
 */
export function createSavedRoutes(container: Container) {
  const { db, identity, services, repos } = container;
  const store = createPlatformStore(db);

  /** The project behind an id or slug, if the actor may open it. */
  const readableProject = (actor: Actor, ref: string): ProjectRow | undefined => {
    const row = isUuid(ref)
      ? repos.projects.findById(ref, actor.workspaceId)
      : repos.projects.findBySlug(ref, actor.workspaceId);
    if (!row) return undefined;
    try {
      return identity.requireProject(actor, row.id);
    } catch {
      return undefined;
    }
  };
  /** Ids of the context items the actor can see in a project (evidence permissions applied). */
  const visibleItemIds = (actor: Actor, project: ProjectRow) =>
    new Set(services.context.listItems(project, undefined, actor).map((item) => item.id));

  const toEntry = (row: { data: Record<string, unknown>; updatedAt: Date }): SavedItem => ({
    targetType: row.data.targetType === "project" ? "project" : "context_item",
    targetId: String(row.data.targetId),
    projectId: String(row.data.projectId),
    savedAt: row.updatedAt.toISOString(),
  });

  return new Hono<AppEnv>()
    .get("/me/saved", (c) => {
      const actor = c.get("actor");
      const projects = new Map<string, ProjectRow | undefined>();
      const items = new Map<string, Set<string>>();
      const entries = store
        .listOwned(actor, KIND, actor.id, 500)
        .map(toEntry)
        .filter((entry) => {
          if (!projects.has(entry.projectId))
            projects.set(entry.projectId, readableProject(actor, entry.projectId));
          const project = projects.get(entry.projectId);
          if (!project) return false;
          if (entry.targetType === "project") return entry.targetId === project.id;
          if (!items.has(project.id)) items.set(project.id, visibleItemIds(actor, project));
          return items.get(project.id)!.has(entry.targetId);
        })
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      return c.json({ items: entries });
    })
    .put(
      "/me/saved/:targetId",
      zValidator("param", TargetParam, validationHook),
      zValidator("json", SaveInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const { targetId } = c.req.valid("param");
        const input = c.req.valid("json");
        const project = readableProject(actor, input.projectId);
        if (!project) throw new NotFoundError("Project");
        if (
          input.targetType === "project"
            ? targetId !== project.id && targetId !== project.slug
            : !visibleItemIds(actor, project).has(targetId)
        )
          throw new NotFoundError(input.targetType === "project" ? "Project" : "Context item");
        const resolvedTarget = input.targetType === "project" ? project.id : targetId;
        return db.transaction(() => {
          // Idempotent, keyed by (targetType, targetId): saving again moves it to the top.
          for (const row of store.listOwned(actor, KIND, actor.id, 500))
            if (row.data.targetType === input.targetType && row.data.targetId === resolvedTarget)
              db.delete(platformRecords)
                .where(and(eq(platformRecords.id, row.id), eq(platformRecords.ownerId, actor.id)))
                .run();
          if (!input.saved) return c.json(null);
          const row = store.create(
            actor,
            KIND,
            { targetType: input.targetType, targetId: resolvedTarget, projectId: project.id },
            { projectId: project.id, status: "active" },
          );
          return c.json(toEntry(row));
        });
      },
    );
}
