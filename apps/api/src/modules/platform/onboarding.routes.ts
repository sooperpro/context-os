import { randomUUID } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { assignments, memberships, pointsLedger } from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { computeOnboardingHealth } from "./health.js";
import { createNotifier } from "./notify.js";
import { awardReputation } from "./reputation.js";
import { workspaceSettings } from "./settings.js";
import { createPlatformStore, type PlatformRecord } from "./store.js";
import { manages } from "./reports.js";
import { seesEverything } from "../identity/identity.service.js";

const MilestoneInputSchema = z.object({
  key: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  dueOffsetDays: z.number().int().min(0).max(365),
  /** Optional connector trigger that can verify the milestone automatically (FR-PRB-003). */
  eventTrigger: z.string().max(100).optional(),
});
const PlanInput = z
  .object({
    userId: z.string().min(1).max(200),
    mentorId: z.string().min(1).max(200),
    secondaryMentorId: z.string().min(1).max(200).optional(),
    projectId: z.uuid(),
    startDate: z.iso.date(),
    lengthDays: z.number().int().min(1).max(365).optional(),
    milestones: z.array(MilestoneInputSchema).min(1).max(50).optional(),
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
const PauseInput = z
  .object({ version: z.number().int().positive(), pausedUntil: z.iso.date().nullable() })
  .strict();

/** PRD FR-PRB-002 default milestone framework; fully editable per plan. */
export const DEFAULT_MILESTONES = (lengthDays: number) => [
  { key: "day1", title: "Day 1: accounts linked and intro posted", dueOffsetDays: 1 },
  { key: "week1", title: "Week 1: core path modules done, met key people", dueOffsetDays: 7 },
  { key: "day30", title: "Day 30: context path complete", dueOffsetDays: Math.min(30, lengthDays) },
  { key: "first_win", title: "First win achieved", dueOffsetDays: Math.min(60, lengthDays) },
  { key: "day90", title: "Probation review", dueOffsetDays: lengthDays },
];
const MENTOR_GRACE_DAYS = 14;
/**
 * What the person a check-in is about may read of it: what their manager wrote for them and their
 * own response. Ratings, pulse, blockers and the probation recommendation are for the manager and
 * People Ops only (role access spec §3).
 */
const PERSON_CHECKIN_KEYS = [
  "type",
  "wentWell",
  "toImprove",
  "supportNeeded",
  "notes",
  "nextSteps",
  "authorId",
  "publishedAt",
  "employeeResponse",
  "respondedAt",
] as const;
const checkinForPerson = (row: PlatformRecord): PlatformRecord => ({
  ...row,
  data: Object.fromEntries(
    PERSON_CHECKIN_KEYS.flatMap((key) => (key in row.data ? [[key, row.data[key]]] : [])),
  ),
});

export function createOnboardingRoutes(container: Container) {
  const { db, identity, audit } = container;
  const store = createPlatformStore(db);
  const notifier = createNotifier(db);
  const directManager = (actor: Actor, userId: string) =>
    Boolean(identity.requireMember(actor.workspaceId, userId)) && manages(db, actor, userId);
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
      achievedAt?: string;
    }>;
  /** A plan's check-ins as the caller may see them: the person gets only the shared ones, trimmed. */
  const checkinsFor = (actor: Actor, plan: PlatformRecord) => {
    const rows = store.listChildren(actor, "checkin", plan.id);
    if (plan.ownerId !== actor.id) return rows;
    return rows.filter((row) => row.status === "published").map(checkinForPerson);
  };
  const withHealth = (actor: Actor, plan: PlatformRecord) => ({
    ...plan,
    health: computeOnboardingHealth(db, plan, workspaceSettings(db, actor.workspaceId)),
  });
  const addDays = (date: string, days: number) =>
    new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
  const ensureMentorAssignment = (
    actor: Actor,
    mentorId: string,
    learnerId: string,
    endDate: string,
    settings: ReturnType<typeof workspaceSettings>,
  ) => {
    const active = db
      .select()
      .from(assignments)
      .where(
        and(
          eq(assignments.workspaceId, actor.workspaceId),
          eq(assignments.userId, mentorId),
          eq(assignments.type, "mentor"),
        ),
      )
      .all()
      .filter((row) => !row.expiresAt || row.expiresAt > new Date());
    if (active.some((row) => row.scopeId === learnerId)) return;
    if (active.length >= settings.gamification.maxConcurrentMentees)
      throw new AppError(
        409,
        "CONFLICT",
        `This mentor already has ${active.length} concurrent mentees`,
      );
    db.insert(assignments)
      .values({
        id: randomUUID(),
        workspaceId: actor.workspaceId,
        userId: mentorId,
        type: "mentor",
        scopeType: "user",
        scopeId: learnerId,
        // Mentor scope ends with the plan plus 14 days grace (§6.5 rule 3); a plan created
        // after its end date still grants the mentor a full grace window from today.
        expiresAt: new Date(
          Math.max(
            Date.parse(`${addDays(endDate, MENTOR_GRACE_DAYS)}T00:00:00Z`),
            Date.now() + MENTOR_GRACE_DAYS * 86400000,
          ),
        ),
      })
      .run();
  };
  /** Department median TTFW over the trailing 12 months with at least 5 data points (§8.9). */
  const departmentMedianTtfw = (actor: Actor, learnerId: string): number | null => {
    const departmentId = identity.requireMember(actor.workspaceId, learnerId).organization
      .departmentId;
    if (typeof departmentId !== "string") return null;
    const members = new Set(
      db
        .select()
        .from(memberships)
        .where(eq(memberships.workspaceId, actor.workspaceId))
        .all()
        .filter((row) => row.organization.departmentId === departmentId)
        .map((row) => row.userId),
    );
    const since = Date.now() - 365 * 86400000;
    const values = store
      .listWhere(actor.workspaceId, "onboarding_plan", {}, 1000)
      .filter(
        (plan) =>
          plan.ownerId !== learnerId &&
          members.has(plan.ownerId) &&
          typeof plan.data.ttfwDays === "number" &&
          plan.updatedAt.getTime() >= since,
      )
      .map((plan) => Number(plan.data.ttfwDays))
      .sort((a, b) => a - b);
    if (values.length < 5) return null;
    const mid = Math.floor(values.length / 2);
    return values.length % 2 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
  };

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
      if (input.secondaryMentorId)
        identity.requireMember(actor.workspaceId, input.secondaryMentorId);
      if (input.mentorId === input.userId || input.secondaryMentorId === input.userId)
        throw new BadRequestError("Mentor and learner must be different people");
      const settings = workspaceSettings(db, actor.workspaceId);
      const lengthDays = input.lengthDays ?? settings.policies.probationDefaultDays;
      const milestoneInputs = input.milestones ?? DEFAULT_MILESTONES(lengthDays);
      if (
        new Set(milestoneInputs.map((milestone) => milestone.key)).size !== milestoneInputs.length
      )
        throw new BadRequestError("Milestone keys must be unique");
      if (
        store
          .listOwned(actor, "onboarding_plan", input.userId)
          .some((row) => ["active", "scheduled"].includes(row.status))
      )
        throw new AppError(409, "CONFLICT", "This learner already has an active plan");
      const endDate = addDays(input.startDate, lengthDays);
      const plan = db.transaction(() => {
        ensureMentorAssignment(actor, input.mentorId, input.userId, endDate, settings);
        if (input.secondaryMentorId)
          ensureMentorAssignment(actor, input.secondaryMentorId, input.userId, endDate, settings);
        const row = store.create(
          actor,
          "onboarding_plan",
          {
            ...input,
            lengthDays,
            managerId: actor.id,
            endDate,
            pausedUntil: null,
            milestones: milestoneInputs.map((milestone) => ({
              ...milestone,
              dueDate: addDays(input.startDate, milestone.dueOffsetDays),
              status: "pending",
            })),
          },
          {
            ownerId: input.userId,
            projectId: input.projectId,
            status: new Date(`${input.startDate}T00:00:00Z`) > new Date() ? "scheduled" : "active",
          },
        );
        audit.record({
          actor,
          action: "onboarding.create",
          targetType: "onboarding_plan",
          targetId: row.id,
        });
        return row;
      });
      notifier.notify(actor.workspaceId, input.userId, {
        type: "onboarding.plan_assigned",
        category: "onboarding",
        title: "Your onboarding plan is ready",
        link: "/onboarding",
        projectId: input.projectId,
      });
      notifier.notify(actor.workspaceId, input.mentorId, {
        type: "onboarding.mentee_assigned",
        category: "onboarding",
        title: "You are mentoring a new hire",
        link: `/mentor/${input.userId}`,
        projectId: input.projectId,
      });
      return c.json(withHealth(actor, plan), 201);
    })
    .get("/probation/my-plan", (c) =>
      c.json(withHealth(c.get("actor"), planFor(c.get("actor"), c.get("actor").id))),
    )
    .get("/probation/team", (c) => {
      const actor = c.get("actor");
      const plans = store
        .list(actor, "onboarding_plan", 100)
        .filter(
          (plan) =>
            directManager(actor, plan.ownerId) ||
            identity.hasAssignment(actor, "mentor", plan.ownerId),
        )
        .map((plan) => {
          const paths = store.listOwned(actor, "path_assignment", plan.ownerId, 50);
          return {
            ...withHealth(actor, plan),
            relationship: directManager(actor, plan.ownerId) ? "manager" : "mentor",
            paths: {
              total: paths.length,
              completed: paths.filter((row) => row.status === "completed").length,
            },
            firstWin:
              milestones(plan).find((milestone) => milestone.key === "first_win")?.status ?? null,
          };
        });
      return c.json({ items: plans });
    })
    .get("/probation/employees/:userId", (c) =>
      c.json(withHealth(c.get("actor"), planFor(c.get("actor"), c.req.param("userId")))),
    )
    .post(
      "/probation/employees/:userId/pause",
      zValidator("json", PauseInput, validationHook),
      (c) => {
        const actor = c.get("actor");
        const plan = planFor(actor, c.req.param("userId"));
        if (plan.ownerId !== actor.id && !directManager(actor, plan.ownerId))
          throw new AppError(
            403,
            "FORBIDDEN",
            "The employee or their manager can pause health tracking",
          );
        const input = c.req.valid("json");
        const updated = store.update(actor, plan, input.version, {
          data: { ...plan.data, pausedUntil: input.pausedUntil },
        });
        audit.record({
          actor,
          action: "onboarding.pause",
          targetType: "plan",
          targetId: plan.id,
          metadata: { pausedUntil: input.pausedUntil },
        });
        return c.json(withHealth(actor, updated));
      },
    )
    .post(
      "/probation/employees/:userId/checkins",
      zValidator("json", CheckinInput, validationHook),
      (c) => {
        const actor = c.get("actor");
        const plan = planFor(actor, c.req.param("userId"));
        if (!directManager(actor, plan.ownerId))
          throw new AppError(403, "FORBIDDEN", "Only the learner's manager can publish check-ins");
        const row = store.create(
          actor,
          "checkin",
          {
            ...c.req.valid("json"),
            authorId: actor.id,
            employeeResponse: null,
            publishedAt: new Date().toISOString(),
          },
          {
            ownerId: plan.ownerId,
            parentId: plan.id,
            projectId: plan.projectId!,
            status: "published",
          },
        );
        notifier.notify(actor.workspaceId, plan.ownerId, {
          type: "checkin.published",
          category: "onboarding",
          title: "Your manager published a check-in",
          link: `/onboarding/checkins/${row.id}`,
          projectId: plan.projectId ?? undefined,
        });
        return c.json(row, 201);
      },
    )
    .get("/probation/employees/:userId/checkins", (c) => {
      const actor = c.get("actor");
      const plan = planFor(actor, c.req.param("userId"));
      return c.json({ items: checkinsFor(actor, plan) });
    })
    .post(
      "/probation/checkins/:id/respond",
      zValidator("json", ResponseInput, validationHook),
      (c) => {
        const actor = c.get("actor");
        const row = store.get(actor, "checkin", c.req.param("id"));
        // A check-in the manager kept private doesn't exist for the person it's about.
        if (row.ownerId !== actor.id || row.status !== "published")
          throw new NotFoundError("Check-in");
        const input = c.req.valid("json");
        const updated = store.update(actor, row, input.version, {
          data: {
            ...row.data,
            employeeResponse: input.response,
            respondedAt: new Date().toISOString(),
          },
        });
        notifier.notify(actor.workspaceId, String(row.data.authorId), {
          type: "checkin.responded",
          category: "onboarding",
          title: `${actor.name} responded to your check-in`,
          link: `/onboarding/checkins/${row.id}`,
        });
        return c.json(checkinForPerson(updated));
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
        const achievedAt = new Date();
        target.status = "done";
        target.note = input.note;
        target.verifiedBy = actor.id;
        target.achievedAt = achievedAt.toISOString();
        const mentorId = String(plan.data.mentorId);
        const secondary =
          typeof plan.data.secondaryMentorId === "string" ? plan.data.secondaryMentorId : null;
        const extra: Record<string, unknown> = {};
        const result = db.transaction(() => {
          if (input.key === "first_win") {
            const ttfwDays = Math.max(
              0,
              Math.round(
                (achievedAt.getTime() - Date.parse(`${String(plan.data.startDate)}T00:00:00Z`)) /
                  86400000,
              ),
            );
            const median = departmentMedianTtfw(actor, plan.ownerId);
            const fast = median !== null && ttfwDays <= median * 0.8;
            extra.ttfwDays = ttfwDays;
            extra.firstWinAt = achievedAt.toISOString();
            extra.fastFirstWin = fast;
            awardReputation(db, actor, plan.ownerId, "first_win", `${plan.id}:${input.key}`, {
              reason: { fast, ttfwDays },
            });
            // Mentor credit: primary 100%, or 70/30 with a secondary mentor (§8.9).
            awardReputation(
              db,
              actor,
              mentorId,
              "mentee_first_win",
              plan.id,
              secondary ? { amount: 18 } : {},
            );
            if (secondary)
              awardReputation(db, actor, secondary, "mentee_first_win", plan.id, { amount: 7 });
            if (fast) awardReputation(db, actor, mentorId, "mentee_first_win_fast", plan.id);
            store.event(actor, "onboarding.first_win.achieved", {
              userId: plan.ownerId,
              ttfwDays,
              fast,
            });
          } else {
            awardReputation(
              db,
              actor,
              plan.ownerId,
              "onboarding_milestone",
              `${plan.id}:${input.key}`,
            );
            if (input.key === "week1" || input.key === "day30")
              awardReputation(db, actor, mentorId, "mentee_milestone", `${plan.id}:${input.key}`);
          }
          const updated = store.update(actor, plan, input.version, {
            data: { ...plan.data, ...extra, milestones: next },
          });
          store.event(actor, "onboarding.milestone.achieved", {
            planId: plan.id,
            milestoneKey: input.key,
            userId: plan.ownerId,
          });
          return updated;
        });
        notifier.notify(actor.workspaceId, plan.ownerId, {
          type: "milestone.achieved",
          category: "onboarding",
          title: `Milestone reached: ${target.title}`,
          link: "/onboarding",
          projectId: plan.projectId ?? undefined,
        });
        if (actor.id !== String(plan.data.managerId))
          notifier.notify(actor.workspaceId, String(plan.data.managerId), {
            type: "milestone.achieved",
            category: "onboarding",
            title: `${plan.ownerId} reached "${target.title}"`,
            link: `/team/${plan.ownerId}`,
          });
        audit.record({
          actor,
          action: "milestone.verify",
          targetType: "plan",
          targetId: plan.id,
          metadata: { key: input.key },
        });
        return c.json(withHealth(actor, result));
      },
    )
    .get("/probation/employees/:userId/summary", (c) => {
      const actor = c.get("actor");
      const plan = planFor(actor, c.req.param("userId"));
      const paths = store.listOwned(actor, "path_assignment", plan.ownerId, 50);
      const contributions = db
        .select()
        .from(pointsLedger)
        .where(
          and(
            eq(pointsLedger.workspaceId, actor.workspaceId),
            eq(pointsLedger.userId, plan.ownerId),
            eq(pointsLedger.status, "posted"),
          ),
        )
        .all();
      const counts = new Map<string, number>();
      for (const row of contributions) counts.set(row.action, (counts.get(row.action) ?? 0) + 1);
      return c.json({
        userId: plan.ownerId,
        startDate: plan.data.startDate,
        endDate: plan.data.endDate,
        status: plan.status,
        health: computeOnboardingHealth(db, plan, workspaceSettings(db, actor.workspaceId)),
        milestones: milestones(plan),
        firstWin: {
          achievedAt: plan.data.firstWinAt ?? null,
          ttfwDays: plan.data.ttfwDays ?? null,
          fast: plan.data.fastFirstWin ?? false,
        },
        paths: paths.map((row) => ({
          id: row.id,
          title: row.data.title ?? null,
          status: row.status,
          completedAt: row.data.completedAt ?? null,
        })),
        contributions: Object.fromEntries(counts),
        checkins: checkinsFor(actor, plan),
        outcome: plan.data.outcome ?? null,
        decision:
          "A human manager makes the probation decision; ContextOS does not recommend pass or fail.",
      });
    })
    .post(
      "/probation/employees/:userId/outcome",
      zValidator("json", OutcomeInput, validationHook),
      (c) => {
        const actor = c.get("actor");
        // Managers recommend; People Ops (or an owner) records the employment status decision (role
        // access spec §3). HR has no other access to the plan, so it is looked up directly.
        if (actor.role !== "hr" && !seesEverything(actor))
          throw new AppError(
            403,
            "FORBIDDEN",
            "People Ops records the probation outcome; managers send a recommendation",
          );
        const plan = store
          .listOwned(actor, "onboarding_plan", c.req.param("userId"))
          .find((row) => row.status !== "cancelled");
        if (!plan) throw new NotFoundError("Onboarding plan");
        const input = c.req.valid("json");
        if (!["active", "scheduled"].includes(plan.status))
          throw new AppError(409, "CONFLICT", "An outcome is already recorded");
        if (
          input.outcome === "extended" &&
          (!input.newEndDate || input.newEndDate <= String(plan.data.endDate))
        )
          throw new BadRequestError("An extension needs a later end date");
        const result = db.transaction(() => {
          const updated = store.update(actor, plan, input.version, {
            status: input.outcome === "extended" ? "active" : "closed",
            data: {
              ...plan.data,
              outcome: input.outcome,
              outcomeNote: input.note,
              outcomeAt: new Date().toISOString(),
              endDate: input.newEndDate ?? plan.data.endDate,
            },
          });
          const endDate = String(input.newEndDate ?? plan.data.endDate);
          db.update(assignments)
            .set({ expiresAt: new Date(`${addDays(endDate, MENTOR_GRACE_DAYS)}T00:00:00Z`) })
            .where(
              and(
                eq(assignments.workspaceId, actor.workspaceId),
                eq(assignments.type, "mentor"),
                eq(assignments.scopeId, plan.ownerId),
              ),
            )
            .run();
          return updated;
        });
        notifier.notify(actor.workspaceId, plan.ownerId, {
          type: "probation.outcome",
          category: "onboarding",
          title: `Probation outcome recorded: ${input.outcome}`,
          link: "/onboarding",
        });
        audit.record({
          actor,
          action: "onboarding.outcome",
          targetType: "plan",
          targetId: plan.id,
          metadata: { outcome: input.outcome },
        });
        return c.json(withHealth(actor, result));
      },
    );
}
