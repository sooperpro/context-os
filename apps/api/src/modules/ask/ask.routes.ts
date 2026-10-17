import { AskInputSchema } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { validationHook } from "../../middleware/validation.js";
import type { ProjectEnv } from "../../types.js";
import type { AskService } from "./ask.service.js";
import type { OrgContext } from "./org-context.js";

export function createAskRoutes(service: AskService, org?: OrgContext) {
  return new Hono<ProjectEnv>().post(
    "/",
    zValidator("json", AskInputSchema, validationHook),
    async (c) => {
      const actor = c.get("actor");
      const project = c.get("project");
      const input = c.req.valid("json");
      const facts = org?.factsFor(actor, input.question, { projectId: project.id }) ?? [];
      const answer = await service.ask(actor, project, input, undefined, facts);
      return c.json(answer, 201);
    },
  );
}

export function createQuestionRoutes(service: AskService) {
  return new Hono<ProjectEnv>().get("/", (c) =>
    c.json({ items: service.history(c.get("actor"), c.get("project")) }),
  );
}
