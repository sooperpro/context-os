import { HubSectionKeySchema } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { validationHook } from "../../middleware/validation.js";
import type { ProjectEnv } from "../../types.js";
import type { HubService } from "./hub.service.js";

export function createHubRoutes(service: HubService) {
  return new Hono<ProjectEnv>()
    .get("/", (c) => c.json(service.getHub(c.get("project"), c.get("actor"))))
    .post("/refresh", (c) => c.json(service.requestRefresh(c.get("actor"), c.get("project")), 202))
    .get("/team", (c) => c.json({ items: service.team(c.get("project"), c.get("actor")) }));
}

/** The ten PRD hub sections rendered for the caller's permission set (FR-HUB-002/004/005). */
export function createSectionRoutes(service: HubService) {
  return new Hono<ProjectEnv>()
    .get("/", (c) => {
      const hub = service.getHub(c.get("project"), c.get("actor"));
      return c.json({ khs: hub.khs ?? null, items: hub.sections ?? [] });
    })
    .get(
      "/:sectionKey",
      zValidator("param", z.object({ sectionKey: HubSectionKeySchema }), validationHook),
      (c) =>
        c.json(
          service.getSection(c.get("project"), c.get("actor"), c.req.valid("param").sectionKey),
        ),
    );
}

export function createHealthScoreRoutes(service: HubService) {
  return new Hono<ProjectEnv>().get("/", (c) =>
    c.json(service.getKhs(c.get("project"), c.get("actor"))),
  );
}
