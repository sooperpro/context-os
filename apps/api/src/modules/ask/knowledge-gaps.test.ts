import { randomUUID } from "node:crypto";
import { KnowledgeGapEntryListSchema, KnowledgeGapEntrySchema } from "@contextos/shared";
import { afterEach, describe, expect, it } from "vitest";
import { assignments, auditLog, memberships, questions, users } from "../../db/schema.js";
import { createProject, createTestApp, jsonRequest, type TestApp } from "../../test/helpers.js";
import type { Actor } from "../../types.js";
import { gapKey, gapWords, sameGap } from "./knowledge-gaps.js";

describe("Knowledge gap grouping", () => {
  const same = (a: string, b: string) => sameGap(gapWords(a), gapWords(b));

  it("treats wordings that mean the same thing as one gap", () => {
    expect(same("How do I reset my password?", "how to reset password")).toBe(true);
    expect(same("What is our refund policy?", "Refund policy")).toBe(true);
    expect(same("Pricing for fleets", "fleet pricing?")).toBe(true);
    expect(same("What are the security policies?", "security policy")).toBe(true);
    expect(gapKey("Reset password!")).toBe(gapKey("reset   PASSWORD"));
  });

  it("keeps different questions apart", () => {
    expect(same("Who owns billing?", "When is billing due?")).toBe(false);
    expect(same("Who owns billing?", "When does billing run?")).toBe(false);
    expect(same("Pricing", "Pricing for fleets")).toBe(false);
    expect(same("How do I reset my password?", "How do I reset my laptop?")).toBe(false);
  });
});

describe("GET /knowledge-gaps", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

  const member = (id: string, role: Actor["role"], managerId: string | null = null) => {
    t.container.db.insert(users).values({ id, name: id }).onConflictDoNothing().run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: id, role, managerId })
      .onConflictDoNothing()
      .run();
  };
  const as = (id: string, role: Actor["role"]) =>
    Object.assign(t.container.devActor, { id, name: id, role });
  const owns = (userId: string, projectId: string) =>
    t.container.db
      .insert(assignments)
      .values({
        id: randomUUID(),
        workspaceId: t.container.workspace.id,
        userId,
        type: "domain_owner",
        scopeType: "project",
        scopeId: projectId,
      })
      .run();
  const asked = (actorId: string, projectId: string, question: string, at = new Date()) => {
    const id = randomUUID();
    t.container.db
      .insert(questions)
      .values({
        id,
        projectId,
        question,
        model: "fake",
        actorId,
        sourceIds: [],
        createdAt: at,
        answer: {
          id,
          projectId,
          question,
          answer: "No source answers this yet.",
          confidence: "insufficient",
          rationale: null,
          currentState: null,
          timelineContext: null,
          uncertainties: [],
          citations: [],
          relatedItems: [],
          model: "fake",
          createdAt: at.toISOString(),
        },
      })
      .run();
  };
  const reported = (ownerId: string, projectId: string, question: string) =>
    t.container.store.insert({
      workspaceId: t.container.workspace.id,
      ownerId,
      kind: "knowledge_gap",
      projectId,
      status: "open",
      data: { question, page: null },
    });
  const list = async (query = "") => {
    const res = await t.app.request(`/api/v1/knowledge-gaps${query}`);
    expect(res.status).toBe(200);
    return KnowledgeGapEntryListSchema.parse(await res.json());
  };

  it("shows a reported gap to the reporter's manager, the project's domain owner and admins", async () => {
    t = createTestApp();
    const vpn = await createProject(t.app, "IT help");
    const sales = await createProject(t.app, "Sales");
    member("mia", "manager");
    member("emp", "member", "mia");
    member("own", "member");
    member("salesOwner", "member");
    member("ada", "admin");
    member("pat", "member");
    owns("own", vpn.id);
    owns("salesOwner", sales.id);
    reported("emp", vpn.id, "How do I reset my VPN password?");

    as("mia", "manager");
    const team = await json<{ items: Array<{ question: string }> }>(
      await t.app.request("/api/v1/team/knowledge-gaps"),
    );
    expect(team.items.map((item) => item.question)).toContain("How do I reset my VPN password?");

    as("own", "member");
    const owned = await list();
    expect(owned.scope).toBe("projects");
    expect(owned.items).toEqual([
      expect.objectContaining({
        question: "How do I reset my VPN password?",
        reports: 1,
        project: { id: vpn.id, name: "IT help" },
        status: "open",
      }),
    ]);

    as("salesOwner", "member");
    expect((await list()).items).toEqual([]);

    as("ada", "admin");
    const all = await list();
    expect(all.scope).toBe("workspace");
    expect(all.items).toHaveLength(1);

    as("pat", "member");
    expect((await t.app.request("/api/v1/knowledge-gaps")).status).toBe(403);
  });

  it("groups near-identical questions, and keeps unreported ones private until enough people ask", async () => {
    t = createTestApp();
    const vpn = await createProject(t.app, "IT help");
    for (const id of ["a1", "a2", "a3", "a4"]) member(id, "member");
    member("ada", "admin");
    asked("a1", vpn.id, "How do I reset my VPN password?");
    asked("a2", vpn.id, "reset vpn password");
    asked("a1", vpn.id, "Who owns the VPN?");

    as("ada", "admin");
    // Two people asked: still private.
    expect((await list()).items).toEqual([]);

    asked("a3", vpn.id, "How to reset the VPN passwords?");
    const gaps = await list();
    expect(gaps.privacyFloor).toBe(3);
    expect(gaps.items).toEqual([
      expect.objectContaining({
        question: "How do I reset my VPN password?",
        askers: 3,
        asks: 3,
        wordings: 3,
        reports: 0,
      }),
    ]);
  });

  it("marks a gap answered, tells the reporters, and reopens it when asked again unanswered", async () => {
    t = createTestApp();
    const vpn = await createProject(t.app, "IT help");
    member("emp", "member");
    member("own", "member");
    owns("own", vpn.id);
    reported("emp", vpn.id, "How do I reset my VPN password?");

    as("own", "member");
    const [gap] = (await list()).items;
    const answered = await t.app.request(
      `/api/v1/knowledge-gaps/${gap!.id}/status`,
      jsonRequest({ status: "answered", note: "Added the VPN guide to IT help." }),
    );
    expect(answered.status).toBe(200);
    expect(KnowledgeGapEntrySchema.parse(await answered.json())).toMatchObject({
      status: "answered",
      resolution: { by: { id: "own" }, note: "Added the VPN guide to IT help." },
    });
    expect((await list()).counts).toEqual({ open: 0, answered: 1, dismissed: 0 });
    expect((await list("?status=answered")).items).toHaveLength(1);

    const notices = t.container.store
      .listWhere(t.container.workspace.id, "notification", { ownerId: "emp" }, 50)
      .map((row) => row.data.title);
    expect(notices).toContain("Your question now has an answer: How do I reset my VPN password?");
    expect(
      t.container.db
        .select()
        .from(auditLog)
        .all()
        .some((row) => row.action === "knowledge_gap.answered"),
    ).toBe(true);

    // Asked again later without an answer: open again.
    asked("emp", vpn.id, "reset VPN password", new Date(Date.now() + 60_000));
    expect((await list()).items.map((item) => item.status)).toEqual(["open"]);

    // Dismissed stays dismissed, however often it's asked.
    await t.app.request(
      `/api/v1/knowledge-gaps/${gap!.id}/status`,
      jsonRequest({ status: "dismissed" }),
    );
    asked("emp", vpn.id, "How to reset VPN password", new Date(Date.now() + 120_000));
    expect((await list()).counts).toEqual({ open: 0, answered: 0, dismissed: 1 });

    expect(
      (
        await t.app.request(
          "/api/v1/knowledge-gaps/unknown/status",
          jsonRequest({ status: "answered" }),
        )
      ).status,
    ).toBe(404);
  });
});
