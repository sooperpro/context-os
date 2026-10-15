import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "@/components/theme-provider";
import { SettingsPage } from "@/features/settings/pages/settings-page";
import { buildApiUrl } from "@/lib/api-client";
import { employeeHandlers } from "@/test/employee-mocks";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const revoked: string[] = [];
const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function render(route: string) {
  let connectors = [
    {
      id: "drive-1",
      provider: "google_drive",
      status: "connected",
      accountId: "maya@tessellate.io",
      scopes: ["drive.readonly"],
      createdAt: "2026-10-06T09:00:00.000Z",
    },
  ];
  let devices = [
    {
      id: "s1",
      userAgent: MAC_CHROME,
      ipAddress: null,
      signInMethod: "google",
      createdAt: "2026-10-15T08:00:00.000Z",
      lastActiveAt: new Date().toISOString(),
      current: true,
    },
    {
      id: "s2",
      userAgent: IPHONE_SAFARI,
      ipAddress: null,
      signInMethod: "magic-link",
      createdAt: "2026-10-14T08:00:00.000Z",
      lastActiveAt: new Date(Date.now() - 7_200_000).toISOString(),
      current: false,
    },
  ];
  mockServer.use(
    // Context Bot preferences and the data export are served by the API; fixtures stand in.
    ...employeeHandlers(),
    http.get(buildApiUrl("/v1/session"), () =>
      HttpResponse.json({
        authentication: "accounts",
        user: { id: "u1", name: "Maya Okafor", email: "maya@tessellate.io", image: null },
        signInMethod: "google",
        linkedMethods: ["email", "google"],
        activeWorkspaceId: "w1",
        workspaces: [
          { id: "w1", name: "Tessellate", slug: "tessellate", role: "member", ssoRequired: false },
        ],
      }),
    ),
    http.get(buildApiUrl("/v1/session/devices"), () => HttpResponse.json({ items: devices })),
    http.delete(buildApiUrl("/v1/session/devices/:id"), ({ params }) => {
      revoked.push(String(params.id));
      devices = devices.filter((device) => device.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(buildApiUrl("/v1/workspaces/current"), () =>
      HttpResponse.json({
        id: "w1",
        name: "Tessellate",
        role: "member",
        authentication: "development",
      }),
    ),
    http.get(buildApiUrl("/v1/users/me"), () =>
      HttpResponse.json({
        id: "u1",
        name: "Maya Okafor",
        email: "maya@tessellate.io",
        role: "member",
        workspaceId: "w1",
        preferences: {},
      }),
    ),
    http.get(buildApiUrl("/v1/connectors"), () => HttpResponse.json({ items: connectors })),
    http.delete(buildApiUrl("/v1/connectors/:id"), ({ params }) => {
      connectors = connectors.filter((connector) => connector.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  renderWithProviders(
    <ThemeProvider>
      <SettingsPage />
    </ThemeProvider>,
    { route },
  );
}

describe("Settings · security and preferences", () => {
  it("shows sign-in methods and devices, and signs out another device", async () => {
    const user = userEvent.setup();
    render("/settings?tab=security");

    expect(
      await screen.findByText("Signed in as maya@tessellate.io. Any of these opens your account."),
    ).toBeInTheDocument();
    const google = screen.getByText("Google").closest("li")!;
    expect(within(google).getByText("This session")).toBeInTheDocument();
    expect(screen.getByText("Managed by provider")).toBeInTheDocument();
    const phone = await screen.findByText("iPhone · Safari");
    expect(screen.getByText("Mac · Chrome")).toBeInTheDocument();
    await user.click(within(phone.closest("li")!).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(revoked).toEqual(["s2"]));
    await waitFor(() => expect(screen.queryByText("iPhone · Safari")).not.toBeInTheDocument());

    const apps = screen.getByText("Google Drive").closest("li")!;
    await user.click(within(apps).getByRole("button", { name: "Disconnect" }));
    expect(await screen.findByText("No connected apps.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Request a copy" }));
    expect(await screen.findByRole("button", { name: "Copy requested" })).toBeDisabled();
  });

  it("saves Context Bot preferences and reduces motion on this device", async () => {
    const user = userEvent.setup();
    render("/settings?tab=preferences");

    const suggestions = await screen.findByRole("switch", { name: /Show suggested questions/ });
    expect(suggestions).toBeChecked();
    await user.click(suggestions);
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: /Show suggested questions/ })).not.toBeChecked(),
    );
    const saved = (await (
      await fetch(new URL(buildApiUrl("/v1/me/assistant-preferences"), window.location.origin))
    ).json()) as {
      showSuggestions: boolean;
    };
    expect(saved.showSuggestions).toBe(false);

    await user.click(screen.getByRole("switch", { name: /Reduce motion/ }));
    expect(document.documentElement.dataset.motion).toBe("reduced");
    await user.click(screen.getByRole("switch", { name: /Reduce motion/ }));
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });
});
