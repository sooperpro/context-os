import { randomUUID } from "node:crypto";
import {
  NotificationPreferencesSchema,
  type NotificationCategory,
  type WorkspaceSettingsState,
} from "@contextos/shared";
import { and, desc, eq, gte } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { memberships, platformRecords, users } from "../../db/schema.js";
import { workspaceSettings } from "./settings.js";

export interface NotificationInput {
  /** Catalog key, e.g. `N8` style keys are mapped to readable types such as `signoff.requested`. */
  type: string;
  category: NotificationCategory;
  title: string;
  body?: string;
  /** Deep link to the exact item (PRD §13 global rule). */
  link?: string;
  data?: Record<string, unknown>;
  /** Notifications sharing a batch key within an hour are merged (FR-NTF-004). */
  batchKey?: string;
  /** Nudges are capped per day and suppressed on weekends / quiet hours. */
  nudge?: boolean;
  projectId?: string;
}

const BATCH_WINDOW_MS = 3600_000;

function hourIn(timezone: string | undefined, at: Date): { hour: number; weekday: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone ?? "UTC",
      hour: "numeric",
      hour12: false,
      weekday: "short",
    }).formatToParts(at);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24;
    const weekdayName = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayName);
    return { hour, weekday: weekday < 0 ? 1 : weekday };
  } catch {
    return { hour: at.getUTCHours(), weekday: at.getUTCDay() };
  }
}

/**
 * Notification producer. The record carries `channels` and `deliverAfter` (quiet hours):
 * email-delivery.ts emails the ones with email on; Slack delivery is not built yet. A record whose
 * in-app channel is off is kept for email and left out of the bell.
 */
export function createNotifier(db: Db) {
  const deliverAfter = (
    userTimezone: string | undefined,
    prefs: ReturnType<typeof NotificationPreferencesSchema.parse>,
    nudge: boolean,
    now: Date,
  ): Date => {
    const { hour, weekday } = hourIn(userTimezone, now);
    const quiet =
      prefs.quietStartHour > prefs.quietEndHour
        ? hour >= prefs.quietStartHour || hour < prefs.quietEndHour
        : hour >= prefs.quietStartHour && hour < prefs.quietEndHour;
    const weekend = nudge && (weekday === 0 || weekday === 6);
    if (!quiet && !weekend) return now;
    // Defer to the next quiet-hours end (and skip the weekend for nudges).
    const next = new Date(now);
    let hoursUntilEnd = (prefs.quietEndHour - hour + 24) % 24 || 24;
    if (weekend) hoursUntilEnd += weekday === 6 ? 24 : 0;
    next.setTime(now.getTime() + hoursUntilEnd * 3600_000);
    return next;
  };

  return {
    notify(
      workspaceId: string,
      userId: string,
      input: NotificationInput,
      settings?: WorkspaceSettingsState,
    ) {
      const user = db.select().from(users).where(eq(users.id, userId)).get();
      if (!user) return null;
      const membership = db
        .select()
        .from(memberships)
        .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)))
        .get();
      if (membership && membership.status !== "active") return null;
      const prefs = NotificationPreferencesSchema.parse(user.preferences.notifications ?? {});
      const category = prefs.categories[input.category as keyof typeof prefs.categories] as
        { inApp: boolean; email: boolean; slack: boolean } | undefined;
      const security = input.category === "security";
      // Settings shows one in-app and one email switch. A category can still turn its own in-app
      // off or its own email on. Security notifications cannot be opted out of.
      const channels = {
        inApp: security || (prefs.inApp && (category?.inApp ?? true)),
        email: prefs.email || (category?.email ?? false),
        slack: category?.slack ?? false,
      };
      if (!channels.inApp && !channels.email && !channels.slack) return null;
      const now = new Date();
      const resolved = settings ?? workspaceSettings(db, workspaceId);
      if (input.nudge) {
        const dayStart = new Date(now);
        dayStart.setUTCHours(0, 0, 0, 0);
        const nudgesToday = db
          .select({ id: platformRecords.id, data: platformRecords.data })
          .from(platformRecords)
          .where(
            and(
              eq(platformRecords.workspaceId, workspaceId),
              eq(platformRecords.ownerId, userId),
              eq(platformRecords.kind, "notification"),
              gte(platformRecords.createdAt, dayStart),
            ),
          )
          .all()
          .filter((row) => row.data.nudge === true).length;
        if (nudgesToday >= resolved.policies.nudges.maxPerDay) return null;
      }
      if (input.batchKey) {
        const existing = db
          .select()
          .from(platformRecords)
          .where(
            and(
              eq(platformRecords.workspaceId, workspaceId),
              eq(platformRecords.ownerId, userId),
              eq(platformRecords.kind, "notification"),
              eq(platformRecords.status, "unread"),
              gte(platformRecords.createdAt, new Date(now.getTime() - BATCH_WINDOW_MS)),
            ),
          )
          .orderBy(desc(platformRecords.createdAt))
          .all()
          .find((row) => row.data.batchKey === input.batchKey);
        if (existing) {
          const count = Number(existing.data.count ?? 1) + 1;
          return db
            .update(platformRecords)
            .set({
              data: { ...existing.data, count, latest: input.title, data: input.data ?? {} },
              updatedAt: now,
            })
            .where(eq(platformRecords.id, existing.id))
            .returning()
            .get();
        }
      }
      const userTimezone =
        typeof user.preferences.timezone === "string" ? user.preferences.timezone : undefined;
      return db
        .insert(platformRecords)
        .values({
          id: randomUUID(),
          workspaceId,
          projectId: input.projectId ?? null,
          kind: "notification",
          ownerId: userId,
          status: "unread",
          data: {
            type: input.type,
            category: input.category,
            title: input.title,
            body: input.body ?? "",
            link: input.link ?? null,
            data: input.data ?? {},
            batchKey: input.batchKey ?? null,
            nudge: input.nudge ?? false,
            count: 1,
            channels,
            // Quiet hours hold back every channel except for security (PRD §13 global rules).
            deliverAfter: (security
              ? now
              : deliverAfter(userTimezone, prefs, input.nudge ?? false, now)
            ).toISOString(),
          },
        })
        .returning()
        .get();
    },
    /**
     * Notify every active member with one of the roles (People Ops reviewers: owner, admin, hr),
     * leaving out the person who caused it.
     */
    notifyRoles(
      workspaceId: string,
      roles: readonly string[],
      input: NotificationInput,
      exceptUserId?: string,
    ) {
      const members = db
        .select({ userId: memberships.userId, role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.status, "active")))
        .all();
      for (const member of members)
        if (
          roles.includes(member.role) &&
          member.userId !== exceptUserId &&
          member.userId !== "system"
        )
          this.notify(workspaceId, member.userId, input);
    },
    /** Notify every active owner/admin in the workspace (system / security events). */
    notifyAdmins(workspaceId: string, input: NotificationInput) {
      const admins = db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.status, "active")))
        .all();
      const rows = db
        .select()
        .from(memberships)
        .where(eq(memberships.workspaceId, workspaceId))
        .all();
      const adminIds = new Set(
        rows.filter((row) => row.role === "owner" || row.role === "admin").map((row) => row.userId),
      );
      for (const admin of admins)
        if (adminIds.has(admin.userId)) this.notify(workspaceId, admin.userId, input);
    },
  };
}
export type Notifier = ReturnType<typeof createNotifier>;
