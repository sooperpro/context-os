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
import { createNotifier } from "../platform/notify.js";
import { workspaceSettings } from "../platform/settings.js";
import { createPlatformStore } from "../platform/store.js";

/** How far back repeated unanswered questions are counted. */
const ROUTE_WINDOW_DAYS = 30;
const HOUR = 3_600_000;

const normalize = (question: string) => question.trim().toLocaleLowerCase();

/**
 * The workspace's Context Bot settings (admin › AI settings) as Ask applies them: which answers to
 * keep, which sources to flag as stale, and when an unanswered question goes to its owner.
 */
export function createAnswerPolicy(db: Db) {
  const store = createPlatformStore(db);
  const notifier = createNotifier(db);

  return {
    settings(workspaceId: string): AiPolicySettings {
      return workspaceSettings(db, workspaceId).ai;
    },

    /**
     * Cited sources that come from a connector and haven't synced for longer than `hours`, as
     * notes for the answer. Pasted and uploaded sources don't sync, so they never go stale here.
     */
    staleWarnings(projectId: string, sourceIds: string[], hours: number): string[] {
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
      const cutoff = Date.now() - hours * HOUR;
      const warnings: string[] = [];
      for (const source of cited) {
        const synced = db
          .select({ at: connectorScopes.lastSyncedAt })
          .from(connectorScopes)
          .where(
            and(
              eq(connectorScopes.projectId, projectId),
              eq(connectorScopes.connectionId, source.connectionId!),
            ),
          )
          .all()
          .map((row) => row.at?.getTime() ?? 0);
        const last = synced.length ? Math.max(...synced) : 0;
        if (last >= cutoff) continue;
        warnings.push(
          last
            ? `“${source.title}” was last synced ${Math.floor((Date.now() - last) / HOUR)} hours ago, so it may be out of date.`
            : `“${source.title}” hasn't synced yet, so it may be out of date.`,
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
      const key = normalize(question);
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
          .filter(
            (row) => row.answer.confidence === "insufficient" && normalize(row.question) === key,
          )
          .map((row) => row.actorId),
      );
      if (askers.size < ai.routeAfterAsks) return null;
      const already = store
        .listWhere(actor.workspaceId, "knowledge_gap", { projectId }, 500)
        .some((gap) => gap.data.routed === true && normalize(String(gap.data.question)) === key);
      if (already) return null;

      const now = new Date();
      const owners = db
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
            eq(assignments.workspaceId, actor.workspaceId),
            eq(assignments.type, "domain_owner"),
            eq(memberships.status, "active"),
            or(
              eq(assignments.scopeId, projectId),
              and(
                eq(assignments.scopeType, "workspace"),
                eq(assignments.scopeId, actor.workspaceId),
              ),
            ),
            or(isNull(assignments.expiresAt), gt(assignments.expiresAt, now)),
          ),
        )
        .all()
        .map((row) => row.userId);
      const recipients = [...new Set(owners)];
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
        link: `/projects/${projectId}`,
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
