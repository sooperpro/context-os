import {
  FlagTargetTypeSchema,
  ReviewDecisionInputSchema,
  type CourseDetail,
  type KnowledgeGap,
  type MyLearning,
  type ReviewItem,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq, gte, inArray, isNull, or, gt } from "drizzle-orm";
import { Hono } from "hono";
import type { Container } from "../../container.js";
import { assignments, memberships, projects, questions } from "../../db/schema.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { decidePromotion } from "../ask/promotions.js";
import {
  createLearningContent,
  TUTORIAL,
  TUTORIAL_PREFIX,
  type ProgressData,
} from "../learning/content.js";
import { createOnboardingRecords } from "./onboarding-records.js";
import { roadmapData } from "./onboarding-roadmap.js";
import { workspaceSettings } from "./settings.js";
import { createPlatformStore, type PlatformRecord } from "./store.js";
import { reportsOf } from "./reports.js";

const DAY = 86_400_000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const str = (value: unknown) => (typeof value === "string" ? value : "");
/** Flag statuses that still wait on the owner (as knowledge.routes.ts counts them). */
const FLAG_OPEN = ["open", "triaged", "in_progress", "pending_verification"];

/**
 * The manager's knowledge work and their own learning (role access spec §4.2 Manager Home, §4.3 My
 * learning, §4.6 Review queue; handoff §7.3, §7.6, §7.8):
 * - My learning: published learning paths, as assigned, suggested and completed courses.
 * - Review queue: Ask answers proposed for the Hub, reviewed by the project's domain owners, or by
 *   the author's manager when the project has none (the handoff's reviewer rule).
 * - Team knowledge and team knowledge gaps for the manager Home.
 */
export function createManagerRoutes(container: Container) {
  const { db, identity } = container;
  const store = createPlatformStore(db);
  const learning = createLearningContent(container);
  const records = createOnboardingRecords(container);

  const personRef = (workspaceId: string, userId: string) =>
    records.personRef(workspaceId, userId) ?? { id: userId, name: "Former member", title: null };
  const managerOf = (workspaceId: string, userId: string) =>
    db
      .select({ managerId: memberships.managerId })
      .from(memberships)
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)))
      .get()?.managerId ?? null;

  /* ---- Review queue ---------------------------------------------------------------------- */

  const domainOwners = (workspaceId: string, projectId: string) =>
    db
      .select({ userId: assignments.userId })
      .from(assignments)
      .where(
        and(
          eq(assignments.workspaceId, workspaceId),
          eq(assignments.type, "domain_owner"),
          or(
            eq(assignments.scopeId, projectId),
            and(eq(assignments.scopeType, "workspace"), eq(assignments.scopeId, workspaceId)),
          ),
          or(isNull(assignments.expiresAt), gt(assignments.expiresAt, new Date())),
        ),
      )
      .all()
      .map((row) => row.userId);

  /** Who reviews a proposal: the project's domain owners, else the author's manager. Never the author. */
  const reviewersOf = (row: PlatformRecord) => {
    const owners = domainOwners(row.workspaceId, row.projectId!).filter((id) => id !== row.ownerId);
    if (owners.length) return owners;
    const manager = managerOf(row.workspaceId, row.ownerId);
    return manager && manager !== row.ownerId ? [manager] : [];
  };
  /** Proposals the caller may decide now, including the sources they must be able to open (PP-9). */
  const reviewable = (actor: Actor) =>
    store
      .listWhere(actor.workspaceId, "promotion", { status: "proposed" }, 500)
      .filter((row) => {
        if (!row.projectId || !reviewersOf(row).includes(actor.id)) return false;
        try {
          const allowed = new Set(identity.visibleSourceIds(actor, row.projectId));
          const sources = Array.isArray(row.data.sourceIds) ? row.data.sourceIds : [];
          return sources.every((id) => typeof id === "string" && allowed.has(id));
        } catch {
          return false;
        }
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const toReviewItem = (actor: Actor, row: PlatformRecord): ReviewItem => {
    const sourceIds = (Array.isArray(row.data.sourceIds) ? row.data.sourceIds : []).filter(
      (id): id is string => typeof id === "string",
    );
    const titles = row.projectId
      ? sourceIds.flatMap((id) => {
          try {
            const project = identity.requireProject(actor, row.projectId!);
            return [container.services.sources.get(project, id).title];
          } catch {
            return [];
          }
        })
      : [];
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    return {
      id: row.id,
      title: text(row.data.title) || text(row.data.question),
      kind: "article",
      section: "project",
      author: personRef(actor.workspaceId, row.ownerId),
      submittedAt: row.createdAt.toISOString(),
      before: null,
      after: [
        `Question: ${text(row.data.question)}`,
        "",
        ...text(row.data.answer).split("\n"),
        ...(text(row.data.note) ? ["", `Note from the author: ${text(row.data.note)}`] : []),
      ],
      sources: titles,
    };
  };

  /* ---- My learning ----------------------------------------------------------------------- */

  type PathItem = { id: string; estMinutes?: number; required?: boolean; dueOffsetDays?: number };
  const pathItems = (row: PlatformRecord | undefined) =>
    ((row?.data.items as PathItem[] | undefined) ?? []).filter((item) => item.required !== false);
  const minutesOf = (items: PathItem[]) =>
    items.reduce((sum, item) => sum + Number(item.estMinutes ?? 0), 0);
  const courseKind = (
    title: string,
    roleFamily: string,
  ): MyLearning["assigned"][number]["kind"] => {
    const text = `${title} ${roleFamily}`.toLowerCase();
    if (/review|readiness|probation/.test(text)) return "review";
    if (/decision|adr/.test(text)) return "decisions";
    if (/coach|1:1|one-on-one|feedback|manag|lead/.test(text)) return "coaching";
    return "project";
  };
  const readablePaths = (actor: Actor) =>
    store
      .listWhere(actor.workspaceId, "learning_path", { status: "published" }, 500)
      .filter((row) => {
        try {
          identity.requireProject(actor, row.projectId!);
          return typeof row.data.publishedVersionId === "string";
        } catch {
          return false;
        }
      });

  const myLearning = (actor: Actor): MyLearning => {
    const own = store
      .listOwned(actor, "path_assignment", actor.id, 200)
      .filter((row) => ["active", "completed"].includes(row.status));
    const assignedPathIds = new Set(own.map((row) => String(row.data.pathId)));
    const assigned = own
      .filter((row) => row.status === "active")
      .map((row) => {
        const version = row.parentId
          ? store.find(actor.workspaceId, "path_version", row.parentId)
          : undefined;
        const items = pathItems(version);
        const done = new Set(
          store
            .listWhere(actor.workspaceId, "item_progress", { parentId: row.id }, 1000)
            .filter((entry) => entry.status === "completed")
            .map((entry) => String(entry.data.itemId)),
        );
        const longest = Math.max(0, ...items.map((item) => Number(item.dueOffsetDays ?? 0)));
        const start =
          typeof row.data.startDate === "string" ? row.data.startDate : isoDay(row.createdAt);
        const by = typeof row.data.assignedBy === "string" ? row.data.assignedBy : null;
        return {
          id: String(row.data.pathId),
          title: typeof row.data.title === "string" ? row.data.title : "Course",
          kind: courseKind(str(row.data.title), str(version?.data.roleFamily)),
          reason:
            !by || by === actor.id
              ? "Added by you"
              : `Assigned by ${personRef(actor.workspaceId, by).name}`,
          dueOn: longest
            ? isoDay(new Date(Date.parse(`${start}T00:00:00Z`) + longest * DAY))
            : null,
          lessonCount: items.length,
          lessonsDone: items.filter((item) => done.has(item.id)).length,
          minutes: minutesOf(items),
        };
      });
    const completed = own
      .filter((row) => row.status === "completed")
      .map((row) => ({
        id: String(row.data.pathId),
        title: typeof row.data.title === "string" ? row.data.title : "Course",
        completedOn: isoDay(row.updatedAt),
      }));
    const suggested = readablePaths(actor)
      .filter((row) => !assignedPathIds.has(row.id))
      .map((row) => {
        const project = db
          .select({ name: projects.name })
          .from(projects)
          .where(eq(projects.id, row.projectId!))
          .get();
        const version = store.find(
          actor.workspaceId,
          "path_version",
          String(row.data.publishedVersionId),
        );
        return {
          id: row.id,
          title: String(row.data.title),
          kind: courseKind(str(row.data.title), str(row.data.roleFamily)),
          reason: `Published for ${str(row.data.roleFamily) || "everyone"} in ${project?.name ?? "a project"}`,
          minutes: minutesOf(pathItems(version)),
        };
      });
    // Onboarding is over once People Ops decided their probation, or 90 days after their start.
    const record = records.recordFor(actor, actor.id);
    const decision = record ? records.recordData(record).probation.decision : null;
    const member = records.activeMembers(actor.workspaceId).find((row) => row.userId === actor.id);
    const startDate =
      typeof member?.organization.startDate === "string" ? member.organization.startDate : null;
    const finished =
      decision?.decidedOn ??
      (startDate && Date.parse(`${startDate}T00:00:00Z`) + 90 * DAY <= Date.now()
        ? isoDay(new Date(Date.parse(`${startDate}T00:00:00Z`) + 90 * DAY))
        : null);
    // Tutorials: the ones they're taking outside a roadmap, and published ones they could add.
    const taking = learning
      .progressRows(actor.workspaceId, actor.id)
      .filter((row) => String(row.data.moduleKey).startsWith(TUTORIAL_PREFIX));
    const onRoadmap = new Set(
      (() => {
        const roadmap = learning.roadmapRow(actor.workspaceId, actor.id);
        return roadmap
          ? roadmapData(roadmap).modules.flatMap((entry) => entry.catalogId ?? [])
          : [];
      })(),
    );
    const tutorialKind = (kind: string): MyLearning["assigned"][number]["kind"] =>
      kind === "decisions"
        ? "decisions"
        : ["project", "systems", "product"].includes(kind)
          ? "project"
          : "other";
    for (const row of taking) {
      const data = row.data as unknown as ProgressData;
      const content = learning.tutorialContent(
        actor.workspaceId,
        String(data.moduleKey).slice(TUTORIAL_PREFIX.length),
        data.versionId,
      );
      if (!content) continue;
      if (data.completedAt) {
        completed.push({
          id: data.moduleKey,
          title: content.title,
          completedOn: data.completedAt.slice(0, 10),
        });
        continue;
      }
      const steps = content.lessons.length + (content.check ? 1 : 0);
      assigned.push({
        id: data.moduleKey,
        title: content.title,
        kind: tutorialKind(content.kind),
        reason:
          !data.assignedBy || data.assignedBy === actor.id
            ? "Added by you"
            : `Assigned by ${personRef(actor.workspaceId, data.assignedBy).name}`,
        dueOn: data.dueOn,
        lessonCount: steps,
        lessonsDone:
          content.lessons.filter((lesson) => data.lessonsDone.includes(lesson.id)).length +
          (content.check && data.passed ? 1 : 0),
        minutes: content.lessons.reduce((sum, lesson) => sum + lesson.minutes, 0),
      });
    }
    const takingKeys = new Set(taking.map((row) => String(row.data.moduleKey)));
    for (const row of store.listWhere(actor.workspaceId, TUTORIAL, { status: "published" }, 200)) {
      const key = `${TUTORIAL_PREFIX}${row.id}`;
      if (takingKeys.has(key) || onRoadmap.has(key) || !row.projectId) continue;
      try {
        identity.requireProject(actor, row.projectId);
      } catch {
        continue;
      }
      const content = learning.tutorialContent(actor.workspaceId, row.id);
      if (!content) continue;
      const project = db
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, row.projectId))
        .get();
      suggested.push({
        id: key,
        title: content.title,
        kind: tutorialKind(content.kind),
        reason: `A tutorial on ${project?.name ?? "a project"} for ${str(row.data.audience) || "everyone"}`,
        minutes: content.lessons.reduce((sum, lesson) => sum + lesson.minutes, 0),
      });
    }
    return { onboardingFinishedOn: finished, assigned, suggested, completed };
  };

  /* ---- Team knowledge ---------------------------------------------------------------------- */

  const requireReports = (actor: Actor) => {
    const reports = reportsOf(db, actor);
    if (actor.role !== "manager" && !reports.length)
      throw new AppError(403, "FORBIDDEN", "Team views are for managers");
    return reports;
  };

  return new Hono<AppEnv>()
    .get("/me/learning", (c) => c.json(myLearning(c.get("actor"))))
    .get("/me/learning/:id", (c) => {
      const actor = c.get("actor");
      const row = store
        .listOwned(actor, "path_assignment", actor.id, 200)
        .find(
          (entry) =>
            entry.data.pathId === c.req.param("id") &&
            ["active", "completed"].includes(entry.status),
        );
      if (!row) throw new NotFoundError("Course");
      const version = row.parentId
        ? store.find(actor.workspaceId, "path_version", row.parentId)
        : undefined;
      const items = (version?.data.items ?? []) as Array<{
        id: string;
        title: string;
        objective: string;
        estMinutes?: number;
        required?: boolean;
        url?: string;
        verification?: CourseDetail["items"][number]["verification"];
        prerequisites?: string[];
      }>;
      const progress = new Map(
        store
          .listWhere(actor.workspaceId, "item_progress", { parentId: row.id }, 1000)
          .map((entry) => [String(entry.data.itemId), entry]),
      );
      const finished = (id: string) => progress.get(id)?.status === "completed";
      const required = items.filter((item) => item.required !== false);
      const STATE: Record<string, CourseDetail["items"][number]["state"]> = {
        in_progress: "in_progress",
        awaiting_verification: "awaiting_signoff",
        completed: "done",
        skipped: "skipped",
      };
      return c.json({
        id: String(row.data.pathId),
        assignmentId: row.id,
        title: typeof row.data.title === "string" ? row.data.title : "Course",
        percent: required.length
          ? Math.round(
              (required.filter((item) => finished(item.id)).length / required.length) * 100,
            )
          : 0,
        remainingMinutes: minutesOf(items.filter((item) => !finished(item.id))),
        items: items.map((item) => {
          const entry = progress.get(item.id);
          return {
            id: item.id,
            title: item.title,
            objective: item.objective,
            minutes: Number(item.estMinutes ?? 0),
            required: item.required !== false,
            url: item.url ?? null,
            verification: item.verification ?? "signoff",
            state: (entry && STATE[entry.status]) ?? "not_started",
            version: entry?.version ?? null,
            locked: !(item.prerequisites ?? []).every(finished),
          };
        }),
      } satisfies CourseDetail);
    })
    .post("/me/learning/:id/add", (c) => {
      const actor = c.get("actor");
      if (actor.role === "guest") throw new AppError(403, "FORBIDDEN", "Guests cannot add courses");
      // A tutorial: start taking it from My learning.
      if (c.req.param("id").startsWith(TUTORIAL_PREFIX)) {
        const key = c.req.param("id");
        const content = learning.tutorialContent(
          actor.workspaceId,
          key.slice(TUTORIAL_PREFIX.length),
        );
        const tutorial = learning.tutorialRow(actor.workspaceId, key.slice(TUTORIAL_PREFIX.length));
        if (!content?.projectId || tutorial?.status !== "published")
          throw new NotFoundError("Course");
        identity.requireProject(actor, content.projectId);
        if (learning.progressFor(actor.workspaceId, actor.id, key))
          throw new AppError(409, "CONFLICT", "This course is already yours");
        learning.startProgress(actor.workspaceId, actor.id, key, content, {
          placement: "my_learning",
          assignedBy: actor.id,
        });
        container.audit.record({
          actor,
          action: "tutorial.enrol",
          targetType: "tutorial",
          targetId: content.tutorialId!,
        });
        return c.json(myLearning(actor));
      }
      const path = readablePaths(actor).find((row) => row.id === c.req.param("id"));
      if (!path) throw new NotFoundError("Course");
      const existing = store
        .listOwned(actor, "path_assignment", actor.id, 200)
        .find((row) => row.data.pathId === path.id && ["active", "completed"].includes(row.status));
      if (existing) throw new AppError(409, "CONFLICT", "This course is already yours");
      const row = store.create(
        actor,
        "path_assignment",
        {
          userId: actor.id,
          mentorId: null,
          startDate: isoDay(new Date()),
          assignedBy: actor.id,
          selfEnrolled: true,
          pathId: path.id,
          title: path.data.title,
        },
        {
          projectId: path.projectId!,
          parentId: String(path.data.publishedVersionId),
          status: "active",
        },
      );
      container.audit.record({
        actor,
        action: "path.enrol",
        targetType: "assignment",
        targetId: row.id,
      });
      return c.json(myLearning(actor));
    })
    .get("/me/reviews", (c) => {
      const actor = c.get("actor");
      const since = new Date(Date.now() - 7 * DAY);
      const reviewedRecently = store
        .listWhere(actor.workspaceId, "promotion", {}, 500)
        .filter((row) => {
          const decisions = Array.isArray(row.data.decisions) ? row.data.decisions : [];
          return decisions.some(
            (entry: { by?: string; at?: string }) =>
              entry.by === actor.id && typeof entry.at === "string" && new Date(entry.at) >= since,
          );
        }).length;
      return c.json({
        items: reviewable(actor).map((row) => toReviewItem(actor, row)),
        reviewedRecently,
      });
    })
    .post(
      "/me/reviews/:id/decision",
      zValidator("json", ReviewDecisionInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const row = store.find(actor.workspaceId, "promotion", c.req.param("id"));
        if (!row) throw new NotFoundError("Review item");
        if (row.status !== "proposed")
          throw new AppError(409, "CONFLICT", "This was already reviewed");
        if (!reviewable(actor).some((entry) => entry.id === row.id))
          throw new NotFoundError("Review item");
        const input = c.req.valid("json");
        const project = identity.requireProject(actor, row.projectId!);
        decidePromotion(container, actor, row, project, {
          accepted: input.decision === "approve",
          reason: input.comment.trim() || (input.decision === "approve" ? "" : "Changes requested"),
          version: row.version,
        });
        return c.json({
          id: row.id,
          status:
            input.decision === "approve" ? ("published" as const) : ("changes_requested" as const),
        });
      },
    )
    .get("/team/knowledge", (c) => {
      const actor = c.get("actor");
      const team = [actor.id, ...requireReports(actor)];
      // Pages the team owns: context items in projects one of them is a domain owner of.
      const ownedProjects = new Set(
        db
          .select({ scopeId: assignments.scopeId, scopeType: assignments.scopeType })
          .from(assignments)
          .where(
            and(
              eq(assignments.workspaceId, actor.workspaceId),
              eq(assignments.type, "domain_owner"),
              inArray(assignments.userId, team),
              or(isNull(assignments.expiresAt), gt(assignments.expiresAt, new Date())),
            ),
          )
          .all()
          .flatMap((row) =>
            row.scopeType === "project"
              ? [row.scopeId]
              : row.scopeType === "section"
                ? [row.scopeId.split(":")[0]!]
                : [],
          ),
      );
      let owned = 0;
      let needsReview = 0;
      for (const projectId of ownedProjects) {
        try {
          const project = identity.requireProject(actor, projectId);
          const items = container.services.context.listItems(project, undefined, actor);
          owned += items.length;
          needsReview += items.filter((item) =>
            ["stale", "disputed"].includes(item.verification),
          ).length;
        } catch {
          // A project they can't open doesn't count.
        }
      }
      const queue = reviewable(actor).map((row) => ({
        id: row.id,
        title: typeof row.data.title === "string" ? row.data.title : "Proposed answer",
        kind: "article" as const,
        author: personRef(actor.workspaceId, row.ownerId),
        submittedAt: row.createdAt.toISOString(),
      }));
      return c.json({ owned, needsReview, awaitingYou: queue.length, queue });
    })
    .get("/team/knowledge-gaps", (c) => {
      const actor = c.get("actor");
      const team = requireReports(actor);
      if (!team.length) return c.json({ items: [] });
      const since = new Date(Date.now() - 30 * DAY);
      const threshold = workspaceSettings(db, actor.workspaceId).policies.askKAnonymityThreshold;
      const gaps = new Map<
        string,
        {
          question: string;
          askers: Set<string>;
          asks: number;
          projects: Set<string>;
          reported: boolean;
        }
      >();
      const add = (
        question: string,
        askerId: string,
        project: string | null,
        reported: boolean,
      ) => {
        const key = question.trim().toLocaleLowerCase();
        const entry = gaps.get(key) ?? {
          question: question.trim(),
          askers: new Set<string>(),
          asks: 0,
          projects: new Set<string>(),
          reported: false,
        };
        entry.askers.add(askerId);
        entry.asks += 1;
        if (project) entry.projects.add(project);
        entry.reported ||= reported;
        gaps.set(key, entry);
      };
      // Unanswered Ask questions from the team: Ask history is private, so a question only surfaces
      // once enough different people on the team asked it.
      const rows = db
        .select({
          question: questions.question,
          actorId: questions.actorId,
          answer: questions.answer,
          projectName: projects.name,
        })
        .from(questions)
        .innerJoin(projects, eq(projects.id, questions.projectId))
        .where(
          and(
            eq(projects.workspaceId, actor.workspaceId),
            inArray(questions.actorId, team),
            gte(questions.createdAt, since),
          ),
        )
        .all();
      for (const row of rows)
        if (row.answer.confidence === "insufficient")
          add(row.question, row.actorId, row.projectName, false);
      // Gaps people reported themselves are shared on purpose.
      for (const gap of store.listWhere(actor.workspaceId, "knowledge_gap", {}, 500))
        if (
          team.includes(gap.ownerId) &&
          gap.createdAt >= since &&
          typeof gap.data.question === "string"
        )
          add(gap.data.question, gap.ownerId, null, true);
      const items: KnowledgeGap[] = [...gaps.entries()]
        .filter(([, entry]) => entry.reported || entry.askers.size >= threshold)
        .sort((a, b) => b[1].asks - a[1].asks)
        .slice(0, 10)
        .map(([key, entry]) => ({
          id: `gap:${Buffer.from(key).toString("base64url").slice(0, 40)}`,
          question: entry.question,
          reason: "no_answer",
          detail: `Asked ${entry.asks === 1 ? "once" : `${entry.asks} times`} by your team this month. No page answers it.`,
          askedCount: entry.asks,
          section: null,
          related: [...entry.projects],
          suggestedKind: "article",
          target: null,
        }));
      // Pages the team flagged as out of date or conflicting, still open: the manager can open them
      // ("Review sources") or add their voice to the flag ("Request update").
      const flagged = new Map<string, KnowledgeGap>();
      for (const flag of store.listWhere(actor.workspaceId, "flag", {}, 500)) {
        const kind = flag.data.kind;
        const reporters = [
          flag.ownerId,
          ...(Array.isArray(flag.data.coReporters) ? (flag.data.coReporters as string[]) : []),
        ].filter((id) => team.includes(id));
        if (
          (kind !== "stale" && kind !== "conflicting") ||
          !FLAG_OPEN.includes(flag.status) ||
          !flag.projectId ||
          !reporters.length ||
          flag.createdAt < since
        )
          continue;
        const target = FlagTargetTypeSchema.safeParse(flag.data.targetType);
        const targetId = str(flag.data.targetId);
        if (!target.success || !targetId) continue;
        let title: string;
        try {
          const project = identity.requireProject(actor, flag.projectId);
          title =
            target.data === "context_item"
              ? (container.services.context
                  .listItems(project, undefined, actor)
                  .find((item) => item.id === targetId)?.title ?? project.name)
              : project.name;
        } catch {
          continue; // A project the manager can't open stays out of their Home.
        }
        const key = `${flag.projectId}:${target.data}:${targetId}:${kind}`;
        const existing = flagged.get(key);
        if (existing) {
          existing.askedCount += reporters.length;
          continue;
        }
        flagged.set(key, {
          id: `flag:${flag.id}`,
          question:
            kind === "stale" ? `Is “${title}” still current?` : `Which is right about “${title}”?`,
          reason: kind === "stale" ? "stale" : "conflict",
          detail: kind === "stale" ? "Flagged as out of date" : "Sources disagree",
          askedCount: reporters.length,
          section: null,
          related: [title],
          suggestedKind: "edit",
          target: { projectId: flag.projectId, targetType: target.data, targetId },
        });
      }
      return c.json({
        items: [...items, ...flagged.values()]
          .sort((a, b) => b.askedCount - a.askedCount)
          .slice(0, 10),
      });
    });
}
