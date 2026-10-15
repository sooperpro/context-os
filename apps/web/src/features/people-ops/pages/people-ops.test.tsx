import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
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
import { MemberPage } from "@/features/team/pages/member-page";
import { buildApiUrl } from "@/lib/api-client";
import { managerHandlers } from "@/test/manager-mocks";
import { mockServer, setupMockApi } from "@/test/msw";
import { peopleOpsHandlers } from "@/test/people-ops-mocks";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

function renderAt(route: string) {
  mockServer.use(
    ...peopleOpsHandlers(),
    // HR opens a manager's member and check-in pages too.
    ...managerHandlers(),
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
        <Route path="/team/:personId" element={<MemberPage />} />
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
    expect(
      await screen.findByRole("heading", { level: 1, name: "Arjun Mehta" }),
    ).toBeInTheDocument();

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
    await user.click(screen.getByRole("button", { name: "Move Pricing and packaging 2026 down" }));
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

  it("archives a template after asking, then restores it from the banner", async () => {
    const user = userEvent.setup();
    renderAt("/templates/tpl-support");

    await screen.findByRole("heading", { level: 1, name: "Support · Specialist" });
    await user.click(screen.getByRole("button", { name: "More actions for this template" }));
    // It's in use, so it can be archived but not deleted.
    expect(screen.queryByRole("menuitem", { name: /Delete template/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("menuitem", { name: /Archive template/ }));
    const dialog = await screen.findByRole("dialog", { name: "Archive Support · Specialist?" });
    expect(dialog).toHaveTextContent("keeps their roadmap");
    await user.click(within(dialog).getByRole("button", { name: "Archive template" }));

    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent("This template is archived");
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

    await user.click(screen.getByRole("button", { name: "More actions for this template" }));
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
    await user.click(screen.getByRole("button", { name: "More actions for this template" }));
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
