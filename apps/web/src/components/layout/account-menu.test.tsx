import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { AccountMenu } from "@/components/layout/account-menu";
import { ThemeProvider } from "@/components/theme-provider";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const session = (authentication: "accounts" | "development") => ({
  authentication,
  user: { id: "u1", name: "Alex Rivera", email: "alex@example.com", image: null },
  signInMethod: authentication === "accounts" ? "magic-link" : "development",
  linkedMethods: authentication === "accounts" ? ["email"] : [],
  activeWorkspaceId: "w1",
  workspaces: [{ id: "w1", name: "Acme", slug: "acme", role: "member", ssoRequired: false }],
});

async function openMenu(authentication: "accounts" | "development") {
  mockServer.use(
    http.get(buildApiUrl("/v1/session"), () => HttpResponse.json(session(authentication))),
    http.get(buildApiUrl("/v1/users/me"), () =>
      HttpResponse.json({
        id: "u1",
        name: "Alex Rivera",
        email: "alex@example.com",
        role: "member",
        workspaceId: "w1",
        preferences: {},
      }),
    ),
  );
  renderWithProviders(
    <ThemeProvider>
      <AccountMenu />
    </ThemeProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Account: Alex Rivera" }));
  return user;
}

describe("AccountMenu", () => {
  it("signs out of a real account", async () => {
    const signedOut = vi.fn();
    mockServer.use(
      http.post(buildApiUrl("/v1/auth/sign-out"), () => {
        signedOut();
        return HttpResponse.json({ success: true });
      }),
    );
    const user = await openMenu("accounts");
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(signedOut).toHaveBeenCalledOnce());
  });

  it("explains why there is no sign-out in development mode", async () => {
    await openMenu("development");
    expect(await screen.findByRole("menuitem", { name: "Sign out" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText(/Development mode has no sign-in/)).toBeInTheDocument();
  });
});
