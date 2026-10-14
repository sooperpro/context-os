import {
  BountyDecisionSchema,
  BountyInputSchema,
  BountyListQuerySchema,
  BountySubmitInputSchema,
  VersionSchema,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Container } from "../../container.js";
import { validationHook } from "../../middleware/validation.js";
import type { AppEnv } from "../../types.js";

/** Bounty board (PRD §20 "Knowledge Maintenance, Flags & Bounties"). */
export function createBountyRoutes(container: Container) {
  const { services, audit } = container;
  const bounties = services.bounties;
  return new Hono<AppEnv>()
    .get("/bounties", zValidator("query", BountyListQuerySchema, validationHook), (c) =>
      c.json({ items: bounties.list(c.get("actor"), c.req.valid("query")) }),
    )
    .post("/bounties", zValidator("json", BountyInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const row = bounties.create(actor, c.req.valid("json"));
      audit.record({
        actor,
        projectId: row.projectId,
        action: "bounty.create",
        targetType: "bounty",
        targetId: row.id,
      });
      return c.json(row, 201);
    })
    .get("/bounties/:id", (c) => c.json(bounties.get(c.get("actor"), c.req.param("id"))))
    .post("/bounties/:id/publish", zValidator("json", VersionSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const row = bounties.publish(actor, c.req.param("id"), c.req.valid("json").version);
      audit.record({
        actor,
        projectId: row.projectId,
        action: "bounty.publish",
        targetType: "bounty",
        targetId: row.id,
      });
      return c.json(row);
    })
    .post("/bounties/:id/claim", zValidator("json", VersionSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const row = bounties.claim(actor, c.req.param("id"), c.req.valid("json").version);
      audit.record({
        actor,
        projectId: row.projectId,
        action: "bounty.claim",
        targetType: "bounty",
        targetId: row.id,
      });
      return c.json(row);
    })
    .post("/bounties/:id/release", zValidator("json", VersionSchema, validationHook), (c) =>
      c.json(bounties.release(c.get("actor"), c.req.param("id"), c.req.valid("json").version)),
    )
    .post("/bounties/:id/extend", zValidator("json", VersionSchema, validationHook), (c) =>
      c.json(bounties.extend(c.get("actor"), c.req.param("id"), c.req.valid("json").version)),
    )
    .post(
      "/bounties/:id/submit",
      zValidator("json", BountySubmitInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const row = bounties.submit(actor, c.req.param("id"), c.req.valid("json"));
        audit.record({
          actor,
          projectId: row.projectId,
          action: "bounty.submit",
          targetType: "bounty",
          targetId: row.id,
        });
        return c.json(row);
      },
    )
    .post(
      "/bounties/:id/approve",
      zValidator("json", BountyDecisionSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        const row = bounties.decide(actor, c.req.param("id"), input);
        audit.record({
          actor,
          projectId: row.projectId,
          action: "bounty.decide",
          targetType: "bounty",
          targetId: row.id,
          metadata: { approved: input.approved },
        });
        return c.json(row);
      },
    )
    .post("/bounties/:id/cancel", zValidator("json", VersionSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const row = bounties.cancel(actor, c.req.param("id"), c.req.valid("json").version);
      audit.record({
        actor,
        projectId: row.projectId,
        action: "bounty.cancel",
        targetType: "bounty",
        targetId: row.id,
      });
      return c.json(row);
    });
}
