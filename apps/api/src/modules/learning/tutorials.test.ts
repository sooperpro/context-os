import {
  CheckResultSchema,
  KnowledgeCheckSchema,
  LessonSchema,
  MilestoneListSchema,
  ModuleDetailSchema,
  RevisitListSchema,
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
import {
  assignments,
  memberships,
  platformRecords,
  sourceObjects,
  users,
} from "../../db/schema.js";
import {
  addSource,
  createFakeGemini,
  createProject,
  createTestApp,
  jsonRequest,
  SAMPLE_TUTORIAL,
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
    expect(detail).toMatchObject({ status: "draft", lessonCount: 2, questionCount: 3 });
    expect(detail.content?.lessons[0]).toMatchObject({
      id: "l1",
      title: "Why we changed",
      basedOn: [expect.any(String) as string],
    });
    expect(detail.content?.lessons[0]!.body).toContain("## Why we changed");
    expect(detail.content?.check?.passMark).toBe(3);
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

  it("logs each draft's tokens and stops at the workspace's daily AI limit", async () => {
    t = createTestApp({ env: { AI_DAILY_MODULE_LIMIT: "2" } });
    admin = owner();
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();
    const draft = () =>
      t.app.request(
        "/api/v1/tutorials",
        jsonRequest({ projectId: project.id, audience: "New engineers" }),
      );
    const first = await json<{ id: string }>(await draft());
    await t.drain();
    const run = t.container.db
      .select()
      .from(platformRecords)
      .where(eq(platformRecords.kind, "generation_run"))
      .get();
    expect(run?.status).toBe("done");
    expect(run?.data).toMatchObject({
      kind: "module",
      targetId: first.id,
      model: "fake-model",
      inputTokens: 1000,
      outputTokens: 200,
    });

    expect(
      (await t.app.request(`/api/v1/tutorials/${first.id}/regenerate`, jsonRequest({}))).status,
    ).toBe(202);
    await t.drain();
    const refused = await draft();
    expect(refused.status).toBe(429);
    expect(await refused.text()).toContain("Daily AI limit reached");

    // The Owner can lower the limit, but nobody else can change it.
    const settings = (body: object) =>
      t.app.request("/api/v1/workspaces/current/settings", {
        ...jsonRequest(body),
        method: "PATCH",
      });
    as("limits-admin", "admin");
    member("limits-admin", "admin");
    const denied = await settings({ version: 1, policies: { aiDailyModules: 1 } });
    expect(denied.status).toBe(403);
    expect(await denied.text()).toContain("Only the workspace owner");
  });

  it("never asks the model with too little knowledge, and drops lessons that cite nothing", async () => {
    const lesson = (title: string, sources: number[]) => ({
      title,
      minutes: 5,
      body: `## ${title}\n\nText.`,
      sources,
    });
    const gemini = createFakeGemini({
      tutorial: {
        ...SAMPLE_TUTORIAL,
        lessons: [
          lesson("One", [1]),
          lesson("Two", [1]),
          lesson("Three", [1]),
          lesson("Uncited", [9]),
        ],
      },
    });
    t = createTestApp({ gemini });
    admin = owner();
    const empty = await createProject(t.app);
    const thin = await json<{ id: string }>(
      await t.app.request(
        "/api/v1/tutorials",
        jsonRequest({ projectId: empty.id, audience: "New engineers", focus: "pricing" }),
      ),
    );
    await t.drain();
    const refused = TutorialDetailSchema.parse(await get(`/tutorials/${thin.id}`));
    expect(refused.error).toContain('Not enough company knowledge for "pricing"');
    expect(gemini.calls.filter((call) => call.purpose === "tutorial")).toHaveLength(0);
    expect(
      t.container.db
        .select()
        .from(platformRecords)
        .where(eq(platformRecords.kind, "generation_run"))
        .get()?.status,
    ).toBe("skipped");

    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();
    const drafted = await json<{ id: string }>(
      await t.app.request(
        "/api/v1/tutorials",
        jsonRequest({ projectId: project.id, audience: "New engineers" }),
      ),
    );
    await t.drain();
    const detail = TutorialDetailSchema.parse(await get(`/tutorials/${drafted.id}`));
    expect(detail.content?.lessons.map((entry) => entry.title)).toEqual(["One", "Two", "Three"]);
  });

  it("drafts company-wide lessons for a built-in module from every project", async () => {
    const gemini = createFakeGemini();
    t = createTestApp({ gemini });
    admin = owner();
    const atlas = await createProject(t.app, "Atlas");
    const nova = await createProject(t.app, "Nova");
    await addSource(t.app, atlas.id);
    await addSource(t.app, nova.id);
    await t.drain();
    const templates = await get<{ items: Array<{ id: string }> }>("/people-ops/templates");
    const lessonsOf = async () => {
      const template = await get<{
        stages: Array<{ modules: Array<{ id: string; lessons?: string; tutorialId?: string }> }>;
      }>(`/people-ops/templates/${templates.items[0]!.id}`);
      return template.stages
        .flatMap((stage) => stage.modules)
        .find((m) => m.id === "mod-customers");
    };
    expect(await lessonsOf()).toMatchObject({ lessons: "none", tutorialId: null });

    const created = await t.app.request(
      "/api/v1/tutorials",
      jsonRequest({ audience: "New hires", coversModule: "mod-customers" }),
    );
    expect(created.status).toBe(202);
    const { id } = await json<{ id: string }>(created);
    await t.drain();
    const detail = TutorialDetailSchema.parse(await get(`/tutorials/${id}`));
    expect(detail.project).toBeNull();
    // It read both projects, and keeps only the source its lessons and questions cite.
    expect(detail.sources.map((source) => source.id)).toEqual([
      detail.content!.lessons[0]!.sourceIds[0],
    ]);
    const prompt = gemini.calls.find((call) => call.purpose === "tutorial")?.prompt ?? "";
    expect(prompt).toContain("the company as a whole");
    expect(await lessonsOf()).toMatchObject({ lessons: "draft", tutorialId: id });

    await t.app.request(`/api/v1/tutorials/${id}/publish`, jsonRequest({ updateLearners: false }));
    expect(await lessonsOf()).toMatchObject({ lessons: "ready", tutorialId: id });

    // A path curator of one project can't draft company-wide.
    member("curator1", "member");
    t.container.db
      .insert(assignments)
      .values({
        id: "curator1-atlas",
        workspaceId: t.container.workspace.id,
        userId: "curator1",
        type: "path_curator",
        scopeType: "project",
        scopeId: atlas.id,
      })
      .run();
    as("curator1", "member");
    expect(
      (await t.app.request("/api/v1/tutorials", jsonRequest({ audience: "New hires" }))).status,
    ).toBe(403);
  });

  it("gives HR their own My learning: tutorials to add, take and complete", async () => {
    t = createTestApp();
    admin = owner();
    const { id } = await publishedTutorial();
    const key = `tutorial-${id}`;
    member("hana", "hr");
    as("hana", "hr");

    // Nothing assigned yet; the published tutorial is on offer.
    const first = MyLearningSchema.parse(await get("/me/learning"));
    expect(first.assigned).toEqual([]);
    expect(first.suggested).toEqual([expect.objectContaining({ id: key })]);

    // They add it themselves, and it moves to "assigned to you".
    expect(
      (await t.app.request(`/api/v1/me/learning/${key}/add`, jsonRequest({}))).status,
    ).toBeLessThan(300);
    const mine = MyLearningSchema.parse(await get("/me/learning"));
    expect(mine.suggested).toEqual([]);
    expect(mine.assigned).toEqual([
      expect.objectContaining({ id: key, reason: "Added by you", lessonCount: 3 }),
    ]);

    // The lessons open for HR like anyone else, and finishing one is recorded.
    const module = ModuleDetailSchema.parse(await get(`/me/modules/${key}`));
    expect(module.lessons.map((lesson) => lesson.type)).toEqual(["article", "article", "check"]);
    const done = await t.app.request(`/api/v1/me/lessons/${key}~l1/complete`, jsonRequest({}));
    expect(done.status).toBe(200);
    expect(MyLearningSchema.parse(await get("/me/learning")).assigned[0]?.lessonsDone).toBe(1);
  });

  it("lets a path curator open Tutorial Studio before their first tutorial", async () => {
    t = createTestApp();
    admin = owner();
    const project = await createProject(t.app);
    member("pc", "member");
    member("plain", "member");
    t.container.db
      .insert(assignments)
      .values({
        id: "curates",
        workspaceId: t.container.workspace.id,
        userId: "pc",
        type: "path_curator",
        scopeType: "project",
        scopeId: project.id,
      })
      .run();
    as("pc", "member");
    expect(await get("/tutorials")).toEqual({ items: [] });
    as("plain", "member");
    expect((await t.app.request("/api/v1/tutorials")).status).toBe(403);
  });

  it("asks admins for access to the sources behind restricted lessons, without naming them", async () => {
    t = createTestApp();
    admin = owner();
    const { id } = await publishedTutorial();
    const key = `tutorial-${id}`;
    member("emp", "member");
    await t.app.request(
      `/api/v1/tutorials/${id}/assign`,
      jsonRequest({ userId: "emp", dueOn: day(7) }),
    );
    t.container.db.update(sourceObjects).set({ visibility: "restricted" }).run();
    as("emp", "member");
    const module = ModuleDetailSchema.parse(await get(`/me/modules/${key}`));
    expect(module.lessons.filter((lesson) => lesson.restricted).length).toBeGreaterThan(0);
    const ask = () =>
      t.app.request(
        "/api/v1/me/learning-requests",
        jsonRequest({
          type: "access",
          moduleId: key,
          lessonId: null,
          changeKind: null,
          message: "I'd like access.",
        }),
      );
    const sent = await ask();
    expect(sent.status).toBe(201);
    const title = t.container.db.select().from(sourceObjects).get()!.title;
    expect(JSON.stringify(await json(sent))).not.toContain(title);
    // The admins get the request, with the sources named.
    const notice = t.container.db
      .select()
      .from(platformRecords)
      .all()
      .find((row) => row.kind === "notification" && row.data.type === "learning.access_request");
    expect(notice?.ownerId).toBe(admin.id);
    expect(String(notice?.data.body)).toContain(title);
    // Nothing to ask for once they can open it all.
    t.container.db.update(sourceObjects).set({ visibility: "workspace" }).run();
    expect((await ask()).status).toBe(409);
  });

  it("pauses Context Bot on the server while a knowledge check is open", async () => {
    t = createTestApp();
    admin = owner();
    const { project, id } = await publishedTutorial();
    const key = `tutorial-${id}`;
    member("emp", "member");
    await t.app.request(
      `/api/v1/tutorials/${id}/assign`,
      jsonRequest({ userId: "emp", dueOn: day(7) }),
    );
    as("emp", "member");
    const ask = () =>
      t.app.request(
        `/api/v1/projects/${project.id}/ask`,
        jsonRequest({ question: "Why did billing change?" }),
      );

    // Opening the check pauses every way of asking, not just the panel in the app.
    const check = KnowledgeCheckSchema.parse(await get(`/me/checks/${key}~check`));
    const paused = await ask();
    expect(paused.status).toBe(409);
    expect(await json<{ error: { message: string } }>(paused)).toMatchObject({
      error: {
        message: expect.stringContaining("paused while your knowledge check is open") as unknown,
      },
    });
    const thread = await json<{ id: string }>(
      await t.app.request("/api/v1/ask/threads", jsonRequest({ projectId: project.id })),
    );
    expect(
      (
        await t.app.request(
          `/api/v1/ask/threads/${thread.id}/messages`,
          jsonRequest({ question: "Why did billing change?" }),
        )
      ).status,
    ).toBe(409);

    // Submitting ends the pause.
    await t.app.request(
      `/api/v1/me/checks/${key}~check/attempts`,
      jsonRequest({
        answers: check.questions.map((question) => ({ questionId: question.id, optionId: "a" })),
      }),
    );
    expect((await ask()).status).toBe(201);

    // With the workspace's "pause during checks" turned off, opening a check pauses nothing.
    Object.assign(t.container.devActor, admin);
    expect(
      (
        await t.app.request(
          "/api/v1/admin/ai-settings",
          jsonRequest({ rules: { pause_during_checks: false } }, "PATCH"),
        )
      ).status,
    ).toBe(200);
    as("emp", "member");
    await get(`/me/checks/${key}~check`);
    expect((await ask()).status).toBe(201);
  });

  it("keeps Context Bot free after a passed check, even when the results page fetches it again", async () => {
    t = createTestApp();
    admin = owner();
    const { project, id } = await publishedTutorial();
    const key = `tutorial-${id}`;
    member("emp", "member");
    await t.app.request(
      `/api/v1/tutorials/${id}/assign`,
      jsonRequest({ userId: "emp", dueOn: day(7) }),
    );
    as("emp", "member");
    const ask = () =>
      t.app.request(
        `/api/v1/projects/${project.id}/ask`,
        jsonRequest({ question: "Why did billing change?" }),
      );
    const check = KnowledgeCheckSchema.parse(await get(`/me/checks/${key}~check`));
    expect((await ask()).status).toBe(409);
    const correct = new Map(
      SAMPLE_TUTORIAL.questions.map((question) => [
        question.prompt,
        "abcdef"[question.correctIndex]!,
      ]),
    );
    const result = CheckResultSchema.parse(
      await json(
        await t.app.request(
          `/api/v1/me/checks/${key}~check/attempts`,
          jsonRequest({
            answers: check.questions.map((question) => ({
              questionId: question.id,
              optionId: correct.get(question.prompt)!,
            })),
          }),
        ),
      ),
    );
    expect(result.passed).toBe(true);
    // The results page reloads the check after a pass: that is not a new attempt.
    await get(`/me/checks/${key}~check`);
    expect((await ask()).status).toBe(201);
  });

  it("decides access by the sources a tutorial cites, not every source it read", async () => {
    t = createTestApp();
    admin = owner();
    const atlas = await createProject(t.app, "Atlas");
    const nova = await createProject(t.app, "Nova");
    await addSource(t.app, atlas.id);
    await addSource(t.app, nova.id);
    await t.drain();
    t.container.db.update(sourceObjects).set({ visibility: "workspace" }).run();
    const { id } = await json<{ id: string }>(
      await t.app.request(
        "/api/v1/tutorials",
        jsonRequest({ audience: "New hires", coversModule: "mod-customers" }),
      ),
    );
    await t.drain();
    const draft = TutorialDetailSchema.parse(await get(`/tutorials/${id}`));
    const cited = draft.content!.lessons[0]!.sourceIds[0]!;
    expect(draft.sources.map((source) => source.id)).toEqual([cited]);
    const all = t.container.db.select().from(sourceObjects).all();
    const uncited = all.find((source) => source.id !== cited)!;

    // Drafts written before kept every source they read: they're read the same way.
    const row = t.container.db
      .select()
      .from(platformRecords)
      .where(eq(platformRecords.id, id))
      .get()!;
    const everything = all.map((source) => ({
      id: source.id,
      title: source.title,
      hash: source.contentHash,
    }));
    t.container.db
      .update(platformRecords)
      .set({ data: { ...row.data, sources: everything } })
      .where(eq(platformRecords.id, id))
      .run();

    // An access policy keeps the uncited source from an admin: they still edit and publish it.
    t.container.db
      .update(sourceObjects)
      .set({ visibility: "restricted" })
      .where(eq(sourceObjects.id, uncited.id))
      .run();
    member("adm", "admin");
    as("adm", "admin");
    const seen = TutorialDetailSchema.parse(await get(`/tutorials/${id}`));
    expect(seen).toMatchObject({ restrictedForYou: false, staleSources: 0 });
    expect(seen.content).not.toBeNull();
    expect(
      (
        await t.app.request(
          `/api/v1/tutorials/${id}`,
          jsonRequest({ content: seen.content }, "PATCH"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await t.app.request(
          `/api/v1/tutorials/${id}/publish`,
          jsonRequest({ updateLearners: false }),
        )
      ).status,
    ).toBe(200);

    // A learner who can't open the uncited source reads every lesson and the check.
    const version = t.container.db
      .select()
      .from(platformRecords)
      .where(eq(platformRecords.kind, "tutorial_version"))
      .get()!;
    t.container.db
      .update(platformRecords)
      .set({ data: { ...version.data, sources: everything } })
      .where(eq(platformRecords.id, version.id))
      .run();
    member("emp", "member");
    asAdmin();
    await t.app.request(
      `/api/v1/tutorials/${id}/assign`,
      jsonRequest({ userId: "emp", dueOn: day(7) }),
    );
    as("emp", "member");
    const module = ModuleDetailSchema.parse(await get(`/me/modules/tutorial-${id}`));
    expect(module.lessons.some((lesson) => lesson.restricted)).toBe(false);
    expect(module.lessons.map((lesson) => lesson.type)).toContain("check");
  });

  it("treats a deleted source as removed: nothing locks, and curators can regenerate", async () => {
    t = createTestApp();
    admin = owner();
    const { project, id } = await publishedTutorial();
    member("emp", "member");
    await t.app.request(
      `/api/v1/tutorials/${id}/assign`,
      jsonRequest({ userId: "emp", dueOn: day(7) }),
    );
    const source = t.container.db.select().from(sourceObjects).get()!;
    expect(
      (
        await t.app.request(`/api/v1/projects/${project.id}/sources/${source.id}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(204);

    const detail = TutorialDetailSchema.parse(await get(`/tutorials/${id}`));
    expect(detail).toMatchObject({ restrictedForYou: false, staleSources: 1 });
    expect(detail.content).not.toBeNull();
    expect(detail.sources).toEqual([expect.objectContaining({ id: source.id, state: "removed" })]);
    expect(
      (await t.app.request(`/api/v1/tutorials/${id}/regenerate`, jsonRequest({}))).status,
    ).toBe(202);

    // Learners keep the published version, unlocked.
    as("emp", "member");
    const module = ModuleDetailSchema.parse(await get(`/me/modules/tutorial-${id}`));
    expect(module.lessons.some((lesson) => lesson.restricted)).toBe(false);
    const lesson = LessonSchema.parse(await get(`/me/lessons/tutorial-${id}~l1`));
    expect(lesson.blocks[0]).toMatchObject({
      text: expect.stringContaining("too slow") as unknown,
    });
  });

  it("never shows learners the draft's [S#] citation markers", async () => {
    const marked = {
      ...SAMPLE_TUTORIAL,
      summary: "Billing moves to **Kafka** [S1].",
      lessons: SAMPLE_TUTORIAL.lessons.map((lesson) => ({
        ...lesson,
        body: `${lesson.body}\n\nInvoices update in minutes [S1, S2].`,
      })),
    };
    t = createTestApp({ gemini: createFakeGemini({ tutorial: marked }) });
    admin = owner();
    const { id } = await publishedTutorial();
    const key = `tutorial-${id}`;
    // New drafts drop them; a version published before kept them (one saved escaped).
    const draft = TutorialDetailSchema.parse(await get(`/tutorials/${id}`));
    expect(JSON.stringify(draft.content)).not.toMatch(/\[S\d/);
    const version = t.container.db
      .select()
      .from(platformRecords)
      .where(eq(platformRecords.kind, "tutorial_version"))
      .get()!;
    const content = version.data.content as NonNullable<TutorialDetail["content"]>;
    t.container.db
      .update(platformRecords)
      .set({
        data: {
          ...version.data,
          content: {
            ...content,
            summary: "Billing moves to **Kafka** [S1].",
            lessons: content.lessons.map((lesson, index) => ({
              ...lesson,
              body: `${lesson.body}\n\nInvoices update in minutes ${index ? "\\[S12\\]" : "[S3][S4]"}.`,
            })),
          },
        },
      })
      .where(eq(platformRecords.id, version.id))
      .run();
    member("emp", "member");
    await t.app.request(
      `/api/v1/tutorials/${id}/assign`,
      jsonRequest({ userId: "emp", dueOn: day(7) }),
    );
    as("emp", "member");
    const module = ModuleDetailSchema.parse(await get(`/me/modules/${key}`));
    expect(module.objective).toContain("Billing moves to Kafka");
    expect(module.objective).not.toMatch(/S\d/);
    for (const part of ["l1", "l2"]) {
      const lesson = LessonSchema.parse(await get(`/me/lessons/${key}~${part}`));
      const text = lesson.blocks.map((block) => ("text" in block ? block.text : "")).join("");
      expect(text).toContain("Invoices update in minutes.");
      expect(text).not.toMatch(/S\d/);
    }
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
    const failed = CheckResultSchema.parse(await json(await attempt(["b", "a", "a"])));
    expect(failed).toMatchObject({ passed: false, score: 0, progress: null });
    const passed = CheckResultSchema.parse(await json(await attempt(["a", "b", "c"])));
    expect(passed).toMatchObject({ passed: true, score: 3 });
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

  it("marks lessons and modules to revisit later without changing progress, and points to the next module", async () => {
    t = createTestApp();
    admin = owner();
    const { id } = await publishedTutorial();
    member("emp", "member");
    await t.app.request(
      `/api/v1/tutorials/${id}/assign`,
      jsonRequest({ userId: "emp", dueOn: day(7) }),
    );
    as("emp", "member");
    const key = `tutorial-${id}`;
    const put = (target: string) =>
      t.app.request(`/api/v1/me/revisit/${encodeURIComponent(target)}`, { method: "PUT" });

    expect((await put(`${key}~l1`)).status).toBe(200);
    expect((await put(key)).status).toBe(200);
    expect((await put(`${key}~missing`)).status).toBe(404);
    expect(RevisitListSchema.parse(await get("/me/revisit")).items).toEqual([
      expect.objectContaining({ id: key, kind: "module" }),
      expect.objectContaining({ id: `${key}~l1`, kind: "lesson" }),
    ]);
    const module = ModuleDetailSchema.parse(await get(`/me/modules/${key}`));
    expect(module.revisit).toBe(true);
    expect(
      module.lessons.filter((lesson) => lesson.type !== "check").map((lesson) => lesson.revisit),
    ).toEqual([true, false]);
    expect(LessonSchema.parse(await get(`/me/lessons/${key}~l1`)).revisit).toBe(true);
    // A mark isn't progress: nothing is done or started.
    expect(module.progress).toBe(0);
    expect(module.status).not.toBe("done");
    // The tutorial's author is listed as its owner; nothing is left after this one.
    expect(module.people.map((entry) => entry.role)).toEqual(["Module owner"]);
    expect(module.nextModule).toBeNull();

    await t.app.request(`/api/v1/me/revisit/${encodeURIComponent(`${key}~l1`)}`, {
      method: "DELETE",
    });
    expect(RevisitListSchema.parse(await get("/me/revisit")).items).toEqual([
      expect.objectContaining({ id: key, kind: "module" }),
    ]);
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
