import { FlagInputSchema, PageQuerySchema } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { assignments, contextItems, projectMemberships, questions } from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { createPlatformStore, type PlatformRecord } from "./store.js";
import { awardReputation } from "./reputation.js";

const FlagUpdate = z
  .object({
    version: z.number().int().positive(),
    status: z.enum(["triaged", "in_progress", "resolved", "rejected", "duplicate"]),
    reason: z.string().trim().max(2000).default(""),
  })
  .strict();
const CorrectionInput = z
  .object({
    type: z.enum(["contextos_note", "supersede"]),
    text: z.string().trim().min(8).max(10000),
    successorId: z.uuid().optional(),
  })
  .strict();
const DecisionInput = z
  .object({
    version: z.number().int().positive(),
    accepted: z.boolean(),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();

export function createKnowledgeRoutes(container: Container) {
  const { db, identity, services, audit } = container;
  const store = createPlatformStore(db);
  const visibleItems = (actor: Actor, projectId: string) =>
    services.context.listItems(identity.requireProject(actor, projectId), undefined, actor);
  const targetExists = (actor: Actor, projectId: string, type: string, targetId: string) => {
    identity.requireProject(actor, projectId);
    if (
      type === "context_item" &&
      !visibleItems(actor, projectId).some((item) => item.id === targetId)
    )
      throw new NotFoundError("Context item");
    if (type === "answer") {
      const answer = db
        .select()
        .from(questions)
        .where(
          and(
            eq(questions.id, targetId),
            eq(questions.projectId, projectId),
            eq(questions.actorId, actor.id),
          ),
        )
        .get();
      const allowed = new Set(identity.visibleSourceIds(actor, projectId));
      if (answer?.sourceIds?.every((id) => allowed.has(id)) !== true)
        throw new NotFoundError("Answer");
    }
    if (type === "overview" && targetId !== projectId)
      throw new BadRequestError("Overview targetId must be the project ID");
  };
  const requireFlagAccess = (actor: Actor, flag: PlatformRecord) => {
    const allowed = new Set(identity.visibleSourceIds(actor, flag.projectId!));
    const dependencies = flag.data.sourceIds;
    if (
      !Array.isArray(dependencies) ||
      !dependencies.every((id) => typeof id === "string" && allowed.has(id))
    )
      throw new NotFoundError("Flag");
    targetExists(actor, flag.projectId!, String(flag.data.targetType), String(flag.data.targetId));
  };
  return new Hono<AppEnv>()
    .post("/flags", zValidator("json", FlagInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const input = c.req.valid("json");
      identity.requireProject(actor, input.projectId);
      targetExists(actor, input.projectId, input.targetType, input.targetId);
      const sourceIds =
        input.targetType === "context_item"
          ? visibleItems(actor, input.projectId)
              .find((item) => item.id === input.targetId)!
              .evidence.map((ref) => ref.sourceObjectId)
          : identity.visibleSourceIds(actor, input.projectId);
      const row = store.create(
        actor,
        "flag",
        { ...input, sourceIds },
        {
          projectId: input.projectId,
          status: "open",
        },
      );
      store.event(actor, "flag.created", { flagId: row.id, projectId: input.projectId });
      audit.record({ actor, action: "flag.create", targetType: "flag", targetId: row.id });
      return c.json(row, 201);
    })
    .get("/flags/queue", (c) => {
      const actor = c.get("actor");
      const items = store
        .list(actor, "flag", 100)
        .filter(
          (flag) =>
            flag.ownerId === actor.id ||
            (flag.projectId &&
              flag.data.targetType !== "answer" &&
              identity.hasAssignment(actor, "domain_owner", flag.projectId)),
        )
        .filter((flag) => {
          try {
            requireFlagAccess(actor, flag);
            return true;
          } catch {
            return false;
          }
        });
      return c.json({ items });
    })
    .patch("/flags/:id", zValidator("json", FlagUpdate, validationHook), (c) => {
      const actor = c.get("actor");
      const row = store.get(actor, "flag", c.req.param("id"));
      identity.requireAssignment(actor, "domain_owner", row.projectId!);
      requireFlagAccess(actor, row);
      const input = c.req.valid("json");
      const transitions: Record<string, string[]> = {
        open: ["triaged", "duplicate", "rejected"],
        triaged: ["in_progress", "rejected"],
        in_progress: ["resolved", "rejected"],
      };
      if (!transitions[row.status]?.includes(input.status))
        throw new AppError(409, "CONFLICT", "Invalid flag transition");
      if (input.status === "rejected" && !input.reason)
        throw new BadRequestError("A rejection reason is required");
      const updated = store.update(actor, row, input.version, {
        status: input.status,
        data: { ...row.data, resolutionReason: input.reason, resolvedBy: actor.id },
      });
      audit.record({
        actor,
        action: "flag.update",
        targetType: "flag",
        targetId: row.id,
        metadata: { status: updated.status },
      });
      return c.json(updated);
    })
    .post("/flags/:id/corrections", zValidator("json", CorrectionInput, validationHook), (c) => {
      const actor = c.get("actor");
      const flag = store.get(actor, "flag", c.req.param("id"));
      const input = c.req.valid("json");
      identity.requireProject(actor, flag.projectId!);
      requireFlagAccess(actor, flag);
      if (["resolved", "rejected", "duplicate"].includes(flag.status))
        throw new AppError(409, "CONFLICT", "This flag is closed");
      if (
        input.type === "supersede" &&
        (!input.successorId ||
          !visibleItems(actor, flag.projectId!).some((item) => item.id === input.successorId))
      )
        throw new BadRequestError("Select an accessible successor claim");
      return c.json(
        store.create(
          actor,
          "correction",
          { ...input, approvals: [], targetId: flag.data.targetId },
          { projectId: flag.projectId!, parentId: flag.id, status: "pending" },
        ),
        201,
      );
    })
    .post("/corrections/:id/verify", zValidator("json", DecisionInput, validationHook), (c) => {
      const actor = c.get("actor");
      const row = store.get(actor, "correction", c.req.param("id"));
      const input = c.req.valid("json");
      identity.requireProject(actor, row.projectId!);
      if (row.ownerId === actor.id)
        throw new AppError(403, "FORBIDDEN", "You cannot verify your own correction");
      if (row.status !== "pending")
        throw new AppError(409, "CONFLICT", "Correction is no longer pending");
      const flag = store.get(actor, "flag", row.parentId!);
      requireFlagAccess(actor, flag);
      const domainOwner = identity.hasAssignment(actor, "domain_owner", row.projectId!);
      const assignedOwner = db
        .select()
        .from(assignments)
        .where(
          and(
            eq(assignments.workspaceId, actor.workspaceId),
            eq(assignments.type, "domain_owner"),
            or(
              eq(assignments.scopeId, row.projectId!),
              and(
                eq(assignments.scopeType, "workspace"),
                eq(assignments.scopeId, actor.workspaceId),
              ),
            ),
            or(isNull(assignments.expiresAt), gt(assignments.expiresAt, new Date())),
          ),
        )
        .get();
      if (
        !domainOwner &&
        (assignedOwner ||
          !db
            .select()
            .from(projectMemberships)
            .where(
              and(
                eq(projectMemberships.projectId, row.projectId!),
                eq(projectMemberships.userId, actor.id),
              ),
            )
            .get())
      )
        throw new AppError(
          403,
          "FORBIDDEN",
          "An assigned domain owner or independent project reviewer is required",
        );
      const approvals = Array.isArray(row.data.approvals)
        ? row.data.approvals.filter((id): id is string => typeof id === "string")
        : [];
      if (approvals.includes(actor.id))
        throw new AppError(409, "CONFLICT", "This reviewer already approved");
      if (!input.accepted && !domainOwner)
        throw new AppError(403, "FORBIDDEN", "Only a domain owner can reject a correction");
      const accepted = input.accepted && (domainOwner || approvals.length >= 1);
      const result = db.transaction(() => {
        const updated = store.update(actor, row, input.version, {
          status: !input.accepted ? "rejected" : accepted ? "accepted" : "pending",
          data: { ...row.data, approvals: [...approvals, actor.id], reason: input.reason },
        });
        if (accepted) {
          if (row.data.type === "supersede")
            db.update(contextItems)
              .set({ verification: "superseded", updatedAt: new Date() })
              .where(
                and(
                  eq(contextItems.id, String(row.data.targetId)),
                  eq(contextItems.projectId, row.projectId!),
                ),
              )
              .run();
          else
            services.sources.create(actor, identity.requireProject(actor, row.projectId!), {
              kind: "note",
              title: "Verified correction",
              content: String(row.data.text),
              visibility: "restricted",
            });
          store.update(actor, flag, flag.version, {
            status: "resolved",
            data: { ...flag.data, correctionId: row.id },
          });
          store.event(actor, "flag.resolved", { flagId: flag.id, correctionId: row.id });
          const selfLoop = flag.ownerId === row.ownerId;
          if (!selfLoop) awardReputation(db, actor, flag.ownerId, "flag_accepted", flag.id);
          const action =
            flag.data.kind === "stale"
              ? "fix_stale"
              : flag.data.kind === "incorrect"
                ? "fix_incorrect"
                : "add_missing_context";
          awardReputation(db, actor, row.ownerId, action, row.id, {
            quality: domainOwner ? 1 : 0.75,
            selfLoop,
          });
        }
        return updated;
      });
      audit.record({
        actor,
        action: "correction.verify",
        targetType: "correction",
        targetId: row.id,
        metadata: { accepted },
      });
      return c.json(result);
    })
    .get("/projects/:projectId/decisions", (c) =>
      c.json({
        items: visibleItems(c.get("actor"), c.req.param("projectId")).filter(
          (item) => item.kind === "decision",
        ),
      }),
    )
    .get("/projects/:projectId/decisions/:id", (c) => {
      const row = visibleItems(c.get("actor"), c.req.param("projectId")).find(
        (item) => item.id === c.req.param("id") && item.kind === "decision",
      );
      if (!row) throw new NotFoundError("Decision");
      return c.json(row);
    })
    .get("/projects/:projectId/timeline", (c) =>
      c.json({
        items: visibleItems(c.get("actor"), c.req.param("projectId")).filter(
          (item) => item.kind === "event" || item.kind === "decision",
        ),
      }),
    )
    .get("/projects/:projectId/current-state", (c) =>
      c.json({
        items: visibleItems(c.get("actor"), c.req.param("projectId")).filter(
          (item) =>
            item.kind === "status_claim" && !["stale", "superseded"].includes(item.verification),
        ),
      }),
    )
    .get("/projects/:projectId/conflicts", (c) =>
      c.json({
        items: visibleItems(c.get("actor"), c.req.param("projectId")).filter(
          (item) => item.conflictsWith.length,
        ),
      }),
    )
    .get(
      "/search",
      zValidator(
        "query",
        PageQuerySchema.extend({ q: z.string().trim().min(2).max(200), projectId: z.uuid() }),
        validationHook,
      ),
      (c) => {
        const { q, projectId, limit, offset } = c.req.valid("query");
        const normalized = q.toLocaleLowerCase();
        return c.json({
          items: visibleItems(c.get("actor"), projectId)
            .filter((item) =>
              `${item.title} ${item.summary}`.toLocaleLowerCase().includes(normalized),
            )
            .slice(offset, offset + limit),
        });
      },
    );
}
