import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { disconnectApp, fetchConnectedApps } from "@/features/account/api/account.api";
import { createAnswerFeedback, promoteAnswer } from "@/features/feedback/api/feedback.api";
import { markAllNotificationsRead } from "@/features/notifications/api/notifications.api";
import { fetchDirectory } from "@/features/people/api/people.api";
import { getEvidence } from "@/features/sources/api/evidence.api";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";

setupMockApi();

describe("live API wiring", () => {
  it("adapts connector connections for personal settings and preserves derived knowledge on disconnect", async () => {
    let disconnectedMode: string | null = null;
    let connected = true;
    const connection = {
      id: "connector-1",
      provider: "google_drive",
      status: "connected",
      accountId: "maya@example.com",
      scopes: ["drive.readonly"],
      createdAt: "2026-10-06T09:00:00.000Z",
    };
    mockServer.use(
      http.get(buildApiUrl("/v1/connectors"), () =>
        HttpResponse.json({ items: connected ? [connection] : [] }),
      ),
      http.delete(buildApiUrl("/v1/connectors/:id"), ({ request }) => {
        disconnectedMode = new URL(request.url).searchParams.get("mode");
        connected = false;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(fetchConnectedApps()).resolves.toMatchObject({
      items: [{ name: "Google Drive", description: "Connected as maya@example.com" }],
    });
    await expect(disconnectApp("connector-1")).resolves.toEqual({ items: [] });
    expect(disconnectedMode).toBe("keep_derived");
  });

  it("uses the bulk notification endpoint", async () => {
    let body: unknown;
    mockServer.use(
      http.post(buildApiUrl("/v1/notifications/read-all"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ updated: 3 });
      }),
    );

    await expect(markAllNotificationsRead()).resolves.toEqual({ updated: 3 });
    expect(body).toEqual({});
  });

  it("stores answer ratings privately and promotes cited answers through Ask", async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    mockServer.use(
      http.post(buildApiUrl("/v1/ask/messages/:id/feedback"), async ({ params, request }) => {
        const body = await request.json();
        requests.push({ path: `feedback:${String(params.id)}`, body });
        return HttpResponse.json({
          id: params.id,
          feedback: { ...(body as object), at: "2026-10-14T09:00:00.000Z" },
        });
      }),
      http.post(buildApiUrl("/v1/ask/messages/:id/promote"), async ({ params, request }) => {
        requests.push({ path: `promote:${String(params.id)}`, body: await request.json() });
        return HttpResponse.json({ id: "promotion-1", status: "proposed", version: 1 });
      }),
    );

    await createAnswerFeedback("answer-1", "missing_context");
    await promoteAnswer("answer-1");
    expect(requests).toEqual([
      {
        path: "feedback:answer-1",
        body: { rating: "down", reason: "missing_source" },
      },
      { path: "promote:answer-1", body: {} },
    ]);
  });

  it("shows nobody under My team when the viewer is not on a team", async () => {
    const members = [
      {
        id: "me",
        name: "Maya",
        role: "member",
        status: "active",
        managerId: null,
        organization: {},
      },
      {
        id: "lead",
        name: "Daniel",
        role: "manager",
        status: "active",
        managerId: null,
        organization: { teamId: "22222222-2222-4222-8222-222222222221" },
      },
    ];
    mockServer.use(
      http.get(buildApiUrl("/v1/users"), () => HttpResponse.json({ total: 2, items: members })),
      http.get(buildApiUrl("/v1/users/me"), () => HttpResponse.json({ id: "me" })),
      http.get(buildApiUrl("/v1/org/teams"), () =>
        HttpResponse.json({
          items: [
            {
              id: "22222222-2222-4222-8222-222222222221",
              name: "Platform",
              departmentId: "d1",
              parentId: null,
            },
          ],
        }),
      ),
    );

    await expect(fetchDirectory({ q: "", filter: "team" })).resolves.toMatchObject({
      total: 2,
      items: [],
    });
    await expect(fetchDirectory({ q: "", filter: "all" })).resolves.toMatchObject({
      items: [
        { id: "me", relations: ["you"] },
        { id: "lead", team: { name: "Platform" } },
      ],
    });
  });

  it("loads the permission-checked evidence drawer payload", async () => {
    mockServer.use(
      http.get(buildApiUrl("/v1/evidence/:id"), ({ params }) =>
        HttpResponse.json({
          id: params.id,
          quote: "The ledger owns billing events.",
          quoteVerified: true,
          span: [4, 37],
          item: {
            id: "item-1",
            projectId: "project-1",
            kind: "decision",
            title: "Billing ownership",
            verification: "confirmed",
            confidence: "high",
          },
          source: {
            id: "source-1",
            title: "ADR-7",
            kind: "document",
            connector: "manual",
            url: null,
            author: "Maya",
            sourceCreatedAt: "2026-10-01T00:00:00.000Z",
            sourceUpdatedAt: null,
          },
          chunk: { id: "chunk-2", ordinal: 2, content: "The ledger owns billing events." },
          context: {
            before: { id: "chunk-1", ordinal: 1, content: "Decision context." },
            after: null,
          },
          extractionRunId: null,
          createdAt: "2026-10-02T00:00:00.000Z",
        }),
      ),
    );

    await expect(getEvidence("evidence-1")).resolves.toMatchObject({
      quoteVerified: true,
      source: { title: "ADR-7" },
      context: { before: { ordinal: 1 }, after: null },
    });
  });
});
