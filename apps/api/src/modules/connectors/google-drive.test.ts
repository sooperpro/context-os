import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectorConnections,
  jobs,
  memberships,
  oauthStates,
  sourceAccess,
  sourceObjects,
  users,
} from "../../db/schema.js";
import { openCredentials } from "../../lib/credentials.js";
import { createProject, createTestApp, jsonRequest, type TestApp } from "../../test/helpers.js";
import { createGoogleDriveService } from "./google-drive.js";

const provider = vi.hoisted(() => ({
  getToken: vi.fn(),
  verifyIdToken: vi.fn(),
  get: vi.fn(),
  exportFile: vi.fn(),
  list: vi.fn(),
  revokeToken: vi.fn(),
}));
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {
          /* Credentials are intentionally inert in this provider fake. */
        }
        on() {
          /* Refresh callbacks are not emitted by this provider fake. */
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
    }),
  },
}));

describe("Google Drive provider contract (mocked, not live verification)", () => {
  let t: TestApp;
  const encryptionKey = "ab".repeat(32);
  const token = {
    access_token: "test-access",
    refresh_token: "test-refresh",
    id_token: "test-id",
    scope: "openid email https://www.googleapis.com/auth/drive.readonly",
  };
  let content = "Readable provider document content.";
  const info = {
    id: "file-1",
    name: "Provider document",
    mimeType: "text/plain",
    modifiedTime: "2026-10-13T10:00:00Z",
    createdTime: "2026-10-01T10:00:00Z",
    capabilities: { canDownload: true },
    webViewLink: "https://docs.google.com/document/d/file-1",
  };
  beforeEach(() => {
    vi.resetAllMocks();
    content = "Readable provider document content.";
    provider.getToken.mockResolvedValue({ tokens: token });
    provider.verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: "test-subject" }) });
    provider.get.mockImplementation((params: { alt?: string }) =>
      Promise.resolve({
        data: params.alt === "media" ? Readable.from([Buffer.from(content)]) : info,
      }),
    );
    provider.exportFile.mockImplementation(() =>
      Promise.resolve({ data: Readable.from([Buffer.from(content)]) }),
    );
    provider.list.mockResolvedValue({ data: { files: [info], nextPageToken: "next-page" } });
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
  const connect = async () => {
    const service = createGoogleDriveService(t.container);
    const url = new URL(service.authorize(t.container.devActor).authorizationUrl);
    const state = url.searchParams.get("state")!;
    const result = await service.callback(state, "test-code");
    return { service, result, state };
  };

  it("uses single-use hashed state, validates Google identity and never serializes tokens", async () => {
    const { service, result, state } = await connect();
    expect(result.accountId).toBe("test-subject");
    expect(JSON.stringify(result)).not.toContain("test-refresh");
    const row = t.container.db
      .select()
      .from(connectorConnections)
      .where(eq(connectorConnections.id, result.id))
      .get()!;
    expect(row.credentials).not.toContain("test-refresh");
    expect(
      openCredentials(row.credentials, encryptionKey, `${row.workspaceId}:${row.id}`).refresh_token,
    ).toBe("test-refresh");
    expect(t.container.db.select().from(oauthStates).all()).toEqual([]);
    await expect(service.callback(state, "test-code")).rejects.toMatchObject({ status: 400 });
    expect(provider.getToken).toHaveBeenCalledTimes(1);
    const list = await (await t.app.request("/api/v1/connectors")).json();
    expect(JSON.stringify(list)).not.toContain("credentials");
    expect(JSON.stringify(list)).not.toContain("test-access");
  });

  it("rejects expired state and insufficient scopes without creating a connection", async () => {
    const service = createGoogleDriveService(t.container);
    const state = new URL(
      service.authorize(t.container.devActor).authorizationUrl,
    ).searchParams.get("state")!;
    const hash = createHash("sha256").update(state).digest("hex");
    t.container.db
      .update(oauthStates)
      .set({ expiresAt: new Date(0) })
      .where(eq(oauthStates.id, hash))
      .run();
    await expect(service.callback(state, "test-code")).rejects.toMatchObject({ status: 400 });
    expect(provider.getToken).not.toHaveBeenCalled();
    const second = new URL(
      service.authorize(t.container.devActor).authorizationUrl,
    ).searchParams.get("state")!;
    provider.getToken.mockResolvedValue({ tokens: { ...token, scope: "openid email" } });
    await expect(service.callback(second, "test-code")).rejects.toMatchObject({ status: 400 });
    expect(t.container.db.select().from(connectorConnections).all()).toEqual([]);
  });

  it("deduplicates imports, reprocesses changed content and rejects unsupported/oversized documents", async () => {
    const { service, result } = await connect();
    const project = await createProject(t.app);
    const first = await service.importFile(t.container.devActor, result.id, project.id, "file-1");
    const repeated = await service.importFile(
      t.container.devActor,
      result.id,
      project.id,
      "file-1",
    );
    expect(repeated.id).toBe(first.id);
    expect(t.container.db.select().from(sourceObjects).all()).toHaveLength(1);
    expect(
      t.container.db.select().from(jobs).where(eq(jobs.type, "process_source")).all(),
    ).toHaveLength(1);
    content = "Updated provider document content.";
    expect(
      (await service.importFile(t.container.devActor, result.id, project.id, "file-1")).content,
    ).toBe(content);
    expect(
      t.container.db.select().from(jobs).where(eq(jobs.type, "process_source")).all(),
    ).toHaveLength(2);
    provider.get.mockResolvedValueOnce({
      data: { ...info, mimeType: "application/vnd.google-apps.spreadsheet" },
    });
    await expect(
      service.importFile(t.container.devActor, result.id, project.id, "unsupported"),
    ).rejects.toMatchObject({ status: 400 });
    t.env.MAX_DOCUMENT_BYTES = 4;
    await expect(
      service.importFile(t.container.devActor, result.id, project.id, "oversized"),
    ).rejects.toMatchObject({ status: 400 });
    expect(t.container.db.select().from(sourceObjects).all()).toHaveLength(1);
  });

  it("requires reader-owned connections and fails closed on permission errors and token revocation", async () => {
    const { service, result } = await connect();
    const project = await createProject(t.app);
    const source = await service.importFile(t.container.devActor, result.id, project.id, "file-1");
    const reader = {
      ...t.container.devActor,
      id: "reader",
      name: "Reader",
      role: "member" as const,
    };
    const db = t.container.db;
    db.insert(users).values({ id: reader.id, name: reader.name }).run();
    db.insert(memberships)
      .values({ workspaceId: reader.workspaceId, userId: reader.id, role: reader.role })
      .run();
    db.insert(sourceAccess).values({ sourceId: source.id, userId: reader.id }).run();
    await service.refreshAccess(reader);
    expect(t.container.identity.visibleSourceIds(reader, project.id)).toEqual([]);
    const state = new URL(service.authorize(reader).authorizationUrl).searchParams.get("state")!;
    const readerConnection = await service.callback(state, "test-code");
    await service.refreshAccess(reader);
    expect(t.container.identity.visibleSourceIds(reader, project.id)).toEqual([source.id]);
    provider.get.mockRejectedValue({ response: { status: 403 } });
    await service.refreshAccess(reader);
    expect(t.container.identity.visibleSourceIds(reader, project.id)).toEqual([]);
    provider.get.mockRejectedValue({ response: { status: 401 } });
    await service.refreshAccess(reader);
    expect(
      db
        .select()
        .from(connectorConnections)
        .where(eq(connectorConnections.id, readerConnection.id))
        .get()?.status,
    ).toBe("needs_reauth");
    expect(
      db
        .select()
        .from(sourceAccess)
        .where(and(eq(sourceAccess.sourceId, source.id), eq(sourceAccess.userId, reader.id)))
        .all(),
    ).toEqual([]);
  });

  it("allows disconnect after revocation, treats already-revoked tokens idempotently and purges imports", async () => {
    const { service, result } = await connect();
    const project = await createProject(t.app);
    await service.importFile(t.container.devActor, result.id, project.id, "file-1");
    t.container.db
      .update(connectorConnections)
      .set({ status: "needs_reauth" })
      .where(eq(connectorConnections.id, result.id))
      .run();
    provider.revokeToken.mockRejectedValue({
      response: { status: 400, data: { error: "invalid_token" } },
    });
    await service.disconnect(t.container.devActor, result.id);
    expect(t.container.db.select().from(connectorConnections).all()).toEqual([]);
    expect(t.container.db.select().from(sourceObjects).all()).toEqual([]);
    expect(t.container.db.select().from(sourceAccess).all()).toEqual([]);
  });

  it("rolls back source, access, jobs and connector imports when an audit write fails", async () => {
    const { service, result } = await connect();
    const project = await createProject(t.app);
    vi.spyOn(t.container.audit, "record").mockImplementationOnce(() => {
      throw new Error("Audit unavailable");
    });
    await expect(
      service.importFile(t.container.devActor, result.id, project.id, "file-1"),
    ).rejects.toThrow("Audit unavailable");
    expect(t.container.db.select().from(sourceObjects).all()).toEqual([]);
    expect(t.container.db.select().from(sourceAccess).all()).toEqual([]);
    expect(t.container.db.select().from(jobs).all()).toEqual([]);
  });

  it("refuses cross-user connector access and query injection", async () => {
    const { service, result } = await connect();
    await expect(
      service.files({ ...t.container.devActor, id: "another-user" }, result.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.files(t.container.devActor, result.id, undefined, "folder' or 'a'='a"),
    ).rejects.toMatchObject({ status: 400 });
    const files = await service.files(t.container.devActor, result.id, "page", "folder_1");
    expect(files.nextPageToken).toBe("next-page");
    expect(provider.list).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSize: 50,
        pageToken: "page",
        q: "'folder_1' in parents and trashed = false",
      }),
    );
    expect(
      (
        await t.app.request(
          "/api/v1/connectors/absent/import",
          jsonRequest({ projectId: "invalid", fileId: "bad" }),
        )
      ).status,
    ).toBe(400);
  });
});
