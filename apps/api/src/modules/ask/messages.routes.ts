import {
  AnswerFeedbackInputSchema,
  IdSchema,
  PromoteAnswerInputSchema,
  PromotionDecisionSchema,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { questions, sourceAccess } from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { createNotifier } from "../platform/notify.js";
import { awardReputation } from "../platform/reputation.js";
import { createPlatformStore } from "../platform/store.js";

const IdParam = z.object({ id: IdSchema });

/** Answer feedback (FR-ASK-008) and promotion to hub FAQ claims (FR-ASK-009). */
export function createMessageRoutes(container: Container) {
  const { db, identity, services, audit } = container;
  const store = createPlatformStore(db);
  const notifier = createNotifier(db);
  // Only the asker can read or rate an answer (decision D1: Ask history is private).
  const ownAnswer = (actor: Actor, id: string) => {
    const row = db
      .select()
      .from(questions)
      .where(and(eq(questions.id, id), eq(questions.actorId, actor.id)))
      .get();
    if (!row) throw new NotFoundError("Answer");
    const project = identity.requireProject(actor, row.projectId);
    const allowed = new Set(identity.visibleSourceIds(actor, project.id));
    if (row.sourceIds?.every((sourceId) => allowed.has(sourceId)) !== true)
      throw new NotFoundError("Answer");
    return { row, project };
  };
  const domainOwnerProjects = (actor: Actor) =>
    services.projects
      .list(actor)
      .filter((project) => identity.hasAssignment(actor, "domain_owner", project.id));
  return new Hono<AppEnv>()
    .post(
      "/ask/messages/:id/feedback",
      zValidator("param", IdParam, validationHook),
      zValidator("json", AnswerFeedbackInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const { row, project } = ownAnswer(actor, c.req.valid("param").id);
        const input = c.req.valid("json");
        if (input.rating === "down" && !input.reason)
          throw new BadRequestError("Choose a reason for a thumbs-down");
        const feedback = { ...input, at: new Date().toISOString() };
        db.update(questions).set({ feedback }).where(eq(questions.id, row.id)).run();
        audit.record({
          actor,
          projectId: project.id,
          action: "answer.feedback",
          targetType: "question",
          targetId: row.id,
          metadata: { rating: input.rating, reason: input.reason ?? null },
        });
        // "Leaked something" is a permission signal for admins; the question content is never shared.
        if (input.reason === "leaked")
          notifier.notifyAdmins(actor.workspaceId, {
            type: "security.answer_leak_reported",
            category: "security",
            title: `An answer in ${project.name} was reported as leaking restricted content`,
            link: `/admin/audit?targetId=${row.id}`,
            data: { questionId: row.id, projectId: project.id },
          });
        return c.json({ id: row.id, feedback });
      },
    )
    .post(
      "/ask/messages/:id/promote",
      zValidator("param", IdParam, validationHook),
      zValidator("json", PromoteAnswerInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        if (actor.role === "guest")
          throw new AppError(403, "FORBIDDEN", "Guests cannot propose hub content");
        const { row, project } = ownAnswer(actor, c.req.valid("param").id);
        const input = c.req.valid("json");
        if (row.answer.confidence === "insufficient" || row.answer.citations.length === 0)
          throw new AppError(409, "CONFLICT", "Only cited answers can be promoted");
        const existing = store
          .listWhere(
            actor.workspaceId,
            "promotion",
            { projectId: project.id, status: "proposed" },
            500,
          )
          .find((entry) => entry.data.questionId === row.id);
        if (existing) return c.json(existing, 200);
        const promotion = store.create(
          actor,
          "promotion",
          {
            questionId: row.id,
            projectId: project.id,
            title: input.title ?? row.question,
            question: row.question,
            answer: row.answer.answer,
            note: input.note ?? "",
            sourceIds: [
              ...new Set(row.answer.citations.map((citation) => citation.sourceObjectId)),
            ],
            decisions: [],
          },
          { projectId: project.id, status: "proposed" },
        );
        audit.record({
          actor,
          projectId: project.id,
          action: "answer.promote",
          targetType: "promotion",
          targetId: promotion.id,
        });
        return c.json(promotion, 201);
      },
    )
    .get("/promotions/queue", (c) => {
      const actor = c.get("actor");
      const owned = new Set(domainOwnerProjects(actor).map((project) => project.id));
      const items = store
        .listWhere(actor.workspaceId, "promotion", {}, 500)
        .filter((row) => row.ownerId === actor.id || (row.projectId && owned.has(row.projectId)))
        .filter((row) => {
          if (!row.projectId) return false;
          try {
            const allowed = new Set(identity.visibleSourceIds(actor, row.projectId));
            const sourceIds = Array.isArray(row.data.sourceIds) ? row.data.sourceIds : [];
            return sourceIds.every((id) => typeof id === "string" && allowed.has(id));
          } catch {
            return false;
          }
        });
      return c.json({ items });
    })
    .post(
      "/promotions/:id/decide",
      zValidator("param", IdParam, validationHook),
      zValidator("json", PromotionDecisionSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const row = store.get(actor, "promotion", c.req.valid("param").id);
        const input = c.req.valid("json");
        const project = identity.requireProject(actor, row.projectId!);
        identity.requireAssignment(actor, "domain_owner", project.id);
        if (row.ownerId === actor.id)
          throw new AppError(403, "FORBIDDEN", "You cannot verify your own proposal");
        if (row.status !== "proposed")
          throw new AppError(409, "CONFLICT", "Proposal is no longer pending");
        // PP-9: the verifier must be able to read the cited sources.
        const allowed = new Set(identity.visibleSourceIds(actor, project.id));
        const sourceIds = (Array.isArray(row.data.sourceIds) ? row.data.sourceIds : []).filter(
          (id): id is string => typeof id === "string",
        );
        if (!sourceIds.every((id) => allowed.has(id)))
          throw new AppError(
            403,
            "FORBIDDEN",
            "You cannot verify a proposal whose sources you cannot access",
          );
        if (!input.accepted && !input.reason)
          throw new BadRequestError("A rejection reason is required");
        const decision = {
          by: actor.id,
          accepted: input.accepted,
          reason: input.reason,
          at: new Date().toISOString(),
        };
        const result = db.transaction(() => {
          const updated = store.update(actor, row, input.version, {
            status: input.accepted ? "accepted" : "rejected",
            data: { ...row.data, decisions: [decision] },
          });
          if (input.accepted) {
            const source = services.sources.create(actor, project, {
              kind: "note",
              title: `FAQ: ${String(row.data.title)}`,
              content: `Question: ${String(row.data.question)}\n\nAnswer: ${String(row.data.answer)}\n\nPromoted from Ask ContextOS; verified by a domain owner.`,
              visibility: "restricted",
            });
            // The asker keeps access to the FAQ note derived from their own answer.
            db.insert(sourceAccess)
              .values({ sourceId: source.id, userId: row.ownerId })
              .onConflictDoNothing()
              .run();
            awardReputation(db, actor, row.ownerId, "ask_promoted", row.id);
            store.event(actor, "answer.promoted", {
              promotionId: row.id,
              sourceId: source.id,
              projectId: project.id,
            });
            store.patch(updated, { data: { ...updated.data, sourceId: source.id } });
          }
          return updated;
        });
        notifier.notify(actor.workspaceId, row.ownerId, {
          type: input.accepted ? "promotion.accepted" : "promotion.rejected",
          category: "maintenance",
          title: input.accepted
            ? "Your answer was added to the hub"
            : "Your hub proposal was declined",
          body: input.reason,
          link: `/projects/${project.slug ?? project.id}`,
          projectId: project.id,
        });
        audit.record({
          actor,
          projectId: project.id,
          action: "promotion.decide",
          targetType: "promotion",
          targetId: row.id,
          metadata: { accepted: input.accepted },
        });
        return c.json({
          ...result,
          sourceId: input.accepted
            ? (store.find(actor.workspaceId, "promotion", row.id)?.data.sourceId ?? null)
            : null,
        });
      },
    );
}
