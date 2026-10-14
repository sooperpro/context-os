import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantContext, type AssistantContextValue } from "@/components/layout/assistant-context";
import { ProjectsPage } from "@/features/projects/pages/projects-page";
import { jsonResponse, renderWithProviders } from "@/test/utils";

const project = (id: string, name: string, sources: number, ready: number) => ({
  id,
  workspaceId: "99999999-9999-4999-8999-999999999999",
  name,
  description: `${name} description`,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  stats: { sources, readySources: ready, contextItems: 4, questions: 1, lastProcessedAt: null },
});

const assistant: AssistantContextValue = {
  open: false,
  openAssistant: vi.fn(),
  closeAssistant: vi.fn(),
  toggleAssistant: vi.fn(),
  subscribeToQueries: () => () => undefined,
};

function renderPage() {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    jsonResponse({
      items: [
        project("11111111-1111-4111-8111-111111111111", "Billing migration", 3, 3),
        project("22222222-2222-4222-8222-222222222222", "Ingest gateway", 2, 1),
        project("33333333-3333-4333-8333-333333333333", "Empty project", 0, 0),
      ],
    }),
  );
  return renderWithProviders(
    <AssistantContext value={assistant}>
      <ProjectsPage />
    </AssistantContext>,
  );
}

describe("ProjectsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows counts in the kicker and a status on every card", async () => {
    renderPage();
    expect(await screen.findByText("3 projects · 5 sources")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByText("No sources yet")).toBeInTheDocument();
  });

  it("filters cards by name and clears the search", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "Billing migration" });
    await user.type(screen.getByLabelText("Search projects"), "ingest");
    expect(screen.getByRole("link", { name: "Ingest gateway" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Billing migration" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Search projects"), "zzz");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("link", { name: "Billing migration" })).toBeInTheDocument();
  });

  it("opens Context Bot from the page actions", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Ask Context Bot" }));
    expect(assistant.openAssistant).toHaveBeenCalled();
  });
});
