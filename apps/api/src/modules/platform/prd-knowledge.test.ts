import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  assignments,
  memberships,
  platformRecords,
  pointsLedger,
  sourceAccess,
  users,
} from "../../db/schema.js";
import {
  addSource,
  createFakeGemini,
  createProject,
  createTestApp,
  EMPTY_EXTRACTION,
  jsonRequest,
  SAMPLE_SOURCE,
  type TestApp,
} from "../../test/helpers.js";
import type { Actor } from "../../types.js";

describe("PRD conflicts, flags, bounties and Ask promotion", () => {
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
  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;
  const grant = (sourceId: string, userId: string) =>
    t.container.db.insert(sourceAccess).values({ sourceId, userId }).onConflictDoNothing().run();
  const domainOwner = (userId: string, projectId: string) =>
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
  const ledger = (userId: string, action: string) =>
    t.container.db
      .select()
      .from(pointsLedger)
      .where(and(eq(pointsLedger.userId, userId), eq(pointsLedger.action, action)))
      .all();
  /** Two status claims about the same subject with incompatible states. */
  const conflictingGemini = () =>
    createFakeGemini({
      extraction: (request) => {
        const active = request.prompt.includes("now in progress");
        return {
          ...EMPTY_EXTRACTION,
          statusClaims: [
            {
              title: "Historical invoice migration",
              summary: active
                ? "Migration is now in progress."
                : "Migration is blocked on the retention review.",
              state: active ? "active" : "blocked",
              asOf: active ? "2026-04-10" : "2026-03-04",
              evidenceQuote: active
                ? "migration is now in progress"
                : "is currently blocked on the data retention review",
              confidence: "high",
            },
          ],
        };
      },
    });

  it("materialises open conflicts with an auto-bounty, requires evidence parity and resolves with supersession", async () => {
    t = createTestApp({ gemini: conflictingGemini() });
    const owner = { ...t.container.devActor };
    const project = await createProject(t.app);
    const older = await addSource(t.app, project.id);
    const newer = await addSource(t.app, project.id, {
      kind: "document",
      title: "Status update 2026-04-10",
      content:
        "Update: the historical invoice migration is now in progress after the review closed.",
      sourceCreatedAt: "2026-04-10T09:00:00.000Z",
    });
    await t.drain();
    const list = await json<{
      items: Array<{
        id: string;
        status: string;
        memberCount: number;
        bountyId: string | null;
        version: number;
        members: Array<{ id: string; asOf: string | null }>;
      }>;
    }>(await t.app.request(`/api/v1/projects/${project.id}/conflicts`));
    expect(list.items).toHaveLength(1);
    const conflict = list.items[0]!;
    expect(conflict).toMatchObject({ status: "open", memberCount: 2 });
    expect(conflict.bountyId).toBeTruthy();
    const bounty = t.container.db
      .select()
      .from(platformRecords)
      .where(eq(platformRecords.id, conflict.bountyId!))
      .get();
    expect(bounty).toMatchObject({ kind: "bounty", status: "draft", ownerId: "system" });
    expect(bounty?.data).toMatchObject({ origin: "conflict", rewardRp: 40 });
    const canonical = conflict.members.find((member) => member.asOf?.startsWith("2026-04-10"))!;
    // A member without a domain owner assignment cannot resolve.
    actor("reviewer");
    grant(older.id, "reviewer");
    grant(newer.id, "reviewer");
    expect(
      (
        await t.app.request(
          `/api/v1/projects/${project.id}/conflicts/${conflict.id}/resolve`,
          jsonRequest({
            version: conflict.version,
            outcome: "resolved",
            canonicalItemId: canonical.id,
            rationale: "Newer update",
          }),
        )
      ).status,
    ).toBe(403);
    // A domain owner who cannot read every member's evidence is blocked (PP-9).
    actor("partial", "admin");
    domainOwner("partial", project.id);
    grant(newer.id, "partial");
    expect(
      (await t.app.request(`/api/v1/projects/${project.id}/conflicts/${conflict.id}`)).status,
    ).toBe(404);
    Object.assign(t.container.devActor, owner);
    const reviewed = await json<{ status: string; version: number }>(
      await t.app.request(
        `/api/v1/projects/${project.id}/conflicts/${conflict.id}/review`,
        jsonRequest({ version: conflict.version }),
      ),
    );
    expect(reviewed.status).toBe("under_review");
    const resolved = await t.app.request(
      `/api/v1/projects/${project.id}/conflicts/${conflict.id}/resolve`,
      jsonRequest({
        version: reviewed.version,
        outcome: "resolved",
        canonicalItemId: canonical.id,
        rationale: "The April update is authoritative",
      }),
    );
    expect(resolved.status).toBe(200);
    expect(await json<{ status: string; canonicalItemId: string }>(resolved)).toMatchObject({
      status: "resolved",
      canonicalItemId: canonical.id,
    });
    const claims = await json<{
      items: Array<{ id: string; verification: string; supersededBy?: string | null }>;
    }>(await t.app.request(`/api/v1/projects/${project.id}/context-items?kind=status_claim`));
    expect(claims.items.find((item) => item.id === canonical.id)?.verification).toBe("confirmed");
    const loser = claims.items.find((item) => item.id !== canonical.id)!;
    expect(loser.verification).toBe("superseded");
    expect(loser.supersededBy).toBe(canonical.id);
    expect(ledger(owner.id, "resolve_conflict")).toHaveLength(1);
    expect(
      t.container.db
        .select()
        .from(platformRecords)
        .where(eq(platformRecords.id, conflict.bountyId!))
        .get()?.status,
    ).toBe("cancelled");
    expect(
      (
        await json<{ items: unknown[] }>(
          await t.app.request(`/api/v1/projects/${project.id}/conflicts`),
        )
      ).items,
    ).toHaveLength(0);
    expect(
      (
        await json<{ items: unknown[] }>(
          await t.app.request(`/api/v1/projects/${project.id}/conflicts?history=true`),
        )
      ).items,
    ).toHaveLength(1);
  });

  it("lets any reader dispute a rule-resolved conflict, reopening it for human review", async () => {
    t = createTestApp({ gemini: conflictingGemini() });
    const project = await createProject(t.app);
    await addSource(t.app, project.id);
    await addSource(t.app, project.id, {
      kind: "conversation",
      title: "Standup 2026-04-10",
      content: "Priya said the historical invoice migration is now in progress.",
      sourceCreatedAt: "2026-04-10T09:00:00.000Z",
    });
    await t.drain();
    const list = await json<{
      items: Array<{ id: string; status: string; version: number; autoRule: string | null }>;
    }>(await t.app.request(`/api/v1/projects/${project.id}/conflicts`));
    expect(list.items[0]).toMatchObject({ status: "auto_resolved" });
    expect(list.items[0]?.autoRule).toContain("authoritative");
    const disputed = await t.app.request(
      `/api/v1/projects/${project.id}/conflicts/${list.items[0]!.id}/dispute`,
      jsonRequest({
        version: list.items[0]!.version,
        reason: "The standup was about a different migration",
      }),
    );
    expect(disputed.status).toBe(200);
    expect(await json<{ status: string; bountyId: string | null }>(disputed)).toMatchObject({
      status: "open",
    });
    const claims = await json<{ items: Array<{ verification: string }> }>(
      await t.app.request(`/api/v1/projects/${project.id}/context-items?kind=status_claim`),
    );
    expect(claims.items.map((item) => item.verification).sort()).toEqual(["disputed", "inferred"]);
  });

  it("routes flags, merges co-reporters, rate-limits flaggers and converts a flag into a paid bounty", async () => {
    t = createTestApp();
    const owner = { ...t.container.devActor };
    const project = await createProject(t.app);
    const source = await addSource(t.app, project.id);
    await t.drain();
    const items = await json<{ items: Array<{ id: string }> }>(
      await t.app.request(`/api/v1/projects/${project.id}/context-items?kind=decision`),
    );
    const targetId = items.items[0]!.id;
    const flagResponse = await t.app.request(
      "/api/v1/flags",
      jsonRequest({
        projectId: project.id,
        targetType: "context_item",
        targetId,
        kind: "stale",
        comment: "ADR is outdated",
      }),
    );
    expect(flagResponse.status).toBe(201);
    const flag = await json<{
      id: string;
      version: number;
      data: { routedTo: { userId: string; basis: string }; section: string };
    }>(flagResponse);
    expect(flag.data.routedTo).toMatchObject({ userId: owner.id, basis: "workspace_domain_owner" });
    expect(flag.data.section).toBe("decisions");
    actor("alice");
    grant(source.id, "alice");
    const merged = await t.app.request(
      "/api/v1/flags",
      jsonRequest({ projectId: project.id, targetType: "context_item", targetId, kind: "stale" }),
    );
    expect(merged.status).toBe(200);
    expect(await json<{ merged: boolean; data: { coReporters: string[] } }>(merged)).toMatchObject({
      merged: true,
      data: { coReporters: ["alice"] },
    });
    for (let index = 0; index < 30; index++)
      expect(
        (
          await t.app.request(
            "/api/v1/flags",
            jsonRequest({
              projectId: project.id,
              targetType: "overview",
              targetId: project.id,
              kind: "missing_context",
            }),
          )
        ).status,
      ).toBe(201);
    expect(
      (
        await t.app.request(
          "/api/v1/flags",
          jsonRequest({
            projectId: project.id,
            targetType: "overview",
            targetId: project.id,
            kind: "missing_context",
          }),
        )
      ).status,
    ).toBe(429);
    Object.assign(t.container.devActor, owner);
    const triaged = await json<{ version: number }>(
      await t.app.request(
        `/api/v1/flags/${flag.id}`,
        jsonRequest({ version: flag.version + 1, status: "triaged" }, "PATCH"),
      ),
    );
    const converted = await t.app.request(
      `/api/v1/flags/${flag.id}`,
      jsonRequest({ version: triaged.version, status: "bounty_created", rewardRp: 25 }, "PATCH"),
    );
    expect(converted.status).toBe(200);
    const convertedFlag = await json<{ status: string; data: { bountyId: string } }>(converted);
    expect(convertedFlag.status).toBe("bounty_created");
    expect(ledger(owner.id, "flag_accepted")).toHaveLength(1);
    expect(ledger("alice", "flag_coreporter")).toHaveLength(1);
    const bountyId = convertedFlag.data.bountyId;
    const draft = await json<{
      status: string;
      version: number;
      data: { origin: string; flagId: string; rewardRp: number };
    }>(await t.app.request(`/api/v1/bounties/${bountyId}`));
    expect(draft).toMatchObject({
      status: "draft",
      data: { origin: "flag", flagId: flag.id, rewardRp: 25 },
    });
    const published = await json<{ version: number; status: string }>(
      await t.app.request(
        `/api/v1/bounties/${bountyId}/publish`,
        jsonRequest({ version: draft.version }),
      ),
    );
    expect(published.status).toBe("open");
    Object.assign(t.container.devActor, { id: "alice", name: "alice", role: "member" });
    const claimed = await json<{ version: number; status: string }>(
      await t.app.request(
        `/api/v1/bounties/${bountyId}/claim`,
        jsonRequest({ version: published.version }),
      ),
    );
    expect(claimed.status).toBe("claimed");
    const submitted = await json<{ version: number; status: string }>(
      await t.app.request(
        `/api/v1/bounties/${bountyId}/submit`,
        jsonRequest({ version: claimed.version, note: "Updated the ADR" }),
      ),
    );
    expect(submitted.status).toBe("submitted");
    Object.assign(t.container.devActor, owner);
    const paid = await t.app.request(
      `/api/v1/bounties/${bountyId}/approve`,
      jsonRequest({ version: submitted.version, approved: true, note: "Looks good" }),
    );
    expect(paid.status).toBe(200);
    expect((await json<{ status: string }>(paid)).status).toBe("paid");
    expect(ledger("alice", "bounty_completed")[0]?.amount).toBe(25);
    expect(
      (await json<{ status: string }>(await t.app.request(`/api/v1/flags/${flag.id}`))).status,
    ).toBe("resolved");
  });

  it("enforces bounty sponsor rights, AG-1/AG-10, claim extension and cancellation rules", async () => {
    t = createTestApp();
    const owner = { ...t.container.devActor };
    const project = await createProject(t.app);
    actor("carol");
    const input = { projectId: project.id, title: "Document the ledger API", rewardRp: 50 };
    expect((await t.app.request("/api/v1/bounties", jsonRequest(input))).status).toBe(403);
    Object.assign(t.container.devActor, owner);
    const created = await json<{ id: string; version: number; status: string }>(
      await t.app.request("/api/v1/bounties", jsonRequest(input)),
    );
    expect(created.status).toBe("open");
    expect(
      (
        await t.app.request(
          `/api/v1/bounties/${created.id}/claim`,
          jsonRequest({ version: created.version }),
        )
      ).status,
    ).toBe(403);
    Object.assign(t.container.devActor, { id: "carol", name: "carol", role: "member" });
    const claimed = await json<{ version: number; data: { claimExpiresAt: string } }>(
      await t.app.request(
        `/api/v1/bounties/${created.id}/claim`,
        jsonRequest({ version: created.version }),
      ),
    );
    const extended = await json<{
      version: number;
      data: { claimExpiresAt: string; extended: boolean };
    }>(
      await t.app.request(
        `/api/v1/bounties/${created.id}/extend`,
        jsonRequest({ version: claimed.version }),
      ),
    );
    expect(extended.data.extended).toBe(true);
    expect(Date.parse(extended.data.claimExpiresAt)).toBeGreaterThan(
      Date.parse(claimed.data.claimExpiresAt),
    );
    expect(
      (
        await t.app.request(
          `/api/v1/bounties/${created.id}/extend`,
          jsonRequest({ version: extended.version }),
        )
      ).status,
    ).toBe(409);
    const submitted = await json<{ version: number }>(
      await t.app.request(
        `/api/v1/bounties/${created.id}/submit`,
        jsonRequest({ version: extended.version, note: "Done" }),
      ),
    );
    expect(
      (
        await t.app.request(
          `/api/v1/bounties/${created.id}/approve`,
          jsonRequest({ version: submitted.version, approved: true }),
        )
      ).status,
    ).toBe(403);
    Object.assign(t.container.devActor, owner);
    const changes = await json<{ status: string; version: number }>(
      await t.app.request(
        `/api/v1/bounties/${created.id}/approve`,
        jsonRequest({ version: submitted.version, approved: false, note: "Add examples" }),
      ),
    );
    expect(changes.status).toBe("claimed");
    expect(
      (
        await t.app.request(
          `/api/v1/bounties/${created.id}/cancel`,
          jsonRequest({ version: changes.version }),
        )
      ).status,
    ).toBe(409);
    const board = await json<{ items: Array<{ id: string }> }>(
      await t.app.request("/api/v1/bounties?status=claimed"),
    );
    expect(board.items.map((row) => row.id)).toEqual([created.id]);
    actor("guest-user", "guest");
    expect((await t.app.request("/api/v1/bounties")).status).toBe(403);
  });

  it("rates answers privately, reports leaks to admins and promotes answers through domain-owner verification", async () => {
    t = createTestApp();
    const owner = { ...t.container.devActor };
    const project = await createProject(t.app);
    const source = await addSource(t.app, project.id);
    await t.drain();
    const answer = await json<{ id: string }>(
      await t.app.request(
        `/api/v1/projects/${project.id}/ask`,
        jsonRequest({ question: "Why is billing moving to the ledger service?" }),
      ),
    );
    expect(
      (
        await t.app.request(
          `/api/v1/ask/messages/${answer.id}/feedback`,
          jsonRequest({ rating: "down" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await t.app.request(
          `/api/v1/ask/messages/${answer.id}/feedback`,
          jsonRequest({ rating: "up" }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await t.app.request(
          `/api/v1/ask/messages/${answer.id}/feedback`,
          jsonRequest({ rating: "down", reason: "leaked" }),
        )
      ).status,
    ).toBe(200);
    const notifications = await json<{ items: Array<{ data: { type: string } }> }>(
      await t.app.request("/api/v1/notifications"),
    );
    expect(
      notifications.items.some((row) => row.data.type === "security.answer_leak_reported"),
    ).toBe(true);
    const promoted = await t.app.request(
      `/api/v1/ask/messages/${answer.id}/promote`,
      jsonRequest({ note: "Useful for new joiners" }),
    );
    expect(promoted.status).toBe(201);
    const promotion = await json<{ id: string; version: number }>(promoted);
    expect(
      (await json<{ items: unknown[] }>(await t.app.request("/api/v1/promotions/queue"))).items,
    ).toHaveLength(1);
    expect(
      (
        await t.app.request(
          `/api/v1/promotions/${promotion.id}/decide`,
          jsonRequest({ version: promotion.version, accepted: true }),
        )
      ).status,
    ).toBe(403);
    actor("dana", "admin");
    expect(
      (
        await t.app.request(
          `/api/v1/ask/messages/${answer.id}/feedback`,
          jsonRequest({ rating: "up" }),
        )
      ).status,
    ).toBe(404);
    domainOwner("dana", project.id);
    grant(source.id, "dana");
    const decided = await t.app.request(
      `/api/v1/promotions/${promotion.id}/decide`,
      jsonRequest({
        version: promotion.version,
        accepted: true,
        reason: "Verified against the ADR",
      }),
    );
    expect(decided.status).toBe(200);
    expect(await json<{ status: string; sourceId: string | null }>(decided)).toMatchObject({
      status: "accepted",
    });
    Object.assign(t.container.devActor, owner);
    const sources = await json<{ items: Array<{ title: string; kind: string }> }>(
      await t.app.request(`/api/v1/projects/${project.id}/sources`),
    );
    expect(sources.items.some((row) => row.kind === "note" && row.title.startsWith("FAQ:"))).toBe(
      true,
    );
    expect(ledger(owner.id, "ask_promoted")).toHaveLength(1);
    void SAMPLE_SOURCE;
  });
});
