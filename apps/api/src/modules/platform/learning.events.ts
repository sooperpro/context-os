import type { EventTrigger } from "@contextos/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { identityLinks, memberships, platformRecords, users } from "../../db/schema.js";
import type { Actor } from "../../types.js";
import type { IdentityService } from "../identity/identity.service.js";
import { createNotifier } from "./notify.js";
import { awardReputation } from "./reputation.js";
import { createPlatformStore, type PlatformRecord } from "./store.js";

export interface PathItem {
  id: string;
  type: string;
  title: string;
  required?: boolean;
  verification?: string;
  eventTrigger?: string;
  sourceId?: string;
  sourceIds?: string[];
  estMinutes?: number;
  prerequisites?: string[];
}

export const itemsOf = (record: PlatformRecord): PathItem[] =>
  (Array.isArray(record.data.items) ? record.data.items : []) as PathItem[];

export const dependenciesOf = (item: PathItem): string[] => [
  ...new Set([...(item.sourceIds ?? []), ...(item.sourceId ? [item.sourceId] : [])]),
];

/** Items the learner must complete: required and accessible (inaccessible items auto-convert, PP-8). */
export function requiredItemIds(
  identity: IdentityService,
  learner: Actor,
  projectId: string,
  items: PathItem[],
): string[] {
  const allowed = new Set(identity.visibleSourceIds(learner, projectId));
  return items
    .filter(
      (item) => item.required !== false && dependenciesOf(item).every((id) => allowed.has(id)),
    )
    .map((item) => item.id);
}

/**
 * Close an assignment when every required item is completed: learner earns `path_completed`,
 * the path's curator earns `path_learner_complete` (FR-LRN / §8.2.2).
 */
export function completeAssignmentIfDone(
  db: Db,
  identity: IdentityService,
  learner: Actor,
  assignment: PlatformRecord,
): PlatformRecord | null {
  if (assignment.status !== "active" || !assignment.parentId) return null;
  const store = createPlatformStore(db);
  const version = store.find(assignment.workspaceId, "path_version", assignment.parentId);
  if (!version) return null;
  const required = requiredItemIds(
    identity,
    learner,
    String(assignment.projectId),
    itemsOf(version),
  );
  const completed = new Set(
    store
      .listChildren(learner, "item_progress", assignment.id)
      .filter((row) => row.status === "completed")
      .map((row) => String(row.data.itemId)),
  );
  if (!required.every((id) => completed.has(id))) return null;
  const completedAt = new Date().toISOString();
  const updated = store.patch(assignment, {
    status: "completed",
    data: { ...assignment.data, completedAt },
  });
  awardReputation(db, learner, learner.id, "path_completed", assignment.id);
  const path = version.parentId
    ? store.find(assignment.workspaceId, "learning_path", version.parentId)
    : undefined;
  if (path && path.ownerId !== learner.id) {
    awardReputation(
      db,
      learner,
      path.ownerId,
      "path_learner_complete",
      `${path.id}:${assignment.id}`,
    );
    createNotifier(db).notify(assignment.workspaceId, path.ownerId, {
      type: "path.completed_by_learner",
      category: "gamification",
      title: `A learner completed "${String(path.data.title)}"`,
      link: `/learning/paths/${path.id}`,
      batchKey: `path-completions:${path.id}`,
      projectId: assignment.projectId ?? undefined,
    });
  }
  store.emit(assignment.workspaceId, "path.completed", {
    assignmentId: assignment.id,
    userId: learner.id,
    pathVersionId: version.id,
  });
  return updated;
}

/** Credit the curator for each learner completion of an item (1 RP, capped per path per month). */
export function creditCuratorForItem(
  db: Db,
  learner: Actor,
  assignment: PlatformRecord,
  itemId: string,
): void {
  const store = createPlatformStore(db);
  const version = assignment.parentId
    ? store.find(assignment.workspaceId, "path_version", assignment.parentId)
    : undefined;
  const path = version?.parentId
    ? store.find(assignment.workspaceId, "learning_path", version.parentId)
    : undefined;
  if (!path || path.ownerId === learner.id) return;
  awardReputation(
    db,
    learner,
    path.ownerId,
    "path_item_completed_by_learner",
    `${path.id}:${assignment.id}:${itemId}`,
  );
}

/**
 * Real-work trigger matching (FR-CHK-004): resolve the external identity to confirmed links,
 * then complete matching `event` items in the person's active assignments.
 */
export function matchConnectorEvent(
  db: Db,
  identity: IdentityService,
  params: {
    provider: "slack" | "github" | "jira" | "google";
    externalId?: string;
    externalLogin?: string;
    trigger: EventTrigger;
    ref: string;
  },
): { matched: number; workspaceIds: string[] } {
  const store = createPlatformStore(db);
  const workspaceIds = new Set<string>();
  const links = db
    .select()
    .from(identityLinks)
    .where(and(eq(identityLinks.provider, params.provider), eq(identityLinks.status, "confirmed")))
    .all()
    .filter((link) => {
      const byId = !!params.externalId && link.externalId === params.externalId;
      const byLogin =
        !!params.externalLogin &&
        link.externalLogin?.toLocaleLowerCase() === params.externalLogin.toLocaleLowerCase();
      return byId || byLogin;
    });
  let matched = 0;
  for (const link of links) {
    const member = db
      .select()
      .from(memberships)
      .where(
        and(eq(memberships.workspaceId, link.workspaceId), eq(memberships.userId, link.userId)),
      )
      .get();
    if (member?.status !== "active") continue;
    workspaceIds.add(link.workspaceId);
    const name =
      db.select({ name: users.name }).from(users).where(eq(users.id, link.userId)).get()?.name ??
      link.userId;
    const learner: Actor = {
      id: link.userId,
      name,
      workspaceId: link.workspaceId,
      role: member.role,
    };
    const assignments = db
      .select()
      .from(platformRecords)
      .where(
        and(
          eq(platformRecords.workspaceId, link.workspaceId),
          eq(platformRecords.kind, "path_assignment"),
          eq(platformRecords.ownerId, link.userId),
          eq(platformRecords.status, "active"),
        ),
      )
      .all();
    for (const assignment of assignments) {
      const version = assignment.parentId
        ? store.find(link.workspaceId, "path_version", assignment.parentId)
        : undefined;
      if (!version) continue;
      const progress = store.listChildren(learner, "item_progress", assignment.id);
      for (const item of itemsOf(version).filter(
        (entry) => entry.verification === "event" && entry.eventTrigger === params.trigger,
      )) {
        const row = progress.find((entry) => entry.data.itemId === item.id);
        if (!row || row.status === "completed") continue;
        store.patch(row, {
          status: "completed",
          data: {
            ...row.data,
            completedAt: new Date().toISOString(),
            verificationRef: params.ref,
            verifiedBy: `event:${params.trigger}`,
          },
        });
        store.emit(link.workspaceId, "checkpoint.event.matched", {
          eventType: params.trigger,
          externalActorId: params.externalId ?? params.externalLogin,
          objectRef: params.ref,
          assignmentId: assignment.id,
          itemId: item.id,
        });
        creditCuratorForItem(db, learner, assignment, item.id);
        matched += 1;
      }
      if (matched) completeAssignmentIfDone(db, identity, learner, assignment);
    }
  }
  return { matched, workspaceIds: [...workspaceIds] };
}
