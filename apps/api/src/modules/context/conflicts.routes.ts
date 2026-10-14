import {
  CanonicalSourceInputSchema,
  ConflictDisputeInputSchema,
  ConflictResolveInputSchema,
  IdSchema,
  VersionSchema,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { ProjectEnv } from "../../types.js";
import { createPlatformStore } from "../platform/store.js";

const IdParam = z.object({ id: IdSchema });

/** Conflict objects and resolution (PRD §8.1.4, §8.6, §20 Context Engine). Project-scoped. */
export function createConflictRoutes(container: Container) {
  const { services, audit } = container;
  const visible = (c: { get: (key: "actor" | "project") => unknown }) =>
    services.context.listItems(
      c.get("project") as Parameters<typeof services.context.listItems>[0],
      undefined,
      c.get("actor") as Parameters<typeof services.context.listItems>[2],
    );
  return new Hono<ProjectEnv>()
    .get(
      "/",
      zValidator("query", z.object({ history: z.coerce.boolean().optional() }), validationHook),
      (c) =>
        c.json({
          items: services.conflicts.list(
            c.get("project"),
            visible(c),
            c.req.valid("query").history ?? false,
          ),
        }),
    )
    .get("/:id", zValidator("param", IdParam, validationHook), (c) =>
      c.json(services.conflicts.get(c.get("project"), c.req.valid("param").id, visible(c)).view),
    )
    .post(
      "/:id/review",
      zValidator("param", IdParam, validationHook),
      zValidator("json", VersionSchema, validationHook),
      (c) =>
        c.json(
          services.conflicts.review(
            c.get("actor"),
            c.get("project"),
            c.req.valid("param").id,
            c.req.valid("json").version,
            visible(c),
          ),
        ),
    )
    .post(
      "/:id/resolve",
      zValidator("param", IdParam, validationHook),
      zValidator("json", ConflictResolveInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const project = c.get("project");
        const view = services.conflicts.resolve(
          actor,
          project,
          c.req.valid("param").id,
          c.req.valid("json"),
          visible(c),
        );
        audit.record({
          actor,
          projectId: project.id,
          action: "conflict.resolve",
          targetType: "conflict",
          targetId: view.id,
          metadata: { outcome: c.req.valid("json").outcome, canonicalItemId: view.canonicalItemId },
        });
        return c.json(view);
      },
    )
    .post(
      "/:id/dispute",
      zValidator("param", IdParam, validationHook),
      zValidator("json", ConflictDisputeInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const project = c.get("project");
        const view = services.conflicts.dispute(
          actor,
          project,
          c.req.valid("param").id,
          c.req.valid("json"),
          visible(c),
        );
        audit.record({
          actor,
          projectId: project.id,
          action: "conflict.dispute",
          targetType: "conflict",
          targetId: view.id,
        });
        return c.json(view);
      },
    );
}

/** Domain owners mark sources canonical for a topic; canonical evidence outranks defaults (§8.6.2). */
export function createCanonicalSourceRoutes(container: Container) {
  const { db, identity, audit } = container;
  const store = createPlatformStore(db);
  return new Hono<ProjectEnv>()
    .get("/", (c) => {
      const project = c.get("project");
      const allowed = new Set(identity.visibleSourceIds(c.get("actor"), project.id));
      return c.json({
        items: store
          .listWhere(project.workspaceId, "canonical_source", { projectId: project.id }, 500)
          .filter((row) => allowed.has(String(row.data.sourceId))),
      });
    })
    .post("/", zValidator("json", CanonicalSourceInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const project = c.get("project");
      identity.requireAssignment(actor, "domain_owner", project.id);
      const input = c.req.valid("json");
      identity.requireSource(actor, project.id, input.sourceId);
      const existing = store
        .listWhere(project.workspaceId, "canonical_source", { projectId: project.id }, 500)
        .find(
          (row) => row.data.sourceId === input.sourceId && row.data.topicType === input.topicType,
        );
      if (existing) return c.json(existing, 200);
      const row = store.create(
        actor,
        "canonical_source",
        { ...input, setBy: actor.id },
        { projectId: project.id, status: "active" },
      );
      audit.record({
        actor,
        projectId: project.id,
        action: "canonical_source.set",
        targetType: "source",
        targetId: input.sourceId,
        metadata: { topicType: input.topicType },
      });
      return c.json(row, 201);
    })
    .delete("/:id", zValidator("param", IdParam, validationHook), (c) => {
      const actor = c.get("actor");
      const project = c.get("project");
      identity.requireAssignment(actor, "domain_owner", project.id);
      const row = store.find(project.workspaceId, "canonical_source", c.req.valid("param").id);
      if (row?.projectId !== project.id) throw new NotFoundError("Canonical source");
      store.patch(row, { status: "removed" });
      db.transaction(() => {
        audit.record({
          actor,
          projectId: project.id,
          action: "canonical_source.remove",
          targetType: "source",
          targetId: String(row.data.sourceId),
        });
      });
      return c.body(null, 204);
    });
}
