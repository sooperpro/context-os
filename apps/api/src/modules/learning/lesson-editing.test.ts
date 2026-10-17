import { TemplateDetailSchema, TutorialDetailSchema, TutorialListSchema } from "@contextos/shared";
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
import { createPlatformStore } from "../platform/store.js";
import { PROGRESS } from "./content.js";

/*
 * Editing a published module's lessons from its template (N-18 follow-up): each module says where
 * its lessons stand and whether the viewer may open them, the Tutorials page knows which templates
 * use each tutorial, and a template can publish its modules' waiting lesson updates with it.
 */
describe("Lessons from a template: states, who may edit, usage and publishing updates", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const member = (id: string, role: Actor["role"]) => {
    t.container.db
      .insert(users)
      .values({ id, name: `${id} Doe` })
      .onConflictDoNothing()
      .run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: id, role, organization: {} })
      .onConflictDoNothing()
      .run();
  };
  const as = (id: string, role: Actor["role"]) =>
    Object.assign(t.container.devActor, { id, name: `${id} Doe`, role });

  /** HR generates "Account executive · Sales" and publishes it with its two draft modules. */
  const published = async () => {
    t = createTestApp({ gemini: createFakeGemini(), starterTemplates: false });
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();
    t.container.db.update(sourceObjects).set({ visibility: "workspace" }).run();
    member("hr1", "hr");
    member("mgr", "manager");
    member("emp", "member");
    as("hr1", "hr");
    const started = await t.app.request(
      "/api/v1/roadmaps/generate",
      jsonRequest({ jobTitle: "Account executive", team: "Sales" }),
    );
    const { id } = (await started.json()) as { id: string };
    await t.drain();
    const template = await read(id);
    const stages = template.stages.map((stage) => ({
      id: stage.id,
      moduleIds: stage.modules.map((module) => module.id),
    }));
    const publish = (body: object = {}) =>
      t.app.request(
        `/api/v1/people-ops/templates/${id}/publish`,
        jsonRequest({ stages, note: "", ...body }),
      );
    expect((await publish({ publishModules: true })).status).toBe(200);
    const tutorialIds = template.stages.flatMap((stage) =>
      stage.modules.map((module) => module.tutorialId!),
    );
    return { id, template, tutorialIds, publish };
  };
  const read = async (id: string) =>
    TemplateDetailSchema.parse(
      await (await t.app.request(`/api/v1/people-ops/templates/${id}`)).json(),
    );
  const modulesOf = async (id: string) => (await read(id)).stages.flatMap((stage) => stage.modules);
  const tutorials = async () =>
    TutorialListSchema.parse(await (await t.app.request("/api/v1/tutorials")).json()).items;
  const edit = async (tutorialId: string) => {
    const detail = TutorialDetailSchema.parse(
      await (await t.app.request(`/api/v1/tutorials/${tutorialId}`)).json(),
    );
    const content = detail.content!;
    const res = await t.app.request(
      `/api/v1/tutorials/${tutorialId}`,
      jsonRequest(
        {
          content: {
            ...content,
            lessons: content.lessons.map((lesson, index) =>
              index === 0 ? { ...lesson, body: `${lesson.body}\n\nOne more paragraph.` } : lesson,
            ),
          },
        },
        "PATCH",
      ),
    );
    expect(res.status).toBe(200);
  };

  it("says where each module's lessons stand and opens them for People Ops", async () => {
    const { id, tutorialIds } = await published();
    expect(
      (await modulesOf(id)).map((module) => [module.lessonState, module.lessonsEditable]),
    ).toEqual([
      ["published", true],
      ["published", true],
    ]);

    await edit(tutorialIds[0]!);
    expect((await modulesOf(id)).map((module) => module.lessonState)).toEqual([
      "unpublished_edits",
      "published",
    ]);
  });

  it("lets a manager open only the lessons generated for them", async () => {
    const { id, tutorialIds } = await published();
    as("mgr", "manager");
    expect((await modulesOf(id)).map((module) => module.lessonsEditable)).toEqual([false, false]);

    // A module generated for the manager is theirs to edit (and submit for review).
    t.container.db
      .update(platformRecords)
      .set({ ownerId: "mgr" })
      .where(eq(platformRecords.id, tutorialIds[1]!))
      .run();
    expect((await modulesOf(id)).map((module) => module.lessonsEditable)).toEqual([false, true]);
  });

  it("lists which templates use each tutorial, where, and who is part-way through", async () => {
    const { id, template, tutorialIds } = await published();
    createPlatformStore(t.container.db).insert({
      workspaceId: t.container.workspace.id,
      ownerId: "emp",
      kind: PROGRESS,
      parentId: tutorialIds[0]!,
      status: "active",
      data: { tutorialId: tutorialIds[0], lessonsDone: [], completedAt: null },
    });
    const items = await tutorials();
    const first = items.find((tutorial) => tutorial.id === tutorialIds[0]);
    expect(first).toMatchObject({
      state: "published",
      learners: 1,
      inProgress: 1,
      usedIn: [
        {
          templateId: id,
          templateName: "Account executive · Sales",
          published: true,
          stage: template.stages[0]!.name,
          position: 1,
        },
      ],
    });
    expect(items.find((tutorial) => tutorial.id === tutorialIds[1])?.usedIn[0]).toMatchObject({
      stage: template.stages[1]!.name,
      position: 2,
    });
  });

  it("publishes waiting lesson updates with the template only when asked; learners keep their version", async () => {
    const { tutorialIds, publish } = await published();
    const tutorialId = tutorialIds[0]!;
    const versionOf = () =>
      t.container.db.select().from(platformRecords).where(eq(platformRecords.id, tutorialId)).get()!
        .data as { publishedVersion: number; publishedVersionId: string };
    const v1 = versionOf().publishedVersionId;
    const progress = createPlatformStore(t.container.db).insert({
      workspaceId: t.container.workspace.id,
      ownerId: "emp",
      kind: PROGRESS,
      parentId: tutorialId,
      status: "active",
      data: { tutorialId, versionId: v1, lessonsDone: [], completedAt: null },
    });
    await edit(tutorialId);

    expect((await publish()).status).toBe(200);
    expect(versionOf().publishedVersion).toBe(1);

    expect((await publish({ publishLessonUpdates: true })).status).toBe(200);
    expect(versionOf().publishedVersion).toBe(2);
    expect((await tutorials()).find((tutorial) => tutorial.id === tutorialId)?.state).toBe(
      "published",
    );
    // Part-way through version 1, they finish version 1.
    expect(
      t.container.db.select().from(platformRecords).where(eq(platformRecords.id, progress.id)).get()
        ?.data.versionId,
    ).toBe(v1);
  });

  it("publishes a template's lesson updates on their own, for People Ops only", async () => {
    const { id, tutorialIds } = await published();
    const publishLessons = () =>
      t.app.request(`/api/v1/people-ops/templates/${id}/publish-lessons`, { method: "POST" });
    expect((await publishLessons()).status).toBe(409);
    await edit(tutorialIds[1]!);

    as("mgr", "manager");
    expect((await publishLessons()).status).toBe(403);
    as("hr1", "hr");
    const res = await publishLessons();
    expect(res.status).toBe(200);
    const detail = TemplateDetailSchema.parse(await res.json());
    // The template keeps its version; the module's lessons are at version 2.
    expect(detail.publishedVersion).toBe("v1");
    expect(detail.stages.flatMap((stage) => stage.modules).map((m) => m.lessonState)).toEqual([
      "published",
      "published",
    ]);
    expect(
      (
        t.container.db
          .select()
          .from(platformRecords)
          .where(eq(platformRecords.id, tutorialIds[1]!))
          .get()!.data as { publishedVersion: number }
      ).publishedVersion,
    ).toBe(2);
  });
});
