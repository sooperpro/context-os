import { AnswerSchema } from "@contextos/shared";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  assignments,
  connectorConnections,
  connectorScopes,
  memberships,
  platformRecords,
  sourceObjects,
  users,
  workspaces,
} from "../../db/schema.js";
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

describe("AI settings applied to Context Bot answers", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  let owner: Actor;

  const setup = async (answer = SAMPLE_ANSWER) => {
    t = createTestApp({ gemini: createFakeGemini({ answer }) });
    owner = { ...t.container.devActor };
    const project = await createProject(t.app, "Billing");
    const source = await addSource(t.app, project.id);
    await t.drain();
    return { project, source };
  };
  const settings = async (body: Record<string, unknown>) => {
    Object.assign(t.container.devActor, owner);
    const response = await t.app.request("/api/v1/admin/ai-settings", jsonRequest(body, "PATCH"));
    expect(response.status).toBe(200);
  };
  const ask = async (
    projectId: string,
    question = "Why is billing moving to the ledger service?",
  ) => {
    const response = await t.app.request(
      `/api/v1/projects/${projectId}/ask`,
      jsonRequest({ question }),
    );
    expect(response.status).toBe(201);
    return AnswerSchema.parse(await response.json());
  };

  it("answers only when two or more sources agree, in strict mode", async () => {
    const { project } = await setup();
    // Balanced (the default): one cited source is enough.
    expect((await ask(project.id)).confidence).toBe("high");
    await settings({ strictness: "strict" });
    const strict = await ask(project.id);
    expect(strict.confidence).toBe("insufficient");
    expect(strict.answer).toContain("two or more sources agree");
    expect(strict.citations).toEqual([]);
  });

  it("keeps a weakly supported answer, labelled unverified, when lenient or citing is off", async () => {
    // The model cites a passage that doesn't exist, both times.
    const { project } = await setup({
      ...SAMPLE_ANSWER,
      answer: "Billing moves to a ledger service [9].",
      citations: [{ ref: 9, claim: "Billing moves" }],
    });
    expect((await ask(project.id)).confidence).toBe("insufficient");

    await settings({ strictness: "lenient" });
    const lenient = await ask(project.id);
    expect(lenient).toMatchObject({ confidence: "low", citations: [] });
    expect(lenient.uncertainties).toContain(
      "Unverified: parts of this answer aren't backed by a cited source.",
    );

    await settings({ strictness: "balanced", rules: { cite_sources: false } });
    expect((await ask(project.id)).confidence).toBe("low");
  });

  it("warns when a cited source hasn't synced for longer than the setting", async () => {
    const { project, source } = await setup();
    t.container.db
      .insert(connectorConnections)
      .values({
        id: "drive",
        workspaceId: t.container.workspace.id,
        userId: owner.id,
        provider: "google_drive",
        credentials: "encrypted",
        accountId: "drive-account",
        scopes: [],
      })
      .run();
    t.container.db
      .insert(connectorScopes)
      .values({
        id: "scope",
        workspaceId: t.container.workspace.id,
        connectionId: "drive",
        projectId: project.id,
        scopeType: "folder",
        externalId: "folder-1",
        name: "Billing",
        lastSyncedAt: new Date(Date.now() - 30 * 3_600_000),
      })
      .run();
    t.container.db
      .update(sourceObjects)
      .set({ connector: "google_drive", connectionId: "drive" })
      .where(eq(sourceObjects.id, source.id))
      .run();

    const syncedHoursAgo = (hours: number, frequency: "2d" | "manual" = "2d") =>
      t.container.db
        .update(connectorScopes)
        .set({ lastSyncedAt: new Date(Date.now() - hours * 3_600_000), syncFrequency: frequency })
        .where(eq(connectorScopes.id, "scope"))
        .run();
    const notes = async () => (await ask(project.id)).uncertainties;

    // A folder syncing every 2 days is on schedule after 30 hours: no warning (D10).
    expect((await notes()).some((note) => note.includes("synced"))).toBe(false);
    // Once it misses its scheduled sync, it is flagged.
    syncedHoursAgo(70);
    expect(await notes()).toContainEqual(
      expect.stringContaining("missed its scheduled sync (last synced 2 days ago)"),
    );
    // A manual-only folder goes by the admin's setting: 7 days by default.
    syncedHoursAgo(30, "manual");
    expect((await notes()).some((note) => note.includes("synced"))).toBe(false);
    syncedHoursAgo(8 * 24, "manual");
    expect(await notes()).toContainEqual(expect.stringContaining("was last synced 8 days ago"));
    // Set to 1 day, 30 hours is too long.
    syncedHoursAgo(30, "manual");
    expect(
      (
        await t.app.request(
          "/api/v1/admin/ai-settings",
          jsonRequest({ staleAfterHours: 24 }, "PATCH"),
        )
      ).status,
    ).toBe(200);
    expect(await notes()).toContainEqual(expect.stringContaining("was last synced 30 hours ago"));

    // A workspace still holding an old hour-based choice reads it as the 7-day default.
    t.container.db
      .update(workspaces)
      .set({ settings: { ai: { staleAfterHours: 2 } } })
      .where(eq(workspaces.id, t.container.workspace.id))
      .run();
    expect(
      (
        (await (await t.app.request("/api/v1/admin/ai-settings")).json()) as {
          staleAfterHours: number;
        }
      ).staleAfterHours,
    ).toBe(168);
  });

  it("sends a question to the project's owners once enough people asked it without an answer", async () => {
    t = createTestApp();
    owner = { ...t.container.devActor };
    const project = await createProject(t.app, "Billing");
    const person = (id: string) => {
      t.container.db.insert(users).values({ id, name: id }).onConflictDoNothing().run();
      t.container.db
        .insert(memberships)
        .values({ workspaceId: t.container.workspace.id, userId: id, role: "member" })
        .onConflictDoNothing()
        .run();
    };
    for (const id of ["olu", "a", "b", "c", "d"]) person(id);
    t.container.db
      .insert(assignments)
      .values({
        id: "owns",
        workspaceId: t.container.workspace.id,
        userId: "olu",
        type: "domain_owner",
        scopeType: "project",
        scopeId: project.id,
      })
      .run();
    const routed = () =>
      t.container.db
        .select()
        .from(platformRecords)
        .where(
          and(eq(platformRecords.kind, "knowledge_gap"), eq(platformRecords.projectId, project.id)),
        )
        .all();
    const askAs = async (id: string) => {
      Object.assign(t.container.devActor, { id, name: id, role: "member" });
      // There are no sources, so nothing can answer it.
      expect((await ask(project.id, "Who approves refunds?")).confidence).toBe("insufficient");
    };

    // The same person asking again doesn't count twice; the third different person routes it.
    await askAs("a");
    await askAs("a");
    await askAs("b");
    expect(routed()).toEqual([]);
    await askAs("c");
    expect(routed()).toHaveLength(1);
    expect(routed()[0]?.data).toMatchObject({ question: "Who approves refunds?", routed: true });
    expect(routed()[0]?.ownerId).toBe("system");
    const notices = t.container.db
      .select()
      .from(platformRecords)
      .where(and(eq(platformRecords.kind, "notification"), eq(platformRecords.ownerId, "olu")))
      .all();
    expect(notices.map((row) => row.data.type)).toEqual(["knowledge.gap_routed"]);
    // Once only.
    await askAs("d");
    expect(routed()).toHaveLength(1);
  });

  it("doesn't route anything when routing is off", async () => {
    t = createTestApp();
    owner = { ...t.container.devActor };
    const project = await createProject(t.app, "Billing");
    await settings({ rules: { route_unanswered: false }, routeAfterAsks: 2 });
    for (const id of ["a", "b", "c"]) {
      t.container.db.insert(users).values({ id, name: id }).run();
      t.container.db
        .insert(memberships)
        .values({ workspaceId: t.container.workspace.id, userId: id, role: "member" })
        .run();
      Object.assign(t.container.devActor, { id, name: id, role: "member" });
      await ask(project.id, "Who approves refunds?");
    }
    expect(
      t.container.db
        .select()
        .from(platformRecords)
        .where(eq(platformRecords.kind, "knowledge_gap"))
        .all(),
    ).toEqual([]);
  });
});
