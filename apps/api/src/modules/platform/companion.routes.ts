import {
  CompanionPreferencesSchema,
  NotificationPreferencesSchema,
  PageQuerySchema,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { memberships, platformRecords, questions, sourceObjects, users } from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { createPlatformStore } from "./store.js";

const ContextInput = z.object({
  projectId: z.uuid().optional(),
  sourceId: z.uuid().optional(),
  /** Current page URL: resolved to an imported source when it matches (FR-MSC-004). */
  url: z.url().optional(),
  /** Active checkpoint: assignment + item give objective and evidence context. */
  assignmentId: z.uuid().optional(),
  itemId: z.uuid().optional(),
});
const StuckInput = ContextInput.extend({
  question: z
    .string()
    .trim()
    .min(3)
    .max(2000)
    .default("Explain the current context, decisions and ownership for this project."),
}).strict();
const InteractionInput = z
  .object({
    trigger: z.enum([
      "suggested",
      "opened",
      "dismissed",
      "helpful",
      "not_helpful",
      "celebrated",
      "escalated",
    ]),
    triggerKey: z
      .enum([
        "TRG-DWELL-STUCK",
        "TRG-QUIZ-FAIL",
        "TRG-NEW-DOMAIN",
        "TRG-CONFLICT-PAGE",
        "TRG-PR-MERGED",
      ])
      .optional(),
    surface: z.enum(["web", "extension", "desktop"]).default("web"),
    latencyMs: z.number().int().min(0).max(600000).optional(),
    rating: z.number().int().min(1).max(5).optional(),
  })
  .strict();
const PROACTIVE_WINDOW_MS = 4 * 3600_000;
const PROACTIVE_CAP = 2;
const HALF_DAY_MS = 12 * 3600_000;
const INTERACTIONS_PER_HOUR = 60;

export function createCompanionRoutes(container: Container) {
  const { db, identity, services } = container;
  const store = createPlatformStore(db);
  const preferencesOf = (actor: Actor) =>
    CompanionPreferencesSchema.parse(
      db.select().from(users).where(eq(users.id, actor.id)).get()?.preferences.companion ?? {},
    );
  const interactions = (actor: Actor, since: number) =>
    db
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
      .filter((row) => row.createdAt.getTime() > since);
  const mentorFor = (actor: Actor) => {
    const plan = store
      .listOwned(actor, "onboarding_plan")
      .find((row) => ["active", "scheduled"].includes(row.status));
    const assignment = store
      .listOwned(actor, "path_assignment")
      .find((row) => typeof row.data.mentorId === "string");
    const mentorId =
      (plan?.data.mentorId as string | undefined) ??
      (assignment?.data.mentorId as string | undefined) ??
      null;
    if (!mentorId) return null;
    const mentor = db.select({ name: users.name }).from(users).where(eq(users.id, mentorId)).get();
    return { mentorId, mentorName: mentor?.name ?? mentorId };
  };
  /** Resolve url / checkpoint / explicit ids into a project and optional source (FR-MSC-004). */
  const resolveScope = (actor: Actor, input: z.infer<typeof ContextInput>) => {
    let projectId = input.projectId;
    let sourceId = input.sourceId;
    let checkpoint: { title: string; objective: string } | null = null;
    if (input.assignmentId && input.itemId) {
      const assignment = store.get(actor, "path_assignment", input.assignmentId);
      if (assignment.ownerId !== actor.id) throw new NotFoundError("Path assignment");
      const version = store.find(actor.workspaceId, "path_version", assignment.parentId!);
      const item = (Array.isArray(version?.data.items) ? version.data.items : []).find(
        (entry) => (entry as { id: string }).id === input.itemId,
      ) as { id: string; title: string; objective: string; sourceId?: string } | undefined;
      if (!item) throw new NotFoundError("Learning item");
      projectId = assignment.projectId ?? projectId;
      sourceId = item.sourceId ?? sourceId;
      checkpoint = { title: item.title, objective: item.objective };
    }
    if (input.url && !sourceId) {
      for (const project of services.projects.list(actor)) {
        const match = db
          .select()
          .from(sourceObjects)
          .where(and(eq(sourceObjects.projectId, project.id), eq(sourceObjects.url, input.url)))
          .get();
        if (match && identity.visibleSourceIds(actor, project.id).includes(match.id)) {
          projectId = project.id;
          sourceId = match.id;
          break;
        }
      }
    }
    if (!projectId)
      throw new BadRequestError("Provide a projectId, a known source url, or a checkpoint");
    const project = identity.requireProject(actor, projectId);
    if (sourceId) identity.requireSource(actor, project.id, sourceId);
    return { project, sourceId, checkpoint };
  };

  return new Hono<AppEnv>()
    .get("/companion/preferences", (c) => c.json(preferencesOf(c.get("actor"))))
    .patch(
      "/companion/preferences",
      zValidator("json", CompanionPreferencesSchema.partial(), validationHook),
      (c) => {
        const user = db
          .select()
          .from(users)
          .where(eq(users.id, c.get("actor").id))
          .get();
        if (!user) throw new NotFoundError("User");
        const merged = CompanionPreferencesSchema.parse({
          ...(user.preferences.companion ?? {}),
          ...c.req.valid("json"),
        });
        db.update(users)
          .set({ preferences: { ...user.preferences, companion: merged } })
          .where(eq(users.id, user.id))
          .run();
        return c.json(merged);
      },
    )
    .get("/companion/context", zValidator("query", ContextInput, validationHook), (c) => {
      const actor = c.get("actor");
      const { project, sourceId, checkpoint } = resolveScope(actor, c.req.valid("query"));
      const items = services.context
        .listItems(project, undefined, actor)
        .filter(
          (item) =>
            !sourceId || item.evidence.some((evidence) => evidence.sourceObjectId === sourceId),
        );
      const conflicts = items.filter(
        (item) => item.conflictsWith.length > 0 || item.verification === "disputed",
      ).length;
      const prompts = checkpoint
        ? [
            `Give me a 3-bullet summary of "${checkpoint.title}"`,
            "Why does this matter for my role?",
            "Who owns this area?",
          ]
        : sourceId
          ? [
              "Explain this document's background",
              "Which decisions does it relate to?",
              "Who is the domain owner here?",
            ]
          : [
              "What is this project's current state?",
              "Which decisions explain how it works?",
              "Who owns this area?",
            ];
      return c.json({
        projectId: project.id,
        projectSlug: project.slug,
        sourceId: sourceId ?? null,
        checkpoint,
        prompts,
        owners: items.filter((item) => item.kind === "person").slice(0, 10),
        decisions: items.filter((item) => item.kind === "decision").slice(0, 10),
        unresolvedConflicts: conflicts,
        suggestedTrigger: conflicts > 0 ? "TRG-CONFLICT-PAGE" : null,
        mentor: mentorFor(actor),
      });
    })
    .post("/companion/stuck-help", zValidator("json", StuckInput, validationHook), async (c) => {
      const actor = c.get("actor");
      const input = c.req.valid("json");
      const { project, sourceId, checkpoint } = resolveScope(actor, input);
      const question =
        checkpoint && input.question.startsWith("Explain the current context")
          ? `Summarise what I need to know for "${checkpoint.title}": ${checkpoint.objective}`
          : input.question;
      const answer = await services.ask.ask(actor, project, { question }, sourceId);
      const bullets = [answer.answer, answer.currentState?.statement, answer.timelineContext]
        .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
        .slice(0, 3);
      const mentor = mentorFor(actor);
      const link = `/projects/${project.slug ?? project.id}${sourceId ? `/sources/${sourceId}` : ""}`;
      return c.json({
        answer,
        bullets,
        escalation: mentor
          ? {
              mentorId: mentor.mentorId,
              mentorName: mentor.mentorName,
              draftMessage: `Hi ${mentor.mentorName}, I'm stuck on ${checkpoint ? `"${checkpoint.title}"` : `a question in ${project.name}`}. Could we do a quick 15-minute walkthrough? ${link}`,
              link,
            }
          : null,
      });
    })
    .post("/companion/interactions", zValidator("json", InteractionInput, validationHook), (c) => {
      const actor = c.get("actor");
      const companion = preferencesOf(actor);
      if (!companion.enabled) throw new AppError(403, "FORBIDDEN", "Companion is disabled");
      const input = c.req.valid("json");
      const now = Date.now();
      if (interactions(actor, now - 3600_000).length >= INTERACTIONS_PER_HOUR)
        throw new AppError(429, "RATE_LIMITED", "Companion interaction limit reached");
      if (input.trigger === "suggested") {
        // AA-1 and FR-MSC-005: no proactive suggestions when on-demand only, snoozed, or over the cap.
        if (companion.onDemandOnly || !companion.proactiveNudges)
          throw new AppError(403, "FORBIDDEN", "Proactive suggestions are off (on-demand only)");
        if (companion.snoozedUntil && Date.parse(companion.snoozedUntil) > now)
          throw new AppError(403, "FORBIDDEN", "Companion is snoozed");
        const recent = interactions(actor, now - PROACTIVE_WINDOW_MS);
        if (recent.filter((row) => row.data.trigger === "suggested").length >= PROACTIVE_CAP)
          throw new AppError(
            429,
            "RATE_LIMITED",
            "Proactive suggestion cap reached for this 4-hour window",
          );
        if (
          interactions(actor, now - HALF_DAY_MS).filter((row) => row.data.trigger === "dismissed")
            .length >= 2
        )
          throw new AppError(429, "RATE_LIMITED", "Companion is dormant after two dismissals");
      }
      return c.json(
        store.create(actor, "companion_interaction", input, { status: "recorded" }),
        201,
      );
    })
    .get(
      "/notifications",
      zValidator(
        "query",
        PageQuerySchema.extend({ unread: z.coerce.boolean().optional() }),
        validationHook,
      ),
      (c) => {
        const actor = c.get("actor");
        const { unread, limit, offset } = c.req.valid("query");
        const now = Date.now();
        const items = store
          .listOwned(actor, "notification", actor.id, 500)
          .filter(
            (row) =>
              (typeof row.data.deliverAfter === "string"
                ? Date.parse(row.data.deliverAfter)
                : row.createdAt.getTime()) <= now,
          )
          .filter((row) => !unread || row.status === "unread");
        return c.json({
          unread: items.filter((row) => row.status === "unread").length,
          items: items.slice(offset, offset + limit),
        });
      },
    )
    .patch("/notifications/:id/read", (c) => {
      const actor = c.get("actor");
      const row = store.get(actor, "notification", c.req.param("id"));
      if (row.ownerId !== actor.id) throw new NotFoundError("Notification");
      return c.json(
        row.status === "read" ? row : store.update(actor, row, row.version, { status: "read" }),
      );
    })
    .post("/notifications/read-all", (c) => {
      const actor = c.get("actor");
      let updated = 0;
      for (const row of store.listOwned(actor, "notification", actor.id, 500))
        if (row.status === "unread") {
          store.patch(row, { status: "read" });
          updated += 1;
        }
      return c.json({ updated });
    })
    .get("/notifications/preferences", (c) =>
      c.json(
        NotificationPreferencesSchema.parse(
          db
            .select()
            .from(users)
            .where(eq(users.id, c.get("actor").id))
            .get()?.preferences.notifications ?? {},
        ),
      ),
    )
    .patch(
      "/notifications/preferences",
      zValidator("json", NotificationPreferencesSchema.partial(), validationHook),
      (c) => {
        const user = db
          .select()
          .from(users)
          .where(eq(users.id, c.get("actor").id))
          .get();
        if (!user) throw new NotFoundError("User");
        const merged = NotificationPreferencesSchema.parse({
          ...(user.preferences.notifications ?? {}),
          ...c.req.valid("json"),
        });
        db.update(users)
          .set({ preferences: { ...user.preferences, notifications: merged } })
          .where(eq(users.id, user.id))
          .run();
        return c.json(merged);
      },
    )
    .get("/projects/:projectId/ask-usage", (c) => {
      // FR-ASK-014: managers see only aggregate counts for their direct reports, never content.
      const actor = c.get("actor");
      const project = identity.requireProject(actor, c.req.param("projectId"));
      if (!["manager", "owner", "admin"].includes(actor.role))
        throw new AppError(403, "FORBIDDEN", "Only managers can read aggregate Ask usage");
      const reports = db
        .select({ user: users, membership: memberships })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.managerId, actor.id)),
        )
        .all();
      return c.json({
        projectId: project.id,
        items: reports.map(({ user }) => ({
          userId: user.id,
          name: user.name,
          questions:
            db
              .select({ total: count() })
              .from(questions)
              .where(and(eq(questions.projectId, project.id), eq(questions.actorId, user.id)))
              .get()?.total ?? 0,
        })),
      });
    });
}
