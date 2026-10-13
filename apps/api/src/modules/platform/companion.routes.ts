import { CompanionPreferencesSchema } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { platformRecords, users } from "../../db/schema.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { AppEnv } from "../../types.js";
import { createPlatformStore } from "./store.js";
import { reputationSummary } from "./reputation.js";

const ContextInput = z.object({ projectId: z.uuid(), sourceId: z.uuid().optional() });
const InteractionInput = z
  .object({
    trigger: z.enum(["opened", "dismissed", "helpful", "not_helpful"]),
    surface: z.enum(["web", "extension", "desktop"]).default("web"),
  })
  .strict();
const NotificationsUpdate = z
  .object({
    email: z.boolean().default(false),
    inApp: z.boolean().default(true),
    quietStartHour: z.number().int().min(0).max(23).default(22),
    quietEndHour: z.number().int().min(0).max(23).default(8),
  })
  .strict();

export function createCompanionRoutes(container: Container) {
  const { db, identity, services } = container;
  const store = createPlatformStore(db);
  return new Hono<AppEnv>()
    .get("/gamification/me", (c) => c.json(reputationSummary(db, c.get("actor"))))
    .get("/companion/preferences", (c) => {
      const user = db
        .select()
        .from(users)
        .where(eq(users.id, c.get("actor").id))
        .get();
      return c.json(CompanionPreferencesSchema.parse(user?.preferences.companion ?? {}));
    })
    .patch(
      "/companion/preferences",
      zValidator("json", CompanionPreferencesSchema, validationHook),
      (c) => {
        const user = db
          .select()
          .from(users)
          .where(eq(users.id, c.get("actor").id))
          .get();
        if (!user) throw new NotFoundError("User");
        const input = c.req.valid("json");
        db.update(users)
          .set({ preferences: { ...user.preferences, companion: input } })
          .where(eq(users.id, user.id))
          .run();
        return c.json(input);
      },
    )
    .get("/companion/context", zValidator("query", ContextInput, validationHook), (c) => {
      const actor = c.get("actor");
      const input = c.req.valid("query");
      const project = identity.requireProject(actor, input.projectId);
      if (input.sourceId) identity.requireSource(actor, project.id, input.sourceId);
      const items = services.context
        .listItems(project, undefined, actor)
        .filter(
          (item) =>
            !input.sourceId ||
            item.evidence.some((evidence) => evidence.sourceObjectId === input.sourceId),
        );
      return c.json({
        projectId: project.id,
        prompts: [
          "What is this project's current state?",
          "Which decisions explain how it works?",
          "Who owns this area?",
        ],
        owners: items.filter((item) => item.kind === "person").slice(0, 10),
        decisions: items.filter((item) => item.kind === "decision").slice(0, 10),
      });
    })
    .post(
      "/companion/stuck-help",
      zValidator(
        "json",
        ContextInput.extend({
          question: z
            .string()
            .trim()
            .min(3)
            .max(2000)
            .default("Explain the current context, decisions and ownership for this project."),
        }).strict(),
        validationHook,
      ),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        const project = identity.requireProject(actor, input.projectId);
        if (input.sourceId) identity.requireSource(actor, project.id, input.sourceId);
        return c.json(
          await services.ask.ask(actor, project, { question: input.question }, input.sourceId),
        );
      },
    )
    .post("/companion/interactions", zValidator("json", InteractionInput, validationHook), (c) => {
      const actor = c.get("actor");
      const preferences = db.select().from(users).where(eq(users.id, actor.id)).get()?.preferences;
      const companion = CompanionPreferencesSchema.parse(preferences?.companion ?? {});
      if (!companion.enabled) throw new AppError(403, "FORBIDDEN", "Companion is disabled");
      const hourAgo = Date.now() - 3600000;
      const recent = db
        .select()
        .from(platformRecords)
        .where(
          and(
            eq(platformRecords.workspaceId, actor.workspaceId),
            eq(platformRecords.ownerId, actor.id),
            eq(platformRecords.kind, "companion_interaction"),
          ),
        )
        .all()
        .filter((row) => row.createdAt.getTime() > hourAgo);
      if (recent.length >= 60)
        throw new AppError(429, "RATE_LIMITED", "Companion interaction limit reached");
      return c.json(
        store.create(actor, "companion_interaction", c.req.valid("json"), { status: "recorded" }),
        201,
      );
    })
    .get("/notifications", (c) =>
      c.json({
        items: store.listOwned(c.get("actor"), "notification"),
      }),
    )
    .patch("/notifications/:id/read", (c) => {
      const actor = c.get("actor");
      const row = store.get(actor, "notification", c.req.param("id"));
      if (row.ownerId !== actor.id) throw new NotFoundError("Notification");
      return c.json(store.update(actor, row, row.version, { status: "read" }));
    })
    .get("/notifications/preferences", (c) =>
      c.json(
        db
          .select()
          .from(users)
          .where(eq(users.id, c.get("actor").id))
          .get()?.preferences.notifications ?? { email: false, inApp: true },
      ),
    )
    .patch(
      "/notifications/preferences",
      zValidator("json", NotificationsUpdate, validationHook),
      (c) => {
        const user = db
          .select()
          .from(users)
          .where(eq(users.id, c.get("actor").id))
          .get();
        if (!user) throw new NotFoundError("User");
        db.update(users)
          .set({ preferences: { ...user.preferences, notifications: c.req.valid("json") } })
          .where(eq(users.id, user.id))
          .run();
        return c.json(c.req.valid("json"));
      },
    );
}
