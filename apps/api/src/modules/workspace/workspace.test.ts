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
    };
    expect(created.region).toBe("us-east-1");
    expect(created.primaryDomainVerified).toBe(false);
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

  it("lets People Ops run teams: add and remove people and set a lead, telling each person (N-9)", async () => {
    t = createTestApp();
    const workspaceId = t.container.workspace.id;
    Object.assign(t.container.devActor, seedMember("hana", "hr"));
    const department = await createDepartment();
    const created = await createTeam(department.id, "Platform");
    expect(created.status).toBe(201);
    const platform = (await created.json()) as { id: string; leadId: string | null };
    expect(platform.leadId).toBeNull();
    for (const id of ["ada", "bo", "cy"]) seedMember(id);
    const addPeople = (userIds: string[]) =>
      t.app.request(`/api/v1/org/teams/${platform.id}/members`, jsonRequest({ userIds }));
    const added = await addPeople(["ada", "bo", "cy", "ada"]);
    expect(added.status).toBe(200);
    expect(await added.json()).toEqual({ added: ["ada", "bo", "cy"] });
    expect(await (await addPeople(["ada"])).json()).toEqual({ added: [] });
    expect((await addPeople(["nobody"])).status).toBe(404);
    const organization = (userId: string) =>
      t.container.db
        .select()
        .from(memberships)
        .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)))
        .get()?.organization;
    // Joining a team puts them in its department too.
    expect(organization("bo")).toMatchObject({ departmentId: department.id, teamId: platform.id });

    const setLead = (leadId: string | null) =>
      t.app.request(`/api/v1/org/teams/${platform.id}`, jsonRequest({ leadId }, "PATCH"));
    const lead = await setLead("ada");
    expect(lead.status).toBe(200);
    expect(await lead.json()).toMatchObject({ leadId: "ada" });
    expect((await setLead("nobody")).status).toBe(404);
    const listed = (await (await t.app.request("/api/v1/org/teams")).json()) as {
      items: Array<{ id: string; leadId: string | null }>;
    };
    expect(listed.items).toEqual([expect.objectContaining({ id: platform.id, leadId: "ada" })]);

    const removeCy = () =>
      t.app.request(`/api/v1/org/teams/${platform.id}/members/cy`, { method: "DELETE" });
    expect((await removeCy()).status).toBe(204);
    expect(organization("cy")).toMatchObject({ departmentId: department.id, teamId: null });
    expect((await removeCy()).status).toBe(404);

    const titles = (userId: string) =>
      t.container.store
        .listWhere(workspaceId, "notification", { ownerId: userId }, 20)
        .map((row) => row.data.title);
    expect(titles("ada")).toEqual(
      expect.arrayContaining([
        "You're now on the Platform team",
        "You're now the lead of the Platform team",
      ]),
    );
    expect(titles("bo")).toEqual(["You're now on the Platform team"]);
    expect(titles("cy")).toContain("You're no longer on the Platform team");
    expect(titles("hana")).toEqual([]);

    Object.assign(t.container.devActor, seedMember("mo", "manager"));
    expect((await addPeople(["mo"])).status).toBe(403);
    expect((await setLead(null)).status).toBe(403);
  });

  it("keeps the company profile and confirms the first setup steps from what exists (N-7)", async () => {
    t = createTestApp();
    const evidence = async () =>
      (
        (await (await t.app.request("/api/v1/workspaces/current/setup")).json()) as {
          evidence: { completed: Record<string, boolean> };
        }
      ).evidence.completed;
    expect(await evidence()).toMatchObject({ company_profile: false, org_structure: false });

    const profile = {
      description: "Fleet telematics for logistics companies.",
      products: "Tracker, Route planner",
      workingHours: "Mon–Fri 9–17:30 UK, hybrid",
    };
    const saved = await t.app.request(
      "/api/v1/workspaces/current/company",
      jsonRequest(profile, "PUT"),
    );
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual(profile);
    const current = (await (await t.app.request("/api/v1/workspaces/current")).json()) as {
      settings: { company: unknown };
    };
    expect(current.settings.company).toEqual(profile);
    const department = await createDepartment();
    expect(await evidence()).toMatchObject({ company_profile: true, org_structure: false });
    await createTeam(department.id, "Platform");
    expect(await evidence()).toMatchObject({ company_profile: true, org_structure: true });

    // Everyone can read it; only owners and admins change it.
    Object.assign(t.container.devActor, seedMember("mia", "member"));
    expect(await (await t.app.request("/api/v1/workspaces/current/company")).json()).toEqual(
      profile,
    );
    expect(
      (
        await t.app.request(
          "/api/v1/workspaces/current/company",
          jsonRequest({ ...profile, description: "" }, "PUT"),
        )
      ).status,
    ).toBe(403);
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
