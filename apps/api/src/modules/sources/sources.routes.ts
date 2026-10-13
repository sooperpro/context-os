import { CreateSourceInputSchema, IdSchema } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { validationHook } from "../../middleware/validation.js";
import type { ProjectEnv } from "../../types.js";
import type { SourceService } from "./sources.service.js";

const SourceParam = z.object({ sourceId: IdSchema });

export function createSourceRoutes(service: SourceService) {
  return new Hono<ProjectEnv>()
    .get("/", (c) => c.json({ items: service.list(c.get("project")) }))
    .post("/", zValidator("json", CreateSourceInputSchema, validationHook), (c) => {
      const source = service.create(c.get("actor"), c.get("project"), c.req.valid("json"));
      return c.json(source, 201);
    })
    .get("/:sourceId", zValidator("param", SourceParam, validationHook), (c) => {
      return c.json(service.get(c.get("project"), c.req.valid("param").sourceId));
    })
    .post("/:sourceId/reprocess", zValidator("param", SourceParam, validationHook), (c) => {
      return c.json(
        service.reprocess(c.get("actor"), c.get("project"), c.req.valid("param").sourceId),
        202,
      );
    })
    .delete("/:sourceId", zValidator("param", SourceParam, validationHook), (c) => {
      service.remove(c.get("actor"), c.get("project"), c.req.valid("param").sourceId);
      return c.body(null, 204);
    });
}
