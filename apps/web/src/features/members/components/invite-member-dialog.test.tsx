import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { InviteMemberDialog } from "@/features/members/components/invite-member-dialog";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const ENG = "33333333-3333-4333-8333-333333333333";
const OPS = "55555555-5555-4555-8555-555555555555";
const BILLING = "44444444-4444-4444-8444-444444444444";
const KESTREL = "66666666-6666-4666-8666-666666666666";

function inviteApi() {
  const posted: unknown[] = [];
  mockServer.use(
    http.get(buildApiUrl("/v1/org/departments"), () =>
      HttpResponse.json({
        items: [
          { id: ENG, name: "Engineering" },
          { id: OPS, name: "People Ops" },
        ],
      }),
    ),
    http.get(buildApiUrl("/v1/org/teams"), () =>
      HttpResponse.json({
        items: [{ id: BILLING, departmentId: ENG, parentId: null, name: "Billing" }],
      }),
    ),
    http.get(buildApiUrl("/v1/users"), () =>
      HttpResponse.json({
        items: [
          { id: "u3", name: "Daniel Reyes", role: "manager", status: "active" },
          { id: "u9", name: "Gail Guest", role: "guest", status: "active" },
        ],
      }),
    ),
    http.get(buildApiUrl("/v1/projects"), () =>
      HttpResponse.json({
        items: [KESTREL].map((id) => ({
          id,
          workspaceId: ENG,
          name: "Project Kestrel",
          slug: "kestrel",
          description: null,
          createdAt: "2026-10-01T09:00:00.000Z",
          updatedAt: "2026-10-01T09:00:00.000Z",
          stats: {
            sources: 1,
            readySources: 1,
            contextItems: 4,
            questions: 0,
            lastProcessedAt: null,
          },
        })),
      }),
    ),
    http.post(buildApiUrl("/v1/users/invite"), async ({ request }) => {
      posted.push(await request.json());
      return HttpResponse.json(
        { id: "inv1", status: "pending", requestedRole: "hr", delivery: "local" },
        { status: 201 },
      );
    }),
  );
  return posted;
}

describe("InviteMemberDialog", () => {
  it("offers every invitable role in a dropdown, HR included, and says what each can do", async () => {
    inviteApi();
    const user = userEvent.setup();
    renderWithProviders(<InviteMemberDialog open onOpenChange={vi.fn()} />);

    const role = screen.getByRole("combobox", { name: "Role" });
    expect(role).toHaveTextContent("Member");
    expect(screen.getByText(/Reads the hub, asks questions/)).toBeInTheDocument();
    await user.click(role);
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Member",
      "Manager",
      "HR",
      "Admin",
      "Guest",
    ]);
    await user.click(screen.getByRole("option", { name: "HR" }));
    expect(role).toHaveTextContent("HR");
    expect(screen.getByText(/Also runs onboarding templates/)).toBeInTheDocument();
  });

  it("sends the role and details, leaving out what was not set", async () => {
    const posted = inviteApi();
    const user = userEvent.setup();
    renderWithProviders(<InviteMemberDialog open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Work email"), "noor@tessellate.io");
    await user.type(screen.getByLabelText("Full name (optional)"), "Noor Hassan");
    await user.type(screen.getByLabelText("Job title (optional)"), "People Partner");
    await user.click(screen.getByRole("combobox", { name: "Role" }));
    await user.click(await screen.findByRole("option", { name: "HR" }));
    // Picking a team fills in its department.
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Team" })).toBeEnabled());
    await user.click(screen.getByRole("combobox", { name: "Team" }));
    await user.click(await screen.findByRole("option", { name: "Billing" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Reports to" })).toBeEnabled());
    await user.click(screen.getByRole("combobox", { name: "Reports to" }));
    // Guests are not offered as managers.
    expect(screen.queryByRole("option", { name: "Gail Guest" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "Daniel Reyes" }));
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    await waitFor(() =>
      expect(posted).toEqual([
        {
          email: "noor@tessellate.io",
          role: "hr",
          name: "Noor Hassan",
          jobTitle: "People Partner",
          departmentId: ENG,
          teamId: BILLING,
          managerId: "u3",
          isNewHire: false,
        },
      ]),
    );
  });

  it("asks which projects a guest can see, and sends them", async () => {
    const posted = inviteApi();
    const user = userEvent.setup();
    renderWithProviders(<InviteMemberDialog open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Work email"), "ana@partner.test");
    expect(screen.queryByText("Projects they can see")).not.toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Role" }));
    await user.click(await screen.findByRole("option", { name: "Guest" }));
    await user.click(await screen.findByRole("checkbox", { name: "Project Kestrel" }));
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() =>
      expect(posted).toEqual([
        expect.objectContaining({
          email: "ana@partner.test",
          role: "guest",
          projectIds: [KESTREL],
        }),
      ]),
    );
  });

  it("asks for a start date when inviting a new hire", async () => {
    const posted = inviteApi();
    const user = userEvent.setup();
    renderWithProviders(<InviteMemberDialog open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Work email"), "sam@tessellate.io");
    await user.click(screen.getByRole("switch", { name: /New hire/ }));
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText("Add a start date for a new hire.")).toBeInTheDocument();
    expect(posted).toEqual([]);

    // Guests are never new hires: the switch goes away and resets.
    await user.click(screen.getByRole("combobox", { name: "Role" }));
    await user.click(await screen.findByRole("option", { name: "Guest" }));
    expect(screen.queryByRole("switch", { name: /New hire/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() =>
      expect(posted).toEqual([{ email: "sam@tessellate.io", role: "guest", isNewHire: false }]),
    );
  });
});
