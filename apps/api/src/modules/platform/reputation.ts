import { randomUUID } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { pointsLedger } from "../../db/schema.js";
import { BadRequestError } from "../../lib/errors.js";
import type { Actor } from "../../types.js";

const BASE = {
  flag_accepted: 5,
  fix_stale: 20,
  fix_incorrect: 25,
  add_missing_context: 20,
  resolve_conflict: 40,
  verify_claim: 2,
  path_published: 30,
  onboarding_milestone: 10,
  first_win: 30,
  path_completed: 20,
  quiz_passed_first_try: 3,
  mentee_first_win: 25,
};
export type ReputationAction = keyof typeof BASE;
export function awardReputation(
  db: Db,
  actor: Actor,
  userId: string,
  action: ReputationAction,
  sourceId: string,
  options: { quality?: number; selfLoop?: boolean; ageDays?: number; viewers?: number } = {},
) {
  const staleActions: ReputationAction[] = ["fix_stale", "resolve_conflict", "verify_claim"];
  const staleness = staleActions.includes(action)
    ? 1 + Math.min(Math.max(options.ageDays ?? 0, 0) / 180, 1)
    : 1;
  const impact = 1 + Math.min(Math.log10(1 + Math.max(options.viewers ?? 0, 0)) / 4, 0.5);
  const quality = options.quality ?? 1;
  if (![0, 0.75, 1].includes(quality))
    throw new BadRequestError("Invalid reputation quality multiplier");
  let amount = Math.round(
    BASE[action] * staleness * impact * quality * (options.selfLoop ? 0.5 : 1),
  );
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const daily = db
    .select({ amount: sql<number>`coalesce(sum(${pointsLedger.amount}), 0)` })
    .from(pointsLedger)
    .where(
      and(
        eq(pointsLedger.workspaceId, actor.workspaceId),
        eq(pointsLedger.userId, userId),
        gte(pointsLedger.createdAt, start),
      ),
    )
    .get()!.amount;
  amount = Math.min(amount, Math.max(0, 150 - daily));
  if (action === "verify_claim") {
    const verification = db
      .select({ amount: sql<number>`coalesce(sum(${pointsLedger.amount}), 0)` })
      .from(pointsLedger)
      .where(
        and(
          eq(pointsLedger.workspaceId, actor.workspaceId),
          eq(pointsLedger.userId, userId),
          eq(pointsLedger.action, action),
          gte(pointsLedger.createdAt, start),
        ),
      )
      .get()!.amount;
    amount = Math.min(amount, Math.max(0, 50 - verification));
  }
  if (amount <= 0) return null;
  return (
    db
      .insert(pointsLedger)
      .values({
        id: randomUUID(),
        workspaceId: actor.workspaceId,
        userId,
        action,
        sourceId,
        amount,
        reason: JSON.stringify({
          ruleVersion: "rp-v1",
          base: BASE[action],
          staleness,
          impact,
          quality,
          selfLoop: options.selfLoop ?? false,
        }),
      })
      .onConflictDoNothing()
      .returning()
      .get() ?? null
  );
}

export function reputationSummary(db: Db, actor: Actor, userId = actor.id) {
  const rows = db
    .select()
    .from(pointsLedger)
    .where(and(eq(pointsLedger.workspaceId, actor.workspaceId), eq(pointsLedger.userId, userId)))
    .all();
  const active = rows
    .filter((row) => row.createdAt.getTime() >= Date.now() - 365 * 86400000)
    .reduce((sum, row) => sum + row.amount, 0);
  const tier =
    active >= 4000
      ? "sage"
      : active >= 1500
        ? "steward"
        : active >= 500
          ? "keeper"
          : active >= 100
            ? "contributor"
            : "explorer";
  return {
    lifetimeRp: rows.reduce((sum, row) => sum + row.amount, 0),
    activeRp: active,
    tier,
    ledger: rows,
  };
}
