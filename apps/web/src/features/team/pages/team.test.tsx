import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useParams } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AssistantContext,
  type AssistantContextValue,
} from "@/components/layout/assistant-context";
import { Toaster } from "sonner";
import { ReviewQueuePage } from "@/features/contributions/pages/review-queue-page";
import { MyLearningPage } from "@/features/learning/pages/my-learning-page";
import { CheckinPage } from "@/features/team/pages/checkin-page";
import { MemberOnboardingTab } from "@/features/team/pages/member-page";
import { TeamPage } from "@/features/team/pages/team-page";
import { http, HttpResponse } from "msw";
import { buildApiUrl } from "@/lib/api-client";
import { managerHandlers } from "@/test/manager-mocks";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

/** The profile's Onboarding tab (N-14), where team cards and saved check-ins lead. */
function OnboardingTabRoute() {
  const { personId = "" } = useParams();
  return <MemberOnboardingTab personId={personId} />;
}
// The API serves these screens; the fixtures stand in for it.
beforeEach(() => mockServer.use(...managerHandlers()));

function renderAt(route: string) {
  mockServer.use(
    http.get(buildApiUrl("/v1/users/me"), () =>
      HttpResponse.json({
        id: "u2",
        name: "Daniel Reyes",
        email: null,
        role: "manager",
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
        <Route path="/team" element={<TeamPage />} />
        <Route path="/people/:personId" element={<OnboardingTabRoute />} />
        <Route path="/team/:personId/check-in" element={<CheckinPage />} />
        <Route path="/reviews" element={<ReviewQueuePage />} />
        <Route path="/learning" element={<MyLearningPage />} />
      </Routes>
      <Toaster />
    </AssistantContext>,
    { route },
  );
}

describe("Team onboarding", () => {
  it("counts people by status and lists who needs you most first", async () => {
    renderAt("/team");

    const list = await screen.findByRole("list", { name: "People onboarding" });
    const cards = within(list).getAllByRole("link");
    expect(cards[0]).toHaveTextContent("Chloe Martin");
    expect(cards[1]).toHaveTextContent("Leah Park");
    expect(cards[0]).toHaveAttribute("href", "/people/p-chloe?tab=onboarding");
    expect(within(cards[1]!).getByText("2 modules are 5 days overdue")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Team status" })).toHaveTextContent(
      "1Blocked1At risk1Needs setup2On track",
    );

    const matrix = await screen.findByRole("region", { name: "Knowledge checks by topic" });
    expect(within(matrix).getByText("Billing: Failed")).toBeInTheDocument();
  });

  it("shows a member's onboarding, assigns learning from the suggestion, and edits the roadmap", async () => {
    const user = userEvent.setup();
    renderAt("/people/p-leah?tab=onboarding");

    const insight = await screen.findByRole("region", { name: "Context Bot suggestion" });
    await user.click(within(insight).getByRole("button", { name: "Book a session with Priya" }));
    const dialog = await screen.findByRole("dialog", { name: "Assign a learning task" });
    // Anyone on the team can be picked; the page's person comes preselected.
    expect(await within(dialog).findByRole("combobox", { name: "Person" })).toHaveTextContent(
      "Leah Park",
    );
    expect(
      await within(dialog).findByRole("radio", { name: /Billing architecture: deep dive/ }),
    ).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Assign task" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const roadmap = screen.getByRole("region", { name: "Roadmap · current stage" });
    expect(await within(roadmap).findByText("Billing architecture: deep dive")).toBeInTheDocument();
    // Undo in the toast takes it back.
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(
        within(roadmap).queryByText("Billing architecture: deep dive"),
      ).not.toBeInTheDocument(),
    );
    await user.click(within(roadmap).getByRole("button", { name: "Edit roadmap" }));
    const billingRow = within(roadmap)
      .getByText("Billing architecture and Project Kestrel")
      .closest("[data-slot=segmented-item]")!;
    await user.click(within(billingRow as HTMLElement).getByRole("button", { name: "+1 week" }));
    await user.click(within(roadmap).getByRole("button", { name: "Save changes" }));
    expect(await within(roadmap).findByText(/\(moved\)/)).toBeInTheDocument();
  });

  it("records a readiness check-in and shows it on the member page", async () => {
    const user = userEvent.setup();
    renderAt("/team/p-leah/check-in");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Check-in with Leah" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Plan a session with Priya Nair and a retake date"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "60-day readiness" }));
    const area = await screen.findByRole("group", { name: "Understands the systems they work on" });
    await user.click(within(area).getByRole("button", { name: "Developing" }));
    await user.type(screen.getByRole("textbox", { name: "Notes" }), "Agreed a session with Priya.");
    await user.click(screen.getByRole("button", { name: "Save check-in" }));

    // Saved: back on her onboarding, the profile's Onboarding tab.
    const checkins = await screen.findByRole("region", { name: /Check-ins/ });
    expect(await within(checkins).findByText("Agreed a session with Priya.")).toBeInTheDocument();
  });

  it("sends a probation recommendation", async () => {
    const user = userEvent.setup();
    renderAt("/team/p-arjun/check-in?type=probation");

    expect(await screen.findByRole("radio", { name: /Confirm/ })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: /Extend 30 days/ }));
    await user.click(screen.getByRole("button", { name: "Save and send recommendation" }));
    // Saved: back on their onboarding, the profile's Onboarding tab.
    expect(await screen.findByRole("button", { name: "Record check-in" })).toBeInTheDocument();
  });
});

describe("Review queue and My learning", () => {
  it("approves a contribution and moves to the next one", async () => {
    const user = userEvent.setup();
    renderAt("/reviews");

    const waiting = await screen.findByRole("region", { name: /Waiting/ });
    expect(await within(waiting).findAllByRole("button", { pressed: false })).toHaveLength(1);
    expect(within(waiting).getAllByRole("button", { pressed: true })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "On-call escalation paths" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve and publish" }));

    expect(
      await screen.findByRole("heading", { name: "Ledger service runbook" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 reviewed recently")).toBeInTheDocument();
    expect(screen.getByText("Run `make restart` on the ledger host.")).toBeInTheDocument();
  });

  it("adds a suggested course to My learning", async () => {
    const user = userEvent.setup();
    renderAt("/learning");

    const suggested = await screen.findByRole("region", { name: /Suggested for you/ });
    await user.click((await within(suggested).findAllByRole("button", { name: "Add" }))[0]!);
    const assigned = screen.getByRole("region", { name: /Assigned to you/ });
    expect(await within(assigned).findByText("Writing good decision records")).toBeInTheDocument();
  });
});
