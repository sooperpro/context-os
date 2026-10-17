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
      onboarding_templates: false,
      invite_team: false,
      assign_new_hire: false,
    },
    sync: { sources: 3, ready: 2, pending: 1, failed: 0 },
  },
};

/** One role from people's job titles; once generated, it has a draft waiting for review. */
const setupRoles = (generated: boolean) => ({
  departments: [{ id: "d1", name: "Sales", teams: [] }],
  roles: [
    {
      title: "Sales executive",
      departmentId: "d1",
      departmentName: "Sales",
      teamId: null,
      teamName: null,
      people: 2,
      planned: false,
      template: generated
        ? {
            id: "tpl-1",
            name: "Sales executive · Sales",
            status: "draft",
            generating: true,
            failed: false,
          }
        : null,
    },
  ],
  allowance: {
    templates: { used: generated ? 1 : 0, total: 30 },
    modules: { used: 0, total: 300 },
  },
});

function mockApi() {
  let generated = false;
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
    if (url.endsWith("/v1/workspaces/current/setup/roles/generate")) {
      generated = true;
      return Promise.resolve(
        jsonResponse({ ...setupRoles(true), started: 1, stopped: null }, { status: 202 }),
      );
    }
    if (url.endsWith("/v1/workspaces/current/setup/roles"))
      return Promise.resolve(jsonResponse(setupRoles(generated)));
    return Promise.resolve(
      jsonResponse({ error: { code: "NOT_FOUND", message: url } }, { status: 404 }),
    );
  });
  return calls;
}

describe("SetupPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("opens on the first pending step and only allows completion with evidence", async () => {
    mockApi();
    renderWithProviders(<SetupPage />);
    expect(
      await screen.findByRole("heading", { name: "Set up your workspace" }),
    ).toBeInTheDocument();
    const current = screen
      .getAllByRole("listitem")
      .find((li) => li.getAttribute("aria-current") === "step");
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

  it("drafts a template for every role without one, from the setup allowance", async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderWithProviders(<SetupPage />);
    await screen.findByRole("heading", { name: "Set up your workspace" });
    await user.click(screen.getByRole("button", { name: /Generate onboarding templates/ }));
    const roles = await screen.findByRole("list", { name: "Roles" });
    expect(roles).toHaveTextContent("Sales executive");
    expect(roles).toHaveTextContent("Sales · 2 people");
    expect(roles).toHaveTextContent("No template");
    expect(screen.getByText(/Setup allowance: 0 of 30 templates/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate templates for 1 role" }));
    await waitFor(() =>
      expect(calls.find((call) => call.url.endsWith("/setup/roles/generate"))?.body).toEqual({
        roles: [{ title: "Sales executive", departmentId: "d1", teamId: null }],
      }),
    );
    expect(await screen.findByText("Drafting…")).toBeInTheDocument();
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
