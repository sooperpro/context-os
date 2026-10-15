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
 * (domain-owner checks, any-member actions) rather than by the owner/admin/manager rule, by the
 * first path segment after the project. Matched exactly: a project's slug never changes the rule.
 */
const ROUTE_LEVEL_MUTATIONS = new Set(["ask", "feedback", "canonical-sources"]);

/** The path after `/projects/<ref>`, as segments (`["ask", "threads"]`). */
const routeSegments = (path: string, ref: string) => {
  const segments = path.split("/").filter(Boolean);
  const at = segments.findIndex(
    (segment, index) =>
      segment === "projects" && decodeURIComponent(segments[index + 1] ?? "") === ref,
  );
  return at < 0 ? segments : segments.slice(at + 2);
};

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
    if (c.req.method !== "GET" && c.req.method !== "OPTIONS") {
      const [route, ...rest] = routeSegments(c.req.path, ref);
      if (route === undefined && c.req.method === "DELETE")
        // Deleting a project removes everyone's knowledge in it: owners and admins only.
        requireRole(actor, "owner", "admin");
      else if (route === "context-items" && rest.length > 0)
        identity.requireAssignment(actor, "domain_owner", project.id);
      else if (
        !(route && ROUTE_LEVEL_MUTATIONS.has(route)) &&
        !(route === "conflicts" && rest.length > 0)
      )
        requireRole(actor, "owner", "admin", "manager");
    }
    c.set("project", project);
    await next();
  };
}
