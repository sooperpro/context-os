import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme-provider";
import { SettingsPage } from "@/features/settings/pages/settings-page";
import { jsonResponse, renderWithProviders } from "@/test/utils";

function mockApi(role = "member") {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  let prefs = { email: false, inApp: true, quietStartHour: 22, quietEndHour: 8 };
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    if (url.endsWith("/v1/workspaces/current"))
      return Promise.resolve(
        jsonResponse({ id: "w1", name: "Tessellate", role, authentication: "development" }),
      );
    if (url.endsWith("/v1/users/me") && method === "GET")
      return Promise.resolve(
        jsonResponse({
          id: "u1",
          name: "Maya Okafor",
          email: "maya@example.test",
          role,
          workspaceId: "w",
          preferences: { timezone: "Europe/London" },
          organization: { jobTitle: "Product Engineer" },
          profile: {
            pronouns: "",
            location: "London",
            bio: "",
            skills: ["Billing"],
            avatarShape: null,
          },
        }),
      );
    if (url.endsWith("/v1/users/me"))
      return Promise.resolve(
        jsonResponse({ id: "u1", name: "Maya O.", email: null, preferences: {} }),
      );
    if (url.endsWith("/v1/notifications/preferences") && method === "PATCH") {
      prefs = body as typeof prefs;
      return Promise.resolve(jsonResponse(prefs));
    }
    if (url.endsWith("/v1/notifications/preferences")) return Promise.resolve(jsonResponse(prefs));
    if (url.includes("/v1/skills/suggest"))
      return Promise.resolve(
        jsonResponse({
          items: [
            { label: "Python", id: null, source: "workspace" },
            {
              label: "Python (computer programming)",
              id: "http://data.europa.eu/esco/skill/ccd0a1d9",
              source: "esco",
            },
          ],
        }),
      );
    return Promise.resolve(
      jsonResponse({ error: { code: "NOT_FOUND", message: url } }, { status: 404 }),
    );
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
      expect(
        calls.find((call) => call.method === "PATCH" && call.url.endsWith("/v1/users/me"))?.body,
      ).toEqual({
        name: "Maya O.",
        timezone: "Europe/London",
      }),
    );
  });

  it("edits pronouns, location, bio, skills and avatar shape, sending only what changed", async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render();
    await user.type(await screen.findByLabelText("Pronouns"), "she/her");
    await user.type(screen.getByLabelText("Bio"), "Billing and invoices.");
    await user.click(screen.getByRole("button", { name: "Remove Billing" }));
    await user.type(screen.getByLabelText("Skills"), "Kafka{Enter}");
    await user.type(screen.getByLabelText("Skills"), "kafka");
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    await user.clear(screen.getByLabelText("Skills"));
    await user.type(screen.getByLabelText("Skills"), "Go");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("radio", { name: "Flower" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Sunny" }));
    expect(screen.getByText("Product Engineer")).toBeInTheDocument();
    expect(screen.getByText(/From the HR system/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        calls.find((call) => call.method === "PATCH" && call.url.endsWith("/v1/users/me"))?.body,
      ).toEqual({
        name: "Maya Okafor",
        timezone: "Europe/London",
        pronouns: "she/her",
        bio: "Billing and invoices.",
        skills: ["Kafka", "Go"],
        avatarShape: "sunny",
      }),
    );
  });

  it("suggests skills as you type, and saves the ESCO id of one picked from the list (N-10)", async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render();
    const input = await screen.findByLabelText("Skills");
    await user.type(input, "pyth");
    const list = document.getElementById(input.getAttribute("list") ?? "");
    await waitFor(() =>
      expect([...(list?.querySelectorAll("option") ?? [])].map((option) => option.value)).toEqual([
        "Python",
        "Python (computer programming)",
      ]),
    );
    expect(calls.some((call) => call.url.includes("/v1/skills/suggest?q=pyth"))).toBe(true);
    // Picking it fills the field; it's added with ESCO's spelling and id.
    await user.clear(input);
    await user.type(input, "python (computer programming){Enter}");
    expect(
      screen.getByRole("button", { name: "Remove Python (computer programming)" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        calls.find((call) => call.method === "PATCH" && call.url.endsWith("/v1/users/me"))?.body,
      ).toMatchObject({
        skills: ["Billing", "Python (computer programming)"],
        skillIds: { "Python (computer programming)": "http://data.europa.eu/esco/skill/ccd0a1d9" },
      }),
    );
  });

  it("saves notification channels as the whole preference object", async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render("/settings?tab=notifications");
    await user.click(await screen.findByRole("switch", { name: /Email/ }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === "PATCH")?.body).toMatchObject({
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
    expect(screen.getByRole("button", { name: /Members & roles/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI settings" })).toBeInTheDocument();
  });
});
