import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  AssistantContext,
  type AssistantContextValue,
} from "@/components/layout/assistant-context";
import { MyLearningPage } from "@/features/learning/pages/my-learning-page";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

function renderAs(role: string) {
  mockServer.use(
    http.get(buildApiUrl("/v1/workspaces/current"), () =>
      HttpResponse.json({ id: "ws", name: "Tessellate", role, authentication: "development" }),
    ),
    http.get(buildApiUrl("/v1/users/me"), () =>
      HttpResponse.json({
        id: "u1",
        name: "Elena Brooks",
        email: null,
        role,
        workspaceId: "ws",
        preferences: {},
      }),
    ),
    http.get(buildApiUrl("/v1/me/learning"), () =>
      HttpResponse.json({
        onboardingFinishedOn: null,
        assigned: [],
        suggested: [
          {
            id: "tutorial-t1",
            title: "Running a fair probation review",
            kind: "review",
            reason: "A tutorial on People Ops for everyone",
            minutes: 20,
          },
        ],
        completed: [],
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
        <Route path="/learning" element={<MyLearningPage />} />
      </Routes>
    </AssistantContext>,
    { route: "/learning" },
  );
}

describe("My learning", () => {
  it("is People Ops' own page too: their courses, and a way back to everyone onboarding", async () => {
    renderAs("hr");

    expect(
      await screen.findByRole("heading", { level: 1, name: "My learning" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Running a fair probation review")).toBeInTheDocument();
    expect(screen.getByText("From published courses")).toBeInTheDocument();
    expect(screen.getByText(/what might help you\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Everyone onboarding" })).toHaveAttribute(
      "href",
      "/onboarding",
    );
    expect(screen.queryByText("From your team’s activity")).not.toBeInTheDocument();
  });

  it("keeps managers' wording about their team", async () => {
    renderAs("manager");

    expect(await screen.findByText("From your team’s activity")).toBeInTheDocument();
    expect(screen.getByText(/what might help your team\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Your team’s onboarding" })).toHaveAttribute(
      "href",
      "/team",
    );
  });
});
