import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AssistantContext,
  type AssistantContextValue,
} from "@/components/layout/assistant-context";
import { HomePage } from "@/features/home/pages/home-page";
import { getPreviewPersona, setPreviewPersona } from "@/features/workspace/viewer";
import { buildApiUrl } from "@/lib/api-client";
import { employeeHandlers } from "@/test/employee-mocks";
import { mockServer, setupMockApi } from "@/test/msw";
import { learnerHandlers } from "@/test/learning-mocks";
import { managerHandlers } from "@/test/manager-mocks";
import { peopleOpsHandlers } from "@/test/people-ops-mocks";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const api = (path: string) => buildApiUrl(path);

/** The live endpoints Home reads; the rest come from the mock layer. */
function live({
  role = "member",
  connectors = [] as object[],
  audit = [] as object[],
  sources = [] as number[],
} = {}) {
  mockServer.use(
    // HR and manager Home's endpoints are live too, as are some of the employee's; these fixtures
    // stand in for the API.
    ...peopleOpsHandlers(),
    ...managerHandlers(),
    ...employeeHandlers(),
    ...learnerHandlers(),
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
    // The admin Overview reads the workspace's connector catalog.
    http.get(api("/v1/admin/connectors"), () =>
      HttpResponse.json({
        items: (connectors as Array<{ status?: string }>).map((connection) => ({
          id: "google-drive",
          name: "Google Drive",
          category: "files",
          description: "Docs in Drive.",
          unit: "Folders",
          scopeOptions: [],
          popular: true,
          needsAdminOf: null,
          state: connection.status === "needs_reauth" ? "error" : "healthy",
          detail: "12 files indexed",
          lastSyncAt: null,
          progress: null,
          error:
            connection.status === "needs_reauth"
              ? "Google Drive access expired. Sign in again from Setup to resume syncing."
              : null,
        })),
      }),
    ),
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
    // One project per entry, with that many sources.
    http.get(api("/v1/projects"), () =>
      HttpResponse.json({
        items: sources.map((count, index) => ({
          id: `0000000${index}-0000-4000-8000-000000000000`,
          workspaceId: "99999999-9999-4999-8999-999999999999",
          slug: null,
          name: `Project ${index + 1}`,
          description: null,
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-01T00:00:00.000Z",
          stats: {
            sources: count,
            readySources: count,
            contextItems: 0,
            questions: 0,
            lastProcessedAt: null,
          },
        })),
      }),
    ),
    // The admin overview cards are live too.
    http.get(api("/v1/admin/security"), () =>
      HttpResponse.json({
        items: [
          { id: "sso", value: "Company SSO · tessellate.io · required", state: "ok" },
          { id: "scim", value: "Not configured", state: "off" },
        ],
      }),
    ),
    http.get(api("/v1/admin/sync-runs"), () =>
      HttpResponse.json({
        items: [
          {
            id: "j1",
            connector: "Google Drive · Specs",
            startedAt: "2026-10-14T09:00:00.000Z",
            ok: true,
            detail: "12 files checked, 3 imported",
            durationMs: 8_000,
          },
        ],
      }),
    ),
    http.get(api("/v1/admin/ai"), () =>
      HttpResponse.json({ helpfulRate: 0.5, ratings: 4, periodDays: 30, settings: [] }),
    ),
  );
}

function renderHome(route = "/") {
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
        <Route path="/" element={<HomePage />} />
        <Route path="/welcome" element={<h1>Welcome page</h1>} />
      </Routes>
    </AssistantContext>,
    { route },
  );
  return assistant;
}

describe("HomePage", () => {
  afterEach(() => setPreviewPersona(null));

  it("takes a new hire to the welcome on their first visit in a session", async () => {
    sessionStorage.removeItem("contextos.welcome-shown");
    live({ role: "member" });
    renderHome();
    expect(await screen.findByRole("heading", { name: "Welcome page" })).toBeInTheDocument();
    expect(sessionStorage.getItem("contextos.welcome-shown")).toBe("1");
  });
  it("opens Home when the workspace has no deletion scheduled (settings.deletion is null)", async () => {
    sessionStorage.setItem("contextos.welcome-shown", "1");
    live({ role: "member" });
    mockServer.use(
      http.get(api("/v1/workspaces/current"), () =>
        HttpResponse.json({
          id: "w1",
          name: "Tessellate",
          role: "member",
          authentication: "accounts",
          slug: null,
          settings: { includeIndirectReports: false, deletion: null },
        }),
      ),
    );
    renderHome();
    expect(await screen.findByRole("heading", { level: 1, name: /, Maya$/ })).toBeInTheDocument();
  });

  it("says when the workspace can't be loaded, instead of loading forever", async () => {
    live({ role: "member" });
    mockServer.use(
      http.get(api("/v1/workspaces/current"), () =>
        HttpResponse.json(
          { error: { code: "INTERNAL", message: "Something went wrong" } },
          { status: 500 },
        ),
      ),
    );
    renderHome();
    expect(await screen.findByText("Your workspace couldn't be loaded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("shows a member the employee Home from live data", async () => {
    // The welcome was already shown this session, so Home stays.
    sessionStorage.setItem("contextos.welcome-shown", "1");
    live({ role: "member" });
    const assistant = renderHome();

    expect(await screen.findByRole("heading", { level: 1, name: /, Maya$/ })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "How Tessellate makes money" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: /Onboarding 18% complete, day 9 of 90/ }),
    ).toBeInTheDocument();
    // Everything on it is served by the API now: nothing is marked as preview data.
    expect(screen.queryByText("Preview data")).not.toBeInTheDocument();

    const week = screen.getByRole("region", { name: "This week" });
    const user = userEvent.setup();
    await user.click(await within(week).findByRole("button", { name: /Overdue/ }));
    expect(within(week).getByText("Nothing overdue")).toBeInTheDocument();
    await user.click(within(week).getByRole("button", { name: /Done/ }));
    expect(within(week).getByText("Set up your local development environment")).toBeInTheDocument();

    // Check-ins: the next dates, and what the manager chose to share.
    const checkins = await screen.findByRole("region", { name: "Check-ins" });
    expect(
      within(within(checkins).getByRole("list", { name: "Coming up" })).getByText("30-day review"),
    ).toBeInTheDocument();
    expect(await within(checkins).findByText(/Strong first week/)).toBeInTheDocument();
    expect(within(checkins).getByText("Shared by Daniel Reyes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ask about this lesson" }));
    expect(assistant.openAssistant).toHaveBeenCalledWith("Why are we moving billing to Kafka?");

    await user.type(
      screen.getByRole("textbox", { name: "Ask Context Bot" }),
      "Who owns billing?{Enter}",
    );
    expect(assistant.openAssistant).toHaveBeenCalledWith("Who owns billing?");
  });

  it("tells a new hire whose roadmap isn't assigned yet that it's on its way", async () => {
    sessionStorage.setItem("contextos.welcome-shown", "1");
    live({ role: "member" });
    mockServer.use(
      http.get(api("/v1/me/onboarding"), () =>
        HttpResponse.json(
          { error: { code: "NOT_FOUND", message: "Onboarding roadmap was not found" } },
          { status: 404 },
        ),
      ),
      http.get(api("/v1/users/me"), () =>
        HttpResponse.json({
          id: "u1",
          name: "Maya Okafor",
          email: null,
          role: "member",
          workspaceId: "w1",
          preferences: {},
          organization: { isNewHire: true, startDate: "2026-10-16" },
        }),
      ),
    );
    renderHome();
    const message = await screen.findByText(/Your onboarding roadmap isn't ready yet/);
    const card = message.closest<HTMLElement>("[role=region]")!;
    expect(within(card).getByRole("heading", { name: "Your onboarding" })).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: "Open My learning" }).closest("a"),
    ).toHaveAttribute("href", "/learning");
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

    // Escalating a blocked new hire sends it to whoever can unblock them.
    let escalated: string | null = null;
    mockServer.use(
      http.post(api("/v1/team/members/:id/escalations"), ({ params }) => {
        escalated = String(params.id);
        return HttpResponse.json({ id: "esc-1", to: "admins" }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    await user.click(within(attention).getByRole("button", { name: "Escalate request" }));
    await waitFor(() => expect(escalated).toBe("p-chloe"));

    // A row's menu assigns learning to that person.
    await user.click(within(roster).getByRole("button", { name: "More actions for Leah Park" }));
    await user.click(await screen.findByRole("menuitem", { name: "Assign learning" }));
    const dialog = await screen.findByRole("dialog", { name: "Assign a learning task" });
    expect(await within(dialog).findByRole("combobox", { name: "Person" })).toHaveTextContent(
      "Leah Park",
    );
  });

  it("lets a manager open a conflicting page and request an update to a stale one", async () => {
    live({ role: "manager" });
    let flagged: unknown = null;
    const gap = (id: string, reason: string, targetId: string) => ({
      id,
      question: `Is “${targetId}” still current?`,
      reason,
      detail: reason === "stale" ? "Flagged as out of date" : "Sources disagree",
      askedCount: 1,
      section: null,
      related: [],
      suggestedKind: "edit",
      target: { projectId: "proj-1", targetType: "context_item", targetId },
    });
    mockServer.use(
      http.get(api("/v1/team/knowledge-gaps"), () =>
        HttpResponse.json({
          items: [gap("g1", "conflict", "item-refunds"), gap("g2", "stale", "item-billing")],
        }),
      ),
      http.post(api("/v1/flags"), async ({ request }) => {
        flagged = await request.json();
        return HttpResponse.json({ id: "flag-1", status: "open", merged: true });
      }),
    );
    renderHome();

    const gaps = await screen.findByRole("region", { name: "Knowledge gaps on your team" });
    expect(await within(gaps).findByRole("button", { name: "Review sources" })).toHaveAttribute(
      "href",
      "/projects/proj-1/items/item-refunds",
    );
    await userEvent.setup().click(within(gaps).getByRole("button", { name: "Request update" }));
    await waitFor(() =>
      expect(flagged).toMatchObject({
        projectId: "proj-1",
        targetType: "context_item",
        targetId: "item-billing",
        kind: "stale",
      }),
    );
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
    expect(await screen.findByRole("alert")).toHaveTextContent("Google Drive needs attention");
    expect(
      await screen.findByText("3 members · 0 knowledge sources · 1 connector"),
    ).toBeInTheDocument();

    const audit = screen.getByRole("region", { name: "Audit log" });
    const rows = await within(audit).findAllByText(/Connected a knowledge source|Invited someone/);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Connected a knowledge source",
      "Invited someone",
    ]);
    expect(within(audit).queryByText("Preview data")).not.toBeInTheDocument();

    const members = screen.getByRole("region", { name: "Members & roles" });
    expect(await within(members).findByText("of 3 members active")).toBeInTheDocument();
    const sync = screen.getByRole("region", { name: "Sync activity" });
    expect(await within(sync).findByText("Google Drive · Specs")).toBeInTheDocument();
    expect(within(sync).queryByText("Preview data")).not.toBeInTheDocument();
    expect(
      await within(screen.getByRole("region", { name: "Access & security" })).findByText(
        "Company SSO · tessellate.io · required",
      ),
    ).toBeInTheDocument();
  });

  it("counts uploaded sources on the overview, apart from connectors", async () => {
    live({ role: "owner", sources: [20, 7] });
    renderHome();
    expect(
      await screen.findByText("3 members · 27 knowledge sources · no connectors yet"),
    ).toBeInTheDocument();
  });

  it("leads an owner back to setup until every step is done or skipped (N-7)", async () => {
    live({ role: "owner" });
    mockServer.use(
      http.get(api("/v1/workspaces/current/setup"), () =>
        HttpResponse.json({
          id: "setup-1",
          version: 3,
          status: "in_progress",
          data: { steps: { company_profile: "completed", connect_source: "skipped" } },
          evidence: { completed: {}, sync: { sources: 0, ready: 0, pending: 0, failed: 0 } },
        }),
      ),
    );
    renderHome();

    const banner = await screen.findByText("Finish setting up your company");
    const box = banner.closest<HTMLElement>("[data-slot=banner]")!;
    expect(box).toHaveTextContent("1 of 8 steps done. Next: Departments and teams.");
    expect(within(box).getByRole("button", { name: "Resume setup" })).toHaveAttribute(
      "href",
      "/setup",
    );
  });

  it("shows an owner the employee Home while previewing as Employee", async () => {
    live({ role: "owner" });
    setPreviewPersona("employee");
    renderHome();

    expect(
      await screen.findByRole("heading", { name: "How Tessellate makes money" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: "Workspace overview" }),
    ).not.toBeInTheDocument();
  });

  it("starts a preview from a ?view= link in development", async () => {
    live({ role: "member" });
    renderHome("/?view=people_ops");
    await waitFor(() => expect(getPreviewPersona()).toBe("people_ops"));

    expect(
      await screen.findByRole("region", { name: "Probation reviews · next 30 days" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Sofia Alvarez")).toBeInTheDocument();
    expect(await screen.findByText("Active onboardings")).toBeInTheDocument();
  });
});
