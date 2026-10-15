import { TutorialDetailSchema } from "@contextos/shared";
import { afterEach, describe, expect, it } from "vitest";
import { memberships, sourceObjects, users } from "../../db/schema.js";
import {
  addSource,
  createProject,
  createTestApp,
  jsonRequest,
  type TestApp,
} from "../../test/helpers.js";
import type { Actor } from "../../types.js";
import type { PlatformRecord } from "../platform/store.js";

/** Regression tests for the authorization audit (October 2026). */
describe("Authorization: role and access checks that must hold", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;
  let owner: Actor;
  const member = (id: string, role: Actor["role"], managerId: string | null = null) => {
    t.container.db.insert(users).values({ id, name: id }).onConflictDoNothing().run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: id, role, managerId })
      .onConflictDoNothing()
      .run();
  };
  const as = (id: string, role: Actor["role"]) =>
    Object.assign(t.container.devActor, { id, name: id, role });
  const asOwner = () => Object.assign(t.container.devActor, owner);

  it("never lets a project's slug switch off the role check on its routes", async () => {
    t = createTestApp();
    owner = { ...t.container.devActor };
    // "Ask Bot" gets the slug ask-bot: it must not count as the /ask route.
    const project = await createProject(t.app, "Ask Bot");
    member("mia", "member");
    as("mia", "member");
    expect((await t.app.request("/api/v1/projects/ask-bot", { method: "DELETE" })).status).toBe(
      403,
    );
    expect(
      (
        await t.app.request(
          "/api/v1/projects/ask-bot/sources",
          jsonRequest({ kind: "document", title: "Planted", content: "Planted text" }),
        )
      ).status,
    ).toBe(403);
    // Asking still works for members, by the real route.
    expect(
      (
        await t.app.request(
          `/api/v1/projects/${project.id}/ask`,
          jsonRequest({ question: "What is this project?" }),
        )
      ).status,
    ).not.toBe(403);
    // Managers may edit projects but not delete them.
    member("max", "manager");
    as("max", "manager");
    expect(
      (await t.app.request(`/api/v1/projects/${project.id}`, { method: "DELETE" })).status,
    ).toBe(403);
  });

  it("assigns mentors to one named person, never workspace-wide or to yourself", async () => {
    t = createTestApp();
    owner = { ...t.container.devActor };
    member("dan", "manager");
    member("leah", "member", "dan");
    member("sana", "member", "dan");
    member("other", "member");
    const assign = (body: Record<string, unknown>) =>
      t.app.request("/api/v1/assignments", jsonRequest(body));
    const workspaceId = t.container.workspace.id;

    as("dan", "manager");
    expect(
      (
        await assign({
          userId: "sana",
          type: "mentor",
          scopeType: "workspace",
          scopeId: workspaceId,
        })
      ).status,
    ).toBe(400);
    expect(
      (await assign({ userId: "sana", type: "mentor", scopeType: "user", scopeId: "other" }))
        .status,
    ).toBe(403);
    expect(
      (await assign({ userId: "sana", type: "mentor", scopeType: "user", scopeId: "leah" })).status,
    ).toBe(201);
    expect(
      (
        await assign({
          userId: "sana",
          type: "path_curator",
          scopeType: "workspace",
          scopeId: workspaceId,
        })
      ).status,
    ).toBe(400);

    // Admin rights don't grant people data: no self-made mentorships.
    asOwner();
    expect(
      (await assign({ userId: owner.id, type: "mentor", scopeType: "user", scopeId: "leah" }))
        .status,
    ).toBe(403);
    member("guest1", "guest");
    expect(
      (
        await assign({
          userId: "guest1",
          type: "domain_owner",
          scopeType: "workspace",
          scopeId: workspaceId,
        })
      ).status,
    ).toBe(400);
  });

  it("keeps people data out of the admin export", async () => {
    t = createTestApp();
    owner = { ...t.container.devActor };
    t.container.store.insert({
      workspaceId: t.container.workspace.id,
      ownerId: owner.id,
      kind: "checkin",
      status: "private",
      data: { notes: "Private probation note" },
    });
    const response = await t.app.request("/api/v1/admin/export");
    expect(response.status).toBe(200);
    const body = await json<{ records: Record<string, unknown> }>(response);
    expect(Object.keys(body.records)).not.toContain("checkin");
    expect(JSON.stringify(body)).not.toContain("Private probation note");
  });

  it("shows a tutorial's content only to curators who can open all its sources", async () => {
    t = createTestApp();
    owner = { ...t.container.devActor };
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();
    const created = await json<{ id: string }>(
      await t.app.request(
        "/api/v1/tutorials",
        jsonRequest({ projectId: project.id, audience: "Everyone" }),
      ),
    );
    await t.drain();
    expect(
      TutorialDetailSchema.parse(await json(await t.app.request(`/api/v1/tutorials/${created.id}`)))
        .content,
    ).not.toBeNull();

    // An admin who can't open the (restricted) source sees that it exists, not what it says.
    member("ada", "admin");
    as("ada", "admin");
    const hidden = TutorialDetailSchema.parse(
      await json(await t.app.request(`/api/v1/tutorials/${created.id}`)),
    );
    expect(hidden).toMatchObject({ restrictedForYou: true, content: null, sources: [] });
    expect(
      (
        await t.app.request(
          `/api/v1/tutorials/${created.id}/regenerate`,
          jsonRequest({ focus: "everything" }),
        )
      ).status,
    ).toBe(403);
    // Once the source is shared with the workspace, they can review it.
    t.container.db.update(sourceObjects).set({ visibility: "workspace" }).run();
    expect(
      TutorialDetailSchema.parse(await json(await t.app.request(`/api/v1/tutorials/${created.id}`)))
        .restrictedForYou,
    ).toBe(false);
  });

  it("shows HR-only profile details to admins, People Ops, the person and their manager only", async () => {
    t = createTestApp();
    owner = { ...t.container.devActor };
    member("dan", "manager");
    member("leah", "member", "dan");
    member("sam", "member");
    member("hana", "hr");
    const organization = (startDate: string) =>
      t.container.db
        .update(memberships)
        .set({
          organization: {
            jobTitle: "Engineer",
            lastDay: "2026-12-31",
            suspendedBy: "directory",
            startDate,
            isNewHire: false,
          },
        })
        .run();
    const daysAgo = (days: number) =>
      new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    organization(daysAgo(20));
    const leah = async () =>
      (
        await json<{ items: Array<{ id: string; organization: Record<string, unknown> }> }>(
          await t.app.request("/api/v1/users"),
        )
      ).items.find((entry) => entry.id === "leah")!.organization;
    // Others learn that she's new, for the directory's filter, but not her start date.
    as("sam", "member");
    expect(await leah()).toEqual({ jobTitle: "Engineer", isNewHire: true });
    expect(
      (
        await json<{ organization: Record<string, unknown> }>(
          await t.app.request("/api/v1/people/leah"),
        )
      ).organization,
    ).toEqual({ jobTitle: "Engineer", isNewHire: true });
    expect((await t.app.request("/api/v1/users?status=suspended")).status).toBe(403);
    for (const [id, role] of [
      ["leah", "member"],
      ["dan", "manager"],
      ["hana", "hr"],
    ] as const) {
      as(id, role);
      expect(await leah()).toMatchObject({ lastDay: "2026-12-31", startDate: daysAgo(20) });
    }
    asOwner();
    expect(await leah()).toMatchObject({ lastDay: "2026-12-31", startDate: daysAgo(20) });
    // A year in, she's no longer a new joiner.
    organization(daysAgo(365));
    as("sam", "member");
    expect(await leah()).toEqual({ jobTitle: "Engineer" });
  });

  it("gives invited guests an expiry", () => {
    t = createTestApp();
    owner = { ...t.container.devActor };
    member("guest2", "member");
    t.container.store.insert({
      workspaceId: t.container.workspace.id,
      ownerId: owner.id,
      kind: "invitation",
      status: "pending",
      data: { email: "guest2@example.com", role: "guest" },
    });
    expect(t.container.identity.acceptInvitations("guest2", "guest2@example.com")).toBe(1);
    const row = t.container.db
      .select()
      .from(memberships)
      .all()
      .find((entry) => entry.userId === "guest2")!;
    expect(row.role).toBe("guest");
    expect(row.guestExpiresAt).not.toBeNull();
    expect(row.guestExpiresAt!.getTime()).toBeLessThanOrEqual(Date.now() + 180 * 86_400_000);
  });

  it("hides bounties about knowledge the viewer can't open", async () => {
    t = createTestApp();
    owner = { ...t.container.devActor };
    const project = await createProject(t.app);
    const source = await addSource(t.app, project.id);
    await t.drain();
    const flag = t.container.store.insert({
      workspaceId: t.container.workspace.id,
      ownerId: owner.id,
      kind: "flag",
      projectId: project.id,
      status: "accepted",
      data: { sourceIds: [source.id], comment: "The payroll export still lists the old salaries" },
    });
    const bounty = t.container.services.bounties.createAuto({
      workspaceId: t.container.workspace.id,
      projectId: project.id,
      origin: "flag",
      title: "Fix: payroll salaries",
      description: "The payroll export still lists the old salaries",
      rewardRp: 10,
      targetType: "source",
      targetId: source.id,
      flagId: flag.id,
    });
    t.container.store.patch(bounty, { status: "open" });
    const listed = async () =>
      (
        await json<{ items: PlatformRecord[] }>(await t.app.request("/api/v1/bounties?limit=50"))
      ).items.map((row) => row.id);
    expect(await listed()).toContain(bounty.id);

    // An admin who can't open the source doesn't learn what the flag said.
    member("ada", "admin");
    as("ada", "admin");
    expect(await listed()).not.toContain(bounty.id);
    expect((await t.app.request(`/api/v1/bounties/${bounty.id}`)).status).toBe(404);
    const search = await t.app.request("/api/v1/search?q=payroll&types=bounty");
    expect(JSON.stringify(await search.json())).not.toContain("salaries");
  });

  it("keeps People Ops from becoming the manager whose recommendation they decide", async () => {
    t = createTestApp();
    owner = { ...t.container.devActor };
    member("hana", "hr");
    member("dan", "manager");
    as("hana", "hr");
    const create = (managerId: string) =>
      t.app.request(
        "/api/v1/people-ops/onboardings",
        jsonRequest({
          name: "Nora Newhire",
          title: "Engineer",
          team: "Platform",
          startDate: "2026-11-02",
          managerId,
          buddyId: null,
          templateId: null,
        }),
      );
    expect((await create("hana")).status).toBe(400);
    expect((await create("dan")).status).toBe(201);
  });
});
