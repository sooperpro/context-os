import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { buildApiUrl } from "@/lib/api-client";
import { createQueryClient } from "@/lib/query-client";
import { mockServer, setupMockApi } from "@/test/msw";

setupMockApi();

const SIGNED_IN = {
  authentication: "accounts",
  user: { id: "u1", name: "Maya Okafor", email: "maya@example.com", image: null },
  signInMethod: "password",
  linkedMethods: ["email", "password"],
  activeWorkspaceId: "w1",
  workspaces: [{ id: "w1", name: "Acme", slug: "acme", role: "member", ssoRequired: false }],
};

/** A signed-out browser; records what each auth endpoint received. */
function signedOut(answers: Record<string, () => Response> = {}) {
  const calls: Array<{ path: string; body: unknown }> = [];
  let session: unknown = null;
  mockServer.use(
    http.get(buildApiUrl("/v1/session"), () =>
      session
        ? HttpResponse.json(session)
        : HttpResponse.json(
            { error: { code: "UNAUTHENTICATED", message: "Sign in to continue" } },
            { status: 401 },
          ),
    ),
    http.get(buildApiUrl("/v1/auth-options"), () =>
      HttpResponse.json({
        authentication: "accounts",
        methods: { email: true, password: true, google: false, microsoft: false, sso: true },
      }),
    ),
    http.post(buildApiUrl("/v1/auth/*"), async ({ request }) => {
      const path = new URL(request.url).pathname.replace(/^.*\/v1\/auth\//, "");
      calls.push({ path, body: await request.json() });
      if (path === "sign-in/email" && !answers[path]) session = SIGNED_IN;
      return answers[path]?.() ?? HttpResponse.json({ status: true });
    }),
  );
  return calls;
}

function renderApp() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <AuthGate>
          <p>Signed-in app</p>
        </AuthGate>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe("Sign in and sign up with a password", () => {
  // Signed-out visitors at the root see the landing page; its Log in opens the form (N-5).
  beforeEach(() => window.history.replaceState(null, "", "/?mode=sign-in"));
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("creates an account and asks to confirm the email", async () => {
    const calls = signedOut();
    const user = renderApp();
    await user.click(await screen.findByRole("button", { name: "Create an account" }));
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Your name"), "Maya Okafor");
    await user.type(screen.getByLabelText("Work email"), "maya@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Confirm your email")).toBeInTheDocument();
    expect(calls).toEqual([
      {
        path: "sign-up/email",
        body: {
          name: "Maya Okafor",
          email: "maya@example.com",
          password: "correct horse battery",
          callbackURL: "/",
        },
      },
    ]);
  });

  it("signs in with a password and opens the app", async () => {
    const calls = signedOut();
    const user = renderApp();
    await user.type(await screen.findByLabelText("Work email"), "maya@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Signed-in app")).toBeInTheDocument();
    expect(calls[0]).toMatchObject({ path: "sign-in/email", body: { email: "maya@example.com" } });
  });

  it("explains a wrong password and an email that isn't confirmed yet", async () => {
    let code = "INVALID_EMAIL_OR_PASSWORD";
    signedOut({
      "sign-in/email": () =>
        HttpResponse.json(
          { code, message: "Invalid email or password" },
          { status: code === "EMAIL_NOT_VERIFIED" ? 403 : 401 },
        ),
    });
    const user = renderApp();
    await user.type(await screen.findByLabelText("Work email"), "maya@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/That email and password don't match/)).toBeInTheDocument();
    code = "EMAIL_NOT_VERIFIED";
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Confirm your email")).toBeInTheDocument();
  });

  it("still sends a one-time sign-in link without a password", async () => {
    const calls = signedOut();
    const user = renderApp();
    await user.type(await screen.findByLabelText("Work email"), "maya@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link instead" }));
    expect(
      await screen.findByText(/We sent a sign-in link to maya@example.com/),
    ).toBeInTheDocument();
    expect(calls[0]).toMatchObject({ path: "sign-in/magic-link" });
  });

  it("emails a reset link and lets them choose a new password", async () => {
    const calls = signedOut();
    const user = renderApp();
    await user.click(await screen.findByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Work email"), "maya@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a reset link" }));
    expect(
      await screen.findByText(/we sent it a link to choose a new password/),
    ).toBeInTheDocument();
    expect(calls[0]).toEqual({
      path: "request-password-reset",
      body: { email: "maya@example.com", redirectTo: "/reset-password" },
    });
  });

  it("sets the new password from the reset link", async () => {
    const calls = signedOut();
    window.history.replaceState(null, "", "/reset-password?token=reset-token-1");
    const user = renderApp();
    expect(
      await screen.findByRole("heading", { name: "Choose a new password" }),
    ).toBeInTheDocument();
    // The token leaves the address bar as soon as the page has it.
    expect(window.location.search).toBe("");
    await user.type(screen.getByLabelText("New password"), "a brand new password");
    await user.type(screen.getByLabelText("Confirm new password"), "a brand new passwor");
    expect(screen.getByText("The passwords don't match.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Confirm new password"), "d");
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByText("Your password was changed")).toBeInTheDocument();
    expect(calls).toEqual([
      {
        path: "reset-password",
        body: { token: "reset-token-1", newPassword: "a brand new password" },
      },
    ]);
  });

  it("explains an expired reset link", async () => {
    signedOut();
    window.history.replaceState(null, "", "/reset-password?error=INVALID_TOKEN");
    renderApp();
    expect(
      await screen.findByText("That reset link has expired or was already used"),
    ).toBeInTheDocument();
  });
});
