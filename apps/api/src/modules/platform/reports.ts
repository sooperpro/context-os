import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { memberships } from "../../db/schema.js";
import type { Actor } from "../../types.js";
import { workspaceSettings } from "./settings.js";

/**
 * Who someone manages (decision D5): their direct reports, plus everyone below them when the
 * workspace's "include indirect reports" setting is on. Every manager page and action uses this,
 * so a skip-level manager can do everywhere what they can do anywhere.
 */
export function reportsOf(db: Db, manager: Pick<Actor, "id" | "workspaceId">): string[] {
  const members = db
    .select({ userId: memberships.userId, managerId: memberships.managerId })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, manager.workspaceId), eq(memberships.status, "active")))
    .all();
  const direct = members.filter((row) => row.managerId === manager.id).map((row) => row.userId);
  if (!workspaceSettings(db, manager.workspaceId).includeIndirectReports) return direct;
  const all = new Set(direct);
  let frontier = direct;
  while (frontier.length) {
    const next = members
      .filter((row) => row.managerId && frontier.includes(row.managerId) && !all.has(row.userId))
      .map((row) => row.userId);
    for (const id of next) all.add(id);
    frontier = next;
  }
  all.delete(manager.id);
  return [...all];
}

/** Whether `manager` manages `userId`, by the same rule. */
export function manages(
  db: Db,
  manager: Pick<Actor, "id" | "workspaceId">,
  userId: string,
): boolean {
  return reportsOf(db, manager).includes(userId);
}
