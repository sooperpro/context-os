import { randomUUID } from "node:crypto";
import { CompanionPreferencesSchema, PathInputSchema, VersionSchema } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { assignments, users } from "../../db/schema.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import {
  completeAssignmentIfDone,
  creditCuratorForItem,
  dependenciesOf,
  type PathItem,
} from "./learning.events.js";
import { createNotifier } from "./notify.js";
import { awardReputation } from "./reputation.js";
import { workspaceSettings } from "./settings.js";
import { createPlatformStore, type PlatformRecord } from "./store.js";

const AssignInput = z
  .object({
    userId: z.string().min(1).max(200),
    mentorId: z.string().min(1).max(200).optional(),
    startDate: z.iso.date(),
  })
  .strict();
const GenerateInput = z
  .object({
    projectId: z.uuid(),
    roleFamily: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(200).default("Project onboarding"),
    /** Target duration in days (30/60/90); due offsets are spread across it. */
    targetDays: z.number().int().min(7).max(180).default(30),
  })
  .strict();
const DwellInput = z.object({ version: z.number().int().positive() }).strict();
const SignoffInput = z
  .object({
    version: z.number().int().positive(),
    approved: z.boolean(),
    note: z.string().max(2000).default(""),
  })
  .strict();
const QuizInput = z
  .object({
    questions: z
      .array(
        z
          .object({
            prompt: z.string().min(3).max(1000),
            options: z.array(z.string().min(1).max(500)).min(2).max(6),
            correctIndex: z.number().int().min(0).max(5),
            claimId: z.uuid(),
            explanation: z.string().min(1).max(2000),
          })
          .strict(),
      )
      .min(3)
      .max(5),
  })
  .strict();
const QuizSubmission = z
  .object({
    version: z.number().int().positive(),
    answers: z.array(z.number().int().min(0).max(5)).min(3).max(5),
  })
  .strict();
const RatingInput = z
  .object({
    version: z.number().int().positive(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(2000).default(""),
  })
  .strict();
type PathData = z.infer<typeof PathInputSchema>;
type Item = PathData["items"][number] & { id: string };
const QUIZ_PASS_PERCENT = 70;
const QUIZ_COOLDOWN_MS = 600000;

export function createLearningRoutes(container: Container) {
  const { db, identity, services, audit } = container;
  const store = createPlatformStore(db);
  const notifier = createNotifier(db);
  const curated = (actor: Actor, projectId: string) =>
    actor.role === "owner" ||
    actor.role === "admin" ||
    actor.role === "manager" ||
    identity.hasAssignment(actor, "path_curator", projectId);
  const requireCurator = (actor: Actor, projectId: string) => {
    identity.requireProject(actor, projectId);
    if (!curated(actor, projectId))
      throw new AppError(403, "FORBIDDEN", "Path curator access is required");
  };
  const items = (path: PlatformRecord): Item[] => path.data.items as Item[];
  const validateItems = (actor: Actor, input: PathData) => {
    identity.requireProject(actor, input.projectId);
    const normalized = input.items.map((item) => ({ ...item, id: item.id ?? randomUUID() }));
    const ids = new Set(normalized.map((item) => item.id));
    if (ids.size !== normalized.length) throw new BadRequestError("Item IDs must be unique");
    const complete = new Set<string>();
    for (const item of normalized) {
      for (const id of dependenciesOf(item)) identity.requireSource(actor, input.projectId, id);
      if (item.prerequisites.some((id) => !ids.has(id) || !complete.has(id)))
        throw new BadRequestError(
          "Prerequisites must reference earlier items; cycles are not allowed",
        );
      if (item.verification === "self" && item.required && item.type !== "meet")
        throw new BadRequestError("Required items require independent verification");
      if (item.verification === "event" && !item.eventTrigger)
        throw new BadRequestError("Event-verified items need an eventTrigger");
      complete.add(item.id);
    }
    return normalized;
  };
  const render = (actor: Actor, path: PlatformRecord) => {
    const allowed = new Set(identity.visibleSourceIds(actor, path.projectId!));
    return {
      ...path,
      data: {
        ...path.data,
        items: items(path).map((item) =>
          !dependenciesOf(item).every((id) => allowed.has(id))
            ? {
                id: item.id,
                type: item.type,
                title: "Restricted learning resource",
                objective: "You need access to this source. Request access in the source tool.",
                required: false,
                accessible: false,
                module: item.module ?? null,
              }
            : { ...item, accessible: true },
        ),
      },
    };
  };
  const assignment = (actor: Actor, id: string) => {
    const row = store.get(actor, "path_assignment", id);
    identity.requireProject(actor, row.projectId!);
    // The learner, their manager, and their mentor while the mentor assignment is live.
    if (
      row.ownerId !== actor.id &&
      !(row.data.mentorId === actor.id && identity.hasAssignment(actor, "mentor", row.ownerId)) &&
      identity.requireMember(actor.workspaceId, row.ownerId).managerId !== actor.id
    )
      throw new NotFoundError("Path assignment");
    return row;
  };
  const learnerActor = (actor: Actor, row: PlatformRecord): Actor => ({
    ...actor,
    id: row.ownerId,
    role: identity.requireMember(actor.workspaceId, row.ownerId).role,
  });
  const pathForAssignment = (row: PlatformRecord) =>
    store.get(
      { id: row.ownerId, name: "", workspaceId: row.workspaceId, role: "member" },
      "path_version",
      row.parentId!,
    );
  const learnerItem = (actor: Actor, assignmentId: string, itemId: string) => {
    const row = assignment(actor, assignmentId);
    if (row.ownerId !== actor.id)
      throw new AppError(403, "FORBIDDEN", "Only the learner can start or complete an item");
    const path = pathForAssignment(row);
    const item = items(path).find((entry) => entry.id === itemId);
    if (!item) throw new NotFoundError("Learning item");
    for (const id of dependenciesOf(item)) identity.requireSource(actor, row.projectId!, id);
    return { row, path, item };
  };
  const findProgress = (actor: Actor, assignmentId: string, itemId: string) =>
    store
      .listChildren(actor, "item_progress", assignmentId)
      .find((entry) => entry.data.itemId === itemId);
  const companionActive = (actor: Actor) =>
    CompanionPreferencesSchema.parse(
      db.select().from(users).where(eq(users.id, actor.id)).get()?.preferences.companion ?? {},
    ).enabled;
  /** Mark a progress row completed and run the downstream credit/completion checks. */
  const complete = (
    actor: Actor,
    row: PlatformRecord,
    progress: PlatformRecord,
    version: number,
    extra: Record<string, unknown>,
    item: PathItem,
  ) => {
    const updated = store.update(actor, progress, version, {
      status: "completed",
      data: {
        ...progress.data,
        ...extra,
        completedAt: new Date().toISOString(),
        companionActive: companionActive(actor),
      },
    });
    creditCuratorForItem(db, actor, row, item.id);
    const closed = completeAssignmentIfDone(
      db,
      identity,
      actor,
      store.get(actor, "path_assignment", row.id),
    );
    return { progress: updated, assignmentCompleted: !!closed };
  };
  const withStuck = (progress: PlatformRecord, stuckHours: number) => ({
    ...progress,
    stuck:
      progress.status === "in_progress" &&
      Date.now() - Date.parse(String(progress.data.firstOpenedAt)) > stuckHours * 3600000,
  });
  const notifyLearner = (actor: Actor, learnerId: string, title: string, link: string) =>
    notifier.notify(actor.workspaceId, learnerId, {
      type: "learning.update",
      category: "onboarding",
      title,
      link,
    });

  return new Hono<AppEnv>()
    .post(
      "/learning/paths/:id/items/:itemId/quiz",
      zValidator("json", QuizInput, validationHook),
      (c) => {
        const actor = c.get("actor");
        const path = store.get(actor, "learning_path", c.req.param("id"));
        requireCurator(actor, path.projectId!);
        if (path.status !== "draft")
          throw new AppError(409, "CONFLICT", "Edit a draft before creating a quiz");
        const item = items(path).find((entry) => entry.id === c.req.param("itemId"));
        if (item?.verification !== "quiz") throw new BadRequestError("Select a quiz item");
        const input = c.req.valid("json");
        const claims = services.context.listItems(
          identity.requireProject(actor, path.projectId!),
          undefined,
          actor,
        );
        for (const question of input.questions) {
          if (question.correctIndex >= question.options.length)
            throw new BadRequestError("Correct answer must reference an option");
          if (
            !claims.some(
              (claim) =>
                claim.id === question.claimId &&
                !["disputed", "superseded", "stale"].includes(claim.verification),
            )
          )
            throw new BadRequestError("Quiz questions require accessible current evidence");
        }
        const definition = store.create(actor, "quiz_definition", input, {
          parentId: item.id,
          projectId: path.projectId!,
          status: "authored",
        });
        store.update(actor, path, path.version, {
          data: {
            ...path.data,
            quizDefinitions: { ...(path.data.quizDefinitions ?? {}), [item.id]: definition.id },
          },
        });
        return c.json({ id: definition.id, questions: input.questions }, 201);
      },
    )
    .post("/learning/paths", zValidator("json", PathInputSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const input = c.req.valid("json");
      requireCurator(actor, input.projectId);
      const path = store.create(
        actor,
        "learning_path",
        { ...input, items: validateItems(actor, input), ratingAvg: null, ratingCount: 0 },
        { projectId: input.projectId },
      );
      audit.record({ actor, action: "path.create", targetType: "path", targetId: path.id });
      return c.json(path, 201);
    })
    .post("/learning/paths/generate", zValidator("json", GenerateInput, validationHook), (c) => {
      const actor = c.get("actor");
      const input = c.req.valid("json");
      requireCurator(actor, input.projectId);
      const project = identity.requireProject(actor, input.projectId);
      // A path is read by people other than its curator: it only draws on knowledge whose every
      // source the curator may use (exclude policies included), like answers and tutorials.
      const answerable = new Set(identity.answerableSourceIds(actor, project.id));
      const current = services.context
        .listItems(project, undefined, actor)
        .filter((item) => !["disputed", "superseded", "stale"].includes(item.verification))
        .filter((item) => item.evidence.every((entry) => answerable.has(entry.sourceObjectId)));
      if (!current.length)
        throw new AppError(
          409,
          "CONFLICT",
          "Add and process source evidence before drafting a path",
        );
      // FR-LRN-001: dependency order overview → context → decisions → current state → first task.
      const order = [
        "term",
        "component",
        "dependency",
        "person",
        "decision",
        "event",
        "status_claim",
      ];
      const moduleFor = (kind: string) =>
        kind === "term" || kind === "component" || kind === "dependency"
          ? "Context"
          : kind === "person"
            ? "People"
            : kind === "decision" || kind === "event"
              ? "Decisions"
              : "Current state";
      const ranked = [...current]
        .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
        .slice(0, 20);
      const generated = ranked.map((item, ordinal) => ({
        id: randomUUID(),
        type: "read" as const,
        title: item.title,
        objective: item.summary,
        module: moduleFor(item.kind),
        estMinutes: 15,
        dueOffsetDays: Math.round((ordinal / Math.max(1, ranked.length)) * input.targetDays),
        required: true,
        prerequisites: [],
        verification: "engagement" as const,
        sourceId: item.evidence[0]!.sourceObjectId,
        sourceIds: [...new Set(item.evidence.map((ref) => ref.sourceObjectId))],
      }));
      const people = current.filter((item) => item.kind === "person").slice(0, 3);
      const meet = people.map((person) => ({
        id: randomUUID(),
        type: "meet" as const,
        title: `Meet ${person.title}`,
        objective: person.summary,
        module: "People",
        estMinutes: 30,
        dueOffsetDays: Math.round(input.targetDays * 0.3),
        required: false,
        prerequisites: [],
        verification: "self" as const,
        sourceId: person.evidence[0]!.sourceObjectId,
        sourceIds: [...new Set(person.evidence.map((ref) => ref.sourceObjectId))],
      }));
      const firstTask = {
        id: randomUUID(),
        type: "do" as const,
        title: "First real-work task",
        objective: "Complete a small, real task agreed with your mentor; sign-off verifies it.",
        module: "First win",
        estMinutes: 240,
        dueOffsetDays: input.targetDays,
        required: true,
        prerequisites: [],
        verification: "signoff" as const,
      };
      return c.json(
        store.create(
          actor,
          "learning_path",
          {
            ...input,
            items: [...generated, ...meet, firstTask],
            generationMethod: "evidence_template_v2",
            ratingAvg: null,
            ratingCount: 0,
          },
          { projectId: project.id },
        ),
        201,
      );
    })
    .get("/learning/paths", (c) => {
      const actor = c.get("actor");
      const result = store.list(actor, "learning_path", 100).filter((row) => {
        try {
          identity.requireProject(actor, row.projectId!);
          return row.status === "published" || curated(actor, row.projectId!);
        } catch {
          return false;
        }
      });
      return c.json({ items: result.map((row) => render(actor, row)) });
    })
    .get("/learning/paths/:id", (c) => {
      const actor = c.get("actor");
      const row = store.get(actor, "learning_path", c.req.param("id"));
      identity.requireProject(actor, row.projectId!);
      if (row.status !== "published" && !curated(actor, row.projectId!))
        throw new NotFoundError("Learning path");
      return c.json(render(actor, row));
    })
    .put(
      "/learning/paths/:id",
      zValidator(
        "json",
        PathInputSchema.extend({ version: z.number().int().positive() }),
        validationHook,
      ),
      (c) => {
        const actor = c.get("actor");
        const row = store.get(actor, "learning_path", c.req.param("id"));
        requireCurator(actor, row.projectId!);
        const input = c.req.valid("json");
        if (input.projectId !== row.projectId)
          throw new BadRequestError("A path cannot be moved between projects");
        const { version, ...data } = input;
        return c.json(
          store.update(actor, row, version, {
            status: "draft",
            data: { ...row.data, ...data, items: validateItems(actor, data) },
          }),
        );
      },
    )
    .post("/learning/paths/:id/publish", zValidator("json", VersionSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const row = store.get(actor, "learning_path", c.req.param("id"));
      requireCurator(actor, row.projectId!);
      if (row.status !== "draft")
        throw new AppError(409, "CONFLICT", "Only a reviewed draft can be published");
      if (row.ownerId === actor.id)
        throw new AppError(
          403,
          "FORBIDDEN",
          "A different curator must review and publish this path",
        );
      validateItems(
        actor,
        PathInputSchema.parse({
          projectId: row.data.projectId,
          title: row.data.title,
          roleFamily: row.data.roleFamily,
          items: row.data.items,
        }),
      );
      const definitions = row.data.quizDefinitions as Record<string, string> | undefined;
      if (items(row).some((item) => item.verification === "quiz" && !definitions?.[item.id]))
        throw new AppError(
          409,
          "CONFLICT",
          "Author an evidence-backed quiz for every quiz item before publication",
        );
      const result = db.transaction(() => {
        const snapshot = store.create(actor, "path_version", row.data, {
          projectId: row.projectId!,
          parentId: row.id,
          status: "published",
        });
        const published = store.update(actor, row, c.req.valid("json").version, {
          status: "published",
          data: {
            ...row.data,
            publishedVersionId: snapshot.id,
            publishedAt: new Date().toISOString(),
            publishedBy: actor.id,
          },
        });
        store.event(actor, "path.published", {
          pathId: row.id,
          versionId: snapshot.id,
          curatorId: row.ownerId,
        });
        // Publication by a second curator is the verification step: the author earns path_published.
        awardReputation(db, actor, row.ownerId, "path_published", row.id);
        return published;
      });
      audit.record({ actor, action: "path.publish", targetType: "path", targetId: row.id });
      return c.json(result);
    })
    .post("/learning/paths/:id/archive", zValidator("json", VersionSchema, validationHook), (c) => {
      const actor = c.get("actor");
      const row = store.get(actor, "learning_path", c.req.param("id"));
      requireCurator(actor, row.projectId!);
      if (row.status !== "published")
        throw new AppError(409, "CONFLICT", "Only published paths can be archived");
      const updated = store.update(actor, row, c.req.valid("json").version, { status: "archived" });
      audit.record({ actor, action: "path.archive", targetType: "path", targetId: row.id });
      return c.json(updated);
    })
    .post("/learning/paths/:id/assign", zValidator("json", AssignInput, validationHook), (c) => {
      const actor = c.get("actor");
      const path = store.get(actor, "learning_path", c.req.param("id"));
      const input = c.req.valid("json");
      const learnerMember = identity.requireMember(actor.workspaceId, input.userId);
      // Owners and admins, the learner's manager, and their mentor may assign (PRD §6.4: "Assign
      // path to a person: Manager, own reports; Member, as Mentor"). Curating a path isn't enough.
      if (
        !["owner", "admin"].includes(actor.role) &&
        learnerMember.managerId !== actor.id &&
        !identity.hasAssignment(actor, "mentor", input.userId)
      )
        throw new AppError(
          403,
          "FORBIDDEN",
          "Manager or mentor rights over this person are required",
        );
      identity.requireProject(actor, path.projectId!);
      if (input.mentorId) {
        // The mentor follows this learner's progress (people data). Naming one grants that for this
        // learner, but only for someone who could grant it anyway (owners, admins, the learner's
        // manager), and never yourself; anyone else must name an already-assigned mentor.
        const mentor = identity.requireMember(actor.workspaceId, input.mentorId);
        const assigned = identity.hasAssignment(
          { ...actor, id: input.mentorId, role: mentor.role },
          "mentor",
          input.userId,
        );
        if (!assigned) {
          if (input.mentorId === actor.id)
            throw new AppError(403, "FORBIDDEN", "You can't name yourself as their mentor");
          if (!["owner", "admin"].includes(actor.role) && learnerMember.managerId !== actor.id)
            throw new BadRequestError("Name someone who is assigned as this person's mentor");
          if (mentor.role === "guest") throw new BadRequestError("Guests can't mentor");
          db.insert(assignments)
            .values({
              id: randomUUID(),
              workspaceId: actor.workspaceId,
              userId: input.mentorId,
              type: "mentor",
              scopeType: "user",
              scopeId: input.userId,
              expiresAt: null,
            })
            .run();
        }
      }
      if (input.userId === input.mentorId)
        throw new BadRequestError("Mentor and learner must be different people");
      if (path.status !== "published" || typeof path.data.publishedVersionId !== "string")
        throw new AppError(409, "CONFLICT", "Publish the path before assigning it");
      const learner = { ...actor, id: input.userId, role: learnerMember.role };
      identity.requireProject(learner, path.projectId!);
      const row = store.create(
        actor,
        "path_assignment",
        {
          ...input,
          mentorId: input.mentorId ?? null,
          assignedBy: actor.id,
          pathId: path.id,
          title: path.data.title,
        },
        {
          projectId: path.projectId!,
          parentId: path.data.publishedVersionId,
          ownerId: input.userId,
          status: "active",
        },
      );
      notifyLearner(
        actor,
        input.userId,
        `You were assigned "${String(path.data.title)}"`,
        `/learning/assignments/${row.id}`,
      );
      audit.record({ actor, action: "path.assign", targetType: "assignment", targetId: row.id });
      return c.json(row, 201);
    })
    .post("/learning/paths/:id/enrol", (c) => {
      const actor = c.get("actor");
      if (actor.role === "guest") throw new AppError(403, "FORBIDDEN", "Guests cannot self-enrol");
      const path = store.get(actor, "learning_path", c.req.param("id"));
      identity.requireProject(actor, path.projectId!);
      if (path.status !== "published" || typeof path.data.publishedVersionId !== "string")
        throw new NotFoundError("Learning path");
      const existing = store
        .listOwned(actor, "path_assignment")
        .find((row) => row.parentId === path.data.publishedVersionId && row.status === "active");
      if (existing) return c.json(existing, 200);
      const row = store.create(
        actor,
        "path_assignment",
        {
          userId: actor.id,
          mentorId: null,
          startDate: new Date().toISOString().slice(0, 10),
          assignedBy: actor.id,
          selfEnrolled: true,
          pathId: path.id,
          title: path.data.title,
        },
        { projectId: path.projectId!, parentId: path.data.publishedVersionId, status: "active" },
      );
      audit.record({ actor, action: "path.enrol", targetType: "assignment", targetId: row.id });
      return c.json(row, 201);
    })
    .get("/learning/assignments", (c) =>
      c.json({ items: store.listOwned(c.get("actor"), "path_assignment") }),
    )
    .get("/learning/assignments/:id/progress", (c) => {
      const actor = c.get("actor");
      const row = assignment(actor, c.req.param("id"));
      const settings = workspaceSettings(db, actor.workspaceId);
      const progress = store.listChildren(actor, "item_progress", row.id);
      // Rendered with the viewer's own access: a manager or mentor sees only what they may open.
      const path = render(actor, pathForAssignment(row));
      const required = path.data.items.filter((item) => item.required !== false);
      const done = new Set(
        progress
          .filter((entry) => entry.status === "completed")
          .map((entry) => String(entry.data.itemId)),
      );
      const remainingMinutes = path.data.items
        .filter((item) => !done.has(item.id))
        .reduce((sum, item) => sum + Number((item as { estMinutes?: number }).estMinutes ?? 0), 0);
      const upNext = path.data.items.find(
        (item) =>
          !done.has(item.id) &&
          (item as { prerequisites?: string[] }).prerequisites?.every((id) => done.has(id)) !==
            false,
      );
      return c.json({
        assignment: row,
        path,
        summary: {
          requiredTotal: required.length,
          requiredCompleted: required.filter((item) => done.has(item.id)).length,
          percent: required.length
            ? Math.round(
                (required.filter((item) => done.has(item.id)).length / required.length) * 100,
              )
            : 0,
          remainingMinutes,
          upNextItemId: upNext?.id ?? null,
        },
        items: progress.map((entry) =>
          withStuck(
            entry.ownerId === actor.id
              ? entry
              : {
                  ...entry,
                  data: {
                    itemId: entry.data.itemId,
                    firstOpenedAt: entry.data.firstOpenedAt,
                    completedAt: entry.data.completedAt,
                    // Managers and mentors see pass/not-yet only (FR-CHK-007).
                    passed: entry.data.passed ?? null,
                  },
                },
            settings.policies.nudges.stuckHours,
          ),
        ),
      });
    })
    .post(
      "/learning/assignments/:id/rate",
      zValidator("json", RatingInput, validationHook),
      (c) => {
        const actor = c.get("actor");
        const row = assignment(actor, c.req.param("id"));
        if (row.ownerId !== actor.id)
          throw new AppError(403, "FORBIDDEN", "Only the learner rates a path");
        if (row.status !== "completed")
          throw new AppError(409, "CONFLICT", "Complete the path before rating it");
        if (typeof row.data.rating === "number")
          throw new AppError(409, "CONFLICT", "Already rated");
        const input = c.req.valid("json");
        const updated = store.update(actor, row, input.version, {
          data: { ...row.data, rating: input.rating, ratingComment: input.comment },
        });
        const version = store.find(actor.workspaceId, "path_version", row.parentId!);
        const path = version?.parentId
          ? store.find(actor.workspaceId, "learning_path", version.parentId)
          : undefined;
        if (path) {
          const count = Number(path.data.ratingCount ?? 0);
          const avg = Number(path.data.ratingAvg ?? 0);
          store.patch(path, {
            data: {
              ...path.data,
              ratingCount: count + 1,
              ratingAvg: Math.round(((avg * count + input.rating) / (count + 1)) * 100) / 100,
            },
          });
        }
        return c.json(updated);
      },
    )
    .get("/learning/assignments/:assignmentId/items/:itemId/quiz", (c) => {
      const actor = c.get("actor");
      const { path, item } = learnerItem(actor, c.req.param("assignmentId"), c.req.param("itemId"));
      const definitionId = (path.data.quizDefinitions as Record<string, string> | undefined)?.[
        item.id
      ];
      if (!definitionId) throw new NotFoundError("Quiz");
      const definition = store.get(actor, "quiz_definition", definitionId);
      const quiz = QuizInput.parse(definition.data);
      const visible = services.context.listItems(
        identity.requireProject(actor, path.projectId!),
        undefined,
        actor,
      );
      if (
        quiz.questions.some(
          (question) =>
            !visible.some(
              (claim) =>
                claim.id === question.claimId &&
                !["disputed", "superseded", "stale"].includes(claim.verification),
            ),
        )
      )
        throw new NotFoundError("Quiz evidence");
      return c.json({
        questions: quiz.questions.map(({ prompt, options, claimId }) => ({
          prompt,
          options,
          claimId,
        })),
      });
    })
    .post(
      "/learning/assignments/:assignmentId/items/:itemId/quiz/submit",
      zValidator("json", QuizSubmission, validationHook),
      (c) => {
        const actor = c.get("actor");
        const { row, path, item } = learnerItem(
          actor,
          c.req.param("assignmentId"),
          c.req.param("itemId"),
        );
        const input = c.req.valid("json");
        if (item.verification !== "quiz")
          throw new BadRequestError("This item is not verified by a quiz");
        const progress = findProgress(actor, row.id, item.id);
        if (progress?.status !== "in_progress")
          throw new AppError(409, "CONFLICT", "Start the quiz item first");
        const quiz = QuizInput.parse(
          store.get(
            actor,
            "quiz_definition",
            (path.data.quizDefinitions as Record<string, string>)[item.id]!,
          ).data,
        );
        if (
          input.answers.length !== quiz.questions.length ||
          input.answers.some((answer, index) => answer >= quiz.questions[index]!.options.length)
        )
          throw new BadRequestError("Provide one valid answer for each question");
        const visible = services.context.listItems(
          identity.requireProject(actor, path.projectId!),
          undefined,
          actor,
        );
        if (
          quiz.questions.some(
            (question) =>
              !visible.some(
                (claim) =>
                  claim.id === question.claimId &&
                  !["disputed", "superseded", "stale"].includes(claim.verification),
              ),
          )
        )
          throw new NotFoundError("Quiz evidence");
        const attempts = Number(progress.data.attempts ?? 0);
        if (
          attempts >= 2 &&
          Date.now() - Date.parse(String(progress.data.lastAttemptAt)) < QUIZ_COOLDOWN_MS
        )
          throw new AppError(429, "RATE_LIMITED", "Wait ten minutes before another quiz attempt");
        const score = Math.round(
          (100 *
            input.answers.filter((answer, index) => answer === quiz.questions[index]!.correctIndex)
              .length) /
            quiz.questions.length,
        );
        const passed = score >= QUIZ_PASS_PERCENT;
        const attemptData = {
          score,
          passed,
          attempts: attempts + 1,
          lastAttemptAt: new Date().toISOString(),
        };
        let updated: PlatformRecord;
        let assignmentCompleted = false;
        if (passed) {
          const result = complete(actor, row, progress, input.version, attemptData, item);
          updated = result.progress;
          assignmentCompleted = result.assignmentCompleted;
          if (attempts === 0)
            awardReputation(db, actor, actor.id, "quiz_passed_first_try", `${row.id}:${item.id}`);
          store.event(actor, "checkpoint.quiz.passed", {
            assignmentId: row.id,
            itemId: item.id,
            userId: actor.id,
            score,
          });
        } else {
          updated = store.update(actor, progress, input.version, {
            status: "in_progress",
            data: { ...progress.data, ...attemptData, completedAt: null },
          });
          // After three failures the mentor is nudged; quiz content is never exposed (FR-CHK-003).
          if (attempts + 1 === 3 && typeof row.data.mentorId === "string")
            notifier.notify(actor.workspaceId, row.data.mentorId, {
              type: "quiz.failed_three_times",
              category: "onboarding",
              title: `${actor.name} may need help with "${item.title}"`,
              link: `/learning/assignments/${row.id}`,
              nudge: true,
              projectId: row.projectId ?? undefined,
            });
        }
        return c.json({
          progress: updated,
          passed,
          score,
          assignmentCompleted,
          explanations: quiz.questions.map((question) => ({
            claimId: question.claimId,
            text: question.explanation,
          })),
        });
      },
    )
    .post("/learning/assignments/:assignmentId/items/:itemId/start", (c) => {
      const actor = c.get("actor");
      const { row, item } = learnerItem(actor, c.req.param("assignmentId"), c.req.param("itemId"));
      if (new Date(`${String(row.data.startDate)}T00:00:00Z`) > new Date())
        throw new AppError(409, "CONFLICT", "This assignment has not started");
      const previous = findProgress(actor, row.id, item.id);
      if (previous) return c.json(previous);
      const progress = store
        .listChildren(actor, "item_progress", row.id)
        .filter((entry) => entry.status === "completed");
      if (item.prerequisites.some((id) => !progress.some((entry) => entry.data.itemId === id)))
        throw new AppError(409, "CONFLICT", "Complete the prerequisites first");
      return c.json(
        store.create(
          actor,
          "item_progress",
          { itemId: item.id, firstOpenedAt: new Date().toISOString(), dwellSeconds: 0 },
          { parentId: row.id, projectId: row.projectId!, status: "in_progress" },
        ),
        201,
      );
    })
    .post(
      "/learning/assignments/:assignmentId/items/:itemId/skip",
      zValidator("json", VersionSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const { row, item } = learnerItem(
          actor,
          c.req.param("assignmentId"),
          c.req.param("itemId"),
        );
        if (item.required) throw new AppError(403, "FORBIDDEN", "Required items cannot be skipped");
        const progress = findProgress(actor, row.id, item.id);
        if (!progress) throw new AppError(409, "CONFLICT", "Start the item first");
        const updated = store.update(actor, progress, c.req.valid("json").version, {
          status: "skipped",
          data: { ...progress.data, skippedAt: new Date().toISOString() },
        });
        completeAssignmentIfDone(db, identity, actor, store.get(actor, "path_assignment", row.id));
        return c.json(updated);
      },
    )
    .post(
      "/learning/assignments/:assignmentId/items/:itemId/dwell",
      zValidator("json", DwellInput, validationHook),
      (c) => {
        const actor = c.get("actor");
        const { row, item } = learnerItem(
          actor,
          c.req.param("assignmentId"),
          c.req.param("itemId"),
        );
        if (item.verification !== "engagement")
          throw new BadRequestError("This item does not use engagement verification");
        const progress = findProgress(actor, row.id, item.id);
        if (!progress) throw new AppError(409, "CONFLICT", "Start the item first");
        if (progress.status === "completed") return c.json(progress);
        const last = Date.parse(String(progress.data.lastHeartbeat ?? progress.data.firstOpenedAt));
        // Credit only the bounded interval since the last server-observed heartbeat.
        const dwellSeconds =
          Number(progress.data.dwellSeconds) +
          Math.min(15, Math.max(0, (Date.now() - last) / 1000));
        // FR-CHK-001(a): 60 s or 25% of the estimated read time, whichever is lower.
        const completed = dwellSeconds >= Math.min(60, item.estMinutes * 60 * 0.25);
        const heartbeat = { dwellSeconds, lastHeartbeat: new Date().toISOString() };
        if (!completed)
          return c.json(
            store.update(actor, progress, c.req.valid("json").version, {
              data: { ...progress.data, ...heartbeat },
            }),
          );
        const result = complete(actor, row, progress, c.req.valid("json").version, heartbeat, item);
        store.event(actor, "checkpoint.dwell.verified", {
          assignmentId: row.id,
          itemId: item.id,
          userId: actor.id,
        });
        return c.json(result.progress);
      },
    )
    .post("/learning/assignments/:assignmentId/items/:itemId/signoff/request", (c) => {
      const actor = c.get("actor");
      const { row, item } = learnerItem(actor, c.req.param("assignmentId"), c.req.param("itemId"));
      if (item.verification !== "signoff" && item.verification !== "event")
        throw new BadRequestError("This item does not support sign-off");
      const progress = findProgress(actor, row.id, item.id);
      if (progress?.status !== "in_progress")
        throw new AppError(409, "CONFLICT", "Start the item first");
      const mentorId = typeof row.data.mentorId === "string" ? row.data.mentorId : null;
      const managerId = identity.requireMember(actor.workspaceId, actor.id).managerId;
      const requestedFrom = mentorId ?? managerId;
      if (!requestedFrom)
        throw new AppError(409, "CONFLICT", "No mentor or manager is available to sign off");
      const updated = store.update(actor, progress, progress.version, {
        status: "awaiting_verification",
        data: {
          ...progress.data,
          requestedFrom,
          signoffRequestedAt: new Date().toISOString(),
          escalatedTo: null,
        },
      });
      notifier.notify(actor.workspaceId, requestedFrom, {
        type: "signoff.requested",
        category: "onboarding",
        title: `${actor.name} requested sign-off for "${item.title}"`,
        link: `/learning/signoffs/${progress.id}`,
        data: { progressId: progress.id, assignmentId: row.id },
        projectId: row.projectId ?? undefined,
      });
      return c.json(updated);
    })
    .post(
      "/learning/signoffs/:id/decide",
      zValidator("json", SignoffInput, validationHook),
      (c) => {
        const actor = c.get("actor");
        const progress = store.get(actor, "item_progress", c.req.param("id"));
        const row = assignment(actor, progress.parentId!);
        if (row.ownerId === actor.id)
          throw new AppError(403, "FORBIDDEN", "Learners cannot sign off their own work");
        if (progress.status !== "awaiting_verification")
          throw new AppError(409, "CONFLICT", "No sign-off is pending");
        const input = c.req.valid("json");
        const learner = learnerActor(actor, row);
        const item = items(pathForAssignment(row)).find(
          (entry) => entry.id === progress.data.itemId,
        );
        let result: PlatformRecord;
        if (input.approved) {
          const updated = store.update(actor, progress, input.version, {
            status: "completed",
            data: {
              ...progress.data,
              decidedBy: actor.id,
              note: input.note,
              completedAt: new Date().toISOString(),
              companionActive: companionActive(learner),
            },
          });
          if (item) creditCuratorForItem(db, learner, row, item.id);
          completeAssignmentIfDone(
            db,
            identity,
            learner,
            store.get(actor, "path_assignment", row.id),
          );
          store.event(actor, "checkpoint.signoff.approved", {
            assignmentId: row.id,
            itemId: progress.data.itemId,
            approverId: actor.id,
          });
          result = updated;
        } else
          result = store.update(actor, progress, input.version, {
            status: "in_progress",
            data: { ...progress.data, decidedBy: actor.id, note: input.note, completedAt: null },
          });
        notifyLearner(
          actor,
          row.ownerId,
          input.approved
            ? `"${item?.title ?? "Checkpoint"}" was signed off`
            : `"${item?.title ?? "Checkpoint"}" needs more work`,
          `/learning/assignments/${row.id}`,
        );
        audit.record({
          actor,
          action: "checkpoint.signoff",
          targetType: "progress",
          targetId: progress.id,
          metadata: { approved: input.approved },
        });
        return c.json(result);
      },
    )
    .post(
      "/learning/assignments/:assignmentId/items/:itemId/attest",
      zValidator("json", VersionSchema, validationHook),
      (c) => {
        const actor = c.get("actor");
        const { row, item } = learnerItem(
          actor,
          c.req.param("assignmentId"),
          c.req.param("itemId"),
        );
        if (item.verification !== "self" || (item.required && item.type !== "meet"))
          throw new AppError(403, "FORBIDDEN", "Self-attestation is not allowed for this item");
        const progress = findProgress(actor, row.id, item.id);
        if (progress?.status !== "in_progress")
          throw new AppError(409, "CONFLICT", "Start the item first");
        return c.json(
          complete(actor, row, progress, c.req.valid("json").version, { attested: true }, item)
            .progress,
        );
      },
    );
}
