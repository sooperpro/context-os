import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes, useParams } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  AssistantContext,
  type AssistantContextValue,
} from "@/components/layout/assistant-context";
import { OnboardingListPage } from "@/features/people-ops/pages/onboarding-list-page";
import { OnboardingRecordPage } from "@/features/people-ops/pages/onboarding-record-page";
import { ProbationDetailPage } from "@/features/people-ops/pages/probation-detail-page";
import { ProbationListPage } from "@/features/people-ops/pages/probation-list-page";
import { TemplateEditorPage } from "@/features/people-ops/pages/template-editor-page";
import { TemplatesPage } from "@/features/people-ops/pages/templates-page";
import { CheckinPage } from "@/features/team/pages/checkin-page";
import { MemberOnboardingTab } from "@/features/team/pages/member-page";
import { buildApiUrl } from "@/lib/api-client";
import { markTemplateInReview } from "@/mocks/people-ops";
import { managerHandlers } from "@/test/manager-mocks";
import { mockServer, setupMockApi } from "@/test/msw";
import { peopleOpsHandlers } from "@/test/people-ops-mocks";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

/** The profile's Onboarding tab (N-14), where team cards and saved check-ins lead. */
function OnboardingTabRoute() {
  const { personId = "" } = useParams();
  return <MemberOnboardingTab personId={personId} />;
}

function renderAt(
  route: string,
  {
    role = "hr",
    handlers = [],
  }: { role?: "hr" | "manager"; handlers?: Parameters<typeof mockServer.use> } = {},
) {
  mockServer.use(
    ...handlers,
    ...peopleOpsHandlers(),
    // HR opens a manager's member and check-in pages too.
    ...managerHandlers(),
    // People Ops' view by default: HR publishes templates directly.
    http.get(buildApiUrl("/v1/workspaces/current"), () =>
      HttpResponse.json({
        id: "w1",
        name: "Tessellate",
        role,
        authentication: "development",
      }),
    ),
    http.get(buildApiUrl("/v1/users/me"), () =>
      HttpResponse.json({
        id: "u3",
        name: "Elena Brooks",
        email: null,
        role: "member",
        workspaceId: "w1",
        preferences: {},
      }),
    ),
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
        <Route path="/onboarding" element={<OnboardingListPage />} />
        <Route path="/onboarding/:recordId" element={<OnboardingRecordPage />} />
        <Route path="/probation" element={<ProbationListPage />} />
        <Route path="/probation/:reviewId" element={<ProbationDetailPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/templates/:templateId" element={<TemplateEditorPage />} />
        <Route path="/people/:personId" element={<OnboardingTabRoute />} />
        <Route path="/team/:personId/check-in" element={<CheckinPage />} />
      </Routes>
    </AssistantContext>,
    { route },
  );
  return assistant;
}

const rowsOf = (table: HTMLElement) => within(table).getAllByRole("row").slice(1);

describe("Onboarding records", () => {
  it("filters and searches records across teams", async () => {
    const user = userEvent.setup();
    renderAt("/onboarding");

    const table = await screen.findByRole("table");
    expect(rowsOf(table)).toHaveLength(12);
    const filters = screen.getByRole("group", { name: "Filter onboarding" });
    await user.click(within(filters).getByRole("button", { name: /Needs attention/ }));
    await waitFor(() => expect(rowsOf(screen.getByRole("table"))).toHaveLength(4));
    expect(within(filters).getByRole("button", { name: /Needs attention/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(within(filters).getByRole("button", { name: /^All/ }));
    await user.type(screen.getByRole("searchbox", { name: "Search onboarding records" }), "marcus");
    await waitFor(() => expect(rowsOf(screen.getByRole("table"))).toHaveLength(2));
    expect(screen.getByRole("link", { name: /Sofia Alvarez/ })).toHaveAttribute(
      "href",
      "/onboarding/p-sofia",
    );
  });

  it("finishes a starter's setup from their record", async () => {
    const user = userEvent.setup();
    renderAt("/onboarding/p-jonah");

    expect(await screen.findByRole("heading", { level: 1, name: "Jonah Kim" })).toBeInTheDocument();
    const setup = screen.getByRole("region", { name: "Setup" });
    expect(within(setup).getByText("3 of 6 done")).toBeInTheDocument();

    await user.click(within(setup).getByRole("button", { name: "Assign buddy" }));
    const dialog = await screen.findByRole("dialog", { name: "Assign Jonah’s onboarding buddy" });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await within(setup).findByText("4 of 6 done")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Assignments" })).toHaveTextContent("Sana Iqbal");

    await user.click(within(setup).getByRole("button", { name: "Assign roadmap" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(await within(setup).findByRole("button", { name: "Mark done" }));
    expect(await within(setup).findByText("6 of 6 done")).toBeInTheDocument();
    expect(await screen.findByText("Ready")).toBeInTheDocument();
  });

  it("messages the new hire and their manager from the record", async () => {
    const posted: unknown[] = [];
    const user = userEvent.setup();
    renderAt("/onboarding/p-jonah");
    mockServer.use(
      http.post(buildApiUrl("/v1/people-ops/onboardings/:id/message"), async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json({ delivered: [], skipped: [] });
      }),
    );

    await screen.findByRole("heading", { level: 1, name: "Jonah Kim" });
    await user.click(screen.getByRole("button", { name: "Message" }));
    const dialog = await screen.findByRole("dialog", { name: "Message about Jonah’s onboarding" });
    // The new hire is picked to start with; nobody is assigned as a buddy yet.
    expect(within(dialog).getByRole("checkbox", { name: /Jonah Kim/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Onboarding buddy/ })).toBeDisabled();
    const send = within(dialog).getByRole("button", { name: "Send message" });
    expect(send).toBeDisabled();

    await user.click(within(dialog).getByRole("checkbox", { name: /Daniel Reyes/ }));
    await user.type(
      within(dialog).getByRole("textbox", { name: "Message" }),
      "Laptop ships Friday.",
    );
    expect(send).toBeEnabled();
    await user.click(send);
    await waitFor(() =>
      expect(posted).toEqual([{ to: ["person", "manager"], message: "Laptop ships Friday." }]),
    );
    // Nobody got it, so the dialog stays open for another try.
    expect(screen.getByRole("dialog", { name: "Message about Jonah’s onboarding" })).toBeVisible();
  });

  it("explains why the New onboarding form is empty when the server refuses it", async () => {
    let refused = true;
    const user = userEvent.setup();
    renderAt("/onboarding");
    mockServer.use(
      http.get(buildApiUrl("/v1/people-ops/onboarding-options"), () =>
        refused
          ? HttpResponse.json(
              { error: { code: "FORBIDDEN", message: "This operation is not permitted" } },
              { status: 403 },
            )
          : HttpResponse.json({
              teams: ["Platform"],
              managers: [{ id: "u1", name: "Daniel Reyes", title: null }],
              buddies: [],
              peoplePartners: [],
              templates: [],
              departments: [],
              teamDepartments: {},
            }),
      ),
    );

    await user.click(await screen.findByRole("button", { name: "New onboarding" }));
    const dialog = await screen.findByRole("dialog", { name: "New onboarding" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Only people with the HR role can start an onboarding.",
    );
    expect(within(dialog).queryByRole("textbox", { name: "Full name" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Create onboarding" })).toBeDisabled();

    // Once the server allows it, trying again shows the form.
    refused = false;
    await user.click(within(dialog).getByRole("button", { name: "Try again" }));
    expect(await within(dialog).findByRole("textbox", { name: "Full name" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("suggests the template for the role, and says when there isn't one yet", async () => {
    const user = userEvent.setup();
    renderAt("/onboarding");
    await user.click(await screen.findByRole("button", { name: "New onboarding" }));
    const dialog = await screen.findByRole("dialog", { name: "New onboarding" });
    await user.type(
      await within(dialog).findByRole("textbox", { name: "Job title" }),
      "Backend Engineer",
    );
    // No template for the job, so the Platform team's template is chosen for them, and it says why.
    const template = within(dialog).getByRole("combobox", { name: "Template" });
    await waitFor(() =>
      expect(template).toHaveTextContent("Engineering · Individual contributor · Suggested"),
    );
    expect(within(dialog).getByText(/Suggested for the Platform team/)).toBeInTheDocument();

    // Billing has no template: nothing is chosen, and HR is pointed to Templates. Nothing is drafted.
    await user.click(within(dialog).getByRole("combobox", { name: "Team" }));
    await user.click(await screen.findByRole("option", { name: "Billing" }));
    await waitFor(() => expect(template).toHaveTextContent("Choose later"));
    expect(
      within(dialog).getByText(/No template for Backend Engineer in Billing yet/),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/Generate a template/)).not.toBeInTheDocument();
  });

  it("starts a new onboarding and opens its record", async () => {
    const user = userEvent.setup();
    renderAt("/onboarding");

    await user.click(await screen.findByRole("button", { name: "New onboarding" }));
    const dialog = await screen.findByRole("dialog", { name: "New onboarding" });
    await user.type(
      await within(dialog).findByRole("textbox", { name: "Full name" }),
      "Noor Hassan",
    );
    await user.type(within(dialog).getByRole("textbox", { name: "Job title" }), "Backend Engineer");
    await user.click(within(dialog).getByRole("button", { name: "Create onboarding" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Noor Hassan" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Assignments" })).toHaveTextContent("Daniel Reyes");

    // The account step is nobody's to tick: it finishes when they sign in. The others can be.
    const setup = screen.getByRole("region", { name: "Setup" });
    expect(within(setup).getByText("Done when they sign in")).toBeInTheDocument();
    expect(within(setup).getAllByRole("button", { name: "Mark done" })).toHaveLength(2);
  });
});

describe("Probation reviews", () => {
  it("lists the pipeline with what needs People Ops", async () => {
    const user = userEvent.setup();
    renderAt("/probation");

    const upcoming = await screen.findByRole("region", { name: /Upcoming reviews/ });
    expect(rowsOf(within(upcoming).getByRole("table"))).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: /Needs you/ }));
    const needsYou = screen.getByRole("region", { name: /Needs you/ });
    // Buttons rendered as links keep the button role.
    expect(
      within(needsYou).getByRole("button", { name: "Review & approve" }).closest("a"),
    ).toHaveAttribute("href", "/probation/pr-sofia");
    expect(within(needsYou).getByRole("button", { name: "Review" }).closest("a")).toHaveAttribute(
      "href",
      "/probation/pr-ben",
    );
    expect(screen.getByRole("region", { name: "Recently completed" })).toHaveTextContent(
      "Extended 30 days",
    );
  });

  it("records a decision after confirming it", async () => {
    const user = userEvent.setup();
    renderAt("/probation/pr-sofia");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Sofia Alvarez" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Understands the systems they work on: Exceeds" }),
    ).toBeInTheDocument();
    const status = screen.getByRole("region", { name: /Employment status/ });
    expect(within(status).getByRole("radio", { name: /Confirm employment/ })).toBeChecked();
    await user.type(
      within(status).getByRole("textbox", { name: "Note for the record" }),
      "Strong first quarter.",
    );
    await user.click(within(status).getByRole("button", { name: "Record decision" }));

    const dialog = await screen.findByRole("dialog", { name: "Confirm Sofia’s employment?" });
    await user.click(within(dialog).getByRole("button", { name: "Confirm employment" }));
    expect(await within(status).findByText(/Recorded by Elena Brooks today/)).toBeInTheDocument();
    expect(within(status).getByText("Strong first quarter.")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Review progress" })).toHaveTextContent("Recorded");
  });

  it("receives a manager's recommendation from their check-in", async () => {
    const user = userEvent.setup();
    renderAt("/team/p-arjun/check-in?type=probation");

    await user.click(await screen.findByRole("radio", { name: /Extend 30 days/ }));
    await user.click(screen.getByRole("button", { name: "Save and send recommendation" }));
    // Saved: back on their onboarding, the profile's Onboarding tab.
    expect(await screen.findByRole("button", { name: "Record check-in" })).toBeInTheDocument();

    // People Ops now has it to review.
    const response = await fetch(
      new URL(buildApiUrl("/v1/people-ops/probation-reviews/pr-arjun"), window.location.origin),
    );
    const review = (await response.json()) as {
      state: string;
      recommendation: string;
      activity: Array<{ text: string }>;
    };
    expect(review.state).toBe("needs_hr_review");
    expect(review.recommendation).toBe("extend");
    expect(review.activity[0]?.text).toBe("Daniel Reyes recommended a 30-day extension");
  });
});

describe("Templates", () => {
  it("reorders a stage, saves a draft and publishes it", async () => {
    const user = userEvent.setup();
    renderAt("/templates/tpl-sales-ae");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Sales · Account executive" }),
    ).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save draft" });
    expect(save).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Move Pricing and packaging 2026" }));
    await user.click(await screen.findByRole("menuitem", { name: "Move down" }));
    expect(screen.getByText("· Unsaved changes")).toBeInTheDocument();
    await user.click(save);
    expect(await screen.findByText("Draft v3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Publish v3" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Publish v3 of Sales · Account executive?",
    });
    await user.type(
      within(dialog).getByRole("textbox", { name: "What changed?" }),
      "CRM before pricing",
    );
    await user.click(within(dialog).getByRole("button", { name: "Publish v3" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Publishing starts a fresh editing session with the new version on top of the history.
    const history = await screen.findByRole("region", { name: "Version history" });
    expect(await within(history).findByText("CRM before pricing")).toBeInTheDocument();
    expect(history).toHaveTextContent(/^Version historyv3/);

    // The version just published can be opened as it was, and so can the one before it; the
    // oldest had no copy kept.
    expect(within(history).getAllByRole("button")).toHaveLength(2);
    expect(history).toHaveTextContent("Older ones weren’t saved");
    await user.click(within(history).getByRole("button", { name: /Open v3/ }));
    const version = await screen.findByRole("dialog", {
      name: "Sales · Account executive · Version 3",
    });
    expect(await within(version).findByText(/CRM before pricing/)).toBeInTheDocument();
    expect(version).toHaveTextContent("Pricing and packaging 2026");
    expect(within(version).queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
  });

  it("suggests the organisation's roles and teams, and has a department", async () => {
    renderAt("/templates/tpl-sales-ae");
    await screen.findByRole("heading", { level: 1, name: "Sales · Account executive" });
    const side = screen.getByRole("region", { name: "Who it’s for" });
    expect(within(side).getByRole("combobox", { name: "Department" })).toHaveTextContent(
      "Any department",
    );
    // Other templates' roles are offered; the ones already on it aren't.
    const roles = within(side).getByLabelText("Roles");
    await waitFor(() =>
      expect(document.querySelector('datalist option[value="Software engineers"]')).not.toBeNull(),
    );
    expect(document.querySelector('datalist option[value="Account executives"]')).toBeNull();
    // Picking one (not typing it) adds it at once.
    fireEvent.change(roles, { target: { value: "Software engineers" } });
    expect(
      await within(side).findByRole("button", { name: "Remove Software engineers" }),
    ).toBeInTheDocument();
    expect(screen.getByText("· Unsaved changes")).toBeInTheDocument();
  });

  it("publishes a generated template together with its draft modules", async () => {
    const user = userEvent.setup();
    const module = (id: string, title: string) => ({
      id: `tutorial-${id}`,
      title,
      kind: "project" as const,
      minutes: 20,
      owner: "Elena Brooks",
      lessons: "draft" as const,
      tutorialId: id,
    });
    const generated = {
      id: "tpl-gen",
      name: "Associate Backend Engineer",
      family: "engineering",
      version: "v1",
      status: "draft",
      publishedVersion: null,
      activeCount: 0,
      archived: false,
      deletable: true,
      roles: ["Associate Backend Engineer"],
      teams: [],
      weeks: 4,
      passMark: 4,
      probationDays: 90,
      checkins: [{ title: "30-day check-in", day: 30 }],
      generation: { state: "done", error: null },
      generated: {
        jobTitle: "Associate Backend Engineer",
        team: null,
        policyNote: "Defaults were used.",
        gaps: [],
        reasons: {},
      },
      review: null,
      createdBy: null,
      editable: true,
      department: null,
      updatedAt: "2026-10-17T05:00:00.000Z",
      updatedBy: "Elena Brooks",
      stages: [
        {
          id: "stage-1",
          name: "Onboarding",
          weekStart: 1,
          weekEnd: 4,
          modules: [module("t1", "Our platform"), module("t2", "How we make money")],
        },
      ],
      history: [],
    };
    let body: unknown;
    renderAt("/templates/tpl-gen", {
      handlers: [
        http.get(buildApiUrl("/v1/people-ops/templates/tpl-gen"), () =>
          HttpResponse.json(generated),
        ),
        http.post(buildApiUrl("/v1/people-ops/templates/tpl-gen/publish"), async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ ...generated, status: "published", publishedVersion: "v1" });
        }),
      ],
    });
    await user.click(await screen.findByRole("button", { name: "Publish v1" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Publish v1 of Associate Backend Engineer?",
    });
    expect(dialog).toHaveTextContent("This also publishes the lessons of 2 draft modules");
    expect(dialog).toHaveTextContent("Our platform");
    expect(dialog).toHaveTextContent("How we make money");
    await user.click(within(dialog).getByRole("button", { name: "Publish v1 and 2 modules" }));
    await waitFor(() => expect(body).toMatchObject({ publishModules: true }));
  });

  it("opens a published module's lessons from the template, shows what waits and publishes updates", async () => {
    const user = userEvent.setup();
    const module = (
      id: string,
      title: string,
      lessonState: "update_ready" | "published",
      lessonsEditable: boolean,
    ) => ({
      id: `tutorial-${id}`,
      title,
      kind: "project" as const,
      minutes: 20,
      owner: "Elena Brooks",
      lessons: "ready" as const,
      tutorialId: id,
      lessonState,
      lessonsEditable,
    });
    const live = {
      id: "tpl-live",
      name: "Support specialist",
      family: "support",
      version: "v1",
      status: "published",
      publishedVersion: "v1",
      activeCount: 2,
      archived: false,
      deletable: false,
      roles: ["Support specialist"],
      teams: [],
      weeks: 4,
      passMark: 4,
      probationDays: 90,
      checkins: [{ title: "30-day check-in", day: 30 }],
      generation: null,
      generated: null,
      review: null,
      createdBy: null,
      editable: true,
      department: null,
      updatedAt: "2026-10-17T05:00:00.000Z",
      updatedBy: "Elena Brooks",
      stages: [
        {
          id: "stage-1",
          name: "Induction",
          weekStart: 1,
          weekEnd: 2,
          modules: [
            module("t-tickets", "Handling tickets", "update_ready", true),
            module("t-mission", "Our mission", "published", false),
          ],
        },
      ],
      history: [],
    };
    let published = false;
    renderAt("/templates/tpl-live", {
      handlers: [
        http.get(buildApiUrl("/v1/people-ops/templates/tpl-live"), () => HttpResponse.json(live)),
        http.post(buildApiUrl("/v1/people-ops/templates/tpl-live/publish-lessons"), () => {
          published = true;
          return HttpResponse.json(live);
        }),
      ],
    });

    // Its state and a way into the Studio, only where the viewer may edit.
    const tickets = (await screen.findByText("Handling tickets")).closest<HTMLElement>(
      "[data-slot=segmented-item]",
    )!;
    expect(within(tickets).getByText("Update ready to review")).toBeInTheDocument();
    expect(within(tickets).getByRole("link", { name: "Edit lessons" })).toHaveAttribute(
      "href",
      "/tutorials/t-tickets?template=tpl-live",
    );
    const mission = screen
      .getByText("Our mission")
      .closest<HTMLElement>("[data-slot=segmented-item]")!;
    expect(within(mission).queryByRole("link", { name: "Edit lessons" })).not.toBeInTheDocument();

    // The waiting update goes out on its own, without a new template version.
    expect(await screen.findByText("1 module has a lesson update waiting")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish lesson updates" }));
    await waitFor(() => expect(published).toBe(true));
  });

  it("moves a module to another stage without dragging", async () => {
    const user = userEvent.setup();
    renderAt("/templates/tpl-sales-ae");
    const pitch = await screen.findByRole("list", { name: "Modules in Product & pitch" });
    expect(within(pitch).queryByText("Pricing and packaging 2026")).not.toBeInTheDocument();
    // Each module can be dragged by its handle, or moved from its menu.
    expect(
      screen.getByRole("button", { name: "Reorder Pricing and packaging 2026" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Move Pricing and packaging 2026" }));
    // The keyboard way into the submenu: focus "Move to stage", then the right arrow.
    (await screen.findByRole("menuitem", { name: "Move to stage" })).focus();
    await user.keyboard("{ArrowRight}");
    await user.click(await screen.findByRole("menuitem", { name: "Product & pitch" }));
    expect(await within(pitch).findByText("Pricing and packaging 2026")).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Modules in Foundations" })).queryByText(
        "Pricing and packaging 2026",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText("· Unsaved changes")).toBeInTheDocument();
  });

  it("lets a manager submit their template for review instead of publishing it", async () => {
    const user = userEvent.setup();
    renderAt("/templates/tpl-sales-ae", { role: "manager" });

    await screen.findByRole("heading", { level: 1, name: "Sales · Account executive" });
    const submit = await screen.findByRole("button", { name: "Submit for review" });
    expect(screen.queryByRole("button", { name: /^Publish/ })).not.toBeInTheDocument();
    // Archiving is People Ops'; a manager has nothing else to do with a published template.
    expect(
      screen.queryByRole("button", { name: "More actions for this template" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Move Pricing and packaging 2026" }));
    await user.click(await screen.findByRole("menuitem", { name: "Move down" }));
    await user.click(submit);
    const dialog = await screen.findByRole("dialog", {
      name: "Submit Sales · Account executive for review?",
    });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Note for the reviewer" }),
      "CRM before pricing",
    );
    await user.click(within(dialog).getByRole("button", { name: "Submit for review" }));
    expect(await screen.findByText("Waiting for People Ops")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submitted" })).toBeDisabled();
  });

  it("shows HR a submitted template and sends it back with a note", async () => {
    const user = userEvent.setup();
    markTemplateInReview("tpl-sales-ae", "Pricing moved after CRM");
    renderAt("/templates");

    const tile = await screen.findByRole("link", { name: /Sales · Account executive/ });
    expect(tile).toHaveTextContent("In review");
    await user.click(tile);
    expect(
      await screen.findByText(/Daniel Reyes submitted this template for review/),
    ).toBeInTheDocument();
    expect(screen.getByText("Pricing moved after CRM")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send back" }));
    const dialog = await screen.findByRole("dialog", { name: "Send it back?" });
    const send = within(dialog).getByRole("button", { name: "Send back" });
    expect(send).toBeDisabled();
    await user.type(
      within(dialog).getByRole("textbox", { name: "What should change?" }),
      "Add the security policy",
    );
    await user.click(send);
    expect(await screen.findByText(/sent this template back/)).toBeInTheDocument();
    expect(screen.getByText("Add the security policy")).toBeInTheDocument();
  });

  it("archives a template after asking, then restores it from the banner", async () => {
    const user = userEvent.setup();
    renderAt("/templates/tpl-support");

    await screen.findByRole("heading", { level: 1, name: "Support · Specialist" });
    await user.click(await screen.findByRole("button", { name: "More actions for this template" }));
    // It's in use, so it can be archived but not deleted.
    expect(screen.queryByRole("menuitem", { name: /Delete template/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("menuitem", { name: /Archive template/ }));
    const dialog = await screen.findByRole("dialog", { name: "Archive Support · Specialist?" });
    expect(dialog).toHaveTextContent("keeps their roadmap");
    await user.click(within(dialog).getByRole("button", { name: "Archive template" }));

    // The archived banner (drag and drop keeps its own live region for announcements).
    const banner = (await screen.findByText("This template is archived")).closest<HTMLElement>(
      "[role=status]",
    )!;
    expect(banner).toHaveTextContent("It isn’t offered for new onboardings");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Publish/ })).toBeDisabled();

    await user.click(within(banner).getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(screen.queryByText("This template is archived")).not.toBeInTheDocument(),
    );
  });

  it("deletes a template nobody used, after a confirmation, and returns to the list", async () => {
    let deleted = false;
    const user = userEvent.setup();
    renderAt("/templates");
    mockServer.use(
      http.delete(buildApiUrl("/v1/people-ops/templates/:id"), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    // A fresh draft has no onboardings on it, so it can be deleted.
    // The button is off until the list has loaded.
    const newTemplate = await screen.findByRole("button", { name: "New template" });
    await waitFor(() => expect(newTemplate).toBeEnabled());
    await user.click(newTemplate);
    const creating = await screen.findByRole("dialog", { name: "New template" });
    await user.type(within(creating).getByRole("textbox", { name: "Name" }), "Scratch template");
    await user.click(within(creating).getByRole("button", { name: /^Create/ }));
    await screen.findByRole("heading", { level: 1, name: "Scratch template" });

    await user.click(await screen.findByRole("button", { name: "More actions for this template" }));
    await user.click(await screen.findByRole("menuitem", { name: /Delete template/ }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Scratch template?" });
    expect(dialog).toHaveTextContent("can’t be undone");
    await user.click(within(dialog).getByRole("button", { name: "Delete template" }));
    await waitFor(() => expect(deleted).toBe(true));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Onboarding templates" }),
    ).toBeInTheDocument();
  });

  it("shows archived templates on the list only when asked", async () => {
    const user = userEvent.setup();
    renderAt("/templates/tpl-manager");
    await screen.findByRole("heading", { level: 1, name: "People manager onboarding" });
    await user.click(await screen.findByRole("button", { name: "More actions for this template" }));
    await user.click(await screen.findByRole("menuitem", { name: /Archive template/ }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Archive template" }),
    );
    await screen.findByText("This template is archived");

    await user.click(screen.getByRole("link", { name: "Templates" }));
    const list = await screen.findByRole("list", { name: "Templates" });
    expect(within(list).getAllByRole("link")).toHaveLength(6);
    expect(within(list).queryByText("Archived")).not.toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Show archived" }));
    // The list reloads with the archived ones in it.
    await waitFor(async () =>
      expect(
        within(await screen.findByRole("list", { name: "Templates" })).getAllByRole("link"),
      ).toHaveLength(7),
    );
    expect(
      within(screen.getByRole("list", { name: "Templates" })).getByText("Archived"),
    ).toBeInTheDocument();
  });

  it("adds a module from the library", async () => {
    const user = userEvent.setup();
    renderAt("/templates/tpl-eng-ic");

    await user.click(await screen.findByRole("button", { name: "Add module to Foundations" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a module to Foundations" });
    // Modules already in the template are not offered.
    expect(await within(dialog).findAllByRole("radio")).toHaveLength(2);
    await user.click(within(dialog).getByRole("radio", { name: /Security basics/ }));
    await user.click(within(dialog).getByRole("button", { name: "Add module" }));
    expect(screen.getByRole("region", { name: /Foundations/ })).toHaveTextContent(
      "Security basics",
    );
  });

  it("lists templates with their stats", async () => {
    renderAt("/templates");

    const list = await screen.findByRole("list", { name: "Templates" });
    const cards = within(list).getAllByRole("link");
    expect(cards).toHaveLength(7);
    expect(cards[0]).toHaveAttribute("href", "/templates/tpl-eng-ic");
    expect(cards[0]).toHaveTextContent("Stages4Modules20In use12");
  });
});
