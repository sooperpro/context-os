import { CreateProjectInputSchema, UpdateProjectInputSchema } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { validationHook } from "../../middleware/validation.js";
import type { AppEnv, ProjectEnv } from "../../types.js";
import type { ProjectService } from "./projects.service.js";

/** Collection routes: /projects */
export function createProjectsRoutes(service: ProjectService) {
  return new Hono<AppEnv>()
    .get("/", (c) => c.json({ items: service.list(c.get("actor")) }))
    .post("/", zValidator("json", CreateProjectInputSchema, validationHook), (c) => {
      const project = service.create(c.get("actor"), c.req.valid("json"));
      return c.json(project, 201);
    });
}

/** Single-project routes: /projects/:projectId (project is loaded by projectScope). */
export function createProjectRoutes(service: ProjectService) {
  return new Hono<ProjectEnv>()
    .get("/", (c) => c.json(service.withStats(c.get("project"))))
    .patch("/", zValidator("json", UpdateProjectInputSchema, validationHook), (c) => {
      return c.json(service.update(c.get("actor"), c.get("project"), c.req.valid("json")));
    })
    .delete("/", (c) => {
      service.remove(c.get("actor"), c.get("project"));
      return c.body(null, 204);
    });
}
