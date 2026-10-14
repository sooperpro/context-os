import { randomUUID } from "node:crypto";
import {
  AnomalyDecisionSchema,
  ClawbackInputSchema,
  IdSchema,
  KudosInputSchema,
  LeaderboardQuerySchema,
  PageQuerySchema,
  PointsAdjustmentInputSchema,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq, gte } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { memberships, pointsLedger, users } from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { requireRole } from "../identity/identity.service.js";
import { BADGE_CATALOG, earnedBadges, evaluateBadges } from "./badges.js";
import { createNotifier } from "./notify.js";
import {
  awardReputation,
  ledgerSummary,
  postLedgerEntry,
  reputationSummary,
} from "./reputation.js";
import { workspaceSettings } from "./settings.js";
import { createPlatformStore } from "./store.js";

const KUDOS_PER_MONTH = 5;
const KUDOS_PER_RECIPIENT = 2;
const RISING_STAR_DAYS = 180;

export function createGamificationRoutes(container: Container) {
  const { db, identity, audit } = container;
  const store = createPlatformStore(db);
  const notifier = createNotifier(db);
  const monthStart = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  };
  const quarterStart = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));
  };
  const profile = (actor: Actor, userId: string) => {
    const member = identity.requireMember(actor.workspaceId, userId);
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) throw new NotFoundError("Member");
    const settings = workspaceSettings(db, actor.workspaceId);
    const hidden = user.preferences.hideTier === true && actor.id !== userId;
    const summary = ledgerSummary(db, actor.workspaceId, userId, settings);
    return {
      userId,
      name: user.name,
      role: member.role,
      tier: hidden || !settings.gamification.enabled ? null : summary.tier,
      lifetimeRp: hidden || !settings.gamification.enabled ? null : summary.lifetimeRp,
      activeRp: hidden || !settings.gamification.enabled ? null : summary.activeRp,
      badges: settings.gamification.enabled ? earnedBadges(db, actor.workspaceId, userId) : [],
      mentees: db
        .select()
        .from(pointsLedger)
        .where(
          and(
            eq(pointsLedger.workspaceId, actor.workspaceId),
            eq(pointsLedger.userId, userId),
            eq(pointsLedger.action, "mentee_first_win"),
          ),
        )
        .all().length,
    };
  };

  return new Hono<AppEnv>()
    .get("/gamification/me", (c) => c.json(reputationSummary(db, c.get("actor"))))
    .get("/gamification/badges", (c) => {
      const actor = c.get("actor");
      const earned = new Map(
        earnedBadges(db, actor.workspaceId, actor.id).map((badge) => [badge.key, badge]),
      );
      return c.json({
        items: BADGE_CATALOG.map((badge) => ({ ...badge, earned: earned.get(badge.key) ?? null })),
      });
    })
    .get("/gamification/users/:id", (c) => {
      const actor = c.get("actor");
      if (actor.role === "guest" && actor.id !== c.req.param("id"))
        throw new AppError(403, "FORBIDDEN", "Guests cannot browse profiles");
      return c.json(profile(actor, c.req.param("id")));
    })
    .get(
      "/gamification/leaderboards",
      zValidator("query", LeaderboardQuerySchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const query = c.req.valid("query");
        const settings = workspaceSettings(db, actor.workspaceId);
        if (!settings.gamification.enabled || !settings.gamification.leaderboardsEnabled)
          return c.json({
            enabled: false,
            scope: query.scope,
            window: query.window,
            items: [],
            self: null,
          });
        if (actor.role === "guest")
          throw new AppError(403, "FORBIDDEN", "Guests are excluded from leaderboards");
        const me = db.select().from(users).where(eq(users.id, actor.id)).get();
        if (me?.preferences.leaderboardOptOut === true)
          return c.json({
            enabled: true,
            optedOut: true,
            scope: query.scope,
            window: query.window,
            items: [],
            self: null,
          });
        const mine = identity.requireMember(actor.workspaceId, actor.id);
        const members = db
          .select({ user: users, membership: memberships })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(
            and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.status, "active")),
          )
          .all()
          .filter(
            ({ user, membership }) =>
              membership.role !== "guest" && user.preferences.leaderboardOptOut !== true,
          );
        let pool = members;
        let suppressed: string | null = null;
        if (query.scope === "department") {
          const departmentId =
            query.departmentId ?? (mine.organization.departmentId as string | undefined);
          if (!departmentId) throw new BadRequestError("Choose a department");
          if (settings.gamification.leaderboardDisabledDepartmentIds.includes(departmentId))
            return c.json({
              enabled: false,
              scope: query.scope,
              window: query.window,
              items: [],
              self: null,
              reason: "Leaderboards are disabled for this department",
            });
          pool = members.filter(
            ({ membership }) => membership.organization.departmentId === departmentId,
          );
          if (pool.length < 5) suppressed = "Department leaderboards need at least 5 members";
        } else if (query.scope === "team") {
          const teamId = query.teamId ?? (mine.organization.teamId as string | undefined);
          if (!teamId) throw new BadRequestError("Choose a team");
          pool = members.filter(({ membership }) => membership.organization.teamId === teamId);
        } else if (query.scope === "rising_stars") {
          const cutoff = Date.now() - RISING_STAR_DAYS * 86400000;
          pool = members.filter(({ membership }) => {
            const start = membership.organization.startDate;
            return typeof start === "string" && Date.parse(start) >= cutoff;
          });
        }
        if (suppressed)
          return c.json({
            enabled: true,
            scope: query.scope,
            window: query.window,
            items: [],
            self: null,
            suppressed,
          });
        const since =
          query.window === "month"
            ? monthStart()
            : query.window === "quarter"
              ? quarterStart()
              : new Date(0);
        const rows = db
          .select()
          .from(pointsLedger)
          .where(
            and(
              eq(pointsLedger.workspaceId, actor.workspaceId),
              eq(pointsLedger.currency, "rp"),
              eq(pointsLedger.status, "posted"),
              gte(pointsLedger.createdAt, since),
            ),
          )
          .all();
        const totals = new Map<string, { points: number; lastAt: number }>();
        for (const row of rows) {
          const entry = totals.get(row.userId) ?? { points: 0, lastAt: 0 };
          entry.points += row.amount;
          entry.lastAt = Math.max(entry.lastAt, row.createdAt.getTime());
          totals.set(row.userId, entry);
        }
        const ranked = pool
          .map(({ user }) => ({
            userId: user.id,
            name: user.name,
            hideTier: user.preferences.hideTier === true,
            ...(totals.get(user.id) ?? { points: 0, lastAt: 0 }),
          }))
          .filter((entry) => entry.points > 0)
          // Ties are broken by earlier attainment (PRD §8.5 rule 3).
          .sort((a, b) => b.points - a.points || a.lastAt - b.lastAt);
        const selfIndex = ranked.findIndex((entry) => entry.userId === actor.id);
        return c.json({
          enabled: true,
          scope: query.scope,
          window: query.window,
          participants: pool.length,
          items: ranked.slice(0, 10).map((entry, index) => ({
            rank: index + 1,
            userId: entry.userId,
            name: entry.name,
            points: entry.points,
            tier: entry.hideTier
              ? null
              : ledgerSummary(db, actor.workspaceId, entry.userId, settings).tier,
          })),
          self:
            selfIndex >= 0
              ? { rank: selfIndex + 1, points: ranked[selfIndex]!.points }
              : { rank: null, points: 0 },
        });
      },
    )
    .post("/gamification/kudos", zValidator("json", KudosInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      if (actor.role === "guest") throw new AppError(403, "FORBIDDEN", "Guests cannot give kudos");
      const input = c.req.valid("json");
      if (input.toUserId === actor.id)
        throw new BadRequestError("Kudos cannot be given to yourself (AG-7)");
      identity.requireMember(actor.workspaceId, input.toUserId);
      const given = store
        .listOwned(actor, "kudos", actor.id, 500)
        .filter((row) => row.createdAt >= monthStart());
      if (given.length >= KUDOS_PER_MONTH)
        throw new AppError(
          429,
          "RATE_LIMITED",
          `Kudos budget of ${KUDOS_PER_MONTH} per month is used up`,
        );
      if (given.filter((row) => row.data.toUserId === input.toUserId).length >= KUDOS_PER_RECIPIENT)
        throw new AppError(
          429,
          "RATE_LIMITED",
          `At most ${KUDOS_PER_RECIPIENT} kudos per person per month`,
        );
      const row = store.create(
        actor,
        "kudos",
        { ...input, fromUserId: actor.id },
        { status: "given" },
      );
      awardReputation(db, actor, input.toUserId, "peer_kudos_received", row.id);
      evaluateBadges(db, actor.workspaceId, actor.id);
      notifier.notify(actor.workspaceId, input.toUserId, {
        type: "kudos.received",
        category: "gamification",
        title: `${actor.name} sent you kudos`,
        body: input.message,
        link: "/rewards",
        data: { kudosId: row.id },
      });
      audit.record({
        actor,
        action: "kudos.give",
        targetType: "kudos",
        targetId: row.id,
        metadata: { toUserId: input.toUserId },
      });
      return c.json(row, 201);
    })
    .get(
      "/gamification/kudos",
      zValidator(
        "query",
        PageQuerySchema.extend({ direction: z.enum(["received", "given"]).default("received") }),
        validationHook,
      ),
      (c) => {
        const actor = c.get("actor");
        const { direction, limit, offset } = c.req.valid("query");
        const items =
          direction === "given"
            ? store.listOwned(actor, "kudos", actor.id, 500)
            : store
                .listWhere(actor.workspaceId, "kudos", {}, 1000)
                .filter((row) => row.data.toUserId === actor.id);
        return c.json({ items: items.slice(offset, offset + limit) });
      },
    )
    .post(
      "/gamification/adjustments",
      zValidator("json", PointsAdjustmentInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        requireRole(actor, "owner", "admin");
        const input = c.req.valid("json");
        identity.requireMember(actor.workspaceId, input.userId);
        const row = postLedgerEntry(db, {
          workspaceId: actor.workspaceId,
          userId: input.userId,
          action: "admin_adjustment",
          amount: input.amount,
          currency: input.currency,
          sourceId: randomUUID(),
          reason: { ruleVersion: "rp-v2", note: input.reason, by: actor.id },
          actorId: actor.id,
        });
        audit.record({
          actor,
          action: "points.adjust",
          targetType: "user",
          targetId: input.userId,
          metadata: { amount: input.amount, currency: input.currency, reason: input.reason },
        });
        notifier.notify(actor.workspaceId, input.userId, {
          type: "points.adjusted",
          category: "gamification",
          title: `${input.amount > 0 ? "+" : ""}${input.amount} ${input.currency.toUpperCase()} adjustment`,
          body: input.reason,
          link: "/rewards",
        });
        return c.json(row, 201);
      },
    )
    .post(
      "/gamification/ledger/:id/clawback",
      zValidator("param", z.object({ id: IdSchema }), validationHook),
      zValidator("json", ClawbackInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        requireRole(actor, "owner", "admin");
        const original = db
          .select()
          .from(pointsLedger)
          .where(
            and(
              eq(pointsLedger.id, c.req.valid("param").id),
              eq(pointsLedger.workspaceId, actor.workspaceId),
            ),
          )
          .get();
        if (!original) throw new NotFoundError("Ledger entry");
        if (original.amount <= 0 || original.action === "clawback")
          throw new AppError(409, "CONFLICT", "Only positive awards can be clawed back");
        const row = postLedgerEntry(db, {
          workspaceId: actor.workspaceId,
          userId: original.userId,
          action: "clawback",
          amount: -original.amount,
          currency: original.currency,
          sourceId: original.id,
          reason: {
            ruleVersion: "rp-v2",
            note: c.req.valid("json").reason,
            originalAction: original.action,
            by: actor.id,
          },
          actorId: actor.id,
        });
        if (!row) throw new AppError(409, "CONFLICT", "This entry was already clawed back");
        audit.record({
          actor,
          action: "points.clawback",
          targetType: "ledger",
          targetId: original.id,
          metadata: { reason: c.req.valid("json").reason },
        });
        notifier.notify(actor.workspaceId, original.userId, {
          type: "points.clawback",
          category: "gamification",
          title: `${original.amount} ${original.currency.toUpperCase()} clawed back`,
          body: c.req.valid("json").reason,
          link: "/rewards",
        });
        return c.json(row, 201);
      },
    )
    .get("/gamification/anomalies", (c) => {
      const actor = c.get("actor");
      requireRole(actor, "owner", "admin");
      return c.json({ items: store.listWhere(actor.workspaceId, "anomaly_hold", {}, 200) });
    })
    .post(
      "/gamification/anomalies/:id/decide",
      zValidator("json", AnomalyDecisionSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        requireRole(actor, "owner", "admin");
        const row = store.get(actor, "anomaly_hold", c.req.param("id"));
        if (row.status !== "held")
          throw new AppError(409, "CONFLICT", "This hold was already decided");
        const input = c.req.valid("json");
        const updated = db.transaction(() => {
          if (input.decision === "release")
            postLedgerEntry(db, {
              workspaceId: actor.workspaceId,
              userId: row.ownerId,
              action: String(row.data.action),
              amount: Number(row.data.amount),
              currency: "rp",
              sourceId: String(row.data.sourceId),
              reason: {
                ...(row.data.reason as Record<string, unknown>),
                releasedBy: actor.id,
                hold: row.id,
              },
              actorId: actor.id,
            });
          return store.update(actor, row, input.version, {
            status: input.decision === "release" ? "released" : "rejected",
            data: {
              ...row.data,
              decision: input.decision,
              note: input.note,
              decidedBy: actor.id,
              decidedAt: new Date().toISOString(),
            },
          });
        });
        notifier.notify(actor.workspaceId, row.ownerId, {
          type: `points.hold.${input.decision}`,
          category: "gamification",
          title:
            input.decision === "release"
              ? "Held points were released"
              : "Held points were not awarded",
          body: input.note,
          link: "/rewards",
        });
        audit.record({
          actor,
          action: "anomaly.decide",
          targetType: "anomaly_hold",
          targetId: row.id,
          metadata: { decision: input.decision },
        });
        return c.json(updated);
      },
    );
}
