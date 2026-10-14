import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MembersPage } from "@/features/members/pages/members-page";
import { jsonResponse, renderWithProviders } from "@/test/utils";

const DEPT = "33333333-3333-4333-8333-333333333333";
const TEAM = "44444444-4444-4444-8444-444444444444";

function mockApi(role = "owner") {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    if (url.endsWith("/v1/workspaces/current"))
      return Promise.resolve(jsonResponse({ id: "ws", name: "Tessellate", role, authentication: "development" }));
    if (url.includes("/v1/users?"))
      return Promise.resolve(
        jsonResponse({
          items: [
            { id: "u1", name: "Maya Okafor", role: "member", status: "active" },
            { id: "u2", name: "Tom Becker", role: "owner", status: "active" },
          ],
        }),
      );
    if (url.includes("/v1/org/departments") && method === "POST")
      return Promise.resolve(jsonResponse({ id: DEPT, name: "Platform" }, { status: 201 }));
    if (url.includes("/v1/org/departments"))
      return Promise.resolve(jsonResponse({ items: [{ id: DEPT, name: "Engineering" }] }));
    if (url.includes("/v1/org/teams"))
      return Promise.resolve(jsonResponse({ items: [{ id: TEAM, departmentId: DEPT, parentId: null, name: "Billing" }] }));
    return Promise.resolve(jsonResponse({ error: { code: "NOT_FOUND", message: url } }, { status: 404 }));
  });
  return calls;
}

describe("MembersPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists members with their role and status, and offers management to owners", async () => {
    mockApi("owner");
    renderWithProviders(<MembersPage />);
    expect(await screen.findByText("Maya Okafor")).toBeInTheDocument();
    expect(screen.getAllByText("Active")).toHaveLength(2);
    expect(screen.getByText("Member")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Manage Maya Okafor" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Invite" })).toBeInTheDocument();
  });

  it("hides management from members", async () => {
    mockApi("member");
    renderWithProviders(<MembersPage />);
    expect(await screen.findByText("Maya Okafor")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Invite" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Manage Maya Okafor" })).not.toBeInTheDocument();
  });

  it("shows departments with their teams and creates a department", async () => {
    const calls = mockApi("owner");
    const user = userEvent.setup();
    renderWithProviders(<MembersPage />);
    await user.click(await screen.findByRole("tab", { name: "Departments and teams" }));
    expect(await screen.findByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New department" }));
    await user.type(await screen.findByLabelText("Department name"), "Platform");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === "POST" && call.url.includes("/org/departments"))?.body).toEqual({ name: "Platform" }),
    );
  });
});
