import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { assignments, memberships, pointsLedger, users } from "../../db/schema.js";
import { createTestApp, jsonRequest, type TestApp } from "../../test/helpers.js";
import type { Actor } from "../../types.js";

describe("PRD gamification, rewards and EPM", () => {
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
  const adjust = (userId: string, amount: number, currency = "rp") =>
    t.app.request(
      "/api/v1/gamification/adjustments",
      jsonRequest({ userId, amount, currency, reason: "test seed" }),
    );
  const settings = async (patch: Record<string, unknown>) => {
    const current = await json<{ version: number }>(
      await t.app.request("/api/v1/workspaces/current"),
    );
    const response = await t.app.request(
      "/api/v1/workspaces/current/settings",
      jsonRequest({ version: current.version, ...patch }, "PATCH"),
    );
    expect(response.status).toBe(200);
  };

  it("ranks top 10 with private self rank, honours symmetric opt-out, guests and department minimums", async () => {
    t = createTestApp();
    const owner = { ...t.container.devActor };
    for (const [id, amount] of [
      ["alice", 120],
      ["bob", 50],
      ["carol", 50],
    ] as const) {
      actor(id);
      Object.assign(t.container.devActor, owner);
      expect((await adjust(id, amount)).status).toBe(201);
    }
    const board = await json<{
      items: Array<{ rank: number; userId: string; points: number; tier: string | null }>;
      self: { rank: number | null };
    }>(await t.app.request("/api/v1/gamification/leaderboards?window=month"));
    expect(board.items.map((row) => row.userId)).toEqual(["alice", "bob", "carol"]);
    expect(board.items[0]).toMatchObject({ rank: 1, points: 120, tier: "contributor" });
    expect(board.self.rank).toBeNull();
    const profile = await json<{ tier: string | null; lifetimeRp: number | null }>(
      await t.app.request("/api/v1/gamification/users/alice"),
    );
    expect(profile).toMatchObject({ tier: "contributor", lifetimeRp: 120 });
    Object.assign(t.container.devActor, { id: "alice", name: "alice", role: "member" });
    await t.app.request(
      "/api/v1/users/me",
      jsonRequest({ leaderboardOptOut: true, hideTier: true }, "PATCH"),
    );
    expect(
      await json<{ optedOut: boolean }>(await t.app.request("/api/v1/gamification/leaderboards")),
    ).toMatchObject({ optedOut: true });
    Object.assign(t.container.devActor, owner);
    const without = await json<{ items: Array<{ userId: string }> }>(
      await t.app.request("/api/v1/gamification/leaderboards"),
    );
    expect(without.items.map((row) => row.userId)).toEqual(["bob", "carol"]);
    expect(
      (await json<{ tier: string | null }>(await t.app.request("/api/v1/gamification/users/alice")))
        .tier,
    ).toBeNull();
    const suppressed = await json<{ suppressed?: string }>(
      await t.app.request(
        "/api/v1/gamification/leaderboards?scope=department&departmentId=" + randomUUID(),
      ),
    );
    expect(typeof suppressed.suppressed).toBe("string");
    actor("visitor", "guest");
    expect((await t.app.request("/api/v1/gamification/leaderboards")).status).toBe(403);
    Object.assign(t.container.devActor, owner);
    await settings({ gamification: { leaderboardsEnabled: false } });
    expect(
      await json<{ enabled: boolean }>(await t.app.request("/api/v1/gamification/leaderboards")),
    ).toMatchObject({ enabled: false });
  });

  it("limits kudos per month and per recipient, awards the recipient, earns badges and supports admin clawbacks", async () => {
    t = createTestApp();
    const owner = { ...t.container.devActor };
    for (const id of ["alice", "bob", "carol", "dave"]) actor(id);
    Object.assign(t.container.devActor, owner);
    const kudos = (toUserId: string) =>
      t.app.request(
        "/api/v1/gamification/kudos",
        jsonRequest({
          toUserId,
          message: "Thanks for the walkthrough",
          artifact: { type: "url", ref: "https://example.com" },
        }),
      );
    expect((await kudos(owner.id)).status).toBe(400);
    expect((await kudos("alice")).status).toBe(201);
    expect((await kudos("alice")).status).toBe(201);
    expect((await kudos("alice")).status).toBe(429);
    for (const id of ["bob", "carol", "dave"]) expect((await kudos(id)).status).toBe(201);
    expect((await kudos("bob")).status).toBe(429);
    const alice = t.container.db
      .select()
      .from(pointsLedger)
      .where(and(eq(pointsLedger.userId, "alice"), eq(pointsLedger.action, "peer_kudos_received")))
      .all();
    expect(alice.map((row) => row.amount)).toEqual([3, 3]);
    const badges = await json<{ items: Array<{ key: string; earned: unknown }> }>(
      await t.app.request("/api/v1/gamification/badges"),
    );
    expect(badges.items.find((badge) => badge.key === "first_kudos")?.earned).toBeTruthy();
    const me = await json<{
      badges: Array<{ key: string }>;
      lifetimeRp: number;
      kcBalance: number;
    }>(await t.app.request("/api/v1/gamification/me"));
    expect(me.badges.map((badge) => badge.key)).toContain("first_kudos");
    const received = await json<{ items: unknown[] }>(
      await t.app.request("/api/v1/gamification/kudos?direction=given"),
    );
    expect(received.items).toHaveLength(5);
    const seeded = await json<{ id: string; amount: number }>(await adjust("alice", 40));
    const clawback = await t.app.request(
      `/api/v1/gamification/ledger/${seeded.id}/clawback`,
      jsonRequest({ reason: "Reverted at source" }),
    );
    expect(clawback.status).toBe(201);
    expect((await json<{ amount: number }>(clawback)).amount).toBe(-40);
    expect(
      (
        await t.app.request(
          `/api/v1/gamification/ledger/${seeded.id}/clawback`,
          jsonRequest({ reason: "again" }),
        )
      ).status,
    ).toBe(409);
    expect(
      (await json<{ items: unknown[] }>(await t.app.request("/api/v1/gamification/anomalies")))
        .items,
    ).toEqual([]);
    expect(() => t.container.db.delete(pointsLedger).run()).toThrow("append-only");
  });

  it("runs the rewards catalog and redemption flow with approvals, stock, refunds and KC balances", async () => {
    t = createTestApp();
    const owner = { ...t.container.devActor };
    expect((await t.app.request("/api/v1/rewards/catalog")).status).toBe(409);
    await settings({ rewards: { enabled: true } });
    const mug = await json<{ id: string; version: number }>(
      await t.app.request(
        "/api/v1/rewards/catalog",
        jsonRequest({ name: "Mug", kcCost: 10, stock: 1, approvalRequired: true }),
      ),
    );
    const lunch = await json<{ id: string }>(
      await t.app.request(
        "/api/v1/rewards/catalog",
        jsonRequest({ name: "Lunch", kcCost: 5, approvalRequired: false, itemType: "experience" }),
      ),
    );
    actor("alice");
    const catalog = await json<{
      balance: number;
      items: Array<{ id: string; eligible: boolean; affordable: boolean }>;
    }>(await t.app.request("/api/v1/rewards/catalog"));
    expect(catalog.balance).toBe(0);
    expect(catalog.items.find((item) => item.id === mug.id)).toMatchObject({
      eligible: true,
      affordable: false,
    });
    expect(
      (await t.app.request("/api/v1/rewards/redeem", jsonRequest({ itemId: mug.id }))).status,
    ).toBe(409);
    Object.assign(t.container.devActor, owner);
    expect((await adjust("alice", 20, "kc")).status).toBe(201);
    Object.assign(t.container.devActor, { id: "alice", name: "alice", role: "member" });
    expect(
      (
        await t.app.request(
          "/api/v1/rewards/redeem",
          jsonRequest({ itemId: mug.id, shipping: { line1: "x" } }),
        )
      ).status,
    ).toBe(503);
    const redemption = await json<{ id: string; version: number; status: string }>(
      await t.app.request("/api/v1/rewards/redeem", jsonRequest({ itemId: mug.id })),
    );
    expect(redemption.status).toBe("pending_approval");
    expect(
      (await t.app.request("/api/v1/rewards/redeem", jsonRequest({ itemId: mug.id }))).status,
    ).toBe(409);
    expect(
      (await json<{ balance: number }>(await t.app.request("/api/v1/rewards/catalog"))).balance,
    ).toBe(10);
    Object.assign(t.container.devActor, owner);
    expect(
      (
        await t.app.request(
          `/api/v1/rewards/redemptions/${redemption.id}/decide`,
          jsonRequest({ version: redemption.version, decision: "approve" }),
        )
      ).status,
    ).toBe(403);
    t.container.db
      .insert(assignments)
      .values({
        id: randomUUID(),
        workspaceId: t.container.workspace.id,
        userId: owner.id,
        type: "rewards_approver",
        scopeType: "workspace",
        scopeId: t.container.workspace.id,
      })
      .run();
    const queue = await json<{ items: unknown[] }>(
      await t.app.request("/api/v1/rewards/redemptions?queue=true"),
    );
    expect(queue.items).toHaveLength(1);
    const approved = await json<{ version: number; status: string }>(
      await t.app.request(
        `/api/v1/rewards/redemptions/${redemption.id}/decide`,
        jsonRequest({ version: redemption.version, decision: "approve" }),
      ),
    );
    expect(approved.status).toBe("fulfilment_pending");
    const fulfilled = await json<{ status: string }>(
      await t.app.request(
        `/api/v1/rewards/redemptions/${redemption.id}/decide`,
        jsonRequest({ version: approved.version, decision: "fulfil" }),
      ),
    );
    expect(fulfilled.status).toBe("fulfilled");
    Object.assign(t.container.devActor, { id: "alice", name: "alice", role: "member" });
    const second = await json<{ id: string; version: number; status: string }>(
      await t.app.request("/api/v1/rewards/redeem", jsonRequest({ itemId: lunch.id })),
    );
    expect(second.status).toBe("fulfilment_pending");
    expect(
      (await json<{ balance: number }>(await t.app.request("/api/v1/rewards/catalog"))).balance,
    ).toBe(5);
    Object.assign(t.container.devActor, owner);
    expect(
      (
        await t.app.request(
          `/api/v1/rewards/redemptions/${second.id}/decide`,
          jsonRequest({ version: second.version, decision: "reject", note: "Out of budget" }),
        )
      ).status,
    ).toBe(200);
    Object.assign(t.container.devActor, { id: "alice", name: "alice", role: "member" });
    expect(
      (await json<{ balance: number }>(await t.app.request("/api/v1/rewards/catalog"))).balance,
    ).toBe(10);
    const history = await json<{ items: Array<{ status: string }> }>(
      await t.app.request("/api/v1/rewards/redemptions"),
    );
    expect(history.items.map((row) => row.status).sort()).toEqual(["fulfilled", "rejected"]);
  });

  it("gates EPM behind the add-on, builds footprints with annotations, brag docs, sharing and review cycles", async () => {
    t = createTestApp();
    const owner = { ...t.container.devActor };
    expect((await t.app.request("/api/v1/epm/footprint")).status).toBe(403);
    await settings({ epm: { enabled: true } });
    actor("alice", "member", owner.id);
    actor("bob");
    actor("carol");
    Object.assign(t.container.devActor, owner);
    expect(
      (
        await t.app.request(
          "/api/v1/gamification/kudos",
          jsonRequest({ toUserId: "alice", message: "Great incident write-up" }),
        )
      ).status,
    ).toBe(201);
    Object.assign(t.container.devActor, { id: "alice", name: "alice", role: "member" });
    const footprint = await json<{
      items: Array<{ id: string; theme: string; isInferred: boolean }>;
      themes: Record<string, number>;
      recencyBias: { warning: boolean };
    }>(await t.app.request("/api/v1/epm/footprint"));
    expect(footprint.items.length).toBeGreaterThan(0);
    expect(footprint.themes.collaboration).toBe(1);
    const itemId = footprint.items[0]!.id;
    expect(
      (
        await t.app.request(
          `/api/v1/epm/footprint/items/${encodeURIComponent(itemId)}/annotate`,
          jsonRequest({ note: "Context", hiddenInShare: true }),
        )
      ).status,
    ).toBe(201);
    Object.assign(t.container.devActor, owner);
    const managerView = await json<{ viewer: string; items: unknown[] }>(
      await t.app.request("/api/v1/epm/footprint?userId=alice"),
    );
    expect(managerView.viewer).toBe("manager");
    expect(managerView.items).toHaveLength(0);
    Object.assign(t.container.devActor, { id: "bob", name: "bob", role: "member" });
    expect((await t.app.request("/api/v1/epm/footprint?userId=alice")).status).toBe(404);
    Object.assign(t.container.devActor, { id: "alice", name: "alice", role: "member" });
    const brag = await t.app.request(
      "/api/v1/epm/brag-docs/generate",
      jsonRequest({ from: "2026-01-01", to: "2026-12-31" }),
    );
    expect(brag.status).toBe(201);
    const doc = await json<{ id: string; version: number; data: { narrative: string } }>(brag);
    expect(doc.data.narrative).toContain("resolved knowledge flags");
    const edited = await json<{ version: number }>(
      await t.app.request(
        `/api/v1/epm/brag-docs/${doc.id}`,
        jsonRequest({ version: doc.version, narrative: "My own words" }, "PATCH"),
      ),
    );
    expect(
      (
        await t.app.request(
          `/api/v1/epm/brag-docs/${doc.id}/share`,
          jsonRequest({ version: edited.version, withUserId: "bob" }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await t.app.request(
          `/api/v1/epm/brag-docs/${doc.id}/share`,
          jsonRequest({ version: edited.version, withUserId: owner.id }),
        )
      ).status,
    ).toBe(201);
    Object.assign(t.container.devActor, owner);
    const shared = await json<{
      items: Array<{ id: string; data: { snapshot: { narrative: string } } }>;
    }>(await t.app.request("/api/v1/epm/brag-docs?shared=true"));
    expect(shared.items[0]?.data.snapshot.narrative).toBe("My own words");
    const cycle = await json<{ id: string; version: number; status: string }>(
      await t.app.request(
        "/api/v1/epm/review-cycles",
        jsonRequest({
          name: "H1 2026",
          periodStart: "2026-01-01",
          periodEnd: "2026-06-30",
          participantIds: ["alice"],
          questions: ["What went well?"],
        }),
      ),
    );
    const advance = async (version: number) =>
      json<{ status: string; version: number }>(
        await t.app.request(
          `/api/v1/epm/review-cycles/${cycle.id}/advance`,
          jsonRequest({ version }),
        ),
      );
    const scheduled = await advance(cycle.version);
    expect(scheduled.status).toBe("scheduled");
    const selfReview = await advance(scheduled.version);
    expect(selfReview.status).toBe("self_review");
    Object.assign(t.container.devActor, { id: "alice", name: "alice", role: "member" });
    const reviews = await json<{
      items: Array<{ id: string; version: number; data: { type: string } }>;
    }>(await t.app.request(`/api/v1/epm/reviews?cycleId=${cycle.id}`));
    const self = reviews.items.find((review) => review.data.type === "self")!;
    expect(reviews.items.map((review) => review.data.type)).toEqual(["self"]);
    expect(
      (
        await t.app.request(
          `/api/v1/epm/reviews/${self.id}/submit`,
          jsonRequest({ version: self.version, answers: { "0": "Shipped the ledger" } }),
        )
      ).status,
    ).toBe(200);
    Object.assign(t.container.devActor, owner);
    const mine = await json<{
      items: Array<{ id: string; version: number; data: { type: string } }>;
    }>(await t.app.request(`/api/v1/epm/reviews?cycleId=${cycle.id}`));
    const manager = mine.items.find((review) => review.data.type === "manager")!;
    expect(
      (
        await t.app.request(
          `/api/v1/epm/reviews/${manager.id}/submit`,
          jsonRequest({ version: manager.version, answers: { "0": "Strong" } }),
        )
      ).status,
    ).toBe(409);
    const peerInput = await advance(selfReview.version);
    expect(peerInput.status).toBe("peer_input");
    expect(
      (
        await t.app.request(
          `/api/v1/epm/reviews/${self.id}/peers`,
          jsonRequest({ version: self.version + 1, peerIds: ["bob", "carol"] }),
        )
      ).status,
    ).toBe(201);
    const managerReview = await advance(peerInput.version);
    expect(managerReview.status).toBe("manager_review");
    expect(
      (
        await t.app.request(
          `/api/v1/epm/reviews/${manager.id}/submit`,
          jsonRequest({ version: manager.version, answers: { "0": "Strong" }, rating: "Meets" }),
        )
      ).status,
    ).toBe(200);
    const sharing = await advance(managerReview.version);
    expect(sharing.status).toBe("sharing");
    const acknowledgement = await advance(sharing.version);
    expect(acknowledgement.status).toBe("acknowledgement");
    Object.assign(t.container.devActor, { id: "alice", name: "alice", role: "member" });
    const visible = await json<{
      items: Array<{ id: string; version: number; data: { type: string; rating: string | null } }>;
    }>(await t.app.request(`/api/v1/epm/reviews?cycleId=${cycle.id}`));
    const sharedManagerReview = visible.items.find((review) => review.data.type === "manager")!;
    expect(sharedManagerReview.data.rating).toBe("Meets");
    expect(
      (
        await t.app.request(
          `/api/v1/epm/reviews/${sharedManagerReview.id}/acknowledge`,
          jsonRequest({ version: sharedManagerReview.version, comment: "Thanks" }),
        )
      ).status,
    ).toBe(200);
    Object.assign(t.container.devActor, owner);
    const cycles = await json<{
      items: Array<{ completion: { total: number; submitted: number } }>;
    }>(await t.app.request("/api/v1/epm/review-cycles"));
    expect(cycles.items[0]?.completion.total).toBe(4);
  });
});
