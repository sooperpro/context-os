import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  assignments,
  jobs,
  memberships,
  platformRecords,
  sourceObjects,
  users,
  workspaces,
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
import { flagLink } from "./links.js";

/** N-12: events that used to tell nobody, each checked against who should hear and where it links. */
describe("Notification matrix (N-12)", () => {
  let t: TestApp;
  afterEach(() => t?.close());

  const member = (id: string, role: Actor["role"], managerId: string | null = null) => {
    t.container.db
      .insert(users)
      .values({ id, name: `${id[0]!.toUpperCase()}${id.slice(1)}` })
      .onConflictDoNothing()
      .run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: id, role, managerId })
      .onConflictDoNothing()
      .run();
  };
  const as = (id: string, role: Actor["role"]) =>
    Object.assign(t.container.devActor, {
      id,
      name: `${id[0]!.toUpperCase()}${id.slice(1)}`,
      role,
    });
  /** Everything someone was told, newest first: title and link. */
  const inbox = (userId: string) =>
    t.container.db
      .select()
      .from(platformRecords)
      .where(and(eq(platformRecords.kind, "notification"), eq(platformRecords.ownerId, userId)))
      .all()
      .map((row) => ({ title: String(row.data.title), link: row.data.link }));
  const patchUser = (userId: string, body: unknown) =>
    t.app.request(`/api/v1/users/${userId}`, jsonRequest(body, "PATCH"));

  it("tells people about their manager, last day and access, never the admin who changed it", async () => {
    t = createTestApp();
    member("dan", "manager");
    member("olu", "manager");
    member("maya", "member");
    member("sam", "member", "dan");

    expect((await patchUser("maya", { managerId: "dan" })).status).toBe(200);
    expect(inbox("maya")).toContainEqual({ title: "You now report to Dan", link: "/" });
    expect(inbox("dan")).toContainEqual({
      title: "Maya now reports to you",
      link: "/team/maya",
    });
    await patchUser("maya", { managerId: "olu" });
    expect(inbox("dan")).toContainEqual({
      title: "Maya no longer reports to you",
      link: "/people/maya",
    });

    const lastDay = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    await patchUser("maya", { lastDay });
    expect(inbox("maya").map((entry) => entry.title)).toContain(
      `Your last day is set for ${lastDay}`,
    );
    expect(inbox("olu")).toContainEqual({
      title: `Maya's last day is ${lastDay}`,
      link: "/team/maya",
    });

    await patchUser("sam", { status: "suspended" });
    expect(inbox("dan").map((entry) => entry.title)).toContain("Sam's access was suspended");
    await patchUser("sam", { status: "active" });
    expect(inbox("sam").map((entry) => entry.title)).toContain(
      "Your access to the workspace is back",
    );
    expect(inbox("dan").map((entry) => entry.title)).toContain("Sam has access again");

    // Saving the same manager again tells nobody anything new.
    const before = inbox("olu").length;
    await patchUser("maya", { managerId: "olu" });
    expect(inbox("olu")).toHaveLength(before);
    expect(inbox(t.container.devActor.id)).toEqual([]);
  });

  it("tells people about responsibilities, mentoring and the projects they can open", async () => {
    t = createTestApp();
    const project = await createProject(t.app, "IT help");
    member("dan", "manager");
    member("maya", "member");
    member("sam", "member");

    const granted = await t.app.request(
      "/api/v1/assignments",
      jsonRequest({
        userId: "sam",
        type: "domain_owner",
        scopeType: "project",
        scopeId: project.id,
      }),
    );
    expect(granted.status).toBe(201);
    expect(inbox("sam")).toContainEqual({
      title: "You're now a knowledge owner for IT help",
      link: `/projects/${project.id}`,
    });
    const { id } = (await granted.json()) as { id: string };
    await t.app.request(`/api/v1/assignments/${id}`, { method: "DELETE" });
    expect(inbox("sam").map((entry) => entry.title)).toContain(
      "You're no longer a knowledge owner for IT help",
    );

    await t.app.request(
      "/api/v1/assignments",
      jsonRequest({ userId: "dan", type: "mentor", scopeType: "user", scopeId: "maya" }),
    );
    expect(inbox("dan")).toContainEqual({
      title: "You're now mentoring Maya",
      link: "/people/maya",
    });
    expect(inbox("maya")).toContainEqual({ title: "Dan is now your mentor", link: "/people/dan" });

    await t.app.request(
      `/api/v1/projects/${project.id}/memberships`,
      jsonRequest({ userId: "maya" }),
    );
    expect(inbox("maya")).toContainEqual({
      title: "You were added to IT help",
      link: `/projects/${project.id}`,
    });
    await t.app.request(`/api/v1/projects/${project.id}/memberships/maya`, { method: "DELETE" });
    expect(inbox("maya").map((entry) => entry.title)).toContain(
      "You no longer have access to IT help",
    );

    // Deleting the project tells the people who could open it.
    await t.app.request(
      `/api/v1/projects/${project.id}/memberships`,
      jsonRequest({ userId: "sam" }),
    );
    expect(
      (await t.app.request(`/api/v1/projects/${project.id}`, { method: "DELETE" })).status,
    ).toBe(204);
    expect(inbox("sam").map((entry) => entry.title)).toContainEqual(
      expect.stringMatching(/deleted the project IT help$/),
    );
  });

  it("tells the sender and the manager when an invitation is accepted, and the sender when one expires", async () => {
    t = createTestApp();
    const sender = t.container.devActor.id;
    member("dan", "manager");
    const invite = (body: unknown) => t.app.request("/api/v1/users/invite", jsonRequest(body));
    expect((await invite({ email: "kim@example.test", managerId: "dan" })).status).toBe(201);
    expect((await invite({ email: "lee@example.test" })).status).toBe(201);

    t.container.db
      .insert(users)
      .values({ id: "kim", name: "Kim", email: "kim@example.test" })
      .run();
    expect(t.container.identity.acceptInvitations("kim", "kim@example.test")).toBe(1);
    expect(inbox("dan")).toContainEqual({
      title: "Kim joined and reports to you",
      link: "/team/kim",
    });
    expect(inbox(sender)).toContainEqual({
      title: "Kim accepted your invitation",
      link: "/people/kim",
    });

    const lee = t.container.store
      .listWhere(t.container.workspace.id, "invitation", { status: "pending" }, 10)
      .find((row) => row.data.email === "lee@example.test")!;
    t.container.store.patch(lee, {
      data: { ...lee.data, expiresAt: new Date(Date.now() - 1000).toISOString() },
    });
    t.container.sweeps.run();
    expect(inbox(sender)).toContainEqual({
      title: "Your invitation to lee@example.test expired",
      link: "/members",
    });
  });

  it("tells a proposed answer's reviewer, and links flags to what was flagged", async () => {
    t = createTestApp();
    const project = await createProject(t.app, "Billing");
    await addSource(t.app, project.id);
    await t.drain();
    // No domain owner, so the author's manager reviews.
    t.container.db.delete(assignments).where(eq(assignments.type, "domain_owner")).run();
    member("dan", "manager");
    member("leah", "member", "dan");
    t.container.db.update(sourceObjects).set({ visibility: "workspace" }).run();
    as("leah", "member");
    const answer = (await (
      await t.app.request(
        `/api/v1/projects/${project.id}/ask`,
        jsonRequest({ question: "Why is billing moving to the ledger service?" }),
      )
    ).json()) as { id: string };
    expect(
      (await t.app.request(`/api/v1/ask/messages/${answer.id}/promote`, jsonRequest({}))).status,
    ).toBe(201);
    expect(inbox("dan")).toContainEqual({
      title: "Leah proposed an answer for Billing",
      link: "/reviews",
    });

    expect(flagLink("p1", { targetType: "context_item", targetId: "i1" })).toBe(
      "/projects/p1/items/i1",
    );
    expect(flagLink("p1", { targetType: "answer", targetId: "q1" })).toBe("/projects/p1");
    expect(flagLink(null, {})).toBe("/");
  });

  it("tells a project's knowledge owners when a source fails for good", async () => {
    t = createTestApp({ gemini: createFakeGemini({ failWith: new Error("Model unavailable") }) });
    const project = await createProject(t.app, "Billing");
    member("sam", "member");
    t.container.db
      .insert(assignments)
      .values({
        id: "a-sam",
        workspaceId: t.container.workspace.id,
        userId: "sam",
        type: "domain_owner",
        scopeType: "project",
        scopeId: project.id,
      })
      .run();
    await addSource(t.app, project.id);
    // No retries left on the first try.
    t.container.db.update(jobs).set({ maxAttempts: 1 }).run();
    await t.drain();
    expect(inbox("sam")).toContainEqual({
      title: `"ADR-0007: Move billing to the ledger service" couldn't be read in Billing`,
      link: `/projects/${project.id}/sources`,
    });
  });

  it("tells admins when a scheduled workspace deletion is cancelled", async () => {
    t = createTestApp();
    member("ada", "admin");
    const row = t.container.db.select().from(workspaces).all()[0]!;
    expect(
      (
        await t.app.request(
          "/api/v1/workspaces/current/deletion",
          jsonRequest({ confirm: row.slug ?? row.name }),
        )
      ).status,
    ).toBeLessThan(300);
    await t.app.request("/api/v1/workspaces/current/deletion", { method: "DELETE" });
    expect(inbox("ada").map((entry) => entry.title)).toContainEqual(
      expect.stringMatching(/cancelled the workspace deletion$/),
    );
  });
});
