import { OnboardingRecordSchema, TemplateDetailSchema } from "@contextos/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { and } from "drizzle-orm";
import {
  auditLog,
  departments,
  memberships,
  platformRecords,
  sourceObjects,
  teams,
  users,
} from "../../db/schema.js";
import {
  addSource,
  createFakeGemini,
  createProject,
  createTestApp,
  jsonRequest,
  type TestApp,
} from "../../test/helpers.js";
import type { Actor } from "../../types.js";

const OTHER_DEPARTMENT = "44444444-4444-4444-8444-444444444444";

describe("Roadmap generation: a template drafted from the Hub, reviewed by People Ops", () => {
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
  const generate = (body: object) => t.app.request("/api/v1/roadmaps/generate", jsonRequest(body));

  it("starts a workspace with no generic templates", async () => {
    t = createTestApp({ starterTemplates: false });
    const list = (await (await t.app.request("/api/v1/people-ops/templates")).json()) as {
      items: unknown[];
    };
    expect(list.items).toEqual([]);
  });

  it("plans stages, probation and modules, and can't be published until each module is", async () => {
    const gemini = createFakeGemini();
    t = createTestApp({ gemini });
    const owner = { ...t.container.devActor };
    expect((await generate({ jobTitle: "Account executive" })).status).toBe(400);
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();
    t.container.db.update(sourceObjects).set({ visibility: "workspace" }).run();

    member("emp", "member");
    as("emp", "member");
    expect((await generate({ jobTitle: "Account executive" })).status).toBe(403);
    member("hr1", "hr");
    as("hr1", "hr");
    const started = await generate({ jobTitle: "Account executive", team: "Sales" });
    expect(started.status).toBe(202);
    const { id } = (await started.json()) as { id: string };
    await t.drain();

    const read = async () =>
      TemplateDetailSchema.parse(
        await (await t.app.request(`/api/v1/people-ops/templates/${id}`)).json(),
      );
    const template = await read();
    expect(template).toMatchObject({
      name: "Account executive · Sales",
      status: "draft",
      roles: ["Account executive"],
      weeks: 4,
      probationDays: 180,
      checkins: [{ title: "2-week check-in", day: 14 }],
      generation: { state: "done", error: null },
      generated: { gaps: ["Pricing and discounts"] },
    });
    expect(template.stages.map((stage) => stage.name)).toEqual(["Induction", "On the job"]);
    const modules = template.stages.flatMap((stage) => stage.modules);
    expect(modules.map((module) => module.lessons)).toEqual(["draft", "draft"]);
    expect(template.generated?.reasons[modules[0]!.id]).toBe(
      "Every sales conversation touches invoices.",
    );
    const prompt = gemini.calls.find((call) => call.purpose === "roadmap_plan")?.prompt ?? "";
    expect(prompt).toContain("Plan the onboarding roadmap for a new Account executive in Sales");

    const publish = () =>
      t.app.request(
        `/api/v1/people-ops/templates/${id}/publish`,
        jsonRequest({
          stages: template.stages.map((stage) => ({
            id: stage.id,
            moduleIds: stage.modules.map((module) => module.id),
          })),
          note: "",
        }),
      );
    const refused = await publish();
    expect(refused.status).toBe(409);
    expect(await refused.text()).toContain("2 modules are still drafts");
    for (const module of modules)
      expect(
        (
          await t.app.request(
            `/api/v1/tutorials/${module.tutorialId}/publish`,
            jsonRequest({ updateLearners: false }),
          )
        ).status,
      ).toBe(200);
    expect((await publish()).status).toBe(200);

    const run = t.container.db
      .select()
      .from(platformRecords)
      .where(eq(platformRecords.kind, "generation_run"))
      .all()
      .find((row) => row.data.kind === "template");
    expect(run).toMatchObject({ status: "done", data: { targetId: id, inputTokens: 1000 } });
    Object.assign(t.container.devActor, owner);
  });

  it("publishes a template and all its draft modules at once, or none if one isn't ready", async () => {
    t = createTestApp({ gemini: createFakeGemini(), starterTemplates: false });
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();
    t.container.db.update(sourceObjects).set({ visibility: "workspace" }).run();
    member("hr1", "hr");
    as("hr1", "hr");
    const started = await generate({ jobTitle: "Account executive", team: "Sales" });
    const { id } = (await started.json()) as { id: string };
    await t.drain();
    const read = async () =>
      TemplateDetailSchema.parse(
        await (await t.app.request(`/api/v1/people-ops/templates/${id}`)).json(),
      );
    const template = await read();
    const modules = template.stages.flatMap((stage) => stage.modules);
    expect(modules.map((module) => module.lessons)).toEqual(["draft", "draft"]);
    // Its draft modules don't stop it being edited and saved.
    const saved = await t.app.request(
      `/api/v1/people-ops/templates/${id}/draft`,
      jsonRequest({
        stages: template.stages.map((stage) => ({
          id: stage.id,
          moduleIds: stage.modules.map((module) => module.id),
        })),
        probationDays: 120,
      }),
    );
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ probationDays: 120 });
    const publish = () =>
      t.app.request(
        `/api/v1/people-ops/templates/${id}/publish`,
        jsonRequest({
          stages: template.stages.map((stage) => ({
            id: stage.id,
            moduleIds: stage.modules.map((module) => module.id),
          })),
          note: "",
          publishModules: true,
        }),
      );

    // One module is being redrafted: nothing is published, and it says which.
    const busy = t.container.db
      .select()
      .from(platformRecords)
      .where(eq(platformRecords.id, modules[1]!.tutorialId!))
      .get()!;
    t.container.db
      .update(platformRecords)
      .set({ data: { ...busy.data, generation: { state: "running", error: null, at: "" } } })
      .where(eq(platformRecords.id, busy.id))
      .run();
    const refused = await publish();
    expect(refused.status).toBe(409);
    expect(await refused.text()).toContain("is still being drafted");
    expect((await read()).stages.flatMap((stage) => stage.modules).map((m) => m.lessons)).toEqual([
      "draft",
      "draft",
    ]);

    // Once it's ready, one click publishes both modules and the template.
    t.container.db
      .update(platformRecords)
      .set({ data: busy.data })
      .where(eq(platformRecords.id, busy.id))
      .run();
    const done = await publish();
    expect(done.status).toBe(200);
    const after = await read();
    expect(after).toMatchObject({ status: "published", publishedVersion: "v1" });
    expect(after.stages.flatMap((stage) => stage.modules).map((m) => m.lessons)).toEqual([
      "ready",
      "ready",
    ]);
  });

  it("lets new hires wait for a template draft HR made, and gives it to them once published", async () => {
    t = createTestApp({ gemini: createFakeGemini(), starterTemplates: false });
    const owner = { ...t.container.devActor };
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();
    t.container.db.update(sourceObjects).set({ visibility: "workspace" }).run();
    member("dana", "manager");
    member("hr1", "hr");
    member("admin1", "admin");
    for (const id of ["sam", "sky"]) {
      member(id, "member");
      t.container.db
        .update(users)
        .set({ email: `${id}@example.test` })
        .where(eq(users.id, id))
        .run();
    }
    const notes = (userId: string) =>
      t.container.db
        .select()
        .from(platformRecords)
        .where(and(eq(platformRecords.kind, "notification"), eq(platformRecords.ownerId, userId)))
        .all()
        .map((row) => String(row.data.title));
    const onboard = async (id: string, templateId: string) => {
      const response = await t.app.request(
        "/api/v1/people-ops/onboardings",
        jsonRequest({
          name: `${id} Doe`,
          title: "Sales executive",
          email: `${id}@example.test`,
          team: "Sales",
          startDate: new Date().toISOString().slice(0, 10),
          managerId: "dana",
          buddyId: null,
          templateId,
        }),
      );
      expect(response.status).toBe(201);
      return OnboardingRecordSchema.parse(await response.json());
    };
    const recordOf = async (id: string) =>
      OnboardingRecordSchema.parse(
        await (await t.app.request(`/api/v1/people-ops/onboardings/${id}`)).json(),
      );

    // HR makes the template in Templates, then starts two onboardings on the draft.
    as("hr1", "hr");
    const generated = await generate({ jobTitle: "Sales executive", team: "Sales" });
    const { id: draftId } = (await generated.json()) as { id: string };
    const first = await onboard("sam", draftId);
    expect(first).toMatchObject({
      template: null,
      templateDraft: { id: draftId, name: "Sales executive · Sales", state: "generating" },
    });
    const second = await onboard("sky", draftId);
    expect(second.templateDraft?.id).toBe(draftId);
    await t.drain();
    expect((await recordOf(first.id)).templateDraft).toMatchObject({ state: "draft" });
    expect(notes("hr1")).toContain("Your Sales executive roadmap draft is ready to review");

    // The new hire hears their roadmap is being prepared.
    as("sam", "member");
    const preparing = await t.app.request("/api/v1/me/roadmap");
    expect(preparing.status).toBe(404);
    expect(await preparing.json()).toMatchObject({ error: { details: { preparing: true } } });

    // People Ops publish the modules and the template: both new hires get it.
    as("hr1", "hr");
    const templateId = first.templateDraft!.id;
    const template = TemplateDetailSchema.parse(
      await (await t.app.request(`/api/v1/people-ops/templates/${templateId}`)).json(),
    );
    for (const module of template.stages.flatMap((stage) => stage.modules))
      await t.app.request(
        `/api/v1/tutorials/${module.tutorialId}/publish`,
        jsonRequest({ updateLearners: false }),
      );
    const published = await t.app.request(
      `/api/v1/people-ops/templates/${templateId}/publish`,
      jsonRequest({
        stages: template.stages.map((stage) => ({
          id: stage.id,
          moduleIds: stage.modules.map((module) => module.id),
        })),
        note: "",
      }),
    );
    expect(published.status).toBe(200);
    for (const record of [first, second])
      expect(await recordOf(record.id)).toMatchObject({
        template: { id: templateId },
        templateDraft: null,
      });
    expect(notes("sam")).toContain("Your onboarding roadmap is ready");
    as("sam", "member");
    expect((await t.app.request("/api/v1/me/roadmap")).status).toBe(200);
    Object.assign(t.container.devActor, owner);
  });

  it("sends a manager's generated template and modules to People Ops, who send it back or publish it", async () => {
    t = createTestApp({ gemini: createFakeGemini() });
    const owner = { ...t.container.devActor };
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();
    t.container.db.update(sourceObjects).set({ visibility: "workspace" }).run();
    const ws = t.container.workspace.id;
    t.container.db
      .insert(departments)
      .values({ id: "dep-sales", workspaceId: ws, name: "Sales" })
      .run();
    t.container.db
      .insert(teams)
      .values({ id: "team-sales", workspaceId: ws, departmentId: "dep-sales", name: "Sales" })
      .run();
    member("dana", "manager");
    t.container.db
      .update(memberships)
      .set({ organization: { teamId: "team-sales" } })
      .where(eq(memberships.userId, "dana"))
      .run();
    member("max", "manager");
    member("hr1", "hr");
    member("admin1", "admin");
    const notes = (userId: string) =>
      t.container.db
        .select()
        .from(platformRecords)
        .where(and(eq(platformRecords.kind, "notification"), eq(platformRecords.ownerId, userId)))
        .all()
        .map((row) => String(row.data.title));
    const base = "/api/v1/people-ops/templates";
    const read = async (id: string) =>
      TemplateDetailSchema.parse(await (await t.app.request(`${base}/${id}`)).json());
    const stagesOf = (template: Awaited<ReturnType<typeof read>>) =>
      template.stages.map((stage) => ({
        id: stage.id,
        moduleIds: stage.modules.map((module) => module.id),
      }));

    // A manager drafts for their own team only, and not at all before they have one.
    member("noteam", "manager");
    as("noteam", "manager");
    const unplaced = await generate({ jobTitle: "Account executive" });
    expect(unplaced.status).toBe(403);
    expect(await unplaced.text()).toContain("Ask an admin to set your team first");
    as("dana", "manager");
    expect((await generate({ jobTitle: "Account executive", team: "Support" })).status).toBe(403);
    t.container.db
      .insert(departments)
      .values({ id: OTHER_DEPARTMENT, workspaceId: ws, name: "Partnerships" })
      .run();
    expect(
      (await generate({ jobTitle: "Account executive", departmentId: OTHER_DEPARTMENT })).status,
    ).toBe(403);
    const started = await generate({ jobTitle: "Account executive" });
    expect(started.status).toBe(202);
    const { id } = (await started.json()) as { id: string };
    await t.drain();
    const draft = await read(id);
    expect(draft).toMatchObject({
      name: "Account executive · Sales",
      createdBy: { id: "dana" },
      review: null,
    });
    const modules = draft.stages.flatMap((stage) => stage.modules);
    expect(modules).toHaveLength(2);

    // They can't publish the template or its modules; they submit them.
    expect(
      (
        await t.app.request(
          `${base}/${id}/publish`,
          jsonRequest({ stages: stagesOf(draft), note: "" }),
        )
      ).status,
    ).toBe(403);
    for (const module of modules) {
      const tutorial = `/api/v1/tutorials/${module.tutorialId}`;
      expect(
        (await t.app.request(`${tutorial}/publish`, jsonRequest({ updateLearners: false }))).status,
      ).toBe(403);
      const submitted = await t.app.request(`${tutorial}/submit`, { method: "POST" });
      expect(submitted.status).toBe(200);
      expect(await submitted.json()).toMatchObject({ review: { state: "in_review" } });
    }
    const submit = () =>
      t.app.request(
        `${base}/${id}/submit`,
        jsonRequest({ stages: stagesOf(draft), note: "Ready for a look" }),
      );
    expect((await submit()).status).toBe(200);
    expect((await read(id)).review).toMatchObject({ state: "in_review", by: { id: "dana" } });

    // Another manager doesn't see it.
    as("max", "manager");
    expect((await t.app.request(`${base}/${id}`)).status).toBe(404);
    const theirs = (await (await t.app.request(base)).json()) as { items: Array<{ id: string }> };
    expect(theirs.items.map((item) => item.id)).not.toContain(id);
    expect((await t.app.request(`${base}/${id}/draft`, jsonRequest({ stages: [] }))).status).toBe(
      404,
    );

    // HR sees it waiting, and sends it back with a note.
    expect(notes("hr1")).toContain(
      "dana Doe submitted the template “Account executive · Sales” for review",
    );
    expect(notes("admin1")).toContain(
      "dana Doe submitted the template “Account executive · Sales” for review",
    );
    as("hr1", "hr");
    const listed = (await (await t.app.request(base)).json()) as {
      items: Array<{ id: string; review: { state: string } | null }>;
    };
    expect(listed.items.find((item) => item.id === id)?.review).toMatchObject({
      state: "in_review",
    });
    expect((await t.app.request(`${base}/${id}/send-back`, jsonRequest({ note: "" }))).status).toBe(
      400,
    );
    const sentBack = await t.app.request(
      `${base}/${id}/send-back`,
      jsonRequest({ note: "Add the security policy module" }),
    );
    expect(sentBack.status).toBe(200);
    expect(await sentBack.json()).toMatchObject({
      review: {
        state: "changes_requested",
        note: "Add the security policy module",
        by: { id: "hr1" },
      },
    });
    expect(notes("dana")).toContain("hr1 Doe sent back your template “Account executive · Sales”");

    // The manager fixes it and resubmits; HR publishes the modules, then the template.
    as("dana", "manager");
    expect((await submit()).status).toBe(200);
    as("hr1", "hr");
    for (const module of modules)
      expect(
        (
          await t.app.request(
            `/api/v1/tutorials/${module.tutorialId}/publish`,
            jsonRequest({ updateLearners: false }),
          )
        ).status,
      ).toBe(200);
    const published = await t.app.request(
      `${base}/${id}/publish`,
      jsonRequest({ stages: stagesOf(draft), note: "Reviewed" }),
    );
    expect(published.status).toBe(200);
    expect(await published.json()).toMatchObject({ status: "published", review: null });
    expect(notes("dana")).toContain("hr1 Doe published your template “Account executive · Sales”");
    const audited = (action: string) =>
      t.container.db.select().from(auditLog).where(eq(auditLog.action, action)).all().length;
    expect(audited("template.submit")).toBe(2);
    expect(audited("template.send_back")).toBe(1);
    expect(audited("tutorial.submit")).toBe(2);

    // An admin publishes directly: no review needed, and submitting is refused.
    as("admin1", "admin");
    const theirsStarted = await generate({ jobTitle: "Support specialist", team: "Support" });
    expect(theirsStarted.status).toBe(202);
    const adminId = ((await theirsStarted.json()) as { id: string }).id;
    await t.drain();
    const adminDraft = await read(adminId);
    expect(
      (
        await t.app.request(
          `${base}/${adminId}/submit`,
          jsonRequest({ stages: stagesOf(adminDraft), note: "" }),
        )
      ).status,
    ).toBe(400);
    for (const module of adminDraft.stages.flatMap((stage) => stage.modules))
      expect(
        (
          await t.app.request(
            `/api/v1/tutorials/${module.tutorialId}/publish`,
            jsonRequest({ updateLearners: false }),
          )
        ).status,
      ).toBe(200);
    expect(
      (
        await t.app.request(
          `${base}/${adminId}/publish`,
          jsonRequest({ stages: stagesOf(adminDraft), note: "" }),
        )
      ).status,
    ).toBe(200);
    Object.assign(t.container.devActor, owner);
  });
});
