import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  assignments,
  connectorConnections,
  domainEvents,
  memberships,
  oauthStates,
  sourceAccess,
  users,
  workspaces,
} from "../../db/schema.js";
import {
  addSource,
  createProject,
  createTestApp,
  jsonRequest,
  type TestApp,
} from "../../test/helpers.js";
import type { Actor } from "../../types.js";

describe("Phase 1 workspace and organization", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const seedMember = (id: string, role: Actor["role"] = "member") => {
    const workspaceId = t.container.workspace.id;
    t.container.db.insert(users).values({ id, name: id }).run();
    t.container.db.insert(memberships).values({ workspaceId, userId: id, role }).run();
    return { id, name: id, workspaceId, role };
  };
  const createDepartment = async () => {
    const response = await t.app.request(
      "/api/v1/org/departments",
      jsonRequest({ name: "Engineering" }),
    );
    expect(response.status).toBe(201);
    return response.json() as Promise<{ id: string }>;
  };
  const createTeam = async (departmentId: string, name: string, parentId?: string) =>
    t.app.request("/api/v1/org/teams", jsonRequest({ departmentId, name, parentId }));

  it("creates a local workspace with an unverified domain, rejects duplicate slugs and unavailable regions", async () => {
    t = createTestApp();
    const input = { name: "Example", slug: "example-team", primaryDomain: "example.com" };
    const response = await t.app.request("/api/v1/workspaces", jsonRequest(input));
    expect(response.status).toBe(201);
    const created = (await response.json()) as {
      id: string;
      region: string;
      primaryDomainVerified: boolean;
      organizationId: string | null;
    };
    expect(created.region).toBe("us-east-1");
    expect(created.primaryDomainVerified).toBe(false);
    expect(created.organizationId).toBeNull();
    const member = t.container.db
      .select()
      .from(memberships)
      .where(eq(memberships.workspaceId, created.id))
      .get();
    expect(member?.role).toBe("owner");
    expect((await t.app.request("/api/v1/workspaces", jsonRequest(input))).status).toBe(409);
    expect(
      (
        await t.app.request(
          "/api/v1/workspaces",
          jsonRequest({ ...input, slug: "another-team", region: "eu-central-1" }),
        )
      ).status,
    ).toBe(503);
    expect(
      (await t.app.request("/api/v1/workspaces", jsonRequest({ ...input, slug: "bad!slug" })))
        .status,
    ).toBe(400);
  });

  it("protects workspace settings, enforces versions and keeps setup completion evidence-backed", async () => {
    t = createTestApp();
    const owner = { ...t.container.devActor };
    const updated = await t.app.request(
      "/api/v1/workspaces/current",
      jsonRequest({ version: 1, timezone: "Asia/Kolkata", includeIndirectReports: true }, "PATCH"),
    );
    expect(updated.status).toBe(200);
    expect(
      (
        await t.app.request(
          "/api/v1/workspaces/current",
          jsonRequest({ version: 1, name: "Stale" }, "PATCH"),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await t.app.request(
          "/api/v1/workspaces/current",
          jsonRequest({ version: 2, timezone: "Invalid/Timezone" }, "PATCH"),
        )
      ).status,
    ).toBe(400);
    const setup = (await (await t.app.request("/api/v1/workspaces/current/setup")).json()) as {
      version: number;
    };
    expect(
      (
        await t.app.request(
          "/api/v1/workspaces/current/setup",
          jsonRequest(
            { version: setup.version, step: "connect_source", status: "completed" },
            "PATCH",
          ),
        )
      ).status,
    ).toBe(409);
    const skipped = await t.app.request(
      "/api/v1/workspaces/current/setup",
      jsonRequest({ version: setup.version, step: "connect_source", status: "skipped" }, "PATCH"),
    );
    expect(skipped.status).toBe(200);
    await createProject(t.app);
    expect(
      (
        await t.app.request(
          "/api/v1/workspaces/current/setup",
          jsonRequest({ version: 2, step: "create_project", status: "completed" }, "PATCH"),
        )
      ).status,
    ).toBe(200);
    Object.assign(t.container.devActor, seedMember("ordinary"));
    expect((await t.app.request("/api/v1/workspaces/current/setup")).status).toBe(403);
    expect(
      (
        await t.app.request(
          "/api/v1/workspaces/current",
          jsonRequest({ version: 2, name: "Denied" }, "PATCH"),
        )
      ).status,
    ).toBe(403);
    Object.assign(t.container.devActor, owner);
  });

  it("enforces three-level team trees, prevents cycles and blocks deletion of referenced org nodes", async () => {
    t = createTestApp();
    const department = await createDepartment();
    const root = (await (await createTeam(department.id, "Platform")).json()) as { id: string };
    const child = (await (await createTeam(department.id, "Payments", root.id)).json()) as {
      id: string;
    };
    const leaf = (await (await createTeam(department.id, "Ledger", child.id)).json()) as {
      id: string;
    };
    expect((await createTeam(department.id, "Too deep", leaf.id)).status).toBe(400);
    expect(
      (
        await t.app.request(
          `/api/v1/org/teams/${root.id}`,
          jsonRequest({ parentId: leaf.id }, "PATCH"),
        )
      ).status,
    ).toBe(400);
    const member = seedMember("engineer");
    expect(
      (
        await t.app.request(
          `/api/v1/users/${member.id}/organization`,
          jsonRequest(
            {
              departmentId: department.id,
              teamId: leaf.id,
              jobTitle: "Engineer",
              roleFamily: "Eng",
              timezone: "Asia/Kolkata",
              startDate: "2026-10-13",
              isNewHire: true,
            },
            "PATCH",
          ),
        )
      ).status,
    ).toBe(200);
    expect((await t.app.request(`/api/v1/org/teams/${leaf.id}`, { method: "DELETE" })).status).toBe(
      409,
    );
    expect(
      (await t.app.request(`/api/v1/org/departments/${department.id}`, { method: "DELETE" }))
        .status,
    ).toBe(409);
    expect(
      (
        await t.app.request(
          `/api/v1/users/${member.id}/organization`,
          jsonRequest({ departmentId: null }, "PATCH"),
        )
      ).status,
    ).toBe(400);
    await t.app.request(
      `/api/v1/users/${member.id}/organization`,
      jsonRequest({ departmentId: null, teamId: null }, "PATCH"),
    );
    for (const node of [leaf, child, root])
      expect(
        (await t.app.request(`/api/v1/org/teams/${node.id}`, { method: "DELETE" })).status,
      ).toBe(204);
    expect(
      (await t.app.request(`/api/v1/org/departments/${department.id}`, { method: "DELETE" }))
        .status,
    ).toBe(204);
  });

  it("denies cross-workspace department references and guest/member administration", async () => {
    t = createTestApp();
    const department = await createDepartment();
    const otherWorkspaceId = randomUUID();
    t.container.db.insert(workspaces).values({ id: otherWorkspaceId, name: "Other" }).run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: otherWorkspaceId, userId: t.container.devActor.id, role: "owner" })
      .run();
    Object.assign(t.container.devActor, { workspaceId: otherWorkspaceId });
    expect((await createTeam(department.id, "Tenant leak")).status).toBe(404);
    expect(
      (
        await t.app.request(
          `/api/v1/org/departments/${department.id}`,
          jsonRequest({ name: "Changed" }, "PATCH"),
        )
      ).status,
    ).toBe(404);
    Object.assign(t.container.devActor, seedMember("guest", "guest"));
    expect((await t.app.request("/api/v1/org/departments")).status).toBe(403);
    Object.assign(t.container.devActor, seedMember("member"));
    expect((await createTeam(department.id, "Not allowed")).status).toBe(403);
  });

  it("rejects reporting cycles, last-owner removal and guest expiry removal", async () => {
    t = createTestApp();
    const first = seedMember("first");
    const second = seedMember("second");
    expect(
      (
        await t.app.request(
          `/api/v1/users/${first.id}`,
          jsonRequest({ managerId: second.id }, "PATCH"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await t.app.request(
          `/api/v1/users/${second.id}`,
          jsonRequest({ managerId: first.id }, "PATCH"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await t.app.request(
          `/api/v1/users/${t.container.devActor.id}`,
          jsonRequest({ status: "offboarded" }, "PATCH"),
        )
      ).status,
    ).toBe(409);
    const guest = seedMember("temporary", "guest");
    const expiry = new Date(Date.now() + 86400000).toISOString();
    expect(
      (
        await t.app.request(
          `/api/v1/users/${guest.id}`,
          jsonRequest({ guestExpiresAt: expiry }, "PATCH"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await t.app.request(
          `/api/v1/users/${guest.id}`,
          jsonRequest({ guestExpiresAt: null }, "PATCH"),
        )
      ).status,
    ).toBe(400);
  });

  it("offboards atomically, clears local grants/tokens and does not restore access on reactivation", async () => {
    t = createTestApp();
    const owner = { ...t.container.devActor };
    const member = seedMember("leaving");
    const project = await createProject(t.app);
    const source = await addSource(t.app, project.id);
    const db = t.container.db;
    db.insert(sourceAccess).values({ sourceId: source.id, userId: member.id }).run();
    db.insert(assignments)
      .values({
        id: randomUUID(),
        workspaceId: owner.workspaceId,
        userId: member.id,
        type: "domain_owner",
        scopeType: "project",
        scopeId: project.id,
      })
      .run();
    db.insert(oauthStates)
      .values({
        id: "pending-oauth",
        workspaceId: owner.workspaceId,
        userId: member.id,
        expiresAt: new Date(Date.now() + 600000),
      })
      .run();
    db.insert(connectorConnections)
      .values({
        id: "connection",
        workspaceId: owner.workspaceId,
        userId: member.id,
        provider: "google_drive",
        credentials: "encrypted-secret",
        accountId: "provider-account",
        scopes: [],
      })
      .run();
    expect(
      (
        await t.app.request(
          `/api/v1/users/${member.id}`,
          jsonRequest({ status: "offboarded" }, "PATCH"),
        )
      ).status,
    ).toBe(200);
    expect(db.select().from(sourceAccess).where(eq(sourceAccess.userId, member.id)).all()).toEqual(
      [],
    );
    expect(db.select().from(assignments).where(eq(assignments.userId, member.id)).all()).toEqual(
      [],
    );
    expect(db.select().from(oauthStates).where(eq(oauthStates.userId, member.id)).all()).toEqual(
      [],
    );
    const connection = db
      .select()
      .from(connectorConnections)
      .where(eq(connectorConnections.id, "connection"))
      .get();
    expect(connection?.credentials).toBe("");
    expect(connection?.status).toBe("needs_reauth");
    expect(
      db.select().from(domainEvents).where(eq(domainEvents.type, "user.offboarded")).get(),
    ).toBeDefined();
    Object.assign(t.container.devActor, member);
    expect((await t.app.request("/api/v1/users/me")).status).toBe(403);
    Object.assign(t.container.devActor, owner);
    expect(
      (
        await t.app.request(
          `/api/v1/users/${member.id}`,
          jsonRequest({ status: "active" }, "PATCH"),
        )
      ).status,
    ).toBe(200);
    Object.assign(t.container.devActor, member);
    expect((await t.app.request("/api/v1/users/me")).status).toBe(200);
    expect(
      (await t.app.request(`/api/v1/projects/${project.id}/sources/${source.id}`)).status,
    ).toBe(404);
    expect(
      db
        .select()
        .from(memberships)
        .where(
          and(eq(memberships.workspaceId, owner.workspaceId), eq(memberships.userId, member.id)),
        )
        .get()?.status,
    ).toBe("active");
  });
});
