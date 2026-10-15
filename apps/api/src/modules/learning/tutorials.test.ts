import {
  CheckResultSchema,
  KnowledgeCheckSchema,
  LessonSchema,
  MilestoneListSchema,
  ModuleDetailSchema,
  MyLearningSchema,
  MyOnboardingSchema,
  MyRoadmapSchema,
  MyTasksSchema,
  NextUpResponseSchema,
  TutorialDetailSchema,
  TutorialListSchema,
  type TutorialDetail,
} from "@contextos/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { memberships, platformRecords, sourceObjects, users } from "../../db/schema.js";
import {
  addSource,
  createFakeGemini,
  createProject,
  createTestApp,
  jsonRequest,
  type TestApp,
} from "../../test/helpers.js";
import type { Actor } from "../../types.js";

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe("Tutorials: drafted from knowledge, reviewed, published and taken", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;
  const owner = () => ({ ...t.container.devActor });
  let admin: Actor;
  const member = (
    id: string,
    role: Actor["role"],
    managerId: string | null = null,
    organization: Record<string, unknown> = {},
  ) => {
    t.container.db
      .insert(users)
      .values({ id, name: `${id} Doe` })
      .onConflictDoNothing()
      .run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: id, role, managerId, organization })
      .onConflictDoNothing()
      .run();
  };
  const as = (id: string, role: Actor["role"]) =>
    Object.assign(t.container.devActor, { id, name: `${id} Doe`, role });
  const asAdmin = () => Object.assign(t.container.devActor, admin);
  const get = async <T>(path: string) => {
    const response = await t.app.request(`/api/v1${path}`);
    expect(response.status, path).toBe(200);
    return json<T>(response);
  };

  /** A project with processed knowledge and a published tutorial on it. */
  const publishedTutorial = async () => {
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();
    // Shared with everyone, so every learner can open the lessons built on it.
    t.container.db.update(sourceObjects).set({ visibility: "workspace" }).run();
    const created = await t.app.request(
      "/api/v1/tutorials",
      jsonRequest({ projectId: project.id, audience: "New engineers", focus: "billing" }),
    );
    expect(created.status).toBe(202);
    const { id } = await json<{ id: string }>(created);
    await t.drain();
    expect(
      (
        await t.app.request(
          `/api/v1/tutorials/${id}/publish`,
          jsonRequest({ updateLearners: false }),
        )
      ).status,
    ).toBe(200);
    return { project, id };
  };

  it("drafts from stored knowledge, keeps drafts until published, and flags changed sources", async () => {
    const gemini = createFakeGemini();
    t = createTestApp({ gemini });
    admin = owner();
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();

    const created = await t.app.request(
      "/api/v1/tutorials",
      jsonRequest({ projectId: project.id, audience: "New engineers", focus: "billing" }),
    );
    expect(created.status).toBe(202);
    const pending = TutorialDetailSchema.parse(await json(created));
    expect(pending.status).toBe("generating");
    await t.drain();

    let detail = TutorialDetailSchema.parse(await get(`/tutorials/${pending.id}`));
    expect(detail).toMatchObject({ status: "draft", lessonCount: 2, questionCount: 2 });
    expect(detail.content?.lessons[0]).toMatchObject({
      id: "l1",
      title: "Why we changed",
      basedOn: [expect.any(String) as string],
    });
    expect(detail.content?.lessons[0]!.body).toContain("## Why we changed");
    expect(detail.content?.check?.passMark).toBe(2);
    expect(detail.sources.every((source) => source.state === "current")).toBe(true);
    // Built from the Knowledge Hub's stored items, not from Drive.
    const call = gemini.calls.find((entry) => entry.purpose === "tutorial");
    expect(call?.prompt).toContain("<knowledge>");
    expect(TutorialListSchema.parse(await get("/tutorials")).items).toHaveLength(1);

    // Curators edit the draft (Markdown); a bad question is refused.
    const edited = structuredClone(detail.content!);
    edited.lessons[0]!.body = "## Why we changed\n\nEdited by the admin.";
    let response = await t.app.request(
      `/api/v1/tutorials/${detail.id}`,
      jsonRequest({ content: edited }, "PATCH"),
    );
    expect(response.status).toBe(200);
    const broken = structuredClone(edited);
    broken.check!.questions[0]!.correctOptionId = "z";
    response = await t.app.request(
      `/api/v1/tutorials/${detail.id}`,
      jsonRequest({ content: broken }, "PATCH"),
    );
    expect(response.status).toBe(400);

    // Members can't manage tutorials, and can't see an unpublished one.
    member("emp", "member");
    as("emp", "member");
    expect((await t.app.request("/api/v1/tutorials")).status).toBe(403);
    expect((await t.app.request(`/api/v1/me/modules/tutorial-${detail.id}`)).status).toBe(404);
    asAdmin();

    response = await t.app.request(
      `/api/v1/tutorials/${detail.id}/publish`,
      jsonRequest({ updateLearners: false }),
    );
    detail = TutorialDetailSchema.parse(await json(response));
    expect(detail).toMatchObject({
      status: "published",
      publishedVersion: 1,
      unpublishedChanges: false,
    });

    // A sync changes a source: the tutorial is untouched and says it needs an update.
    t.container.db.update(sourceObjects).set({ contentHash: "changed-in-drive" }).run();
    detail = TutorialDetailSchema.parse(await get(`/tutorials/${detail.id}`));
    expect(detail.staleSources).toBe(1);
    expect(detail.content?.lessons[0]!.body).toBe("## Why we changed\n\nEdited by the admin.");

    // The admin decides to regenerate: a new draft, while learners keep version 1.
    expect(
      (await t.app.request(`/api/v1/tutorials/${detail.id}/regenerate`, jsonRequest({}))).status,
    ).toBe(202);
    await t.drain();
    detail = TutorialDetailSchema.parse(await get(`/tutorials/${detail.id}`));
    expect(detail).toMatchObject({
      publishedVersion: 1,
      unpublishedChanges: true,
      staleSources: 0,
    });
  });

  it("assigns a tutorial to someone not onboarding; they take it in My learning", async () => {
    t = createTestApp();
    admin = owner();
    const { id } = await publishedTutorial();
    member("emp", "member");
    member("other", "member");
    expect(
      (
        await t.app.request(
          `/api/v1/tutorials/${id}/assign`,
          jsonRequest({ userId: "emp", dueOn: day(7) }),
        )
      ).status,
    ).toBe(201);

    as("emp", "member");
    const mine = MyLearningSchema.parse(await get("/me/learning"));
    expect(mine.assigned).toEqual([
      expect.objectContaining({ id: `tutorial-${id}`, dueOn: day(7), lessonCount: 3 }),
    ]);
    const key = `tutorial-${id}`;
    const module = ModuleDetailSchema.parse(await get(`/me/modules/${key}`));
    expect(module.lessons.map((lesson) => lesson.type)).toEqual(["article", "article", "check"]);
    expect(module.stage.name).toBe("My learning");

    const lesson = LessonSchema.parse(await get(`/me/lessons/${key}~l1`));
    expect(lesson.blocks).toEqual([
      { type: "markdown", text: expect.stringContaining("## Why we changed") as string },
    ]);
    const done = await json<{ next: { kind: string; id: string } | null; moduleProgress: number }>(
      await t.app.request(`/api/v1/me/lessons/${key}~l1/complete`, jsonRequest({})),
    );
    expect(done.next).toEqual({ kind: "lesson", id: `${key}~l2` });
    await t.app.request(`/api/v1/me/lessons/${key}~l2/complete`, jsonRequest({}));

    // The check never reveals answers before an attempt.
    const check = KnowledgeCheckSchema.parse(await get(`/me/checks/${key}~check`));
    expect(JSON.stringify(check)).not.toContain("correct");
    const attempt = (optionIds: string[]) =>
      t.app.request(
        `/api/v1/me/checks/${key}~check/attempts`,
        jsonRequest({
          answers: check.questions.map((question, index) => ({
            questionId: question.id,
            optionId: optionIds[index]!,
          })),
        }),
      );
    const failed = CheckResultSchema.parse(await json(await attempt(["b", "a"])));
    expect(failed).toMatchObject({ passed: false, score: 0, progress: null });
    const passed = CheckResultSchema.parse(await json(await attempt(["a", "b"])));
    expect(passed).toMatchObject({ passed: true, score: 2 });
    expect(MyLearningSchema.parse(await get("/me/learning")).completed).toEqual([
      expect.objectContaining({ id: key }),
    ]);

    // If its source were restricted, lessons built on it would be locked and the check withheld.
    t.container.db.update(sourceObjects).set({ visibility: "restricted" }).run();
    as("other", "member");
    const locked = ModuleDetailSchema.parse(await get(`/me/modules/${key}`));
    expect(locked.lessons.map((entry) => entry.title)).toEqual([
      "Why we changed (restricted)",
      "Who owns what (restricted)",
    ]);
    const restrictedLesson = LessonSchema.parse(await get(`/me/lessons/${key}~l1`));
    expect(restrictedLesson.blocks[0]).toMatchObject({
      text: expect.stringContaining("restricted") as string,
    });
    t.container.db.update(sourceObjects).set({ visibility: "workspace" }).run();
    as("emp", "member");

    // Ratings are stored; a clarification goes to whoever wrote the tutorial.
    expect(
      await json(
        await t.app.request(
          "/api/v1/me/learning-ratings",
          jsonRequest({ targetType: "module", targetId: key, value: "up" }),
        ),
      ),
    ).toEqual({ value: "up" });
    const request = await json<{ recipient: { id: string } }>(
      await t.app.request(
        "/api/v1/me/learning-requests",
        jsonRequest({
          type: "clarification",
          moduleId: key,
          lessonId: null,
          changeKind: null,
          message: "What replaced the batch job?",
        }),
      ),
    );
    expect(request.recipient.id).toBe(admin.id);

    // Someone else can add it themselves from My learning's suggestions.
    as("other", "member");
    const suggestions = MyLearningSchema.parse(await get("/me/learning")).suggested;
    expect(suggestions.map((entry) => entry.id)).toContain(key);
    expect(
      MyLearningSchema.parse(
        await json(await t.app.request(`/api/v1/me/learning/${key}/add`, jsonRequest({}))),
      ).assigned.map((entry) => entry.id),
    ).toContain(key);
  });

  it("keeps people on their version until the curator moves them (FR-LRN-012)", async () => {
    t = createTestApp();
    admin = owner();
    const { id } = await publishedTutorial();
    const key = `tutorial-${id}`;
    member("emp", "member");
    as("emp", "member");
    await t.app.request(`/api/v1/me/learning/${key}/add`, jsonRequest({}));
    await t.app.request(`/api/v1/me/lessons/${key}~l1/complete`, jsonRequest({}));

    asAdmin();
    const detail = await get<TutorialDetail>(`/tutorials/${id}`);
    const content = structuredClone(detail.content!);
    content.lessons[1]!.title = "Owners and teams";
    await t.app.request(`/api/v1/tutorials/${id}`, jsonRequest({ content }, "PATCH"));
    await t.app.request(`/api/v1/tutorials/${id}/publish`, jsonRequest({ updateLearners: false }));

    as("emp", "member");
    let module = ModuleDetailSchema.parse(await get(`/me/modules/${key}`));
    expect(module.lessons[1]!.title).toBe("Who owns what");

    asAdmin();
    await t.app.request(`/api/v1/tutorials/${id}/publish`, jsonRequest({ updateLearners: true }));
    as("emp", "member");
    module = ModuleDetailSchema.parse(await get(`/me/modules/${key}`));
    expect(module.lessons[1]!.title).toBe("Owners and teams");
    // What they finished stays finished.
    expect(module.lessons[0]!.done).toBe(true);
  });

  it("runs a new hire's roadmap, Home summaries and tutorial slots from real data", async () => {
    t = createTestApp();
    admin = owner();
    const { id } = await publishedTutorial();
    member("dan", "manager");
    member("sana", "member");
    member("leah", "member", "dan", { startDate: day(-20), isNewHire: true });

    // An admin's tutorial fills the template's "Architecture overview" slot.
    await t.app.request(
      `/api/v1/tutorials/${id}`,
      jsonRequest({ coversModule: "mod-architecture" }, "PATCH"),
    );

    as("dan", "manager");
    const options = await get<{ roadmap: { templates: Array<{ id: string; name: string }> } }>(
      "/team/members/leah/assign-options",
    );
    await t.app.request(
      "/api/v1/team/members/leah/roadmap",
      jsonRequest({
        templateId: options.roadmap.templates.find((row) => row.name.startsWith("Engineering"))!.id,
        addOnIds: [],
        buddyId: "sana",
      }),
    );

    as("leah", "member");
    const roadmap = MyRoadmapSchema.parse(await get("/me/roadmap"));
    expect(roadmap.stages.map((stage) => stage.state)).toEqual(["done", "current", "next"]);
    expect(roadmap.buddy?.id).toBe("sana");
    MyOnboardingSchema.parse(await get("/me/onboarding"));
    const next = NextUpResponseSchema.parse(await get("/me/next-up"));
    expect(next.item).not.toBeNull();
    MyTasksSchema.parse(await get("/me/tasks"));
    const milestones = MilestoneListSchema.parse(await get("/me/milestones"));
    expect(milestones.items.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(["checkin", "readiness", "probation", "stage"]),
    );

    const core = roadmap.stages.find((stage) => stage.name === "Core knowledge")!;
    const architecture = core.modules.find((entry) => entry.title === "Architecture overview")!;
    const detail = ModuleDetailSchema.parse(await get(`/me/modules/${architecture.id}`));
    // The tutorial's lessons and check, not a placeholder.
    expect(detail.lessons.map((lesson) => lesson.type)).toEqual(["article", "article", "check"]);
    // A module without a tutorial is one honest step; later stages are locked.
    const review = core.modules.find((entry) => entry.title === "Code review norms")!;
    const simple = ModuleDetailSchema.parse(await get(`/me/modules/${review.id}`));
    expect(simple.lessons).toHaveLength(1);
    const later = roadmap.stages.at(-1)!.modules[0]!;
    expect(later.status).toBe("locked");
    expect(ModuleDetailSchema.parse(await get(`/me/modules/${later.id}`)).lessons).toEqual([]);

    // Finishing it shows on the roadmap the manager reads.
    await t.app.request(`/api/v1/me/lessons/${review.id}~l1/complete`, jsonRequest({}));
    as("dan", "manager");
    const memberView = await get<{ modules: Array<{ id: string; state: string }> }>(
      "/team/members/leah",
    );
    expect(memberView.modules.find((entry) => entry.id === review.id)?.state).toBe("done");

    // Assigning a tutorial to someone onboarding puts it on their roadmap.
    asAdmin();
    const placed = await json<{ placedIn: string; moduleId: string }>(
      await t.app.request(
        `/api/v1/tutorials/${id}/assign`,
        jsonRequest({ userId: "leah", dueOn: day(5) }),
      ),
    );
    expect(placed.placedIn).toBe("roadmap");
    as("leah", "member");
    const after = MyRoadmapSchema.parse(await get("/me/roadmap"));
    expect(
      after.stages.flatMap((stage) => stage.modules).some((entry) => entry.id === placed.moduleId),
    ).toBe(true);
    expect(
      t.container.db
        .select()
        .from(platformRecords)
        .where(eq(platformRecords.kind, "learning_progress"))
        .all().length,
    ).toBeGreaterThan(0);
  });
});
