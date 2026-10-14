import { and, eq, lt, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import {
  assignments,
  connectorConnections,
  connectorScopes,
  memberships,
  users,
  workspaces,
} from "../../db/schema.js";
import type { Logger } from "../../lib/logger.js";
import type { JobQueue } from "../jobs/jobs.queue.js";
import type { BountyService } from "./bounties.js";
import { addBusinessDays, businessDaysBetween } from "./health.js";
import { createNotifier } from "./notify.js";
import { resolveSettings } from "./settings.js";
import { createPlatformStore } from "./store.js";

export interface SweepDeps {
  db: Db;
  bounties: BountyService;
  logger: Logger;
  /** Optional so callers that only need the maintenance effects can omit it. */
  queue?: JobQueue;
}

export interface SweepReport {
  bountiesExpired: number;
  stuckNudges: number;
  overdueMilestones: number;
  signoffEscalations: number;
  invitationsExpired: number;
  plansActivated: number;
  reviewsDue: number;
  continuityBounties: number;
  flagsEscalated: number;
  workspacesPurged: number;
  connectorSyncsQueued: number;
}

/** How long after the last requested sync a scope is due again (FR-INT-007 polling fallback). */
const SYNC_INTERVAL_MS = { "15m": 15 * 60_000, hourly: 3_600_000, daily: 86_400_000 } as const;

const OWNERSHIP_BOUNTY_RP = 30;
const OWNERSHIP_GRACE_DAYS = 7;
const FLAG_ESCALATION_BUSINESS_DAYS = 10;

/**
 * Background maintenance per PRD §8.1.3, §8.8.3, §8.11, §13 and FR-ADM-008. Runs between
 * job polls; every effect is idempotent (marker fields on the affected record).
 */
export function createSweeps({ db, bounties, logger, queue }: SweepDeps) {
  const store = createPlatformStore(db);
  const notifier = createNotifier(db);
  const today = () => new Date().toISOString().slice(0, 10);

  return {
    run(now = new Date()): SweepReport {
      const report: SweepReport = {
        bountiesExpired: 0,
        stuckNudges: 0,
        overdueMilestones: 0,
        signoffEscalations: 0,
        invitationsExpired: 0,
        plansActivated: 0,
        reviewsDue: 0,
        continuityBounties: 0,
        flagsEscalated: 0,
        workspacesPurged: 0,
        connectorSyncsQueued: 0,
      };
      // Selected connector scopes re-sync on their schedule while their account is connected.
      if (queue)
        for (const { scope, connection } of db
          .select({ scope: connectorScopes, connection: connectorConnections })
          .from(connectorScopes)
          .innerJoin(
            connectorConnections,
            eq(connectorConnections.id, connectorScopes.connectionId),
          )
          .where(
            and(
              eq(connectorScopes.isExcluded, false),
              eq(connectorConnections.status, "connected"),
            ),
          )
          .all()) {
          if (scope.status === "needs_reauth") continue;
          const last = scope.lastSyncRequestedAt?.getTime() ?? 0;
          if (now.getTime() - last < SYNC_INTERVAL_MS[scope.syncFrequency]) continue;
          db.update(connectorScopes)
            .set({
              lastSyncRequestedAt: now,
              status: scope.lastSyncedAt ? scope.status : "backfilling",
            })
            .where(eq(connectorScopes.id, scope.id))
            .run();
          queue.enqueue({
            projectId: scope.projectId,
            type: "sync_connector",
            payload: { connectionId: connection.id, scopeId: scope.id },
            subject: scope.name,
            dedupe: true,
          });
          report.connectorSyncsQueued += 1;
        }
      for (const workspace of db.select().from(workspaces).all()) {
        const settings = resolveSettings(workspace.settings);
        // FR-ADM-008: owner-scheduled deletion with a 7-day grace period.
        if (settings.deletion && Date.parse(settings.deletion.scheduledAt) <= now.getTime()) {
          // The ledger is append-only for everyone except a full workspace purge, which is the
          // one sanctioned hard delete (FR-ADM-008). Audit rows have no FK and are retained.
          db.transaction(() => {
            db.run(sql`DROP TRIGGER IF EXISTS points_ledger_no_delete`);
            db.delete(workspaces).where(eq(workspaces.id, workspace.id)).run();
            db.run(
              sql`CREATE TRIGGER points_ledger_no_delete BEFORE DELETE ON points_ledger BEGIN SELECT RAISE(ABORT, 'points ledger is append-only'); END`,
            );
          });
          report.workspacesPurged += 1;
          logger.warn(
            { workspaceId: workspace.id },
            "Workspace purged after deletion grace period",
          );
          continue;
        }
        const workspaceId = workspace.id;
        report.bountiesExpired += bounties.expireDue(workspaceId, now);

        // Stuck items (48 h after first open) nudge the mentor once (N4, FR-PRB-005).
        const stuckCutoff = now.getTime() - settings.policies.nudges.stuckHours * 3600000;
        for (const progress of store.listWhere(
          workspaceId,
          "item_progress",
          { status: "in_progress" },
          5000,
        )) {
          if (
            progress.data.stuckNotifiedAt ||
            Date.parse(String(progress.data.firstOpenedAt)) >= stuckCutoff
          )
            continue;
          const assignment = progress.parentId
            ? store.find(workspaceId, "path_assignment", progress.parentId)
            : undefined;
          const mentorId =
            typeof assignment?.data.mentorId === "string" ? assignment.data.mentorId : null;
          const learner = db
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, progress.ownerId))
            .get();
          store.patch(progress, { data: { ...progress.data, stuckNotifiedAt: now.toISOString() } });
          store.emit(workspaceId, "onboarding.stuck.detected", {
            userId: progress.ownerId,
            itemId: progress.data.itemId,
            hoursStuck: Math.round(
              (now.getTime() - Date.parse(String(progress.data.firstOpenedAt))) / 3600000,
            ),
          });
          if (mentorId)
            notifier.notify(
              workspaceId,
              mentorId,
              {
                type: "item.stuck",
                category: "onboarding",
                title: `${learner?.name ?? "A learner"} might need help with a learning item`,
                body: "Suggested: a 15-minute walkthrough.",
                link: `/learning/assignments/${String(assignment?.id)}`,
                nudge: true,
                projectId: progress.projectId ?? undefined,
              },
              settings,
            );
          report.stuckNudges += 1;
        }

        // Sign-off pending > 72 h escalates to the other party (FR-CHK-005, N9).
        const signoffCutoff =
          now.getTime() - settings.policies.nudges.signoffPendingHours * 3600000;
        for (const progress of store.listWhere(
          workspaceId,
          "item_progress",
          { status: "awaiting_verification" },
          5000,
        )) {
          const requestedAt =
            typeof progress.data.signoffRequestedAt === "string"
              ? Date.parse(progress.data.signoffRequestedAt)
              : progress.updatedAt.getTime();
          if (progress.data.escalatedTo || requestedAt >= signoffCutoff) continue;
          const learnerMember = db
            .select()
            .from(memberships)
            .where(
              and(
                eq(memberships.workspaceId, workspaceId),
                eq(memberships.userId, progress.ownerId),
              ),
            )
            .get();
          const assignment = progress.parentId
            ? store.find(workspaceId, "path_assignment", progress.parentId)
            : undefined;
          const mentorId =
            typeof assignment?.data.mentorId === "string" ? assignment.data.mentorId : null;
          const requestedFrom =
            typeof progress.data.requestedFrom === "string" ? progress.data.requestedFrom : "";
          const other = requestedFrom === mentorId ? learnerMember?.managerId : mentorId;
          store.patch(progress, {
            data: {
              ...progress.data,
              escalatedTo: other ?? "none",
              escalatedAt: now.toISOString(),
            },
          });
          if (other)
            notifier.notify(
              workspaceId,
              other,
              {
                type: "signoff.escalated",
                category: "onboarding",
                title: "A sign-off request has been pending for more than 72 hours",
                link: `/learning/signoffs/${progress.id}`,
                nudge: true,
              },
              settings,
            );
          report.signoffEscalations += 1;
        }

        for (const plan of store.listWhere(workspaceId, "onboarding_plan", {}, 2000)) {
          // Scheduled → Active on the start date (§8.1.6).
          if (plan.status === "scheduled" && String(plan.data.startDate) <= today()) {
            store.patch(plan, { status: "active" });
            report.plansActivated += 1;
            continue;
          }
          if (plan.status !== "active") continue;
          if (
            typeof plan.data.pausedUntil === "string" &&
            Date.parse(plan.data.pausedUntil) > now.getTime()
          )
            continue;
          const milestones = (
            Array.isArray(plan.data.milestones) ? plan.data.milestones : []
          ) as Array<Record<string, unknown>>;
          let changed = false;
          for (const milestone of milestones) {
            if (milestone.status === "done") continue;
            const due = new Date(`${String(milestone.dueDate)}T00:00:00Z`);
            if (addBusinessDays(due, 2) >= now) continue;
            const notifiedAt =
              typeof milestone.overdueNotifiedAt === "string"
                ? Date.parse(milestone.overdueNotifiedAt)
                : null;
            if (notifiedAt === null) {
              milestone.overdueNotifiedAt = now.toISOString();
              changed = true;
              for (const recipient of [plan.ownerId, String(plan.data.mentorId)])
                notifier.notify(
                  workspaceId,
                  recipient,
                  {
                    type: "milestone.overdue",
                    category: "onboarding",
                    title: `Milestone overdue: ${String(milestone.title)}`,
                    link: "/onboarding",
                    nudge: true,
                    projectId: plan.projectId ?? undefined,
                  },
                  settings,
                );
              report.overdueMilestones += 1;
            } else if (!milestone.managerNotifiedAt && now.getTime() - notifiedAt >= 5 * 86400000) {
              milestone.managerNotifiedAt = now.toISOString();
              changed = true;
              notifier.notify(
                workspaceId,
                String(plan.data.managerId),
                {
                  type: "milestone.overdue",
                  category: "onboarding",
                  title: `Milestone still overdue for ${plan.ownerId}: ${String(milestone.title)}`,
                  link: `/team/${plan.ownerId}`,
                  nudge: true,
                },
                settings,
              );
            }
          }
          // Probation end minus 7 days: summary ready (N12).
          const endDate = new Date(`${String(plan.data.endDate)}T00:00:00Z`);
          if (!plan.data.reviewDueNotifiedAt && endDate.getTime() - now.getTime() <= 7 * 86400000) {
            plan.data.reviewDueNotifiedAt = now.toISOString();
            changed = true;
            for (const recipient of [plan.ownerId, String(plan.data.managerId)])
              notifier.notify(
                workspaceId,
                recipient,
                {
                  type: "probation.summary_ready",
                  category: "onboarding",
                  title: "Probation summary is ready",
                  link: `/probation/${plan.ownerId}/summary`,
                },
                settings,
              );
            report.reviewsDue += 1;
          }
          if (changed) store.patch(plan, { data: { ...plan.data, milestones } });
        }

        // Invitations expire after 14 days (§8.1.9).
        for (const invitation of store.listWhere(
          workspaceId,
          "invitation",
          { status: "pending" },
          1000,
        ))
          if (
            typeof invitation.data.expiresAt === "string" &&
            Date.parse(invitation.data.expiresAt) <= now.getTime()
          ) {
            store.patch(invitation, { status: "expired" });
            report.invitationsExpired += 1;
          }

        // Unowned areas 7 days after offboarding become "Become the owner of X" bounties (§8.11).
        for (const checklist of store.listWhere(
          workspaceId,
          "continuity_checklist",
          { status: "open" },
          500,
        )) {
          if (now.getTime() - checklist.createdAt.getTime() < OWNERSHIP_GRACE_DAYS * 86400000)
            continue;
          const areas = (Array.isArray(checklist.data.areas) ? checklist.data.areas : []) as Array<
            Record<string, unknown>
          >;
          let changed = false;
          for (const area of areas) {
            if (
              area.status !== "unowned" ||
              area.bountyId ||
              area.scopeType !== "project" ||
              typeof area.scopeId !== "string"
            )
              continue;
            const bounty = bounties.createAuto({
              workspaceId,
              projectId: area.scopeId,
              origin: "ownership",
              title: `Become the owner of ${String(area.type).replaceAll("_", " ")} for this project`,
              description: "The previous owner left. Take over this area and confirm ownership.",
              rewardRp: OWNERSHIP_BOUNTY_RP,
              targetType: "assignment",
              targetId: String(area.key),
              settings,
            });
            area.bountyId = bounty.id;
            changed = true;
            report.continuityBounties += 1;
          }
          if (changed) store.patch(checklist, { data: { ...checklist.data, areas } });
        }

        // Open flags > 10 business days escalate to the routed owner's manager (FR-KM-008).
        for (const flag of store.listWhere(workspaceId, "flag", {}, 2000)) {
          if (!["open", "triaged"].includes(flag.status) || flag.data.escalatedAt) continue;
          if (businessDaysBetween(flag.createdAt, now) < FLAG_ESCALATION_BUSINESS_DAYS) continue;
          const routed = (flag.data.routedTo as { userId?: string } | null)?.userId;
          const manager = routed
            ? db
                .select()
                .from(memberships)
                .where(
                  and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, routed)),
                )
                .get()?.managerId
            : null;
          store.patch(flag, {
            data: { ...flag.data, escalatedAt: now.toISOString(), escalatedTo: manager ?? null },
          });
          if (manager)
            notifier.notify(
              workspaceId,
              manager,
              {
                type: "flag.escalated",
                category: "maintenance",
                title: "A knowledge flag has been open for more than 10 business days",
                link: `/queue/flags/${flag.id}`,
              },
              settings,
            );
          report.flagsEscalated += 1;
        }

        // Expired mentor assignments are removed so mentee visibility ends with the plan (§6.5).
        db.delete(assignments)
          .where(
            and(
              eq(assignments.workspaceId, workspaceId),
              eq(assignments.type, "mentor"),
              lt(assignments.expiresAt, now),
            ),
          )
          .run();
      }
      return report;
    },
  };
}
export type Sweeps = ReturnType<typeof createSweeps>;
