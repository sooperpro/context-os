import {
  PageQuerySchema,
  RedeemInputSchema,
  RedemptionDecisionSchema,
  RewardItemInputSchema,
  RewardItemUpdateSchema,
  TIER_THRESHOLDS,
  type Tier,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { assignments } from "../../db/schema.js";
import { sealCredentials } from "../../lib/credentials.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { requireRole } from "../identity/identity.service.js";
import { createNotifier } from "./notify.js";
import { ledgerSummary, postLedgerEntry } from "./reputation.js";
import { workspaceSettings } from "./settings.js";
import { createPlatformStore, type PlatformRecord } from "./store.js";

/** Rewards catalog and Kudos Credit redemption (PRD §7.12). Off by default (decision D3). */
export function createRewardRoutes(container: Container) {
  const { db, identity, audit, env } = container;
  const store = createPlatformStore(db);
  const notifier = createNotifier(db);
  const requireRewards = (actor: Actor) => {
    const settings = workspaceSettings(db, actor.workspaceId);
    if (!settings.rewards.enabled)
      throw new AppError(409, "CONFLICT", "The rewards catalog is disabled for this workspace");
    return settings;
  };
  const approvers = (workspaceId: string) =>
    db
      .select({ userId: assignments.userId })
      .from(assignments)
      .where(
        and(
          eq(assignments.workspaceId, workspaceId),
          eq(assignments.type, "rewards_approver"),
          or(isNull(assignments.expiresAt), gt(assignments.expiresAt, new Date())),
        ),
      )
      .all()
      .map((row) => row.userId);
  const isApprover = (actor: Actor) =>
    identity.hasAssignment(actor, "rewards_approver", actor.workspaceId);
  const monthStart = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  };
  const eligible = (actor: Actor, item: PlatformRecord, tier: Tier) => {
    const eligibility = (item.data.eligibility ?? {}) as {
      departmentIds?: string[];
      minTier?: Tier;
    };
    const member = identity.requireMember(actor.workspaceId, actor.id);
    if (
      eligibility.departmentIds?.length &&
      !eligibility.departmentIds.includes(String(member.organization.departmentId))
    )
      return false;
    if (eligibility.minTier && TIER_THRESHOLDS[tier] < TIER_THRESHOLDS[eligibility.minTier])
      return false;
    return true;
  };
  const refund = (actor: Actor, redemption: PlatformRecord) => {
    postLedgerEntry(db, {
      workspaceId: actor.workspaceId,
      userId: redemption.ownerId,
      action: "redemption_refund",
      amount: Number(redemption.data.kcAmount),
      currency: "kc",
      sourceId: redemption.id,
      reason: { ruleVersion: "kc-v1", by: actor.id },
      actorId: actor.id,
    });
    const item = store.find(actor.workspaceId, "reward_item", String(redemption.parentId));
    if (item && typeof item.data.stock === "number")
      store.patch(item, { data: { ...item.data, stock: item.data.stock + 1 } });
  };

  return new Hono<AppEnv>()
    .get("/rewards/catalog", (c) => {
      const actor = c.get("actor");
      const settings = requireRewards(actor);
      if (actor.role === "guest")
        throw new AppError(403, "FORBIDDEN", "Guests cannot redeem credits");
      const summary = ledgerSummary(db, actor.workspaceId, actor.id, settings);
      const items = store
        .listWhere(actor.workspaceId, "reward_item", { status: "active" }, 500)
        .map((item) => ({
          ...item,
          eligible: eligible(actor, item, summary.tier),
          affordable: summary.kcBalance >= Number(item.data.kcCost),
        }));
      return c.json({ balance: summary.kcBalance, items });
    })
    .post("/rewards/catalog", zValidator("json", RewardItemInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      requireRole(actor, "owner", "admin");
      const input = c.req.valid("json");
      const row = store.create(actor, "reward_item", input, {
        status: input.isActive ? "active" : "inactive",
      });
      audit.record({
        actor,
        action: "reward_item.create",
        targetType: "reward_item",
        targetId: row.id,
      });
      return c.json(row, 201);
    })
    .patch(
      "/rewards/catalog/:id",
      zValidator("json", RewardItemUpdateSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        requireRole(actor, "owner", "admin");
        const row = store.get(actor, "reward_item", c.req.param("id"));
        const { version, ...patch } = c.req.valid("json");
        const data = { ...row.data, ...patch };
        const updated = store.update(actor, row, version, {
          data,
          status: data.isActive === false ? "inactive" : "active",
        });
        audit.record({
          actor,
          action: "reward_item.update",
          targetType: "reward_item",
          targetId: row.id,
        });
        return c.json(updated);
      },
    )
    .delete("/rewards/catalog/:id", (c) => {
      const actor = c.get("actor");
      requireRole(actor, "owner", "admin");
      const row = store.get(actor, "reward_item", c.req.param("id"));
      store.patch(row, { status: "inactive", data: { ...row.data, isActive: false } });
      audit.record({
        actor,
        action: "reward_item.archive",
        targetType: "reward_item",
        targetId: row.id,
      });
      return c.body(null, 204);
    })
    .post("/rewards/redeem", zValidator("json", RedeemInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const settings = requireRewards(actor);
      if (actor.role === "guest")
        throw new AppError(403, "FORBIDDEN", "Guests cannot redeem credits");
      const input = c.req.valid("json");
      const item = store.get(actor, "reward_item", input.itemId);
      if (item.status !== "active") throw new NotFoundError("Reward item");
      const summary = ledgerSummary(db, actor.workspaceId, actor.id, settings);
      if (!eligible(actor, item, summary.tier))
        throw new AppError(403, "FORBIDDEN", "You are not eligible for this reward");
      const cost = Number(item.data.kcCost);
      if (summary.kcBalance < cost)
        throw new AppError(409, "CONFLICT", "Insufficient Kudos Credits");
      if (typeof item.data.stock === "number" && item.data.stock <= 0)
        throw new AppError(409, "CONFLICT", "This reward is out of stock");
      const cap = settings.rewards.perPersonMonthlyRedemptionCapKc;
      if (cap > 0) {
        const spent = store
          .listOwned(actor, "redemption", actor.id, 500)
          .filter((row) => row.createdAt >= monthStart() && row.status !== "rejected")
          .reduce((sum, row) => sum + Number(row.data.kcAmount), 0);
        if (spent + cost > cap)
          throw new AppError(409, "CONFLICT", "Monthly redemption cap reached");
      }
      let shipping: string | null = null;
      if (input.shipping) {
        if (!env.CONNECTOR_TOKEN_ENCRYPTION_KEY)
          throw new AppError(
            503,
            "NOT_CONFIGURED",
            "Shipping details require the encryption key to be configured",
          );
        shipping = sealCredentials(
          input.shipping,
          env.CONNECTOR_TOKEN_ENCRYPTION_KEY,
          `${actor.workspaceId}:${actor.id}:shipping`,
        );
      }
      const approvalRequired = item.data.approvalRequired !== false;
      const redemption = db.transaction(() => {
        const row = store.create(
          actor,
          "redemption",
          {
            itemId: item.id,
            itemName: item.data.name,
            itemType: item.data.itemType,
            kcAmount: cost,
            note: input.note,
            shipping,
            decisions: [],
            fulfilledAt: null,
          },
          {
            parentId: item.id,
            status: approvalRequired ? "pending_approval" : "fulfilment_pending",
          },
        );
        postLedgerEntry(db, {
          workspaceId: actor.workspaceId,
          userId: actor.id,
          action: "redemption",
          amount: -cost,
          currency: "kc",
          sourceId: row.id,
          reason: { ruleVersion: "kc-v1", itemId: item.id },
          actorId: actor.id,
        });
        if (typeof item.data.stock === "number")
          store.patch(item, { data: { ...item.data, stock: item.data.stock - 1 } });
        return row;
      });
      for (const approver of approvers(actor.workspaceId))
        notifier.notify(actor.workspaceId, approver, {
          type: "redemption.requested",
          category: "system",
          title: `${actor.name} requested "${String(item.data.name)}"`,
          link: `/admin/rewards/redemptions/${redemption.id}`,
        });
      audit.record({
        actor,
        action: "redemption.create",
        targetType: "redemption",
        targetId: redemption.id,
        metadata: { itemId: item.id, kc: cost },
      });
      return c.json(
        { ...redemption, data: { ...redemption.data, shipping: shipping ? "[encrypted]" : null } },
        201,
      );
    })
    .get(
      "/rewards/redemptions",
      zValidator(
        "query",
        PageQuerySchema.extend({ queue: z.coerce.boolean().optional() }),
        validationHook,
      ),
      (c) => {
        const actor = c.get("actor");
        requireRewards(actor);
        const { queue, limit, offset } = c.req.valid("query");
        const rows = queue
          ? isApprover(actor)
            ? store.listWhere(actor.workspaceId, "redemption", {}, 500)
            : []
          : store.listOwned(actor, "redemption", actor.id, 500);
        if (queue && !isApprover(actor))
          throw new AppError(403, "FORBIDDEN", "A rewards approver assignment is required");
        return c.json({
          items: rows.slice(offset, offset + limit).map((row) => ({
            ...row,
            data: { ...row.data, shipping: row.data.shipping ? "[encrypted]" : null },
          })),
        });
      },
    )
    .post(
      "/rewards/redemptions/:id/decide",
      zValidator("json", RedemptionDecisionSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        requireRewards(actor);
        if (!isApprover(actor))
          throw new AppError(403, "FORBIDDEN", "A rewards approver assignment is required");
        const row = store.get(actor, "redemption", c.req.param("id"));
        const input = c.req.valid("json");
        if (row.ownerId === actor.id)
          throw new AppError(403, "FORBIDDEN", "You cannot decide your own redemption");
        const transitions: Record<string, Record<string, string>> = {
          pending_approval: { approve: "fulfilment_pending", reject: "rejected" },
          fulfilment_pending: { fulfil: "fulfilled", reject: "rejected" },
        };
        const next = transitions[row.status]?.[input.decision];
        if (!next) throw new AppError(409, "CONFLICT", "Invalid redemption transition");
        if (input.decision === "reject" && !input.note)
          throw new BadRequestError("A rejection note is required");
        const updated = db.transaction(() => {
          const decisions: unknown[] = Array.isArray(row.data.decisions)
            ? (row.data.decisions as unknown[])
            : [];
          const result = store.update(actor, row, input.version, {
            status: next,
            data: {
              ...row.data,
              decisions: [
                ...decisions,
                {
                  by: actor.id,
                  decision: input.decision,
                  note: input.note,
                  at: new Date().toISOString(),
                },
              ],
              fulfilledAt: next === "fulfilled" ? new Date().toISOString() : row.data.fulfilledAt,
            },
          });
          if (next === "rejected") refund(actor, row);
          return result;
        });
        notifier.notify(actor.workspaceId, row.ownerId, {
          type: `redemption.${next}`,
          category: "system",
          title: `Redemption of "${String(row.data.itemName)}" is now ${next.replaceAll("_", " ")}`,
          body: input.note,
          link: "/rewards/redemptions",
        });
        audit.record({
          actor,
          action: "redemption.decide",
          targetType: "redemption",
          targetId: row.id,
          metadata: { decision: input.decision },
        });
        return c.json({
          ...updated,
          data: { ...updated.data, shipping: updated.data.shipping ? "[encrypted]" : null },
        });
      },
    );
}
