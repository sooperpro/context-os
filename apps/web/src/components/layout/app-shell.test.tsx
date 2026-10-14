import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { jsonResponse, renderWithProviders } from "@/test/utils";

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: { id: "u1", fullName: "Maya Okafor", firstName: "Maya", imageUrl: "", primaryEmailAddress: { emailAddress: "maya@tessellate.io" } } }),
  useClerk: () => ({ organization: null, openUserProfile: vi.fn(), signOut: vi.fn() }),
  useOrganizationList: () => ({ isLoaded: true, userMemberships: { data: [] }, setActive: vi.fn() }),
}));

function renderShell() {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    jsonResponse({ id: "ws", name: "Default workspace", role: "owner", authentication: "development" }),
  );
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
  afterEach(() => vi.restoreAllMocks());

  it("renders the page inside the shell with main navigation landmarks", async () => {
    renderShell();
    expect(screen.getByText("page content")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    // Rail and bottom bar are both in the DOM; CSS decides which one shows.
    expect(screen.getAllByRole("navigation", { name: "Main" })).toHaveLength(2);
    await waitFor(() => expect(screen.getAllByRole("link", { name: /Knowledge/ }).length).toBeGreaterThan(0));
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
