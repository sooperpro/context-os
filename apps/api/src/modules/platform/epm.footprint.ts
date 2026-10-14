import type { EpmTheme } from "@contextos/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { platformRecords, pointsLedger, projects, sourceObjects, users } from "../../db/schema.js";
import type { Actor } from "../../types.js";
import type { IdentityService } from "../identity/identity.service.js";
import type { FootprintItem } from "./brag-doc.js";

interface ActionTheme {
  theme: EpmTheme;
  title: string;
}

/** Ledger actions mapped to neutral impact themes (FR-EPM-002). */
const ACTION_THEMES: Record<string, ActionTheme> = {
  flag_accepted: { theme: "quality_reliability", title: "Knowledge flag accepted" },
  flag_coreporter: { theme: "quality_reliability", title: "Co-reported a knowledge flag" },
  fix_stale: { theme: "knowledge_enablement", title: "Corrected stale knowledge" },
  fix_incorrect: { theme: "knowledge_enablement", title: "Corrected incorrect knowledge" },
  add_missing_context: { theme: "knowledge_enablement", title: "Added missing context" },
  resolve_conflict: { theme: "decisions_direction", title: "Resolved conflicting sources" },
  verify_claim: { theme: "quality_reliability", title: "Verified a claim" },
  verify_sprint_bonus: { theme: "quality_reliability", title: "Completed a verification sprint" },
  answer_captured: { theme: "knowledge_enablement", title: "Answer captured into the hub" },
  ask_promoted: { theme: "knowledge_enablement", title: "Answer promoted to a hub FAQ" },
  path_published: { theme: "knowledge_enablement", title: "Published a learning path" },
  path_learner_complete: { theme: "knowledge_enablement", title: "A learner completed your path" },
  path_item_completed_by_learner: {
    theme: "knowledge_enablement",
    title: "Learner progress on your path",
  },
  mentee_milestone: { theme: "knowledge_enablement", title: "Mentee reached a milestone" },
  mentee_first_win: { theme: "knowledge_enablement", title: "Mentee achieved their first win" },
  mentee_first_win_fast: {
    theme: "knowledge_enablement",
    title: "Mentee achieved a fast first win",
  },
  bounty_completed: { theme: "delivery", title: "Completed a knowledge bounty" },
  peer_kudos_received: { theme: "collaboration", title: "Received peer kudos" },
  onboarding_milestone: { theme: "delivery", title: "Completed an onboarding milestone" },
  first_win: { theme: "delivery", title: "Achieved the first-win milestone" },
  path_completed: { theme: "delivery", title: "Completed a learning path" },
  quiz_passed_first_try: { theme: "delivery", title: "Passed a checkpoint quiz on the first try" },
  knowledge_capture: { theme: "knowledge_enablement", title: "Captured knowledge before leaving" },
};

/**
 * Verified contribution footprint for one person (FR-EPM-001). Ask content, DMs, presence
 * and volume metrics are never included (EP-4). `viewer` controls source parity for
 * inferred authorship items.
 */
export function buildFootprint(
  db: Db,
  identity: IdentityService,
  viewer: Actor,
  userId: string,
  range: { from: Date; to: Date },
): FootprintItem[] {
  const inRange = (date: Date) => date >= range.from && date <= range.to;
  const items: FootprintItem[] = [];
  const ledger = db
    .select()
    .from(pointsLedger)
    .where(
      and(
        eq(pointsLedger.workspaceId, viewer.workspaceId),
        eq(pointsLedger.userId, userId),
        eq(pointsLedger.currency, "rp"),
        eq(pointsLedger.status, "posted"),
      ),
    )
    .all()
    .filter((row) => inRange(row.createdAt));
  for (const row of ledger) {
    const mapping = ACTION_THEMES[row.action];
    if (!mapping) continue;
    items.push({
      id: `ledger:${row.id}`,
      theme: mapping.theme,
      type: row.action,
      title: mapping.title,
      summary: `${mapping.title} (+${row.amount} RP, verified)`,
      occurredAt: row.createdAt.toISOString(),
      projectId: null,
      sourceRefs: [{ type: row.action.split("_")[0] ?? "ledger", id: row.sourceId }],
      isInferred: false,
    });
  }
  const signoffs = db
    .select()
    .from(platformRecords)
    .where(
      and(
        eq(platformRecords.workspaceId, viewer.workspaceId),
        eq(platformRecords.kind, "item_progress"),
        eq(platformRecords.status, "completed"),
      ),
    )
    .all()
    .filter((row) => row.data.decidedBy === userId && inRange(row.updatedAt));
  for (const row of signoffs)
    items.push({
      id: `record:${row.id}`,
      theme: "collaboration",
      type: "checkpoint_signoff",
      title: "Signed off a learner checkpoint",
      summary: "Reviewed and approved a checkpoint for a teammate",
      occurredAt: row.updatedAt.toISOString(),
      projectId: row.projectId,
      sourceRefs: [{ type: "item_progress", id: row.id }],
      isInferred: false,
    });
  // Authored documents are matched by display name only, so they are labelled inferred.
  const name = db.select({ name: users.name }).from(users).where(eq(users.id, userId)).get()?.name;
  if (name) {
    for (const project of db
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, viewer.workspaceId))
      .all()) {
      let visible: Set<string>;
      try {
        visible = new Set(identity.visibleSourceIds(viewer, project.id));
      } catch {
        continue;
      }
      const authored = db
        .select()
        .from(sourceObjects)
        .where(eq(sourceObjects.projectId, project.id))
        .all()
        .filter(
          (source) =>
            visible.has(source.id) &&
            source.author?.toLocaleLowerCase() === name.toLocaleLowerCase() &&
            inRange(source.sourceCreatedAt ?? source.ingestedAt),
        );
      for (const source of authored)
        items.push({
          id: `source:${source.id}`,
          theme: "knowledge_enablement",
          type: "authored_document",
          title: `Authored "${source.title}"`,
          summary: `Document in ${project.name} attributed by author name`,
          occurredAt: (source.sourceCreatedAt ?? source.ingestedAt).toISOString(),
          projectId: project.id,
          sourceRefs: [{ type: "source", id: source.id }],
          isInferred: true,
        });
    }
  }
  return items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/** FR-EPM-010: share of cited items that fall in the last quarter of the period. */
export function recencyBias(items: FootprintItem[], range: { from: Date; to: Date }) {
  const span = range.to.getTime() - range.from.getTime();
  const threshold = range.to.getTime() - span * 0.25;
  const recent = items.filter((item) => Date.parse(item.occurredAt) >= threshold).length;
  const share = items.length ? recent / items.length : 0;
  return {
    lastQuarterShare: Math.round(share * 100) / 100,
    warning: items.length > 0 && share > 0.6,
  };
}
