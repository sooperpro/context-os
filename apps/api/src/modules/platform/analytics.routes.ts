import { zValidator } from "@hono/zod-validator";
import { gte } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { questions } from "../../db/schema.js";
import { AppError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { AppEnv } from "../../types.js";
import { workspaceSettings } from "./settings.js";
import { createPlatformStore } from "./store.js";

const Query = z.object({
  days: z.coerce.number().int().min(7).max(365).default(90),
  format: z.enum(["json", "csv"]).default("json"),
});

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** Aggregated, k-anonymous analytics (PRD §7.16). Never person-level except a manager's own reports. */
export function createAnalyticsRoutes(container: Container) {
  const { db, identity, services, repos } = container;
  const store = createPlatformStore(db);
  return new Hono<AppEnv>().get(
    "/analytics/overview",
    zValidator("query", Query, validationHook),
    (c) => {
      const actor = c.get("actor");
      if (
        !["owner", "admin"].includes(actor.role) &&
        !identity.hasAssignment(actor, "department_head", actor.workspaceId)
      )
        throw new AppError(
          403,
          "FORBIDDEN",
          "Analytics are available to admins and department heads",
        );
      const { days, format } = c.req.valid("query");
      const since = new Date(Date.now() - days * 86400000);
      const settings = workspaceSettings(db, actor.workspaceId);
      const k = settings.policies.askKAnonymityThreshold;
      const knowledgeHealth = services.projects.list(actor).map((project) => {
        const row = repos.projects.findById(project.id, actor.workspaceId)!;
        const khs = services.hub.getKhs(row, actor);
        return {
          projectId: project.id,
          slug: project.slug,
          name: project.name,
          khs: khs.score,
          improvements: khs.improvements,
        };
      });
      const plans = store.listWhere(actor.workspaceId, "onboarding_plan", {}, 1000);
      const ttfw = plans
        .map((plan) => plan.data.ttfwDays)
        .filter((value): value is number => typeof value === "number");
      const assignments = store.listWhere(actor.workspaceId, "path_assignment", {}, 2000);
      const progress = store.listWhere(actor.workspaceId, "item_progress", {}, 5000);
      const stuckByItem = new Map<string, number>();
      const stuckCutoff = Date.now() - settings.policies.nudges.stuckHours * 3600000;
      for (const row of progress)
        if (
          row.status === "in_progress" &&
          Date.parse(String(row.data.firstOpenedAt)) < stuckCutoff
        )
          stuckByItem.set(
            String(row.data.itemId),
            (stuckByItem.get(String(row.data.itemId)) ?? 0) + 1,
          );
      const flags = store.listWhere(actor.workspaceId, "flag", {}, 5000);
      const corrections = store
        .listWhere(actor.workspaceId, "correction", {}, 5000)
        .filter((row) => row.status === "accepted" && row.updatedAt >= since);
      const bounties = store.listWhere(actor.workspaceId, "bounty", {}, 5000);
      const asked = db
        .select()
        .from(questions)
        .where(gte(questions.createdAt, since))
        .all()
        .filter((row) => {
          const project = repos.projects.findById(row.projectId, actor.workspaceId);
          return !!project;
        });
      const rated = asked.filter((row) => row.feedback);
      const overview = {
        periodDays: days,
        generatedAt: new Date().toISOString(),
        knowledgeHealth,
        onboarding: {
          activePlans: plans.filter((plan) => ["active", "scheduled"].includes(plan.status)).length,
          closedPlans: plans.filter((plan) => plan.status === "closed").length,
          medianTimeToFirstWinDays: ttfw.length >= k ? median(ttfw) : null,
          pathCompletionRate: assignments.length
            ? Math.round(
                (assignments.filter((row) => row.status === "completed").length /
                  assignments.length) *
                  100,
              ) / 100
            : null,
          stuckHotspots: [...stuckByItem.entries()]
            .filter(([, count]) => count >= k)
            .map(([itemId, count]) => ({ itemId, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10),
        },
        contributions: {
          flagsOpened: flags.filter((row) => row.createdAt >= since).length,
          flagsResolved: flags.filter((row) => row.status === "resolved" && row.updatedAt >= since)
            .length,
          correctionsVerified: corrections.length,
          verificationLagHours: corrections.length
            ? Math.round(
                corrections.reduce(
                  (sum, row) => sum + (row.updatedAt.getTime() - row.createdAt.getTime()) / 3600000,
                  0,
                ) / corrections.length,
              )
            : null,
          bountiesCompleted: bounties.filter(
            (row) => row.status === "paid" && row.updatedAt >= since,
          ).length,
          bountiesOpen: bounties.filter((row) => row.status === "open").length,
        },
        ask: {
          volume: asked.length,
          helpfulRate:
            rated.length >= k
              ? Math.round(
                  (rated.filter((row) => row.feedback?.rating === "up").length / rated.length) *
                    100,
                ) / 100
              : null,
          insufficientRate:
            asked.length >= k
              ? Math.round(
                  (asked.filter((row) => row.answer.confidence === "insufficient").length /
                    asked.length) *
                    100,
                ) / 100
              : null,
          /** Topic clustering of unanswered questions is not implemented; nothing is exposed below k. */
          unansweredTopics: [],
        },
      };
      if (format === "csv") {
        const rows: Array<[string, unknown]> = [
          ["periodDays", days],
          ["activePlans", overview.onboarding.activePlans],
          ["medianTimeToFirstWinDays", overview.onboarding.medianTimeToFirstWinDays],
          ["pathCompletionRate", overview.onboarding.pathCompletionRate],
          ["flagsOpened", overview.contributions.flagsOpened],
          ["flagsResolved", overview.contributions.flagsResolved],
          ["correctionsVerified", overview.contributions.correctionsVerified],
          ["bountiesCompleted", overview.contributions.bountiesCompleted],
          ["askVolume", overview.ask.volume],
          ["askHelpfulRate", overview.ask.helpfulRate],
          ["askInsufficientRate", overview.ask.insufficientRate],
          ...knowledgeHealth.map((entry): [string, unknown] => [
            `khs:${entry.slug ?? entry.projectId}`,
            entry.khs,
          ]),
        ];
        const cell = (value: unknown) =>
          typeof value === "string"
            ? value
            : typeof value === "number" || typeof value === "boolean"
              ? String(value)
              : value === null || value === undefined
                ? ""
                : JSON.stringify(value);
        return c.text(
          ["metric,value", ...rows.map(([key, value]) => `${key},${cell(value)}`)].join("\n"),
          200,
          {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="analytics.csv"',
          },
        );
      }
      return c.json(overview);
    },
  );
}
