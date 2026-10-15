import { randomUUID } from "node:crypto";
import {
  TutorialAssignInputSchema,
  TutorialContentSchema,
  TutorialCreateInputSchema,
  TutorialPublishInputSchema,
  TutorialRegenerateInputSchema,
  TutorialUpdateInputSchema,
  type TutorialContent,
  type TutorialDetail,
  type TutorialSummary,
} from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import type { Container } from "../../container.js";
import { assignments, projects, sourceObjects, users, type JobRow } from "../../db/schema.js";
import {
  AppError,
  BadRequestError,
  NotFoundError,
  UpstreamServiceError,
} from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { retrievePassages } from "../ask/retrieval.js";
import { JOB_PRIORITY } from "../jobs/jobs.queue.js";
import { createNotifier } from "../platform/notify.js";
import { createOnboardingRecords } from "../platform/onboarding-records.js";
import {
  addDays,
  roadmapData,
  stageAt,
  type RoadmapModule,
} from "../platform/onboarding-roadmap.js";
import type { PlatformRecord } from "../platform/store.js";
import {
  createLearningContent,
  PROGRESS,
  TUTORIAL,
  TUTORIAL_PREFIX,
  TUTORIAL_VERSION,
  type ProgressData,
} from "./content.js";
import { generateDraft } from "./tutorial-ai.js";
import { manages } from "../platform/reports.js";

/*
 * Tutorial Studio (FR-LRN-001/004/005/008/012). A curator asks for a tutorial on a project; a
 * background job drafts it from the project's stored knowledge. The curator reviews and edits the
 * draft, then publishes a version. Learners only see published versions, and a Drive sync never
 * changes a tutorial: when its sources change it reports them and the curator decides whether to
 * regenerate.
 */

interface TutorialData {
  audience: string;
  focus: string | null;
  coversModule: string | null;
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
}

const dataOf = (row: PlatformRecord) => row.data as unknown as TutorialData;
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

  /** Admins, owners and People Ops curate every project's tutorials; path curators their own. */
  const canCurate = (actor: Actor, projectId: string) =>
    ["owner", "admin", "hr"].includes(actor.role) ||
    identity.hasAssignment(actor, "path_curator", projectId);
  /** Holds a path curator assignment for any project. */
  const curatesAny = (actor: Actor) =>
    actor.role !== "guest" &&
    db
      .select({ id: assignments.id })
      .from(assignments)
      .where(
        and(
          eq(assignments.workspaceId, actor.workspaceId),
          eq(assignments.userId, actor.id),
          eq(assignments.type, "path_curator"),
          or(isNull(assignments.expiresAt), gt(assignments.expiresAt, new Date())),
        ),
      )
      .all().length > 0;
  const requireCurator = (actor: Actor, projectId: string) => {
    const project = identity.requireProject(actor, projectId);
    if (!canCurate(actor, projectId))
      throw new AppError(403, "FORBIDDEN", "Tutorials are managed by admins and People Ops");
    return project;
  };
  const tutorial = (actor: Actor, id: string) => {
    const row = learning.tutorialRow(actor.workspaceId, id);
    if (!row?.projectId) throw new NotFoundError("Tutorial");
    requireCurator(actor, row.projectId);
    return row;
  };
  /** Sources behind the tutorial the viewer can open; all of them, or the content stays hidden. */
  const openSources = (actor: Actor, row: PlatformRecord) => {
    const visible = new Set(identity.visibleSourceIds(actor, row.projectId!));
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
  const learners = (row: PlatformRecord) =>
    store.listWhere(row.workspaceId, PROGRESS, { parentId: row.id }, 5000).length;
  const status = (row: PlatformRecord): TutorialSummary["status"] => {
    const data = dataOf(row);
    if (!data.content && data.generation.state === "running") return "generating";
    if (!data.content && data.generation.state === "failed") return "failed";
    return row.status as TutorialSummary["status"];
  };

  const summary = (row: PlatformRecord): TutorialSummary => {
    const data = dataOf(row);
    const project = db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.id, row.projectId!))
      .get();
    return {
      id: row.id,
      title: data.content?.title ?? (data.focus ? `Tutorial: ${data.focus}` : "New tutorial"),
      status: status(row),
      generating: data.generation.state === "running",
      project: { id: row.projectId!, name: project?.name ?? "Project" },
      audience: data.audience,
      lessonCount: data.content?.lessons.length ?? 0,
      questionCount: data.content?.check?.questions.length ?? 0,
      minutes: minutesOf(data.content),
      publishedVersion: data.publishedVersion,
      unpublishedChanges: data.content !== null && data.publishedRevision !== data.draftRevision,
      staleSources: sourceStates(data).filter((source) => source.state !== "current").length,
      learners: learners(row),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: person(row.workspaceId, row.ownerId),
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
      moduleOptions: [...records.catalog(row.workspaceId).values()]
        .filter((entry) => entry.id.startsWith("mod-"))
        .map((entry) => ({ id: entry.id, title: entry.title })),
    };
  };

  const queueGeneration = (row: PlatformRecord, focus: string | null, requestedBy: string) =>
    queue.enqueue({
      projectId: row.projectId!,
      type: "generate_tutorial",
      payload: { tutorialId: row.id, focus, requestedBy },
      subject: dataOf(row).content?.title ?? "New tutorial",
      dedupe: true,
      priority: JOB_PRIORITY.interactive,
      concurrencyKey: `tutorial:${row.id}`,
      maxAttempts: 2,
    });

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

  const routes = new Hono<AppEnv>()
    .get("/tutorials", (c) => {
      const actor = c.get("actor");
      const rows = store
        .listWhere(actor.workspaceId, TUTORIAL, {}, 1000)
        .filter((row) => row.projectId && canCurate(actor, row.projectId));
      if (!rows.length && !["owner", "admin", "hr"].includes(actor.role) && !curatesAny(actor))
        throw new AppError(403, "FORBIDDEN", "Tutorials are managed by admins and People Ops");
      return c.json({ items: rows.map(summary) });
    })
    .post("/tutorials", zValidator("json", TutorialCreateInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const input = c.req.valid("json");
      const project = requireCurator(actor, input.projectId);
      const row = store.create(
        actor,
        TUTORIAL,
        {
          audience: input.audience,
          focus: input.focus?.trim() ? input.focus.trim() : null,
          coversModule: input.coversModule ?? null,
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
        { projectId: project.id, status: "draft" },
      );
      queueGeneration(row, input.focus?.trim() ? input.focus.trim() : null, actor.id);
      audit.record({
        actor,
        projectId: project.id,
        action: "tutorial.create",
        targetType: "tutorial",
        targetId: row.id,
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
        const asked = c.req.valid("json").focus?.trim();
        const focus = asked === undefined || asked === "" ? data.focus : asked;
        const updated = store.patch(row, {
          data: {
            ...data,
            focus,
            generation: { state: "running", error: null, at: new Date().toISOString() },
          },
        });
        queueGeneration(updated, focus, actor.id);
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
        const row = editable(actor, c.req.param("id"));
        const data = dataOf(row);
        if (!data.content?.lessons.length)
          throw new AppError(409, "CONFLICT", "Add at least one lesson before publishing");
        if (data.generation.state === "running")
          throw new AppError(409, "CONFLICT", "Wait for the new draft before publishing");
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
          if (c.req.valid("json").updateLearners) {
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
            },
          });
        });
        audit.record({
          actor,
          projectId: row.projectId,
          action: "tutorial.publish",
          targetType: "tutorial",
          targetId: row.id,
          metadata: { version },
        });
        return c.json(detail(published, actor));
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
        if (!row?.projectId) throw new NotFoundError("Tutorial");
        identity.requireProject(actor, row.projectId);
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
    const fail = (error: string) =>
      store.patch(learning.byId(found.workspaceId, TUTORIAL, id) ?? found, {
        data: {
          ...dataOf(learning.byId(found.workspaceId, TUTORIAL, id) ?? found),
          generation: { state: "failed", error, at: new Date().toISOString() },
        },
      });
    try {
      const answerable = new Set(identity.answerableSourceIds(actor, project.id));
      const items = services.context
        .listItems(project, undefined, actor)
        .filter((item) => item.evidence.every((entry) => answerable.has(entry.sourceObjectId)));
      const passages = focus
        ? await retrievePassages({ sources: repos.sources, gemini, logger }, project.id, focus, {
            limit: 12,
            sourceIds: [...answerable],
          })
        : [];
      const covers = data.coversModule
        ? (records.catalog(found.workspaceId).get(data.coversModule)?.title ?? null)
        : null;
      const { content, usedSourceIds } = await generateDraft(gemini, {
        projectName: project.name,
        audience: data.audience,
        focus,
        covers,
        items,
        passages: passages.map((passage) => ({
          sourceId: passage.source.id,
          sourceTitle: passage.source.title,
          content: passage.content,
        })),
      });
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
                eq(sourceObjects.projectId, project.id),
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
        },
      });
      notifier.notify(found.workspaceId, requesterId, {
        type: "tutorial.ready",
        category: "system",
        title: `Your tutorial draft “${content.title}” is ready to review`,
        link: `/tutorials/${id}`,
      });
    } catch (error) {
      // A busy or failing model is retried; anything else (or the last try) shows in the Studio.
      if (error instanceof UpstreamServiceError && job.attempts < job.maxAttempts) throw error;
      fail(error instanceof Error ? error.message : "The draft could not be written");
    }
  }

  return { routes, generate };
}
