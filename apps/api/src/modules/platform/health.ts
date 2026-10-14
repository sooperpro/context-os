import type { WorkspaceSettingsState } from "@contextos/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { platformRecords } from "../../db/schema.js";
import type { PlatformRecord } from "./store.js";

export type HealthStatus = "on_track" | "needs_attention" | "at_risk" | "paused";

export interface OnboardingHealth {
  status: HealthStatus;
  /** Transparent reasons shown to the employee, manager and mentor alike (FR-PRB-004). */
  reasons: string[];
  signals: {
    overdueMilestones: number;
    requiredItemsDone: number;
    requiredItemsTotal: number;
    pacePercent: number | null;
    expectedPacePercent: number;
    stuckItems: number;
    inactiveBusinessDays: number;
    pendingSignoffHours: number | null;
  };
  waitingOnMentor: boolean;
  pausedUntil: string | null;
  computedAt: string;
}

/** Weekdays strictly after `from` up to and including `to` (bounded to 400 days). */
export function businessDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let days = 0;
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  let guard = 0;
  while (cursor < end && guard++ < 400) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
  }
  return days;
}

export function addBusinessDays(date: Date, count: number): Date {
  const result = new Date(date);
  let remaining = count;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

interface Milestone {
  key: string;
  title: string;
  dueDate: string;
  status: string;
}

/** Transparent onboarding health per PRD §8.8.2. Never a performance rating. */
export function computeOnboardingHealth(
  db: Db,
  plan: PlatformRecord,
  settings: WorkspaceSettingsState,
  now = new Date(),
): OnboardingHealth {
  const computedAt = now.toISOString();
  const pausedUntil = typeof plan.data.pausedUntil === "string" ? plan.data.pausedUntil : null;
  const base = {
    overdueMilestones: 0,
    requiredItemsDone: 0,
    requiredItemsTotal: 0,
    pacePercent: null as number | null,
    expectedPacePercent: 0,
    stuckItems: 0,
    inactiveBusinessDays: 0,
    pendingSignoffHours: null as number | null,
  };
  if (pausedUntil && new Date(pausedUntil) > now)
    return {
      status: "paused",
      reasons: [`Health is paused until ${pausedUntil.slice(0, 10)} (declared leave or OOO)`],
      signals: base,
      waitingOnMentor: false,
      pausedUntil,
      computedAt,
    };
  const milestones = (
    Array.isArray(plan.data.milestones) ? plan.data.milestones : []
  ) as Milestone[];
  const overdue = milestones.filter(
    (milestone) =>
      milestone.status !== "done" &&
      addBusinessDays(new Date(`${milestone.dueDate}T00:00:00Z`), 2) < now,
  );
  const records = (kind: string, filter: { ownerId?: string; parentId?: string }) =>
    db
      .select()
      .from(platformRecords)
      .where(
        and(
          eq(platformRecords.workspaceId, plan.workspaceId),
          eq(platformRecords.kind, kind),
          filter.ownerId ? eq(platformRecords.ownerId, filter.ownerId) : undefined,
          filter.parentId ? eq(platformRecords.parentId, filter.parentId) : undefined,
        ),
      )
      .all();
  const assignments = records("path_assignment", { ownerId: plan.ownerId });
  let requiredTotal = 0;
  let requiredDone = 0;
  const progressRows: PlatformRecord[] = [];
  for (const assignment of assignments) {
    const version = assignment.parentId
      ? db
          .select()
          .from(platformRecords)
          .where(
            and(
              eq(platformRecords.id, assignment.parentId),
              eq(platformRecords.kind, "path_version"),
            ),
          )
          .get()
      : undefined;
    const items = (Array.isArray(version?.data.items) ? version.data.items : []) as Array<{
      id: string;
      required?: boolean;
    }>;
    const progress = records("item_progress", { parentId: assignment.id });
    progressRows.push(...progress);
    const completed = new Set(
      progress.filter((row) => row.status === "completed").map((row) => String(row.data.itemId)),
    );
    for (const item of items.filter((entry) => entry.required !== false)) {
      requiredTotal += 1;
      if (completed.has(item.id)) requiredDone += 1;
    }
  }
  const start = new Date(`${String(plan.data.startDate)}T00:00:00Z`);
  const end = new Date(`${String(plan.data.endDate)}T00:00:00Z`);
  const elapsed =
    end > start
      ? Math.min(
          1,
          Math.max(0, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())),
        )
      : 0;
  const expectedPace = Math.round(elapsed * 100);
  const pace = requiredTotal > 0 ? Math.round((requiredDone / requiredTotal) * 100) : null;
  const paceRatio = pace !== null && expectedPace > 0 ? pace / expectedPace : null;
  const dayIndex = Math.floor((now.getTime() - start.getTime()) / 86400000);
  const stuckCutoff = now.getTime() - settings.policies.nudges.stuckHours * 3600000;
  const stuck = progressRows.filter(
    (row) =>
      row.status === "in_progress" && Date.parse(String(row.data.firstOpenedAt)) < stuckCutoff,
  ).length;
  const checkins = records("checkin", { parentId: plan.id }).filter(
    (row) => typeof row.data.respondedAt === "string",
  );
  const activityTimes = [
    ...progressRows.map((row) => row.updatedAt.getTime()),
    ...checkins.map((row) => Date.parse(String(row.data.respondedAt))),
  ].filter((value) => Number.isFinite(value));
  const lastActivity = activityTimes.length ? new Date(Math.max(...activityTimes)) : start;
  const inactive = now > start ? businessDaysBetween(lastActivity, now) : 0;
  const pendingHours = progressRows
    .filter((row) => row.status === "awaiting_verification")
    .map(
      (row) =>
        (now.getTime() -
          (typeof row.data.signoffRequestedAt === "string"
            ? Date.parse(row.data.signoffRequestedAt)
            : row.updatedAt.getTime())) /
        3600000,
    );
  const pendingSignoffHours = pendingHours.length ? Math.round(Math.max(...pendingHours)) : null;
  const waitingOnMentor =
    pendingSignoffHours !== null &&
    pendingSignoffHours >= settings.policies.nudges.signoffPendingHours;

  const atRisk: string[] = [];
  const attention: string[] = [];
  if (overdue.length >= 2) atRisk.push(`${overdue.length} milestones are overdue`);
  else if (overdue.length === 1) attention.push(`Milestone "${overdue[0]!.title}" is overdue`);
  if (paceRatio !== null && dayIndex > 14 && paceRatio < 0.4)
    atRisk.push(
      `Path pace is ${pace}% of required items versus ${expectedPace}% of plan time elapsed`,
    );
  else if (paceRatio !== null && paceRatio < 0.7)
    attention.push(
      `Path pace is ${pace}% of required items versus ${expectedPace}% of plan time elapsed`,
    );
  if (inactive >= 10) atRisk.push(`No learning activity for ${inactive} business days`);
  else if (inactive >= settings.policies.nudges.inactivityBusinessDays)
    attention.push(`No learning activity for ${inactive} business days`);
  if (stuck >= 2)
    attention.push(
      `${stuck} learning items have been open for more than ${settings.policies.nudges.stuckHours} hours`,
    );
  const reasons = atRisk.length ? [...atRisk, ...attention] : attention;
  if (waitingOnMentor)
    reasons.push("Waiting on mentor sign-off (attributed to the mentor, not the employee)");
  return {
    status: atRisk.length ? "at_risk" : attention.length ? "needs_attention" : "on_track",
    reasons: reasons.length
      ? reasons
      : ["All milestones, pace and activity signals are within range"],
    signals: {
      overdueMilestones: overdue.length,
      requiredItemsDone: requiredDone,
      requiredItemsTotal: requiredTotal,
      pacePercent: pace,
      expectedPacePercent: expectedPace,
      stuckItems: stuck,
      inactiveBusinessDays: inactive,
      pendingSignoffHours,
    },
    waitingOnMentor,
    pausedUntil,
    computedAt,
  };
}
