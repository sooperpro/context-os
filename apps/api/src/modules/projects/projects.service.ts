import { randomUUID } from "node:crypto";
import type {
  CreateProjectInput,
  Project,
  ProjectWithStats,
  UpdateProjectInput,
} from "@contextos/shared";
import type { ProjectRow } from "../../db/schema.js";
import type { Actor } from "../../types.js";
import type { AuditService } from "../audit/audit.service.js";
import type { ProjectRepository } from "./projects.repository.js";
import type { IdentityService } from "../identity/identity.service.js";

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
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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
      const row = repo.insert({
        id: randomUUID(),
        workspaceId: actor.workspaceId,
        name: input.name,
        description: input.description?.length ? input.description : null,
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
      const patch: Partial<Pick<ProjectRow, "name" | "description">> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) {
        patch.description = input.description.length ? input.description : null;
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
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
