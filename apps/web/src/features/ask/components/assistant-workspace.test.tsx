import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  AssistantContext,
  type AssistantContextValue,
} from "@/components/layout/assistant-context";
import { useBotContext } from "@/components/layout/bot-context";
import { QuizIcon } from "@/components/ui/icons";
import { AssistantPanel } from "@/features/ask/components/assistant-panel";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const assistant: AssistantContextValue = {
  open: true,
  openAssistant: vi.fn(),
  closeAssistant: vi.fn(),
  toggleAssistant: vi.fn(),
  subscribeToQueries: () => () => undefined,
};

/** A page that tells the bot a knowledge check is open. */
function CheckInProgress() {
  useBotContext(
    {
      chips: [{ icon: QuizIcon, label: "Knowledge check in progress" }],
      suggestions: [],
      intro: "I’m paused while your knowledge check is open.",
      paused: true,
    },
    "check",
  );
  return null;
}

function render(route: string, role = "member") {
  mockServer.use(
    http.get(buildApiUrl("/v1/users/me"), () =>
      HttpResponse.json({
        id: "u1",
        name: "Maya Okafor",
        email: null,
        role,
        workspaceId: "w",
        preferences: {},
      }),
    ),
    http.get(buildApiUrl("/v1/workspaces/current"), () =>
      HttpResponse.json({ id: "w", name: "Tessellate", role, authentication: "development" }),
    ),
  );
  renderWithProviders(
    <AssistantContext value={assistant}>
      <Routes>
        <Route path="/knowledge" element={<AssistantPanel />} />
        <Route
          path="/roadmap/checks/m4-check"
          element={
            <>
              <CheckInProgress />
              <AssistantPanel />
            </>
          }
        />
      </Routes>
    </AssistantContext>,
    { route },
  );
}

describe("Context Bot outside a project", () => {
  it("offers the persona's questions and answers with citations, sources and follow-ups", async () => {
    const user = userEvent.setup();
    render("/knowledge");

    expect(
      await screen.findByText("Hi Maya, what would you like to understand?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Your onboarding")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Why are we moving billing to Kafka?" }));

    expect(await screen.findByText("Verified · decision record")).toBeInTheDocument();
    expect(screen.getByText("Project Kestrel", { exact: false })).toBeInTheDocument();
    const sources = screen.getByRole("heading", { name: "Sources" }).parentElement!;
    expect(within(sources).getByText("ADR-042: Billing events on Kafka")).toBeInTheDocument();
    expect(
      within(sources).getByText("Jira sync is failing: may be out of date", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Open source 1: ADR-042/ }).length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Not helpful" }));
    await user.click(screen.getByRole("button", { name: "Out of date" }));
    expect(
      await screen.findByText("Thanks. The knowledge owner will review this answer."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "What does dual-write mean here?" }));
    expect(await screen.findByText(/sends each billable action two ways/)).toBeInTheDocument();
  });

  it("says when nothing answers, names who might know, and reports the gap", async () => {
    const user = userEvent.setup();
    render("/knowledge");

    await user.type(
      await screen.findByRole("textbox", { name: "Ask Context Bot" }),
      "How do I roll back a Kestrel deploy?{Enter}",
    );
    expect(await screen.findByText("No reliable answer found")).toBeInTheDocument();
    expect(screen.getByText("Sana Iqbal")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Report a knowledge gap" }));
    expect(
      await screen.findByText("Reported. Platform knowledge owners notified"),
    ).toBeInTheDocument();
  });

  it("refuses pay and performance questions", async () => {
    const user = userEvent.setup();
    render("/knowledge");

    await user.type(
      await screen.findByRole("textbox", { name: "Ask Context Bot" }),
      "What is the salary band for my level?{Enter}",
    );
    expect(await screen.findByText("Restricted information")).toBeInTheDocument();
    expect(screen.getByText("Elena Brooks")).toBeInTheDocument();
  });

  it("hides suggested questions when they are turned off in Settings", async () => {
    mockServer.use(
      http.get(buildApiUrl("/v1/me/assistant-preferences"), () =>
        HttpResponse.json({ openBesideLessons: true, showSuggestions: false }),
      ),
    );
    render("/knowledge");

    expect(
      await screen.findByText("Hi Maya, what would you like to understand?"),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Suggested for you")).not.toBeInTheDocument());
  });

  it("follows the page's context and pauses during a knowledge check", async () => {
    render("/roadmap/checks/m4-check");

    expect(await screen.findByText("Knowledge check in progress")).toBeInTheDocument();
    expect(screen.getByText("Paused while your knowledge check is open")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Ask Context Bot" })).toBeDisabled(),
    );
    expect(screen.queryByText("Suggested for you")).not.toBeInTheDocument();
  });
});
