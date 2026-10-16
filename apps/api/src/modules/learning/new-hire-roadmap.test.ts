import { MyRoadmapSchema } from "@contextos/shared";
import { afterEach, describe, expect, it } from "vitest";
import { memberships, users } from "../../db/schema.js";
import { createTestApp, type TestApp } from "../../test/helpers.js";

/** A new hire invited by an admin (marked "new hire", with a start date) gets a roadmap at once. */
describe("New hire roadmap", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const newHire = (id: string, jobTitle: string) => {
    t.container.db
      .insert(users)
      .values({ id, name: id, email: `${id}@example.test` })
      .run();
    t.container.db
      .insert(memberships)
      .values({
        workspaceId: t.container.workspace.id,
        userId: id,
        role: "member",
        managerId: t.container.devActor.id,
        organization: {
          isNewHire: true,
          startDate: new Date().toISOString().slice(0, 10),
          jobTitle,
        },
      })
      .run();
    Object.assign(t.container.devActor, { id, name: id, role: "member" });
  };

  it("starts the roadmap from the template their job title points at", async () => {
    t = createTestApp();
    newHire("nina", "Senior Software Engineer");
    expect((await t.app.request("/api/v1/me/onboarding")).status).toBe(200);
    const roadmap = MyRoadmapSchema.parse(await (await t.app.request("/api/v1/me/roadmap")).json());
    expect(roadmap.stages.length).toBeGreaterThan(0);
    expect(roadmap.stages.flatMap((stage) => stage.modules).length).toBeGreaterThan(0);
    expect((await (await t.app.request("/api/v1/me/welcome")).json()) as object).toMatchObject({
      completedAt: null,
    });
  });

  it("leaves a title no template fits for the manager or People Ops to choose", async () => {
    t = createTestApp();
    newHire("omar", "Finance associate");
    expect((await t.app.request("/api/v1/me/onboarding")).status).toBe(404);
  });

  it("doesn't count a template for the same kind of role as fitting (N-18)", async () => {
    t = createTestApp();
    // "Backend Engineer" is engineering work, but no template is for that job or team.
    newHire("nina", "Backend Engineer");
    expect((await t.app.request("/api/v1/me/roadmap")).status).toBe(404);
  });
});
