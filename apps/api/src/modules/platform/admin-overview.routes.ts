import {
  AiSettingsInputSchema,
  type AiPolicySettings,
  type AiSetting,
  type AiSettings,
  type SecurityCheck,
  type SyncRun,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import {
  connectorScopes,
  jobs,
  projects,
  questions,
  sourceObjects,
  ssoProviders,
  workspaces,
} from "../../db/schema.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { readAccessPolicies, requireRole } from "../identity/identity.service.js";
import { excludedSources, policyConflictCount } from "./access-policies.routes.js";
import { directorySyncRuns } from "./members-admin.routes.js";
import { mergeSettings, resolveSettings, workspaceSettings } from "./settings.js";
import { createPlatformStore } from "./store.js";

const PERIOD_DAYS = 30;
const LOCKED = new Set<AiSetting["id"]>(["access_only", "include_dms"]);

/** The Context Bot rules in display order; the two locked ones are fixed by policy. */
function aiRules(settings: AiPolicySettings): AiSetting[] {
  return [
    {
      id: "cite_sources",
      label: "Cite sources in every answer",
      detail: "Answers without a source are shown as “not found”.",
      enabled: settings.rules.cite_sources,
      locked: false,
    },
    {
      id: "access_only",
      label: "Answer only from sources the person can access",
      detail: "Required. Enforced by connector permissions.",
      enabled: true,
      locked: true,
    },
    {
      id: "route_unanswered",
      label: "Route unanswered questions to knowledge owners",
      detail: "Creates knowledge gaps for team owners.",
      enabled: settings.rules.route_unanswered,
      locked: false,
    },
    {
      id: "include_dms",
      label: "Include Slack direct messages",
      detail: "Off by policy.",
      enabled: false,
      locked: true,
    },
    {
      id: "pause_during_checks",
      label: "Pause during knowledge checks",
      detail: "Context Bot won’t answer while a check is open.",
      enabled: settings.rules.pause_during_checks,
      locked: false,
    },
  ];
}

/** Labels for the answer-feedback reasons stored on Ask messages. */
const REASON_LABEL: Record<string, string> = {
  wrong: "Incorrect",
  outdated: "Out of date",
  missing_source: "Missing a source",
  not_helpful: "Not relevant",
  leaked: "Shows restricted content",
};

const CONNECTOR_NAME: Record<string, string> = {
  google_drive: "Google Drive",
  slack: "Slack",
  jira: "Jira",
  github: "GitHub",
};

const SinceQuery = z.object({ since: z.iso.datetime().optional() });

const scopeIdOf = (job: { payload: Record<string, unknown> }) =>
  typeof job.payload.scopeId === "string" ? job.payload.scopeId : "";

const startOfToday = () => {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  return day;
};

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

/**
 * The admin's workspace overview (admin Home cards) and Context Bot settings, from live data:
 * connector sync jobs, Ask answers and their ratings, knowledge-gap reports and workspace settings.
 */
export function createAdminOverviewRoutes(container: Container) {
  const { db, env, audit } = container;
  const store = createPlatformStore(db);
  const admin = (actor: Actor) => requireRole(actor, "owner", "admin");

  const projectsOf = (workspaceId: string) =>
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId))
      .all();

  /** Answer quality over the period, plus the questions nothing answered. */
  const answerStats = (actor: Actor, kAnonymity: number) => {
    const owned = projectsOf(actor.workspaceId);
    const since = new Date(Date.now() - PERIOD_DAYS * 86_400_000);
    const rows = owned.length
      ? db
          .select({
            projectId: questions.projectId,
            question: questions.question,
            answer: questions.answer,
            actorId: questions.actorId,
            feedback: questions.feedback,
          })
          .from(questions)
          .where(
            and(
              inArray(
                questions.projectId,
                owned.map((project) => project.id),
              ),
              gte(questions.createdAt, since),
            ),
          )
          .all()
      : [];
    const rated = rows.filter((row) => row.feedback);
    const helpful = rated.filter((row) => row.feedback?.rating === "up").length;
    const reasons = new Map<string, number>();
    for (const row of rated)
      if (row.feedback?.rating === "down" && row.feedback.reason)
        reasons.set(row.feedback.reason, (reasons.get(row.feedback.reason) ?? 0) + 1);
    const withReason = [...reasons.values()].reduce((sum, count) => sum + count, 0);
    const unhelpfulReasons = [...reasons.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({
        reason: REASON_LABEL[reason] ?? reason,
        share: count / withReason,
      }));

    // Ask history is private (D1): a question only surfaces once enough different people asked it.
    const projectName = new Map(owned.map((project) => [project.id, project.name]));
    const unanswered = new Map<
      string,
      { question: string; askers: Set<string>; asks: number; routedTo: string; reported: boolean }
    >();
    for (const row of rows) {
      if (row.answer.confidence !== "insufficient") continue;
      const key = row.question.trim().toLocaleLowerCase();
      const entry = unanswered.get(key) ?? {
        question: row.question.trim(),
        askers: new Set<string>(),
        asks: 0,
        routedTo: projectName.get(row.projectId) ?? "Knowledge owners",
        reported: false,
      };
      entry.askers.add(row.actorId);
      entry.asks += 1;
      unanswered.set(key, entry);
    }
    // Gaps people chose to report are shared on purpose, so they count from the first report.
    for (const gap of store.listWhere(actor.workspaceId, "knowledge_gap", {}, 500)) {
      if (gap.createdAt < since) continue;
      const question = (typeof gap.data.question === "string" ? gap.data.question : "").trim();
      if (!question) continue;
      const key = question.toLocaleLowerCase();
      const entry = unanswered.get(key) ?? {
        question,
        askers: new Set<string>(),
        asks: 0,
        routedTo: "Workspace admins",
        reported: true,
      };
      entry.askers.add(gap.ownerId);
      entry.asks += 1;
      entry.reported = true;
      unanswered.set(key, entry);
    }

    return {
      stats: {
        helpfulRate: rated.length ? helpful / rated.length : 0,
        withSources: rows.length
          ? rows.filter((row) => row.answer.citations.length > 0).length / rows.length
          : 0,
        noAnswer: rows.length
          ? rows.filter((row) => row.answer.confidence === "insufficient").length / rows.length
          : 0,
        ratings: rated.length,
        periodDays: PERIOD_DAYS,
      },
      unhelpfulReasons,
      unhelpfulNote:
        withReason >= 3 && unhelpfulReasons[0]
          ? `${Math.round(unhelpfulReasons[0].share * 100)}% of unhelpful ratings say “${unhelpfulReasons[0].reason.toLocaleLowerCase()}”.`
          : null,
      unanswered: [...unanswered.values()]
        .filter((entry) => entry.reported || entry.askers.size >= kAnonymity)
        .sort((a, b) => b.asks - a.asks)
        .slice(0, 5)
        .map(({ question, asks, routedTo }) => ({ question, asks, routedTo })),
    };
  };

  const aiSettings = (actor: Actor): AiSettings => {
    const settings = workspaceSettings(db, actor.workspaceId);
    const { stats, unhelpfulReasons, unhelpfulNote, unanswered } = answerStats(
      actor,
      settings.policies.askKAnonymityThreshold,
    );
    return {
      stats,
      rules: aiRules(settings.ai),
      strictness: settings.ai.strictness,
      staleAfterHours: settings.ai.staleAfterHours,
      routeAfterAsks: settings.ai.routeAfterAsks,
      weeklyDigest: settings.ai.weeklyDigest,
      excluded: excludedSources(db, actor.workspaceId),
      unhelpfulReasons,
      unhelpfulNote,
      unanswered,
    };
  };

  return new Hono<AppEnv>()
    .get("/admin/security", (c) => {
      const actor = c.get("actor");
      admin(actor);
      const settings = workspaceSettings(db, actor.workspaceId);
      const owned = projectsOf(actor.workspaceId).map((project) => project.id);
      const shared = owned.length
        ? db
            .select({ id: sourceObjects.id })
            .from(sourceObjects)
            .where(
              and(
                inArray(sourceObjects.projectId, owned),
                eq(sourceObjects.visibility, "workspace"),
              ),
            )
            .all().length
        : 0;
      const retention = settings.policies.retention;
      const policies = readAccessPolicies(db, actor.workspaceId).length;
      const conflicts = policyConflictCount(db, actor.workspaceId);
      const requests = store
        .listWhere(actor.workspaceId, "role_request", { status: "open" }, 200)
        .map((row) => String(row.data.role));
      const ssoProvider = db
        .select()
        .from(ssoProviders)
        .where(eq(ssoProviders.organizationId, actor.workspaceId))
        .all()
        .sort((a, b) => Number(b.domainVerified) - Number(a.domainVerified))[0];
      const ssoEnforced =
        db
          .select({ ssoEnforced: workspaces.ssoEnforced })
          .from(workspaces)
          .where(eq(workspaces.id, actor.workspaceId))
          .get()?.ssoEnforced ?? false;
      const roleName = (role: string) =>
        role === "hr" ? "HR" : role.charAt(0).toUpperCase() + role.slice(1);
      const items: SecurityCheck[] = [
        env.AUTH_MODE !== "accounts"
          ? { id: "sso", value: "Development sign-in · not for production", state: "attention" }
          : ssoProvider
            ? {
                id: "sso",
                value: ssoProvider.domainVerified
                  ? `Company SSO · ${ssoProvider.domain}${ssoEnforced ? " · required" : ""}`
                  : `Company SSO · verify ${ssoProvider.domain}`,
                state: ssoProvider.domainVerified ? "ok" : "attention",
              }
            : { id: "sso", value: "Email link and Google/Microsoft sign-in", state: "attention" },
        { id: "scim", value: "Not configured", state: "off" },
        {
          id: "access_policies",
          value: [
            `${plural(policies + 1, "policy", "policies")} active`,
            conflicts ? plural(conflicts, "conflict") : "no conflicts",
            ...(shared ? [`${plural(shared, "source")} shared with everyone`] : []),
          ].join(" · "),
          state: conflicts ? "attention" : "ok",
        },
        requests.length
          ? {
              id: "role_requests",
              value: `${[...new Set(requests)].map(roleName).join(", ")} · ${requests.length} pending`,
              state: "attention",
            }
          : { id: "role_requests", value: "None pending", state: "ok" },
        {
          id: "data_retention",
          value: `Ask history ${retention.askConversationDays} days · audit log ${retention.auditLogDays} days`,
          state: "ok",
        },
      ];
      return c.json({ items });
    })
    .get("/admin/sync-runs", zValidator("query", SinceQuery, validationHook), (c) => {
      const actor = c.get("actor");
      admin(actor);
      const since = c.req.valid("query").since
        ? new Date(c.req.valid("query").since!)
        : startOfToday();
      const owned = projectsOf(actor.workspaceId).map((project) => project.id);
      const runs = !owned.length
        ? []
        : db
            .select()
            .from(jobs)
            .where(
              and(
                inArray(jobs.projectId, owned),
                eq(jobs.type, "sync_connector"),
                gte(jobs.createdAt, since),
              ),
            )
            .orderBy(desc(jobs.createdAt))
            .limit(50)
            .all();
      const scopeIds = [...new Set(runs.map((job) => scopeIdOf(job)))].filter(Boolean);
      const scopes = new Map(
        (scopeIds.length
          ? db.select().from(connectorScopes).where(inArray(connectorScopes.id, scopeIds)).all()
          : []
        ).map((scope) => [scope.id, scope]),
      );
      const latest = new Set<string>();
      const items = runs.map((job): SyncRun => {
        const scope = scopes.get(scopeIdOf(job));
        const first = scope && !latest.has(scope.id);
        if (scope) latest.add(scope.id);
        const cursor = scope?.cursor ?? {};
        const detail =
          job.status === "failed"
            ? (job.lastError ?? "Sync failed")
            : job.status === "done"
              ? first && typeof cursor.filesSeen === "number"
                ? `${plural(cursor.filesSeen, "file")} checked, ${Number(cursor.imported ?? 0).toLocaleString("en-US")} imported`
                : "Completed"
              : job.status === "running"
                ? "In progress"
                : "Queued";
        const startedAt = job.startedAt ?? job.createdAt;
        return {
          id: job.id,
          connector: [CONNECTOR_NAME.google_drive, scope?.name ?? job.subject]
            .filter(Boolean)
            .join(" · "),
          startedAt: startedAt.toISOString(),
          ok: job.status !== "failed",
          detail,
          durationMs:
            job.finishedAt && job.startedAt
              ? Math.max(0, job.finishedAt.getTime() - job.startedAt.getTime())
              : 0,
        };
      });
      // Directory syncs belong in the same list (handoff §7.10).
      const directoryRuns = directorySyncRuns(container, actor.workspaceId, 20)
        .filter((run) => run.createdAt >= since)
        .map((run): SyncRun => ({
          id: run.id,
          connector:
            typeof run.data.provider === "string"
              ? `Directory · ${run.data.provider}`
              : "Directory",
          startedAt: run.createdAt.toISOString(),
          ok: true,
          detail: `${Number(run.data.created ?? 0)} added, ${Number(run.data.updated ?? 0)} updated, ${Number(run.data.deactivated ?? 0)} deactivated`,
          durationMs: Number(run.data.durationMs ?? 0),
        }));
      return c.json({
        items: [...items, ...directoryRuns].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      });
    })
    .get("/admin/ai", (c) => {
      const actor = c.get("actor");
      admin(actor);
      const settings = aiSettings(actor);
      return c.json({
        helpfulRate: settings.stats.helpfulRate,
        ratings: settings.stats.ratings,
        periodDays: settings.stats.periodDays,
        settings: settings.rules.filter((rule) => rule.id !== "pause_during_checks"),
        unanswered: settings.unanswered.slice(0, 3),
      });
    })
    .get("/admin/ai-settings", (c) => {
      const actor = c.get("actor");
      admin(actor);
      return c.json(aiSettings(actor));
    })
    .patch("/admin/ai-settings", zValidator("json", AiSettingsInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      admin(actor);
      const input = c.req.valid("json");
      const locked = Object.keys(input.rules ?? {}).filter((id) =>
        LOCKED.has(id as AiSetting["id"]),
      );
      if (locked.length)
        throw new AppError(409, "CONFLICT", `${locked.join(", ")} is fixed by policy`);
      db.transaction(() => {
        const row = db.select().from(workspaces).where(eq(workspaces.id, actor.workspaceId)).get();
        if (!row) throw new NotFoundError("Workspace");
        const current = resolveSettings(row.settings).ai;
        const next: AiPolicySettings = {
          rules: { ...current.rules },
          strictness: input.strictness ?? current.strictness,
          staleAfterHours: input.staleAfterHours ?? current.staleAfterHours,
          routeAfterAsks: input.routeAfterAsks ?? current.routeAfterAsks,
          weeklyDigest: input.weeklyDigest ?? current.weeklyDigest,
        };
        for (const [id, enabled] of Object.entries(input.rules ?? {}))
          if (enabled !== undefined) next.rules[id as keyof AiPolicySettings["rules"]] = enabled;
        const changes = [
          ...Object.keys(next.rules)
            .filter(
              (id) =>
                next.rules[id as keyof AiPolicySettings["rules"]] !==
                current.rules[id as keyof AiPolicySettings["rules"]],
            )
            .map((id) => ({
              setting: id,
              from: current.rules[id as keyof AiPolicySettings["rules"]],
              to: next.rules[id as keyof AiPolicySettings["rules"]],
            })),
          ...(["strictness", "staleAfterHours", "routeAfterAsks", "weeklyDigest"] as const)
            .filter((key) => next[key] !== current[key])
            .map((key) => ({ setting: key, from: current[key], to: next[key] })),
        ];
        if (!changes.length) return;
        const settings = mergeSettings(row.settings, { ai: next });
        resolveSettings(settings);
        db.update(workspaces)
          .set({ settings, version: row.version + 1 })
          .where(eq(workspaces.id, row.id))
          .run();
        for (const change of changes)
          audit.record({
            actor,
            action: "ai.settings.update",
            targetType: "workspace",
            targetId: row.id,
            metadata: change,
          });
      });
      return c.json(aiSettings(actor));
    });
}
