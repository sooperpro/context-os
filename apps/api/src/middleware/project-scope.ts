import { ProjectIdParamSchema } from "@contextos/shared";
import type { MiddlewareHandler } from "hono";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import type { ProjectRepository } from "../modules/projects/projects.repository.js";
import type { ProjectEnv } from "../types.js";
import type { IdentityService } from "../modules/identity/identity.service.js";
import { requireRole } from "../modules/identity/identity.service.js";

/**
 * Loads the project for `/projects/:projectId/*` routes, scoped to the actor's
 * workspace. Unknown or foreign projects 404 before any data is touched.
 */
export function projectScope(
  projects: ProjectRepository,
  identity: IdentityService,
): MiddlewareHandler<ProjectEnv> {
  return async (c, next) => {
    const parsed = ProjectIdParamSchema.safeParse({ projectId: c.req.param("projectId") });
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((issue) => ({
          path: issue.path.map((p) => (typeof p === "symbol" ? String(p) : p)),
          message: issue.message,
          code: issue.code,
        })),
      );
    }
    const actor = c.get("actor");
    const project = projects.findById(parsed.data.projectId, actor.workspaceId);
    if (!project) throw new NotFoundError("Project", parsed.data.projectId);
    identity.requireProject(actor, project.id);
    if (c.req.method !== "GET" && c.req.method !== "OPTIONS") {
      if (c.req.path.includes("/context-items/"))
        identity.requireAssignment(actor, "domain_owner", project.id);
      else if (!c.req.path.endsWith("/ask") && !c.req.path.endsWith("/feedback"))
        requireRole(actor, "owner", "admin", "manager");
    }
    c.set("project", project);
    await next();
  };
}
