import { randomUUID } from "node:crypto";
import { PathInputSchema, VersionSchema } from "@contextos/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Container } from "../../container.js";
import { AppError, BadRequestError, NotFoundError } from "../../lib/errors.js";
import { validationHook } from "../../middleware/validation.js";
import type { Actor, AppEnv } from "../../types.js";
import { createPlatformStore, type PlatformRecord } from "./store.js";

const AssignInput = z
  .object({
    userId: z.string().min(1).max(200),
    mentorId: z.string().min(1).max(200),
    startDate: z.iso.date(),
  })
  .strict();
const GenerateInput = z
  .object({
    projectId: z.uuid(),
    roleFamily: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(200).default("Project onboarding"),
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
type PathData = z.infer<typeof PathInputSchema>;
type Item = PathData["items"][number] & { id: string };

export function createLearningRoutes(container: Container) {
  const { db, identity, services, audit } = container;
  const store = createPlatformStore(db);
  const curated = (actor: Actor, projectId: string) =>
    actor.role === "owner" ||
    actor.role === "admin" ||
    identity.hasAssignment(actor, "path_curator", projectId);
  const requireCurator = (actor: Actor, projectId: string) => {
    identity.requireProject(actor, projectId);
    if (!curated(actor, projectId))
      throw new AppError(403, "FORBIDDEN", "Path curator access is required");
  };
  const items = (path: PlatformRecord): Item[] => path.data.items as Item[];
  const dependencies = (item: Item | PathData["items"][number]) => [
    ...new Set([...(item.sourceIds ?? []), ...(item.sourceId ? [item.sourceId] : [])]),
  ];
  const validateItems = (actor: Actor, input: PathData) => {
    identity.requireProject(actor, input.projectId);
    const normalized = input.items.map((item) => ({ ...item, id: item.id ?? randomUUID() }));
    const ids = new Set(normalized.map((item) => item.id));
    if (ids.size !== normalized.length) throw new BadRequestError("Item IDs must be unique");
    const complete = new Set<string>();
    for (const item of normalized) {
      for (const id of dependencies(item)) identity.requireSource(actor, input.projectId, id);
      if (item.prerequisites.some((id) => !ids.has(id) || !complete.has(id)))
        throw new BadRequestError(
          "Prerequisites must reference earlier items; cycles are not allowed",
        );
      if (item.verification === "self" && item.required && item.type !== "meet")
        throw new BadRequestError("Required items require independent verification");
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
          !dependencies(item).every((id) => allowed.has(id))
            ? {
                id: item.id,
                type: item.type,
                title: "Restricted learning resource",
                objective: "Source access is required",
                required: false,
                accessible: false,
              }
            : { ...item, accessible: true },
        ),
      },
    };
  };
  const assignment = (actor: Actor, id: string) => {
    const row = store.get(actor, "path_assignment", id);
    identity.requireProject(actor, row.projectId!);
    if (
      row.ownerId !== actor.id &&
      row.data.mentorId !== actor.id &&
      identity.requireMember(actor.workspaceId, row.ownerId).managerId !== actor.id
    )
      throw new NotFoundError("Path assignment");
    return row;
  };
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
    for (const id of dependencies(item)) identity.requireSource(actor, row.projectId!, id);
    return { row, path, item };
  };
  const findProgress = (actor: Actor, assignmentId: string, itemId: string) =>
    store
      .listChildren(actor, "item_progress", assignmentId)
      .find((entry) => entry.data.itemId === itemId);
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
        { ...input, items: validateItems(actor, input) },
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
      const context = services.context
        .listItems(project, undefined, actor)
        .filter((item) => !["disputed", "superseded", "stale"].includes(item.verification))
        .slice(0, 20);
      if (!context.length)
        throw new AppError(
          409,
          "CONFLICT",
          "Add and process source evidence before drafting a path",
        );
      const generated = context.map((item, ordinal) => ({
        id: randomUUID(),
        type: "read" as const,
        title: item.title,
        objective: item.summary,
        estMinutes: 15,
        dueOffsetDays: ordinal,
        required: true,
        prerequisites: [],
        verification: "signoff" as const,
        sourceId: item.evidence[0]!.sourceObjectId,
        sourceIds: [...new Set(item.evidence.map((ref) => ref.sourceObjectId))],
      }));
      return c.json(
        store.create(
          actor,
          "learning_path",
          { ...input, items: generated, generationMethod: "evidence_template_v1" },
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
            data: { ...data, items: validateItems(actor, data) },
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
          data: { ...row.data, publishedVersionId: snapshot.id },
        });
        store.event(actor, "path.published", { pathId: row.id, versionId: snapshot.id });
        return published;
      });
      audit.record({ actor, action: "path.publish", targetType: "path", targetId: row.id });
      return c.json(result);
    })
    .post("/learning/paths/:id/assign", zValidator("json", AssignInput, validationHook), (c) => {
      const actor = c.get("actor");
      const path = store.get(actor, "learning_path", c.req.param("id"));
      requireCurator(actor, path.projectId!);
      const input = c.req.valid("json");
      identity.requireMember(actor.workspaceId, input.userId);
      identity.requireMember(actor.workspaceId, input.mentorId);
      if (input.userId === input.mentorId)
        throw new BadRequestError("Mentor and learner must be different people");
      if (path.status !== "published" || typeof path.data.publishedVersionId !== "string")
        throw new AppError(409, "CONFLICT", "Publish the path before assigning it");
      const learner = {
        ...actor,
        id: input.userId,
        role: identity.requireMember(actor.workspaceId, input.userId).role,
      };
      identity.requireProject(learner, path.projectId!);
      const row = store.create(actor, "path_assignment", input, {
        projectId: path.projectId!,
        parentId: path.data.publishedVersionId,
        ownerId: input.userId,
        status: "active",
      });
      audit.record({ actor, action: "path.assign", targetType: "assignment", targetId: row.id });
      return c.json(row, 201);
    })
    .get("/learning/assignments", (c) =>
      c.json({ items: store.listOwned(c.get("actor"), "path_assignment") }),
    )
    .get("/learning/assignments/:id/progress", (c) => {
      const actor = c.get("actor");
      const row = assignment(actor, c.req.param("id"));
      const progress = store.listChildren(actor, "item_progress", row.id);
      return c.json({
        assignment: row,
        path: render(
          {
            ...actor,
            id: row.ownerId,
            role: identity.requireMember(actor.workspaceId, row.ownerId).role,
          },
          pathForAssignment(row),
        ),
        items: progress.map((entry) =>
          entry.ownerId === actor.id
            ? entry
            : {
                ...entry,
                data: {
                  itemId: entry.data.itemId,
                  firstOpenedAt: entry.data.firstOpenedAt,
                  completedAt: entry.data.completedAt,
                },
              },
        ),
      });
    })
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
        if (attempts >= 2 && Date.now() - Date.parse(String(progress.data.lastAttemptAt)) < 600000)
          throw new AppError(429, "RATE_LIMITED", "Wait ten minutes before another quiz attempt");
        const score = Math.round(
          (100 *
            input.answers.filter((answer, index) => answer === quiz.questions[index]!.correctIndex)
              .length) /
            quiz.questions.length,
        );
        const passed = score >= 70;
        const updated = store.update(actor, progress, input.version, {
          status: passed ? "completed" : "in_progress",
          data: {
            ...progress.data,
            score,
            passed,
            attempts: attempts + 1,
            lastAttemptAt: new Date().toISOString(),
            completedAt: passed ? new Date().toISOString() : null,
          },
        });
        return c.json({
          progress: updated,
          passed,
          score,
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
        const completed = dwellSeconds >= Math.min(60, item.estMinutes * 60 * 0.25);
        return c.json(
          store.update(actor, progress, c.req.valid("json").version, {
            status: completed ? "completed" : "in_progress",
            data: {
              ...progress.data,
              dwellSeconds,
              lastHeartbeat: new Date().toISOString(),
              completedAt: completed ? new Date().toISOString() : null,
            },
          }),
        );
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
      return c.json(
        store.update(actor, progress, progress.version, {
          status: "awaiting_verification",
          data: { ...progress.data, requestedFrom: row.data.mentorId },
        }),
      );
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
        const result = store.update(actor, progress, input.version, {
          status: input.approved ? "completed" : "in_progress",
          data: {
            ...progress.data,
            decidedBy: actor.id,
            note: input.note,
            completedAt: input.approved ? new Date().toISOString() : null,
          },
        });
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
          store.update(actor, progress, c.req.valid("json").version, {
            status: "completed",
            data: { ...progress.data, completedAt: new Date().toISOString() },
          }),
        );
      },
    );
}
