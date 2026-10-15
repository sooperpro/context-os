import {
  AssignOptionsSchema,
  AttentionListSchema,
  CheckinListSchema,
  CheckinPrepSchema,
  CheckinRecordSchema,
  CheckMatrixSchema,
  CreatedSchema,
  KnowledgeGapListSchema,
  MyCheckinsSchema,
  MyLearningSchema,
  ReviewDecisionSchema,
  ReviewQueueSchema,
  TeamKnowledgeSchema,
  TeamMemberDetailSchema,
  TeamOnboardingSchema,
} from "@contextos/shared";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  assignments,
  auditLog,
  memberships,
  platformRecords,
  sourceObjects,
  users,
} from "../../db/schema.js";
import {
  addSource,
  createProject,
  createTestApp,
  jsonRequest,
  type TestApp,
} from "../../test/helpers.js";
import type { Actor } from "../../types.js";

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

interface Member {
  person: { id: string };
  status: string;
  stage: string | null;
  issues: string[];
  insight: { action: { kind: string } | null } | null;
  modules: Array<{ id: string; title: string; state: string; dueOn: string; postponed: boolean }>;
  checks: Array<{ title: string; state: string }>;
  checkins: Array<{ type: string; pulse: string; note: string }>;
  buddy: { id: string } | null;
}

describe("Manager: team onboarding, member pages, check-ins and assigning", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;
  const member = (
    id: string,
    role: Actor["role"],
    managerId: string | null,
    organization: Record<string, unknown> = {},
  ) => {
    t.container.db
      .insert(users)
      .values({ id, name: `${id[0]!.toUpperCase()}${id.slice(1)} Doe` })
      .onConflictDoNothing()
      .run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: id, role, managerId, organization })
      .onConflictDoNothing()
      .run();
  };
  const as = (id: string, role: Actor["role"]) =>
    Object.assign(t.container.devActor, {
      id,
      name: `${id[0]!.toUpperCase()}${id.slice(1)} Doe`,
      role,
    });
  const team = () => {
    member("dan", "manager", null);
    member("leah", "member", "dan", { startDate: day(-20), isNewHire: true });
    member("jonah", "member", "dan", { startDate: day(5), isNewHire: true });
    member("sana", "member", "dan");
    member("other", "member", null, { startDate: day(-20), isNewHire: true });
    member("hana", "hr", null);
  };

  it("answers every manager endpoint in the shared contract the web parses", async () => {
    t = createTestApp();
    team();
    as("dan", "manager");
    const get = async <S extends z.ZodType>(schema: S, path: string) => {
      const response = await t.app.request(`/api/v1${path}`);
      expect(response.status, path).toBe(200);
      return schema.parse(await response.json());
    };
    const send = async <S extends z.ZodType>(
      schema: S,
      path: string,
      body: unknown,
      method = "POST",
    ) => {
      const response = await t.app.request(`/api/v1${path}`, jsonRequest(body, method));
      expect(response.status, path).toBeLessThan(300);
      return schema.parse(await response.json());
    };
    const options = await get(AssignOptionsSchema, "/team/members/leah/assign-options");
    await send(CreatedSchema, "/team/members/leah/roadmap", {
      templateId: options.roadmap.templates[0]!.id,
      addOnIds: [],
      buddyId: "sana",
    });
    const learning = await send(CreatedSchema, "/team/members/leah/assignments", {
      itemId: options.learning.items[0]!.id,
      dueOn: day(3),
      note: "",
    });
    await send(CheckinRecordSchema, "/team/members/leah/checkins", {
      type: "weekly",
      pulse: "on_track",
      agendaCovered: [],
      ratings: {},
      blockers: [],
      notes: "Good week.",
      nextSteps: "",
      recommendation: null,
      shareWithPerson: false,
    });
    await send(
      TeamMemberDetailSchema,
      "/team/members/leah/roadmap",
      { changes: [{ moduleId: learning.id, action: "postpone_week" }] },
      "PATCH",
    );
    await get(TeamOnboardingSchema, "/team/onboarding");
    await get(AttentionListSchema, "/team/attention");
    await get(CheckinListSchema, "/team/checkins");
    await get(CheckMatrixSchema, "/team/check-matrix");
    await get(TeamMemberDetailSchema, "/team/members/leah");
    await get(TeamMemberDetailSchema, "/team/members/jonah");
    for (const type of ["weekly", "day_30", "readiness_60", "probation"])
      await get(CheckinPrepSchema, `/team/members/leah/checkin-prep?type=${type}`);
    await get(TeamKnowledgeSchema, "/team/knowledge");
    await get(KnowledgeGapListSchema, "/team/knowledge-gaps");
    await get(ReviewQueueSchema, "/me/reviews");
    await get(MyLearningSchema, "/me/learning");
  });

  it("scopes team views to the manager's reports and refuses everyone else", async () => {
    t = createTestApp();
    team();
    as("dan", "manager");
    const roster = await json<{
      team: { name: string };
      people: Array<{ person: { id: string }; status: string; next: string | null }>;
    }>(await t.app.request("/api/v1/team/onboarding"));
    // Only reports who are onboarding: Leah (started) and Jonah (starts in 5 days), not Sana.
    expect(roster.people.map((row) => row.person.id)).toEqual(["leah", "jonah"]);
    expect(roster.people[0]).toMatchObject({ next: "Assign a roadmap" });
    expect(roster.team.name).toBe("Dan's team");

    expect((await t.app.request("/api/v1/team/members/other")).status).toBe(404);
    as("sana", "member");
    expect((await t.app.request("/api/v1/team/onboarding")).status).toBe(403);
    // Admin rights grant no people data.
    as("dev-user", "owner");
    expect((await t.app.request("/api/v1/team/onboarding")).status).toBe(403);
    expect((await t.app.request("/api/v1/team/members/leah")).status).toBe(404);
    // People Ops may open a member page.
    as("hana", "hr");
    expect((await t.app.request("/api/v1/team/members/leah")).status).toBe(200);
  });

  it("assigns a roadmap, edits it, assigns learning and shows it on the member page", async () => {
    t = createTestApp();
    team();
    as("dan", "manager");
    const options = await json<{
      learning: { items: Array<{ id: string; kind: string }> };
      roadmap: {
        templates: Array<{ id: string; name: string; moduleCount: number }>;
        addOns: Array<{ id: string }>;
        buddies: Array<{ id: string }>;
      };
    }>(await t.app.request("/api/v1/team/members/leah/assign-options"));
    const engineering = options.roadmap.templates.find((row) =>
      row.name.startsWith("Engineering"),
    )!;
    expect(engineering.moduleCount).toBe(15);
    expect(options.roadmap.buddies.map((row) => row.id)).not.toContain("leah");

    let member = await json<Member>(await t.app.request("/api/v1/team/members/leah"));
    expect(member.insight?.action?.kind).toBe("assign_roadmap");
    expect(member.modules).toEqual([]);

    const assign = (body: Record<string, unknown>) =>
      t.app.request("/api/v1/team/members/leah/roadmap", jsonRequest(body));
    expect(
      (await assign({ templateId: engineering.id, addOnIds: ["nope"], buddyId: "sana" })).status,
    ).toBe(400);
    expect(
      (await assign({ templateId: engineering.id, addOnIds: [], buddyId: "leah" })).status,
    ).toBe(400);
    expect(
      (
        await assign({
          templateId: engineering.id,
          addOnIds: ["mod-on-call"],
          buddyId: "sana",
        })
      ).status,
    ).toBe(201);
    expect(
      (await assign({ templateId: engineering.id, addOnIds: [], buddyId: "sana" })).status,
    ).toBe(409);
    // The buddy can follow them as a mentor; HR's setup checklist shows roadmap and buddy done.
    expect(
      t.container.db
        .select()
        .from(assignments)
        .where(and(eq(assignments.userId, "sana"), eq(assignments.type, "mentor")))
        .get()?.scopeId,
    ).toBe("leah");
    const hrRecord = t.container.db
      .select()
      .from(platformRecords)
      .where(eq(platformRecords.kind, "hr_onboarding"))
      .all()
      .find((row) => row.data.personId === "leah")!;
    expect(hrRecord.data).toMatchObject({ templateId: engineering.id, buddyId: "sana" });
    expect(Object.keys(hrRecord.data.setup as object)).toEqual(
      expect.arrayContaining(["roadmap", "buddy"]),
    );

    // Day 20 is week 3: the "Core knowledge" stage.
    member = await json<Member>(await t.app.request("/api/v1/team/members/leah"));
    expect(member.stage).toBe("Core knowledge");
    expect(member.buddy?.id).toBe("sana");
    expect(member.modules.map((row) => row.title)).toEqual([
      "Architecture overview",
      "Decisions you should know",
      "Code review norms",
      "Ship your first pull request",
    ]);
    // The roadmap came on day 20: what weeks 1–2 would have had due is due in a week instead, so
    // nothing arrives overdue.
    expect(member.issues.some((issue) => issue.includes("overdue"))).toBe(false);
    expect(member.modules.every((row) => row.dueOn >= day(7))).toBe(true);
    expect(member.checks).toEqual([
      expect.objectContaining({ title: "Company and business", state: "todo" }),
    ]);

    const edit = (changes: unknown[]) =>
      t.app.request("/api/v1/team/members/leah/roadmap", jsonRequest({ changes }, "PATCH"));
    const [first, second] = member.modules;
    expect((await edit([{ moduleId: "missing", action: "remove" }])).status).toBe(400);
    const edited = await json<Member>(
      await edit([
        { moduleId: first!.id, action: "postpone_week" },
        { moduleId: second!.id, action: "remove" },
      ]),
    );
    expect(edited.modules.find((row) => row.id === first!.id)).toMatchObject({
      postponed: true,
      dueOn: new Date(Date.parse(`${first!.dueOn}T00:00:00Z`) + 7 * 86_400_000)
        .toISOString()
        .slice(0, 10),
    });
    expect(edited.modules.some((row) => row.id === second!.id)).toBe(false);

    // Done modules can't change.
    const roadmap = t.container.db
      .select()
      .from(platformRecords)
      .where(and(eq(platformRecords.kind, "roadmap"), eq(platformRecords.ownerId, "leah")))
      .get()!;
    const modules = (roadmap.data.modules as Array<{ id: string; status: string }>).map((row) =>
      row.id === first!.id ? { ...row, status: "done" } : row,
    );
    t.container.db
      .update(platformRecords)
      .set({ data: { ...roadmap.data, modules } })
      .where(eq(platformRecords.id, roadmap.id))
      .run();
    expect((await edit([{ moduleId: first!.id, action: "remove" }])).status).toBe(409);

    const learn = (body: Record<string, unknown>) =>
      t.app.request("/api/v1/team/members/leah/assignments", jsonRequest(body));
    expect((await learn({ itemId: "nope", dueOn: day(3), note: "" })).status).toBe(400);
    expect((await learn({ itemId: "mod-incidents", dueOn: day(-1), note: "" })).status).toBe(400);
    const assigned = await json<{ id: string }>(
      await learn({ itemId: "mod-incidents", dueOn: day(3), note: "Before your first rotation" }),
    );
    member = await json<Member>(await t.app.request("/api/v1/team/members/leah"));
    expect(member.modules.find((row) => row.id === assigned.id)).toMatchObject({
      title: "Incident reviews",
      dueOn: day(3),
    });
    // Undo is a roadmap edit that removes it.
    await edit([{ moduleId: assigned.id, action: "remove" }]);
    member = await json<Member>(await t.app.request("/api/v1/team/members/leah"));
    expect(member.modules.some((row) => row.id === assigned.id)).toBe(false);
    expect(
      t.container.db
        .select()
        .from(auditLog)
        .all()
        .map((row) => row.action)
        .filter((action) => action.startsWith("roadmap.")),
    ).toEqual(["roadmap.assign", "roadmap.edit", "roadmap.assign_learning", "roadmap.edit"]);
  });

  it("records check-ins; a probation check-in sends the recommendation to People Ops", async () => {
    t = createTestApp();
    team();
    as("dan", "manager");
    const prep = await json<{ agenda: string[]; areas: Array<{ id: string }> }>(
      await t.app.request("/api/v1/team/members/leah/checkin-prep?type=readiness_60"),
    );
    expect(prep.areas.map((area) => area.id)).toEqual([
      "products",
      "systems",
      "practices",
      "delivery",
    ]);
    expect(prep.agenda[0]).toBe("Review the four readiness areas together");

    const body = {
      type: "weekly",
      pulse: "off_track",
      agendaCovered: [],
      ratings: {},
      blockers: ["access"],
      notes: "Still waiting on warehouse access.",
      nextSteps: "Escalate the ticket.",
      recommendation: null,
      shareWithPerson: true,
    };
    const saved = await t.app.request("/api/v1/team/members/leah/checkins", jsonRequest(body));
    expect(saved.status).toBe(201);
    expect(await json(saved)).toMatchObject({ type: "weekly", pulse: "off_track" });
    const member = await json<Member>(await t.app.request("/api/v1/team/members/leah"));
    expect(member.checkins[0]).toMatchObject({ note: "Still waiting on warehouse access." });
    // Waiting on access is blocked, and the manager's Home offers to escalate it.
    expect(member.status).toBe("blocked");
    const attention = await json<{
      items: Array<{ person: { id: string }; severity: string; actions: Array<{ kind: string }> }>;
    }>(await t.app.request("/api/v1/team/attention"));
    expect(attention.items.find((item) => item.person.id === "leah")).toMatchObject({
      severity: "error",
      actions: expect.arrayContaining([{ kind: "escalate", label: "Escalate" }]) as unknown,
    });
    expect(member.issues).toContain("Waiting on access (raised at the last check-in)");
    expect(member.issues.filter((issue) => issue.startsWith("Waiting on access"))).toHaveLength(1);
    // Escalating a wait on access goes to the workspace admins, once a day.
    const escalate = () => t.app.request("/api/v1/team/members/leah/escalations", jsonRequest({}));
    const first = await escalate();
    expect(first.status).toBe(201);
    const escalation = await json<{ id: string; to: string }>(first);
    expect(escalation.to).toBe("admins");
    const again = await escalate();
    expect(again.status).toBe(200);
    expect(await json(again)).toEqual(escalation);
    expect(
      t.container.db
        .select()
        .from(auditLog)
        .all()
        .filter((row) => row.action === "onboarding.escalate"),
    ).toHaveLength(1);
    expect(
      (await t.app.request("/api/v1/team/members/other/escalations", jsonRequest({}))).status,
    ).toBe(404);
    // Once access is sorted, the next check-in clears it; off track still means at risk.
    await t.app.request(
      "/api/v1/team/members/leah/checkins",
      jsonRequest({ ...body, blockers: [], notes: "Access granted." }),
    );
    expect((await json<Member>(await t.app.request("/api/v1/team/members/leah"))).status).toBe(
      "at_risk",
    );

    expect(
      (
        await t.app.request(
          "/api/v1/team/members/leah/checkins",
          jsonRequest({ ...body, type: "probation", pulse: "on_track", recommendation: null }),
        )
      ).status,
    ).toBe(400);
    await t.app.request(
      "/api/v1/team/members/leah/checkins",
      jsonRequest({
        ...body,
        type: "probation",
        pulse: "on_track",
        ratings: { products: 2, systems: 3, practices: 2, delivery: 2 },
        recommendation: "confirm",
        notes: "Ready to confirm.",
      }),
    );
    const record = t.container.db
      .select()
      .from(platformRecords)
      .where(eq(platformRecords.kind, "hr_onboarding"))
      .all()
      .find((row) => row.data.personId === "leah")!;
    expect((record.data as { probation: unknown }).probation).toMatchObject({
      recommendation: "confirm",
      managerNote: "Ready to confirm.",
      ratings: expect.arrayContaining([{ area: "systems", level: 3 }]) as unknown,
    });
    as("hana", "hr");
    const review = await json<{ recommendation?: string }>(
      await t.app.request(`/api/v1/people-ops/probation-reviews/${record.id}`),
    );
    expect(review.recommendation).toBe("confirm");
  });

  it("lets the person respond only to check-ins shared with them, without ratings or the recommendation", async () => {
    t = createTestApp();
    team();
    as("dan", "manager");
    const record = (shareWithPerson: boolean, notes: string) =>
      t.app.request(
        "/api/v1/team/members/leah/checkins",
        jsonRequest({
          type: "probation",
          pulse: "off_track",
          agendaCovered: [],
          ratings: { products: 1, systems: 2, practices: 1, delivery: 1 },
          blockers: ["workload"],
          notes,
          nextSteps: "Pair on the billing service.",
          recommendation: "extend",
          shareWithPerson,
        }),
      );
    expect((await record(false, "Manager-only note.")).status).toBe(201);
    expect((await record(true, "Shared note.")).status).toBe(201);
    const checkin = (status: string) =>
      t.container.db
        .select()
        .from(platformRecords)
        .where(and(eq(platformRecords.kind, "checkin"), eq(platformRecords.status, status)))
        .get()!;
    const kept = checkin("private");
    const shared = checkin("published");
    const respond = (id: string, version: number) =>
      t.app.request(
        `/api/v1/probation/checkins/${id}/respond`,
        jsonRequest({ version, response: "Thanks, that helps." }),
      );

    // A private check-in doesn't exist for Leah, and nothing is written to it.
    as("leah", "member");
    expect((await respond(kept.id, kept.version)).status).toBe(404);
    expect(checkin("private").data.employeeResponse).toBeNull();

    const response = await respond(shared.id, shared.version);
    expect(response.status).toBe(200);
    const { data } = await json<{ data: Record<string, unknown> }>(response);
    expect(data).toMatchObject({
      notes: "Shared note.",
      nextSteps: "Pair on the billing service.",
      employeeResponse: "Thanks, that helps.",
    });
    for (const key of ["ratings", "recommendation", "pulse", "blockers"])
      expect(data, key).not.toHaveProperty(key);
    // The stored check-in keeps everything for the manager and People Ops.
    expect(checkin("published").data).toMatchObject({
      recommendation: "extend",
      employeeResponse: "Thanks, that helps.",
    });

    // Nobody else can respond to it.
    as("sana", "member");
    expect((await respond(shared.id, shared.version + 1)).status).toBe(404);
  });

  it("shows the person their upcoming check-ins and the notes shared with them", async () => {
    t = createTestApp();
    team();
    as("dan", "manager");
    const body = {
      type: "weekly",
      pulse: "concerns",
      agendaCovered: [],
      ratings: {},
      blockers: ["workload"],
      nextSteps: "Pair with Sana on billing.",
      recommendation: null,
    };
    await t.app.request(
      "/api/v1/team/members/leah/checkins",
      jsonRequest({ ...body, notes: "Manager-only note.", shareWithPerson: false }),
    );
    await t.app.request(
      "/api/v1/team/members/leah/checkins",
      jsonRequest({ ...body, notes: "Good progress this week.", shareWithPerson: true }),
    );
    // The share notification opens her check-ins on Home.
    const shareNotice = t.container.db
      .select()
      .from(platformRecords)
      .where(and(eq(platformRecords.kind, "notification"), eq(platformRecords.ownerId, "leah")))
      .all()
      .find((row) => row.data.type === "checkin.published");
    expect(shareNotice?.data.link).toBe("/#checkins");

    as("leah", "member");
    const response = await t.app.request("/api/v1/me/checkins");
    expect(response.status).toBe(200);
    const mine = MyCheckinsSchema.parse(await response.json());
    // Day 20: the next weekly 1:1 and the 30-day review.
    expect(mine.upcoming.map((entry) => entry.title)).toEqual(
      expect.arrayContaining(["Weekly 1:1", "30-day review"]),
    );
    expect(mine.shared).toEqual([
      expect.objectContaining({
        title: "Weekly 1:1",
        by: expect.objectContaining({ id: "dan" }) as unknown,
        notes: "Good progress this week.",
        nextSteps: "Pair with Sana on billing.",
        response: null,
      }),
    ]);
    expect(JSON.stringify(mine)).not.toMatch(/Manager-only|concerns|workload/);

    // Someone with no onboarding record has nothing scheduled.
    as("sana", "member");
    expect(MyCheckinsSchema.parse(await json(await t.app.request("/api/v1/me/checkins")))).toEqual({
      upcoming: [],
      shared: [],
    });
  });

  it("applies one indirect-reports rule to every manager action, following the setting", async () => {
    t = createTestApp();
    team();
    // Ava manages Dan, who manages Leah.
    member("ava", "manager", null);
    t.container.db
      .update(memberships)
      .set({ managerId: "ava" })
      .where(eq(memberships.userId, "dan"))
      .run();
    const recommend = () =>
      t.app.request(
        "/api/v1/probation/employees/leah/recommendation",
        jsonRequest({ recommendation: "confirm", ratings: [], note: "Ready." }),
      );

    // Direct reports only by default: Leah is Dan's, not Ava's.
    as("ava", "manager");
    expect((await t.app.request("/api/v1/team/members/leah")).status).toBe(404);
    expect((await recommend()).status).toBe(403);

    // With indirect reports on, Ava can do everywhere what she can open: no 403 on the recommendation.
    as("dev-user", "owner");
    expect(
      (
        await t.app.request(
          "/api/v1/workspaces/current",
          jsonRequest({ version: 1, includeIndirectReports: true }, "PATCH"),
        )
      ).status,
    ).toBe(200);
    as("ava", "manager");
    expect((await t.app.request("/api/v1/team/members/leah")).status).toBe(200);
    expect((await recommend()).status).toBeLessThan(300);
    const roster = await json<{ people: Array<{ person: { id: string } }> }>(
      await t.app.request("/api/v1/team/onboarding"),
    );
    expect(roster.people.map((row) => row.person.id)).toContain("leah");
  });

  it("lists who needs attention, upcoming check-ins and the knowledge-check matrix", async () => {
    t = createTestApp();
    team();
    as("dan", "manager");
    const attention = await json<{
      items: Array<{ person: { id: string }; severity: string; actions: Array<{ kind: string }> }>;
    }>(await t.app.request("/api/v1/team/attention"));
    expect(
      attention.items
        .filter((item) => item.actions.some((action) => action.kind === "assign_roadmap"))
        .map((item) => item.person.id)
        .sort(),
    ).toEqual(["jonah", "leah"]);
    const checkins = await json<{ items: Array<{ person: { id: string }; title: string }> }>(
      await t.app.request("/api/v1/team/checkins"),
    );
    expect(checkins.items).toContainEqual(
      expect.objectContaining({
        person: expect.objectContaining({ id: "leah" }) as object,
        title: "Weekly 1:1",
      }),
    );
    // Jonah hasn't started, so no check-ins for him yet.
    expect(checkins.items.some((item) => item.person.id === "jonah")).toBe(false);

    const templates = await json<{ roadmap: { templates: Array<{ id: string; name: string }> } }>(
      await t.app.request("/api/v1/team/members/leah/assign-options"),
    );
    await t.app.request(
      "/api/v1/team/members/leah/roadmap",
      jsonRequest({
        templateId: templates.roadmap.templates.find((row) => row.name.startsWith("Engineering"))!
          .id,
        addOnIds: [],
        buddyId: "sana",
      }),
    );
    const matrix = await json<{
      topics: string[];
      rows: Array<{ person: { id: string }; cells: string[] }>;
    }>(await t.app.request("/api/v1/team/check-matrix"));
    expect(matrix).toEqual({
      topics: ["Company and business"],
      rows: [{ person: expect.objectContaining({ id: "leah" }) as object, cells: ["todo"] }],
    });

    // The manager sees the onboarding card on their report's profile; nobody else does.
    const profile = await json<{ onboarding: { status: string } | null }>(
      await t.app.request("/api/v1/people/leah"),
    );
    expect(profile.onboarding).not.toBeNull();
    as("sana", "member");
    expect(
      (await json<{ onboarding: unknown }>(await t.app.request("/api/v1/people/leah"))).onboarding,
    ).toBeNull();
  });
});

describe("Manager: my learning, review queue and team knowledge", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;
  const member = (id: string, role: Actor["role"], managerId: string | null) => {
    t.container.db.insert(users).values({ id, name: id }).onConflictDoNothing().run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: id, role, managerId })
      .onConflictDoNothing()
      .run();
  };
  const as = (id: string, role: Actor["role"]) =>
    Object.assign(t.container.devActor, { id, name: id, role });

  it("lists published paths as suggestions and adds one to the manager's own learning", async () => {
    t = createTestApp();
    const owner = { ...t.container.devActor };
    const project = await createProject(t.app);
    const path = await json<{ id: string; version: number }>(
      await t.app.request(
        "/api/v1/learning/paths",
        jsonRequest({
          projectId: project.id,
          title: "Running readiness reviews",
          roleFamily: "Managers",
          items: [
            {
              type: "reflect",
              title: "What good looks like",
              objective: "Know the bar",
              estMinutes: 20,
              verification: "engagement",
            },
            {
              type: "do",
              title: "Draft your rubric",
              objective: "Practice",
              estMinutes: 40,
              verification: "signoff",
            },
          ],
        }),
      ),
    );
    member("publisher", "admin", null);
    as("publisher", "admin");
    expect(
      (
        await t.app.request(
          `/api/v1/learning/paths/${path.id}/publish`,
          jsonRequest({ version: path.version }),
        )
      ).status,
    ).toBe(200);
    Object.assign(t.container.devActor, owner);
    member("dan", "manager", null);
    as("dan", "manager");
    const before = await json<{
      suggested: Array<{ id: string; kind: string; minutes: number }>;
      assigned: unknown[];
    }>(await t.app.request("/api/v1/me/learning"));
    expect(before.assigned).toEqual([]);
    expect(before.suggested).toEqual([
      expect.objectContaining({ id: path.id, kind: "review", minutes: 60 }),
    ]);
    const after = await json<{
      suggested: unknown[];
      assigned: Array<{ id: string; reason: string; lessonCount: number }>;
    }>(await t.app.request(`/api/v1/me/learning/${path.id}/add`, jsonRequest({})));
    expect(MyLearningSchema.safeParse(after).success).toBe(true);
    expect(after.suggested).toEqual([]);
    expect(after.assigned).toEqual([
      expect.objectContaining({ id: path.id, reason: "Added by you", lessonCount: 2 }),
    ]);
    expect(
      (await t.app.request(`/api/v1/me/learning/${path.id}/add`, jsonRequest({}))).status,
    ).toBe(409);
    expect((await t.app.request("/api/v1/me/learning/missing/add", jsonRequest({}))).status).toBe(
      404,
    );
  });

  it("routes proposed answers to the author's manager when the project has no domain owner", async () => {
    t = createTestApp();
    const project = await createProject(t.app, "Billing");
    await addSource(t.app, project.id);
    await t.drain();
    // No domain owner anywhere, so reviews go to the author's manager.
    t.container.db.delete(assignments).where(eq(assignments.type, "domain_owner")).run();
    member("dan", "manager", null);
    member("leah", "member", "dan");
    // Leah can read the project's sources only once they're shared with the workspace.
    t.container.db.update(sourceObjects).set({ visibility: "workspace" }).run();
    as("leah", "member");
    const answer = await json<{ id: string }>(
      await t.app.request(
        `/api/v1/projects/${project.id}/ask`,
        jsonRequest({ question: "Why is billing moving to the ledger service?" }),
      ),
    );
    expect(
      (await t.app.request(`/api/v1/ask/messages/${answer.id}/promote`, jsonRequest({}))).status,
    ).toBe(201);
    // Leah reports a gap too; reported gaps reach her manager's Home.
    await t.app.request(
      "/api/v1/assistant/gaps",
      jsonRequest({ question: "Who approves refunds over $10k?" }),
    );
    // And flags the project overview as out of date.
    const flag = {
      projectId: project.id,
      targetType: "overview",
      targetId: project.id,
      kind: "stale",
      comment: "",
    };
    expect((await t.app.request("/api/v1/flags", jsonRequest(flag))).status).toBe(201);
    expect(
      (await json<{ items: unknown[] }>(await t.app.request("/api/v1/me/reviews"))).items,
    ).toEqual([]);

    as("dan", "manager");
    const queue = await json<{
      items: Array<{ id: string; author: { id: string }; after: string[]; sources: string[] }>;
    }>(await t.app.request("/api/v1/me/reviews"));
    expect(ReviewQueueSchema.safeParse(queue).success).toBe(true);
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toMatchObject({
      author: expect.objectContaining({ id: "leah" }) as object,
    });
    expect(queue.items[0]!.after[0]).toBe("Question: Why is billing moving to the ledger service?");
    const knowledge = await json<{ awaitingYou: number; queue: unknown[] }>(
      await t.app.request("/api/v1/team/knowledge"),
    );
    expect(knowledge.awaitingYou).toBe(1);
    const gaps = KnowledgeGapListSchema.parse(
      await json(await t.app.request("/api/v1/team/knowledge-gaps")),
    );
    expect(gaps.items.map((item) => [item.reason, item.question])).toEqual([
      ["no_answer", "Who approves refunds over $10k?"],
      ["stale", "Is “Billing” still current?"],
    ]);
    expect(gaps.items[1]!.target).toEqual({
      projectId: project.id,
      targetType: "overview",
      targetId: project.id,
    });
    // "Request update" adds the manager to Leah's open flag instead of opening a second one.
    const requested = await t.app.request("/api/v1/flags", jsonRequest(flag));
    expect(requested.status).toBe(200);
    expect(await json(requested)).toMatchObject({ merged: true });

    const decided = await t.app.request(
      `/api/v1/me/reviews/${queue.items[0]!.id}/decision`,
      jsonRequest({ decision: "approve", comment: "" }),
    );
    expect(ReviewDecisionSchema.parse(await json(decided))).toEqual({
      id: queue.items[0]!.id,
      status: "published",
    });
    expect(
      (
        await t.app.request(
          `/api/v1/me/reviews/${queue.items[0]!.id}/decision`,
          jsonRequest({ decision: "approve", comment: "" }),
        )
      ).status,
    ).toBe(409);
    expect(
      (await json<{ reviewedRecently: number }>(await t.app.request("/api/v1/me/reviews")))
        .reviewedRecently,
    ).toBe(1);

    // Monday's weekly digest tells Dan how many of his team's questions went unanswered (counts only).
    const monday = new Date();
    monday.setUTCDate(monday.getUTCDate() + ((8 - monday.getUTCDay()) % 7 || 7));
    expect(t.container.sweeps.run(monday).weeklyDigests).toBe(1);
    expect(t.container.sweeps.run(monday).weeklyDigests).toBe(0);
    const digest = t.container.db
      .select()
      .from(platformRecords)
      .where(eq(platformRecords.kind, "weekly_digest"))
      .all();
    expect(digest).toHaveLength(1);
    expect(digest[0]).toMatchObject({
      ownerId: "dan",
      data: expect.objectContaining({ reported: 1 }) as object,
    });
  });
});
