import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  AssistantContext,
  type AssistantContextValue,
} from "@/components/layout/assistant-context";
import { PeoplePage } from "@/features/people/pages/people-page";
import { PersonPage } from "@/features/people/pages/person-page";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

function renderAt(route: string, viewerId = "p-maya") {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const teamPlatform = "22222222-2222-4222-8222-222222222221";
  const teamSales = "22222222-2222-4222-8222-222222222222";
  const members = [
    {
      id: "p-maya",
      name: "Maya Okafor",
      role: "member",
      status: "active",
      managerId: "p-daniel",
      organization: {
        teamId: teamPlatform,
        jobTitle: "Product Engineer",
        roleFamily: "Eng",
        location: "London",
        timezone: "Europe/London",
        startDate: "2026-10-06",
        isNewHire: true,
      },
    },
    {
      id: "p-daniel",
      name: "Daniel Reyes",
      role: "manager",
      status: "active",
      managerId: null,
      organization: { teamId: teamPlatform, jobTitle: "Engineering Manager", roleFamily: "Eng" },
    },
    {
      id: "p-sana",
      name: "Sana Iqbal",
      role: "member",
      status: "active",
      managerId: "p-daniel",
      organization: { teamId: teamPlatform, jobTitle: "Staff Engineer", roleFamily: "Eng" },
      profile: { pronouns: "she/her", skills: ["Kafka", "Go"], avatarShape: "flower" },
    },
    {
      id: "p-leah",
      name: "Leah Park",
      role: "member",
      status: "active",
      managerId: "p-daniel",
      organization: { teamId: teamPlatform, jobTitle: "Software Engineer", roleFamily: "Eng" },
    },
    {
      id: "p-marcus",
      name: "Marcus Cole",
      role: "manager",
      status: "active",
      managerId: null,
      organization: { teamId: teamSales, jobTitle: "Sales Director", roleFamily: "Sales" },
    },
  ];
  mockServer.use(
    http.get(buildApiUrl("/v1/users"), () =>
      HttpResponse.json({ total: members.length, items: members }),
    ),
    http.get(buildApiUrl("/v1/users/me"), () =>
      HttpResponse.json({
        id: viewerId,
        name: "Viewer",
        email: null,
        role: "member",
        workspaceId: "ws",
        preferences: {},
      }),
    ),
    http.get(buildApiUrl("/v1/org/teams"), () =>
      HttpResponse.json({
        items: [
          { id: teamPlatform, name: "Platform", departmentId: "d1", parentId: null },
          { id: teamSales, name: "Sales", departmentId: "d2", parentId: null },
        ],
      }),
    ),
    http.get(buildApiUrl("/v1/people/:id"), ({ params }) => {
      const member = members.find((entry) => entry.id === params.id)!;
      return HttpResponse.json({
        id: member.id,
        name: member.name,
        role: member.role,
        organization: member.organization,
        profile:
          member.id === "p-sana"
            ? {
                pronouns: "she/her",
                location: "",
                bio: "I run the ingest gateway.",
                skills: ["Kafka", "Go"],
                avatarShape: "flower",
              }
            : undefined,
        assignments:
          member.id === "p-sana"
            ? [
                {
                  id: "a1",
                  type: "domain_owner",
                  scopeType: "section",
                  scopeId: `${projectId}:architecture`,
                },
              ]
            : [],
        // Like the API: only the person's manager sees their onboarding.
        onboarding:
          member.organization.startDate && member.managerId === viewerId
            ? { startedOn: member.organization.startDate, status: "on_track" }
            : null,
      });
    }),
  );
  const assistant: AssistantContextValue = {
    open: false,
    openAssistant: vi.fn(),
    closeAssistant: vi.fn(),
    toggleAssistant: vi.fn(),
    wide: false,
    toggleWide: vi.fn(),
    showBotDemo: vi.fn(),
    subscribeToRequests: () => () => undefined,
  };
  renderWithProviders(
    <AssistantContext value={assistant}>
      <Routes>
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/people/:personId" element={<PersonPage />} />
      </Routes>
    </AssistantContext>,
    { route },
  );
  return assistant;
}

const card = (name: string) =>
  within(screen.getByRole("list", { name: "People" })).getByRole("link", {
    name: new RegExp(name),
  });

describe("People", () => {
  it("lists people with their reporting relationship, and searches live directory fields", async () => {
    const user = userEvent.setup();
    renderAt("/people");

    expect(await screen.findByText("5 people · 2 teams")).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "People" })).toBeInTheDocument();
    expect(card("Daniel Reyes")).toHaveAttribute("href", "/people/p-daniel");
    expect(within(card("Daniel Reyes")).getByText("Your manager")).toBeInTheDocument();
    expect(within(card("Maya Okafor")).getByText("You")).toBeInTheDocument();
    expect(within(card("Maya Okafor")).getByText("New")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Search people" }), "staff engineer");
    expect(await screen.findByText("1 person matching “staff engineer”")).toBeInTheDocument();
    expect(card("Sana Iqbal")).toBeInTheDocument();

    // Skills from Settings › Profile are searchable too.
    await user.clear(screen.getByRole("searchbox", { name: "Search people" }));
    await user.type(screen.getByRole("searchbox", { name: "Search people" }), "kafka");
    expect(await screen.findByText("1 person matching “kafka”")).toBeInTheDocument();
    expect(within(card("Sana Iqbal")).getByText("Kafka")).toBeInTheDocument();
  });

  it("shows what people say about themselves: pronouns, bio and skills", async () => {
    renderAt("/people/p-sana");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Sana Iqbal" }),
    ).toBeInTheDocument();
    expect(screen.getByText("she/her")).toBeInTheDocument();
    const about = screen.getByRole("region", { name: "About" });
    expect(within(about).getByText("I run the ingest gateway.")).toBeInTheDocument();
    expect(within(about).getByText("Kafka")).toBeInTheDocument();
    expect(within(about).getByText("Go")).toBeInTheDocument();
  });

  it("points you to Settings when your own profile is empty", async () => {
    renderAt("/people/p-maya");
    const about = await screen.findByRole("region", { name: "About" });
    expect(within(about).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("filters to experts, and shows your team and all teams", async () => {
    const user = userEvent.setup();
    renderAt("/people");

    await user.click(await screen.findByRole("button", { name: "Experts" }));
    expect(await screen.findByText("1 person")).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "People" })).queryByRole("link", {
        name: /Maya Okafor/,
      }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Teams" }));
    const platform = await screen.findByRole("region", { name: "Platform team" });
    expect(within(platform).getByText("Daniel Reyes")).toBeInTheDocument();
    expect(within(platform).getByRole("link", { name: /Leah Park/ })).toHaveAttribute(
      "href",
      "/people/p-leah",
    );
    expect(screen.getByRole("article", { name: "Sales" })).toHaveTextContent("1 person");
  });

  it("shows a profile: what they own and their reporting line", async () => {
    const user = userEvent.setup();
    const assistant = renderAt("/people/p-sana");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Sana Iqbal" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Expert")).toBeInTheDocument();
    const owns = screen.getByRole("region", { name: /Owns in the Knowledge Hub/ });
    expect(within(owns).getByRole("link", { name: /Architecture knowledge/ })).toHaveAttribute(
      "href",
      "/projects/11111111-1111-4111-8111-111111111111",
    );
    const line = screen.getByRole("region", { name: "Reporting line" });
    expect(within(line).getByRole("link", { name: /Daniel Reyes/ })).toHaveAttribute(
      "href",
      "/people/p-daniel",
    );

    await user.click(screen.getByRole("button", { name: "What does Sana work on?" }));
    expect(assistant.openAssistant).toHaveBeenCalledWith("What does Sana work on?");
  });

  it("shows a manager their report's onboarding, linking to the team member page", async () => {
    renderAt("/people/p-maya", "p-daniel");

    const onboarding = await screen.findByRole("region", { name: /Onboarding/ });
    expect(within(onboarding).getByText("On track")).toBeInTheDocument();
    expect(within(onboarding).getByRole("button", { name: "Open onboarding" })).toHaveAttribute(
      "href",
      "/team/p-maya",
    );
  });

  it("shows nobody else the onboarding card", async () => {
    renderAt("/people/p-maya", "p-sana");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Maya Okafor" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Onboarding/ })).not.toBeInTheDocument();
  });
  describe("editing details", () => {
    const platform = "22222222-2222-4222-8222-222222222221";
    const sales = "22222222-2222-4222-8222-222222222222";
    const asHr = (saved: unknown[] = []) => {
      const details = {
        id: "p-sana",
        name: "Sana Iqbal",
        jobTitle: "Staff Engineer",
        departmentId: "d1",
        teamId: platform,
        manager: { id: "p-daniel", name: "Daniel Reyes", title: null },
      };
      mockServer.use(
        http.get(buildApiUrl("/v1/workspaces/current"), () =>
          HttpResponse.json({
            id: "ws",
            name: "Tessellate",
            role: "hr",
            authentication: "development",
          }),
        ),
        http.get(buildApiUrl("/v1/org/departments"), () =>
          HttpResponse.json({
            items: [
              { id: "d1", name: "Engineering" },
              { id: "d2", name: "Sales" },
            ],
          }),
        ),
        http.get(buildApiUrl("/v1/people-ops/people/:id/details"), () =>
          HttpResponse.json(details),
        ),
        http.patch(buildApiUrl("/v1/people-ops/people/:id/details"), async ({ request }) => {
          saved.push(await request.json());
          return HttpResponse.json(details);
        }),
      );
    };

    it("lets People Ops change a person's job title, team and manager", async () => {
      const saved: unknown[] = [];
      const user = userEvent.setup();
      asHr(saved);
      renderAt("/people/p-sana", "p-hr");

      await user.click(await screen.findByRole("button", { name: "Edit details" }));
      const dialog = await screen.findByRole("dialog", { name: "Edit Sana’s details" });
      const title = await within(dialog).findByRole("textbox", { name: "Job title" });
      expect(title).toHaveValue("Staff Engineer");
      const save = within(dialog).getByRole("button", { name: "Save changes" });
      expect(save).toBeDisabled();

      await user.clear(title);
      await user.type(title, "Principal Engineer");
      await waitFor(() =>
        expect(within(dialog).getByRole("combobox", { name: "Team" })).toBeEnabled(),
      );
      // Moving department drops the old team; the team list then shows that department's teams.
      await user.click(within(dialog).getByRole("combobox", { name: "Department" }));
      await user.click(await screen.findByRole("option", { name: "Sales" }));
      expect(within(dialog).getByRole("combobox", { name: "Team" })).toHaveTextContent("Not set");
      await user.click(within(dialog).getByRole("combobox", { name: "Team" }));
      await user.click(await screen.findByRole("option", { name: "Sales" }));
      await user.click(within(dialog).getByRole("combobox", { name: "Reports to" }));
      // Not the person themselves.
      expect(screen.queryByRole("option", { name: "Sana Iqbal" })).not.toBeInTheDocument();
      await user.click(await screen.findByRole("option", { name: "Marcus Cole" }));
      expect(save).toBeEnabled();
      await user.click(save);

      // Only what changed is sent.
      await waitFor(() =>
        expect(saved).toEqual([
          {
            jobTitle: "Principal Engineer",
            departmentId: "d2",
            teamId: sales,
            managerId: "p-marcus",
          },
        ]),
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("gives owners HR's Edit details and a link to read the person's conversations", async () => {
      asHr();
      mockServer.use(
        http.get(buildApiUrl("/v1/workspaces/current"), () =>
          HttpResponse.json({
            id: "ws",
            name: "Tessellate",
            role: "owner",
            authentication: "development",
          }),
        ),
        // Sana isn't onboarding.
        http.get(buildApiUrl("/v1/people-ops/people/:id/onboarding"), () =>
          HttpResponse.json(
            { error: { code: "NOT_FOUND", message: "No onboarding" } },
            { status: 404 },
          ),
        ),
      );
      renderAt("/people/p-sana", "p-owner");

      expect(await screen.findByRole("button", { name: "Edit details" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Read conversations" }).closest("a"),
      ).toHaveAttribute("href", "/conversations?person=p-sana");
    });

    it("shows everyone who is not People Ops no Edit details button", async () => {
      renderAt("/people/p-sana", "p-hr");
      expect(
        await screen.findByRole("heading", { level: 1, name: "Sana Iqbal" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Edit details" })).not.toBeInTheDocument();
    });

    it("does not offer People Ops their own profile to edit", async () => {
      asHr();
      renderAt("/people/p-sana", "p-sana");
      expect(
        await screen.findByRole("heading", { level: 1, name: "Sana Iqbal" }),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Message" })).toBeInTheDocument(),
      );
      expect(screen.queryByRole("button", { name: "Edit details" })).not.toBeInTheDocument();
    });
  });
});
