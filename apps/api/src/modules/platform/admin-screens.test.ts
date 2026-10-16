import { CurrentWorkspaceSchema } from "@contextos/shared";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { memberships, platformRecords, users } from "../../db/schema.js";
import {
  addSource,
  createProject,
  createTestApp,
  jsonRequest,
  type TestApp,
} from "../../test/helpers.js";

/** Server pieces behind the admin and owner screens (fix list AD-5 to AD-10, OW-1). */
describe("Admin and owner screens: what the server gives them", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

  it("lists who a pasted source is shared with, by name, until it's removed", async () => {
    t = createTestApp();
    const project = await createProject(t.app);
    const source = await addSource(t.app, project.id);
    t.container.db.insert(users).values({ id: "ana", name: "Ana Ruiz" }).run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: "ana", role: "member" })
      .run();
    const access = `/api/v1/projects/${project.id}/sources/${source.id}/access`;
    const list = async () =>
      json<{ items: Array<{ userId: string; name: string }> }>(await t.app.request(access));
    // Whoever added it can open it from the start.
    const ids = async () => (await list()).items.map((row) => row.userId);
    expect(await ids()).toEqual([t.container.devActor.id]);
    expect((await t.app.request(access, jsonRequest({ userId: "ana" }))).status).toBe(201);
    expect((await list()).items).toContainEqual(
      expect.objectContaining({ userId: "ana", name: "Ana Ruiz", expiresAt: null }),
    );
    expect((await t.app.request(`${access}/ana`, { method: "DELETE" })).status).toBe(204);
    expect(await ids()).toEqual([t.container.devActor.id]);
  });

  it("exports the whole date range as CSV, not one page of 100", async () => {
    t = createTestApp();
    const owner = { ...t.container.devActor };
    for (let index = 0; index < 120; index += 1)
      t.container.audit.record({
        actor: owner,
        action: "project.update",
        targetType: "project",
        targetId: `p${index}`,
      });
    const csv = await (await t.app.request("/api/v1/audit?format=csv")).text();
    const rows = csv.trim().split("\n").length - 1;
    expect(rows).toBeGreaterThanOrEqual(120);
  });

  it("completes setup step 5 once the first onboarding is started", async () => {
    t = createTestApp();
    const evidence = async () =>
      (
        await json<{ evidence: { completed: Record<string, boolean> } }>(
          await t.app.request("/api/v1/workspaces/current/setup"),
        )
      ).evidence.completed.assign_new_hire;
    expect(await evidence()).toBe(false);
    t.container.store.insert({
      workspaceId: t.container.workspace.id,
      ownerId: t.container.devActor.id,
      kind: "hr_onboarding",
      status: "active",
      data: { personId: null, name: "Leah Doe" },
    });
    expect(await evidence()).toBe(true);
  });

  it("serves a current workspace the web app accepts, with and without a scheduled deletion", async () => {
    t = createTestApp();
    // A workspace with nothing scheduled sends settings.deletion: null; the web app must accept it,
    // or nobody's role loads after sign-in.
    const before = CurrentWorkspaceSchema.safeParse(
      await json(await t.app.request("/api/v1/workspaces/current")),
    );
    expect(before.success && before.data.settings?.deletion).toBe(null);
    const current = await json<{ slug: string | null; name: string }>(
      await t.app.request("/api/v1/workspaces/current"),
    );
    await t.app.request(
      "/api/v1/workspaces/current/deletion",
      jsonRequest({ confirm: current.slug ?? current.name }),
    );
    const after = CurrentWorkspaceSchema.parse(
      await json(await t.app.request("/api/v1/workspaces/current")),
    );
    expect(after.settings?.deletion?.scheduledAt).toEqual(expect.any(String));
  });

  it("links the deletion notice to the Workspace page", async () => {
    t = createTestApp();
    const current = await json<{ slug: string | null; name: string }>(
      await t.app.request("/api/v1/workspaces/current"),
    );
    expect(
      (
        await t.app.request(
          "/api/v1/workspaces/current/deletion",
          jsonRequest({ confirm: current.slug ?? current.name }),
        )
      ).status,
    ).toBe(202);
    const notice = t.container.db
      .select()
      .from(platformRecords)
      .where(
        and(
          eq(platformRecords.kind, "notification"),
          eq(platformRecords.ownerId, t.container.devActor.id),
        ),
      )
      .all()
      .find((row) => row.data.type === "security.workspace_deletion");
    expect(notice?.data.link).toBe("/workspace");
  });
});
