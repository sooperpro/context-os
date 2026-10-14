import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupPage } from "@/features/setup/pages/setup-page";
import { jsonResponse, renderWithProviders } from "@/test/utils";

const setupRecord = {
  id: "setup-1",
  version: 1,
  status: "in_progress",
  data: { steps: {} },
};
const setupResponse = {
  ...setupRecord,
  evidence: {
    completed: {
      connect_source: false,
      select_scopes: false,
      create_project: true,
      invite_team: false,
      assign_new_hire: false,
    },
    sync: { sources: 3, ready: 2, pending: 1, failed: 0 },
  },
};

function mockApi() {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    if (url.endsWith("/v1/workspaces/current/setup") && method === "GET")
      return Promise.resolve(jsonResponse(setupResponse));
    if (url.endsWith("/v1/workspaces/current/setup") && method === "PATCH")
      return Promise.resolve(jsonResponse(setupRecord));
    if (url.endsWith("/v1/connectors")) return Promise.resolve(jsonResponse({ items: [] }));
    return Promise.resolve(jsonResponse({ error: { code: "NOT_FOUND", message: url } }, { status: 404 }));
  });
  return calls;
}

describe("SetupPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("opens on the first pending step and only allows completion with evidence", async () => {
    mockApi();
    renderWithProviders(<SetupPage />);
    expect(await screen.findByRole("heading", { name: "Set up your workspace" })).toBeInTheDocument();
    const current = screen.getAllByRole("listitem").find((li) => li.getAttribute("aria-current") === "step");
    expect(current).toHaveTextContent("Connect");
    expect(screen.getByRole("button", { name: "Mark completed" })).toBeDisabled();
  });

  it("skips a step with the current version", async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderWithProviders(<SetupPage />);
    await user.click(await screen.findByRole("button", { name: "Skip for now" }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({
        version: 1,
        step: "connect_source",
        status: "skipped",
      }),
    );
  });

  it("enables completion for a step the backend has evidence for", async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithProviders(<SetupPage />);
    await screen.findByRole("heading", { name: "Set up your workspace" });
    await user.click(screen.getByRole("button", { name: /Create a project/ }));
    expect(screen.getByRole("button", { name: "Mark completed" })).toBeEnabled();
    expect(screen.getAllByText("Ready to confirm").length).toBeGreaterThan(0);
  });
});
