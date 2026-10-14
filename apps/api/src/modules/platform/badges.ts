import { randomUUID } from "node:crypto";
import type { BadgeKey } from "@contextos/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { platformRecords, pointsLedger, questions } from "../../db/schema.js";

export interface BadgeDefinition {
  key: BadgeKey;
  name: string;
  icon: string;
  description: string;
  category:
    | "Maintenance"
    | "Curation"
    | "Mentorship"
    | "Onboarding"
    | "Community"
    | "Bounties"
    | "Seasonal";
  /** False when the criteria need data the backend does not collect yet (documented). */
  automated: boolean;
}

/** PRD Appendix B. Badges are permanent once earned; seasonal badges are time-stamped. */
export const BADGE_CATALOG: BadgeDefinition[] = [
  {
    key: "first_flag",
    name: "Eagle Eye",
    icon: "👁",
    description: "Raised first accepted knowledge flag",
    category: "Maintenance",
    automated: true,
  },
  {
    key: "myth_buster",
    name: "Myth Buster",
    icon: "🔍",
    description: "Corrected 10 verified incorrect claims",
    category: "Maintenance",
    automated: true,
  },
  {
    key: "time_traveller",
    name: "Time Traveller",
    icon: "⏳",
    description: "Fixed 5 stale claims older than 1 year",
    category: "Maintenance",
    automated: true,
  },
  {
    key: "peacemaker",
    name: "Peacemaker",
    icon: "🕊",
    description: "Resolved 5 conflicting knowledge claims",
    category: "Maintenance",
    automated: true,
  },
  {
    key: "pathfinder",
    name: "Pathfinder",
    icon: "🧭",
    description: "Published a learning path completed by 5 or more teammates",
    category: "Curation",
    automated: true,
  },
  {
    key: "curator_gold",
    name: "Master Educator",
    icon: "🎓",
    description: "Curated paths with an average rating of 4.8 or more across 20+ learners",
    category: "Curation",
    automated: true,
  },
  {
    key: "mentor_bronze",
    name: "Onboarding Guide",
    icon: "🤝",
    description: "Guided 1 new hire to first-win completion",
    category: "Mentorship",
    automated: true,
  },
  {
    key: "mentor_silver",
    name: "Onboarding Mentor",
    icon: "🌟",
    description: "Guided 5 new hires to first-win completion",
    category: "Mentorship",
    automated: true,
  },
  {
    key: "mentor_gold",
    name: "Legendary Mentor",
    icon: "👑",
    description: "Guided 15 new hires to first-win completion",
    category: "Mentorship",
    automated: true,
  },
  {
    key: "fast_starter",
    name: "Fast Starter",
    icon: "🚀",
    description: "Achieved the first-win milestone faster than the department median",
    category: "Onboarding",
    automated: true,
  },
  {
    key: "curious_mind",
    name: "Inquisitive Mind",
    icon: "💡",
    description: "Rated 25 Ask ContextOS answers helpful during onboarding (count only)",
    category: "Onboarding",
    automated: true,
  },
  {
    key: "checkpoint_champ",
    name: "Checkpoint Ace",
    icon: "🎯",
    description: "Passed 10 onboarding quizzes on the first attempt",
    category: "Onboarding",
    automated: true,
  },
  {
    key: "orbit_copilot",
    name: "Orbit Co-Pilot",
    icon: "🛸",
    description: "Completed 5 onboarding checkpoints with the companion active",
    category: "Onboarding",
    automated: true,
  },
  {
    key: "first_kudos",
    name: "Culture Champion",
    icon: "💖",
    description: "Sent first peer kudos",
    category: "Community",
    automated: true,
  },
  {
    key: "kudos_magnet",
    name: "Team Pillar",
    icon: "🧲",
    description: "Received 20 peer kudos",
    category: "Community",
    automated: true,
  },
  {
    key: "bounty_hunter",
    name: "Bounty Hunter",
    icon: "🏹",
    description: "Completed 5 open knowledge bounties",
    category: "Bounties",
    automated: true,
  },
  {
    key: "context_champion",
    name: "Context Champion",
    icon: "🏆",
    description:
      "Top 3 on the department leaderboard for a quarter (awarded when a quarter closes)",
    category: "Seasonal",
    automated: false,
  },
];

export interface EarnedBadge {
  key: BadgeKey;
  awardedAt: string;
  evidenceRef: string;
  season?: string;
}

function reasonOf(row: { reason: string }): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(row.reason);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function earnedBadges(db: Db, workspaceId: string, userId: string): EarnedBadge[] {
  return db
    .select()
    .from(platformRecords)
    .where(
      and(
        eq(platformRecords.workspaceId, workspaceId),
        eq(platformRecords.ownerId, userId),
        eq(platformRecords.kind, "badge"),
      ),
    )
    .all()
    .map((row) => ({
      key: String(row.data.key) as BadgeKey,
      awardedAt: String(row.data.awardedAt),
      evidenceRef: typeof row.data.evidenceRef === "string" ? row.data.evidenceRef : "",
      ...(typeof row.data.season === "string" ? { season: row.data.season } : {}),
    }));
}

/**
 * Evaluate badge criteria against the ledger and platform records and award any
 * newly satisfied badge. Returns the badges earned by this evaluation.
 */
export function evaluateBadges(db: Db, workspaceId: string, userId: string): EarnedBadge[] {
  const have = new Set(earnedBadges(db, workspaceId, userId).map((badge) => badge.key));
  const ledger = db
    .select()
    .from(pointsLedger)
    .where(
      and(
        eq(pointsLedger.workspaceId, workspaceId),
        eq(pointsLedger.userId, userId),
        eq(pointsLedger.currency, "rp"),
        eq(pointsLedger.status, "posted"),
      ),
    )
    .all();
  const count = (action: string) => ledger.filter((row) => row.action === action).length;
  const records = (kind: string) =>
    db
      .select()
      .from(platformRecords)
      .where(and(eq(platformRecords.workspaceId, workspaceId), eq(platformRecords.kind, kind)))
      .all();
  const awarded: EarnedBadge[] = [];
  const award = (key: BadgeKey, evidenceRef: string) => {
    if (have.has(key)) return;
    const badge: EarnedBadge = { key, awardedAt: new Date().toISOString(), evidenceRef };
    db.insert(platformRecords)
      .values({
        id: randomUUID(),
        workspaceId,
        ownerId: userId,
        kind: "badge",
        status: "earned",
        data: { ...badge },
      })
      .run();
    have.add(key);
    awarded.push(badge);
  };

  if (count("flag_accepted") >= 1) award("first_flag", "ledger:flag_accepted");
  if (count("fix_incorrect") >= 10) award("myth_buster", "ledger:fix_incorrect");
  if (
    ledger.filter((row) => row.action === "fix_stale" && Number(reasonOf(row).staleness) >= 2)
      .length >= 5
  )
    award("time_traveller", "ledger:fix_stale");
  if (count("resolve_conflict") >= 5) award("peacemaker", "ledger:resolve_conflict");
  const completionsByPath = new Map<string, number>();
  for (const row of ledger.filter((entry) => entry.action === "path_learner_complete")) {
    const pathId = row.sourceId.split(":")[0] ?? row.sourceId;
    completionsByPath.set(pathId, (completionsByPath.get(pathId) ?? 0) + 1);
  }
  for (const [pathId, completions] of completionsByPath)
    if (completions >= 5) award("pathfinder", `path:${pathId}`);
  const ratedAssignments = records("path_assignment").filter(
    (row) => typeof row.data.rating === "number",
  );
  const curatedPaths = new Set(
    records("learning_path")
      .filter((row) => row.ownerId === userId)
      .map((row) =>
        typeof row.data.publishedVersionId === "string" ? row.data.publishedVersionId : "",
      ),
  );
  const ratings = ratedAssignments
    .filter((row) => curatedPaths.has(row.parentId ?? ""))
    .map((row) => Number(row.data.rating));
  if (
    ratings.length >= 20 &&
    ratings.reduce((sum, value) => sum + value, 0) / ratings.length >= 4.8
  )
    award("curator_gold", "path_assignment:ratings");
  const firstWins = count("mentee_first_win");
  if (firstWins >= 1) award("mentor_bronze", "ledger:mentee_first_win");
  if (firstWins >= 5) award("mentor_silver", "ledger:mentee_first_win");
  if (firstWins >= 15) award("mentor_gold", "ledger:mentee_first_win");
  if (ledger.some((row) => row.action === "first_win" && reasonOf(row).fast === true))
    award("fast_starter", "ledger:first_win");
  const helpful = db
    .select({ feedback: questions.feedback })
    .from(questions)
    .where(eq(questions.actorId, userId))
    .all()
    .filter((row) => row.feedback?.rating === "up").length;
  if (helpful >= 25) award("curious_mind", "questions:helpful_count");
  if (count("quiz_passed_first_try") >= 10)
    award("checkpoint_champ", "ledger:quiz_passed_first_try");
  const companionCheckpoints = records("item_progress").filter(
    (row) =>
      row.ownerId === userId && row.status === "completed" && row.data.companionActive === true,
  ).length;
  if (companionCheckpoints >= 5) award("orbit_copilot", "item_progress:companion");
  const kudos = records("kudos");
  if (kudos.some((row) => row.ownerId === userId)) award("first_kudos", "kudos:given");
  if (kudos.filter((row) => row.data.toUserId === userId).length >= 20)
    award("kudos_magnet", "kudos:received");
  if (count("bounty_completed") >= 5) award("bounty_hunter", "ledger:bounty_completed");
  return awarded;
}
