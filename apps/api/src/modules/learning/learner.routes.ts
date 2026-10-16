import {
  CheckAttemptInputSchema,
  LearningRatingInputSchema,
  LearningRequestInputSchema,
  LessonCompletionInputSchema,
  type CheckResult,
  type KnowledgeCheck,
  type Lesson,
  type LearningSource,
  type LearningTarget,
  type Milestone,
  type ModuleDetail,
  type ModuleLesson,
  type MyOnboarding,
  type MyRoadmap,
  type MyTask,
  type NextUp,
  type RevisitList,
  type RoadmapModule as LearnerModule,
  type LearningRequest,
  type LearningRequestInput,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { memberships, sourceObjects } from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { createNotifier } from "../platform/notify.js";
import { createCheckPause } from "./check-pause.js";
import { createOnboardingRecords } from "../platform/onboarding-records.js";
import {
  addDays,
  roadmapData,
  type RoadmapData,
  type RoadmapModule,
} from "../platform/onboarding-roadmap.js";
import type { PlatformRecord } from "../platform/store.js";
import {
  createLearningContent,
  learnerKind,
  TUTORIAL_PREFIX,
  type ModuleContent,
  type ProgressData,
} from "./content.js";

/*
 * The learner's side of onboarding and tutorials (handoff §7.1, the employee Home cards in §7.2):
 * My roadmap, a module, a lesson, a knowledge check, ratings, requests, "Up next", tasks and
 * milestones. Everything is read from the database: the roadmap record HR and the manager use,
 * published tutorial versions, and the learner's own progress.
 *
 * Module ids: a roadmap module's id, or `tutorial-<id>` for a tutorial taken outside a roadmap.
 * Lesson ids are `<moduleId>~<lessonId>`; a module's knowledge check is `<moduleId>~check`.
 */

const today = () => new Date().toISOString().slice(0, 10);
const DAY = 86_400_000;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const splitId = (id: string) => {
  const at = id.lastIndexOf("~");
  return at < 0 ? null : { moduleId: id.slice(0, at), part: id.slice(at + 1) };
};
/** Plain text from Markdown, for one-line summaries. */
const plain = (markdown: string) =>
  markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`|[\]()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const firstSentence = (markdown: string) => {
  const text = plain(markdown);
  const end = text.search(/[.!?](\s|$)/);
  return (end > 0 ? text.slice(0, end + 1) : text).slice(0, 280);
};

interface Resolved {
  key: string;
  content: ModuleContent;
  progress: PlatformRecord | null;
  data: ProgressData | null;
  /** The roadmap module, for modules on a roadmap. */
  module: RoadmapModule | null;
  roadmap: PlatformRecord | null;
  stage: { id: string; name: string; moduleCount: number; opensOn: string | null };
  number: number;
  locked: boolean;
  questions: NonNullable<ModuleContent["check"]>["questions"];
  lessonOpen: (lesson: ModuleContent["lessons"][number]) => boolean;
  /** False when the learner can't open every source behind it: nothing of it is shown. */
  open: boolean;
}

/** The revisit mark for the module itself, beside its lesson ids. */
const MODULE_MARK = "module";

export function createLearnerRoutes(container: Container) {
  const { db, identity, audit } = container;
  const learning = createLearningContent(container);
  const { store } = learning;
  const records = createOnboardingRecords(container);
  const notifier = createNotifier(db);
  const checkPause = createCheckPause(db);

  /* ---- Resolving modules ------------------------------------------------------------------- */

  const stageWindow = (plan: RoadmapData, stageId: string) => {
    const stage = plan.stages.find((entry) => entry.id === stageId);
    return stage
      ? {
          stage,
          startsOn: addDays(plan.startDate, (stage.weekStart - 1) * 7),
          endsOn: addDays(plan.startDate, stage.weekEnd * 7 - 1),
        }
      : null;
  };
  /** Stage modules in learning order: by due date. */
  const stageModules = (plan: RoadmapData, stageId: string) =>
    plan.modules
      .filter((entry) => entry.stageId === stageId)
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const minutesFor = (workspaceId: string, module: RoadmapModule) =>
    module.catalogId ? (records.catalog(workspaceId).get(module.catalogId)?.minutes ?? null) : null;

  const contentFor = (workspaceId: string, module: RoadmapModule, pinned?: string | null) =>
    learning.forModule(
      workspaceId,
      { catalogId: module.catalogId, title: module.title, kind: module.kind, note: module.note },
      minutesFor(workspaceId, module),
      pinned,
    );

  const finish = (
    actor: Actor,
    key: string,
    content: ModuleContent,
    rest: Omit<
      Resolved,
      "key" | "content" | "progress" | "data" | "questions" | "lessonOpen" | "open"
    >,
  ): Resolved => {
    const progress = learning.progressFor(actor.workspaceId, actor.id, key);
    const gate = learning.access(actor, content);
    return {
      key,
      content,
      progress,
      data: learning.progressData(progress),
      questions: gate.questions,
      lessonOpen: gate.lessonOpen,
      open: gate.open,
      ...rest,
    };
  };

  /** A module the caller may learn from, or 404. */
  const resolve = (actor: Actor, key: string): Resolved => {
    const ws = actor.workspaceId;
    if (key.startsWith(TUTORIAL_PREFIX)) {
      const progress = learning.progressFor(ws, actor.id, key);
      const content = learning.forModule(
        ws,
        { catalogId: key, title: "", kind: "project" },
        null,
        learning.progressData(progress)?.versionId,
      );
      if (!content.tutorialId || !content.projectId) throw new NotFoundError("Module");
      identity.requireProject(actor, content.projectId);
      const tutorial = learning.tutorialRow(ws, content.tutorialId);
      if (!progress && tutorial?.status !== "published") throw new NotFoundError("Module");
      return finish(actor, key, content, {
        module: null,
        roadmap: null,
        stage: { id: "my-learning", name: "My learning", moduleCount: 1, opensOn: null },
        number: 1,
        locked: false,
      });
    }
    const roadmap = learning.roadmapRow(ws, actor.id);
    const plan = roadmap ? roadmapData(roadmap) : null;
    const module = plan?.modules.find((entry) => entry.id === key);
    if (!roadmap || !plan || !module) throw new NotFoundError("Module");
    const progress = learning.progressFor(ws, actor.id, key);
    const content = contentFor(ws, module, learning.progressData(progress)?.versionId);
    const window = stageWindow(plan, module.stageId);
    const siblings = stageModules(plan, module.stageId);
    // Modules in a stage that hasn't opened wait, unless someone assigned them on purpose.
    const locked =
      module.status !== "done" &&
      !module.assignedBy &&
      Boolean(window && window.startsOn > today());
    return finish(actor, key, content, {
      module,
      roadmap,
      stage: {
        id: module.stageId,
        name: window?.stage.name ?? "Assigned learning",
        moduleCount: siblings.length,
        opensOn: locked ? (window?.startsOn ?? null) : null,
      },
      number: Math.max(1, siblings.findIndex((entry) => entry.id === module.id) + 1),
      locked,
    });
  };

  const isDone = (resolved: Resolved) =>
    resolved.module?.status === "done" ||
    Boolean(resolved.data?.completedAt) ||
    learning.isComplete(resolved.content, resolved.data, resolved.questions.length);
  const fraction = (resolved: Resolved) =>
    isDone(resolved)
      ? 1
      : learning.fraction(resolved.content, resolved.data, resolved.questions.length);
  const status = (resolved: Resolved): LearnerModule["status"] =>
    isDone(resolved)
      ? "done"
      : resolved.locked
        ? "locked"
        : resolved.data &&
            (resolved.data.lessonsDone.length ||
              resolved.data.attempts.length ||
              resolved.module?.status === "active")
          ? "active"
          : resolved.module?.status === "active"
            ? "active"
            : "todo";

  const lessonsOf = (resolved: Resolved): ModuleLesson[] => {
    if (resolved.locked) return [];
    const lessons: ModuleLesson[] = resolved.content.lessons.map((lesson, index) => ({
      id: `${resolved.key}~${lesson.id}`,
      number: index + 1,
      title: resolved.lessonOpen(lesson) ? lesson.title : `${lesson.title} (restricted)`,
      type: lesson.type,
      minutes: lesson.minutes,
      questionCount: null,
      done: Boolean(resolved.data?.lessonsDone.includes(lesson.id)) || isDone(resolved),
      restricted: !resolved.lessonOpen(lesson),
      revisit: revisitOf(resolved).includes(lesson.id),
    }));
    if (resolved.content.check && resolved.questions.length)
      lessons.push({
        id: `${resolved.key}~check`,
        number: lessons.length + 1,
        title: "Knowledge check",
        type: "check",
        minutes: Math.max(2, Math.ceil(resolved.questions.length * 0.75)),
        questionCount: resolved.questions.length,
        done: Boolean(resolved.data?.passed) || isDone(resolved),
      });
    return lessons;
  };
  const totalMinutes = (content: ModuleContent) =>
    content.lessons.reduce((sum, lesson) => sum + lesson.minutes, 0) +
    (content.check ? Math.ceil(content.check.questions.length * 0.75) : 0);
  const resultOf = (resolved: Resolved) => {
    if (resolved.module?.result) return resolved.module.result;
    const best = resolved.data?.attempts.filter((attempt) => attempt.passed).at(-1);
    return best ? `Passed ${best.score} of ${best.total}` : isDone(resolved) ? "Completed" : null;
  };
  const completedOn = (resolved: Resolved) =>
    resolved.module?.completedOn ?? resolved.data?.completedAt?.slice(0, 10) ?? null;

  /** What to open next: the first unfinished lesson, then the check. */
  const resumeOf = (resolved: Resolved): LearningTarget | null => {
    const lessons = lessonsOf(resolved);
    const next = lessons.find((lesson) => !lesson.done);
    if (!next) return null;
    return next.type === "check" ? { kind: "check", id: next.id } : { kind: "lesson", id: next.id };
  };

  const ownerRef = (workspaceId: string, content: ModuleContent) =>
    content.ownerId ? records.personRef(workspaceId, content.ownerId) : null;

  /** Lesson ids, and `MODULE_MARK` for the module itself, the learner marked to come back to. */
  const revisitOf = (resolved: Resolved) => resolved.data?.revisit ?? [];

  /** Modules of the caller's roadmap in order (stages, then due date). */
  const roadmapModules = (actor: Actor) => {
    const roadmap = learning.roadmapRow(actor.workspaceId, actor.id);
    if (!roadmap) return [];
    const plan = roadmapData(roadmap);
    const order = new Map(plan.stages.map((stage, index) => [stage.id, index]));
    return [...plan.modules]
      .sort(
        (a, b) =>
          (order.get(a.stageId) ?? 99) - (order.get(b.stageId) ?? 99) ||
          a.dueOn.localeCompare(b.dueOn),
      )
      .map((module) => resolve(actor, module.id));
  };
  /** Tutorials taken outside a roadmap (My learning), newest first. */
  const standalone = (actor: Actor) =>
    learning
      .progressRows(actor.workspaceId, actor.id)
      .filter((row) => String(row.data.moduleKey).startsWith(TUTORIAL_PREFIX))
      .flatMap((row) => {
        try {
          return [resolve(actor, String(row.data.moduleKey))];
        } catch {
          return [];
        }
      });

  /* ---- Recording progress ------------------------------------------------------------------ */

  const recordFor = (actor: Actor) => records.recordFor(actor, actor.id);

  /** Save progress; mirror it onto the roadmap module when the module is on one. */
  const save = (actor: Actor, resolved: Resolved, change: Partial<ProgressData>) => {
    const row =
      resolved.progress ??
      learning.startProgress(
        actor.workspaceId,
        actor.id,
        resolved.key,
        resolved.content,
        resolved.module ? {} : { placement: "my_learning" },
      );
    const next = learning.patchProgress(row, change);
    const data = learning.progressData(next)!;
    const done = learning.isComplete(resolved.content, data, resolved.questions.length);
    const finished = done && !data.completedAt;
    const saved = finished
      ? learning.patchProgress(next, { completedAt: new Date().toISOString() })
      : next;
    if (resolved.module) {
      const best = data.attempts.filter((attempt) => attempt.passed).at(-1);
      const last = data.attempts.at(-1);
      learning.syncRoadmapModule(
        actor.workspaceId,
        actor.id,
        resolved.module.id,
        {
          status: done ? "done" : "active",
          completedOn: done ? (resolved.module.completedOn ?? today()) : null,
          attempts: data.attempts.length,
          passed: last ? last.passed : resolved.module.passed,
          result: best
            ? `Passed ${best.score} of ${best.total}`
            : last
              ? `Scored ${last.score} of ${last.total}`
              : done
                ? "Completed"
                : null,
        },
        finished ? `${actor.name} finished “${resolved.module.title}”` : undefined,
      );
    }
    return { row: saved, done };
  };

  /* ---- Views ------------------------------------------------------------------------------- */

  const learnerModule = (resolved: Resolved, workspaceId: string): LearnerModule => ({
    id: resolved.key,
    number: resolved.number,
    title: resolved.module?.title ?? resolved.content.title,
    kind: learnerKind(resolved.module?.kind ?? resolved.content.kind),
    status: status(resolved),
    summary: resolved.open ? firstSentence(resolved.content.summary) || null : null,
    lessonCount: lessonsOf(resolved).length || resolved.content.lessons.length,
    minutes: totalMinutes(resolved.content) || null,
    duration: null,
    progress: fraction(resolved),
    dueOn: resolved.module?.dueOn ?? resolved.data?.dueOn ?? null,
    completedOn: completedOn(resolved),
    result: resultOf(resolved),
    note: resolved.module?.assignedBy
      ? `Assigned by ${records.personRef(workspaceId, resolved.module.assignedBy)?.name ?? "your manager"}${resolved.module.note ? `: ${resolved.module.note}` : ""}`
      : resolved.module?.postponed
        ? "Moved by your manager"
        : null,
    owner: ownerRef(workspaceId, resolved.content),
  });

  const sourcesOf = (actor: Actor, content: ModuleContent): LearningSource[] => {
    const ids = [...new Set(content.lessons.flatMap((lesson) => lesson.sourceIds))];
    if (!ids.length) return [];
    let visible = new Set<string>();
    try {
      visible = content.projectId
        ? new Set(identity.visibleSourceIds(actor, content.projectId))
        : visible;
    } catch {
      // Not in the project: everything shows as restricted.
    }
    return db
      .select()
      .from(sourceObjects)
      .where(inArray(sourceObjects.id, ids))
      .all()
      .filter((source) => source.projectId === content.projectId && visible.has(source.id))
      .map((source) => ({
        id: source.id,
        title: source.title,
        label:
          source.connector === "google_drive"
            ? "Google Drive"
            : source.kind === "document"
              ? "Document"
              : source.kind.replaceAll("_", " "),
        origin:
          source.connector === "google_drive"
            ? ("google_drive" as const)
            : ("knowledge_hub" as const),
        owner: source.author,
        updatedAt: (source.sourceUpdatedAt ?? source.ingestedAt).toISOString(),
        restrictedTo: visible.has(source.id) ? null : "People with access in its tool",
        url:
          visible.has(source.id) && source.url && /^https?:\/\//.test(source.url)
            ? source.url
            : null,
        projectId: source.projectId,
      }));
  };

  /**
   * Access to the sources behind a module's restricted lessons. Admins share pasted sources from the
   * project's Sources page; Drive files are shared in Drive. The person asking never sees the
   * titles of sources they can't open; the admins do.
   */
  const requestAccess = (
    actor: Actor,
    resolved: Resolved | null,
    input: LearningRequestInput,
  ): LearningRequest => {
    if (!resolved) throw new BadRequestError("Say which module the lesson is in");
    const ids = [...new Set(resolved.content.lessons.flatMap((lesson) => lesson.sourceIds))];
    let visible = new Set<string>();
    try {
      if (resolved.content.projectId)
        visible = new Set(identity.visibleSourceIds(actor, resolved.content.projectId));
    } catch {
      // Not in the project: nothing in it is open to them.
    }
    const missing = ids.filter((id) => !visible.has(id));
    if (!missing.length)
      throw new AppError(409, "CONFLICT", "You can already open everything in this module");
    const admins = db
      .select({ userId: memberships.userId, role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.status, "active")))
      .all()
      .filter((row) => ["owner", "admin"].includes(row.role) && row.userId !== actor.id);
    const recipient = admins[0] ? records.personRef(actor.workspaceId, admins[0].userId) : null;
    if (!recipient)
      throw new AppError(409, "CONFLICT", "There's no admin to ask yet; ask your manager");
    const row = store.create(
      actor,
      "learning_request",
      { ...input, recipientId: recipient.id, sourceIds: missing },
      { status: "open" },
    );
    const titles = db
      .select({ title: sourceObjects.title })
      .from(sourceObjects)
      .where(inArray(sourceObjects.id, missing))
      .all()
      .map((source) => `“${source.title}”`);
    const about = resolved.module?.title ?? resolved.content.title;
    notifier.notifyAdmins(actor.workspaceId, {
      type: "learning.access_request",
      category: "maintenance",
      title: `${actor.name} asked for access to the sources behind “${about}”`,
      body: `${titles.join(", ")}. Share pasted sources from the project's Sources page; Drive files are shared in Google Drive.`,
      link: resolved.content.projectId
        ? `/projects/${resolved.content.projectId}/sources`
        : "/knowledge",
    });
    audit.record({
      actor,
      action: "learning.request",
      targetType: "learning_request",
      targetId: row.id,
      metadata: { type: "access", sources: missing.length },
    });
    return { id: row.id, recipient };
  };

  const roadmapView = (actor: Actor): MyRoadmap => {
    const ws = actor.workspaceId;
    const record = recordFor(actor);
    const roadmap =
      (record ? records.roadmapFor(record) : null) ?? learning.roadmapRow(ws, actor.id);
    if (!roadmap) throw new NotFoundError("Onboarding roadmap");
    const plan = roadmapData(roadmap);
    const modules = roadmapModules(actor);
    const view = record ? records.evaluate(record) : null;
    const template = plan.templateId ? records.findTemplate(ws, plan.templateId) : undefined;
    const templateInfo = template ? records.templateData(template) : null;
    const now = today();
    const window = (stage: RoadmapData["stages"][number]) => ({
      startsOn: addDays(plan.startDate, (stage.weekStart - 1) * 7),
      endsOn: addDays(plan.startDate, stage.weekEnd * 7 - 1),
    });
    // The first stage still ahead is "next"; past stages are done, the one we're in is current.
    const nextStage = plan.stages.find((stage) => window(stage).startsOn > now)?.id;
    const stages = plan.stages.map((stage) => {
      const { startsOn, endsOn } = window(stage);
      const inStage = modules.filter((entry) => entry.module?.stageId === stage.id);
      return {
        id: stage.id,
        name: stage.name,
        weekStart: stage.weekStart,
        weekEnd: stage.weekEnd,
        startsOn,
        endsOn,
        state:
          endsOn < now
            ? "done"
            : startsOn <= now
              ? "current"
              : stage.id === nextStage
                ? "next"
                : "later",
        goal: inStage.length
          ? `Finish ${inStage.length} module${inStage.length === 1 ? "" : "s"} by ${endsOn}`
          : "Nothing to do in this stage yet",
        modules: inStage.map((entry) => learnerModule(entry, ws)),
      } satisfies MyRoadmap["stages"][number];
    });
    const withChecks = modules.filter((entry) => entry.questions.length > 0);
    const data = record ? records.recordData(record) : null;
    const assigners = plan.modules.flatMap((entry) => (entry.assignedBy ? [entry.assignedBy] : []));
    return {
      template: {
        name: templateInfo?.name ?? "Assigned learning",
        version: `v${templateInfo?.publishedVersion ?? templateInfo?.version ?? 1}`,
      },
      adjustedBy: assigners.length ? records.personRef(ws, assigners.at(-1)!) : null,
      team: identity.requireMemberOptional(ws, actor.id)
        ? records.teamName(ws, identity.requireMemberOptional(ws, actor.id)!.organization)
        : null,
      startDate: plan.startDate,
      totalDays: (templateInfo?.weeks ?? Math.ceil(records.probationDays(ws) / 7)) * 7,
      status: view?.status ?? "on_track",
      progress:
        view?.progress ?? (modules.length ? modules.filter(isDone).length / modules.length : 0),
      expected: view?.expected ?? 0,
      checks: {
        done: withChecks.filter((entry) => Boolean(entry.data?.passed) || isDone(entry)).length,
        total: withChecks.length,
      },
      stages,
      probationReviewOn: data?.probation.reviewOn ?? null,
      buddy: data?.buddyId ? records.personRef(ws, data.buddyId) : null,
      history: modules
        .filter(isDone)
        .map((entry) => ({
          id: entry.key,
          kind:
            entry.questions.length > 0
              ? ("check" as const)
              : entry.content.lessons.every((lesson) => lesson.type === "practical")
                ? ("practical" as const)
                : ("module" as const),
          title: entry.module?.title ?? entry.content.title,
          completedOn: completedOn(entry) ?? now,
          result: resultOf(entry) ?? "Completed",
        }))
        .sort((a, b) => b.completedOn.localeCompare(a.completedOn)),
    };
  };

  const moduleView = (actor: Actor, resolved: Resolved): ModuleDetail => {
    const ws = actor.workspaceId;
    const publisher = resolved.content.publishedBy
      ? records.personRef(ws, resolved.content.publishedBy)
      : null;
    const owner = ownerRef(ws, resolved.content);
    return {
      id: resolved.key,
      number: resolved.number,
      title: resolved.module?.title ?? resolved.content.title,
      kind: learnerKind(resolved.module?.kind ?? resolved.content.kind),
      status: status(resolved),
      stage: resolved.stage,
      objective: resolved.open
        ? plain(resolved.content.summary) || `Learn ${resolved.content.title || "this module"}.`
        : "This tutorial uses sources you can't open yet. Ask for access in the tool they live in, then come back to it.",
      objectives: resolved.open ? resolved.content.objectives : [],
      minutes: totalMinutes(resolved.content) || null,
      duration: null,
      owner,
      updatedAt: resolved.content.publishedAt,
      reviewedBy: publisher?.name ?? null,
      progress: fraction(resolved),
      completedOn: completedOn(resolved),
      result: resultOf(resolved),
      lessons: lessonsOf(resolved),
      sources: resolved.open ? sourcesOf(actor, resolved.content) : [],
      people: [
        ...(owner ? [{ person: owner, role: "Module owner" }] : []),
        ...(publisher && publisher.id !== owner?.id
          ? [{ person: publisher, role: "Reviewed this tutorial" }]
          : []),
      ],
      suggestedQuestion: `What should I know about ${resolved.module?.title ?? resolved.content.title}?`,
      rating: resolved.data?.ratings[resolved.key] ?? null,
      revisit: revisitOf(resolved).includes(MODULE_MARK),
    };
  };

  /** The module to take after this one: the next unlocked one that isn't finished. */
  const nextAfter = (actor: Actor, key: string) => {
    const next = [...roadmapModules(actor), ...standalone(actor)].find(
      (entry) => entry.key !== key && !entry.locked && !isDone(entry),
    );
    return next ? { id: next.key, title: next.module?.title ?? next.content.title } : null;
  };

  /* ---- Revisit later ------------------------------------------------------------------------ */

  /** Mark or unmark a lesson (`<moduleId>~<lessonId>`) or a module. Progress and status don't change. */
  const setRevisit = (actor: Actor, id: string, on: boolean) => {
    const { resolved, mark } = id.includes("~")
      ? (({ resolved, lesson }) => ({ resolved, mark: lesson.id }))(lessonParam(actor, id))
      : { resolved: resolve(actor, id), mark: MODULE_MARK };
    // Written straight to the progress record: `save` would also mark the roadmap module active.
    const row =
      resolved.progress ??
      learning.startProgress(
        actor.workspaceId,
        actor.id,
        resolved.key,
        resolved.content,
        resolved.module ? {} : { placement: "my_learning" },
      );
    const current = learning.progressData(row)?.revisit ?? [];
    learning.patchProgress(row, {
      revisit: on ? [...new Set([...current, mark])] : current.filter((entry) => entry !== mark),
    });
    return { revisit: on };
  };

  const revisitList = (actor: Actor): RevisitList => ({
    items: [...roadmapModules(actor), ...standalone(actor)].flatMap((resolved) => {
      const marks = revisitOf(resolved);
      const module = { id: resolved.key, title: resolved.module?.title ?? resolved.content.title };
      return [
        ...(marks.includes(MODULE_MARK)
          ? [{ id: module.id, kind: "module" as const, title: module.title, module }]
          : []),
        ...resolved.content.lessons
          .filter((lesson) => marks.includes(lesson.id))
          .map((lesson) => ({
            id: `${resolved.key}~${lesson.id}`,
            kind: "lesson" as const,
            title: lesson.title,
            module,
          })),
      ];
    }),
  });

  const nextUp = (actor: Actor): NextUp | null => {
    const candidates = [...roadmapModules(actor), ...standalone(actor)].filter(
      (entry) => !entry.locked && !isDone(entry),
    );
    const active = candidates.find((entry) => status(entry) === "active") ?? candidates[0];
    if (!active) return null;
    const lessons = lessonsOf(active);
    const current = lessons.find((lesson) => !lesson.done);
    const resume = resumeOf(active) ?? { kind: "module" as const, id: active.key };
    const sourceIds = new Set(active.content.lessons.flatMap((lesson) => lesson.sourceIds));
    const left = lessons
      .filter((lesson) => !lesson.done)
      .reduce((sum, lesson) => sum + lesson.minutes, 0);
    return {
      assignmentId: active.roadmap?.id ?? active.progress?.id ?? active.key,
      moduleId: active.key,
      stageName: active.stage.name,
      moduleIndex: active.number,
      moduleCount: Math.max(active.number, active.stage.moduleCount),
      title: active.module?.title ?? active.content.title,
      summary:
        (active.open ? firstSentence(active.content.summary) : "") || "Pick up where you left off.",
      lessons: lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        type: lesson.type,
        state: lesson.done ? "done" : lesson.id === current?.id ? "current" : "todo",
      })),
      resume,
      progress: fraction(active),
      minutesLeft: left,
      owner: ownerRef(actor.workspaceId, active.content),
      updatedAt:
        active.content.publishedAt ??
        (active.roadmap ?? active.progress)?.updatedAt.toISOString() ??
        new Date().toISOString(),
      sourceCount: sourceIds.size,
      suggestedQuestion: `What should I know about ${active.module?.title ?? active.content.title}?`,
    };
  };

  /* ---- Routes ------------------------------------------------------------------------------ */

  const lessonParam = (actor: Actor, id: string) => {
    const parts = splitId(id);
    if (!parts || parts.part === "check") throw new NotFoundError("Lesson");
    const resolved = resolve(actor, parts.moduleId);
    const index = resolved.content.lessons.findIndex((lesson) => lesson.id === parts.part);
    if (index < 0 || resolved.locked) throw new NotFoundError("Lesson");
    return { resolved, lesson: resolved.content.lessons[index]!, index };
  };
  const checkParam = (actor: Actor, id: string) => {
    const parts = splitId(id);
    if (parts?.part !== "check") throw new NotFoundError("Knowledge check");
    const resolved = resolve(actor, parts.moduleId);
    if (!resolved.content.check || !resolved.questions.length || resolved.locked)
      throw new NotFoundError("Knowledge check");
    return resolved;
  };
  const passMarkOf = (resolved: Resolved) =>
    Math.min(resolved.content.check?.passMark ?? 0, Math.ceil(resolved.questions.length * 0.7)) ||
    1;

  return new Hono<AppEnv>()
    .get("/me/roadmap", (c) => c.json(roadmapView(c.get("actor"))))
    .get("/me/modules/:id", (c) => {
      const actor = c.get("actor");
      const resolved = resolve(actor, c.req.param("id"));
      return c.json({ ...moduleView(actor, resolved), nextModule: nextAfter(actor, resolved.key) });
    })
    .get("/me/revisit", (c) => c.json(revisitList(c.get("actor"))))
    .put("/me/revisit/:id", (c) => c.json(setRevisit(c.get("actor"), c.req.param("id"), true)))
    .delete("/me/revisit/:id", (c) => c.json(setRevisit(c.get("actor"), c.req.param("id"), false)))
    .get("/me/lessons/:id", (c) => {
      const actor = c.get("actor");
      const { resolved, lesson, index } = lessonParam(actor, c.req.param("id"));
      const open = resolved.lessonOpen(lesson);
      const publisher = resolved.content.publishedBy
        ? records.personRef(actor.workspaceId, resolved.content.publishedBy)
        : null;
      const body: Lesson = {
        id: `${resolved.key}~${lesson.id}`,
        number: index + 1,
        title: lesson.title,
        type: lesson.type,
        minutes: lesson.minutes,
        done: Boolean(resolved.data?.lessonsDone.includes(lesson.id)) || isDone(resolved),
        module: {
          id: resolved.key,
          number: resolved.number,
          title: resolved.module?.title ?? resolved.content.title,
          kind: learnerKind(resolved.module?.kind ?? resolved.content.kind),
          progress: fraction(resolved),
        },
        stage: { id: resolved.stage.id, name: resolved.stage.name },
        outline: lessonsOf(resolved),
        basedOn: open ? lesson.basedOn : [],
        reviewedBy: publisher,
        reviewedOn: resolved.content.publishedAt?.slice(0, 10) ?? null,
        blocks: [
          {
            type: "markdown",
            text: open
              ? lesson.body
              : "## This lesson is restricted\n\nIt's based on sources you can't open yet. Use Request access on the module's page, or ask their owner in the tool they live in, then come back to it.",
          },
        ],
        rating: resolved.data?.ratings[lesson.id] ?? null,
        revisit: revisitOf(resolved).includes(lesson.id),
      };
      return c.json(body);
    })
    .post(
      "/me/lessons/:id/complete",
      zValidator("json", LessonCompletionInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const { resolved, lesson } = lessonParam(actor, c.req.param("id"));
        const done = new Set(resolved.data?.lessonsDone ?? []);
        done.add(lesson.id);
        save(actor, resolved, { lessonsDone: [...done] });
        const after = resolve(actor, resolved.key);
        const next = resumeOf(after);
        if (resolved.module === null)
          audit.record({
            actor,
            action: "learning.lesson.complete",
            targetType: "module",
            targetId: resolved.key,
            metadata: { lessonId: lesson.id },
          });
        return c.json({ moduleProgress: fraction(after), next });
      },
    )
    .get("/me/checks/:id", (c) => {
      const actor = c.get("actor");
      const resolved = checkParam(actor, c.req.param("id"));
      const body: KnowledgeCheck = {
        id: `${resolved.key}~check`,
        module: {
          id: resolved.key,
          number: resolved.number,
          title: resolved.module?.title ?? resolved.content.title,
        },
        stage: { id: resolved.stage.id, name: resolved.stage.name },
        passMark: passMarkOf(resolved),
        questions: resolved.questions.map((question) => ({
          id: question.id,
          prompt: question.prompt,
          options: question.options,
        })),
      };
      checkPause.open(actor, body.id);
      return c.json(body);
    })
    .post(
      "/me/checks/:id/attempts",
      zValidator("json", CheckAttemptInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const resolved = checkParam(actor, c.req.param("id"));
        const answers = new Map(
          c.req.valid("json").answers.map((answer) => [answer.questionId, answer.optionId]),
        );
        const review = resolved.questions.map((question) => ({
          questionId: question.id,
          chosenOptionId: answers.get(question.id) ?? "",
          correctOptionId: question.correctOptionId,
          explanation: question.explanation,
          source: question.source,
        }));
        const score = review.filter(
          (entry) => entry.chosenOptionId === entry.correctOptionId,
        ).length;
        const passMark = passMarkOf(resolved);
        const passed = score >= passMark;
        const before = roadmapModules(actor);
        const overallBefore = before.length ? before.filter(isDone).length / before.length : 0;
        const attempts = [
          ...(resolved.data?.attempts ?? []),
          { at: new Date().toISOString(), score, total: review.length, passed },
        ];
        save(actor, resolved, { attempts, passed: passed || Boolean(resolved.data?.passed) });
        // Submitted: Context Bot can explain the answers now.
        checkPause.close(actor);
        const after = roadmapModules(actor);
        const inStage = after.filter((entry) => entry.module?.stageId === resolved.stage.id);
        const withChecks = after.filter((entry) => entry.questions.length > 0);
        audit.record({
          actor,
          action: "learning.check.attempt",
          targetType: "module",
          targetId: resolved.key,
          metadata: { score, total: review.length, passed },
        });
        const result: CheckResult = {
          score,
          total: review.length,
          passMark,
          passed,
          review,
          progress: passed
            ? {
                stageName: resolved.stage.name,
                modulesDone: inStage.filter(isDone).length,
                moduleCount: inStage.length || 1,
                overallBefore,
                overallAfter: after.length ? after.filter(isDone).length / after.length : 1,
                checksPassed: withChecks.filter(
                  (entry) => Boolean(entry.data?.passed) || isDone(entry),
                ).length,
                checksTotal: withChecks.length,
              }
            : null,
          nextModule: nextAfter(actor, resolved.key),
        };
        return c.json(result);
      },
    )
    .post(
      "/me/learning-ratings",
      zValidator("json", LearningRatingInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        const resolved =
          input.targetType === "module"
            ? resolve(actor, input.targetId)
            : lessonParam(actor, input.targetId).resolved;
        const key =
          input.targetType === "module" ? resolved.key : (splitId(input.targetId)?.part ?? "");
        const ratings = { ...(resolved.data?.ratings ?? {}) };
        if (input.value) ratings[key] = input.value;
        else delete ratings[key];
        const row =
          resolved.progress ??
          learning.startProgress(actor.workspaceId, actor.id, resolved.key, resolved.content);
        learning.patchProgress(row, { ratings });
        return c.json({ value: input.value });
      },
    )
    .post(
      "/me/learning-requests",
      zValidator("json", LearningRequestInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        const resolved = input.moduleId ? resolve(actor, input.moduleId) : null;
        if (input.type === "access") return c.json(requestAccess(actor, resolved, input), 201);
        const managerId =
          db
            .select({ managerId: memberships.managerId })
            .from(memberships)
            .where(
              and(eq(memberships.userId, actor.id), eq(memberships.workspaceId, actor.workspaceId)),
            )
            .get()?.managerId ?? null;
        // Clarifications go to whoever wrote the module; roadmap changes to the manager.
        const recipientId =
          input.type === "clarification"
            ? (resolved?.content.ownerId ?? managerId)
            : (managerId ?? resolved?.content.ownerId ?? null);
        const recipient = recipientId ? records.personRef(actor.workspaceId, recipientId) : null;
        if (!recipient || recipientId === actor.id)
          throw new AppError(
            409,
            "CONFLICT",
            "There's nobody to send this to yet; ask your manager",
          );
        const row = store.create(
          actor,
          "learning_request",
          { ...input, recipientId },
          { status: "open" },
        );
        const about = resolved
          ? (resolved.module?.title ?? resolved.content.title)
          : "your roadmap";
        notifier.notify(actor.workspaceId, recipientId!, {
          type: "learning.request",
          category: "onboarding",
          title:
            input.type === "clarification"
              ? `${actor.name} asked a question about “${about}”`
              : `${actor.name} asked to change their roadmap`,
          body: input.message.slice(0, 280),
          link:
            input.type === "clarification" && resolved?.content.tutorialId
              ? `/tutorials/${resolved.content.tutorialId}`
              : `/team/${actor.id}`,
        });
        audit.record({
          actor,
          action: "learning.request",
          targetType: "learning_request",
          targetId: row.id,
          metadata: { type: input.type },
        });
        return c.json({ id: row.id, recipient }, 201);
      },
    )
    .get("/me/next-up", (c) => c.json({ item: nextUp(c.get("actor")) }))
    .get("/me/onboarding", (c) => {
      const actor = c.get("actor");
      const roadmap = roadmapView(actor);
      const modules = roadmapModules(actor);
      const practical = modules.filter((entry) =>
        entry.content.lessons.every((lesson) => lesson.type === "practical"),
      );
      const body: MyOnboarding = {
        startDate: roadmap.startDate,
        totalDays: roadmap.totalDays,
        status: roadmap.status,
        progress: roadmap.progress,
        expected: roadmap.expected,
        modules: { done: modules.filter(isDone).length, total: modules.length },
        checks: roadmap.checks,
        tasks: { done: practical.filter(isDone).length, total: practical.length },
        stages: roadmap.stages.map((stage) => ({
          id: stage.id,
          name: stage.name,
          weekStart: stage.weekStart,
          weekEnd: stage.weekEnd,
          state: stage.state,
          startsOn: stage.startsOn,
          modules: {
            done: stage.modules.filter((entry) => entry.status === "done").length,
            total: stage.modules.length,
          },
          progress: stage.modules.length
            ? stage.modules.reduce((sum, entry) => sum + entry.progress, 0) / stage.modules.length
            : 0,
        })),
      };
      return c.json(body);
    })
    .get(
      "/me/tasks",
      zValidator(
        "query",
        z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }),
        validationHook,
      ),
      (c) => {
        const actor = c.get("actor");
        const query = c.req.valid("query");
        const now = new Date();
        const monday = addDays(today(), -((now.getUTCDay() + 6) % 7));
        const from = query.from ?? monday;
        const to = query.to ?? addDays(monday, 6);
        const entries = [...roadmapModules(actor), ...standalone(actor)].filter(
          (entry) => !entry.locked,
        );
        const items: MyTask[] = entries.flatMap((entry) => {
          const dueOn = entry.module?.dueOn ?? entry.data?.dueOn ?? null;
          const done = isDone(entry);
          const doneOn = completedOn(entry);
          const inWindow = dueOn !== null && dueOn >= from && dueOn <= to;
          const overdue = !done && dueOn !== null && dueOn < from;
          const finishedInWindow = done && doneOn !== null && doneOn >= from && doneOn <= to;
          if (!inWindow && !overdue && !finishedInWindow) return [];
          const practical = entry.content.lessons.every((lesson) => lesson.type === "practical");
          const lessons = lessonsOf(entry);
          return [
            {
              id: entry.key,
              kind: entry.questions.length
                ? ("check" as const)
                : practical
                  ? ("practical" as const)
                  : ("reading" as const),
              title: entry.module?.title ?? entry.content.title,
              details: [
                `${lessons.length} ${lessons.length === 1 ? "step" : "steps"}`,
                ...(entry.questions.length ? [`${entry.questions.length} questions`] : []),
                `~${totalMinutes(entry.content)} min`,
              ],
              dueAt: dueOn ? `${dueOn}T17:00:00.000Z` : null,
              state: done ? ("done" as const) : ("open" as const),
              inProgress: !done && status(entry) === "active",
              completedAt: done && doneOn ? `${doneOn}T12:00:00.000Z` : null,
              target: { kind: "module" as const, id: entry.key },
            },
          ];
        });
        return c.json({
          from,
          to,
          items: items.sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? "")),
        });
      },
    )
    .get("/me/milestones", (c) => {
      const actor = c.get("actor");
      const record = recordFor(actor);
      if (!record) return c.json({ items: [] });
      const data = records.recordData(record);
      const roadmap = learning.roadmapRow(actor.workspaceId, actor.id);
      const plan = roadmap ? roadmapData(roadmap) : null;
      const now = today();
      const state = (dueOn: string): Milestone["state"] =>
        dueOn < now ? "done" : daysBetween(now, dueOn) <= 14 ? "soon" : "later";
      const items: Milestone[] = [
        ...(plan?.stages ?? []).map((stage) => {
          const dueOn = addDays(plan!.startDate, stage.weekEnd * 7 - 1);
          return {
            id: `stage:${stage.id}`,
            kind: "stage" as const,
            title: `Finish ${stage.name}`,
            detail: `Weeks ${stage.weekStart}–${stage.weekEnd} of your roadmap`,
            dueOn,
            state: state(dueOn),
          };
        }),
        {
          id: "checkin:day_30",
          kind: "checkin",
          title: "30-day check-in",
          detail: "With your manager: how the first month went",
          dueOn: addDays(data.startDate, 30),
          state: state(addDays(data.startDate, 30)),
        },
        {
          id: "readiness:day_60",
          kind: "readiness",
          title: "60-day readiness review",
          detail: "Your manager reviews readiness across products, systems, practices and delivery",
          dueOn: addDays(data.startDate, 60),
          state: state(addDays(data.startDate, 60)),
        },
        {
          id: "probation",
          kind: "probation",
          title: "Probation review",
          detail: "People Ops confirms your employment with your manager's recommendation",
          dueOn: data.probation.reviewOn,
          state: state(data.probation.reviewOn),
        },
      ];
      return c.json({ items: items.sort((a, b) => a.dueOn.localeCompare(b.dueOn)) });
    });
}
