import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionState } from "@contextos/shared";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { apiRequest, buildApiUrl } from "@/lib/api-client";
import { createQueryClient } from "@/lib/query-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { z } from "zod";

setupMockApi();

const WORKSPACE = {
  id: "w1",
  name: "Acme",
  slug: "acme",
  role: "member" as const,
  ssoRequired: false,
};
const signedIn: SessionState = {
  authentication: "accounts",
  user: { id: "u1", name: "Alex", email: "alex@example.com", image: null },
  signInMethod: "magic-link",
  linkedMethods: ["email"],
  activeWorkspaceId: "w1",
  workspaces: [WORKSPACE],
};

/** A page that loads something once a button is pressed, like any screen after sign-in. */
function Page() {
  const projects = useQuery({
    queryKey: ["projects-probe"],
    queryFn: () => apiRequest("/v1/projects", { schema: z.unknown() }),
    enabled: false,
  });
  return (
    <button type="button" onClick={() => void projects.refetch()}>
      Load projects
    </button>
  );
}

function renderApp() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <AuthGate>
          <Page />
        </AuthGate>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AuthGate after sign-in", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("shows a signed-out visitor the landing page, whose Log in opens the sign-in form (N-5)", async () => {
    mockServer.use(
      http.get(buildApiUrl("/v1/session"), () =>
        HttpResponse.json(
          { error: { code: "UNAUTHENTICATED", message: "Sign in to continue" } },
          { status: 401 },
        ),
      ),
    );
    renderApp();
    expect(
      await screen.findByRole("heading", { level: 1, name: /Everything your people need to know/ }),
    ).toBeInTheDocument();
    const account = screen.getByRole("banner");
    expect(within(account).getByRole("button", { name: "Log in" })).toHaveAttribute(
      "href",
      "/?mode=sign-in",
    );
    expect(screen.getAllByRole("button", { name: /Sign up your company/ })[0]).toHaveAttribute(
      "href",
      "/?mode=sign-up",
    );
    // Picking a capability shows its example.
    await userEvent.setup().click(screen.getByRole("button", { name: /Explains the why/ }));
    expect(await screen.findByText("Why are we on the ledger service?")).toBeInTheDocument();
  });

  it("returns to sign-in when the session ends while the app is open", async () => {
    let session: SessionState | null = signedIn;
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
          methods: { email: true, password: true, google: false, microsoft: false, sso: false },
        }),
      ),
      http.get(buildApiUrl("/v1/projects"), () =>
        HttpResponse.json(
          { error: { code: "UNAUTHENTICATED", message: "Sign in to continue" } },
          { status: 401 },
        ),
      ),
    );
    renderApp();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Load projects" }));
    // Signed out on another device: the next request fails, and the gate shows sign-in again.
    session = null;
    await user.click(screen.getByRole("button", { name: "Load projects" }));
    expect(await screen.findByRole("textbox", { name: "Work email" })).toBeInTheDocument();
  });

  it("shows the workspace picker when they lose access to the workspace", async () => {
    let session: SessionState = signedIn;
    mockServer.use(
      http.get(buildApiUrl("/v1/session"), () => HttpResponse.json(session)),
      http.get(buildApiUrl("/v1/projects"), () =>
        HttpResponse.json(
          { error: { code: "WORKSPACE_REQUIRED", message: "Choose a workspace to continue" } },
          { status: 403 },
        ),
      ),
    );
    renderApp();
    const user = userEvent.setup();
    const load = await screen.findByRole("button", { name: "Load projects" });
    // An admin removed them: the session no longer has that workspace.
    session = { ...signedIn, activeWorkspaceId: null, workspaces: [] };
    await user.click(load);
    expect(await screen.findByText("Create your workspace")).toBeInTheDocument();
  });

  it("opens the app once they pick one of several workspaces", async () => {
    const second = {
      ...WORKSPACE,
      id: "w2",
      name: "Acme Labs",
      slug: "acme-labs",
      role: "owner" as const,
    };
    let session: SessionState = {
      ...signedIn,
      activeWorkspaceId: null,
      workspaces: [WORKSPACE, second],
    };
    mockServer.use(
      http.get(buildApiUrl("/v1/session"), () => HttpResponse.json(session)),
      http.put(buildApiUrl("/v1/session/workspace"), async ({ request }) => {
        const { workspaceId } = (await request.json()) as { workspaceId: string };
        session = { ...session, activeWorkspaceId: workspaceId };
        return HttpResponse.json(session);
      }),
    );
    renderApp();
    const user = userEvent.setup();
    expect(await screen.findByText("Choose your workspace")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Acme Labs/ }));
    expect(await screen.findByRole("button", { name: "Load projects" })).toBeInTheDocument();
  });

  it("explains when company SSO isn't set up for the email's domain", async () => {
    window.history.replaceState(null, "", "/?mode=sign-in");
    mockServer.use(
      http.get(buildApiUrl("/v1/session"), () =>
        HttpResponse.json(
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
      http.post(buildApiUrl("/v1/auth/sign-in/sso"), () =>
        HttpResponse.json({ message: "No provider found for the issuer" }, { status: 404 }),
      ),
    );
    renderApp();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Use company single sign-on" }));
    await user.type(screen.getByRole("textbox", { name: "Work email" }), "sam@gmail.com");
    await user.click(screen.getByRole("button", { name: "Continue with company SSO" }));
    expect(
      await screen.findByText(/Company single sign-on isn't set up for gmail.com/),
    ).toBeInTheDocument();
  });
});
