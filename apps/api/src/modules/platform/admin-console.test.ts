import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { auditLog, memberships, platformRecords, questions, users } from "../../db/schema.js";
import {
  addSource,
  createProject,
  createTestApp,
  EMPTY_EXTRACTION,
  jsonRequest,
  createFakeGemini,
  type TestApp,
} from "../../test/helpers.js";

interface AiSettings {
  stats: { helpfulRate: number; withSources: number; noAnswer: number; ratings: number };
  rules: Array<{ id: string; enabled: boolean; locked: boolean }>;
  strictness: string;
  unhelpfulReasons: Array<{ reason: string; share: number }>;
  unanswered: Array<{ question: string; asks: number; routedTo: string }>;
}

describe("Admin overview, AI settings and saved knowledge", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;
  const as = (id: string, role: "owner" | "member") => {
    t.container.db.insert(users).values({ id, name: id }).onConflictDoNothing().run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: id, role })
      .onConflictDoNothing()
      .run();
    Object.assign(t.container.devActor, { id, name: id, role });
  };

  it("saves and unsaves items the person can open, newest first", async () => {
    t = createTestApp();
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();
    const items = await json<{ items: Array<{ id: string }> }>(
      await t.app.request(`/api/v1/projects/${project.id}/context-items`),
    );
    const item = items.items[0]!;
    const save = (targetId: string, body: Record<string, unknown>) =>
      t.app.request(`/api/v1/me/saved/${targetId}`, jsonRequest(body, "PUT"));

    expect(
      await json(
        await save(item.id, { targetType: "context_item", projectId: project.id, saved: true }),
      ),
    ).toMatchObject({ targetType: "context_item", targetId: item.id, projectId: project.id });
    // A slug works as the project reference, and the entry is stored by id.
    await save(project.slug!, { targetType: "project", projectId: project.slug!, saved: true });
    const listed = await json<{ items: Array<{ targetType: string; targetId: string }> }>(
      await t.app.request("/api/v1/me/saved"),
    );
    expect(listed.items.map((entry) => [entry.targetType, entry.targetId])).toEqual([
      ["project", project.id],
      ["context_item", item.id],
    ]);

    // Unsaving answers null; unknown targets are 404 and nothing is stored for them.
    expect(
      await json(
        await save(item.id, { targetType: "context_item", projectId: project.id, saved: false }),
      ),
    ).toBeNull();
    expect(
      (
        await save("11111111-1111-4111-8111-111111111111", {
          targetType: "context_item",
          projectId: project.id,
          saved: true,
        })
      ).status,
    ).toBe(404);
    expect(
      (await json<{ items: unknown[] }>(await t.app.request("/api/v1/me/saved"))).items,
    ).toHaveLength(1);

    // Saves are personal.
    as("someone-else", "member");
    expect(
      (await json<{ items: unknown[] }>(await t.app.request("/api/v1/me/saved"))).items,
    ).toEqual([]);
  });

  it("reports security and sync activity to admins only", async () => {
    t = createTestApp();
    const security = await json<{ items: Array<{ id: string; value: string; state: string }> }>(
      await t.app.request("/api/v1/admin/security"),
    );
    expect(security.items.map((item) => item.id)).toEqual([
      "sso",
      "scim",
      "access_policies",
      "role_requests",
      "data_retention",
    ]);
    expect(security.items[0]).toMatchObject({ state: "attention" });
    expect(security.items[4]?.value).toBe("Ask history 180 days · audit log 365 days");
    expect(await json(await t.app.request("/api/v1/admin/sync-runs"))).toEqual({ items: [] });

    as("member-1", "member");
    for (const path of ["security", "sync-runs", "ai", "ai-settings", "connectors"])
      expect((await t.app.request(`/api/v1/admin/${path}`)).status).toBe(403);
  });

  it("stores AI settings, keeps locked rules fixed and rates answers from real feedback", async () => {
    t = createTestApp({
      gemini: createFakeGemini({ extraction: EMPTY_EXTRACTION }),
    });
    const project = await createProject(t.app, "Billing");
    await addSource(t.app, project.id);
    await t.drain();
    const answer = await json<{ id: string }>(
      await t.app.request(
        `/api/v1/projects/${project.id}/ask`,
        jsonRequest({ question: "Why is billing moving to the ledger service?" }),
      ),
    );
    await t.app.request(
      `/api/v1/ask/messages/${answer.id}/feedback`,
      jsonRequest({ rating: "down", reason: "outdated" }),
    );

    const settings = await json<AiSettings>(await t.app.request("/api/v1/admin/ai-settings"));
    expect(settings.stats).toMatchObject({ ratings: 1, helpfulRate: 0, withSources: 1 });
    expect(settings.unhelpfulReasons).toEqual([{ reason: "Out of date", share: 1 }]);
    expect(settings.rules.find((rule) => rule.id === "access_only")).toMatchObject({
      enabled: true,
      locked: true,
    });

    const patch = (body: Record<string, unknown>) =>
      t.app.request("/api/v1/admin/ai-settings", jsonRequest(body, "PATCH"));
    expect((await patch({ rules: { include_dms: true } })).status).toBe(409);
    const changed = await json<AiSettings>(
      await patch({ rules: { cite_sources: false }, strictness: "strict" }),
    );
    expect(changed.strictness).toBe("strict");
    expect(changed.rules.find((rule) => rule.id === "cite_sources")?.enabled).toBe(false);
    const overview = await json<{ settings: Array<{ id: string; enabled: boolean }> }>(
      await t.app.request("/api/v1/admin/ai"),
    );
    expect(overview.settings.map((rule) => rule.id)).not.toContain("pause_during_checks");
    expect(overview.settings.find((rule) => rule.id === "cite_sources")?.enabled).toBe(false);
    expect(
      t.container.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "ai.settings.update"))
        .all()
        .map((row) => (row.metadata as { setting: string }).setting)
        .sort(),
    ).toEqual(["cite_sources", "strictness"]);
  });

  it("lists unanswered questions only once enough people asked, or someone reported them", async () => {
    t = createTestApp();
    const project = await createProject(t.app, "Billing");
    const insufficient = (actorId: string, question: string) =>
      t.container.db
        .insert(questions)
        .values({
          id: crypto.randomUUID(),
          projectId: project.id,
          question,
          answer: {
            id: crypto.randomUUID(),
            projectId: project.id,
            question,
            answer: "Not enough evidence.",
            confidence: "insufficient",
            rationale: null,
            currentState: null,
            timelineContext: null,
            uncertainties: [],
            citations: [],
            relatedItems: [],
            model: "fake",
            createdAt: new Date().toISOString(),
          },
          model: "fake",
          actorId,
          sourceIds: [],
        })
        .run();
    insufficient("a", "How do I roll back a deploy?");
    insufficient("a", "How do I roll back a deploy?");
    insufficient("b", "Where is the travel policy?");
    insufficient("c", "where is the travel policy?");
    insufficient("d", "Where is the travel policy? ");
    await t.app.request(
      "/api/v1/assistant/gaps",
      jsonRequest({ question: "Who approves vendor contracts?" }),
    );

    const settings = await json<AiSettings>(await t.app.request("/api/v1/admin/ai-settings"));
    expect(settings.unanswered).toEqual([
      { question: "Where is the travel policy?", asks: 3, routedTo: "Billing" },
      { question: "Who approves vendor contracts?", asks: 1, routedTo: "Workspace admins" },
    ]);
    expect(
      t.container.db
        .select()
        .from(platformRecords)
        .where(eq(platformRecords.kind, "knowledge_gap"))
        .all(),
    ).toHaveLength(1);
  });
});
