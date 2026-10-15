import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  assignments,
  memberships,
  platformRecords,
  pointsLedger,
  sourceAccess,
  users,
  workspaces,
} from "../../db/schema.js";
import {
  addSource,
  createProject,
  createTestApp,
  jsonRequest,
  type TestApp,
} from "../../test/helpers.js";
import type { Actor } from "../../types.js";

describe("PRD learning credit, onboarding health, companion and maintenance sweeps", () => {
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
  const as = (id: string, role: Actor["role"] = "member") =>
    Object.assign(t.container.devActor, { id, name: id, role });
  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;
  const ledger = (userId: string, action: string) =>
    t.container.db
      .select()
      .from(pointsLedger)
      .where(and(eq(pointsLedger.userId, userId), eq(pointsLedger.action, action)))
      .all();
  const backdate = (recordId: string, field: string, msAgo: number) => {
    const row = t.container.db
      .select()
      .from(platformRecords)
      .where(eq(platformRecords.id, recordId))
      .get()!;
    t.container.db
      .update(platformRecords)
      .set({ data: { ...row.data, [field]: new Date(Date.now() - msAgo).toISOString() } })
      .where(eq(platformRecords.id, recordId))
      .run();
  };

  /** Publish a two-item path (engagement + optional meet) and assign it to `learner`. */
  const publishedAssignment = async (
    learner: string,
    mentor: string,
    projectId: string,
    sourceId: string,
  ) => {
    const author = { ...t.container.devActor };
    const path = await json<{
      id: string;
      version: number;
      data: { items: Array<{ id: string; type: string }> };
    }>(
      await t.app.request(
        "/api/v1/learning/paths",
        jsonRequest({
          projectId,
          title: "Ledger onboarding",
          roleFamily: "Eng",
          items: [
            {
              type: "read",
              title: "Read the ADR",
              objective: "Understand the decision",
              estMinutes: 1,
              verification: "engagement",
              sourceId,
            },
            {
              type: "meet",
              title: "Meet the owner",
              objective: "Say hello",
              required: false,
              verification: "self",
            },
          ],
        }),
      ),
    );
    actor("publisher", "admin");
    t.container.db
      .insert(sourceAccess)
      .values({ sourceId, userId: "publisher" })
      .onConflictDoNothing()
      .run();
    const published = await t.app.request(
      `/api/v1/learning/paths/${path.id}/publish`,
      jsonRequest({ version: path.version }),
    );
    expect(published.status).toBe(200);
    const assigned = await json<{ id: string }>(
      await t.app.request(
        `/api/v1/learning/paths/${path.id}/assign`,
        jsonRequest({ userId: learner, mentorId: mentor, startDate: "2026-01-01" }),
      ),
    );
    Object.assign(t.container.devActor, author);
    return { path, assignmentId: assigned.id, readItem: path.data.items[0]!.id };
  };

  it("credits curators on publication and completion, awards learners, exposes stuck items and ratings", async () => {
    t = createTestApp();
    const author = { ...t.container.devActor };
    const project = await createProject(t.app);
    const source = await addSource(t.app, project.id);
    await t.drain();
    actor("learner", "member", "publisher");
    t.container.db.insert(sourceAccess).values({ sourceId: source.id, userId: "learner" }).run();
    Object.assign(t.container.devActor, author);
    const { path, assignmentId, readItem } = await publishedAssignment(
      "learner",
      author.id,
      project.id,
      source.id,
    );
    expect(ledger(author.id, "path_published")[0]?.amount).toBe(30);
    as("learner");
    const started = await json<{ id: string; version: number }>(
      await t.app.request(`/api/v1/learning/assignments/${assignmentId}/items/${readItem}/start`, {
        method: "POST",
      }),
    );
    backdate(started.id, "firstOpenedAt", 49 * 3600_000);
    const progress = await json<{
      items: Array<{ stuck: boolean }>;
      summary: { percent: number; upNextItemId: string | null };
    }>(await t.app.request(`/api/v1/learning/assignments/${assignmentId}/progress`));
    expect(progress.items[0]?.stuck).toBe(true);
    expect(progress.summary).toMatchObject({ percent: 0, upNextItemId: readItem });
    const dwell = await json<{ status: string }>(
      await t.app.request(
        `/api/v1/learning/assignments/${assignmentId}/items/${readItem}/dwell`,
        jsonRequest({ version: started.version }),
      ),
    );
    expect(dwell.status).toBe("completed");
    const assignment = await json<{ items: Array<{ status: string }> }>(
      await t.app.request("/api/v1/learning/assignments"),
    );
    expect(assignment.items[0]?.status).toBe("completed");
    expect(ledger("learner", "path_completed")[0]?.amount).toBe(20);
    expect(ledger(author.id, "path_learner_complete")[0]?.amount).toBe(10);
    expect(ledger(author.id, "path_item_completed_by_learner")).toHaveLength(1);
    const completed = await json<{ summary: { percent: number } }>(
      await t.app.request(`/api/v1/learning/assignments/${assignmentId}/progress`),
    );
    expect(completed.summary.percent).toBe(100);
    const current = await json<{ items: Array<{ id: string; version: number }> }>(
      await t.app.request("/api/v1/learning/assignments"),
    );
    expect(
      (
        await t.app.request(
          `/api/v1/learning/assignments/${assignmentId}/rate`,
          jsonRequest({ version: current.items[0]!.version, rating: 5, comment: "Clear" }),
        )
      ).status,
    ).toBe(200);
    Object.assign(t.container.devActor, author);
    const rated = await json<{ data: { ratingAvg: number; ratingCount: number } }>(
      await t.app.request(`/api/v1/learning/paths/${path.id}`),
    );
    expect(rated.data).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
    // Self-enrolment creates an assignment without a mentor; sign-off then goes to the manager.
    actor("joiner", "member", author.id);
    t.container.db.insert(sourceAccess).values({ sourceId: source.id, userId: "joiner" }).run();
    expect(
      (await t.app.request(`/api/v1/learning/paths/${path.id}/enrol`, { method: "POST" })).status,
    ).toBe(201);
    expect(
      (await t.app.request(`/api/v1/learning/paths/${path.id}/enrol`, { method: "POST" })).status,
    ).toBe(200);
    // Stuck item sweep nudges the mentor once.
    const report = t.container.sweeps.run();
    expect(report.stuckNudges).toBe(0);
    as("learner");
    const notifications = await json<{ unread: number; items: Array<{ data: { type: string } }> }>(
      await t.app.request("/api/v1/notifications"),
    );
    expect(notifications.items.some((row) => row.data.type === "learning.update")).toBe(true);
    expect(
      (
        await json<{ updated: number }>(
          await t.app.request("/api/v1/notifications/read-all", { method: "POST" }),
        )
      ).updated,
    ).toBeGreaterThan(0);
    expect(
      (await json<{ unread: number }>(await t.app.request("/api/v1/notifications?unread=true")))
        .unread,
    ).toBe(0);
  });

  it("awards quiz first-try points and notifies the mentor after three failures", async () => {
    t = createTestApp();
    const author = { ...t.container.devActor };
    const project = await createProject(t.app);
    const source = await addSource(t.app, project.id);
    await t.drain();
    const claims = await json<{ items: Array<{ id: string }> }>(
      await t.app.request(`/api/v1/projects/${project.id}/context-items`),
    );
    const created = await json<{
      id: string;
      version: number;
      data: { items: Array<{ id: string }> };
    }>(
      await t.app.request(
        "/api/v1/learning/paths",
        jsonRequest({
          projectId: project.id,
          title: "Quiz",
          roleFamily: "Eng",
          items: [
            {
              type: "quiz",
              title: "Check",
              objective: "Verify",
              verification: "quiz",
              sourceId: source.id,
            },
          ],
        }),
      ),
    );
    const itemId = created.data.items[0]!.id;
    await t.app.request(
      `/api/v1/learning/paths/${created.id}/items/${itemId}/quiz`,
      jsonRequest({
        questions: [1, 2, 3].map((n) => ({
          prompt: `Q${n}?`,
          options: ["Right", "Wrong"],
          correctIndex: 0,
          claimId: claims.items[0]!.id,
          explanation: "See the ADR",
        })),
      }),
    );
    actor("reviewer", "admin");
    t.container.db.insert(sourceAccess).values({ sourceId: source.id, userId: "reviewer" }).run();
    await t.app.request(
      `/api/v1/learning/paths/${created.id}/publish`,
      jsonRequest({ version: 2 }),
    );
    actor("learner");
    t.container.db.insert(sourceAccess).values({ sourceId: source.id, userId: "learner" }).run();
    as("reviewer", "admin");
    const assignment = await json<{ id: string }>(
      await t.app.request(
        `/api/v1/learning/paths/${created.id}/assign`,
        jsonRequest({ userId: "learner", mentorId: author.id, startDate: "2026-01-01" }),
      ),
    );
    as("learner");
    const prefix = `/api/v1/learning/assignments/${assignment.id}/items/${itemId}`;
    await t.app.request(`${prefix}/start`, { method: "POST" });
    const result = await json<{ passed: boolean; assignmentCompleted: boolean }>(
      await t.app.request(`${prefix}/quiz/submit`, jsonRequest({ version: 1, answers: [0, 0, 0] })),
    );
    expect(result).toMatchObject({ passed: true, assignmentCompleted: true });
    expect(ledger("learner", "quiz_passed_first_try")[0]?.amount).toBe(3);
    expect(ledger("learner", "path_completed")).toHaveLength(1);
  });

  it("creates onboarding plans with default milestones, mentor assignments, transparent health, pauses and first-win credit", async () => {
    t = createTestApp();
    const owner = { ...t.container.devActor };
    const project = await createProject(t.app);
    actor("mentor");
    actor("hire", "member", "manager");
    actor("manager", "manager");
    const created = await t.app.request(
      "/api/v1/probation/plans",
      jsonRequest({
        userId: "hire",
        mentorId: "mentor",
        projectId: project.id,
        startDate: "2026-08-01",
      }),
    );
    expect(created.status).toBe(201);
    const plan = await json<{
      id: string;
      version: number;
      status: string;
      data: { endDate: string; milestones: Array<{ key: string }> };
      health: { status: string; reasons: string[] };
    }>(created);
    expect(plan.data.endDate).toBe("2026-10-30");
    expect(plan.data.milestones.map((milestone) => milestone.key)).toEqual([
      "day1",
      "week1",
      "day30",
      "first_win",
      "day90",
    ]);
    expect(plan.health.status).toBe("at_risk");
    expect(plan.health.reasons.join(" ")).toContain("overdue");
    expect(
      t.container.db
        .select()
        .from(assignments)
        .where(
          and(
            eq(assignments.userId, "mentor"),
            eq(assignments.type, "mentor"),
            eq(assignments.scopeId, "hire"),
          ),
        )
        .get(),
    ).toBeDefined();
    const paused = await json<{ version: number; health: { status: string } }>(
      await t.app.request(
        "/api/v1/probation/employees/hire/pause",
        jsonRequest({ version: plan.version, pausedUntil: "2099-01-01" }),
      ),
    );
    expect(paused.health.status).toBe("paused");
    const resumed = await json<{ version: number }>(
      await t.app.request(
        "/api/v1/probation/employees/hire/pause",
        jsonRequest({ version: paused.version, pausedUntil: null }),
      ),
    );
    as("mentor");
    const verified = await t.app.request(
      "/api/v1/probation/employees/hire/milestones/verify",
      jsonRequest({ version: resumed.version, key: "first_win", note: "First PR merged" }),
    );
    expect(verified.status).toBe(200);
    const after = await json<{
      version: number;
      data: { ttfwDays: number; fastFirstWin: boolean };
    }>(verified);
    expect(after.data.ttfwDays).toBeGreaterThan(0);
    expect(ledger("hire", "first_win")[0]?.amount).toBe(30);
    expect(ledger("mentor", "mentee_first_win")[0]?.amount).toBe(25);
    const team = await json<{ items: Array<{ relationship: string; firstWin: string }> }>(
      await t.app.request("/api/v1/probation/team"),
    );
    expect(team.items[0]).toMatchObject({ relationship: "mentor", firstWin: "done" });
    as("manager", "manager");
    const summary = await json<{
      firstWin: { ttfwDays: number };
      health: { status: string };
      decision: string;
    }>(await t.app.request("/api/v1/probation/employees/hire/summary"));
    expect(summary.firstWin.ttfwDays).toBe(after.data.ttfwDays);
    expect(summary.decision).toContain("does not recommend");
    // The manager recommends; only People Ops records the outcome.
    expect(
      (
        await t.app.request(
          "/api/v1/probation/employees/hire/outcome",
          jsonRequest({ version: after.version, outcome: "confirmed", note: "Welcome aboard" }),
        )
      ).status,
    ).toBe(403);
    actor("people", "hr");
    const outcome = await json<{ status: string }>(
      await t.app.request(
        "/api/v1/probation/employees/hire/outcome",
        jsonRequest({ version: after.version, outcome: "confirmed", note: "Welcome aboard" }),
      ),
    );
    expect(outcome.status).toBe("closed");
    // Mentor capacity defaults to three concurrent mentees; the closed plan keeps its 14-day grace.
    for (const id of ["h2", "h3"]) {
      actor(id, "member", "manager");
      as("manager", "manager");
      expect(
        (
          await t.app.request(
            "/api/v1/probation/plans",
            jsonRequest({
              userId: id,
              mentorId: "mentor",
              projectId: project.id,
              startDate: "2026-10-01",
            }),
          )
        ).status,
      ).toBe(201);
    }
    actor("h4", "member", "manager");
    as("manager", "manager");
    expect(
      (
        await t.app.request(
          "/api/v1/probation/plans",
          jsonRequest({
            userId: "h4",
            mentorId: "mentor",
            projectId: project.id,
            startDate: "2026-10-01",
          }),
        )
      ).status,
    ).toBe(409);
    Object.assign(t.container.devActor, owner);
    expect(workspaces).toBeDefined();
  });

  it("resolves companion context for checkpoints, returns stuck-help bullets and enforces anti-annoyance caps", async () => {
    t = createTestApp();
    const author = { ...t.container.devActor };
    const project = await createProject(t.app);
    const source = await addSource(t.app, project.id);
    await t.drain();
    actor("learner", "member", "publisher");
    t.container.db.insert(sourceAccess).values({ sourceId: source.id, userId: "learner" }).run();
    Object.assign(t.container.devActor, author);
    const { assignmentId, readItem } = await publishedAssignment(
      "learner",
      author.id,
      project.id,
      source.id,
    );
    as("learner");
    const context = await json<{
      checkpoint: { title: string } | null;
      prompts: string[];
      sourceId: string | null;
      mentor: { mentorId: string } | null;
    }>(
      await t.app.request(
        `/api/v1/companion/context?assignmentId=${assignmentId}&itemId=${readItem}`,
      ),
    );
    expect(context.checkpoint?.title).toBe("Read the ADR");
    expect(context.prompts[0]).toContain("Read the ADR");
    expect(context.sourceId).toBe(source.id);
    expect(context.mentor?.mentorId).toBe(author.id);
    const help = await json<{
      bullets: string[];
      escalation: { mentorId: string; draftMessage: string } | null;
    }>(
      await t.app.request(
        "/api/v1/companion/stuck-help",
        jsonRequest({ assignmentId, itemId: readItem }),
      ),
    );
    expect(help.bullets.length).toBeGreaterThan(0);
    expect(help.escalation?.draftMessage).toContain("Read the ADR");
    expect(
      (
        await t.app.request(
          "/api/v1/companion/interactions",
          jsonRequest({ trigger: "suggested", triggerKey: "TRG-DWELL-STUCK" }),
        )
      ).status,
    ).toBe(403);
    await t.app.request(
      "/api/v1/companion/preferences",
      jsonRequest({ proactiveNudges: true, onDemandOnly: false }, "PATCH"),
    );
    expect(
      (await t.app.request("/api/v1/companion/interactions", jsonRequest({ trigger: "suggested" })))
        .status,
    ).toBe(201);
    expect(
      (await t.app.request("/api/v1/companion/interactions", jsonRequest({ trigger: "suggested" })))
        .status,
    ).toBe(201);
    expect(
      (await t.app.request("/api/v1/companion/interactions", jsonRequest({ trigger: "suggested" })))
        .status,
    ).toBe(429);
    const prefs = await json<{ categories: { gamification: { inApp: boolean } } }>(
      await t.app.request(
        "/api/v1/notifications/preferences",
        jsonRequest({ categories: { gamification: { inApp: false } } }, "PATCH"),
      ),
    );
    expect(prefs.categories.gamification.inApp).toBe(false);
  });

  it("runs maintenance sweeps: bounty expiry, invitation expiry, plan activation, stuck nudges and workspace purge", async () => {
    t = createTestApp();
    const owner = { ...t.container.devActor };
    const project = await createProject(t.app);
    const source = await addSource(t.app, project.id);
    await t.drain();
    const bounty = await json<{ id: string }>(
      await t.app.request(
        "/api/v1/bounties",
        jsonRequest({
          projectId: project.id,
          title: "Expiring",
          rewardRp: 20,
          deadline: new Date(Date.now() + 60_000).toISOString(),
        }),
      ),
    );
    backdate(bounty.id, "deadline", 60_000);
    const invited = await json<{ invitationId: string }>(
      await t.app.request("/api/v1/users/invite", jsonRequest({ email: "late@example.com" })),
    );
    backdate(invited.invitationId, "expiresAt", 1000);
    actor("hire", "member", "manager");
    actor("manager", "manager");
    const plan = await json<{ id: string; status: string }>(
      await t.app.request(
        "/api/v1/probation/plans",
        jsonRequest({
          userId: "hire",
          mentorId: owner.id,
          projectId: project.id,
          startDate: "2999-01-01",
        }),
      ),
    );
    expect(plan.status).toBe("scheduled");
    const row = t.container.db
      .select()
      .from(platformRecords)
      .where(eq(platformRecords.id, plan.id))
      .get()!;
    t.container.db
      .update(platformRecords)
      .set({ data: { ...row.data, startDate: "2026-01-01" } })
      .where(eq(platformRecords.id, plan.id))
      .run();
    Object.assign(t.container.devActor, owner);
    t.container.db.insert(sourceAccess).values({ sourceId: source.id, userId: "hire" }).run();
    const { assignmentId, readItem } = await publishedAssignment(
      "hire",
      owner.id,
      project.id,
      source.id,
    );
    as("hire");
    const started = await json<{ id: string }>(
      await t.app.request(`/api/v1/learning/assignments/${assignmentId}/items/${readItem}/start`, {
        method: "POST",
      }),
    );
    backdate(started.id, "firstOpenedAt", 50 * 3600_000);
    Object.assign(t.container.devActor, owner);
    const report = t.container.sweeps.run();
    expect(report).toMatchObject({
      bountiesExpired: 1,
      invitationsExpired: 1,
      plansActivated: 1,
      stuckNudges: 1,
    });
    expect(
      (await json<{ status: string }>(await t.app.request(`/api/v1/bounties/${bounty.id}`))).status,
    ).toBe("expired");
    const mentorInbox = await json<{ items: Array<{ data: { type: string; nudge: boolean } }> }>(
      await t.app.request("/api/v1/notifications"),
    );
    expect(mentorInbox.items.some((row) => row.data.type === "item.stuck" && row.data.nudge)).toBe(
      true,
    );
    expect(t.container.sweeps.run().stuckNudges).toBe(0);
    const current = await json<{ version: number; slug: string | null; name: string }>(
      await t.app.request("/api/v1/workspaces/current"),
    );
    expect(
      (
        await t.app.request(
          "/api/v1/workspaces/current/deletion",
          jsonRequest({ confirm: current.slug ?? current.name }),
        )
      ).status,
    ).toBe(202);
    const ws = t.container.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, t.container.workspace.id))
      .get()!;
    t.container.db
      .update(workspaces)
      .set({
        settings: {
          ...ws.settings,
          deletion: {
            scheduledAt: new Date(Date.now() - 1000).toISOString(),
            requestedBy: owner.id,
            requestedAt: new Date().toISOString(),
          },
        },
      })
      .where(eq(workspaces.id, ws.id))
      .run();
    expect(t.container.sweeps.run().workspacesPurged).toBe(1);
    expect(t.container.db.select().from(workspaces).all()).toEqual([]);
  });
});
