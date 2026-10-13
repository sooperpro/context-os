import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { awardReputation } from "./reputation.js";
import { createPlatformStore, type PlatformRecord } from "./store.js";

const PlanInput = z
  .object({
    userId: z.string().min(1).max(200),
    mentorId: z.string().min(1).max(200),
    projectId: z.uuid(),
    startDate: z.iso.date(),
    lengthDays: z.number().int().min(1).max(365).default(90),
    milestones: z
      .array(
        z.object({
          key: z.string().min(1).max(100),
          title: z.string().min(1).max(200),
          dueOffsetDays: z.number().int().min(0).max(365),
        }),
      )
      .min(1)
      .max(50),
  })
  .strict();
const CheckinInput = z
  .object({
    wentWell: z.string().trim().max(4000),
    toImprove: z.string().trim().max(4000),
    supportNeeded: z.string().trim().max(4000),
  })
  .strict();
const ResponseInput = z
  .object({ version: z.number().int().positive(), response: z.string().trim().min(1).max(4000) })
  .strict();
const MilestoneInput = z
  .object({
    version: z.number().int().positive(),
    key: z.string().min(1).max(100),
    note: z.string().trim().min(1).max(2000),
  })
  .strict();
const OutcomeInput = z
  .object({
    version: z.number().int().positive(),
    outcome: z.enum(["confirmed", "extended", "other"]),
    note: z.string().trim().min(1).max(4000),
    newEndDate: z.iso.date().optional(),
  })
  .strict();

export function createOnboardingRoutes(container: Container) {
  const { db, identity, audit } = container;
  const store = createPlatformStore(db);
  const directManager = (actor: Actor, userId: string) =>
    identity.requireMember(actor.workspaceId, userId).managerId === actor.id;
  const visible = (actor: Actor, plan: PlatformRecord) =>
    plan.ownerId === actor.id ||
    directManager(actor, plan.ownerId) ||
    identity.hasAssignment(actor, "mentor", plan.ownerId);
  const planFor = (actor: Actor, userId: string) => {
    const row = store
      .listOwned(actor, "onboarding_plan", userId)
      .find((plan) => plan.status !== "cancelled");
    if (!row || !visible(actor, row)) throw new NotFoundError("Onboarding plan");
    identity.requireProject(actor, row.projectId!);
    return row;
  };
  const milestones = (row: PlatformRecord) =>
    row.data.milestones as Array<{
      key: string;
      title: string;
      dueDate: string;
      status: string;
      note?: string;
      verifiedBy?: string;
    }>;
  return new Hono<AppEnv>()
    .post("/probation/plans", zValidator("json", PlanInput, validationHook), (c) => {
      const actor = c.get("actor");
      const input = c.req.valid("json");
      identity.requireProject(actor, input.projectId);
      if (!directManager(actor, input.userId))
        throw new AppError(
          403,
          "FORBIDDEN",
          "Only the learner's manager can create their onboarding plan",
        );
      identity.requireMember(actor.workspaceId, input.mentorId);
      if (input.mentorId === input.userId)
        throw new BadRequestError("Mentor and learner must be different people");
      if (
        new Set(input.milestones.map((milestone) => milestone.key)).size !== input.milestones.length
      )
        throw new BadRequestError("Milestone keys must be unique");
      if (
        store
          .listOwned(actor, "onboarding_plan", input.userId)
          .some((row) => ["active", "scheduled"].includes(row.status))
      )
        throw new AppError(409, "CONFLICT", "This learner already has an active plan");
      const start = new Date(`${input.startDate}T00:00:00Z`);
      const endDate = new Date(start.getTime() + input.lengthDays * 86400000)
        .toISOString()
        .slice(0, 10);
      const plan = store.create(
        actor,
        "onboarding_plan",
        {
          ...input,
          managerId: actor.id,
          endDate,
          milestones: input.milestones.map((milestone) => ({
            ...milestone,
            dueDate: new Date(start.getTime() + milestone.dueOffsetDays * 86400000)
              .toISOString()
              .slice(0, 10),
            status: "pending",
          })),
        },
        {
          ownerId: input.userId,
          projectId: input.projectId,
          status: start > new Date() ? "scheduled" : "active",
        },
      );
      audit.record({
        actor,
        action: "onboarding.create",
        targetType: "onboarding_plan",
        targetId: plan.id,
      });
      return c.json(plan, 201);
    })
    .get("/probation/my-plan", (c) => c.json(planFor(c.get("actor"), c.get("actor").id)))
    .get("/probation/team", (c) => {
      const actor = c.get("actor");
      const plans = store
        .list(actor, "onboarding_plan", 100)
        .filter((plan) => directManager(actor, plan.ownerId));
      return c.json({ items: plans });
    })
    .get("/probation/employees/:userId", (c) =>
      c.json(planFor(c.get("actor"), c.req.param("userId"))),
    )
    .post(
      "/probation/employees/:userId/checkins",
      zValidator("json", CheckinInput, validationHook),
      (c) => {
        const actor = c.get("actor");
        const plan = planFor(actor, c.req.param("userId"));
        if (!directManager(actor, plan.ownerId))
          throw new AppError(403, "FORBIDDEN", "Only the learner's manager can publish check-ins");
        return c.json(
          store.create(
            actor,
            "checkin",
            { ...c.req.valid("json"), authorId: actor.id, employeeResponse: null },
            {
              ownerId: plan.ownerId,
              parentId: plan.id,
              projectId: plan.projectId!,
              status: "published",
            },
          ),
          201,
        );
      },
    )
    .get("/probation/employees/:userId/checkins", (c) => {
      const actor = c.get("actor");
      const plan = planFor(actor, c.req.param("userId"));
      return c.json({ items: store.listChildren(actor, "checkin", plan.id) });
    })
    .post(
      "/probation/checkins/:id/respond",
      zValidator("json", ResponseInput, validationHook),
      (c) => {
        const actor = c.get("actor");
        const row = store.get(actor, "checkin", c.req.param("id"));
        if (row.ownerId !== actor.id) throw new NotFoundError("Check-in");
        const input = c.req.valid("json");
        return c.json(
          store.update(actor, row, input.version, {
            data: {
              ...row.data,
              employeeResponse: input.response,
              respondedAt: new Date().toISOString(),
            },
          }),
        );
      },
    )
    .post(
      "/probation/employees/:userId/milestones/verify",
      zValidator("json", MilestoneInput, validationHook),
      (c) => {
        const actor = c.get("actor");
        const plan = planFor(actor, c.req.param("userId"));
        const input = c.req.valid("json");
        if (
          plan.ownerId === actor.id ||
          (!directManager(actor, plan.ownerId) &&
            !identity.hasAssignment(actor, "mentor", plan.ownerId))
        )
          throw new AppError(
            403,
            "FORBIDDEN",
            "Independent mentor or manager sign-off is required",
          );
        if (!["active", "scheduled"].includes(plan.status))
          throw new AppError(409, "CONFLICT", "The plan is closed");
        const next = milestones(plan);
        const target = next.find((milestone) => milestone.key === input.key);
        if (!target) throw new NotFoundError("Milestone");
        if (target.status === "done")
          throw new AppError(409, "CONFLICT", "Milestone is already verified");
        target.status = "done";
        target.note = input.note;
        target.verifiedBy = actor.id;
        const result = db.transaction(() => {
          const updated = store.update(actor, plan, input.version, {
            data: { ...plan.data, milestones: next },
          });
          awardReputation(
            db,
            actor,
            plan.ownerId,
            input.key === "first_win" ? "first_win" : "onboarding_milestone",
            `${plan.id}:${input.key}`,
          );
          if (input.key === "first_win")
            awardReputation(db, actor, String(plan.data.mentorId), "mentee_first_win", plan.id);
          store.event(actor, "onboarding.milestone.achieved", {
            planId: plan.id,
            key: input.key,
            userId: plan.ownerId,
          });
          return updated;
        });
        audit.record({
          actor,
          action: "milestone.verify",
          targetType: "plan",
          targetId: plan.id,
          metadata: { key: input.key },
        });
        return c.json(result);
      },
    )
    .get("/probation/employees/:userId/summary", (c) => {
      const actor = c.get("actor");
      const plan = planFor(actor, c.req.param("userId"));
      return c.json({
        userId: plan.ownerId,
        startDate: plan.data.startDate,
        endDate: plan.data.endDate,
        milestones: milestones(plan),
        checkins: store.listChildren(actor, "checkin", plan.id),
        decision:
          "A human manager makes the probation decision; ContextOS does not recommend pass or fail.",
      });
    })
    .post(
      "/probation/employees/:userId/outcome",
      zValidator("json", OutcomeInput, validationHook),
      (c) => {
        const actor = c.get("actor");
        const plan = planFor(actor, c.req.param("userId"));
        if (!directManager(actor, plan.ownerId))
          throw new AppError(403, "FORBIDDEN", "Only the learner's manager can record an outcome");
        const input = c.req.valid("json");
        if (!["active", "scheduled"].includes(plan.status))
          throw new AppError(409, "CONFLICT", "An outcome is already recorded");
        if (
          input.outcome === "extended" &&
          (!input.newEndDate || input.newEndDate <= String(plan.data.endDate))
        )
          throw new BadRequestError("An extension needs a later end date");
        const result = store.update(actor, plan, input.version, {
          status: input.outcome === "extended" ? "active" : "closed",
          data: {
            ...plan.data,
            outcome: input.outcome,
            outcomeNote: input.note,
            endDate: input.newEndDate ?? plan.data.endDate,
          },
        });
        audit.record({
          actor,
          action: "onboarding.outcome",
          targetType: "plan",
          targetId: plan.id,
        });
        return c.json(result);
      },
    );
}
