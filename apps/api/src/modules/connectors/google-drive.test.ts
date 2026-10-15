import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectorConnections,
  connectorScopes,
  identityLinks,
  jobs,
  memberships,
  oauthStates,
  sourceAccess,
  sourceObjects,
  users,
} from "../../db/schema.js";
import { openCredentials } from "../../lib/credentials.js";
import { createProject, createTestApp, jsonRequest, type TestApp } from "../../test/helpers.js";
import { accessJob, createGoogleDriveService } from "./google-drive.js";

const provider = vi.hoisted(() => ({
  getToken: vi.fn(),
  verifyIdToken: vi.fn(),
  get: vi.fn(),
  exportFile: vi.fn(),
  list: vi.fn(),
  permissions: vi.fn(),
  revokeToken: vi.fn(),
}));
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        credentials: { access_token?: string } = {};
        /** Kept so the fake can answer per account (whose Drive is listing). */
        setCredentials(credentials: { access_token?: string }) {
          this.credentials = credentials;
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
    drive: ({ auth }: { auth?: { credentials?: { access_token?: string } } }) => ({
      files: {
        get: provider.get,
        export: provider.exportFile,
        list: (params: unknown) =>
          provider.list(params, auth?.credentials?.access_token) as Promise<unknown>,
      },
      permissions: { list: provider.permissions },
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
    const list: unknown = await (await t.app.request("/api/v1/connectors")).json();
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
    await t.drain();
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

  it("works out who may read restricted files in the background, never during a request", async () => {
    const db = t.container.db;
    const member = (id: string, email: string | null) => {
      db.insert(users).values({ id, name: id, email }).run();
      db.insert(memberships)
        .values({ workspaceId: t.container.workspace.id, userId: id, role: "member" })
        .run();
      return { ...t.container.devActor, id, name: id, role: "member" as const };
    };
    const shared = member("shared", "shared@example.com");
    const reader = member("reader", null);
    const outsider = member("outsider", "outsider@example.com");
    // The owner's listing shows the file shared with shared@example.com; the reader's own Drive
    // lists it too (a group share Drive doesn't spell out).
    let readerSees = true;
    let sharedWith = [{ type: "user", emailAddress: "Shared@Example.com" }];
    provider.list.mockImplementation((params: { q?: string }, token?: string) =>
      Promise.resolve({
        data: {
          files:
            token === "reader-access" && !readerSees
              ? []
              : params.q?.includes("in parents")
                ? [{ ...info, permissions: token === "reader-access" ? undefined : sharedWith }]
                : [],
        },
      }),
    );
    provider.getToken.mockResolvedValueOnce({
      tokens: { ...token, access_token: "owner-access" },
    });
    const { service, result } = await connect();
    const project = await createProject(t.app);
    service.setScopes(t.container.devActor, result.id, {
      projectId: project.id,
      scopes: [
        {
          scopeType: "folder",
          externalId: "folder_1",
          name: "Specs",
          excluded: false,
          visibility: "restricted",
        },
      ],
    });
    service.requestSync(t.container.devActor, result.id);
    await t.drain();
    const source = db.select().from(sourceObjects).get()!;
    const visible = (actor: typeof shared) =>
      t.container.identity.visibleSourceIds(actor, project.id).includes(source.id);
    // Shared by email: visible. Not shared and no Drive of their own: hidden.
    expect(visible(shared)).toBe(true);
    expect(visible(reader)).toBe(false);
    expect(visible(outsider)).toBe(false);
    // Claiming someone else's address as your Google identity gets you nothing: a member's own
    // sign-in email always wins.
    db.insert(identityLinks)
      .values({
        id: "claimed-link",
        workspaceId: t.container.workspace.id,
        userId: outsider.id,
        provider: "google",
        externalId: "someone-else",
        email: "shared@example.com",
        status: "confirmed",
        source: "oauth",
        linkedAt: new Date(),
      })
      .run();
    t.container.queue.enqueue(accessJob(db.select().from(connectorScopes).get()!));
    await t.drain();
    expect(visible(outsider)).toBe(false);
    expect(visible(shared)).toBe(true);
    expect(t.container.identity.visibleSourceIds(t.container.devActor, project.id)).toContain(
      source.id,
    );

    // The reader connects their own Drive; the background refresh finds the file there.
    const state = new URL(service.authorize(reader).authorizationUrl).searchParams.get("state")!;
    provider.getToken.mockResolvedValueOnce({
      tokens: { ...token, access_token: "reader-access" },
    });
    const readerConnection = await service.callback(state, "test-code");
    await t.drain();
    expect(visible(reader)).toBe(true);

    // Requests read the stored answer: no Google call while serving pages.
    const calls = provider.list.mock.calls.length + provider.get.mock.calls.length;
    await t.app.request(`/api/v1/projects/${project.id}/sources`);
    await t.app.request("/api/v1/users/me");
    expect(provider.list.mock.calls.length + provider.get.mock.calls.length).toBe(calls);

    // Sharing removed in Drive: the next refresh takes access away.
    sharedWith = [];
    readerSees = false;
    const scope = db.select().from(connectorScopes).get()!;
    t.container.queue.enqueue(accessJob(scope));
    await t.drain();
    expect(visible(shared)).toBe(false);
    expect(visible(reader)).toBe(false);

    // Grants that aren't refreshed expire (fail closed).
    sharedWith = [{ type: "anyone", emailAddress: "" }];
    t.container.queue.enqueue(accessJob(scope));
    await t.drain();
    expect(visible(outsider)).toBe(true);
    db.update(sourceAccess)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .run();
    expect(visible(outsider)).toBe(false);

    // A revoked reader token marks their connection for re-authorisation.
    provider.list.mockImplementation((_params: unknown, token?: string) =>
      token === "reader-access"
        ? Promise.reject(Object.assign(new Error("Unauthorized"), { response: { status: 401 } }))
        : Promise.resolve({ data: { files: [info] } }),
    );
    t.container.queue.enqueue(accessJob(scope));
    await t.drain();
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
      "test-access",
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
