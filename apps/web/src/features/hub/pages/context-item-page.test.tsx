import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  AssistantContext,
  type AssistantContextValue,
} from "@/components/layout/assistant-context";
import { ContextItemPage } from "@/features/hub/pages/context-item-page";
import { KnowledgeHubPage } from "@/features/knowledge/pages/knowledge-hub-page";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const PROJECT = "11111111-1111-4111-8111-111111111111";
const SOURCE = "4fd5c1b6-3f9a-4a2b-9c6e-2e0b1f1a9c14";
const ids = {
  decision: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  ledger: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  sana: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  other: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
};
const at = "2026-10-01T00:00:00.000Z";

const evidence = (id: string) => ({
  id,
  sourceObjectId: SOURCE,
  chunkId: null,
  sourceTitle: "Kestrel design doc",
  sourceKind: "document",
  sourceUrl: "https://docs.example.com/kestrel",
  sourceCreatedAt: at,
  quote: "We will publish a billing event for every metered action.",
  quoteVerified: true,
});

const base = (id: string, kind: string, title: string, data: object, extra: object = {}) => ({
  id,
  projectId: PROJECT,
  kind,
  title,
  summary: `${title} summary`,
  data,
  eventAt: null,
  asOf: null,
  verification: "inferred",
  confidence: "high",
  conflictsWith: [],
  evidence: [],
  createdAt: at,
  updatedAt: at,
  ...extra,
});

const items = [
  base(
    ids.decision,
    "decision",
    "Billing events on Kafka",
    {
      rationale: "Invoices lagged usage by a day.",
      alternatives: ["Keep the nightly export"],
      participants: ["Sana Iqbal"],
      consequences: null,
      decisionStatus: "decided",
    },
    {
      evidence: [evidence("cccccccc-cccc-4ccc-8ccc-ccccccccccc1")],
      eventAt: "2026-03-18T00:00:00.000Z",
    },
  ),
  base(
    ids.ledger,
    "component",
    "Ledger service",
    { componentType: "service" },
    { evidence: [evidence("cccccccc-cccc-4ccc-8ccc-ccccccccccc2")] },
  ),
  base(ids.sana, "person", "Sana Iqbal", { role: "Staff engineer", owns: ["Ledger service"] }),
  base(ids.other, "term", "Dual-write", {
    definition: "Writing to both systems during migration.",
  }),
];

function liveProject() {
  mockServer.use(
    http.get(buildApiUrl(`/v1/projects/${PROJECT}/hub`), () =>
      HttpResponse.json({
        project: {
          id: PROJECT,
          workspaceId: "99999999-9999-4999-8999-999999999999",
          name: "Project Kestrel",
          description: null,
          createdAt: at,
          updatedAt: at,
          stats: {
            sources: 1,
            readySources: 1,
            contextItems: 4,
            questions: 0,
            lastProcessedAt: at,
          },
        },
        overview: null,
        sync: { state: "idle", queued: 0, running: 0, failed: 0, lastCompletedAt: at },
        counts: {
          decision: 1,
          event: 0,
          status_claim: 0,
          person: 1,
          component: 1,
          dependency: 0,
          term: 1,
        },
      }),
    ),
    http.get(buildApiUrl(`/v1/projects/${PROJECT}/context-items`), () =>
      HttpResponse.json({ items }),
    ),
    http.get(buildApiUrl("/v1/projects"), () =>
      HttpResponse.json({
        items: [
          {
            id: PROJECT,
            workspaceId: "99999999-9999-4999-8999-999999999999",
            name: "Project Kestrel",
            description: null,
            createdAt: at,
            updatedAt: at,
            stats: {
              sources: 1,
              readySources: 1,
              contextItems: 4,
              questions: 0,
              lastProcessedAt: at,
            },
          },
        ],
      }),
    ),
    http.get(buildApiUrl("/v1/users"), () => HttpResponse.json({ items: [] })),
    http.get(buildApiUrl("/v1/org/teams"), () => HttpResponse.json({ items: [] })),
  );
}

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
        <Route path="/projects/:projectId/items/:itemId" element={<ContextItemPage />} />
        <Route path="/knowledge" element={<KnowledgeHubPage />} />
      </Routes>
    </AssistantContext>,
    { route },
  );
  return assistant;
}

describe("Knowledge item page", () => {
  it("shows the item, its facts, evidence, experts and connected knowledge", async () => {
    liveProject();
    const user = userEvent.setup();
    const assistant = renderAt(`/projects/${PROJECT}/items/${ids.decision}`);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Billing events on Kafka" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Decisions" })).toHaveAttribute(
      "href",
      "/knowledge?cat=decision",
    );
    const facts = screen.getByRole("region", { name: "Key facts" });
    expect(within(facts).getByText("Deciders")).toBeInTheDocument();
    expect(within(facts).getByText("Project Kestrel")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Where this comes from/ })).toHaveTextContent(
      "We will publish a billing event",
    );
    expect(screen.getByRole("region", { name: "Owners & experts" })).toHaveTextContent(
      "Sana IqbalStaff engineer",
    );

    const related = screen.getByRole("region", { name: "Connected knowledge" });
    expect(within(related).getByRole("link", { name: /Ledger service/ })).toHaveAttribute(
      "href",
      `/projects/${PROJECT}/items/${ids.ledger}`,
    );
    expect(within(related).getByRole("link", { name: /Ledger service/ })).toHaveTextContent(
      "Same source",
    );

    await user.click(screen.getByRole("button", { name: "Ask about this" }));
    expect(assistant.openAssistant).toHaveBeenCalledWith("Summarize “Billing events on Kafka”");
  });

  it("saves an item and lists it under Saved in the Knowledge Hub", async () => {
    liveProject();
    const user = userEvent.setup();
    renderAt(`/projects/${PROJECT}/items/${ids.ledger}`);

    const save = await screen.findByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true"),
    );

    await user.click(screen.getByRole("link", { name: "Knowledge Hub" }));
    const savedCard = await screen.findByRole("region", { name: /Saved/ });
    expect(await within(savedCard).findByRole("link", { name: /Ledger service/ })).toHaveAttribute(
      "href",
      `/projects/${PROJECT}/items/${ids.ledger}`,
    );
  });

  it("explains when an item is missing", async () => {
    liveProject();
    renderAt(`/projects/${PROJECT}/items/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Item not found" }),
    ).toBeInTheDocument();
  });
});
