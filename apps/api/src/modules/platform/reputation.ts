import { randomUUID } from "node:crypto";
import {
  TIER_THRESHOLDS,
  type LedgerCurrency,
  type LedgerStatus,
  type Tier,
  type WorkspaceSettingsState,
} from "@contextos/shared";
import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import {
  domainEvents,
  memberships,
  platformRecords,
  pointsLedger,
  type PointsLedgerRow,
} from "../../db/schema.js";
import { BadRequestError } from "../../lib/errors.js";
import type { Actor } from "../../types.js";
import { BADGE_CATALOG, earnedBadges, evaluateBadges } from "./badges.js";
import { createNotifier } from "./notify.js";
import { workspaceSettings } from "./settings.js";

/** Base point table (PRD §8.2.2 / Appendix C). Admins scale it ±50% via settings. */
export const BASE_POINTS = {
  flag_accepted: 5,
  flag_coreporter: 2,
  fix_stale: 20,
  fix_incorrect: 25,
  add_missing_context: 20,
  resolve_conflict: 40,
  verify_claim: 2,
  verify_sprint_bonus: 15,
  answer_captured: 15,
  ask_promoted: 5,
  path_published: 30,
  path_learner_complete: 10,
  path_item_completed_by_learner: 1,
  mentee_milestone: 10,
  mentee_first_win: 25,
  mentee_first_win_fast: 15,
  /** Bounty rewards are set by the sponsor (10–500); `amount` is required. */
  bounty_completed: 0,
  peer_kudos_received: 3,
  onboarding_milestone: 10,
  first_win: 30,
  path_completed: 20,
  quiz_passed_first_try: 3,
  /** Leaver "capture before you go" contribution (PRD §8.11). */
  knowledge_capture: 10,
} as const;
export type ReputationAction = keyof typeof BASE_POINTS;

const MAINTENANCE_ACTIONS = new Set<ReputationAction>([
  "flag_accepted",
  "flag_coreporter",
  "fix_stale",
  "fix_incorrect",
  "add_missing_context",
  "resolve_conflict",
  "verify_claim",
  "verify_sprint_bonus",
  "answer_captured",
  "ask_promoted",
]);
const STALENESS_ACTIONS = new Set<ReputationAction>([
  "fix_stale",
  "resolve_conflict",
  "verify_claim",
]);
/** Per-action daily caps (Appendix C). */
const DAILY_CAPS: Partial<Record<ReputationAction, number>> = {
  flag_accepted: 50,
  flag_coreporter: 20,
  fix_stale: 100,
  fix_incorrect: 100,
  add_missing_context: 80,
  resolve_conflict: 120,
  verify_claim: 50,
  verify_sprint_bonus: 30,
  answer_captured: 60,
  ask_promoted: 20,
  path_published: 60,
  quiz_passed_first_try: 15,
};
const MONTHLY_CAPS: Partial<Record<ReputationAction, number>> = {
  path_learner_complete: 50,
  peer_kudos_received: 15,
};
/** `path_item_completed_by_learner` is capped per path per month (sourceId prefix = path id). */
const PER_PATH_MONTHLY_CAP = 50;

export interface AwardOptions {
  quality?: number;
  selfLoop?: boolean;
  ageDays?: number;
  viewers?: number;
  /** Explicit RP amount (bounties); replaces the base table value. */
  amount?: number;
  /** Explicit KC amount (bounties); replaces the ratio-derived value. */
  kcAmount?: number;
  /** Hold the award for anomaly review instead of posting it (AG-5 / AG-11). */
  hold?: { rule: string; reason: string };
  /** Extra fields recorded in the ledger reason, e.g. `{ fast: true }`. */
  reason?: Record<string, unknown>;
  skipKc?: boolean;
}

export function tierFor(activeRp: number): Tier {
  const order: Tier[] = ["sage", "steward", "keeper", "contributor", "explorer"];
  return order.find((tier) => activeRp >= TIER_THRESHOLDS[tier]) ?? "explorer";
}

const startOfDay = (now: Date) => {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start;
};
const startOfMonth = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const startOfQuarter = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));

function sumSince(
  db: Db,
  workspaceId: string,
  userId: string,
  since: Date,
  action?: string,
  currency: LedgerCurrency = "rp",
): number {
  return (
    db
      .select({ amount: sql<number>`coalesce(sum(${pointsLedger.amount}), 0)` })
      .from(pointsLedger)
      .where(
        and(
          eq(pointsLedger.workspaceId, workspaceId),
          eq(pointsLedger.userId, userId),
          eq(pointsLedger.currency, currency),
          eq(pointsLedger.status, "posted"),
          gte(pointsLedger.createdAt, since),
          action ? eq(pointsLedger.action, action) : undefined,
        ),
      )
      .get()?.amount ?? 0
  );
}

export interface LedgerEntryInput {
  workspaceId: string;
  userId: string;
  action: string;
  amount: number;
  currency: LedgerCurrency;
  sourceId: string;
  reason: Record<string, unknown>;
  actorId?: string;
  status?: LedgerStatus;
}

/** Low-level append (used by adjustments, clawbacks and redemptions). Never updates rows. */
export function postLedgerEntry(db: Db, input: LedgerEntryInput): PointsLedgerRow | null {
  return (
    db
      .insert(pointsLedger)
      .values({
        id: randomUUID(),
        workspaceId: input.workspaceId,
        userId: input.userId,
        action: input.action,
        amount: input.amount,
        currency: input.currency,
        sourceId: input.sourceId,
        reason: JSON.stringify(input.reason),
        actorId: input.actorId ?? null,
        status: input.status ?? "posted",
      })
      .onConflictDoNothing()
      .returning()
      .get() ?? null
  );
}

/**
 * Post a verified reputation award (PRD §8.2.1 formula, §8.3 caps). Returns the RP row, or
 * null when nothing was posted (duplicate, capped, held, guest without earning rights).
 */
export function awardReputation(
  db: Db,
  actor: Actor,
  userId: string,
  action: ReputationAction,
  sourceId: string,
  options: AwardOptions = {},
): PointsLedgerRow | null {
  const settings = workspaceSettings(db, actor.workspaceId);
  const member = db
    .select()
    .from(memberships)
    .where(and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.userId, userId)))
    .get();
  if (member?.status !== "active") return null;
  if (member.role === "guest" && !settings.gamification.guestsCanEarn) return null;
  const quality = options.quality ?? 1;
  if (![0, 0.75, 1].includes(quality))
    throw new BadRequestError("Invalid reputation quality multiplier");
  const staleness = STALENESS_ACTIONS.has(action)
    ? 1 + Math.min(Math.max(options.ageDays ?? 0, 0) / 180, 1)
    : 1;
  const impact = 1 + Math.min(Math.log10(1 + Math.max(options.viewers ?? 0, 0)) / 4, 0.5);
  const base =
    options.amount ?? Math.round(BASE_POINTS[action] * settings.gamification.basePointScale);
  let amount = Math.round(base * staleness * impact * quality * (options.selfLoop ? 0.5 : 1));
  const now = new Date();
  if (MAINTENANCE_ACTIONS.has(action)) {
    const today = sumSince(db, actor.workspaceId, userId, startOfDay(now));
    amount = Math.min(amount, Math.max(0, settings.gamification.dailyMaintenanceCapRp - today));
  }
  const dailyCap = DAILY_CAPS[action];
  if (dailyCap !== undefined)
    amount = Math.min(
      amount,
      Math.max(0, dailyCap - sumSince(db, actor.workspaceId, userId, startOfDay(now), action)),
    );
  const monthlyCap = MONTHLY_CAPS[action];
  if (monthlyCap !== undefined)
    amount = Math.min(
      amount,
      Math.max(0, monthlyCap - sumSince(db, actor.workspaceId, userId, startOfMonth(now), action)),
    );
  if (action === "path_item_completed_by_learner") {
    const pathId = sourceId.split(":")[0] ?? sourceId;
    const month = db
      .select()
      .from(pointsLedger)
      .where(
        and(
          eq(pointsLedger.workspaceId, actor.workspaceId),
          eq(pointsLedger.userId, userId),
          eq(pointsLedger.action, action),
          gte(pointsLedger.createdAt, startOfMonth(now)),
        ),
      )
      .all()
      .filter((row) => row.sourceId.startsWith(`${pathId}:`))
      .reduce((sum, row) => sum + row.amount, 0);
    amount = Math.min(amount, Math.max(0, PER_PATH_MONTHLY_CAP - month));
  }
  if (amount <= 0) return null;
  const reason = {
    ruleVersion: "rp-v2",
    base,
    staleness,
    impact,
    quality,
    selfLoop: options.selfLoop ?? false,
    ...(options.reason ?? {}),
  };
  const notifier = createNotifier(db);
  if (options.hold) {
    db.insert(platformRecords)
      .values({
        id: randomUUID(),
        workspaceId: actor.workspaceId,
        ownerId: userId,
        kind: "anomaly_hold",
        status: "held",
        data: {
          action,
          sourceId,
          amount,
          currency: "rp",
          reason,
          rule: options.hold.rule,
          explanation: options.hold.reason,
          heldBy: actor.id,
        },
      })
      .run();
    notifier.notify(actor.workspaceId, userId, {
      type: "points.held",
      category: "gamification",
      title: "Points held for review",
      body: options.hold.reason,
      link: "/rewards",
      data: { action, amount, rule: options.hold.rule },
    });
    return null;
  }
  const before = tierFor(
    sumSince(db, actor.workspaceId, userId, new Date(now.getTime() - 365 * 86400000)),
  );
  const row = postLedgerEntry(db, {
    workspaceId: actor.workspaceId,
    userId,
    action,
    amount,
    currency: "rp",
    sourceId,
    reason,
    actorId: actor.id,
  });
  if (!row) return null;
  if (settings.rewards.enabled && !options.skipKc) {
    const kc = options.kcAmount ?? Math.ceil(amount * settings.rewards.kcPerRp);
    const issuedThisMonth =
      db
        .select({ amount: sql<number>`coalesce(sum(${pointsLedger.amount}), 0)` })
        .from(pointsLedger)
        .where(
          and(
            eq(pointsLedger.workspaceId, actor.workspaceId),
            eq(pointsLedger.currency, "kc"),
            eq(pointsLedger.status, "posted"),
            gte(pointsLedger.createdAt, startOfMonth(now)),
            sql`${pointsLedger.amount} > 0`,
          ),
        )
        .get()?.amount ?? 0;
    const cap = settings.rewards.monthlyIssuanceCapKc;
    const allowed = cap > 0 ? Math.max(0, cap - issuedThisMonth) : kc;
    if (kc > 0 && Math.min(kc, allowed) > 0)
      postLedgerEntry(db, {
        workspaceId: actor.workspaceId,
        userId,
        action,
        amount: Math.min(kc, allowed),
        currency: "kc",
        sourceId,
        reason: { ruleVersion: "kc-v1", rp: amount, kcPerRp: settings.rewards.kcPerRp },
        actorId: actor.id,
      });
  }
  db.insert(domainEvents)
    .values({
      id: randomUUID(),
      workspaceId: actor.workspaceId,
      type: "points.posted",
      data: { userId, currency: "rp", amount, actionKey: action, ledgerId: row.id },
    })
    .run();
  const after = tierFor(
    sumSince(db, actor.workspaceId, userId, new Date(now.getTime() - 365 * 86400000)),
  );
  if (TIER_THRESHOLDS[after] > TIER_THRESHOLDS[before]) {
    db.insert(domainEvents)
      .values({
        id: randomUUID(),
        workspaceId: actor.workspaceId,
        type: "tier.upgraded",
        data: { userId, oldTier: before, newTier: after },
      })
      .run();
    notifier.notify(actor.workspaceId, userId, {
      type: "tier.upgraded",
      category: "gamification",
      title: `You reached the ${after} tier`,
      link: "/rewards",
      batchKey: `gamification:${userId}`,
      data: { oldTier: before, newTier: after },
    });
  }
  const badges = evaluateBadges(db, actor.workspaceId, userId);
  for (const badge of badges) {
    const definition = BADGE_CATALOG.find((entry) => entry.key === badge.key);
    notifier.notify(actor.workspaceId, userId, {
      type: "badge.earned",
      category: "gamification",
      title: `Badge earned: ${definition?.name ?? badge.key}`,
      link: "/badges",
      batchKey: `gamification:${userId}`,
      data: { badge: badge.key },
    });
  }
  if (settings.gamification.enabled)
    notifier.notify(actor.workspaceId, userId, {
      type: "points.posted",
      category: "gamification",
      title: `+${amount} reputation for ${action.replaceAll("_", " ")}`,
      link: "/rewards",
      batchKey: `gamification:${userId}`,
      data: { action, amount },
    });
  return row;
}

export interface LedgerSummary {
  lifetimeRp: number;
  activeRp: number;
  monthRp: number;
  quarterRp: number;
  tier: Tier;
  nextTier: { tier: Tier; needed: number } | null;
  kcEarned: number;
  kcSpent: number;
  kcBalance: number;
}

export function ledgerSummary(
  db: Db,
  workspaceId: string,
  userId: string,
  settings: WorkspaceSettingsState = workspaceSettings(db, workspaceId),
  now = new Date(),
): LedgerSummary {
  const rows = db
    .select()
    .from(pointsLedger)
    .where(
      and(
        eq(pointsLedger.workspaceId, workspaceId),
        eq(pointsLedger.userId, userId),
        eq(pointsLedger.status, "posted"),
      ),
    )
    .all();
  const rp = rows.filter((row) => row.currency === "rp");
  const sum = (entries: PointsLedgerRow[]) => entries.reduce((total, row) => total + row.amount, 0);
  const since = (entries: PointsLedgerRow[], date: Date) =>
    entries.filter((row) => row.createdAt.getTime() >= date.getTime());
  const activeRp = sum(since(rp, new Date(now.getTime() - 365 * 86400000)));
  const tier = tierFor(activeRp);
  const order: Tier[] = ["explorer", "contributor", "keeper", "steward", "sage"];
  const next = order[order.indexOf(tier) + 1];
  const kc = rows.filter((row) => row.currency === "kc");
  const expiryMonths = settings.rewards.kcExpiryMonths;
  const expiryCutoff =
    expiryMonths > 0
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - expiryMonths, now.getUTCDate()))
      : null;
  const kcEarned = sum(
    kc.filter((row) => row.amount > 0 && (!expiryCutoff || row.createdAt >= expiryCutoff)),
  );
  const kcSpent = -sum(kc.filter((row) => row.amount < 0));
  return {
    lifetimeRp: sum(rp),
    activeRp,
    monthRp: sum(since(rp, startOfMonth(now))),
    quarterRp: sum(since(rp, startOfQuarter(now))),
    tier,
    nextTier: next ? { tier: next, needed: Math.max(0, TIER_THRESHOLDS[next] - activeRp) } : null,
    kcEarned,
    kcSpent,
    kcBalance: Math.max(0, kcEarned - kcSpent),
  };
}

/** Own ledger view: summary, badges, anomaly holds (AG-11) and the raw entries. */
export function reputationSummary(db: Db, actor: Actor, userId = actor.id) {
  const settings = workspaceSettings(db, actor.workspaceId);
  const summary = ledgerSummary(db, actor.workspaceId, userId, settings);
  const ledger = db
    .select()
    .from(pointsLedger)
    .where(and(eq(pointsLedger.workspaceId, actor.workspaceId), eq(pointsLedger.userId, userId)))
    .all();
  const holds = db
    .select()
    .from(platformRecords)
    .where(
      and(
        eq(platformRecords.workspaceId, actor.workspaceId),
        eq(platformRecords.ownerId, userId),
        eq(platformRecords.kind, "anomaly_hold"),
      ),
    )
    .all();
  return {
    enabled: settings.gamification.enabled,
    rewardsEnabled: settings.rewards.enabled,
    ...summary,
    badges: earnedBadges(db, actor.workspaceId, userId),
    holds,
    ledger,
  };
}
