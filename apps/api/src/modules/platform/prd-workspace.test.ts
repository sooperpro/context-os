import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { memberships, users } from "../../db/schema.js";
import {
  addSource,
  createProject,
  createTestApp,
  jsonRequest,
  type TestApp,
} from "../../test/helpers.js";
import type { Actor } from "../../types.js";

describe("PRD workspace settings, directory, identity links, slugs, hub sections and search", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const actor = (id: string, role: Actor["role"] = "member", managerId?: string) => {
    t.container.db.insert(users).values({ id, name: id }).onConflictDoNothing().run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: id, role, managerId })
      .onConflictDoNothing()
      .run();
    Object.assign(t.container.devActor, { id, name: id, role });
    return { ...t.container.devActor };
  };
  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

  it("exposes resolved settings, merges section patches, enforces the k-anonymity floor and schedules deletion", async () => {
    t = createTestApp();
    const current = await json<{
      version: number;
      name: string;
      slug: string | null;
      settings: { gamification: { enabled: boolean }; rewards: { enabled: boolean } };
      activeModules: { rewards: boolean; epm: boolean };
    }>(await t.app.request("/api/v1/workspaces/current"));
    expect(current.settings.gamification.enabled).toBe(true);
    expect(current.activeModules).toMatchObject({ rewards: false, epm: false });
    const updated = await t.app.request(
      "/api/v1/workspaces/current/settings",
      jsonRequest(
        {
          version: current.version,
          rewards: { enabled: true },
          policies: { probationDefaultDays: 60 },
        },
        "PATCH",
      ),
    );
    expect(updated.status).toBe(200);
    const body = await json<{
      version: number;
      settings: {
        rewards: { enabled: boolean; kcPerRp: number };
        policies: { probationDefaultDays: number; askKAnonymityThreshold: number };
      };
    }>(updated);
    expect(body.settings.rewards).toMatchObject({ enabled: true, kcPerRp: 0.1 });
    expect(body.settings.policies).toMatchObject({
      probationDefaultDays: 60,
      askKAnonymityThreshold: 3,
    });
    expect(
      (
        await t.app.request(
          "/api/v1/workspaces/current/settings",
          jsonRequest({ version: body.version, policies: { askKAnonymityThreshold: 2 } }, "PATCH"),
        )
      ).status,
    ).toBe(400);
    expect(
      (await t.app.request("/api/v1/workspaces/current/deletion", jsonRequest({ confirm: "nope" })))
        .status,
    ).toBe(400);
    expect(
      (
        await t.app.request(
          "/api/v1/workspaces/current/deletion",
          jsonRequest({ confirm: current.slug ?? current.name }),
        )
      ).status,
    ).toBe(202);
    const scheduled = await json<{ settings: { deletion: { scheduledAt: string } | null } }>(
      await t.app.request("/api/v1/workspaces/current"),
    );
    expect(scheduled.settings.deletion?.scheduledAt).toBeTruthy();
    expect(
      (await t.app.request("/api/v1/workspaces/current/deletion", { method: "DELETE" })).status,
    ).toBe(204);
    actor("plain-member");
    expect(
      (
        await t.app.request(
          "/api/v1/workspaces/current/deletion",
          jsonRequest({ confirm: current.name }),
        )
      ).status,
    ).toBe(403);
  });

  it("filters the directory, records bulk invitations locally and refuses manager invites", async () => {
    t = createTestApp();
    const owner = { ...t.container.devActor };
    actor("alice");
    actor("bob", "manager");
    Object.assign(t.container.devActor, owner);
    const department = await json<{ id: string }>(
      await t.app.request("/api/v1/org/departments", jsonRequest({ name: "Engineering" })),
    );
    await t.app.request(
      "/api/v1/users/alice/organization",
      jsonRequest({ departmentId: department.id, jobTitle: "Engineer" }, "PATCH"),
    );
    const byDepartment = await json<{ items: Array<{ id: string; tier: string | null }> }>(
      await t.app.request(`/api/v1/users?departmentId=${department.id}`),
    );
    expect(byDepartment.items.map((user) => user.id)).toEqual(["alice"]);
    expect(byDepartment.items[0]?.tier).toBe("explorer");
    const byQuery = await json<{ items: Array<{ id: string }> }>(
      await t.app.request("/api/v1/users?q=engineer"),
    );
    expect(byQuery.items.map((user) => user.id)).toEqual(["alice"]);
    const byRole = await json<{ items: Array<{ id: string }> }>(
      await t.app.request("/api/v1/users?role=manager"),
    );
    expect(byRole.items.map((user) => user.id)).toEqual(["bob"]);

    const invited = await t.app.request(
      "/api/v1/users/invite",
      jsonRequest({
        invitations: [
          {
            email: "new@example.com",
            role: "member",
            departmentId: department.id,
            isNewHire: true,
          },
          { email: "second@example.com", role: "guest" },
        ],
      }),
    );
    expect(invited.status).toBe(201);
    const result = await json<{
      items: Array<{ email: string; status: string; delivery: string; invitationId: string }>;
    }>(invited);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      email: "new@example.com",
      status: "pending",
      delivery: "local",
    });
    const again = await json<{ status: string; invitationId: string }>(
      await t.app.request("/api/v1/users/invite", jsonRequest({ email: "New@example.com" })),
    );
    expect(again.invitationId).toBe(result.items[0]!.invitationId);
    const list = await json<{ items: unknown[] }>(await t.app.request("/api/v1/users/invitations"));
    expect(list.items).toHaveLength(2);
    expect(
      (
        await t.app.request(`/api/v1/users/invitations/${result.items[0]!.invitationId}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(204);
    // Managers get no member or role powers (role access spec §3, decision 3).
    actor("bob", "manager");
    expect(
      (await t.app.request("/api/v1/users/invite", jsonRequest({ email: "x@example.com" }))).status,
    ).toBe(403);
  });

  it("links identities with admin confirmation, OAuth requirement for Google and symmetric unlinking", async () => {
    t = createTestApp();
    const owner = { ...t.container.devActor };
    expect(
      (await t.app.request("/api/v1/users/identities/link", jsonRequest({ provider: "google" })))
        .status,
    ).toBe(503);
    const link = await json<{ status: string; source: string; provider: string }>(
      await t.app.request(
        "/api/v1/users/identities/link",
        jsonRequest({ provider: "github", externalLogin: "octocat" }),
      ),
    );
    expect(link).toMatchObject({ status: "suggested", source: "user", provider: "github" });
    expect(
      (
        await t.app.request(
          "/api/v1/users/identities/github",
          jsonRequest({ status: "confirmed" }, "PATCH"),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await t.app.request(
          `/api/v1/users/${owner.id}/identities/github`,
          jsonRequest({ status: "confirmed" }, "PATCH"),
        )
      ).status,
    ).toBe(200);
    const me = await json<{
      identities: Array<{ provider: string; status: string; externalLogin: string | null }>;
    }>(await t.app.request("/api/v1/users/me"));
    expect(me.identities).toMatchObject([
      { provider: "github", status: "confirmed", externalLogin: "octocat" },
    ]);
    actor("alice");
    Object.assign(t.container.devActor, owner);
    expect(
      (
        await t.app.request(
          "/api/v1/users/alice/identities",
          jsonRequest({ provider: "slack", externalId: "U123" }),
        )
      ).status,
    ).toBe(201);
    const unlinked = await json<{
      pending: unknown[];
      membersWithoutLinks: Array<{ id: string; missingProviders: string[] }>;
    }>(await t.app.request("/api/v1/users/identities/unlinked"));
    expect(unlinked.pending).toHaveLength(1);
    expect(
      unlinked.membersWithoutLinks.find((member) => member.id === owner.id)?.missingProviders,
    ).not.toContain("github");
    Object.assign(t.container.devActor, { id: "alice", name: "alice", role: "member" });
    expect(
      (
        await t.app.request(
          "/api/v1/users/identities/slack",
          jsonRequest({ status: "confirmed" }, "PATCH"),
        )
      ).status,
    ).toBe(200);
    // Another member cannot claim an identity that is already confirmed.
    Object.assign(t.container.devActor, owner);
    expect(
      (
        await t.app.request(
          "/api/v1/users/identities/link",
          jsonRequest({ provider: "slack", externalId: "U123" }),
        )
      ).status,
    ).toBe(409);
    Object.assign(t.container.devActor, { id: "alice", name: "alice", role: "member" });
    expect(
      (await t.app.request("/api/v1/users/identities/slack", { method: "DELETE" })).status,
    ).toBe(204);
  });

  it("addresses projects by slug, generates unique slugs and rejects duplicates", async () => {
    t = createTestApp();
    const first = await createProject(t.app, "Payments Platform");
    const second = await createProject(t.app, "Payments Platform");
    expect(first.slug).toBe("payments-platform");
    expect(second.slug).toBe("payments-platform-2");
    const bySlug = await t.app.request("/api/v1/projects/payments-platform");
    expect(bySlug.status).toBe(200);
    expect((await json<{ id: string }>(bySlug)).id).toBe(first.id);
    expect(
      (
        await t.app.request(
          `/api/v1/projects/${second.id}`,
          jsonRequest({ slug: "payments-platform" }, "PATCH"),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await t.app.request(
          `/api/v1/projects/${second.id}`,
          jsonRequest({ slug: "billing" }, "PATCH"),
        )
      ).status,
    ).toBe(200);
    expect((await t.app.request("/api/v1/projects/billing/hub")).status).toBe(200);
  });

  it("renders the ten hub sections with honest empty states, KHS, team and evidence drawer payloads", async () => {
    t = createTestApp();
    const project = await createProject(t.app);
    const empty = await json<{ status: string; emptyState: { message: string } | null }>(
      await t.app.request(`/api/v1/projects/${project.id}/sections/decisions`),
    );
    expect(empty.status).toBe("empty");
    expect(empty.emptyState?.message).toContain("Not enough source evidence");
    await addSource(t.app, project.id);
    await t.drain();
    const sections = await json<{
      khs: { score: number };
      items: Array<{
        key: string;
        status: string;
        claims: number;
        domainOwner: { scope: string } | null;
      }>;
    }>(await t.app.request(`/api/v1/projects/${project.id}/sections`));
    expect(sections.items).toHaveLength(10);
    const decisions = sections.items.find((section) => section.key === "decisions")!;
    expect(decisions).toMatchObject({ status: "ready", claims: 1 });
    expect(decisions.domainOwner?.scope).toBe("workspace");
    const glossary = await json<{
      content: { terms: Array<{ chip: string }> };
      coverage: { sources: number; tools: string[] };
    }>(await t.app.request(`/api/v1/projects/${project.id}/sections/glossary`));
    expect(glossary.content.terms[0]?.chip).toBe("Inferred");
    expect(glossary.coverage).toMatchObject({ sources: 1, tools: ["manual"] });
    const state = await json<{ content: { blockers: unknown[]; asOf: string | null } }>(
      await t.app.request(`/api/v1/projects/${project.id}/sections/current_state`),
    );
    expect(state.content.blockers).toHaveLength(1);
    expect((await t.app.request(`/api/v1/projects/${project.id}/sections/nope`)).status).toBe(400);
    const health = await json<{
      score: number;
      components: { verifiedRatio: number };
      improvements: unknown[];
    }>(await t.app.request(`/api/v1/projects/${project.id}/health`));
    expect(health.score).toBeGreaterThan(0);
    expect(health.components.verifiedRatio).toBe(0);
    const hub = await json<{
      khs: { score: number } | null;
      sections: unknown[];
      team: Array<{ assignments: string[] }>;
    }>(await t.app.request(`/api/v1/projects/${project.id}/hub`));
    expect(hub.sections).toHaveLength(10);
    expect(hub.team.some((member) => member.assignments.includes("hub_owner"))).toBe(true);
    const items = await json<{ items: Array<{ id: string; evidence: Array<{ id: string }> }> }>(
      await t.app.request(`/api/v1/projects/${project.id}/context-items?kind=decision`),
    );
    await t.app.request(
      `/api/v1/projects/${project.id}/context-items/${items.items[0]!.id}/verification`,
      jsonRequest({ verification: "confirmed" }, "PATCH"),
    );
    const verified = await json<{ components: { verifiedRatio: number } }>(
      await t.app.request(`/api/v1/projects/${project.id}/health`),
    );
    expect(verified.components.verifiedRatio).toBeGreaterThan(0);
    const evidenceId = items.items[0]!.evidence[0]!.id;
    const evidence = await t.app.request(`/api/v1/evidence/${evidenceId}`);
    expect(evidence.status).toBe(200);
    const drawer = await json<{
      quote: string;
      span: number[] | null;
      chunk: { content: string } | null;
      source: { title: string };
    }>(evidence);
    expect(drawer.span).not.toBeNull();
    expect(drawer.chunk?.content.toLowerCase()).toContain(drawer.quote.slice(0, 12).toLowerCase());
    actor("stranger", "admin");
    expect((await t.app.request(`/api/v1/evidence/${evidenceId}`)).status).toBe(404);
  });

  it("searches across accessible projects with facets and serves analytics, export and audit CSV to admins", async () => {
    t = createTestApp();
    const project = await createProject(t.app, "Atlas");
    await addSource(t.app, project.id);
    await t.drain();
    const search = await json<{
      total: number;
      facets: Record<string, number>;
      items: Array<{ type: string }>;
    }>(await t.app.request("/api/v1/search?q=ledger"));
    expect(search.facets.context_item).toBeGreaterThan(0);
    expect(search.facets.source).toBeGreaterThan(0);
    const projectsOnly = await json<{ items: Array<{ type: string }> }>(
      await t.app.request("/api/v1/search?q=atlas&types=project"),
    );
    expect(projectsOnly.items).toEqual([expect.objectContaining({ type: "project" })]);
    const analytics = await json<{ knowledgeHealth: unknown[]; ask: { volume: number } }>(
      await t.app.request("/api/v1/analytics/overview"),
    );
    expect(analytics.knowledgeHealth).toHaveLength(1);
    const csv = await t.app.request("/api/v1/analytics/overview?format=csv");
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(await csv.text()).toContain("khs:atlas");
    const exported = await t.app.request("/api/v1/admin/export");
    expect(exported.status).toBe(200);
    expect((await json<{ projects: unknown[] }>(exported)).projects).toHaveLength(1);
    const audit = await t.app.request("/api/v1/audit?format=csv&action=project.create");
    expect(audit.headers.get("content-type")).toContain("text/csv");
    expect(await audit.text()).toContain("project.create");
    actor("member");
    expect((await t.app.request("/api/v1/analytics/overview")).status).toBe(403);
    expect((await t.app.request("/api/v1/admin/export")).status).toBe(403);
    expect(t.container.db.select().from(users).where(eq(users.id, "system")).get()).toBeDefined();
  });
});
