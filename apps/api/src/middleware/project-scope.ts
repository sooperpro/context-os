import { ProjectRefParamSchema } from "@contextos/shared";
import type { MiddlewareHandler } from "hono";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { isUuid } from "../lib/slug.js";
import type { IdentityService } from "../modules/identity/identity.service.js";
import { requireRole } from "../modules/identity/identity.service.js";
import type { ProjectRepository } from "../modules/projects/projects.repository.js";
import type { ProjectEnv } from "../types.js";

/**
 * Routes under /projects/:projectId whose mutations are authorised inside the route
 * (domain-owner checks, any-member actions) rather than by the owner/admin/manager rule.
 */
const ROUTE_LEVEL_MUTATIONS = ["/ask", "/feedback", "/conflicts/", "/canonical-sources"];

/**
 * Loads the project for `/projects/:projectId/*` routes (UUID or slug), scoped to the
 * actor's workspace. Unknown or foreign projects 404 before any data is touched.
 */
export function projectScope(
  projects: ProjectRepository,
  identity: IdentityService,
): MiddlewareHandler<ProjectEnv> {
  return async (c, next) => {
    const parsed = ProjectRefParamSchema.safeParse({ projectId: c.req.param("projectId") });
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
    const ref = parsed.data.projectId;
    const project = isUuid(ref)
      ? projects.findById(ref, actor.workspaceId)
      : projects.findBySlug(ref, actor.workspaceId);
    if (!project) throw new NotFoundError("Project", ref);
    identity.requireProject(actor, project.id);
    const path = c.req.path;
    if (c.req.method !== "GET" && c.req.method !== "OPTIONS") {
      if (path.includes("/context-items/"))
        identity.requireAssignment(actor, "domain_owner", project.id);
      else if (!ROUTE_LEVEL_MUTATIONS.some((segment) => path.includes(segment)))
        requireRole(actor, "owner", "admin", "manager");
    }
    c.set("project", project);
    await next();
  };
}
