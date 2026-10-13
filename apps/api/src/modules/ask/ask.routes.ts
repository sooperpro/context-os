import { AskInputSchema } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { validationHook } from "../../middleware/validation.js";
import type { ProjectEnv } from "../../types.js";
import type { AskService } from "./ask.service.js";

export function createAskRoutes(service: AskService) {
  return new Hono<ProjectEnv>().post(
    "/",
    zValidator("json", AskInputSchema, validationHook),
    async (c) => {
      const answer = await service.ask(c.get("actor"), c.get("project"), c.req.valid("json"));
      return c.json(answer, 201);
    },
  );
}

export function createQuestionRoutes(service: AskService) {
  return new Hono<ProjectEnv>().get("/", (c) =>
    c.json({ items: service.history(c.get("actor"), c.get("project")) }),
  );
}
