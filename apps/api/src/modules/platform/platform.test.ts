import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnv } from "../../config/env.js";
import { auditLog, memberships, sourceAccess, users } from "../../db/schema.js";
import { openCredentials, sealCredentials } from "../../lib/credentials.js";
import {
  addSource,
  createFakeGemini,
  createProject,
  createTestApp,
  jsonRequest,
  SAMPLE_ANSWER,
  type TestApp,
} from "../../test/helpers.js";
import type { Actor } from "../../types.js";

describe("PRD platform access and workflows", () => {
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

  it("filters restricted sources before both retrieval paths, hides counts and protects Ask history", async () => {
    t = createTestApp();
    // A manager adds and asks: owners open every source, so they'd see everything below.
    const asker = actor("max", "manager");
    const project = await createProject(t.app);
    const source = await addSource(t.app, project.id);
    await t.drain();
    const response = await t.app.request(
      `/api/v1/projects/${project.id}/ask`,
      jsonRequest({ question: "Why is billing moving to the ledger service?" }),
    );
    expect(response.status).toBe(201);
    const calls = t.gemini.calls.filter((call) => call.purpose === "ask").length;
    actor("other-user", "admin");
    expect(
      (await t.app.request(`/api/v1/projects/${project.id}/sources/${source.id}`)).status,
    ).toBe(404);
    const sources = (await (
      await t.app.request(`/api/v1/projects/${project.id}/sources`)
    ).json()) as { items: unknown[] };
    expect(sources.items).toEqual([]);
    const history = (await (
      await t.app.request(`/api/v1/projects/${project.id}/questions`)
    ).json()) as { items: unknown[] };
    expect(history.items).toEqual([]);
    const ask = (await (
      await t.app.request(
        `/api/v1/projects/${project.id}/ask`,
        jsonRequest({ question: "Why is billing moving to the ledger service?" }),
      )
    ).json()) as { confidence: string };
    expect(ask.confidence).toBe("insufficient");
    expect(t.gemini.calls.filter((call) => call.purpose === "ask")).toHaveLength(calls);
    const detail = (await (await t.app.request(`/api/v1/projects/${project.id}`)).json()) as {
      stats: { sources: number; contextItems: number };
    };
    expect(detail.stats.sources).toBe(0);
    expect(detail.stats.contextItems).toBe(0);
    Object.assign(t.container.devActor, asker);
    t.container.db
      .delete(sourceAccess)
      .where(and(eq(sourceAccess.sourceId, source.id), eq(sourceAccess.userId, asker.id)))
      .run();
    const revokedHistory = (await (
      await t.app.request(`/api/v1/projects/${project.id}/questions`)
    ).json()) as { items: unknown[] };
    expect(revokedHistory.items).toEqual([]);
  });

  it("regenerates unsupported citations once, then returns insufficient evidence", async () => {
    t = createTestApp({
      gemini: createFakeGemini({
        answer: { ...SAMPLE_ANSWER, citations: [{ ref: 999, claim: "invalid" }] },
      }),
    });
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await t.drain();
    const response = (await (
      await t.app.request(
        `/api/v1/projects/${project.id}/ask`,
        jsonRequest({ question: "Why is billing moving to the ledger service?" }),
      )
    ).json()) as { confidence: string; citations: unknown[]; answer: string };
    expect(response.confidence).toBe("insufficient");
    expect(response.citations).toEqual([]);
    expect(t.gemini.calls.filter((call) => call.purpose === "ask")).toHaveLength(2);
  });

  it("blocks ordinary members from creating projects or verifying claims", async () => {
    t = createTestApp();
    const project = await createProject(t.app);
    actor("member");
    expect(
      (await t.app.request("/api/v1/projects", jsonRequest({ name: "Forbidden" }))).status,
    ).toBe(403);
    expect(
      (
        await t.app.request(
          `/api/v1/projects/${project.id}/context-items/${randomUUID()}/verification`,
          jsonRequest({ verification: "confirmed" }, "PATCH"),
        )
      ).status,
    ).toBe(403);
  });

  it("keeps thread ownership private and supports SSE final answers and deletion", async () => {
    t = createTestApp();
    const original = { ...t.container.devActor };
    const project = await createProject(t.app);
    const thread = (await (
      await t.app.request("/api/v1/ask/threads", jsonRequest({ projectId: project.id }))
    ).json()) as { id: string };
    const response = await t.app.request(
      `/api/v1/ask/threads/${thread.id}/messages`,
      jsonRequest({ question: "Who owns checkout?" }),
    );
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(await response.text()).toContain("event: answer");
    actor("other");
    expect((await t.app.request(`/api/v1/ask/threads/${thread.id}`)).status).toBe(404);
    Object.assign(t.container.devActor, original);
    expect(
      (await t.app.request(`/api/v1/ask/threads/${thread.id}`, { method: "DELETE" })).status,
    ).toBe(204);
    expect((await t.app.request(`/api/v1/ask/threads/${thread.id}`)).status).toBe(404);
  });

  it("requires independent path publication, preserves published versions and validates optimistic locking", async () => {
    t = createTestApp();
    const project = await createProject(t.app);
    const pathInput = {
      projectId: project.id,
      title: "Meet the team",
      roleFamily: "engineering",
      items: [
        {
          type: "meet",
          title: "Meet mentor",
          objective: "Understand ownership",
          required: false,
          verification: "self",
        },
      ],
    };
    const createdResponse = await t.app.request("/api/v1/learning/paths", jsonRequest(pathInput));
    expect(createdResponse.status).toBe(201);
    const path = (await createdResponse.json()) as { id: string; version: number };
    expect(
      (
        await t.app.request(
          `/api/v1/learning/paths/${path.id}/publish`,
          jsonRequest({ version: path.version }),
        )
      ).status,
    ).toBe(403);
    actor("reviewer", "admin");
    const published = (await (
      await t.app.request(
        `/api/v1/learning/paths/${path.id}/publish`,
        jsonRequest({ version: path.version }),
      )
    ).json()) as { data: { publishedVersionId: string }; version: number };
    expect(published.data.publishedVersionId).toBeTruthy();
    expect(
      (
        await t.app.request(
          `/api/v1/learning/paths/${path.id}`,
          jsonRequest({ ...pathInput, version: 1 }, "PUT"),
        )
      ).status,
    ).toBe(409);
    const mentor = actor("mentor");
    const learner = actor("learner", "member", "reviewer");
    actor("reviewer", "admin");
    const assigned = (await (
      await t.app.request(
        `/api/v1/learning/paths/${path.id}/assign`,
        jsonRequest({ userId: learner.id, mentorId: mentor.id, startDate: "2026-01-01" }),
      )
    ).json()) as { id: string };
    Object.assign(t.container.devActor, learner);
    const view = (await (
      await t.app.request(`/api/v1/learning/assignments/${assigned.id}/progress`)
    ).json()) as { path: { data: { items: Array<{ id: string }> } } };
    const itemId = view.path.data.items[0]!.id;
    const progress = (await (
      await t.app.request(`/api/v1/learning/assignments/${assigned.id}/items/${itemId}/start`, {
        method: "POST",
      })
    ).json()) as { version: number };
    const finished = (await (
      await t.app.request(
        `/api/v1/learning/assignments/${assigned.id}/items/${itemId}/attest`,
        jsonRequest({ version: progress.version }),
      )
    ).json()) as { status: string };
    expect(finished.status).toBe("completed");
  });

  it("prevents correction self-verification and invalid flag transitions", async () => {
    t = createTestApp();
    const project = await createProject(t.app);
    const flag = (await (
      await t.app.request(
        "/api/v1/flags",
        jsonRequest({
          projectId: project.id,
          targetType: "overview",
          targetId: project.id,
          kind: "missing_context",
        }),
      )
    ).json()) as { id: string; version: number };
    expect(
      (
        await t.app.request(
          `/api/v1/flags/${flag.id}`,
          jsonRequest({ version: flag.version, status: "resolved" }, "PATCH"),
        )
      ).status,
    ).toBe(409);
    const correction = (await (
      await t.app.request(
        `/api/v1/flags/${flag.id}/corrections`,
        jsonRequest({
          type: "contextos_note",
          text: "This is a proposed correction with enough context.",
        }),
      )
    ).json()) as { id: string; version: number };
    expect(
      (
        await t.app.request(
          `/api/v1/corrections/${correction.id}/verify`,
          jsonRequest({ version: correction.version, accepted: true, reason: "Self approval" }),
        )
      ).status,
    ).toBe(403);
  });

  it("keeps quiz answer keys private, enforces evidence checks, cooldowns and independent review", async () => {
    t = createTestApp();
    const author = { ...t.container.devActor };
    const project = await createProject(t.app);
    const source = await addSource(t.app, project.id);
    await t.drain();
    const contexts = (await (
      await t.app.request(`/api/v1/projects/${project.id}/context-items`)
    ).json()) as { items: Array<{ id: string }> };
    const claimId = contexts.items[0]!.id;
    const created = (await (
      await t.app.request(
        "/api/v1/learning/paths",
        jsonRequest({
          projectId: project.id,
          title: "Evidence quiz",
          roleFamily: "engineering",
          items: [
            {
              type: "quiz",
              title: "Understand the decision",
              objective: "Use verified source context",
              verification: "quiz",
              sourceId: source.id,
            },
          ],
        }),
      )
    ).json()) as { id: string; version: number; data: { items: Array<{ id: string }> } };
    const itemId = created.data.items[0]!.id;
    const definition = await t.app.request(
      `/api/v1/learning/paths/${created.id}/items/${itemId}/quiz`,
      jsonRequest({
        questions: [1, 2, 3].map((index) => ({
          prompt: `Question ${index}: which option matches the evidence?`,
          options: ["Correct", "Incorrect"],
          correctIndex: 0,
          claimId,
          explanation: "The source evidence supports the first option.",
        })),
      }),
    );
    expect(definition.status).toBe(201);
    const reviewer = actor("quiz-reviewer", "admin");
    t.container.db.insert(sourceAccess).values({ sourceId: source.id, userId: reviewer.id }).run();
    expect(
      (
        await t.app.request(
          `/api/v1/learning/paths/${created.id}/publish`,
          jsonRequest({ version: 2 }),
        )
      ).status,
    ).toBe(200);
    const learner = actor("quiz-learner");
    t.container.db.insert(sourceAccess).values({ sourceId: source.id, userId: learner.id }).run();
    Object.assign(t.container.devActor, reviewer);
    const assignment = (await (
      await t.app.request(
        `/api/v1/learning/paths/${created.id}/assign`,
        jsonRequest({ userId: learner.id, mentorId: author.id, startDate: "2026-01-01" }),
      )
    ).json()) as { id: string };
    Object.assign(t.container.devActor, learner);
    const prefix = `/api/v1/learning/assignments/${assignment.id}/items/${itemId}`;
    expect((await t.app.request(`${prefix}/start`, { method: "POST" })).status).toBe(201);
    const quizResponse = await t.app.request(`${prefix}/quiz`);
    expect(quizResponse.status).toBe(200);
    expect(await quizResponse.text()).not.toContain("correctIndex");
    const submit = async (version: number) =>
      t.app.request(`${prefix}/quiz/submit`, jsonRequest({ version, answers: [1, 1, 1] }));
    expect((await submit(1)).status).toBe(200);
    expect((await submit(2)).status).toBe(200);
    expect((await submit(3)).status).toBe(429);
    Object.assign(t.container.devActor, author);
    const managerView = await t.app.request(
      `/api/v1/learning/assignments/${assignment.id}/progress`,
    );
    expect(managerView.status).toBe(200);
    expect(await managerView.text()).not.toContain('"score"');
  });

  it("protects people-data from administrator access without a manager relationship", async () => {
    t = createTestApp();
    const project = await createProject(t.app);
    actor("mentor");
    actor("learner", "member", "manager");
    const manager = actor("manager", "manager");
    const created = await t.app.request(
      "/api/v1/probation/plans",
      jsonRequest({
        userId: "learner",
        mentorId: "mentor",
        projectId: project.id,
        startDate: "2026-01-01",
        milestones: [{ key: "first_win", title: "First win", dueOffsetDays: 30 }],
      }),
    );
    expect(created.status).toBe(201);
    actor("unrelated-admin", "admin");
    expect((await t.app.request("/api/v1/probation/employees/learner")).status).toBe(404);
    Object.assign(t.container.devActor, manager);
    expect((await t.app.request("/api/v1/probation/employees/learner")).status).toBe(200);
  });

  it("persists per-user companion preferences and respects disable", async () => {
    t = createTestApp();
    const result = await t.app.request(
      "/api/v1/companion/preferences",
      jsonRequest({ enabled: false }, "PATCH"),
    );
    expect(result.status).toBe(200);
    expect(
      (await t.app.request("/api/v1/companion/interactions", jsonRequest({ trigger: "opened" })))
        .status,
    ).toBe(403);
    const response = (await (await t.app.request("/api/v1/companion/preferences")).json()) as {
      enabled: boolean;
    };
    expect(response.enabled).toBe(false);
    expect(
      (await t.app.request("/api/v1/connectors/google-drive/authorize", { method: "POST" })).status,
    ).toBe(503);
  });

  it("makes audit rows immutable and generates hash-linked entries", async () => {
    t = createTestApp();
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    const entries = t.container.db.select().from(auditLog).all();
    expect(entries[0]!.entryHash).toHaveLength(64);
    expect(entries[1]!.previousHash).toBe(entries[0]!.entryHash);
    expect(() => t.container.db.delete(auditLog).run()).toThrow("append-only");
  });

  it("rejects development auth in production and authenticates encrypted credential binding", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() =>
      loadEnv({ NODE_ENV: "production", AUTH_MODE: "development", GEMINI_API_KEY: "test" }),
    ).toThrow("Invalid environment");
    log.mockRestore();
    const key = "a".repeat(64);
    const encrypted = sealCredentials(
      { refresh_token: "synthetic-secret" },
      key,
      "workspace:connection",
    );
    expect(encrypted).not.toContain("synthetic-secret");
    expect(openCredentials(encrypted, key, "workspace:connection").refresh_token).toBe(
      "synthetic-secret",
    );
    expect(() => openCredentials(encrypted, key, "other:connection")).toThrow();
  });
});
