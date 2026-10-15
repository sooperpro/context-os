import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { getPreviewPersona, setPreviewPersona } from "@/features/workspace/viewer";
import { jsonResponse, renderWithProviders } from "@/test/utils";

function renderShell() {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return Promise.resolve(
      url.endsWith("/v1/session")
        ? jsonResponse({
            authentication: "development",
            user: { id: "u1", name: "Maya Okafor", email: "maya@tessellate.io", image: null },
            signInMethod: "development",
            linkedMethods: [],
            activeWorkspaceId: "ws",
            workspaces: [
              {
                id: "ws",
                name: "Default workspace",
                slug: null,
                role: "owner",
                ssoRequired: false,
              },
            ],
          })
        : jsonResponse({
            id: "ws",
            name: "Default workspace",
            role: "owner",
            authentication: "development",
          }),
    );
  });
  return renderWithProviders(
    <ThemeProvider>
      <Routes>
        <Route element={<AppShell assistant={<p>bot panel</p>} />}>
          <Route index element={<p>page content</p>} />
        </Route>
      </Routes>
    </ThemeProvider>,
  );
}

describe("AppShell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setPreviewPersona(null);
  });

  it("gates the rail by role, and follows the development preview", async () => {
    renderShell();
    // An owner sees the admin rail: Overview and Workspace setup.
    expect((await screen.findAllByRole("link", { name: /Overview/ })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Setup/ }).length).toBeGreaterThan(0);

    setPreviewPersona("employee");
    await waitFor(() =>
      expect(screen.getAllByRole("link", { name: /^Home/ }).length).toBeGreaterThan(0),
    );
    expect(screen.queryByRole("link", { name: /Setup/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Overview/ })).not.toBeInTheDocument();
  });

  it("previews another persona and Context Bot states from View as, like the prototype", async () => {
    const user = userEvent.setup();
    renderShell();
    // An owner previews as Admin by default; their own persona is marked.
    await user.click(await screen.findByRole("button", { name: "View as Admin" }));
    let menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("group", { name: "Prototype · view as" })).toBeInTheDocument();
    expect(within(menu).getByRole("group", { name: "Prototype · flows" })).toBeInTheDocument();
    const admin = within(menu).getByRole("menuitemradio", { name: /Admin/ });
    expect(admin).toHaveAttribute("aria-checked", "true");
    expect(admin).toHaveTextContent("You");

    await user.click(within(menu).getByRole("menuitemradio", { name: /Employee/ }));
    expect(getPreviewPersona()).toBe("employee");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());

    // Choosing your own persona again ends the preview.
    await user.click(await screen.findByRole("button", { name: "View as Employee" }));
    menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitemradio", { name: /Admin/ }));
    expect(getPreviewPersona()).toBeNull();
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());

    await user.click(await screen.findByRole("button", { name: "View as Admin" }));
    menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: "Restricted" }));
    expect(await screen.findByText("bot panel")).toBeInTheDocument();
  });

  it("renders the page inside the shell with main navigation landmarks", async () => {
    renderShell();
    expect(screen.getByText("page content")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    // Rail and bottom bar are both in the DOM; CSS decides which one shows.
    expect(screen.getAllByRole("navigation", { name: "Main" })).toHaveLength(2);
    await waitFor(() =>
      expect(screen.getAllByRole("link", { name: /Knowledge/ }).length).toBeGreaterThan(0),
    );
  });

  it("opens Context Bot from the FAB", async () => {
    const user = userEvent.setup();
    renderShell();
    expect(screen.queryByText("bot panel")).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Ask Context Bot" })[0]!);
    expect(await screen.findByText("bot panel")).toBeInTheDocument();
  });

  it("toggles Context Bot with ⌘J", async () => {
    renderShell();
    fireEvent.keyDown(document, { key: "j", metaKey: true });
    expect(await screen.findByText("bot panel")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "j", metaKey: true });
    await waitFor(() => expect(screen.queryByText("bot panel")).not.toBeInTheDocument());
  });
});
