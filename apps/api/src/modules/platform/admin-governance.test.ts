import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { auditLog, memberships, sourceObjects, users } from "../../db/schema.js";
import {
  addSource,
  createProject,
  createTestApp,
  jsonRequest,
  type TestApp,
} from "../../test/helpers.js";
import type { Actor } from "../../types.js";
import { createPlatformStore } from "./store.js";

interface PolicyList {
  total: number;
  items: Array<{ id: string; name: string; locked: boolean; conflict: boolean }>;
  conflicts: Array<{ id: string; options: Array<{ id: string }> }>;
  groups: string[];
  previewPeople: Array<{ person: { id: string }; groups: string }>;
  sourceOptions: Array<{ kind: string; id: string; label: string }>;
}

describe("Admin governance: access policies, role requests, members", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;
  const owner = () => ({ ...t.container.devActor });
  const as = (actor: Pick<Actor, "id" | "role">) =>
    Object.assign(t.container.devActor, { ...actor, name: actor.id });
  const member = (id: string, role: Actor["role"], organization: Record<string, unknown> = {}) => {
    t.container.db.insert(users).values({ id, name: id }).onConflictDoNothing().run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: id, role, organization })
      .onConflictDoNothing()
      .run();
  };
  /** A department with one team, so policies have real groups to name. */
  const orgWithTeam = async (name: string) => {
    const department = await json<{ id: string }>(
      await t.app.request("/api/v1/org/departments", jsonRequest({ name: `${name} dept` })),
    );
    return json<{ id: string; departmentId: string }>(
      await t.app.request("/api/v1/org/teams", jsonRequest({ name, departmentId: department.id })),
    );
  };

  it("restricts and excludes sources by group, for admins too, and resolves conflicts", async () => {
    t = createTestApp();
    const admin = owner();
    const project = await createProject(t.app, "Finance");
    const source = await addSource(t.app, project.id);
    await t.drain();
    // Shared with the workspace, so source permissions alone let everyone open it.
    t.container.db
      .update(sourceObjects)
      .set({ visibility: "workspace" })
      .where(eq(sourceObjects.id, source.id))
      .run();
    const finance = await orgWithTeam("Finance");
    const platform = await orgWithTeam("Platform");
    member("fin", "member", { teamId: finance.id, departmentId: finance.departmentId });
    member("eng", "member", { teamId: platform.id, departmentId: platform.departmentId });

    const listed = await json<PolicyList>(await t.app.request("/api/v1/admin/access-policies"));
    expect(listed.items).toEqual([
      expect.objectContaining({ id: "mirror", locked: true, name: "Mirror source permissions" }),
    ]);
    expect(listed.groups).toEqual(
      expect.arrayContaining(["Finance", "Platform", "Finance dept", "Platform dept"]),
    );
    expect(listed.sourceOptions).toContainEqual(
      expect.objectContaining({ kind: "project", id: project.id }),
    );

    // Unknown groups and sources are refused; the mirror policy can't change.
    const body = (
      groups: string[],
      effect = "restrict",
      sources = [{ kind: "project", id: project.id }],
    ) => jsonRequest({ name: "Finance only", effect, groups, sources });
    expect((await t.app.request("/api/v1/admin/access-policies", body(["Nope"]))).status).toBe(400);
    expect(
      (
        await t.app.request(
          "/api/v1/admin/access-policies",
          body(["Finance"], "restrict", [{ kind: "project", id: "missing" }]),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await t.app.request("/api/v1/admin/access-policies/mirror", {
          ...body(["Finance"]),
          method: "PATCH",
        })
      ).status,
    ).toBe(409);

    const created = await t.app.request("/api/v1/admin/access-policies", body(["Finance"]));
    expect(created.status).toBe(201);
    const policy = await json<{ id: string; sources: Array<{ label: string }> }>(created);
    expect(policy.sources[0]?.label).toBe("Finance (project)");

    const sourcesFor = async (id: string, role: Actor["role"]) => {
      as({ id, role });
      const result = await json<{ items: unknown[] }>(
        await t.app.request(`/api/v1/projects/${project.id}/sources`),
      );
      Object.assign(t.container.devActor, admin);
      return result.items.length;
    };
    expect(await sourcesFor("fin", "member")).toBe(1);
    expect(await sourcesFor("eng", "member")).toBe(0);
    // Admins don't bypass policies; owners see everything.
    member("ada", "admin");
    expect(await sourcesFor("ada", "admin")).toBe(0);
    expect(await sourcesFor(admin.id, admin.role)).toBe(1);

    // Exclude: the finance team can still open it, but it is never used in answers.
    await t.app.request(`/api/v1/admin/access-policies/${policy.id}`, {
      ...body(["Finance"], "exclude"),
      method: "PATCH",
    });
    as({ id: "fin", role: "member" });
    expect(t.container.identity.visibleSourceIds(t.container.devActor, project.id)).toEqual([
      source.id,
    ]);
    expect(t.container.identity.answerableSourceIds(t.container.devActor, project.id)).toEqual([]);
    const answer = await json<{ confidence: string }>(
      await t.app.request(
        `/api/v1/projects/${project.id}/ask`,
        jsonRequest({ question: "Why is billing moving to the ledger service?" }),
      ),
    );
    expect(answer.confidence).toBe("insufficient");
    Object.assign(t.container.devActor, admin);
    const ai = await json<{ excluded: Array<{ label: string; reason: string }> }>(
      await t.app.request("/api/v1/admin/ai-settings"),
    );
    expect(ai.excluded).toEqual([
      expect.objectContaining({
        label: "Finance (project)",
        reason: expect.stringContaining("Finance") as string,
      }),
    ]);

    // Preview evaluates exactly what that person gets.
    const preview = await json<{
      items: Array<{ label: string; allowed: boolean; reason: string }>;
    }>(await t.app.request("/api/v1/admin/access-preview?personId=eng"));
    expect(preview.items).toContainEqual(
      expect.objectContaining({ label: "Finance (project)", allowed: false }),
    );

    // A second policy on the same source is a conflict; the more open rule wins until resolved.
    await t.app.request(
      "/api/v1/admin/access-policies",
      jsonRequest({
        name: "Platform view",
        effect: "restrict",
        groups: ["Platform"],
        sources: [{ kind: "project", id: project.id }],
      }),
    );
    let state = await json<PolicyList>(await t.app.request("/api/v1/admin/access-policies"));
    expect(state.conflicts).toHaveLength(1);
    expect(state.items.filter((item) => item.conflict)).toHaveLength(2);
    expect(await sourcesFor("eng", "member")).toBe(1);
    const security = await json<{ items: Array<{ id: string; state: string; value: string }> }>(
      await t.app.request("/api/v1/admin/security"),
    );
    expect(security.items.find((item) => item.id === "access_policies")).toMatchObject({
      state: "attention",
      value: expect.stringContaining("1 conflict") as string,
    });
    expect(
      (
        await t.app.request(
          `/api/v1/admin/access-conflicts/${encodeURIComponent(state.conflicts[0]!.id)}/resolve`,
          jsonRequest({ optionId: "not-an-option" }),
        )
      ).status,
    ).toBe(400);
    state = await json<PolicyList>(
      await t.app.request(
        `/api/v1/admin/access-conflicts/${encodeURIComponent(state.conflicts[0]!.id)}/resolve`,
        jsonRequest({ optionId: policy.id }),
      ),
    );
    expect(state.conflicts).toEqual([]);
    expect(await sourcesFor("eng", "member")).toBe(0);

    expect(
      (await t.app.request(`/api/v1/admin/access-policies/${policy.id}`, { method: "DELETE" }))
        .status,
    ).toBe(204);
    expect(
      t.container.db
        .select()
        .from(auditLog)
        .all()
        .map((row) => row.action)
        .filter((action) => action.startsWith("policy.")),
    ).toEqual([
      "policy.create",
      "policy.update",
      "policy.create",
      "policy.resolve_conflict",
      "policy.delete",
    ]);
  });

  it("takes no new role requests, and lets admins close the ones still open (N-11)", async () => {
    t = createTestApp();
    const admin = owner();
    member("maya", "member");
    member("sam", "admin");
    as({ id: "maya", role: "member" });
    expect(
      (
        await t.app.request(
          "/api/v1/role-requests",
          jsonRequest({ role: "manager", reason: "Leading the Billing team" }),
        )
      ).status,
    ).toBe(404);
    expect((await t.app.request("/api/v1/role-requests/mine")).status).toBe(404);
    expect((await t.app.request("/api/v1/admin/role-requests")).status).toBe(403);

    // Requests made before they were removed can still be decided by an admin.
    const store = createPlatformStore(t.container.db);
    const open = (ownerId: string) =>
      store.insert({
        workspaceId: t.container.workspace.id,
        ownerId,
        kind: "role_request",
        status: "open",
        data: { role: "manager", reason: "From before", from: "member" },
      });
    const request = open("maya");
    const own = open("sam");
    Object.assign(t.container.devActor, admin);
    const listed = await json<{ items: Array<{ id: string; role: string }> }>(
      await t.app.request("/api/v1/admin/role-requests"),
    );
    expect(listed.items.map((item) => item.id).sort()).toEqual([request.id, own.id].sort());
    const security = await json<{ items: Array<{ id: string; value: string }> }>(
      await t.app.request("/api/v1/admin/security"),
    );
    expect(security.items.find((item) => item.id === "role_requests")?.value).toBe(
      "Manager · 2 pending",
    );
    expect(
      (
        await t.app.request(
          `/api/v1/admin/role-requests/${request.id}/decision`,
          jsonRequest({ decision: "approve" }),
        )
      ).status,
    ).toBe(200);
    expect(t.container.identity.requireMember(t.container.workspace.id, "maya").role).toBe(
      "manager",
    );
    // An admin can't decide their own.
    as({ id: "sam", role: "admin" });
    expect(
      (
        await t.app.request(
          `/api/v1/admin/role-requests/${own.id}/decision`,
          jsonRequest({ decision: "approve" }),
        )
      ).status,
    ).toBe(403);
  });

  it("never lets anyone change their own role", async () => {
    t = createTestApp();
    member("sam", "admin");
    as({ id: "sam", role: "admin" });
    expect(
      (await t.app.request("/api/v1/users/sam", jsonRequest({ role: "member" }, "PATCH"))).status,
    ).toBe(403);
  });

  it("reports seats and runs the directory sync without an identity provider", async () => {
    t = createTestApp();
    member("maya", "member");
    const overview = await json<{
      seats: { used: number; total: number | null };
      directorySync: { provider: string; enabled: boolean; lastRunAt: string | null };
    }>(await t.app.request("/api/v1/admin/members/overview"));
    expect(overview).toEqual({
      seats: { used: 2, total: null },
      directorySync: { provider: "Development sign-in", enabled: false, lastRunAt: null },
    });
    const run = await json<{ created: number; updated: number; deactivated: number }>(
      await t.app.request("/api/v1/admin/directory-sync", jsonRequest({})),
    );
    expect(run).toMatchObject({ created: 0, updated: 0, deactivated: 0 });
    const after = await json<{ directorySync: { lastRunAt: string | null } }>(
      await t.app.request("/api/v1/admin/members/overview"),
    );
    expect(after.directorySync.lastRunAt).toBeTruthy();
    const runs = await json<{ items: Array<{ connector: string }> }>(
      await t.app.request("/api/v1/admin/sync-runs"),
    );
    expect(runs.items).toEqual([
      expect.objectContaining({ connector: "Directory · Development sign-in" }),
    ]);
  });

  it("refuses pay and performance questions in project Ask, for every role", async () => {
    t = createTestApp();
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();
    const calls = t.gemini.calls.length;
    const answer = await json<{ confidence: string; answer: string; citations: unknown[] }>(
      await t.app.request(
        `/api/v1/projects/${project.id}/ask`,
        jsonRequest({ question: "What is the salary band for a senior engineer?" }),
      ),
    );
    expect(answer).toMatchObject({ confidence: "insufficient", citations: [] });
    expect(answer.answer).toContain("People partner");
    expect(t.gemini.calls.length).toBe(calls);
  });
});
