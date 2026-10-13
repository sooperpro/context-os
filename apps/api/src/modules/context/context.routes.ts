import {
  IdSchema,
  ListContextItemsQuerySchema,
  SetVerificationInputSchema,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { validationHook } from "../../middleware/validation.js";
import type { ProjectEnv } from "../../types.js";
import type { ContextService } from "./context.service.js";

const ItemParam = z.object({ itemId: IdSchema });

export function createContextRoutes(service: ContextService) {
  return new Hono<ProjectEnv>()
    .get("/", zValidator("query", ListContextItemsQuerySchema, validationHook), (c) => {
      return c.json({
        items: service.listItems(c.get("project"), c.req.valid("query").kind, c.get("actor")),
      });
    })
    .patch(
      "/:itemId/verification",
      zValidator("param", ItemParam, validationHook),
      zValidator("json", SetVerificationInputSchema, validationHook),
      (c) => {
        return c.json(
          service.setVerification(
            c.get("actor"),
            c.get("project"),
            c.req.valid("param").itemId,
            c.req.valid("json").verification,
          ),
        );
      },
    );
}
