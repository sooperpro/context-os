import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriveImportDialog } from "@/features/sources/components/drive-import-dialog";
import { jsonResponse, renderWithProviders } from "@/test/utils";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const folder = { id: "f1", name: "Design docs", mimeType: "application/vnd.google-apps.folder" };
const doc = {
  id: "d1",
  name: "Billing migration plan",
  mimeType: "application/vnd.google-apps.document",
  modifiedTime: "2026-10-01T10:00:00.000Z",
  owners: [{ displayName: "Priya Nair" }],
};
const sheet = { id: "s1", name: "Budget", mimeType: "application/vnd.google-apps.spreadsheet" };
const inner = { id: "d2", name: "ADR 7", mimeType: "application/pdf" };
const importedSource = {
  id: "22222222-2222-4222-8222-222222222222",
  projectId: PROJECT,
  connector: "google_drive",
  kind: "document",
  externalId: "d1",
  title: "Billing migration plan",
  url: null,
  author: "Priya Nair",
  sourceCreatedAt: null,
  sourceUpdatedAt: null,
  ingestedAt: "2026-10-14T00:00:00.000Z",
  processedAt: null,
  status: "pending",
  error: null,
  contentLength: 10,
  chunkCount: 0,
};

function mockApi() {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    if (url.endsWith("/v1/connectors"))
      return Promise.resolve(
        jsonResponse({ items: [{ id: "c1", provider: "google-drive", status: "connected" }] }),
      );
    if (url.includes("/v1/connectors/c1/files")) {
      const inFolder = url.includes("folderId=f1");
      return Promise.resolve(
        jsonResponse({ items: inFolder ? [inner] : [folder, doc, sheet], nextPageToken: null }),
      );
    }
    if (url.endsWith("/v1/connectors/c1/import"))
      return Promise.resolve(jsonResponse(importedSource, { status: 201 }));
    return Promise.resolve(
      jsonResponse({ error: { code: "NOT_FOUND", message: url } }, { status: 404 }),
    );
  });
  return calls;
}

describe("DriveImportDialog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists the root, marks unsupported types and imports a selected document", async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderWithProviders(
      <DriveImportDialog projectId={PROJECT} open onOpenChange={() => undefined} />,
    );

    expect(await screen.findByText("Billing migration plan")).toBeInTheDocument();
    expect(screen.getByText("Not supported yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Import Billing migration plan" }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === "POST")?.body).toEqual({
        projectId: PROJECT,
        fileId: "d1",
        visibility: "workspace",
      }),
    );
    expect(await screen.findByText("Imported")).toBeInTheDocument();
  });

  it("navigates into folders and back through the breadcrumb", async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderWithProviders(
      <DriveImportDialog projectId={PROJECT} open onOpenChange={() => undefined} />,
    );

    await user.click(await screen.findByRole("button", { name: /Design docs/ }));
    expect(await screen.findByText("ADR 7")).toBeInTheDocument();
    expect(calls.some((call) => call.url.includes("folderId=f1"))).toBe(true);

    await user.click(screen.getByRole("button", { name: "My Drive" }));
    expect(await screen.findByText("Billing migration plan")).toBeInTheDocument();
  });

  it("offers to connect when no Drive connection exists", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ items: [] }));
    renderWithProviders(
      <DriveImportDialog projectId={PROJECT} open onOpenChange={() => undefined} />,
    );
    expect(await screen.findByRole("button", { name: "Connect Google Drive" })).toBeInTheDocument();
  });
});
