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
    const republished = await json<{ history: Array<{ version: string }> }>(
      await t.app.request(
        `/api/v1/people-ops/templates/${created.id}/publish`,
        jsonRequest({ stages, note: "Add incident reviews" }),
      ),
    );
    expect(republished.history.map((entry) => entry.version)).toEqual(["v2", "v1"]);
    expect(audits("onboarding.template.publish")).toHaveLength(2);
  });
});
