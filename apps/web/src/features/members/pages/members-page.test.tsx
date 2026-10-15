import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { MembersPage } from "@/features/members/pages/members-page";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const DEPT = "33333333-3333-4333-8333-333333333333";
const TEAM = "44444444-4444-4444-8444-444444444444";

/** The live endpoints the page reads, as the API serves them today (no email, team or activity yet). */
function liveApi(role = "owner") {
  const writes: Array<{ url: string; method: string; body: unknown }> = [];
  const record = async (request: Request) => {
    writes.push({ url: request.url, method: request.method, body: await request.json() });
  };
  let requests = [
    {
      id: "rr-sana",
      person: { id: "u4", name: "Sana Iqbal", title: "Staff Engineer" },
      role: "admin",
      reason: "To manage the GitHub and Jira connectors for Platform.",
      requestedAt: "2026-10-12T11:00:00.000Z",
    },
    {
      id: "rr-priya",
      person: { id: "u5", name: "Priya Nair", title: null },
      role: "manager",
      reason: "Leading the new Billing team from November 2.",
      requestedAt: "2026-10-13T15:00:00.000Z",
    },
  ];
  mockServer.use(
    http.get(buildApiUrl("/v1/admin/members/overview"), () =>
      HttpResponse.json({
        seats: { used: 3, total: 450 },
        directorySync: {
          provider: "Clerk",
          enabled: true,
          lastRunAt: "2026-10-14T08:00:00.000Z",
        },
      }),
    ),
    http.get(buildApiUrl("/v1/admin/role-requests"), () => HttpResponse.json({ items: requests })),
    http.post(buildApiUrl("/v1/admin/role-requests/:id/decision"), async ({ request, params }) => {
      const body = (await request.json()) as { decision: string };
      writes.push({ url: request.url, method: "POST", body });
      requests = requests.filter((entry) => entry.id !== params.id);
      return HttpResponse.json({ id: params.id, decision: body.decision });
    }),
    http.get(buildApiUrl("/v1/workspaces/current"), () =>
      HttpResponse.json({ id: "ws", name: "Tessellate", role, authentication: "development" }),
    ),
    http.get(buildApiUrl("/v1/users/me"), () =>
      HttpResponse.json({
        id: "u2",
        name: "Tom Becker",
        email: null,
        role,
        workspaceId: "ws",
        preferences: {},
      }),
    ),
    http.get(buildApiUrl("/v1/users"), () =>
      HttpResponse.json({
        items: [
          {
            id: "u1",
            name: "Maya Okafor",
            role: "member",
            status: "active",
            email: "maya@tessellate.io",
            team: "Platform",
          },
          { id: "u2", name: "Tom Becker", role: "owner", status: "active" },
          { id: "u3", name: "Daniel Reyes", role: "manager", status: "active" },
        ],
      }),
    ),
    http.patch(buildApiUrl("/v1/users/:id"), async ({ request, params }) => {
      await record(request.clone());
      const body = (await request.json()) as { role?: string };
      return HttpResponse.json({
        userId: params.id,
        role: body.role ?? "member",
        status: "active",
      });
    }),
    http.get(buildApiUrl("/v1/org/departments"), () =>
      HttpResponse.json({ items: [{ id: DEPT, name: "Engineering" }] }),
    ),
    http.post(buildApiUrl("/v1/org/departments"), async ({ request }) => {
      await record(request);
      return HttpResponse.json({ id: DEPT, name: "Platform" }, { status: 201 });
    }),
    http.get(buildApiUrl("/v1/org/teams"), () =>
      HttpResponse.json({
        items: [{ id: TEAM, departmentId: DEPT, parentId: null, name: "Billing" }],
      }),
    ),
  );
  return writes;
}

async function membersTable() {
  return within(await screen.findByRole("region", { name: "Members" })).findByRole("table");
}

describe("MembersPage", () => {
  it("shows seats, role counts and the members table with roles for owners", async () => {
    liveApi("owner");
    renderWithProviders(<MembersPage />);

    expect(await screen.findByText("3 of 450 seats")).toBeInTheDocument();
    const table = await membersTable();
    expect(within(table).getByText("maya@tessellate.io")).toBeInTheDocument();
    expect(within(table).getByText("Platform")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Members by role" })).toHaveTextContent(
      "Members1Managers1Owners1",
    );
    // Nobody changes their own role.
    expect(
      await within(table).findByRole("combobox", { name: "Role for Tom Becker" }),
    ).toBeDisabled();
    expect(within(table).getByRole("combobox", { name: "Role for Maya Okafor" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Invite people" })).toBeInTheDocument();
    expect(await screen.findByText(/Synced from Clerk at/)).toBeInTheDocument();
  });

  it("asks before making someone an admin, then changes the role", async () => {
    const writes = liveApi("owner");
    const user = userEvent.setup();
    renderWithProviders(<MembersPage />);

    await user.click(await screen.findByRole("combobox", { name: "Role for Maya Okafor" }));
    await user.click(await screen.findByRole("option", { name: "Admin" }));
    const dialog = await screen.findByRole("dialog", { name: "Give Maya Okafor the Admin role?" });
    await user.click(within(dialog).getByRole("button", { name: "Make Admin" }));
    await waitFor(() =>
      expect(writes.find((write) => write.method === "PATCH")?.body).toEqual({ role: "admin" }),
    );
  });

  it("filters members by role and name", async () => {
    liveApi("owner");
    const user = userEvent.setup();
    renderWithProviders(<MembersPage />);

    const table = await membersTable();
    await user.click(
      within(screen.getByRole("group", { name: "Filter by role" })).getByRole("button", {
        name: "Manager",
      }),
    );
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).getByText("Daniel Reyes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "All" }));
    await user.type(screen.getByRole("searchbox", { name: "Search members" }), "platform");
    await waitFor(async () =>
      expect(within(await membersTable()).getAllByRole("row")).toHaveLength(2),
    );
    expect(await screen.findByText("Showing 1 of 3 members.")).toBeInTheDocument();
  });

  it("approves a role request after confirming an admin", async () => {
    const writes = liveApi("owner");
    const user = userEvent.setup();
    renderWithProviders(<MembersPage />);

    const requests = await screen.findByRole("region", { name: /Role requests/ });
    expect(
      await within(requests).findByText("Sana Iqbal wants the Admin role"),
    ).toBeInTheDocument();
    await user.click(within(requests).getAllByRole("button", { name: "Approve" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Make Sana Iqbal an Admin?" });
    await user.click(within(dialog).getByRole("button", { name: "Make Admin" }));
    await waitFor(() =>
      expect(screen.queryByText("Sana Iqbal wants the Admin role")).not.toBeInTheDocument(),
    );

    await user.click(
      within(screen.getByRole("region", { name: /Role requests/ })).getByRole("button", {
        name: "Decline",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: /Role requests/ })).not.toBeInTheDocument(),
    );
    expect(
      writes.filter((write) => write.url.includes("/role-requests/")).map((write) => write.body),
    ).toEqual([{ decision: "approve" }, { decision: "decline" }]);
  });

  it("hides management from members", async () => {
    liveApi("member");
    renderWithProviders(<MembersPage />);
    expect(await screen.findByText("Maya Okafor")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Invite people" })).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("combobox", { name: "Role for Maya Okafor" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Role requests/ })).not.toBeInTheDocument();
  });

  it("shows departments with their teams and creates a department", async () => {
    const writes = liveApi("owner");
    const user = userEvent.setup();
    renderWithProviders(<MembersPage />);
    await user.click(await screen.findByRole("tab", { name: "Departments and teams" }));
    expect(await screen.findByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New department" }));
    await user.type(await screen.findByLabelText("Department name"), "Platform");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(
        writes.find((write) => write.method === "POST" && write.url.includes("/org/departments"))
          ?.body,
      ).toEqual({ name: "Platform" }),
    );
  });
});
