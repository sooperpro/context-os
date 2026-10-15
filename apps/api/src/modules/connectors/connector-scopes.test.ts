import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectorConnections,
  connectorScopes,
  identityLinks,
  jobs,
  memberships,
  sourceObjects,
  users,
} from "../../db/schema.js";
import { createProject, createTestApp, jsonRequest, type TestApp } from "../../test/helpers.js";
import { createGoogleDriveService } from "./google-drive.js";

const provider = vi.hoisted(() => ({
  getToken: vi.fn(),
  verifyIdToken: vi.fn(),
  get: vi.fn(),
  exportFile: vi.fn(),
  list: vi.fn(),
  drivesList: vi.fn(),
  revokeToken: vi.fn(),
}));
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {
          /* inert */
        }
        on() {
          /* inert */
        }
        generateAuthUrl(options: { state: string; scope: string[] }) {
          return `https://accounts.google.com/o/oauth2/auth?state=${options.state}&scope=${encodeURIComponent(options.scope.join(" "))}`;
        }
        getToken = provider.getToken;
        verifyIdToken = provider.verifyIdToken;
        revokeToken = provider.revokeToken;
      },
    },
    drive: () => ({
      files: { get: provider.get, export: provider.exportFile, list: provider.list },
      drives: { list: provider.drivesList },
    }),
  },
}));

describe("Google Drive scopes, sync jobs and disconnect modes (mocked provider)", () => {
  let t: TestApp;
  const encryptionKey = "ab".repeat(32);
  const token = {
    access_token: "test-access",
    refresh_token: "test-refresh",
    id_token: "test-id",
    scope: "openid email https://www.googleapis.com/auth/drive.readonly",
  };
  const file = {
    id: "file-1",
    name: "Specs document",
    mimeType: "text/plain",
    modifiedTime: "2026-10-13T10:00:00Z",
    createdTime: "2026-10-01T10:00:00Z",
    capabilities: { canDownload: true },
    webViewLink: "https://docs.google.com/document/d/file-1",
  };
  beforeEach(() => {
    vi.resetAllMocks();
    provider.getToken.mockResolvedValue({ tokens: token });
    provider.verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: "google-subject", email: "dev@example.com" }),
    });
    provider.get.mockImplementation((params: { alt?: string }) =>
      Promise.resolve({
        data:
          params.alt === "media"
            ? Readable.from([Buffer.from("Readable provider document content.")])
            : file,
      }),
    );
    provider.list.mockImplementation((params: { q?: string }) =>
      Promise.resolve({
        data: params.q?.includes("mimeType")
          ? { files: [{ id: "folder-1", name: "Specs" }] }
          : { files: [file] },
      }),
    );
    provider.drivesList.mockResolvedValue({
      data: { drives: [{ id: "drive-1", name: "Engineering" }] },
    });
    provider.revokeToken.mockResolvedValue({});
    t = createTestApp({
      env: {
        GOOGLE_CLIENT_ID: "test-client",
        GOOGLE_CLIENT_SECRET: "test-secret",
        CONNECTOR_TOKEN_ENCRYPTION_KEY: encryptionKey,
      },
    });
  });
  afterEach(() => t?.close());
  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;
  const connect = async () => {
    const service = createGoogleDriveService(t.container);
    const state = new URL(
      service.authorize(t.container.devActor).authorizationUrl,
    ).searchParams.get("state")!;
    return service.callback(state, "test-code");
  };

  it("links the OAuth identity, lists selectable scopes, persists selections and syncs through the job queue", async () => {
    const connection = await connect();
    const link = t.container.db
      .select()
      .from(identityLinks)
      .where(eq(identityLinks.provider, "google"))
      .get();
    expect(link).toMatchObject({
      status: "confirmed",
      source: "oauth",
      externalId: "google-subject",
      email: "dev@example.com",
    });
    const project = await createProject(t.app);
    const scopes = await json<{
      items: Array<{ scopeType: string; externalId: string; selections: unknown[] }>;
    }>(await t.app.request(`/api/v1/connectors/${connection.id}/scopes`));
    expect(scopes.items[0]).toMatchObject({
      scopeType: "folder",
      externalId: "root",
      name: "My Drive",
    });
    expect(scopes.items.slice(1)).toEqual([
      expect.objectContaining({ scopeType: "shared_drive", externalId: "drive-1", selections: [] }),
      expect.objectContaining({ scopeType: "folder", externalId: "folder-1", selections: [] }),
    ]);
    const saved = await t.app.request(
      `/api/v1/connectors/${connection.id}/scopes`,
      jsonRequest(
        {
          projectId: project.id,
          scopes: [
            { scopeType: "folder", externalId: "folder-1", name: "Specs", visibility: "workspace" },
          ],
        },
        "PUT",
      ),
    );
    expect(saved.status).toBe(200);
    const selection = await json<{ items: Array<{ id: string; status: string }> }>(saved);
    expect(selection.items[0]).toMatchObject({ status: "selected" });
    const sync = await t.app.request(`/api/v1/connectors/${connection.id}/sync`, jsonRequest({}));
    expect(sync.status).toBe(202);
    expect(await json<{ queued: number }>(sync)).toMatchObject({ queued: 1 });
    expect(
      t.container.db.select().from(jobs).where(eq(jobs.type, "sync_connector")).all(),
    ).toHaveLength(1);
    expect(
      (
        await t.app.request(
          `/api/v1/connectors/${connection.id}/sync`,
          jsonRequest({ scopeId: selection.items[0]!.id }),
        )
      ).status,
    ).toBe(429);
    await t.drain();
    const scope = t.container.db
      .select()
      .from(connectorScopes)
      .where(eq(connectorScopes.id, selection.items[0]!.id))
      .get();
    expect(scope).toMatchObject({ status: "live", itemCount: 1 });
    const imported = t.container.db
      .select()
      .from(sourceObjects)
      .where(eq(sourceObjects.externalId, "file-1"))
      .get();
    expect(imported).toMatchObject({
      connector: "google_drive",
      connectionId: connection.id,
      visibility: "workspace",
    });
    expect(imported?.metadata).toMatchObject({ scopeId: scope?.id });
    // Workspace visibility: a member with no Drive connection of their own can read the import.
    t.container.db.insert(users).values({ id: "emp", name: "Employee" }).run();
    t.container.db
      .insert(memberships)
      .values({ workspaceId: t.container.workspace.id, userId: "emp", role: "member" })
      .run();
    const employee = {
      ...t.container.devActor,
      id: "emp",
      name: "Employee",
      role: "member" as const,
    };
    expect(t.container.identity.visibleSourceIds(employee, project.id)).toContain(imported!.id);
    // Switching the scope back to permission mirroring hides it again, without a re-sync.
    await t.app.request(
      `/api/v1/connectors/${connection.id}/scopes`,
      jsonRequest(
        {
          projectId: project.id,
          scopes: [{ scopeType: "folder", externalId: "folder-1", name: "Specs" }],
        },
        "PUT",
      ),
    );
    expect(t.container.identity.visibleSourceIds(employee, project.id)).not.toContain(imported!.id);
    const listed = await json<{
      items: Array<{
        selectedScopes: unknown[];
        health: { itemsProcessed: number; lastSuccessfulSyncAt: string | null };
      }>;
    }>(await t.app.request("/api/v1/connectors"));
    expect(listed.items[0]?.health).toMatchObject({ itemsProcessed: 1 });
    expect(listed.items[0]?.health.lastSuccessfulSyncAt).toBeTruthy();
    expect(
      (await t.app.request("/api/v1/connectors/slack/authorize", { method: "POST" })).status,
    ).toBe(503);
    expect(
      (await t.app.request("/api/v1/connectors/google-drive/authorize", { method: "POST" })).status,
    ).toBe(200);
  });

  it("serves the admin connector catalog from the live Drive connection and syncs on schedule", async () => {
    interface Connector {
      id: string;
      state: string;
      detail: string | null;
      progress: number | null;
      error: string | null;
      scopeOptions: Array<{ id: string; name: string }>;
    }
    const catalog = async () =>
      (await json<{ items: Connector[] }>(await t.app.request("/api/v1/admin/connectors"))).items;
    const drive = async () => (await catalog()).find((item) => item.id === "google-drive")!;

    // Not connected yet: consent hands back Google's page instead of an account.
    expect(await drive()).toMatchObject({ state: "available", scopeOptions: [] });
    const pending = await json<{ account: string | null; authorizationUrl: string | null }>(
      await t.app.request("/api/v1/admin/connectors/google-drive/authorize", jsonRequest({})),
    );
    expect(pending.account).toBeNull();
    expect(pending.authorizationUrl).toContain("accounts.google.com");
    // Integrations that are only listed answer 503 with a way forward.
    const slack = await t.app.request("/api/v1/admin/connectors/slack/authorize", jsonRequest({}));
    expect(slack.status).toBe(503);

    await connect();
    expect(
      await json(
        await t.app.request("/api/v1/admin/connectors/google-drive/authorize", jsonRequest({})),
      ),
    ).toEqual({ account: "dev@example.com", authorizationUrl: null });
    expect(await drive()).toMatchObject({
      state: "healthy",
      detail: "Connected · no folders chosen yet",
      scopeOptions: [
        { id: "root", name: "My Drive" },
        { id: "drive-1", name: "Engineering" },
        { id: "folder-1", name: "Specs" },
      ],
    });

    const project = await createProject(t.app);
    const body = (scopeIds: string[], projectId?: string) =>
      jsonRequest({
        scopeIds,
        frequency: "2d",
        skipOlderThan: "1y",
        visibility: "workspace",
        ...(projectId ? { projectId } : {}),
      });
    expect(
      (await t.app.request("/api/v1/admin/connectors/google-drive/connect", body(["folder-1"])))
        .status,
    ).toBe(400);
    expect(
      (
        await t.app.request(
          "/api/v1/admin/connectors/google-drive/connect",
          body(["missing"], project.id),
        )
      ).status,
    ).toBe(400);
    const started = await json<Connector>(
      await t.app.request(
        "/api/v1/admin/connectors/google-drive/connect",
        body(["folder-1"], project.id),
      ),
    );
    expect(started).toMatchObject({ state: "syncing", detail: "First sync · 0%" });
    expect(started.progress).toBeGreaterThan(0);
    const scope = t.container.db.select().from(connectorScopes).get();
    expect(scope).toMatchObject({
      externalId: "folder-1",
      visibility: "workspace",
      syncFrequency: "2d",
      status: "backfilling",
    });
    expect(scope?.backfillFrom).toBeTruthy();

    await t.drain();
    expect(await drive()).toMatchObject({ state: "healthy", detail: "1 file indexed" });
    const runs = await json<{ items: Array<{ connector: string; ok: boolean; detail: string }> }>(
      await t.app.request("/api/v1/admin/sync-runs"),
    );
    expect(runs.items).toEqual([
      expect.objectContaining({
        connector: "Google Drive · Specs",
        ok: true,
        detail: "1 file checked, 1 imported",
      }),
    ]);

    // The sweep re-queues the scope once its two-day schedule is due, and not before; a
    // manual-only folder is never re-synced on its own.
    expect(t.container.sweeps.run().connectorSyncsQueued).toBe(0);
    expect(t.container.sweeps.run(new Date(Date.now() + 47 * 3_600_000)).connectorSyncsQueued).toBe(
      0,
    );
    expect(t.container.sweeps.run(new Date(Date.now() + 49 * 3_600_000)).connectorSyncsQueued).toBe(
      1,
    );
    expect(
      t.container.db
        .select()
        .from(jobs)
        .where(eq(jobs.type, "sync_connector"))
        .all()
        .filter((job) => job.status === "queued"),
    ).toHaveLength(1);

    t.container.db.update(connectorScopes).set({ syncFrequency: "manual" }).run();
    expect(
      t.container.sweeps.run(new Date(Date.now() + 30 * 86_400_000)).connectorSyncsQueued,
    ).toBe(0);

    // A failing folder shows as an error, and Fix re-syncs it.
    t.container.db
      .update(connectorScopes)
      .set({ status: "degraded", lastError: "403 Forbidden on Specs" })
      .run();
    expect(await drive()).toMatchObject({ state: "error", error: "403 Forbidden on Specs" });
    const fixed = await t.app.request(
      "/api/v1/admin/connectors/google-drive/reconnect",
      jsonRequest({}),
    );
    expect(fixed.status).toBe(200);
    expect((await json<Connector>(fixed)).state).toBe("syncing");
    expect(
      (await t.app.request("/api/v1/admin/connectors/google-drive/reconnect", jsonRequest({})))
        .status,
    ).toBe(409);

    // Manage: every synced folder, sync all (respecting the cooldown) and stop syncing one.
    const managed = await json<{
      items: Array<{ id: string; name: string; projectName: string; connectedBy: string }>;
    }>(await t.app.request("/api/v1/admin/connectors/google-drive/scopes"));
    expect(managed.items).toEqual([
      expect.objectContaining({
        name: "Specs",
        projectName: project.name,
        connectedBy: "Developer",
      }),
    ]);
    expect(
      await json(
        await t.app.request("/api/v1/admin/connectors/google-drive/sync", { method: "POST" }),
      ),
    ).toEqual({ queued: 0 });
    expect(
      (
        await t.app.request(
          `/api/v1/admin/connectors/google-drive/scopes/${managed.items[0]!.id}`,
          {
            method: "DELETE",
          },
        )
      ).status,
    ).toBe(204);
    expect(
      (
        await json<{ items: unknown[] }>(
          await t.app.request("/api/v1/admin/connectors/google-drive/scopes"),
        )
      ).items,
    ).toEqual([]);
  });

  it("keeps derived content on keep_derived disconnect and purges it by default", async () => {
    const connection = await connect();
    const project = await createProject(t.app);
    await t.app.request(
      `/api/v1/connectors/${connection.id}/import`,
      jsonRequest({ projectId: project.id, fileId: "file-1" }),
    );
    expect(
      (
        await t.app.request(`/api/v1/connectors/${connection.id}?mode=keep_derived`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(204);
    const kept = t.container.db
      .select()
      .from(sourceObjects)
      .where(eq(sourceObjects.externalId, "file-1"))
      .get();
    expect(kept?.connectionId).toBeNull();
    expect(typeof kept?.metadata?.disconnectedAt).toBe("string");
    expect(t.container.db.select().from(connectorConnections).all()).toEqual([]);
    const second = await connect();
    await t.app.request(
      `/api/v1/connectors/${second.id}/import`,
      jsonRequest({ projectId: project.id, fileId: "file-1" }),
    );
    expect(
      (await t.app.request(`/api/v1/connectors/${second.id}`, { method: "DELETE" })).status,
    ).toBe(204);
    expect(
      t.container.db
        .select()
        .from(sourceObjects)
        .where(eq(sourceObjects.connectionId, second.id))
        .all(),
    ).toEqual([]);
  });
});
