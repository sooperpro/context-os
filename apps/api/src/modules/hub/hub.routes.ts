import { Hono } from "hono";
import type { ProjectEnv } from "../../types.js";
import type { HubService } from "./hub.service.js";

export function createHubRoutes(service: HubService) {
  return new Hono<ProjectEnv>()
    .get("/", (c) => c.json(service.getHub(c.get("project"))))
    .post("/refresh", (c) => c.json(service.requestRefresh(c.get("actor"), c.get("project")), 202));
}
