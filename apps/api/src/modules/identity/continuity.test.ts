import { ContinuityChecklistSchema } from "@contextos/shared";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { assignments, memberships, platformRecords, users } from "../../db/schema.js";
import { createProject, createTestApp, jsonRequest, type TestApp } from "../../test/helpers.js";
import type { Actor } from "../../types.js";

describe("Knowledge continuity: handing over a leaver's responsibilities", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  let owner: Actor;
  const member = (id: string, name: string, role: Actor["role"], managerId: string | null) => {
    t.container.db.insert(users).values({ id, name }).run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: id, role, managerId })
      .run();
  };
  const as = (id: string, role: Actor["role"]) =>
    Object.assign(t.container.devActor, { id, name: id, role });
  const notifications = (userId: string) =>
    t.container.db
      .select()
      .from(platformRecords)
      .where(and(eq(platformRecords.kind, "notification"), eq(platformRecords.ownerId, userId)))
      .all();
  const samOwns = () =>
    t.container.db
      .select()
      .from(assignments)
      .where(and(eq(assignments.userId, "sam"), eq(assignments.type, "domain_owner")))
      .all();

  it("lets the manager pick new owners and an admin apply them", async () => {
    t = createTestApp();
    owner = { ...t.container.devActor };
    const project = await createProject(t.app, "Billing");
    member("dan", "Dan Reyes", "manager", null);
    member("leah", "Leah Doe", "member", "dan");
    member("sam", "Sam Okafor", "member", "dan");
    t.container.db
      .insert(assignments)
      .values({
        id: "owns-billing",
        workspaceId: t.container.workspace.id,
        userId: "leah",
        type: "domain_owner",
        scopeType: "project",
        scopeId: project.id,
      })
      .run();

    // Offboarding Leah gives her manager a checklist, linked from a notification by name.
    expect(
      (await t.app.request("/api/v1/users/leah", jsonRequest({ status: "offboarded" }, "PATCH")))
        .status,
    ).toBe(200);
    const [notice] = notifications("dan");
    expect(notice?.data).toMatchObject({ title: "Hand over Leah Doe's responsibilities" });
    const link = String(notice!.data.link);
    expect(link).toMatch(/^\/continuity\/checklists\/.+/);

    as("dan", "manager");
    const view = async () => {
      const response = await t.app.request(`/api/v1${link}`);
      expect(response.status).toBe(200);
      return ContinuityChecklistSchema.parse(await response.json());
    };
    const before = await view();
    expect(before).toMatchObject({
      status: "open",
      leaver: { id: "leah", name: "Leah Doe" },
      canGrant: false,
    });
    expect(before.areas).toEqual([
      {
        key: `domain_owner:project:${project.id}`,
        type: "Domain owner",
        scope: "Billing",
        status: "unowned",
        assignee: null,
        granted: false,
      },
    ]);

    // Only her manager and admins can open it.
    as("sam", "member");
    expect((await t.app.request(`/api/v1${link}`)).status).toBe(404);

    // The manager's pick is recorded, and waits for an admin.
    as("dan", "manager");
    const pick = (version: number) =>
      t.app.request(
        `/api/v1${link}`,
        jsonRequest(
          {
            version,
            areas: [{ key: before.areas[0]!.key, status: "reassigned", assigneeId: "sam" }],
          },
          "PATCH",
        ),
      );
    const picked = ContinuityChecklistSchema.parse(await (await pick(before.version)).json());
    expect(picked.status).toBe("open");
    expect(picked.areas[0]).toMatchObject({
      status: "reassigned",
      assignee: { id: "sam", name: "Sam Okafor" },
      granted: false,
    });
    expect(samOwns()).toEqual([]);
    expect(
      notifications(owner.id).some((row) => row.data.type === "offboarding.continuity_pending"),
    ).toBe(true);

    // An admin applies it: Sam owns Billing and the checklist is done, once.
    Object.assign(t.container.devActor, owner);
    const applied = ContinuityChecklistSchema.parse(await (await pick(picked.version)).json());
    expect(applied).toMatchObject({ status: "completed", canGrant: true });
    expect(applied.areas[0]?.granted).toBe(true);
    expect(samOwns()).toHaveLength(1);
    await pick(applied.version);
    expect(samOwns()).toHaveLength(1);
  });
});
