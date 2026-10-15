import { screen, within } from "@testing-library/react";
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
    http.get(buildApiUrl("/v1/users/me"), () => HttpResponse.json({ id: viewerId })),
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
});
