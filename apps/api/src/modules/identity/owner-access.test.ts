import { randomUUID } from "node:crypto";
import { PersonConversationsSchema, SourceListSchema } from "@contextos/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  askThreads,
  auditLog,
  memberships,
  questions,
  threadMessages,
  users,
} from "../../db/schema.js";
import { addSource, createProject, createTestApp, type TestApp } from "../../test/helpers.js";
import type { Actor } from "../../types.js";
import { auditRowFor } from "../audit/audit.service.js";

/** Owners see everything in their workspace (decided 16 Oct 2026); admins keep narrower rules. */
describe("Owner access", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const member = (id: string, role: Actor["role"]) => {
    t.container.db.insert(users).values({ id, name: id }).onConflictDoNothing().run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: id, role })
      .onConflictDoNothing()
      .run();
  };
  const as = (id: string) => Object.assign(t.container.devActor, { id, name: id });
  const sourceIds = async (projectId: string) =>
    SourceListSchema.parse(
      await (await t.app.request(`/api/v1/projects/${projectId}/sources`)).json(),
    ).items.map((source) => source.id);

  it("opens sources nobody shared with them, which admins can't", async () => {
    t = createTestApp();
    const project = await createProject(t.app);
    member("max", "manager");
    member("ada", "admin");
    member("olga", "owner");
    // A pasted source is private to whoever added it.
    as("max");
    const source = await addSource(t.app, project.id);
    as("ada");
    expect(await sourceIds(project.id)).not.toContain(source.id);
    as("olga");
    expect(await sourceIds(project.id)).toContain(source.id);
  });

  it("gives owners People Ops pages and details, not admins", async () => {
    t = createTestApp();
    member("ada", "admin");
    member("olga", "owner");
    as("ada");
    expect((await t.app.request("/api/v1/people-ops/overview")).status).toBe(403);
    as("olga");
    expect((await t.app.request("/api/v1/people-ops/overview")).status).toBe(200);
    expect((await t.app.request("/api/v1/people-ops/onboardings")).status).toBe(200);

    const row = { action: "checkin.record", metadata: { pulse: 2, type: "weekly" } };
    expect(auditRowFor({ role: "owner" }, row).metadata).toEqual({ pulse: 2, type: "weekly" });
    expect(auditRowFor({ role: "admin" }, row).metadata).toEqual({ type: "weekly" });
  });

  it("lets owners read a member's conversations, and audits each read", async () => {
    t = createTestApp();
    const project = await createProject(t.app);
    member("mia", "member");
    member("ada", "admin");
    member("olga", "owner");
    const ask = (question: string) => {
      const id = randomUUID();
      t.container.db
        .insert(questions)
        .values({
          id,
          projectId: project.id,
          question,
          model: "fake",
          actorId: "mia",
          sourceIds: [],
          feedback: { rating: "down", reason: "outdated", at: new Date().toISOString() },
          answer: {
            id,
            projectId: project.id,
            question,
            answer: "An answer.",
            confidence: "low",
            rationale: null,
            currentState: null,
            timelineContext: null,
            uncertainties: [],
            citations: [],
            relatedItems: [],
            model: "fake",
            createdAt: new Date().toISOString(),
          },
        })
        .run();
      return id;
    };
    ask("What is the refund policy?");
    const inThread = ask("Who owns billing?");
    const threadId = randomUUID();
    t.container.db
      .insert(askThreads)
      .values({
        id: threadId,
        workspaceId: t.container.workspace.id,
        projectId: project.id,
        userId: "mia",
        title: "Billing",
      })
      .run();
    t.container.db
      .insert(threadMessages)
      .values({ id: randomUUID(), threadId, questionId: inThread })
      .run();

    as("ada");
    expect((await t.app.request("/api/v1/people/mia/conversations")).status).toBe(403);
    as("olga");
    const res = await t.app.request("/api/v1/people/mia/conversations");
    expect(res.status).toBe(200);
    const body = PersonConversationsSchema.parse(await res.json());
    expect(body.person).toEqual({ id: "mia", name: "mia" });
    expect(body.items.map((item) => [item.question, item.thread?.title ?? null])).toEqual(
      expect.arrayContaining([
        ["What is the refund policy?", null],
        ["Who owns billing?", "Billing"],
      ]),
    );
    expect(body.items.every((item) => item.helpful === false)).toBe(true);
    expect((await t.app.request("/api/v1/people/nobody/conversations")).status).toBe(404);

    const reads = t.container.db
      .select()
      .from(auditLog)
      .all()
      .filter((row) => row.action === "conversation.view");
    expect(reads.map((row) => [row.actorId, row.targetId])).toEqual([["olga", "mia"]]);
  });
});
