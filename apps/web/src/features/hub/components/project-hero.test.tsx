import type { Hub } from "@contextos/shared";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AssistantContext,
  type AssistantContextValue,
} from "@/components/layout/assistant-context";
import { ProjectHero } from "@/features/hub/components/project-hero";
import { renderWithProviders } from "@/test/utils";

const hub: Hub = {
  project: {
    id: "11111111-1111-4111-8111-111111111111",
    workspaceId: "99999999-9999-4999-8999-999999999999",
    name: "Project Kestrel",
    slug: "project-kestrel",
    description: "Move billing from nightly exports to real-time events.",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    stats: {
      sources: 6,
      readySources: 6,
      contextItems: 24,
      questions: 3,
      lastProcessedAt: "2026-10-14T00:00:00.000Z",
    },
  },
  overview: null,
  sync: {
    state: "idle",
    queued: 0,
    running: 0,
    failed: 0,
    lastCompletedAt: "2026-10-14T00:00:00.000Z",
  },
  counts: {
    decision: 4,
    event: 6,
    status_claim: 5,
    person: 3,
    component: 2,
    dependency: 2,
    term: 2,
  },
};

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

describe("ProjectHero", () => {
  it("shows the project's type, sync state, facts and hands a question to Context Bot", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AssistantContext value={assistant}>
        <ProjectHero hub={hub} />
      </AssistantContext>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Project Kestrel" })).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText(/6 sources · 6 ready/)).toBeInTheDocument();
    expect(screen.getByText(/Synced/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ask about Project Kestrel/ }));
    expect(assistant.openAssistant).toHaveBeenCalledWith(
      expect.stringContaining("Project Kestrel"),
    );
  });
});
