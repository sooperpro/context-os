import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { auditLog, memberships, platformRecords, users } from "../../db/schema.js";
import { createProject, createTestApp, jsonRequest, type TestApp } from "../../test/helpers.js";
import type { Actor } from "../../types.js";

/** People Ops (HR) endpoints: role access spec §3, §4.2 HR Home and §4.7. */
describe("People Ops", () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const member = (
    id: string,
    role: Actor["role"] = "member",
    managerId?: string,
    email?: string,
  ) => {
    t.container.db
      .insert(users)
      .values({ id, name: `${id[0]!.toUpperCase()}${id.slice(1)} Person`, email })
      .onConflictDoNothing()
      .run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: id, role, managerId })
      .onConflictDoNothing()
      .run();
  };
  const as = (id: string, role: Actor["role"]) =>
    Object.assign(t.container.devActor, { id, name: id, role });
  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;
  const dayFromToday = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const audits = (action: string) =>
    t.container.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.workspaceId, t.container.workspace.id), eq(auditLog.action, action)))
      .all();

  it("is HR only: admins, owners, managers and employees get 403", async () => {
    t = createTestApp();
    for (const [id, role] of [
      ["owner1", "owner"],
      ["admin1", "admin"],
      ["manager1", "manager"],
      ["member1", "member"],
    ] as const) {
      member(id, role);
      as(id, role);
      for (const path of [
        "/api/v1/people-ops/overview",
        "/api/v1/people-ops/onboardings",
        "/api/v1/people-ops/probation-reviews",
        "/api/v1/people-ops/templates",
      ])
        expect((await t.app.request(path)).status, `${role} ${path}`).toBe(403);
    }
    member("hr1", "hr");
    as("hr1", "hr");
    expect((await t.app.request("/api/v1/people-ops/overview")).status).toBe(200);
  });

  it("lets HR read the People Ops audit trail only, and nobody below admin read it at all", async () => {
    t = createTestApp();
    const owner = { ...t.container.devActor };
    member("hr1", "hr");
    member("dana", "manager");
    member("member1", "member");
    // An admin's change (a role or workspace event) is not the People Ops trail.
    expect(
      (await t.app.request("/api/v1/org/departments", jsonRequest({ name: "Ops" }))).status,
    ).toBe(201);
    as("hr1", "hr");
    const created = await t.app.request(
      "/api/v1/people-ops/onboardings",
      jsonRequest({
        name: "Maya Chen",
        title: "Backend engineer",
        email: "maya@example.com",
        team: "Platform",
        startDate: dayFromToday(10),
        managerId: "dana",
        buddyId: null,
        templateId: null,
      }),
    );
    expect(created.status).toBe(201);

    const trail = async (query = "") =>
      json<{ items: Array<{ action: string }> }>(await t.app.request(`/api/v1/audit${query}`));
    expect((await trail()).items.map((entry) => entry.action)).toEqual([
      "onboarding.record.create",
    ]);
    // Filters narrow the trail but can't widen it past the People Ops events.
    expect((await trail("?action=department.create")).items).toEqual([]);
    expect((await trail("?targetType=onboarding_record")).items).toHaveLength(1);
    const csv = await t.app.request("/api/v1/audit?format=csv");
    expect(csv.status).toBe(200);
    const csvText = await csv.text();
    expect(csvText).toContain("onboarding.record.create");
    expect(csvText).not.toContain("department.create");

    as("dana", "manager");
    expect((await t.app.request("/api/v1/audit")).status).toBe(403);
    as("member1", "member");
    expect((await t.app.request("/api/v1/audit")).status).toBe(403);
    // Admins still see everything.
    Object.assign(t.container.devActor, owner);
    const all = (await trail()).items.map((entry) => entry.action);
    expect(all).toEqual(expect.arrayContaining(["onboarding.record.create", "department.create"]));
  });

  it("lets HR message the new hire, manager and buddy of a record, and says who didn't get it", async () => {
    t = createTestApp();
    member("hr1", "hr");
    member("dana", "manager");
    member("buddy1");
    member("member1", "member");
    member("maya", "member", undefined, "maya@example.com");
    as("hr1", "hr");
    const create = async (body: Record<string, unknown>) =>
      json<{ id: string }>(
        await t.app.request(
          "/api/v1/people-ops/onboardings",
          jsonRequest({
            name: "Maya Chen",
            title: "Backend engineer",
            team: "Platform",
            startDate: dayFromToday(10),
            managerId: "dana",
            buddyId: null,
            templateId: null,
            ...body,
          }),
        ),
      );
    const send = (id: string, body: unknown) =>
      t.app.request(`/api/v1/people-ops/onboardings/${id}/message`, jsonRequest(body));
    const inbox = (userId: string) =>
      t.container.db
        .select()
        .from(platformRecords)
        .where(and(eq(platformRecords.kind, "notification"), eq(platformRecords.ownerId, userId)))
        .all()
        .filter((row) => row.data.type === "onboarding.message")
        .map((row) => row.data);

    // Not signed in yet (no account), and no buddy: only the manager can get it.
    const waiting = await create({ email: "new.hire@example.com" });
    const partial = await send(waiting.id, {
      to: ["person", "manager", "buddy"],
      message: "  Your laptop ships Friday.  ",
    });
    expect(partial.status).toBe(200);
    expect(await json<{ delivered: Array<{ id: string }>; skipped: unknown[] }>(partial)).toEqual({
      delivered: [expect.objectContaining({ id: "dana" })],
      skipped: [
        { name: "Maya Chen", reason: "Hasn't signed in yet" },
        { name: "The buddy", reason: "No buddy is assigned" },
      ],
    });
    expect(inbox("dana")).toEqual([
      expect.objectContaining({
        category: "onboarding",
        title: "hr1 sent you a message about Maya Chen",
        body: "Your laptop ships Friday.",
        link: "/team",
      }),
    ]);

    // Someone with an account gets it too.
    const linked = await create({ email: "maya@example.com", buddyId: "buddy1" });
    const all = await json<{ delivered: Array<{ id: string }>; skipped: unknown[] }>(
      await send(linked.id, { to: ["person", "manager", "buddy"], message: "Welcome!" }),
    );
    expect(all.delivered.map((entry) => entry.id).sort()).toEqual(["buddy1", "dana", "maya"]);
    expect(all.skipped).toEqual([]);
    expect(inbox("maya")).toEqual([
      expect.objectContaining({ title: "hr1 sent you a message", body: "Welcome!", link: "/" }),
    ]);
    expect(inbox("buddy1")[0]).toMatchObject({ link: "/people" });

    // Bad requests, and nobody but HR may send.
    expect((await send(linked.id, { to: [], message: "Hi" })).status).toBe(400);
    expect((await send(linked.id, { to: ["person"], message: "   " })).status).toBe(400);
    expect((await send(linked.id, { to: ["person"], message: "x".repeat(1001) })).status).toBe(400);
    expect((await send("missing", { to: ["person"], message: "Hi" })).status).toBe(404);
    as("dana", "manager");
    expect((await send(linked.id, { to: ["person"], message: "Hi" })).status).toBe(403);
    as("member1", "member");
    expect((await send(linked.id, { to: ["person"], message: "Hi" })).status).toBe(403);
  });

  it("creates a new hire's onboarding, invites them and tracks setup until they sign in", async () => {
    t = createTestApp();
    member("hr1", "hr");
    member("dana", "manager");
    member("buddy");
    as("hr1", "hr");
    const options = await json<{
      managers: Array<{ id: string }>;
      peoplePartners: Array<{ id: string }>;
      templates: Array<{ id: string; name: string }>;
    }>(await t.app.request("/api/v1/people-ops/onboarding-options"));
    expect(options.managers.map((entry) => entry.id)).toContain("dana");
    expect(options.peoplePartners.map((entry) => entry.id)).toEqual(["hr1"]);
    expect(options.templates).toHaveLength(6);
    const startDate = dayFromToday(10);
    const created = await t.app.request(
      "/api/v1/people-ops/onboardings",
      jsonRequest({
        name: "Maya Chen",
        title: "Backend engineer",
        email: "Maya@Example.com",
        team: "Platform",
        startDate,
        managerId: "dana",
        buddyId: null,
        templateId: options.templates[0]!.id,
      }),
    );
    expect(created.status).toBe(201);
    const record = await json<{
      id: string;
      status: string;
      note: string;
      peoplePartner: { id: string };
      setupSteps: Array<{ id: string; done: boolean }>;
      probationReviewId: string | null;
    }>(created);
    expect(record).toMatchObject({ status: "needs_setup", peoplePartner: { id: "hr1" } });
    expect(record.setupSteps.filter((step) => step.done).map((step) => step.id)).toEqual([
      "roadmap",
    ]);
    expect(record.probationReviewId).toBeNull();
    expect(audits("onboarding.record.create")).toHaveLength(1);
    const invitation = t.container.db
      .select()
      .from(platformRecords)
      .where(eq(platformRecords.kind, "invitation"))
      .get();
    expect(invitation?.data).toMatchObject({
      email: "maya@example.com",
      role: "member",
      managerId: "dana",
      isNewHire: true,
    });
    // The same person twice is refused.
    expect(
      (
        await t.app.request(
          "/api/v1/people-ops/onboardings",
          jsonRequest({
            name: "Maya Chen",
            title: "Backend engineer",
            email: "maya@example.com",
            team: "Platform",
            startDate,
            managerId: "dana",
            buddyId: null,
            templateId: null,
          }),
        )
      ).status,
    ).toBe(409);

    const starters = await json<{ items: Array<{ id: string; buddyAssigned: boolean }> }>(
      await t.app.request("/api/v1/people-ops/starters?within=14"),
    );
    expect(starters.items).toEqual([
      expect.objectContaining({ id: record.id, buddyAssigned: false }),
    ]);
    const list = await json<{ counts: Record<string, number>; items: Array<{ id: string }> }>(
      await t.app.request("/api/v1/people-ops/onboardings?filter=starting"),
    );
    expect(list.counts.starting).toBe(1);
    expect(list.items.map((item) => item.id)).toEqual([record.id]);

    const assigned = await json<{ buddy: { id: string }; setup: { done: number } }>(
      await t.app.request(
        `/api/v1/people-ops/onboardings/${record.id}`,
        jsonRequest({ buddyId: "buddy" }, "PATCH"),
      ),
    );
    expect(assigned).toMatchObject({ buddy: { id: "buddy" }, setup: { done: 2 } });
    // Whether an account exists is not something to tick: it completes itself on sign-in.
    const byHand = await t.app.request(
      `/api/v1/people-ops/onboardings/${record.id}/setup/account`,
      jsonRequest({}),
    );
    expect(byHand.status).toBe(409);
    expect(JSON.stringify(await byHand.json())).toContain("completes by itself when they sign in");
    for (const step of ["laptop", "welcome", "calendar"])
      expect(
        (
          await t.app.request(
            `/api/v1/people-ops/onboardings/${record.id}/setup/${step}`,
            jsonRequest({}),
          )
        ).status,
      ).toBe(200);
    // They sign in: the record links to their account and the account step is done.
    member("maya", "member", "dana", "maya@example.com");
    const linked = await json<{
      person: { id: string };
      status: string;
      setupSteps: Array<{ id: string; doneBy: string | null }>;
    }>(await t.app.request(`/api/v1/people-ops/onboardings/${record.id}`));
    expect(linked.person.id).toBe("maya");
    expect(linked.status).toBe("ready");
    expect(linked.setupSteps.find((step) => step.id === "account")?.doneBy).toBe(
      "Account activated",
    );
    expect(
      await json(await t.app.request("/api/v1/people-ops/people/maya/onboarding")),
    ).toMatchObject({ id: record.id, status: "ready" });
  });

  it("runs probation: the manager recommends, HR decides, and the decision is audited", async () => {
    t = createTestApp();
    const owner = { ...t.container.devActor };
    const project = await createProject(t.app);
    member("hr1", "hr");
    member("dana", "manager");
    member("mentor");
    member("sam", "member", "dana");
    member("other", "manager");
    as("dana", "manager");
    const startDate = dayFromToday(-70);
    expect(
      (
        await t.app.request(
          "/api/v1/probation/plans",
          jsonRequest({ userId: "sam", mentorId: "mentor", projectId: project.id, startDate }),
        )
      ).status,
    ).toBe(201);

    // People already onboarding appear for HR without being re-entered.
    as("hr1", "hr");
    const reviews = await json<{
      items: Array<{ id: string; person: { id: string }; state: string; recommendation: string }>;
    }>(await t.app.request("/api/v1/people-ops/probation-reviews?within=30"));
    expect(reviews.items).toHaveLength(1);
    const review = reviews.items[0]!;
    expect(review).toMatchObject({
      person: { id: "sam" },
      state: "checkins_missing",
      recommendation: "awaiting_manager",
    });
    const overdue = await json<{ items: Array<{ id: string; milestone: string }> }>(
      await t.app.request("/api/v1/people-ops/overdue-milestones"),
    );
    expect(overdue.items.map((item) => item.milestone)).toContain("30-day check-in");
    expect(
      await json(
        await t.app.request(
          "/api/v1/people-ops/reminders",
          jsonRequest({ about: "milestone", ids: [overdue.items[0]!.id] }),
        ),
      ),
    ).toMatchObject({ reminded: [{ id: "dana" }] });
    // No decision before the manager's recommendation.
    const decide = (outcome: "confirm" | "extend") =>
      t.app.request(
        `/api/v1/people-ops/probation-reviews/${review.id}/decision`,
        jsonRequest({
          outcome,
          extensionDays: outcome === "extend" ? 30 : null,
          effectiveOn: dayFromToday(20),
          note: "Strong first quarter",
          notify: true,
        }),
      );
    expect((await decide("confirm")).status).toBe(409);
    expect(
      (
        await t.app.request(
          `/api/v1/people-ops/probation-reviews/${review.id}/discuss`,
          jsonRequest({ note: "Can we talk about the billing check?" }),
        )
      ).status,
    ).toBe(200);

    const recommend = () =>
      t.app.request(
        "/api/v1/probation/employees/sam/recommendation",
        jsonRequest({
          recommendation: "confirm",
          ratings: [{ area: "Delivery", level: 2 }],
          note: "Ready to confirm",
        }),
      );
    as("other", "manager");
    expect((await recommend()).status).toBe(403);
    as("dana", "manager");
    expect(await json(await recommend())).toMatchObject({ state: "ready_for_approval" });
    // Managers cannot record the outcome themselves.
    expect(
      (
        await t.app.request(
          "/api/v1/probation/employees/sam/outcome",
          jsonRequest({ version: 1, outcome: "confirmed", note: "Done" }),
        )
      ).status,
    ).toBe(403);

    as("hr1", "hr");
    const detail = await json<{
      state: string;
      ratings: unknown;
      managerNote: string;
      activity: Array<{ kind: string }>;
    }>(await t.app.request(`/api/v1/people-ops/probation-reviews/${review.id}`));
    expect(detail).toMatchObject({
      state: "ready_for_approval",
      ratings: [{ area: "Delivery", level: 2 }],
      managerNote: "Ready to confirm",
    });
    expect(detail.activity.map((entry) => entry.kind)).toEqual([
      "recommended_confirm",
      "review",
      "started",
    ]);
    const decided = await json<{
      state: string;
      decision: { outcome: string; decidedBy: { id: string } };
    }>(await decide("confirm"));
    expect(decided).toMatchObject({
      state: "completed",
      decision: { outcome: "confirmed", decidedBy: { id: "hr1" } },
    });
    expect((await decide("confirm")).status).toBe(409);
    expect(audits("probation.decision")).toHaveLength(1);
    const plan = t.container.db
      .select()
      .from(platformRecords)
      .where(eq(platformRecords.kind, "onboarding_plan"))
      .get();
    expect(plan?.status).toBe("closed");
    const after = await json<{ items: unknown[]; recentlyCompleted: Array<{ id: string }> }>(
      await t.app.request("/api/v1/people-ops/probation-reviews?within=30"),
    );
    expect(after.items).toHaveLength(0);
    expect(after.recentlyCompleted.map((item) => item.id)).toEqual([review.id]);
    Object.assign(t.container.devActor, owner);
  });

  it("edits templates as drafts and publishes versions to the audit log", async () => {
    t = createTestApp();
    member("hr1", "hr");
    as("hr1", "hr");
    const list = await json<{ items: Array<{ id: string; status: string; version: string }> }>(
      await t.app.request("/api/v1/people-ops/templates"),
    );
    expect(list.items).toHaveLength(6);
    expect(list.items.every((item) => item.status === "published" && item.version === "v1")).toBe(
      true,
    );
    const created = await json<{
      id: string;
      status: string;
      publishedVersion: string | null;
      stages: Array<{ id: string; modules: Array<{ id: string }> }>;
    }>(
      await t.app.request(
        "/api/v1/people-ops/templates",
        jsonRequest({ name: "Platform engineer", baseId: list.items[0]!.id }),
      ),
    );
    expect(created).toMatchObject({ status: "draft", publishedVersion: null });
    // A draft template cannot be assigned.
    member("dana", "manager");
    expect(
      (
        await t.app.request(
          "/api/v1/people-ops/onboardings",
          jsonRequest({
            name: "Lee Park",
            title: "Engineer",
            team: "Platform",
            startDate: dayFromToday(5),
            managerId: "dana",
            buddyId: null,
            templateId: created.id,
          }),
        )
      ).status,
    ).toBe(409);
    const stages = created.stages.map((stage) => ({
      id: stage.id,
      moduleIds: stage.modules.map((entry) => entry.id),
    }));
    expect(
      (
        await t.app.request(
          `/api/v1/people-ops/templates/${created.id}/draft`,
          jsonRequest({ stages: [{ id: stages[0]!.id, moduleIds: ["mod-unknown"] }] }),
        )
      ).status,
    ).toBe(400);
    const library = await json<{ items: Array<{ id: string }> }>(
      await t.app.request("/api/v1/people-ops/template-library"),
    );
    expect(library.items.map((item) => item.id)).toContain("mod-incidents");
    stages[0]!.moduleIds = [...stages[0]!.moduleIds, "mod-incidents"];
    const draft = await json<{
      roles: string[];
      stages: Array<{ modules: Array<{ id: string }> }>;
    }>(
      await t.app.request(
        `/api/v1/people-ops/templates/${created.id}/draft`,
        jsonRequest({ stages, roles: ["Platform engineer"] }),
      ),
    );
    expect(draft.roles).toEqual(["Platform engineer"]);
    expect(draft.stages[0]!.modules.at(-1)?.id).toBe("mod-incidents");
    // Every saved draft is on the audit trail; the rejected save above is not.
    expect(audits("onboarding.template.draft")).toHaveLength(1);
    expect(audits("onboarding.template.draft")[0]!.metadata).toMatchObject({
      version: "v1",
      modules: stages.reduce((sum, stage) => sum + stage.moduleIds.length, 0),
    });
    const published = await json<{
      status: string;
      version: string;
      publishedVersion: string;
      history: Array<{ version: string; note: string }>;
    }>(
      await t.app.request(
        `/api/v1/people-ops/templates/${created.id}/publish`,
        jsonRequest({ stages, note: "First version" }),
      ),
    );
    expect(published).toMatchObject({ status: "published", version: "v1", publishedVersion: "v1" });
    expect(published.history[0]).toMatchObject({ version: "v1", note: "First version" });
    // Editing a published template starts v2 as a draft; publishing it adds to the history.
    const v2 = await json<{ version: string; status: string; publishedVersion: string }>(
      await t.app.request(
        `/api/v1/people-ops/templates/${created.id}/draft`,
        jsonRequest({ stages }),
      ),
    );
    expect(v2).toMatchObject({ version: "v2", status: "draft", publishedVersion: "v1" });
    // Editing a published template starts the next version, and the trail says which.
    const drafts = audits("onboarding.template.draft").map((entry) => entry.metadata ?? {});
    expect(drafts.map((entry) => entry.version)).toEqual(["v1", "v2"]);
    const republished = await json<{ history: Array<{ version: string }> }>(
      await t.app.request(
        `/api/v1/people-ops/templates/${created.id}/publish`,
        jsonRequest({ stages, note: "Add incident reviews" }),
      ),
    );
    expect(republished.history.map((entry) => entry.version)).toEqual(["v2", "v1"]);
    expect(audits("onboarding.template.publish")).toHaveLength(2);
  });
  it("archives, restores and deletes templates, and says why one can't be deleted", async () => {
    t = createTestApp();
    member("hr1", "hr");
    member("dana", "manager");
    as("hr1", "hr");
    const base = "/api/v1/people-ops/templates";
    type Summary = { id: string; archived: boolean };
    const list = async (query = "") =>
      (await json<{ items: Summary[] }>(await t.app.request(`${base}${query}`))).items;
    const [used, spare] = await list();
    const assignable = async () =>
      (
        await json<{ templates: Array<{ id: string }> }>(
          await t.app.request("/api/v1/people-ops/onboarding-options"),
        )
      ).templates.map((entry) => entry.id);
    const onboard = (templateId: string, name: string) =>
      t.app.request(
        "/api/v1/people-ops/onboardings",
        jsonRequest({
          name,
          title: "Engineer",
          team: "Platform",
          startDate: dayFromToday(5),
          managerId: "dana",
          buddyId: null,
          templateId,
        }),
      );
    const record = await json<{ id: string }>(await onboard(used!.id, "Lee Park"));

    // Archiving hides it from new onboardings but not from the people on it.
    const archived = await t.app.request(`${base}/${used!.id}/archive`, jsonRequest({}));
    expect(await json(archived)).toMatchObject({ archived: true, deletable: false });
    expect(await list()).toHaveLength(5);
    expect(await list("?archived=include")).toHaveLength(6);
    expect((await list("?archived=include")).find((item) => item.id === used!.id)?.archived).toBe(
      true,
    );
    expect(await assignable()).not.toContain(used!.id);
    expect((await onboard(used!.id, "Kim Ode")).status).toBe(409);
    expect(
      await json(await t.app.request(`/api/v1/people-ops/onboardings/${record.id}`)),
    ).toMatchObject({ template: { id: used!.id } });
    expect(
      (await t.app.request(`${base}/${used!.id}/draft`, jsonRequest({ stages: [] }))).status,
    ).toBe(409);
    expect(
      (await t.app.request(`${base}/${used!.id}/publish`, jsonRequest({ stages: [], note: "" })))
        .status,
    ).toBe(409);
    // A copy of an archived template starts live.
    const copy = await json<{ archived: boolean }>(
      await t.app.request(base, jsonRequest({ name: "Copy", baseId: used!.id })),
    );
    expect(copy.archived).toBe(false);

    // A template people have used is archived, never deleted.
    const refused = await t.app.request(`${base}/${used!.id}`, { method: "DELETE" });
    expect(refused.status).toBe(409);
    expect(JSON.stringify(await refused.json())).toContain("1 onboarding uses this template");

    const restored = await t.app.request(`${base}/${used!.id}/restore`, jsonRequest({}));
    expect(await json(restored)).toMatchObject({ archived: false });
    expect(await assignable()).toContain(used!.id);

    // One nobody used can be deleted for good.
    expect((await t.app.request(`${base}/${spare!.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await t.app.request(`${base}/${spare!.id}`)).status).toBe(404);
    expect(audits("onboarding.template.archive")).toHaveLength(1);
    expect(audits("onboarding.template.restore")).toHaveLength(1);
    expect(audits("onboarding.template.delete")).toHaveLength(1);

    // Only HR.
    as("dana", "manager");
    for (const request of [
      t.app.request(`${base}/${used!.id}/archive`, jsonRequest({})),
      t.app.request(`${base}/${used!.id}/restore`, jsonRequest({})),
      t.app.request(`${base}/${used!.id}`, { method: "DELETE" }),
      t.app.request(`${base}/${used!.id}/versions/1`),
    ])
      expect((await request).status).toBe(403);
  });

  it("never deletes the last template, so the starter set does not come back", async () => {
    t = createTestApp();
    member("hr1", "hr");
    as("hr1", "hr");
    const base = "/api/v1/people-ops/templates";
    const ids = (await json<{ items: Array<{ id: string }> }>(await t.app.request(base))).items.map(
      (item) => item.id,
    );
    for (const id of ids.slice(0, -1))
      expect((await t.app.request(`${base}/${id}`, { method: "DELETE" })).status).toBe(204);
    const last = await t.app.request(`${base}/${ids.at(-1)}`, { method: "DELETE" });
    expect(last.status).toBe(409);
    expect(JSON.stringify(await last.json())).toContain("at least one template");
    expect((await json<{ items: unknown[] }>(await t.app.request(base))).items).toHaveLength(1);
  });

  it("keeps a copy of each published version so an old one can be opened", async () => {
    t = createTestApp();
    member("hr1", "hr");
    as("hr1", "hr");
    const base = "/api/v1/people-ops/templates";
    type Detail = {
      id: string;
      history: Array<{ version: string; saved: boolean }>;
      stages: Array<{ id: string; modules: Array<{ id: string }> }>;
    };
    const [seeded, first] = (
      await json<{ items: Array<{ id: string }> }>(await t.app.request(base))
    ).items;
    const created = await json<Detail>(
      await t.app.request(base, jsonRequest({ name: "Platform engineer", baseId: first!.id })),
    );
    const stageId = created.stages[0]!.id;
    const original = created.stages[0]!.modules.map((entry) => entry.id);
    const withExtra = [...original, "mod-incidents"];

    await t.app.request(
      `${base}/${created.id}/publish`,
      jsonRequest({ stages: [{ id: stageId, moduleIds: withExtra }], note: "First version" }),
    );
    // v2 drops the extra module again; v1's copy must not change.
    await t.app.request(
      `${base}/${created.id}/draft`,
      jsonRequest({ stages: [{ id: stageId, moduleIds: original }] }),
    );
    const published = await json<Detail>(
      await t.app.request(
        `${base}/${created.id}/publish`,
        jsonRequest({ stages: [{ id: stageId, moduleIds: original }], note: "Drop incidents" }),
      ),
    );
    expect(published.history).toEqual([
      expect.objectContaining({ version: "v2", saved: true }),
      expect.objectContaining({ version: "v1", saved: true }),
    ]);
    // Work in progress on v3 does not touch what v1 and v2 were.
    await t.app.request(
      `${base}/${created.id}/draft`,
      jsonRequest({ stages: [{ id: stageId, moduleIds: [] }] }),
    );
    const version = async (n: number | string) =>
      t.app.request(`${base}/${created.id}/versions/${n}`);
    const v1 = await json<{
      version: string;
      note: string;
      publishedOn: string;
      stages: Array<{ modules: Array<{ id: string }> }>;
    }>(await version(1));
    expect(v1).toMatchObject({ version: "v1", note: "First version" });
    expect(v1.stages[0]!.modules.map((entry) => entry.id)).toEqual(withExtra);
    const v2 = await json<{ stages: Array<{ modules: Array<{ id: string }> }> }>(await version(2));
    expect(v2.stages[0]!.modules.map((entry) => entry.id)).toEqual(original);

    // A version nobody saved a copy of, or that doesn't exist, can't be opened.
    expect((await version(3)).status).toBe(404);
    expect((await version("abc")).status).toBe(400);
    const seededDetail = await json<Detail>(await t.app.request(`${base}/${seeded!.id}`));
    expect(seededDetail.history[0]).toMatchObject({ version: "v1", saved: false });
    expect((await t.app.request(`${base}/${seeded!.id}/versions/1`)).status).toBe(404);
  });
});
