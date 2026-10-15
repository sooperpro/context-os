import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditLog,
  connectorScopes,
  jobs,
  platformRecords,
  sourceObjects,
} from "../../db/schema.js";
import { createProject, createTestApp, type TestApp } from "../../test/helpers.js";
import { createGoogleDriveService, scopeNote, type ScopeCursor } from "./google-drive.js";

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
          /* inert */
        }
        on() {
          /* inert */
        }
        generateAuthUrl(options: { state: string }) {
          return `https://accounts.google.com/o/oauth2/auth?state=${options.state}`;
        }
        getToken = provider.getToken;
        verifyIdToken = provider.verifyIdToken;
        revokeToken = provider.revokeToken;
      },
    },
    drive: () => ({
      files: { get: provider.get, export: provider.exportFile, list: provider.list },
      permissions: { list: vi.fn() },
    }),
  },
}));

const TEXT = "text/plain";
const SHEET = "application/vnd.google-apps.spreadsheet";
const FOLDER = "application/vnd.google-apps.folder";

interface FakeFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
}

describe("Drive sync at scale (mocked provider)", () => {
  let t: TestApp;
  /** Folder id → children, served 100 to a page like a real listing. */
  let tree: Map<string, FakeFile[]>;
  const downloads = () =>
    provider.get.mock.calls.filter(([params]) => (params as { alt?: string }).alt === "media")
      .length;
  const file = (id: string, extra: Partial<FakeFile> = {}): FakeFile => ({
    id,
    name: `${id}.txt`,
    mimeType: TEXT,
    modifiedTime: "2026-10-01T10:00:00.000Z",
    ...extra,
  });

  beforeEach(() => {
    vi.resetAllMocks();
    provider.getToken.mockResolvedValue({
      tokens: {
        access_token: "access",
        refresh_token: "refresh",
        id_token: "id",
        scope: "openid email https://www.googleapis.com/auth/drive.readonly",
      },
    });
    provider.verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: "subject" }) });
    provider.get.mockImplementation((params: { fileId: string; alt?: string }) =>
      Promise.resolve({
        data: Readable.from([Buffer.from(`Notes in ${params.fileId}. `.repeat(20))]),
      }),
    );
    provider.list.mockImplementation((params: { q?: string; pageToken?: string }) => {
      const parent = /'([^']+)' in parents/.exec(params.q ?? "")?.[1] ?? "";
      const children = tree.get(parent) ?? [];
      const start = Number(params.pageToken ?? 0);
      return Promise.resolve({
        data: {
          files: children.slice(start, start + 100),
          nextPageToken: start + 100 < children.length ? String(start + 100) : undefined,
        },
      });
    });
    tree = new Map();
    // 250 documents at the top, a folder chain six levels deep, plus files a sync can't use.
    tree.set("big", [
      ...Array.from({ length: 250 }, (_, i) => file(`doc-${i}`)),
      { id: "level-1", name: "Level 1", mimeType: FOLDER, modifiedTime: "2026-10-01T10:00:00Z" },
      file("budget", { mimeType: SHEET }),
      file("photo", { mimeType: "image/png" }),
      file("huge", { mimeType: "application/pdf", size: String(500_000_000) }),
    ]);
    for (let level = 1; level < 6; level += 1)
      tree.set(`level-${level}`, [
        {
          id: `level-${level + 1}`,
          name: `Level ${level + 1}`,
          mimeType: FOLDER,
          modifiedTime: "2026-10-01T10:00:00Z",
        },
      ]);
    tree.set("level-6", [file("deep")]);
    t = createTestApp({
      env: {
        GOOGLE_CLIENT_ID: "client",
        GOOGLE_CLIENT_SECRET: "secret",
        CONNECTOR_TOKEN_ENCRYPTION_KEY: "ab".repeat(32),
      },
    });
  });
  afterEach(() => t?.close());

  it("imports every file however many and however deep, then only what changed", async () => {
    const service = createGoogleDriveService(t.container);
    const state = new URL(
      service.authorize(t.container.devActor).authorizationUrl,
    ).searchParams.get("state")!;
    const connection = await service.callback(state, "code");
    const project = await createProject(t.app);
    service.setScopes(t.container.devActor, connection.id, {
      projectId: project.id,
      scopes: [
        {
          scopeType: "folder",
          externalId: "big",
          name: "Big folder",
          excluded: false,
          visibility: "workspace",
        },
      ],
    });
    const scopeId = t.container.db.select().from(connectorScopes).get()!.id;
    const sync = async () => {
      t.container.queue.enqueue({
        projectId: project.id,
        type: "sync_connector",
        payload: { connectionId: connection.id, scopeId },
        subject: "Big folder",
      });
      await t.container.worker.drain(5000);
    };

    await sync();
    const sources = () => t.container.db.select().from(sourceObjects).all();
    // All 251 documents (past the old 200-file and 3-level limits), none of the skipped ones.
    expect(sources()).toHaveLength(251);
    expect(sources().every((row) => row.status === "ready")).toBe(true);
    expect(sources().some((row) => row.externalId === "deep")).toBe(true);
    expect(downloads()).toBe(251);
    const scope = t.container.db.select().from(connectorScopes).get()!;
    expect(scope).toMatchObject({ status: "live", itemCount: 251, lastError: null });
    expect(scopeNote(scope.cursor as ScopeCursor)).toBe(
      "1 Sheet or Slide skipped · 1 file of other types skipped · 1 file too large",
    );
    const imports = () =>
      t.container.db
        .select()
        .from(auditLog)
        .all()
        .filter((row) => row.action === "connector.import").length;
    expect(imports()).toBe(251);

    // Nothing changed: no downloads, no audit noise, nothing re-processed.
    const processed = () =>
      t.container.db.select().from(jobs).where(eq(jobs.type, "process_source")).all().length;
    const before = processed();
    await sync();
    expect(downloads()).toBe(251);
    expect(imports()).toBe(251);
    expect(processed()).toBe(before);

    // One edited, one deleted, one whose processing had failed.
    tree.set("big", [
      file("doc-0", { modifiedTime: "2026-10-12T09:00:00.000Z" }),
      ...tree.get("big")!.slice(2),
    ]);
    const failed = sources().find((row) => row.externalId === "doc-5")!;
    t.container.db
      .update(sourceObjects)
      .set({ status: "failed", error: "Gemini was busy" })
      .where(eq(sourceObjects.id, failed.id))
      .run();
    await sync();
    expect(downloads()).toBe(252);
    expect(sources()).toHaveLength(250);
    expect(sources().some((row) => row.externalId === "doc-1")).toBe(false);
    expect(
      t.container.db
        .select()
        .from(platformRecords)
        .where(eq(platformRecords.kind, "tombstone"))
        .all(),
    ).toHaveLength(1);
    expect(sources().find((row) => row.id === failed.id)?.status).toBe("ready");
  });

  it("stops at the per-scope limit without deleting what it didn't list", async () => {
    t.env.DRIVE_MAX_FILES_PER_SCOPE = 50;
    const service = createGoogleDriveService(t.container);
    const state = new URL(
      service.authorize(t.container.devActor).authorizationUrl,
    ).searchParams.get("state")!;
    const connection = await service.callback(state, "code");
    const project = await createProject(t.app);
    service.setScopes(t.container.devActor, connection.id, {
      projectId: project.id,
      scopes: [
        {
          scopeType: "folder",
          externalId: "big",
          name: "Big folder",
          excluded: false,
          visibility: "workspace",
        },
      ],
    });
    service.requestSync(t.container.devActor, connection.id);
    await t.container.worker.drain(5000);
    expect(t.container.db.select().from(sourceObjects).all()).toHaveLength(50);
    expect(t.container.db.select().from(connectorScopes).get()?.lastError).toBe(
      "Only the first 50 files are synced",
    );
  });
});
