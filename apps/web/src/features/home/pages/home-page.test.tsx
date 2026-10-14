import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  AssistantContext,
  type AssistantContextValue,
} from "@/components/layout/assistant-context";
import { HomePage } from "@/features/home/pages/home-page";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const api = (path: string) => buildApiUrl(path);

/** The live endpoints Home reads; the rest come from the mock layer. */
function live({ role = "member", connectors = [] as object[], audit = [] as object[] } = {}) {
  mockServer.use(
    http.get(api("/v1/workspaces/current"), () =>
      HttpResponse.json({ id: "w1", name: "Tessellate", role, authentication: "development" }),
    ),
    http.get(api("/v1/users/me"), () =>
      HttpResponse.json({
        id: "u1",
        name: "Maya Okafor",
        email: null,
        role,
        workspaceId: "w1",
        preferences: {},
      }),
    ),
    http.get(api("/v1/connectors"), () => HttpResponse.json({ items: connectors })),
    http.get(api("/v1/users"), () =>
      HttpResponse.json({
        items: [
          { id: "u1", name: "Maya Okafor", role: "member", status: "active" },
          { id: "u2", name: "Daniel Reyes", role: "manager", status: "active" },
          { id: "u3", name: "Tom Becker", role: "owner", status: "active" },
        ],
      }),
    ),
    http.get(api("/v1/audit"), () => HttpResponse.json({ items: audit })),
  );
}

function renderHome(route = "/") {
  const assistant: AssistantContextValue = {
    open: false,
    openAssistant: vi.fn(),
    closeAssistant: vi.fn(),
    toggleAssistant: vi.fn(),
    subscribeToQueries: () => () => undefined,
  };
  renderWithProviders(
    <AssistantContext value={assistant}>
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </AssistantContext>,
    { route },
  );
  return assistant;
}

describe("HomePage", () => {
  it("shows a member the employee Home, with preview data marked", async () => {
    live({ role: "member" });
    const assistant = renderHome();

    expect(await screen.findByRole("heading", { level: 1, name: /, Maya$/ })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "How Tessellate makes money" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: /Onboarding 18% complete, day 9 of 90/ }),
    ).toBeInTheDocument();
    expect((await screen.findAllByText("Preview data")).length).toBeGreaterThan(3);

    const week = screen.getByRole("region", { name: "This week" });
    const user = userEvent.setup();
    await user.click(await within(week).findByRole("button", { name: /Overdue/ }));
    expect(within(week).getByText("Nothing overdue")).toBeInTheDocument();
    await user.click(within(week).getByRole("button", { name: /Done/ }));
    expect(within(week).getByText("Set up your local development environment")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ask about this lesson" }));
    expect(assistant.openAssistant).toHaveBeenCalledWith("Why are we moving billing to Kafka?");

    await user.type(
      screen.getByRole("textbox", { name: "Ask Context Bot" }),
      "Who owns billing?{Enter}",
    );
    expect(assistant.openAssistant).toHaveBeenCalledWith("Who owns billing?");
  });

  it("shows a manager their team's Home", async () => {
    live({ role: "manager" });
    renderHome();

    const attention = await screen.findByRole("region", { name: "Needs your attention" });
    expect(
      await within(attention).findByText("Waiting on data warehouse access"),
    ).toBeInTheDocument();
    const roster = screen.getByRole("region", { name: "Team onboarding" });
    expect(await within(roster).findByText("Leah Park")).toBeInTheDocument();
    expect(within(roster).getByText("At risk")).toBeInTheDocument();
    expect(screen.getByText(/5 people on the Platform team are onboarding/)).toBeInTheDocument();
  });

  it("shows admins the workspace overview from live connectors, members and audit log", async () => {
    live({
      role: "owner",
      connectors: [
        {
          id: "c1",
          provider: "google-drive",
          status: "needs_reauth",
          createdAt: "2026-10-01T00:00:00.000Z",
        },
      ],
      audit: [
        {
          id: "a1",
          projectId: null,
          actorId: "u3",
          actorName: "Tom Becker",
          action: "user.invite",
          targetType: "user",
          targetId: "u9",
          metadata: null,
          createdAt: "2026-10-01T09:00:00.000Z",
        },
        {
          id: "a2",
          projectId: null,
          actorId: "u3",
          actorName: "Tom Becker",
          action: "connector.connect",
          targetType: "connector",
          targetId: "c1",
          metadata: null,
          createdAt: "2026-10-12T09:00:00.000Z",
        },
      ],
    });
    renderHome();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Workspace overview" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Google Drive needs to be reconnected",
    );

    const audit = screen.getByRole("region", { name: "Audit log" });
    const rows = await within(audit).findAllByText(/Connected a knowledge source|Invited someone/);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Connected a knowledge source",
      "Invited someone",
    ]);
    expect(within(audit).queryByText("Preview data")).not.toBeInTheDocument();

    const members = screen.getByRole("region", { name: "Members & roles" });
    expect(await within(members).findByText("of 3 members active")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Sync activity" })).getByText("Preview data"),
    ).toBeInTheDocument();
  });

  it("previews another role's Home with ?view= in development", async () => {
    live({ role: "member" });
    renderHome("/?view=people_ops");

    expect(
      await screen.findByRole("region", { name: "Probation reviews · next 30 days" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Sofia Alvarez")).toBeInTheDocument();
    expect(await screen.findByText("Active onboardings")).toBeInTheDocument();
  });
});
