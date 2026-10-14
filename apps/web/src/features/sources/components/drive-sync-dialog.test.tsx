import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriveSyncDialog } from "@/features/sources/components/drive-sync-dialog";
import { jsonResponse, renderWithProviders } from "@/test/utils";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";
const specs = {
  id: "44444444-4444-4444-8444-444444444444",
  projectId: PROJECT,
  scopeType: "folder",
  externalId: "folder-1",
  name: "Specs",
  excluded: false,
  backfillFrom: null,
  visibility: "restricted",
  frequency: "hourly",
  status: "live",
  lastSyncRequestedAt: "2026-10-14T09:00:00.000Z",
  lastSyncedAt: "2026-10-14T09:01:00.000Z",
  itemCount: 12,
  lastError: null,
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
        jsonResponse({ items: [{ id: "c1", provider: "google_drive", status: "connected" }] }),
      );
    if (url.endsWith("/v1/connectors/c1/scopes") && method === "GET")
      return Promise.resolve(
        jsonResponse({
          items: [
            { scopeType: "folder", externalId: "root", name: "My Drive", selections: [] },
            { scopeType: "folder", externalId: "folder-1", name: "Specs", selections: [specs] },
            {
              scopeType: "shared_drive",
              externalId: "drive-1",
              name: "Engineering",
              selections: [{ ...specs, id: "5", projectId: OTHER, externalId: "drive-1" }],
            },
          ],
          nextPageToken: null,
        }),
      );
    if (url.endsWith("/v1/connectors/c1/scopes") && method === "PUT")
      return Promise.resolve(
        jsonResponse({
          items: [
            specs,
            { ...specs, id: "6", externalId: "root", name: "My Drive", status: "selected" },
          ],
        }),
      );
    if (url.endsWith("/v1/connectors/c1/sync"))
      return Promise.resolve(jsonResponse({ queued: 2, items: [] }, { status: 202 }));
    return Promise.resolve(
      jsonResponse({ error: { code: "NOT_FOUND", message: url } }, { status: 404 }),
    );
  });
  return calls;
}

describe("DriveSyncDialog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows this project's selections, saves a new one and queues a sync", async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderWithProviders(
      <DriveSyncDialog projectId={PROJECT} open onOpenChange={() => undefined} />,
    );

    const root = await screen.findByRole("checkbox", { name: /My Drive/ });
    expect(root).not.toBeChecked();
    // The saved folder mirrors Drive permissions, so the sharing switch starts off.
    const share = screen.getByRole("switch", { name: /Share with everyone in the workspace/ });
    expect(share).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Specs/ })).toBeChecked();
    // Another project's selection of the shared drive does not count for this one.
    expect(screen.getByRole("checkbox", { name: /Engineering/ })).not.toBeChecked();
    expect(screen.getByText("In sync")).toBeInTheDocument();
    expect(screen.getByText(/12 files/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save and sync" })).toBeDisabled();

    await user.click(root);
    await user.click(share);
    await user.click(screen.getByRole("button", { name: "Save and sync" }));

    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/sync"))).toBe(true));
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
      projectId: PROJECT,
      scopes: [
        {
          scopeType: "folder",
          externalId: "root",
          name: "My Drive",
          excluded: false,
          visibility: "workspace",
        },
        {
          scopeType: "folder",
          externalId: "folder-1",
          name: "Specs",
          excluded: false,
          visibility: "workspace",
        },
      ],
    });
    expect(calls.find((call) => call.url.endsWith("/sync"))?.body).toEqual({});
  });

  it("lets the admin change sharing for what is already synced, without picking anything new", async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderWithProviders(
      <DriveSyncDialog projectId={PROJECT} open onOpenChange={() => undefined} />,
    );

    await user.click(
      await screen.findByRole("switch", { name: /Share with everyone in the workspace/ }),
    );
    await user.click(screen.getByRole("button", { name: "Save and sync" }));

    await waitFor(() => expect(calls.some((call) => call.method === "PUT")).toBe(true));
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
      projectId: PROJECT,
      scopes: [
        {
          scopeType: "folder",
          externalId: "folder-1",
          name: "Specs",
          excluded: false,
          visibility: "workspace",
        },
      ],
    });
  });
});
