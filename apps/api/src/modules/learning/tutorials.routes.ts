import { randomUUID } from "node:crypto";
import {
  type ContextItem,
  type ModuleKind,
  TutorialAssignInputSchema,
  TutorialContentSchema,
  TutorialCreateInputSchema,
  TutorialPublishInputSchema,
  TutorialRegenerateInputSchema,
  TutorialUpdateInputSchema,
  ReviewSendBackInputSchema,
  type TutorialContent,
  type TutorialDetail,
  type TutorialSummary,
  type TutorialUsage,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { Container } from "../../container.js";
import { projects, sourceObjects, users, type JobRow } from "../../db/schema.js";
import {
  AppError,
  BadRequestError,
  NotFoundError,
  UpstreamServiceError,
} from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { retrievePassages, type RetrievedPassage } from "../ask/retrieval.js";
import { JOB_PRIORITY } from "../jobs/jobs.queue.js";
import { createNotifier } from "../platform/notify.js";
import { createOnboardingRecords } from "../platform/onboarding-records.js";
import {
  addDays,
  roadmapData,
  stageAt,
  type RoadmapModule,
} from "../platform/onboarding-roadmap.js";
import { isReviewer, REVIEWERS, reviewView, type ReviewData } from "../platform/review.js";
import type { PlatformRecord } from "../platform/store.js";
import {
  createLearningContent,
  PROGRESS,
  TUTORIAL,
  TUTORIAL_PREFIX,
  TUTORIAL_VERSION,
  type ProgressData,
} from "./content.js";
import { AUTOMATIC_UPDATE, createGenerationRuns } from "./generation-runs.js";
import { lessonState } from "./lesson-state.js";
import {
  generateDraft,
  knowledgeFor,
  ThinKnowledgeError,
  TUTORIAL_PROMPT_VERSION,
  TUTORIAL_UPDATE_PROMPT_VERSION,
} from "./tutorial-ai.js";
import { manages } from "../platform/reports.js";

/*
 * Tutorial Studio (FR-LRN-001/004/005/008/012). A curator asks for a tutorial on a project; a
 * background job drafts it from the project's stored knowledge. The curator reviews and edits the
 * draft. Owner, Admin and HR publish a version; path curators and managers (for drafts a roadmap
 * generator made for them) submit it for review instead (N-18). Learners only see published
 * versions, and a Drive sync never changes a tutorial: when its sources change it reports them and
 * the curator decides whether to regenerate.
 */

interface TutorialData {
  audience: string;
  focus: string | null;
  coversModule: string | null;
  /** What a roadmap generator planned this module to be, before the draft has a title. */
  plannedTitle?: string | null;
  plannedKind?: ModuleKind | null;
  content: TutorialContent | null;
  /** Sources the draft was built from, with their content hash then (for "Needs update"). */
  sources: Array<{ id: string; title: string; hash: string }>;
  generation: { state: "running" | "failed" | "done"; error: string | null; at: string };
  generatedAt: string | null;
  draftRevision: number;
  publishedRevision: number | null;
  publishedVersion: number | null;
  publishedVersionId: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  /** A curator's or manager's draft waiting for People Ops, or sent back. */
  review?: ReviewData | null;
  /** Drafted on its own after the Hub changed: what changed, until the update is published. */
  update?: { at: string; changes: string[] } | null;
  /** When the last automatic update was queued: at most one a day. */
  autoUpdatedAt?: string | null;
  /** Hub items in its scope when it was last drafted, to notice when many new ones arrive. */
  knowledgeCount?: number;
}

const DAY_MS = 86_400_000;
/** New Hub items in a published tutorial's scope that are worth an update draft. */
const NEW_ITEMS_FOR_UPDATE = 5;

const dataOf = (row: PlatformRecord) => row.data as unknown as TutorialData;
const NO_KNOWLEDGE =
  "There's no company knowledge to draft from yet. Connect Google Drive or add documents to a project first.";
const minutesOf = (content: TutorialContent | null) =>
  content
    ? content.lessons.reduce((sum, lesson) => sum + lesson.minutes, 0) +
      (content.check ? Math.ceil(content.check.questions.length * 0.75) : 0)
    : 0;

export function createTutorialRoutes(container: Container) {
  const { db, identity, audit, queue, services, repos, gemini, logger } = container;
  const learning = createLearningContent(container);
  const { store } = learning;
  const records = createOnboardingRecords(container);
  const notifier = createNotifier(db);
  const runs = createGenerationRuns(container);

  /**
   * Admins, owners and People Ops curate every tutorial, company-wide ones included (no project);
   * path curators their own projects'.
   */
  const canCurate = (actor: Actor, projectId: string | null) =>
    isReviewer(actor) ||
    (projectId !== null && identity.hasAssignment(actor, "path_curator", projectId));
  /** Curators, and whoever a roadmap generator drafted it for (a manager's generated modules). */
  const canOpen = (actor: Actor, row: PlatformRecord) =>
    canCurate(actor, row.projectId) || (row.ownerId === actor.id && actor.role !== "guest");
  const requireCurator = (actor: Actor, projectId: string | null) => {
    const project = projectId ? identity.requireProject(actor, projectId) : null;
    if (!canCurate(actor, projectId))
      throw new AppError(403, "FORBIDDEN", "Tutorials are managed by admins and People Ops");
    return project;
  };
  const tutorial = (actor: Actor, id: string) => {
    const row = learning.tutorialRow(actor.workspaceId, id);
    if (!row) throw new NotFoundError("Tutorial");
    if (row.projectId) identity.requireProject(actor, row.projectId);
    if (!canOpen(actor, row))
      throw new AppError(403, "FORBIDDEN", "Tutorials are managed by admins and People Ops");
    return row;
  };
  /** Sources behind the tutorial the viewer can open; all of them, or the content stays hidden. */
  const openSources = (actor: Actor, row: PlatformRecord) => {
    const visible = learning.visibleOf(
      actor,
      dataOf(row).sources.map((source) => source.id),
    );
    return { visible, all: dataOf(row).sources.every((source) => visible.has(source.id)) };
  };
  /** A tutorial the curator may change: they must be able to read everything it's built from. */
  const editable = (actor: Actor, id: string) => {
    const row = tutorial(actor, id);
    if (!openSources(actor, row).all)
      throw new AppError(403, "FORBIDDEN", "This tutorial uses sources you can't open");
    return row;
  };

  /** Sources changed or gone since generation (compared by content hash). */
  const sourceStates = (data: TutorialData) => {
    const ids = data.sources.map((source) => source.id);
    const current = new Map(
      (ids.length
        ? db
            .select({
              id: sourceObjects.id,
              hash: sourceObjects.contentHash,
              visibility: sourceObjects.visibility,
            })
            .from(sourceObjects)
            .where(inArray(sourceObjects.id, ids))
            .all()
        : []
      ).map((row) => [row.id, row]),
    );
    return data.sources.map((source) => ({
      id: source.id,
      title: source.title,
      state: !current.has(source.id)
        ? ("removed" as const)
        : current.get(source.id)!.hash !== source.hash
          ? ("changed" as const)
          : ("current" as const),
      restricted: current.get(source.id)?.visibility === "restricted",
    }));
  };
  const person = (workspaceId: string, userId: string | null) =>
    userId ? records.personRef(workspaceId, userId) : null;
  const progressOf = (row: PlatformRecord) =>
    store.listWhere(row.workspaceId, PROGRESS, { parentId: row.id }, 5000);
  const status = (row: PlatformRecord): TutorialSummary["status"] => {
    const data = dataOf(row);
    if (!data.content && data.generation.state === "running") return "generating";
    if (!data.content && data.generation.state === "failed") return "failed";
    return row.status as TutorialSummary["status"];
  };

  /** `usage`: which templates use each tutorial, computed once for a list. */
  const summary = (
    row: PlatformRecord,
    usage: Map<string, TutorialUsage[]> = records.tutorialUsage(row.workspaceId),
  ): TutorialSummary => {
    const data = dataOf(row);
    const progress = progressOf(row);
    const staleSources = sourceStates(data).filter((source) => source.state !== "current").length;
    const project = row.projectId
      ? db
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(eq(projects.id, row.projectId))
          .get()
      : undefined;
    return {
      id: row.id,
      title:
        data.content?.title ??
        data.plannedTitle ??
        (data.focus ? `Tutorial: ${data.focus}` : "New tutorial"),
      status: status(row),
      generating: data.generation.state === "running",
      project: row.projectId ? { id: row.projectId, name: project?.name ?? "Project" } : null,
      audience: data.audience,
      lessonCount: data.content?.lessons.length ?? 0,
      questionCount: data.content?.check?.questions.length ?? 0,
      minutes: minutesOf(data.content),
      publishedVersion: data.publishedVersion,
      unpublishedChanges: data.content !== null && data.publishedRevision !== data.draftRevision,
      staleSources,
      learners: progress.length,
      inProgress: progress.filter((entry) => !(entry.data as unknown as ProgressData).completedAt)
        .length,
      updatedAt: row.updatedAt.toISOString(),
      createdBy: person(row.workspaceId, row.ownerId),
      review: reviewView(data.review, (userId) => person(row.workspaceId, userId)),
      state: lessonState(row, staleSources),
      usedIn: (usage.get(row.id) ?? []).sort(
        (a, b) => a.templateName.localeCompare(b.templateName) || a.position - b.position,
      ),
    };
  };
  const detail = (row: PlatformRecord, actor: Actor): TutorialDetail => {
    const data = dataOf(row);
    const access = openSources(actor, row);
    return {
      ...summary(row),
      restrictedForYou: !access.all,
      focus: data.focus,
      coversModule: data.coversModule,
      content: access.all ? data.content : null,
      sources: sourceStates(data).filter((source) => access.visible.has(source.id)),
      generatedAt: data.generatedAt,
      publishedAt: data.publishedAt,
      publishedBy: person(row.workspaceId, data.publishedBy),
      error: data.generation.state === "failed" ? data.generation.error : null,
      update: data.update ? { at: data.update.at, changes: data.update.changes } : null,
      moduleOptions: [...records.catalog(row.workspaceId).values()]
        .filter((entry) => entry.id.startsWith("mod-"))
        .map((entry) => ({ id: entry.id, title: entry.title })),
    };
  };

  /**
   * Hub items in a tutorial's scope: its project's, or every project's when company-wide, of the
   * kinds of knowledge its module is about (all kinds when that isn't known).
   */
  const scopeCount = (workspaceId: string, projectId: string | null, kind: string | null) => {
    const kinds = kind ? knowledgeFor(kind) : undefined;
    return (
      projectId ? [projectId] : repos.projects.list(workspaceId).map((project) => project.id)
    ).reduce(
      (sum, id) =>
        sum +
        Object.entries(services.context.countsByKind(id))
          .filter(([key]) => !kinds || kinds.includes(key as ContextItem["kind"]))
          .reduce((total, [, n]) => total + n, 0),
      0,
    );
  };
  const moduleKind = (data: TutorialData) => data.plannedKind ?? data.content?.kind ?? null;

  const queueGeneration = (
    row: PlatformRecord,
    focus: string | null,
    actor: Actor,
    {
      automatic = false,
      update = false,
      setup = false,
    }: { automatic?: boolean; update?: boolean; setup?: boolean } = {},
  ) => {
    // Jobs belong to a project: a company-wide draft runs under any project the curator can read.
    const host = row.projectId ?? learning.readableProjects(actor)[0]?.id;
    if (!host) throw new BadRequestError(NO_KNOWLEDGE);
    const run = runs.start(actor, {
      kind: "module",
      purpose: update ? AUTOMATIC_UPDATE : "tutorial",
      promptVersion: update ? TUTORIAL_UPDATE_PROMPT_VERSION : TUTORIAL_PROMPT_VERSION,
      targetType: "tutorial",
      targetId: row.id,
      automatic,
      setup,
    });
    return queue.enqueue({
      projectId: host,
      type: "generate_tutorial",
      payload: { tutorialId: row.id, focus, requestedBy: actor.id, runId: run.id, update },
      subject: dataOf(row).content?.title ?? "New tutorial",
      dedupe: true,
      priority: JOB_PRIORITY.interactive,
      concurrencyKey: `tutorial:${row.id}`,
      maxAttempts: 2,
    });
  };

  /**
   * A new tutorial draft, written in the background. No project means company-wide. A roadmap
   * generator passes the module it planned (title and kind), so the draft knows what it is for; its
   * drafts belong to whoever generated the roadmap, curator or not, and go to review like theirs.
   */
  const createDraft = (
    actor: Actor,
    input: {
      projectId: string | null;
      audience: string;
      focus: string | null;
      coversModule: string | null;
      plannedTitle?: string;
      plannedKind?: ModuleKind;
    },
    {
      generated = false,
      automatic = false,
      setup = false,
    }: { generated?: boolean; automatic?: boolean; setup?: boolean } = {},
  ) => {
    const project = generated
      ? input.projectId
        ? identity.requireProject(actor, input.projectId)
        : null
      : requireCurator(actor, input.projectId);
    if (!project && !learning.readableProjects(actor).length)
      throw new BadRequestError(NO_KNOWLEDGE);
    runs.ensureFor(actor.workspaceId, "module", setup);
    const row = store.create(
      actor,
      TUTORIAL,
      {
        audience: input.audience,
        focus: input.focus,
        coversModule: input.coversModule,
        plannedTitle: input.plannedTitle ?? null,
        plannedKind: input.plannedKind ?? null,
        content: null,
        sources: [],
        generation: { state: "running", error: null, at: new Date().toISOString() },
        generatedAt: null,
        draftRevision: 0,
        publishedRevision: null,
        publishedVersion: null,
        publishedVersionId: null,
        publishedAt: null,
        publishedBy: null,
      } satisfies TutorialData,
      { projectId: project?.id, status: "draft" },
    );
    queueGeneration(row, input.focus, actor, { automatic, setup });
    audit.record({
      actor,
      projectId: project?.id ?? null,
      action: "tutorial.create",
      targetType: "tutorial",
      targetId: row.id,
    });
    return row;
  };

  const validContent = (content: TutorialContent) => {
    const lessonIds = new Set(content.lessons.map((lesson) => lesson.id));
    if (lessonIds.size !== content.lessons.length)
      throw new BadRequestError("Lesson ids must be unique");
    for (const question of content.check?.questions ?? [])
      if (!question.options.some((option) => option.id === question.correctOptionId))
        throw new BadRequestError(`Question "${question.prompt}" needs a correct option`);
    if (content.check && content.check.passMark > content.check.questions.length)
      throw new BadRequestError("The pass mark can't exceed the number of questions");
    return content;
  };

  /** Why a draft can't be published yet, or null when it can. */
  const publishProblem = (row: PlatformRecord) => {
    const data = dataOf(row);
    const title = data.content?.title ?? data.plannedTitle ?? "This tutorial";
    if (data.generation.state === "running") return `“${title}” is still being drafted`;
    if (!data.content?.lessons.length)
      return data.generation.state === "failed"
        ? `“${title}” couldn't be drafted: ${data.generation.error ?? "try again"}`
        : `“${title}” has no lessons yet`;
    return null;
  };

  /** Publish a tutorial's draft as its next version (reviewers only; checked by callers). */
  const publish = (actor: Actor, id: string, { updateLearners = false } = {}) => {
    const row = editable(actor, id);
    const data = dataOf(row);
    const problem = publishProblem(row);
    if (problem) throw new AppError(409, "CONFLICT", problem);
    const content = validContent(TutorialContentSchema.parse(data.content));
    const now = new Date().toISOString();
    const version = (data.publishedVersion ?? 0) + 1;
    const published = db.transaction(() => {
      const snapshot = store.insert({
        workspaceId: row.workspaceId,
        ownerId: actor.id,
        kind: TUTORIAL_VERSION,
        projectId: row.projectId,
        parentId: row.id,
        status: "published",
        data: {
          version,
          content,
          sources: data.sources,
          publishedAt: now,
          publishedBy: actor.id,
        },
      });
      // FR-LRN-012: people part-way through stay on their version unless the curator moves them.
      if (updateLearners) {
        const lessonIds = new Set(content.lessons.map((lesson) => lesson.id));
        for (const progress of store.listWhere(
          row.workspaceId,
          PROGRESS,
          { parentId: row.id },
          5000,
        )) {
          const current = progress.data as unknown as ProgressData;
          if (current.completedAt) continue;
          learning.patchProgress(progress, {
            versionId: snapshot.id,
            lessonsDone: current.lessonsDone.filter((id) => lessonIds.has(id)),
          });
        }
      }
      return store.patch(row, {
        status: "published",
        data: {
          ...data,
          publishedVersion: version,
          publishedVersionId: snapshot.id,
          publishedRevision: data.draftRevision,
          publishedAt: now,
          publishedBy: actor.id,
          review: null,
          update: null,
        },
      });
    });
    // An update after the Hub changed: people who already finished it hear what's new.
    if (data.update)
      for (const progress of store.listWhere(row.workspaceId, PROGRESS, { parentId: row.id }, 5000))
        if ((progress.data as unknown as ProgressData).completedAt)
          notifier.notify(row.workspaceId, progress.ownerId, {
            type: "learning.updated",
            category: "onboarding",
            title: `“${content.title}” was updated with the company's latest knowledge`,
            link: "/learning",
          });
    audit.record({
      actor,
      projectId: row.projectId,
      action: "tutorial.publish",
      targetType: "tutorial",
      targetId: row.id,
      metadata: { version },
    });
    const submitter = data.review?.state === "in_review" ? data.review.by : null;
    if (submitter && submitter !== actor.id)
      notifier.notify(actor.workspaceId, submitter, {
        type: "tutorial.published",
        category: "system",
        title: `${actor.name} published your tutorial “${content.title}”`,
        link: `/tutorials/${row.id}`,
      });
    return published;
  };

  /**
   * Publish a template's draft modules in one go (N-18): every one is checked first, so nothing is
   * published unless all of them can be.
   */
  const publishModules = (actor: Actor, ids: string[]) => {
    if (!isReviewer(actor))
      throw new AppError(403, "FORBIDDEN", "Only People Ops, admins and owners publish modules");
    const rows = ids.map((id) => editable(actor, id));
    const problems = rows.flatMap((row) => publishProblem(row) ?? []);
    if (problems.length) throw new AppError(409, "CONFLICT", `${problems.join(". ")}.`);
    for (const row of rows) publish(actor, row.id);
    return rows.length;
  };

  const routes = new Hono<AppEnv>()
    .get("/tutorials", (c) => {
      const actor = c.get("actor");
      const rows = store
        .listWhere(actor.workspaceId, TUTORIAL, {}, 1000)
        .filter((row) => canOpen(actor, row));
      if (
        !rows.length &&
        !isReviewer(actor) &&
        actor.role !== "manager" &&
        !identity.curatesAny(actor)
      )
        throw new AppError(403, "FORBIDDEN", "Tutorials are managed by admins and People Ops");
      const usage = records.tutorialUsage(actor.workspaceId);
      return c.json({ items: rows.map((row) => summary(row, usage)) });
    })
    .post("/tutorials", zValidator("json", TutorialCreateInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const input = c.req.valid("json");
      const row = createDraft(actor, {
        projectId: input.projectId ?? null,
        audience: input.audience,
        focus: input.focus?.trim() ? input.focus.trim() : null,
        coversModule: input.coversModule ?? null,
      });
      return c.json(detail(row, actor), 202);
    })
    .get("/tutorials/:id", (c) => {
      const actor = c.get("actor");
      return c.json(detail(tutorial(actor, c.req.param("id")), actor));
    })
    .patch("/tutorials/:id", zValidator("json", TutorialUpdateInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const row = editable(actor, c.req.param("id"));
      const input = c.req.valid("json");
      const data = dataOf(row);
      if (input.content && !data.content)
        throw new AppError(409, "CONFLICT", "Wait for the draft before editing it");
      // Edits can only cite what the tutorial was built from (it decides who may read it).
      const known = new Set(data.sources.map((source) => source.id));
      if (
        input.content &&
        (input.content.lessons.some((lesson) => lesson.sourceIds.some((id) => !known.has(id))) ||
          input.content.check?.questions.some(
            (question) => question.sourceId && !known.has(question.sourceId),
          ))
      )
        throw new BadRequestError("Lessons and questions can only cite the tutorial's sources");
      if (input.coversModule && !records.catalog(actor.workspaceId).has(input.coversModule))
        throw new BadRequestError("Unknown template module");
      const updated = store.patch(row, {
        data: {
          ...data,
          ...(input.content
            ? { content: validContent(input.content), draftRevision: data.draftRevision + 1 }
            : {}),
          ...(input.audience ? { audience: input.audience } : {}),
          ...(input.coversModule !== undefined ? { coversModule: input.coversModule } : {}),
        },
      });
      audit.record({
        actor,
        projectId: row.projectId,
        action: "tutorial.edit",
        targetType: "tutorial",
        targetId: row.id,
      });
      return c.json(detail(updated, actor));
    })
    .post(
      "/tutorials/:id/regenerate",
      zValidator("json", TutorialRegenerateInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const row = editable(actor, c.req.param("id"));
        const data = dataOf(row);
        if (data.generation.state === "running")
          throw new AppError(409, "CONFLICT", "A draft is already being written");
        runs.ensureAvailable(actor.workspaceId, "module");
        const asked = c.req.valid("json").focus?.trim();
        const focus = asked === undefined || asked === "" ? data.focus : asked;
        const updated = store.patch(row, {
          data: {
            ...data,
            focus,
            generation: { state: "running", error: null, at: new Date().toISOString() },
          },
        });
        queueGeneration(updated, focus, actor);
        audit.record({
          actor,
          projectId: row.projectId,
          action: "tutorial.regenerate",
          targetType: "tutorial",
          targetId: row.id,
        });
        return c.json(detail(updated, actor), 202);
      },
    )
    .post(
      "/tutorials/:id/publish",
      zValidator("json", TutorialPublishInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        if (!isReviewer(actor))
          throw new AppError(
            403,
            "FORBIDDEN",
            "Only People Ops, admins and owners publish tutorials. Submit it for review instead.",
          );
        return c.json(
          detail(
            publish(actor, c.req.param("id"), {
              updateLearners: c.req.valid("json").updateLearners,
            }),
            actor,
          ),
        );
      },
    )
    .post("/tutorials/:id/submit", (c) => {
      const actor = c.get("actor");
      if (isReviewer(actor))
        throw new BadRequestError("You can publish it directly; it doesn't need a review");
      const row = editable(actor, c.req.param("id"));
      const data = dataOf(row);
      if (!data.content?.lessons.length)
        throw new AppError(409, "CONFLICT", "Add at least one lesson before submitting");
      if (data.generation.state === "running")
        throw new AppError(409, "CONFLICT", "Wait for the new draft before submitting");
      if (data.publishedRevision === data.draftRevision)
        throw new AppError(409, "CONFLICT", "Nothing has changed since it was published");
      const updated = store.patch(row, {
        data: {
          ...data,
          review: { state: "in_review", by: actor.id, at: new Date().toISOString(), note: null },
        },
      });
      audit.record({
        actor,
        projectId: row.projectId,
        action: "tutorial.submit",
        targetType: "tutorial",
        targetId: row.id,
      });
      notifier.notifyRoles(
        actor.workspaceId,
        REVIEWERS,
        {
          type: "tutorial.review",
          category: "system",
          title: `${actor.name} submitted the tutorial “${data.content.title}” for review`,
          link: `/tutorials/${row.id}`,
        },
        actor.id,
      );
      return c.json(detail(updated, actor));
    })
    .post(
      "/tutorials/:id/send-back",
      zValidator("json", ReviewSendBackInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        if (!isReviewer(actor))
          throw new AppError(
            403,
            "FORBIDDEN",
            "Only People Ops, admins and owners can send a tutorial back",
          );
        const row = tutorial(actor, c.req.param("id"));
        const data = dataOf(row);
        if (data.review?.state !== "in_review")
          throw new AppError(409, "CONFLICT", "This tutorial isn't waiting for a review");
        const submitter = data.review.by;
        const { note } = c.req.valid("json");
        const updated = store.patch(row, {
          data: {
            ...data,
            review: {
              state: "changes_requested",
              by: actor.id,
              at: new Date().toISOString(),
              note,
            },
          },
        });
        audit.record({
          actor,
          projectId: row.projectId,
          action: "tutorial.send_back",
          targetType: "tutorial",
          targetId: row.id,
          metadata: { note },
        });
        notifier.notify(actor.workspaceId, submitter, {
          type: "tutorial.sent_back",
          category: "system",
          title: `${actor.name} sent back your tutorial “${data.content?.title ?? "draft"}”`,
          body: note,
          link: `/tutorials/${row.id}`,
        });
        return c.json(detail(updated, actor));
      },
    )
    .post("/tutorials/:id/archive", (c) => {
      const actor = c.get("actor");
      const row = editable(actor, c.req.param("id"));
      const archived = store.patch(row, { status: "archived" });
      audit.record({
        actor,
        projectId: row.projectId,
        action: "tutorial.archive",
        targetType: "tutorial",
        targetId: row.id,
      });
      return c.json(detail(archived, actor));
    })
    .post(
      "/tutorials/:id/assign",
      zValidator("json", TutorialAssignInputSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const row = learning.tutorialRow(actor.workspaceId, c.req.param("id"));
        if (!row) throw new NotFoundError("Tutorial");
        if (row.projectId) identity.requireProject(actor, row.projectId);
        const input = c.req.valid("json");
        const member = identity.requireMember(actor.workspaceId, input.userId);
        // Curators, People Ops and the person's manager may assign.
        // Admins, owners and People Ops assign to anyone; managers to their own reports.
        if (!["owner", "admin", "hr"].includes(actor.role) && !manages(db, actor, member.userId))
          throw new AppError(
            403,
            "FORBIDDEN",
            "Only admins, People Ops or their manager can assign it",
          );
        const data = dataOf(row);
        if (row.status !== "published" || !data.publishedVersionId)
          throw new AppError(409, "CONFLICT", "Publish the tutorial before assigning it");
        if (input.dueOn && input.dueOn < new Date().toISOString().slice(0, 10))
          throw new BadRequestError("Choose a due date from today");
        if (row.projectId)
          identity.requireProject({ ...actor, id: input.userId, role: member.role }, row.projectId);
        const title = data.content?.title ?? "Tutorial";
        const catalogId = `${TUTORIAL_PREFIX}${row.id}`;
        const placed = db.transaction(() => {
          // Someone onboarding gets it on their roadmap (their manager and HR see it there too).
          const roadmap = learning.roadmapRow(actor.workspaceId, input.userId);
          if (roadmap) {
            const plan = roadmapData(roadmap);
            const existing = plan.modules.find(
              (entry) => entry.catalogId === catalogId && entry.status !== "done",
            );
            if (existing) return { placedIn: "roadmap" as const, moduleId: existing.id };
            const elapsed = Math.floor(
              (Date.now() - Date.parse(`${plan.startDate}T00:00:00Z`)) / 86_400_000,
            );
            const module: RoadmapModule = {
              id: randomUUID(),
              catalogId,
              title,
              kind: data.content?.kind ?? "project",
              stageId: stageAt(plan.stages, elapsed)?.id ?? plan.stages[0]?.id ?? "assigned",
              dueOn: input.dueOn ?? addDays(new Date().toISOString().slice(0, 10), 7),
              status: "todo",
              completedOn: null,
              postponed: false,
              assignedBy: actor.id,
              note: null,
              passed: null,
              result: null,
              attempts: 0,
            };
            store.patch(roadmap, {
              data: {
                ...plan,
                modules: [...plan.modules, module],
                history: [
                  {
                    on: new Date().toISOString().slice(0, 10),
                    text: `${actor.name} assigned “${title}”`,
                    by: actor.id,
                  },
                  ...plan.history,
                ],
              },
            });
            return { placedIn: "roadmap" as const, moduleId: module.id };
          }
          const content = learning.tutorialContent(actor.workspaceId, row.id);
          if (!content)
            throw new AppError(409, "CONFLICT", "Publish the tutorial before assigning it");
          const progress = learning.startProgress(
            actor.workspaceId,
            input.userId,
            catalogId,
            content,
            {
              placement: "my_learning",
              assignedBy: actor.id,
              dueOn: input.dueOn,
            },
          );
          if (progress.data.assignedBy !== actor.id || progress.data.dueOn !== input.dueOn)
            learning.patchProgress(progress, { assignedBy: actor.id, dueOn: input.dueOn });
          return { placedIn: "my_learning" as const, moduleId: catalogId };
        });
        notifier.notify(actor.workspaceId, input.userId, {
          type: "learning.assigned",
          category: "onboarding",
          title: `${actor.name} assigned you “${title}”`,
          link: `/roadmap/modules/${placed.moduleId}`,
        });
        audit.record({
          actor,
          projectId: row.projectId,
          action: "tutorial.assign",
          targetType: "tutorial",
          targetId: row.id,
          metadata: { userId: input.userId, placedIn: placed.placedIn },
        });
        return c.json(placed, 201);
      },
    );

  /**
   * Job handler (`generate_tutorial`): draft from the project's stored knowledge, as the person
   * who asked for it (only what they could read and answers may use: exclude policies apply). The
   * previous draft stays until the new one is ready; published versions never change.
   */
  async function generate(job: JobRow) {
    const id = String(job.payload.tutorialId);
    const project = repos.projects.findByIdUnscoped(job.projectId);
    if (!project) return;
    const found = learning.byId(project.workspaceId, TUTORIAL, id);
    if (!found) return;
    const requesterId =
      typeof job.payload.requestedBy === "string" ? job.payload.requestedBy : found.ownerId;
    const requester = identity.requireMember(found.workspaceId, requesterId);
    const name = db.select({ name: users.name }).from(users).where(eq(users.id, requesterId)).get();
    const actor: Actor = {
      id: requesterId,
      name: name?.name ?? "Curator",
      workspaceId: found.workspaceId,
      role: requester.role,
    };
    const data = dataOf(found);
    const focus = typeof job.payload.focus === "string" ? job.payload.focus : data.focus;
    const runId = typeof job.payload.runId === "string" ? job.payload.runId : null;
    // An update starts from the published version and what changed in the Hub.
    const published =
      job.payload.update === true && data.update && data.publishedVersionId
        ? (learning.byId(found.workspaceId, TUTORIAL_VERSION, data.publishedVersionId)?.data
            .content as TutorialContent | undefined)
        : undefined;
    const update =
      published && data.update ? { current: published, changes: data.update.changes } : undefined;
    const fail = (error: string, skipped = false) => {
      runs.finish(found.workspaceId, runId, error, skipped);
      return store.patch(learning.byId(found.workspaceId, TUTORIAL, id) ?? found, {
        data: {
          ...dataOf(learning.byId(found.workspaceId, TUTORIAL, id) ?? found),
          generation: { state: "failed", error, at: new Date().toISOString() },
          // A failed update leaves the published version as it was.
          ...(job.payload.update === true ? { update: null } : {}),
        },
      });
    };
    try {
      const covered = data.coversModule
        ? records.catalog(found.workspaceId).get(data.coversModule)
        : undefined;
      const covers = covered?.title ?? data.plannedTitle ?? null;
      // A project tutorial reads its project; a company-wide one every project they can read, and
      // without a focus it looks for passages about the module it covers.
      const scope = found.projectId ? [project] : learning.readableProjects(actor);
      const query = focus ?? (found.projectId ? null : covers);
      const items: ContextItem[] = [];
      const ranked: RetrievedPassage[][] = [];
      for (const scoped of scope) {
        const answerable = new Set(identity.answerableSourceIds(actor, scoped.id));
        items.push(
          ...services.context
            .listItems(scoped, undefined, actor)
            .filter((item) => item.evidence.every((entry) => answerable.has(entry.sourceObjectId))),
        );
        if (query)
          ranked.push(
            await retrievePassages({ sources: repos.sources, gemini, logger }, scoped.id, query, {
              limit: 12,
              sourceIds: [...answerable],
            }),
          );
      }
      // Each project's best passages in turn, so no single project crowds out the rest.
      const longest = Math.max(0, ...ranked.map((list) => list.length));
      const passages = Array.from({ length: longest }, (_, rank) =>
        ranked.flatMap((list) => (list[rank] ? [list[rank]] : [])),
      )
        .flat()
        .slice(0, 12);
      const { content, usedSourceIds } = await generateDraft(
        gemini,
        {
          projectName: found.projectId ? project.name : null,
          audience: data.audience,
          focus,
          covers,
          items,
          preferKinds: knowledgeFor(covered?.kind ?? data.plannedKind ?? ""),
          passages: passages.map((passage) => ({
            sourceId: passage.source.id,
            sourceTitle: passage.source.title,
            content: passage.content,
          })),
          update,
        },
        runs.usageRecorder(found.workspaceId, runId),
      );
      if (!content.lessons.length) throw new Error("The draft came back without lessons");
      // Every source the draft was built from: who may read it, and what "Needs update" watches.
      const used = usedSourceIds.length
        ? db
            .select({
              id: sourceObjects.id,
              title: sourceObjects.title,
              hash: sourceObjects.contentHash,
            })
            .from(sourceObjects)
            .where(
              and(
                inArray(sourceObjects.id, usedSourceIds),
                found.projectId ? eq(sourceObjects.projectId, project.id) : undefined,
              ),
            )
            .all()
        : [];
      const latest = learning.byId(found.workspaceId, TUTORIAL, id);
      if (!latest) return;
      const now = new Date().toISOString();
      store.patch(latest, {
        data: {
          ...dataOf(latest),
          content,
          sources: used.map((source) => ({
            id: source.id,
            title: source.title,
            hash: source.hash,
          })),
          generation: { state: "done", error: null, at: now },
          generatedAt: now,
          draftRevision: dataOf(latest).draftRevision + 1,
          knowledgeCount: scopeCount(
            found.workspaceId,
            found.projectId,
            dataOf(latest).plannedKind ?? content.kind,
          ),
        },
      });
      runs.finish(found.workspaceId, runId);
      if (update)
        // The publisher, HR and Admin review it; one click publishes it.
        notifier.notifyRoles(found.workspaceId, ["admin", "hr"], {
          type: "tutorial.update_ready",
          category: "system",
          title: `“${content.title}” has an update from new company knowledge, ready to review`,
          link: `/tutorials/${id}`,
        });
      if (!update || !["admin", "hr"].includes(actor.role))
        notifier.notify(found.workspaceId, requesterId, {
          type: update ? "tutorial.update_ready" : "tutorial.ready",
          category: "system",
          title: update
            ? `“${content.title}” has an update from new company knowledge, ready to review`
            : `Your tutorial draft “${content.title}” is ready to review`,
          link: `/tutorials/${id}`,
        });
    } catch (error) {
      // A busy or failing model is retried; anything else (or the last try) shows in the Studio.
      if (error instanceof UpstreamServiceError && job.attempts < job.maxAttempts) throw error;
      fail(
        error instanceof Error ? error.message : "The draft could not be written",
        error instanceof ThinKnowledgeError,
      );
    }
  }

  /**
   * After a sync refreshed a project's Hub (N-18 Phase 7): each published tutorial built on it whose
   * sources changed, or whose scope gained 5 or more Hub items, gets an update draft written as its
   * last publisher. Nothing reaches learners until someone publishes it. At most one a day per
   * tutorial, never over someone's unpublished edits, and within the daily automatic share.
   */
  function hubChanged(projectId: string) {
    const project = repos.projects.findByIdUnscoped(projectId);
    if (!project) return;
    const ws = project.workspaceId;
    for (const row of store.listWhere(ws, TUTORIAL, { status: "published" }, 1000)) {
      if (row.projectId && row.projectId !== projectId) continue;
      const data = dataOf(row);
      if (data.generation.state === "running" || data.publishedRevision !== data.draftRevision)
        continue;
      if (data.autoUpdatedAt && Date.now() - Date.parse(data.autoUpdatedAt) < DAY_MS) continue;
      const count = scopeCount(ws, row.projectId, moduleKind(data));
      if (data.knowledgeCount === undefined) {
        // Drafted before counts were kept: start counting from now.
        store.patch(row, { data: { ...data, knowledgeCount: count } });
        continue;
      }
      // Only sources the published lessons and questions cite: a company-wide module reads far
      // more than it teaches from.
      const published = data.publishedVersionId
        ? (learning.byId(ws, TUTORIAL_VERSION, data.publishedVersionId)?.data.content as
            TutorialContent | undefined)
        : undefined;
      const cited = published
        ? new Set([
            ...published.lessons.flatMap((lesson) => lesson.sourceIds),
            ...(published.check?.questions ?? []).flatMap((question) =>
              question.sourceId ? [question.sourceId] : [],
            ),
          ])
        : null;
      const changes = sourceStates(data)
        .filter((source) => source.state !== "current" && (!cited || cited.has(source.id)))
        .map((source) =>
          source.state === "removed"
            ? `${source.title} is no longer in the Hub`
            : `${source.title} was edited`,
        );
      const added = count - data.knowledgeCount;
      if (added >= NEW_ITEMS_FOR_UPDATE)
        changes.push(`${added} new items in the Knowledge Hub since it was written`);
      if (!changes.length || !data.publishedBy) continue;
      const member = identity.requireMemberOptional(ws, data.publishedBy);
      if (!member) continue;
      const name = db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, data.publishedBy))
        .get();
      const actor: Actor = {
        id: data.publishedBy,
        name: name?.name ?? "Publisher",
        workspaceId: ws,
        role: member.role,
      };
      const at = new Date().toISOString();
      const updated = store.patch(row, {
        data: {
          ...data,
          update: { at, changes },
          autoUpdatedAt: at,
          generation: { state: "running", error: null, at },
        },
      });
      try {
        queueGeneration(updated, data.focus, actor, { automatic: true, update: true });
      } catch (error) {
        // Over today's automatic share, or nothing left to read: try again after the next sync.
        store.patch(updated, { data: { ...data } });
        if (error instanceof AppError) {
          if (error.status === 429) return;
          continue;
        }
        throw error;
      }
      audit.record({
        actor,
        projectId: row.projectId,
        action: "tutorial.update_draft",
        targetType: "tutorial",
        targetId: row.id,
        metadata: { changes, automatic: true },
      });
    }
  }

  return { routes, generate, createDraft, runs, hubChanged, publishModules };
}
