import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme-provider";
import { SettingsPage } from "@/features/settings/pages/settings-page";
import { jsonResponse, renderWithProviders } from "@/test/utils";

vi.mock("@clerk/react", () => ({ useClerk: () => ({ openUserProfile: vi.fn(), signOut: vi.fn() }) }));

function mockApi(role = "member") {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  let prefs = { email: false, inApp: true, quietStartHour: 22, quietEndHour: 8 };
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    if (url.endsWith("/v1/users/me") && method === "GET")
      return Promise.resolve(jsonResponse({ id: "u1", name: "Maya Okafor", email: "maya@example.test", role, workspaceId: "w", preferences: { timezone: "Europe/London" } }));
    if (url.endsWith("/v1/users/me")) return Promise.resolve(jsonResponse({ id: "u1", name: "Maya O.", email: null, preferences: {} }));
    if (url.endsWith("/v1/notifications/preferences") && method === "PATCH") {
      prefs = body as typeof prefs;
      return Promise.resolve(jsonResponse(prefs));
    }
    if (url.endsWith("/v1/notifications/preferences")) return Promise.resolve(jsonResponse(prefs));
    return Promise.resolve(jsonResponse({ error: { code: "NOT_FOUND", message: url } }, { status: 404 }));
  });
  return calls;
}

const render = (route = "/settings") =>
  renderWithProviders(
    <ThemeProvider>
      <SettingsPage />
    </ThemeProvider>,
    { route },
  );

describe("SettingsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("saves a changed name with the time zone, and only when something changed", async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render();
    const name = await screen.findByLabelText("Name");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.clear(name);
    await user.type(name, "Maya O.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === "PATCH" && call.url.endsWith("/v1/users/me"))?.body).toEqual({
        name: "Maya O.",
        timezone: "Europe/London",
      }),
    );
  });

  it("saves notification channels as the whole preference object", async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render("/settings?tab=notifications");
    await user.click(await screen.findByRole("switch", { name: /Email/ }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({
        email: true,
        inApp: true,
        quietStartHour: 22,
        quietEndHour: 8,
      }),
    );
  });

  it("shows workspace links to admins only", async () => {
    mockApi("admin");
    render();
    expect(await screen.findByText("Workspace settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /People/ })).toBeInTheDocument();
  });
});
