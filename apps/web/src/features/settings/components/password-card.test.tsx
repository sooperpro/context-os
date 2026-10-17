import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Toaster } from "sonner";
import { describe, expect, it } from "vitest";
import { PasswordCard } from "@/features/settings/components/password-card";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

/** Signed in through accounts, with these sign-in methods; returns the password requests made. */
function renderCard(linkedMethods: string[]) {
  const bodies: unknown[] = [];
  mockServer.use(
    http.get(buildApiUrl("/v1/session"), () =>
      HttpResponse.json({
        authentication: "accounts",
        user: { id: "u1", name: "Lee Park", email: "lee@example.com", image: null },
        signInMethod: "magic-link",
        linkedMethods,
        activeWorkspaceId: "w1",
        workspaces: [],
      }),
    ),
    http.post(buildApiUrl("/v1/session/password"), async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({
        password: linkedMethods.includes("password") ? "changed" : "added",
      });
    }),
  );
  renderWithProviders(
    <>
      <PasswordCard />
      <Toaster />
    </>,
  );
  return bodies;
}

describe("PasswordCard", () => {
  it("adds a password for someone who signs in with an email link", async () => {
    const user = userEvent.setup();
    const bodies = renderCard(["email"]);
    expect(await screen.findByText("Add a password")).toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Add password" });
    await user.type(screen.getByLabelText("Password"), "first password 1");
    await user.type(screen.getByLabelText("Repeat it"), "first password");
    expect(screen.getByText("The passwords don’t match.")).toBeInTheDocument();
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("Repeat it"), " 1");
    await user.click(submit);
    await waitFor(() =>
      expect(bodies).toEqual([{ newPassword: "first password 1", signOutOtherDevices: true }]),
    );
    expect(await screen.findByText(/Password added/)).toBeInTheDocument();
  });

  it("changes a password with the current one", async () => {
    const user = userEvent.setup();
    const bodies = renderCard(["email", "password"]);
    expect(await screen.findByText("Change password", { selector: "div" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Current password"), "first password 1");
    await user.type(screen.getByLabelText("New password"), "second password 2");
    await user.type(screen.getByLabelText("Repeat it"), "second password 2");
    await user.click(screen.getByRole("switch", { name: "Sign out on my other devices" }));
    await user.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() =>
      expect(bodies).toEqual([
        {
          currentPassword: "first password 1",
          newPassword: "second password 2",
          signOutOtherDevices: false,
        },
      ]),
    );
  });
});
