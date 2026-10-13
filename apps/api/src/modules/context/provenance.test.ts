import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { assignments, contextItems, memberships, sourceAccess, users } from "../../db/schema.js";
import {
  addSource,
  createFakeGemini,
  createProject,
  createTestApp,
  EMPTY_EXTRACTION,
  jsonRequest,
  type TestApp,
} from "../../test/helpers.js";

describe("derived-content provenance privacy", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const reader = () => {
    const actor = {
      ...t.container.devActor,
      id: "reader",
      name: "Reader",
      role: "member" as const,
    };
    t.container.db.insert(users).values({ id: actor.id, name: actor.name }).run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: actor.workspaceId, userId: actor.id, role: actor.role })
      .run();
    return actor;
  };

  it("does not reveal restricted conflicting claim IDs", async () => {
    t = createTestApp({
      gemini: createFakeGemini({
        extraction: (request) => ({
          ...EMPTY_EXTRACTION,
          statusClaims: [
            {
              title: "Migration",
              summary: "Migration status",
              state: request.prompt.includes("now active") ? "active" : "blocked",
              asOf: "2026-10-13",
              evidenceQuote: request.prompt.includes("now active")
                ? "Migration is now active."
                : "Migration is currently blocked.",
              confidence: "high",
            },
          ],
        }),
      }),
    });
    const project = await createProject(t.app);
    const visible = await addSource(t.app, project.id, {
      kind: "document",
      title: "Visible status",
      content: "Migration is currently blocked.",
    });
    await addSource(t.app, project.id, {
      kind: "document",
      title: "Private status",
      content: "Migration is now active.",
    });
    await t.drain();
    const actor = reader();
    t.container.db.insert(sourceAccess).values({ sourceId: visible.id, userId: actor.id }).run();
    Object.assign(t.container.devActor, actor);
    const response = (await (
      await t.app.request(`/api/v1/projects/${project.id}/context-items?kind=status_claim`)
    ).json()) as { items: Array<{ conflictsWith: string[] }> };
    expect(response.items).toHaveLength(1);
    expect(response.items[0]?.conflictsWith).toEqual([]);
  });

  it("keeps merged prose and old hub snapshots hidden after a contributing private source is deleted", async () => {
    t = createTestApp({
      gemini: createFakeGemini({
        extraction: (request) => ({
          ...EMPTY_EXTRACTION,
          components: [
            {
              name: "Billing module",
              summary: request.prompt.includes("Highly restricted")
                ? "Billing module uses a highly restricted confidential budget of $700000 for the confidential Phoenix project, with non-public financial review details."
                : "Billing module exists.",
              componentType: "service",
              evidenceQuote: "This project uses the billing module.",
              confidence: "high",
            },
          ],
        }),
      }),
    });
    const owner = { ...t.container.devActor };
    const project = await createProject(t.app);
    const privateSource = await addSource(t.app, project.id, {
      kind: "document",
      title: "Private budget",
      content: "This project uses the billing module. Highly restricted financial details.",
    });
    await addSource(t.app, project.id, {
      kind: "document",
      title: "Public description",
      content: "This project uses the billing module.",
      visibility: "workspace",
    });
    await t.drain();
    const actor = reader();
    Object.assign(t.container.devActor, actor);
    const before = (await (
      await t.app.request(`/api/v1/projects/${project.id}/context-items`)
    ).json()) as { items: unknown[] };
    expect(before.items).toEqual([]);
    Object.assign(t.container.devActor, owner);
    expect(
      (
        await t.app.request(`/api/v1/projects/${project.id}/sources/${privateSource.id}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(204);
    const ownerHub = (await (await t.app.request(`/api/v1/projects/${project.id}/hub`)).json()) as {
      overview: unknown;
    };
    expect(ownerHub.overview).toBeNull();
    Object.assign(t.container.devActor, actor);
    const after = (await (
      await t.app.request(`/api/v1/projects/${project.id}/context-items`)
    ).json()) as { items: unknown[] };
    expect(after.items).toEqual([]);
    const projectView = (await (await t.app.request(`/api/v1/projects/${project.id}`)).json()) as {
      stats: { contextItems: number };
    };
    expect(projectView.stats.contextItems).toBe(0);
    const retained = t.container.db
      .select()
      .from(contextItems)
      .where(and(eq(contextItems.projectId, project.id), eq(contextItems.kind, "component")))
      .get();
    expect(retained?.data._generationSources).toContain(privateSource.id);
    await t.drain();
    const hub = (await (await t.app.request(`/api/v1/projects/${project.id}/hub`)).json()) as {
      overview: unknown;
    };
    expect(hub.overview).toBeNull();
  });
  it("redacts generated learning items unless all contributing sources are readable", async () => {
    t = createTestApp({
      gemini: createFakeGemini({
        extraction: (request) => ({
          ...EMPTY_EXTRACTION,
          components: [
            {
              name: "Billing module",
              summary: request.prompt.includes("Highly restricted")
                ? "Billing module has highly restricted confidential financial planning details that must never be rendered from only its public description."
                : "Billing module exists.",
              componentType: "service",
              evidenceQuote: "This project uses the billing module.",
              confidence: "high",
            },
          ],
        }),
      }),
    });
    const project = await createProject(t.app);
    await addSource(t.app, project.id, {
      kind: "document",
      title: "Public description",
      content: "This project uses the billing module.",
      visibility: "workspace",
    });
    const privateSource = await addSource(t.app, project.id, {
      kind: "document",
      title: "Private details",
      content: "This project uses the billing module. Highly restricted information.",
    });
    await t.drain();
    const generatedResponse = await t.app.request(
      "/api/v1/learning/paths/generate",
      jsonRequest({ projectId: project.id, roleFamily: "Eng", title: "Onboarding" }),
    );
    expect(generatedResponse.status).toBe(201);
    const path = (await generatedResponse.json()) as {
      id: string;
      version: number;
      data: { items: Array<{ sourceIds: string[] }> };
    };
    expect(path.data.items[0]?.sourceIds).toHaveLength(2);
    const reviewer = {
      ...t.container.devActor,
      id: "reviewer",
      name: "Reviewer",
      role: "admin" as const,
    };
    t.container.db.insert(users).values({ id: reviewer.id, name: reviewer.name }).run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: reviewer.workspaceId, userId: reviewer.id, role: reviewer.role })
      .run();
    t.container.db
      .insert(sourceAccess)
      .values({ sourceId: privateSource.id, userId: reviewer.id })
      .run();
    Object.assign(t.container.devActor, reviewer);
    expect(
      (
        await t.app.request(
          `/api/v1/learning/paths/${path.id}/publish`,
          jsonRequest({ version: path.version }),
        )
      ).status,
    ).toBe(200);
    Object.assign(t.container.devActor, reader());
    const rendered = (await (await t.app.request(`/api/v1/learning/paths/${path.id}`)).json()) as {
      data: { items: Array<{ accessible: boolean; objective: string }> };
    };
    expect(rendered.data.items[0]?.accessible).toBe(false);
    expect(JSON.stringify(rendered)).not.toContain("confidential financial");
  });

  it("does not expose overview flag comments to domain owners without their source access", async () => {
    t = createTestApp();
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    const flagResponse = await t.app.request(
      "/api/v1/flags",
      jsonRequest({
        projectId: project.id,
        targetType: "overview",
        targetId: project.id,
        kind: "incorrect",
        comment: "Private details in a maintenance report",
      }),
    );
    expect(flagResponse.status).toBe(201);
    const actor = reader();
    t.container.db
      .insert(assignments)
      .values({
        id: "reader-domain",
        workspaceId: actor.workspaceId,
        userId: actor.id,
        type: "domain_owner",
        scopeType: "workspace",
        scopeId: actor.workspaceId,
      })
      .run();
    Object.assign(t.container.devActor, actor);
    const queue = (await (await t.app.request("/api/v1/flags/queue")).json()) as {
      items: unknown[];
    };
    expect(queue.items).toEqual([]);
  });
});
