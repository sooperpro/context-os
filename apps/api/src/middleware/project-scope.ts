import { ProjectIdParamSchema } from "@contextos/shared";
import type { MiddlewareHandler } from "hono";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import type { ProjectRepository } from "../modules/projects/projects.repository.js";
import type { ProjectEnv } from "../types.js";

/**
 * Loads the project for `/projects/:projectId/*` routes, scoped to the actor's
 * workspace. Unknown or foreign projects 404 before any data is touched.
 */
export function projectScope(projects: ProjectRepository): MiddlewareHandler<ProjectEnv> {
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
    c.set("project", project);
    await next();
  };
}
