import { randomUUID } from "node:crypto";
import type {
  CreateProjectInput,
  Project,
  ProjectWithStats,
  UpdateProjectInput,
} from "@contextos/shared";
import type { ProjectRow } from "../../db/schema.js";
import { AppError } from "../../lib/errors.js";
import { slugify } from "../../lib/slug.js";
import type { Actor } from "../../types.js";
import type { AuditService } from "../audit/audit.service.js";
import type { IdentityService } from "../identity/identity.service.js";
import type { ProjectRepository } from "./projects.repository.js";

export interface ProjectServiceDeps {
  repo: ProjectRepository;
  audit: AuditService;
  identity: IdentityService;
}

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    category: row.category,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** First free slug derived from the name: `payments`, `payments-2`, `payments-3`, ... */
export function uniqueSlug(
  repo: Pick<ProjectRepository, "slugTaken">,
  workspaceId: string,
  name: string,
  exceptId?: string,
): string {
  const base = slugify(name);
  if (!repo.slugTaken(workspaceId, base, exceptId)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base.slice(0, 50 - String(n).length - 1)}-${n}`;
    if (!repo.slugTaken(workspaceId, candidate, exceptId)) return candidate;
  }
  return `${base.slice(0, 40)}-${randomUUID().slice(0, 8)}`;
}

export function createProjectService({ repo, audit, identity }: ProjectServiceDeps) {
  const withStats = (row: ProjectRow, actor?: Actor): ProjectWithStats => ({
    ...toProject(row),
    stats: actor ? identity.statsFor(actor, row.id) : repo.stats(row.id),
  });

  return {
    withStats,

    list(actor: Actor): ProjectWithStats[] {
      return repo
        .list(actor.workspaceId)
        .filter((row) => {
          try {
            identity.requireProject(actor, row.id);
            return true;
          } catch {
            return false;
          }
        })
        .map((row) => withStats(row, actor));
    },

    create(actor: Actor, input: CreateProjectInput): ProjectWithStats {
      if (input.slug && repo.slugTaken(actor.workspaceId, input.slug))
        throw new AppError(409, "CONFLICT", "Project slug is already taken");
      const row = repo.insert({
        id: randomUUID(),
        workspaceId: actor.workspaceId,
        name: input.name,
        slug: input.slug ?? uniqueSlug(repo, actor.workspaceId, input.name),
        description: input.description?.length ? input.description : null,
        category: input.category ?? "project",
      });
      audit.record({
        actor,
        projectId: row.id,
        action: "project.create",
        targetType: "project",
        targetId: row.id,
      });
      return withStats(row, actor);
    },

    update(actor: Actor, project: ProjectRow, input: UpdateProjectInput): ProjectWithStats {
      const patch: Partial<Pick<ProjectRow, "name" | "description" | "slug" | "category">> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.category !== undefined) patch.category = input.category;
      if (input.description !== undefined) {
        patch.description = input.description.length ? input.description : null;
      }
      if (input.slug !== undefined) {
        if (repo.slugTaken(actor.workspaceId, input.slug, project.id))
          throw new AppError(409, "CONFLICT", "Project slug is already taken");
        patch.slug = input.slug;
      }
      const row = repo.update(project.id, patch) ?? project;
      audit.record({
        actor,
        projectId: project.id,
        action: "project.update",
        targetType: "project",
        targetId: project.id,
        metadata: { fields: Object.keys(patch) },
      });
      return withStats(row, actor);
    },

    remove(actor: Actor, project: ProjectRow): void {
      repo.delete(project.id);
      audit.record({
        actor,
        projectId: project.id,
        action: "project.delete",
        targetType: "project",
        targetId: project.id,
        metadata: { name: project.name },
      });
    },

    /** Assign slugs to projects created before slugs existed (idempotent, runs at startup). */
    backfillSlugs(): number {
      let updated = 0;
      for (const row of repo.listWithoutSlug()) {
        repo.update(row.id, { slug: uniqueSlug(repo, row.workspaceId, row.name, row.id) });
        updated += 1;
      }
      return updated;
    },
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
