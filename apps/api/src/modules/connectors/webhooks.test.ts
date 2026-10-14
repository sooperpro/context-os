import { createHmac, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  domainEvents,
  identityLinks,
  memberships,
  platformRecords,
  pointsLedger,
  users,
} from "../../db/schema.js";
import { createProject, createTestApp, type TestApp } from "../../test/helpers.js";
import type { Actor } from "../../types.js";

describe("Webhook receivers verify signatures and match real-work checkpoint triggers", () => {
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
  const post = (provider: string, body: unknown, headers: Record<string, string>) =>
    t.app.request(`/api/v1/webhooks/${provider}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  it("answers Slack URL verification only with a valid signature and reports unconfigured providers", async () => {
    t = createTestApp({ env: { SLACK_SIGNING_SECRET: "slack-secret" } });
    const body = { type: "url_verification", challenge: "abc" };
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `v0=${createHmac("sha256", "slack-secret")
      .update(`v0:${timestamp}:${JSON.stringify(body)}`)
      .digest("hex")}`;
    const ok = await post("slack", body, {
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ challenge: "abc" });
    expect(
      (
        await post("slack", body, {
          "x-slack-request-timestamp": timestamp,
          "x-slack-signature": "v0=bad",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await post("slack", body, {
          "x-slack-request-timestamp": "1",
          "x-slack-signature": signature,
        })
      ).status,
    ).toBe(401);
    expect((await post("jira", {}, {})).status).toBe(503);
    expect((await post("unknown", {}, {})).status).toBe(400);
  });

  it("completes event-verified learning items when a linked GitHub user merges a pull request", async () => {
    t = createTestApp({ env: { GITHUB_WEBHOOK_SECRET: "gh-secret" } });
    const author = { ...t.container.devActor };
    const project = await createProject(t.app);
    const path = (await (
      await t.app.request("/api/v1/learning/paths", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          title: "First win",
          roleFamily: "Eng",
          items: [
            {
              type: "do",
              title: "Merge your first PR",
              objective: "Ship something small",
              verification: "event",
              eventTrigger: "github.pr.merged",
            },
          ],
        }),
      })
    ).json()) as { id: string; version: number; data: { items: Array<{ id: string }> } };
    actor("publisher", "admin");
    await t.app.request(`/api/v1/learning/paths/${path.id}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: path.version }),
    });
    actor("learner", "member", "publisher");
    Object.assign(t.container.devActor, { id: "publisher", name: "publisher", role: "admin" });
    const assignment = (await (
      await t.app.request(`/api/v1/learning/paths/${path.id}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "learner", mentorId: author.id, startDate: "2026-01-01" }),
      })
    ).json()) as { id: string };
    Object.assign(t.container.devActor, { id: "learner", name: "learner", role: "member" });
    const itemId = path.data.items[0]!.id;
    expect(
      (
        await t.app.request(`/api/v1/learning/assignments/${assignment.id}/items/${itemId}/start`, {
          method: "POST",
        })
      ).status,
    ).toBe(201);
    t.container.db
      .insert(identityLinks)
      .values({
        id: randomUUID(),
        workspaceId: t.container.workspace.id,
        userId: "learner",
        provider: "github",
        externalId: "12345",
        externalLogin: "octocat",
        status: "confirmed",
        source: "admin",
        linkedAt: new Date(),
      })
      .run();
    const body = {
      action: "closed",
      pull_request: {
        merged: true,
        user: { login: "octocat", id: 12345 },
        html_url: "https://github.com/org/repo/pull/1",
      },
      repository: { full_name: "org/repo" },
    };
    const raw = JSON.stringify(body);
    const signature = `sha256=${createHmac("sha256", "gh-secret").update(raw).digest("hex")}`;
    const headers = {
      "x-hub-signature-256": signature,
      "x-github-event": "pull_request",
      "x-github-delivery": "delivery-1",
    };
    expect(
      (await post("github", body, { ...headers, "x-hub-signature-256": "sha256=bad" })).status,
    ).toBe(401);
    const accepted = await post("github", body, headers);
    expect(accepted.status).toBe(202);
    expect(await accepted.json()).toMatchObject({ accepted: true, matched: 1 });
    const progress = t.container.db
      .select()
      .from(platformRecords)
      .where(
        and(eq(platformRecords.kind, "item_progress"), eq(platformRecords.parentId, assignment.id)),
      )
      .get();
    expect(progress?.status).toBe("completed");
    expect(progress?.data).toMatchObject({
      verifiedBy: "event:github.pr.merged",
      verificationRef: "https://github.com/org/repo/pull/1",
    });
    expect(
      t.container.db
        .select()
        .from(pointsLedger)
        .where(and(eq(pointsLedger.userId, "learner"), eq(pointsLedger.action, "path_completed")))
        .all(),
    ).toHaveLength(1);
    expect(
      t.container.db
        .select()
        .from(domainEvents)
        .where(eq(domainEvents.type, "checkpoint.event.matched"))
        .all(),
    ).toHaveLength(1);
    expect(
      t.container.db
        .select()
        .from(domainEvents)
        .where(eq(domainEvents.type, "webhook.github"))
        .all(),
    ).toHaveLength(1);
    const duplicate = await post("github", body, headers);
    expect(await duplicate.json()).toMatchObject({ duplicate: true });
  });
});
