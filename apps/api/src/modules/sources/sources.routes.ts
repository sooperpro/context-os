import { CreateSourceInputSchema, IdSchema } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { validationHook } from "../../middleware/validation.js";
import type { ProjectEnv } from "../../types.js";
import type { SourceService } from "./sources.service.js";
import type { IdentityService } from "../identity/identity.service.js";

const SourceParam = z.object({ sourceId: IdSchema });

export function createSourceRoutes(service: SourceService, identity: IdentityService) {
  return new Hono<ProjectEnv>()
    .get("/", (c) => {
      const allowed = new Set(identity.visibleSourceIds(c.get("actor"), c.get("project").id));
      return c.json({
        items: service.list(c.get("project")).filter((source) => allowed.has(source.id)),
      });
    })
    .post("/", zValidator("json", CreateSourceInputSchema, validationHook), (c) => {
      const source = service.create(c.get("actor"), c.get("project"), c.req.valid("json"));
      return c.json(source, 201);
    })
    .get("/:sourceId", zValidator("param", SourceParam, validationHook), (c) => {
      identity.requireSource(c.get("actor"), c.get("project").id, c.req.valid("param").sourceId);
      return c.json(service.get(c.get("project"), c.req.valid("param").sourceId));
    })
    .post("/:sourceId/reprocess", zValidator("param", SourceParam, validationHook), (c) => {
      identity.requireSource(c.get("actor"), c.get("project").id, c.req.valid("param").sourceId);
      return c.json(
        service.reprocess(c.get("actor"), c.get("project"), c.req.valid("param").sourceId),
        202,
      );
    })
    .delete("/:sourceId", zValidator("param", SourceParam, validationHook), (c) => {
      identity.requireSource(c.get("actor"), c.get("project").id, c.req.valid("param").sourceId);
      service.remove(c.get("actor"), c.get("project"), c.req.valid("param").sourceId);
      return c.body(null, 204);
    });
}
