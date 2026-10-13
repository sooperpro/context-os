import { CreateFeedbackInputSchema } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { validationHook } from "../../middleware/validation.js";
import type { ProjectEnv } from "../../types.js";
import type { FeedbackService } from "./feedback.service.js";

export function createFeedbackRoutes(service: FeedbackService) {
  return new Hono<ProjectEnv>()
    .get("/", (c) => c.json({ items: service.list(c.get("project")) }))
    .post("/", zValidator("json", CreateFeedbackInputSchema, validationHook), (c) => {
      return c.json(service.create(c.get("actor"), c.get("project"), c.req.valid("json")), 201);
    });
}
