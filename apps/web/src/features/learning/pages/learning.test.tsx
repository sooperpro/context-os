import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  AssistantContext,
  type AssistantContextValue,
} from "@/components/layout/assistant-context";
import { CheckPage } from "@/features/learning/pages/check-page";
import { LessonPage } from "@/features/learning/pages/lesson-page";
import { ModulePage } from "@/features/learning/pages/module-page";
import { RoadmapPage } from "@/features/learning/pages/roadmap-page";
import { setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

function renderAt(route: string) {
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
        <Route path="/roadmap" element={<RoadmapPage />} />
        <Route path="/roadmap/modules/:moduleId" element={<ModulePage />} />
        <Route path="/roadmap/lessons/:lessonId" element={<LessonPage />} />
        <Route path="/roadmap/checks/:checkId" element={<CheckPage />} />
      </Routes>
    </AssistantContext>,
    { route },
  );
  return assistant;
}

/** The fixture's correct answers for "How Tessellate makes money". */
const CORRECT = [
  "A platform fee plus usage per tracked shipment",
  "Invoices lagged usage",
  "Publish a billing event",
  "Kafka can deliver the same event",
  "M2 · Dual-write",
];

describe("My roadmap", () => {
  it("shows the plan by stage, with progress and what is done", async () => {
    const user = userEvent.setup();
    renderAt("/roadmap");

    expect(
      await screen.findByRole("heading", { level: 1, name: "My roadmap" }),
    ).toBeInTheDocument();
    const panel = await screen.findByRole("tabpanel", { name: /Foundations/ });
    const current = within(panel).getByRole("link", { name: /How Tessellate makes money/ });
    expect(current).toHaveAttribute("href", "/roadmap/modules/m4");
    expect(within(current).getByText("In progress")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Welcome to Tessellate/ })).toHaveTextContent(
      "Done",
    );
    expect(screen.getByRole("img", { name: "18% complete" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Product & systems/ }));
    const next = screen.getByRole("tabpanel", { name: /Product & systems/ });
    expect(within(next).getByText(/This stage opens on/)).toBeInTheDocument();
    expect(within(next).getByRole("link", { name: /Architecture overview/ })).toHaveTextContent(
      /Unlocks/,
    );
  });

  it("shows a module with its lessons, sources and people", async () => {
    renderAt("/roadmap/modules/m4");

    expect(
      await screen.findByRole("heading", { level: 1, name: "How Tessellate makes money" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Resume lesson 3").closest("a")).toHaveAttribute(
      "href",
      "/roadmap/lessons/m4-l3",
    );
    const lessons = screen.getByRole("region", { name: "Lessons" });
    expect(within(lessons).getByRole("link", { name: /Knowledge check/ })).toHaveAttribute(
      "href",
      "/roadmap/checks/m4-check",
    );
    expect(screen.getByText(/Finance only. You don’t have access./)).toBeInTheDocument();
    expect(screen.getByText("Expert · Billing pipeline")).toBeInTheDocument();
  });
});

describe("Lessons and knowledge checks", () => {
  it("reads a lesson, answers its practice question, and moves on to the check", async () => {
    const user = userEvent.setup();
    renderAt("/roadmap/lessons/m4-l3");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Why billing is moving to events" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Decision record ADR-042" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Project Kestrel milestones" })).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /Because the same event can be delivered more than once/,
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(/^Right\./);

    await user.click(screen.getByRole("button", { name: "Mark complete and continue" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "How Tessellate makes money" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Knowledge check" })).toBeInTheDocument();
  });

  it("grades the check on submit: a pass completes the module", async () => {
    const user = userEvent.setup();
    renderAt("/roadmap/checks/m4-check");

    const form = await screen.findByRole("form", { name: "Knowledge check" });
    const submit = within(form).getByRole("button", { name: "Submit answers" });
    expect(submit).toBeDisabled();
    for (const answer of CORRECT)
      await user.click(within(form).getByRole("radio", { name: new RegExp(answer) }));
    expect(within(form).getByText(/of 5 answered/)).toHaveTextContent("5 of 5 answered");
    await user.click(submit);

    expect(
      await screen.findByRole("heading", { name: "You passed. Module complete." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Next: Product tour: Tessellate Track/)).toBeInTheDocument();
    expect(screen.getByText("2 of 6 passed")).toBeInTheDocument();
  });

  it("shows what was wrong and allows a retake when the check is not passed", async () => {
    const user = userEvent.setup();
    renderAt("/roadmap/checks/m4-check");

    const form = await screen.findByRole("form", { name: "Knowledge check" });
    for (const fieldset of within(form).getAllByRole("group")) {
      await user.click(within(fieldset).getAllByRole("radio")[3]!);
    }
    await user.click(within(form).getByRole("button", { name: "Submit answers" }));

    expect(
      await screen.findByRole("heading", { name: "0 of 5. You need 4 to pass." }),
    ).toBeInTheDocument();
    const answers = screen.getByRole("region", { name: "Your answers" });
    expect(within(answers).getAllByLabelText("Incorrect")).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: "Retake the check" }));
    expect(screen.getByRole("form", { name: "Knowledge check" })).toBeInTheDocument();
  });
});
