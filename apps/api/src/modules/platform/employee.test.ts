import { randomUUID } from "node:crypto";
import {
  AssistantPreferencesSchema,
  DataExportResultSchema,
  KnowledgeUpdateListSchema,
  MyPeopleSchema,
  NotificationListSchema,
  NotificationPreferencesSchema,
  TeamActivityFeedSchema,
  WelcomeSchema,
} from "@contextos/shared";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  assignments,
  auditLog,
  contextItems,
  departments,
  memberships,
  questions,
  sourceAccess,
  teams,
  users,
} from "../../db/schema.js";
import type { Mail } from "../../lib/mailer.js";
import {
  addSource,
  createFakeGemini,
  createProject,
  createTestApp,
  EMPTY_EXTRACTION,
  jsonRequest,
  type TestApp,
} from "../../test/helpers.js";
import type { Actor } from "../../types.js";
import { createOnboardingRecords, ONBOARDING } from "./onboarding-records.js";

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const PUBLIC_QUOTE = "Checkout now calls the ledger API for invoice totals.";
const PRIVATE_QUOTE = "Enterprise pricing rises ten percent in January.";
const decision = (title: string, quote: string) => ({
  title,
  summary: quote,
  rationale: "Stated in the source.",
  alternatives: [],
  participants: [],
  decisionStatus: "decided" as const,
  decidedAt: "2026-10-01",
  evidenceQuote: quote,
  confidence: "high" as const,
});

describe("Employee: people, knowledge updates, team news, welcome, preferences and data export", () => {
  let t: TestApp;
  let mails: Mail[];
  afterEach(() => t?.close());

  const name = (id: string) => `${id[0]!.toUpperCase()}${id.slice(1)} Doe`;
  const member = (
    id: string,
    role: Actor["role"],
    managerId: string | null,
    organization: Record<string, unknown> = {},
    email: string | null = null,
  ) => {
    t.container.db
      .insert(users)
      .values({ id, name: name(id), email })
      .onConflictDoNothing()
      .run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: id, role, managerId, organization })
      .onConflictDoNothing()
      .run();
  };
  const as = (id: string, role: Actor["role"]) =>
    Object.assign(t.container.devActor, { id, name: name(id), role });
  const owner = () => as("dev-user", "owner");
  const get = async <S extends z.ZodType>(schema: S, path: string) => {
    const response = await t.app.request(`/api/v1${path}`);
    expect(response.status, path).toBe(200);
    return schema.parse(await response.json());
  };
  const send = (path: string, body: unknown, method = "POST") =>
    t.app.request(`/api/v1${path}`, jsonRequest(body, method));

  /**
   * Maya, eight days into onboarding on the Platform team: Dan manages her, Sana is her buddy and
   * Elena her People partner. Billing has a source shared with the workspace and a restricted one.
   */
  const world = async () => {
    mails = [];
    t = createTestApp({
      mailer: {
        send: (mail) => {
          mails.push(mail);
          return Promise.resolve();
        },
      },
      gemini: createFakeGemini({
        extraction: (request) => ({
          ...EMPTY_EXTRACTION,
          decisions: [
            request.prompt.includes(PRIVATE_QUOTE)
              ? decision("Raise enterprise pricing", PRIVATE_QUOTE)
              : decision("Checkout calls the ledger API", PUBLIC_QUOTE),
          ],
        }),
      }),
    });
    const ws = t.container.workspace.id;
    t.container.db
      .insert(departments)
      .values({ id: "dep-eng", workspaceId: ws, name: "Engineering" })
      .run();
    t.container.db
      .insert(teams)
      .values({ id: "team-platform", workspaceId: ws, departmentId: "dep-eng", name: "Platform" })
      .run();
    const platform = (extra: Record<string, unknown> = {}) => ({
      teamId: "team-platform",
      ...extra,
    });
    member("dan", "manager", null, platform({ jobTitle: "Engineering Manager" }));
    member(
      "maya",
      "member",
      "dan",
      platform({ startDate: day(-8), isNewHire: true, jobTitle: "Product Engineer" }),
      "maya@example.test",
    );
    member("sana", "member", "dan", platform({ jobTitle: "Senior Engineer" }));
    member("elena", "hr", null, { jobTitle: "People Partner" });
    member("priya", "member", "dan", platform({ jobTitle: "Staff Engineer" }));
    member("omar", "member", null);
    member("kai", "member", null);
    member("jonah", "member", "dan", platform({ startDate: day(5), jobTitle: "SRE" }));
    member("leah", "member", "dan", platform({ startDate: day(-3), jobTitle: "Engineer" }));
    member("zed", "member", null, { startDate: day(-2) });
    member("gus", "guest", null);

    owner();
    const project = await createProject(t.app, "Billing");
    const publicSource = await addSource(t.app, project.id, {
      kind: "document",
      title: "Checkout notes",
      author: "Priya Doe",
      content: `# Checkout\n\n${PUBLIC_QUOTE}`,
      visibility: "workspace",
    });
    const privateSource = await addSource(t.app, project.id, {
      kind: "document",
      title: "Pricing memo",
      content: `# Pricing\n\n${PRIVATE_QUOTE}`,
    });
    await t.drain();

    const records = createOnboardingRecords(t.container);
    records.store.insert({
      workspaceId: ws,
      ownerId: "elena",
      kind: ONBOARDING,
      status: "active",
      data: records.newRecord(ws, {
        personId: "maya",
        name: name("maya"),
        title: "Product Engineer",
        email: "maya@example.test",
        team: "Platform",
        managerId: "dan",
        buddyId: "sana",
        templateId: null,
        peoplePartnerId: "elena",
        startDate: day(-8),
      }) as unknown as Record<string, unknown>,
    });
    const assign = (
      userId: string,
      type: "mentor" | "domain_owner",
      scopeType: string,
      scopeId: string,
    ) =>
      t.container.db
        .insert(assignments)
        .values({
          id: randomUUID(),
          workspaceId: ws,
          userId,
          type,
          scopeType: scopeType as "user" | "project" | "section",
          scopeId,
        })
        .run();
    assign("sana", "mentor", "user", "maya");
    assign("kai", "mentor", "user", "maya");
    assign("priya", "domain_owner", "project", project.id);
    assign("omar", "domain_owner", "section", `${project.id}:architecture`);
    records.store.insert({
      workspaceId: ws,
      ownerId: "priya",
      kind: "learning_path",
      projectId: project.id,
      status: "published",
      data: { title: "Billing 101", items: [] },
    });
    return { project, publicSource, privateSource };
  };

  it("answers every new endpoint in the shared contract the web parses", async () => {
    await world();
    as("maya", "member");
    await get(MyPeopleSchema, "/me/people");
    await get(KnowledgeUpdateListSchema, "/me/knowledge-updates");
    await get(TeamActivityFeedSchema, "/me/team-activity");
    await get(WelcomeSchema, "/me/welcome");
    const saved = await send("/me/welcome", {
      preferredName: "May",
      pronouns: "she/her",
      location: "London",
      known: ["TypeScript"],
      reminders: "email",
    });
    expect(saved.status).toBe(200);
    WelcomeSchema.parse(await saved.json());
    await get(AssistantPreferencesSchema, "/me/assistant-preferences");
    const patched = await send("/me/assistant-preferences", { showSuggestions: false }, "PATCH");
    expect(patched.status).toBe(200);
    AssistantPreferencesSchema.parse(await patched.json());
    const exported = await send("/me/data-export", {});
    expect(exported.status).toBe(202);
    DataExportResultSchema.parse(await exported.json());

    // Someone with no team, onboarding record or projects still gets valid (mostly empty) answers.
    as("gus", "guest");
    expect(await get(MyPeopleSchema, "/me/people")).toEqual({ items: [] });
    expect(await get(KnowledgeUpdateListSchema, "/me/knowledge-updates")).toEqual({ items: [] });
    expect(await get(TeamActivityFeedSchema, "/me/team-activity")).toEqual({
      team: null,
      items: [],
    });
    const welcome = await get(WelcomeSchema, "/me/welcome");
    expect(welcome).toMatchObject({
      people: [],
      completedAt: null,
      title: "team member",
      due: false,
    });
  });

  it("lists the manager, buddy, People partner, mentors and a few experts, once each", async () => {
    await world();
    as("maya", "member");
    const { items } = await get(MyPeopleSchema, "/me/people");
    expect(items.map((entry) => [entry.person.id, entry.relation, entry.note])).toEqual([
      ["dan", "manager", "Your manager"],
      ["sana", "buddy", "Your onboarding buddy"],
      ["elena", "people_partner", "Your People partner"],
      ["kai", "mentor", "Your mentor"],
      ["priya", "expert", "Owns Billing"],
      ["omar", "expert", "Owns Billing architecture"],
    ]);
    expect(items[0]!.person).toEqual({ id: "dan", name: "Dan Doe", title: "Engineering Manager" });

    // Without an HR record, the mentor assignment stands in for the buddy; nobody lists themselves.
    as("priya", "member");
    const priya = await get(MyPeopleSchema, "/me/people");
    expect(priya.items.map((entry) => entry.person.id)).toEqual(["dan", "omar"]);
    // An offboarded manager is not someone to know first.
    t.container.db
      .update(memberships)
      .set({ status: "offboarded" })
      .where(eq(memberships.userId, "dan"))
      .run();
    expect((await get(MyPeopleSchema, "/me/people")).items.map((entry) => entry.person.id)).toEqual(
      ["omar"],
    );
  });

  it("shows knowledge updates only from sources the caller can open, newest first", async () => {
    const { project, privateSource } = await world();
    // The owner created the restricted source, so they see both decisions.
    owner();
    const ownerView = await get(KnowledgeUpdateListSchema, "/me/knowledge-updates");
    expect(ownerView.items.map((item) => item.title).sort()).toEqual([
      "Checkout calls the ledger API",
      "Raise enterprise pricing",
    ]);
    const restricted = ownerView.items.find((item) => item.title === "Raise enterprise pricing")!;
    expect(restricted).toMatchObject({
      projectId: project.id,
      itemId: restricted.id,
      tag: "Decision",
      origin: "knowledge_hub",
      restrictedTo: "People with access to its sources",
    });

    // Maya can only open the shared source.
    as("maya", "member");
    const maya = await get(KnowledgeUpdateListSchema, "/me/knowledge-updates");
    expect(maya.items).toHaveLength(1);
    expect(maya.items[0]).toMatchObject({
      title: "Checkout calls the ledger API",
      author: "Priya Doe",
      reason: "New in Billing",
      restrictedTo: null,
    });
    // Someone who works on the project is told so.
    as("priya", "member");
    expect((await get(KnowledgeUpdateListSchema, "/me/knowledge-updates")).items[0]?.reason).toBe(
      "In Billing, a project you work on",
    );

    // Granting Maya the restricted source shows it too; a guest outside the project sees nothing.
    t.container.db
      .insert(sourceAccess)
      .values({ sourceId: privateSource.id, userId: "maya" })
      .run();
    as("maya", "member");
    const granted = await get(KnowledgeUpdateListSchema, "/me/knowledge-updates");
    expect(granted.items).toHaveLength(2);
    expect(granted.items[0]!.updatedAt >= granted.items[1]!.updatedAt).toBe(true);
    as("gus", "guest");
    expect((await get(KnowledgeUpdateListSchema, "/me/knowledge-updates")).items).toEqual([]);

    // Changes older than two weeks drop off.
    t.container.db
      .update(contextItems)
      .set({ updatedAt: new Date(Date.now() - 20 * 86_400_000) })
      .where(eq(contextItems.projectId, project.id))
      .run();
    as("maya", "member");
    expect((await get(KnowledgeUpdateListSchema, "/me/knowledge-updates")).items).toEqual([]);
  });

  it("builds team news from joiners, knowledge changes and published courses", async () => {
    await world();
    as("maya", "member");
    const feed = await get(TeamActivityFeedSchema, "/me/team-activity");
    expect(feed.team).toEqual({ id: "team-platform", name: "Platform" });
    const texts = feed.items.map((item) => `${item.kind}: ${item.text} (${item.where})`);
    expect(texts).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^joiner: Jonah Doe \(SRE\) joins Platform on .+\(New teammate\)$/),
        expect.stringMatching(/^joiner: Leah Doe \(Engineer\) joined Platform on .+$/),
        "update: New decision: “Checkout calls the ledger API” (Billing)",
        "update: Priya Doe published the course “Billing 101”. (Billing)",
      ]),
    );
    // Not the caller, not other teams, and nothing from sources Maya can't open.
    expect(texts.join("\n")).not.toMatch(/Maya Doe|Zed Doe|enterprise pricing/);
    expect([...feed.items].sort((a, b) => b.at.localeCompare(a.at))).toEqual(feed.items);
  });

  it("saves the welcome profile, its reminders and location, and keeps the first completion", async () => {
    await world();
    as("maya", "member");
    const before = await get(WelcomeSchema, "/me/welcome");
    expect(before).toMatchObject({
      firstDay: day(-8),
      title: "Product Engineer",
      team: "Platform",
      completedAt: null,
      due: true,
      profile: { preferredName: "Maya", pronouns: "", location: "", known: [], reminders: "slack" },
    });
    expect(before.people.map((entry) => entry.relation)).toEqual([
      "manager",
      "buddy",
      "people_partner",
    ]);
    expect(before.knownOptions).toContain("TypeScript");
    expect(before.expectations).toContain("Meet Dan every week for a check-in");
    expect(before.support).toContain("Sana pairs with you on practical tasks");

    const invalid = await send("/me/welcome", { ...before.profile, preferredName: " " });
    expect(invalid.status).toBe(400);
    const extra = await send("/me/welcome", { ...before.profile, roadmap: [] });
    expect(extra.status).toBe(400);

    const input = {
      preferredName: "May",
      pronouns: "she/her",
      location: "London",
      known: ["TypeScript", "Kafka", "Logistics"],
      reminders: "both" as const,
    };
    const saved = WelcomeSchema.parse(await (await send("/me/welcome", input)).json());
    expect(saved.profile).toEqual(input);
    expect(saved.completedAt).not.toBeNull();
    // Finishing it ends the first-sign-in redirect.
    expect(saved.due).toBe(false);
    // A topic outside the suggestions stays selectable.
    expect(saved.knownOptions).toContain("Logistics");
    expect(await get(WelcomeSchema, "/me/welcome")).toEqual(saved);

    const notifications = await get(NotificationPreferencesSchema, "/notifications/preferences");
    expect(notifications.categories.onboarding).toMatchObject({ email: true, slack: true });
    const membership = t.container.db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, "maya"))
      .get();
    expect(membership?.organization).toMatchObject({ location: "London", teamId: "team-platform" });

    const again = WelcomeSchema.parse(
      await (await send("/me/welcome", { ...input, reminders: "email" })).json(),
    );
    expect(again.completedAt).toBe(saved.completedAt);
    expect(again.profile.reminders).toBe("email");
    expect(
      (await get(NotificationPreferencesSchema, "/notifications/preferences")).categories
        .onboarding,
    ).toMatchObject({ email: true, slack: false });
    expect(
      t.container.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "user.welcome_complete"))
        .all(),
    ).toHaveLength(2);
  });

  it("patches Context Bot preferences field by field and returns the whole object", async () => {
    await world();
    as("maya", "member");
    expect(await get(AssistantPreferencesSchema, "/me/assistant-preferences")).toEqual({
      openBesideLessons: true,
      showSuggestions: true,
    });
    const patched = await send("/me/assistant-preferences", { showSuggestions: false }, "PATCH");
    expect(await patched.json()).toEqual({ openBesideLessons: true, showSuggestions: false });
    await send("/me/assistant-preferences", { openBesideLessons: false }, "PATCH");
    expect(await get(AssistantPreferencesSchema, "/me/assistant-preferences")).toEqual({
      openBesideLessons: false,
      showSuggestions: false,
    });
    expect((await send("/me/assistant-preferences", { theme: "dark" }, "PATCH")).status).toBe(400);
    expect(
      (await send("/me/assistant-preferences", { showSuggestions: "no" }, "PATCH")).status,
    ).toBe(400);
    // Stored beside the other preferences, which stay as they were.
    const user = t.container.db.select().from(users).where(eq(users.id, "maya")).get();
    expect(user?.preferences.assistant).toEqual({
      openBesideLessons: false,
      showSuggestions: false,
    });
    // Someone else's preferences are their own.
    as("sana", "member");
    expect(await get(AssistantPreferencesSchema, "/me/assistant-preferences")).toEqual({
      openBesideLessons: true,
      showSuggestions: true,
    });
  });

  it("exports the caller's data, notifies them, and lets only them download it", async () => {
    const { project, publicSource, privateSource } = await world();
    const ask = (actorId: string, question: string, sourceIds: string[]) =>
      t.container.db
        .insert(questions)
        .values({
          id: randomUUID(),
          projectId: project.id,
          question,
          answer: {
            id: randomUUID(),
            projectId: project.id,
            question,
            answer: `Answer to ${question}`,
            confidence: "high",
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
          sourceIds,
        })
        .run();
    ask("maya", "Who owns billing?", [publicSource.id]);
    ask("sana", "Sana's private question", []);
    ask("maya", "What is the pricing plan?", [privateSource.id]);
    const records = createOnboardingRecords(t.container);
    const record = records.store
      .listWhere(t.container.workspace.id, ONBOARDING, {}, 50)
      .find((row) => records.recordData(row).personId === "maya")!;
    for (const [status, notes] of [
      ["published", "Great first week."],
      ["private", "Manager-only note."],
    ] as const)
      records.store.insert({
        workspaceId: t.container.workspace.id,
        ownerId: "maya",
        kind: "checkin",
        parentId: record.id,
        status,
        data: { type: "weekly", pulse: "on_track", notes, nextSteps: "", authorId: "dan" },
      });

    // Without an email address there is nowhere to send the link.
    owner();
    expect((await send("/me/data-export", {})).status).toBe(409);
    expect((await send("/me/data-export", { format: "csv" })).status).toBe(400);

    as("maya", "member");
    const response = await send("/me/data-export", {});
    expect(response.status).toBe(202);
    const result = DataExportResultSchema.parse(await response.json());
    expect(result.email).toBe("maya@example.test");

    const notifications = await get(NotificationListSchema, "/notifications");
    const ready = notifications.items.find(
      (item) => item.data.title === "Your data export is ready",
    );
    expect(ready?.data.link).toMatch(/^\/api\/v1\/me\/data-export\/.+/);
    const link = ready!.data.link!;
    await expect.poll(() => mails.length).toBe(1);
    expect(mails[0]).toMatchObject({ to: "maya@example.test" });
    expect(mails[0]!.text).toContain(link);

    // A repeat within the hour returns the same export rather than building another.
    const repeat = DataExportResultSchema.parse(await (await send("/me/data-export", {})).json());
    expect(repeat.readyBy).toBe(result.readyBy);

    const download = await t.app.request(link);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toMatch(
      /^attachment; filename="contextos-data-/,
    );
    const data = (await download.json()) as {
      profile: { id: string; email: string };
      askHistory: Array<{ question: string; answer: string | null }>;
      checkinsSharedWithYou: Array<{ notes: string; by: string }>;
    };
    expect(data.profile).toMatchObject({ id: "maya", email: "maya@example.test" });
    expect(data.askHistory).toEqual([
      expect.objectContaining({
        question: "Who owns billing?",
        answer: "Answer to Who owns billing?",
      }),
      // The answer drew on a source Maya can't open, so only her question is in the export.
      expect.objectContaining({ question: "What is the pricing plan?", answer: null }),
    ]);
    expect(data.checkinsSharedWithYou).toEqual([
      expect.objectContaining({ notes: "Great first week.", by: "Dan Doe" }),
    ]);

    // Only its owner can download it.
    for (const [id, role] of [
      ["sana", "member"],
      ["dev-user", "owner"],
    ] as const) {
      as(id, role);
      expect((await t.app.request(link)).status).toBe(404);
    }
    as("maya", "member");
    expect((await t.app.request("/api/v1/me/data-export/missing")).status).toBe(404);
    expect(
      t.container.db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, "user.data_export"), eq(auditLog.actorId, "maya")))
        .all(),
    ).toHaveLength(1);
  });
});
