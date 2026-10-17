import type { AiPolicySettings } from "@contextos/shared";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import {
  assignments,
  connectorScopes,
  memberships,
  questions,
  sourceObjects,
} from "../../db/schema.js";
import type { Actor } from "../../types.js";
import { SYSTEM_USER_ID } from "../platform/bounties.js";
import { SYNC_INTERVAL_MS } from "../platform/sweeps.js";
import { createNotifier } from "../platform/notify.js";
import { workspaceSettings } from "../platform/settings.js";
import { createPlatformStore } from "../platform/store.js";
import { gapWords, sameGap } from "./knowledge-gaps.js";

/** How far back repeated unanswered questions are counted. */
const ROUTE_WINDOW_DAYS = 30;
const HOUR = 3_600_000;

const normalize = (question: string) => question.trim().toLocaleLowerCase();

/**
 * Who keeps a project's knowledge right: its active domain owners, and the workspace-wide ones.
 * Without a project, only the workspace-wide ones.
 */
export function domainOwnersOf(db: Db, workspaceId: string, projectId: string | null): string[] {
  const now = new Date();
  return [
    ...new Set(
      db
        .select({ userId: assignments.userId })
        .from(assignments)
        .innerJoin(
          memberships,
          and(
            eq(memberships.userId, assignments.userId),
            eq(memberships.workspaceId, assignments.workspaceId),
          ),
        )
        .where(
          and(
            eq(assignments.workspaceId, workspaceId),
            eq(assignments.type, "domain_owner"),
            eq(memberships.status, "active"),
            or(
              projectId ? eq(assignments.scopeId, projectId) : undefined,
              and(eq(assignments.scopeType, "workspace"), eq(assignments.scopeId, workspaceId)),
            ),
            or(isNull(assignments.expiresAt), gt(assignments.expiresAt, now)),
          ),
        )
        .all()
        .map((row) => row.userId),
    ),
  ];
}

/**
 * The workspace's Context Bot settings (admin › AI settings) as Ask applies them: which answers to
 * keep, which sources to flag as stale, and when an unanswered question goes to its owner.
 */
/** "5 hours ago", "3 days ago". */
const ago = (hours: number) =>
  hours < 48 ? `${hours} hour${hours === 1 ? "" : "s"} ago` : `${Math.floor(hours / 24)} days ago`;

export function createAnswerPolicy(db: Db) {
  const store = createPlatformStore(db);
  const notifier = createNotifier(db);

  return {
    settings(workspaceId: string): AiPolicySettings {
      return workspaceSettings(db, workspaceId).ai;
    },

    /**
     * Cited sources that come from a connector and are out of date, as notes for the answer (D10).
     * A folder on a schedule is stale once it has missed a scheduled sync (its interval plus a
     * quarter); a manual-only folder after `manualHours` (the admin's setting). Pasted and uploaded
     * sources don't sync, so they never go stale here.
     */
    staleWarnings(projectId: string, sourceIds: string[], manualHours: number): string[] {
      if (!sourceIds.length) return [];
      const cited = db
        .select({
          title: sourceObjects.title,
          connector: sourceObjects.connector,
          connectionId: sourceObjects.connectionId,
        })
        .from(sourceObjects)
        .where(inArray(sourceObjects.id, sourceIds))
        .all()
        .filter((source) => source.connector !== "manual" && source.connectionId);
      const warnings: string[] = [];
      for (const source of cited) {
        const scopes = db
          .select({ at: connectorScopes.lastSyncedAt, frequency: connectorScopes.syncFrequency })
          .from(connectorScopes)
          .where(
            and(
              eq(connectorScopes.projectId, projectId),
              eq(connectorScopes.connectionId, source.connectionId!),
            ),
          )
          .all();
        const last = Math.max(0, ...scopes.map((row) => row.at?.getTime() ?? 0));
        const intervals = scopes.flatMap((row) => {
          const interval = SYNC_INTERVAL_MS[row.frequency === "manual" ? "manual" : "2d"];
          return interval === null ? [] : [interval];
        });
        const allowed = intervals.length ? Math.min(...intervals) * 1.25 : manualHours * HOUR;
        if (last && Date.now() - last <= allowed) continue;
        const hoursAgo = Math.floor((Date.now() - last) / HOUR);
        warnings.push(
          !last
            ? `“${source.title}” hasn't synced yet, so it may be out of date.`
            : intervals.length
              ? `“${source.title}” missed its scheduled sync (last synced ${ago(hoursAgo)}), so it may be out of date.`
              : `“${source.title}” was last synced ${ago(hoursAgo)}, so it may be out of date.`,
        );
      }
      return [...new Set(warnings)];
    },

    /**
     * When enough different people have asked the same question without an answer, send it to the
     * project's domain owners (or the workspace admins) as a knowledge gap, once. Ask history is
     * private (D1): the gap carries the question only, never who asked.
     */
    routeUnanswered(actor: Actor, projectId: string, question: string): string | null {
      const ai = workspaceSettings(db, actor.workspaceId).ai;
      if (!ai.rules.route_unanswered) return null;
      const words = gapWords(question);
      const same = (other: string) =>
        normalize(other) === normalize(question) || sameGap(gapWords(other), words);
      const since = new Date(Date.now() - ROUTE_WINDOW_DAYS * 24 * HOUR);
      const askers = new Set(
        db
          .select({
            question: questions.question,
            answer: questions.answer,
            actorId: questions.actorId,
          })
          .from(questions)
          .where(and(eq(questions.projectId, projectId), gt(questions.createdAt, since)))
          .all()
          .filter((row) => row.answer.confidence === "insufficient" && same(row.question))
          .map((row) => row.actorId),
      );
      if (askers.size < ai.routeAfterAsks) return null;
      const already = store
        .listWhere(actor.workspaceId, "knowledge_gap", { projectId }, 500)
        .some((gap) => gap.data.routed === true && same(String(gap.data.question)));
      if (already) return null;

      const recipients = domainOwnersOf(db, actor.workspaceId, projectId);
      const routedTo = recipients.length ? "Domain owners" : "Workspace admins";
      const gap = store.insert({
        workspaceId: actor.workspaceId,
        ownerId: SYSTEM_USER_ID,
        kind: "knowledge_gap",
        projectId,
        status: "open",
        data: {
          question: question.trim(),
          page: null,
          routed: true,
          askers: askers.size,
          routedTo,
        },
      });
      const notice = {
        type: "knowledge.gap_routed",
        category: "maintenance" as const,
        title: `Asked ${askers.size} times without an answer: ${question.trim().slice(0, 120)}`,
        body: "Add or update a source that answers it.",
        link: `/knowledge-gaps?project=${projectId}`,
        projectId,
        data: { gapId: gap.id },
      };
      if (recipients.length)
        for (const userId of recipients) notifier.notify(actor.workspaceId, userId, notice);
      else notifier.notifyAdmins(actor.workspaceId, notice);
      return gap.id;
    },
  };
}
export type AnswerPolicy = ReturnType<typeof createAnswerPolicy>;
