import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AssistantContext,
  type AssistantContextValue,
} from "@/components/layout/assistant-context";
import { KnowledgeHubPage } from "@/features/knowledge/pages/knowledge-hub-page";
import { jsonResponse, renderWithProviders } from "@/test/utils";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";
const project = (
  id: string,
  name: string,
  sources: number,
  updated: string | null,
  category?: string,
) => ({
  id,
  ...(category ? { category } : {}),
  workspaceId: "99999999-9999-4999-8999-999999999999",
  slug: null,
  name,
  description: `${name} description`,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  stats: {
    sources,
    readySources: sources,
    contextItems: 2,
    questions: 0,
    lastProcessedAt: updated,
  },
});
const item = (id: string, projectId: string, kind: string, title: string, data: object) => ({
  id,
  projectId,
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
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
});
const decision = {
  rationale: null,
  alternatives: [],
  participants: [],
  consequences: null,
  decisionStatus: "decided",
};

const urlOf = (input: RequestInfo | URL) =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

function mockApi({ role, empty }: { role?: string; empty?: boolean } = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = urlOf(input);
    if (url.endsWith("/v1/workspaces/current") && role)
      return Promise.resolve(
        jsonResponse({ id: "ws", name: "Tessellate", role, authentication: "development" }),
      );
    if (url.endsWith("/v1/projects") && empty) return Promise.resolve(jsonResponse({ items: [] }));
    if (url.endsWith("/v1/projects"))
      return Promise.resolve(
        jsonResponse({
          items: [
            project(P1, "Kestrel", 3, "2026-10-12T00:00:00.000Z"),
            project(P2, "Ledger", 1, "2026-10-13T00:00:00.000Z"),
            project(P3, "Tessellate Track", 2, null, "product"),
          ],
        }),
      );
    if (url.includes(`/v1/projects/${P1}/context-items`))
      return Promise.resolve(
        jsonResponse({
          items: [
            item(
              "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
              P1,
              "decision",
              "Move billing to events",
              decision,
            ),
            item("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", P1, "term", "Dual-write", {
              definition: "Writing to both",
            }),
          ],
        }),
      );
    if (url.includes(`/v1/projects/${P2}/context-items`))
      return Promise.resolve(
        jsonResponse({
          items: [
            item("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", P2, "component", "Ledger service", {
              componentType: "service",
            }),
          ],
        }),
      );
    if (url.includes(`/v1/projects/${P3}/context-items`))
      return Promise.resolve(jsonResponse({ items: [] }));
    if (url.includes("/v1/users?"))
      return Promise.resolve(
        jsonResponse({
          items: [{ id: "u1", name: "Maya Okafor", role: "member", status: "active" }],
        }),
      );
    if (url.includes("/v1/org/teams"))
      return Promise.resolve(
        jsonResponse({
          items: [{ id: "t1", departmentId: "d1", parentId: null, name: "Platform" }],
        }),
      );
    return Promise.resolve(
      jsonResponse({ error: { code: "NOT_FOUND", message: url } }, { status: 404 }),
    );
  });
}

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

function renderHub(route = "/knowledge") {
  return renderWithProviders(
    <AssistantContext value={assistant}>
      <Routes>
        <Route path="/knowledge" element={<KnowledgeHubPage />} />
      </Routes>
    </AssistantContext>,
    { route },
  );
}

describe("KnowledgeHubPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows counts, recently updated projects first, and browse collections from real items", async () => {
    mockApi();
    renderHub();
    expect(await screen.findByText("3 items across 3 projects · 6 sources")).toBeInTheDocument();
    const start = screen.getByRole("heading", { name: /Start here/ }).closest("section")!;
    const titles = within(start)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(titles[0]).toBe("Ledger");
    expect(await screen.findByRole("link", { name: "Move billing to events" })).toHaveAttribute(
      "href",
      `/projects/${P1}/items/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1`,
    );
    expect(screen.getByRole("link", { name: "Ledger service" })).toHaveAttribute(
      "href",
      `/projects/${P2}/items/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3`,
    );
  });

  it("filters by collection and searches across projects and items", async () => {
    mockApi();
    const user = userEvent.setup();
    renderHub();
    await screen.findByRole("link", { name: "Move billing to events" });
    await user.click(screen.getByRole("button", { name: "Glossary & FAQs" }));
    expect(await screen.findByText("Glossary & FAQs · 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Dual-write/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All" }));
    await user.type(screen.getByLabelText("Search the Knowledge Hub"), "ledger");
    expect(await screen.findByText(/2 results for "ledger"/)).toBeInTheDocument();
  });

  it("lists the reference's collections in order, sorts projects by category and links Teams & people", async () => {
    mockApi();
    const user = userEvent.setup();
    renderHub();
    const chips = within(screen.getByRole("group", { name: "Filter by type" })).getAllByRole(
      "button",
    );
    expect(chips.map((chip) => chip.textContent?.trim())).toEqual([
      "All",
      "Company",
      "Products",
      "Projects",
      "Systems",
      "Processes",
      "Decisions",
      "Glossary & FAQs",
    ]);
    expect(await screen.findByRole("link", { name: /Teams & people/ })).toHaveAttribute(
      "href",
      "/people?view=teams",
    );
    expect(screen.getByRole("link", { name: "Platform" })).toHaveAttribute(
      "href",
      "/people?view=teams",
    );

    await user.click(screen.getByRole("button", { name: "Products" }));
    expect(await screen.findByRole("link", { name: /Tessellate Track/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Company" }));
    expect(await screen.findByText("No company pages yet.")).toBeInTheDocument();
  });

  it.each([
    { role: "owner", canCreate: true },
    { role: "admin", canCreate: true },
    { role: "manager", canCreate: true },
    { role: "hr", canCreate: false },
    { role: "member", canCreate: false },
    { role: "guest", canCreate: false },
  ])("New project button for $role: shown = $canCreate", async ({ role, canCreate }) => {
    const fetchSpy = mockApi({ role });
    renderHub();
    await screen.findByRole("link", { name: "Move billing to events" });
    // The role has to have loaded before an absent button means anything.
    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([input]) => urlOf(input).endsWith("/v1/workspaces/current")),
      ).toBe(true),
    );
    if (canCreate) {
      expect(await screen.findByRole("button", { name: "New project" })).toBeInTheDocument();
    } else {
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByRole("button", { name: "New project" })).not.toBeInTheDocument();
    }
  });

  it("tells people who can't create projects who can, instead of offering a button", async () => {
    mockApi({ role: "hr", empty: true });
    renderHub();
    expect(await screen.findByText(/An admin or manager can create a project/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create your first project" }),
    ).not.toBeInTheDocument();
  });

  it("offers owners a button to create the first project", async () => {
    mockApi({ role: "owner", empty: true });
    renderHub();
    expect(
      await screen.findByRole("button", { name: "Create your first project" }),
    ).toBeInTheDocument();
  });

  it("offers Context Bot when nothing matches", async () => {
    mockApi();
    const user = userEvent.setup();
    renderHub();
    await screen.findByRole("link", { name: "Move billing to events" });
    await user.type(screen.getByLabelText("Search the Knowledge Hub"), "zzz");
    const empty = (await screen.findByText('Nothing in the Knowledge Hub matches "zzz"')).closest(
      "[data-slot=card]",
    )!;
    await user.click(within(empty as HTMLElement).getByRole("button", { name: "Ask Context Bot" }));
    expect(assistant.openAssistant).toHaveBeenCalledWith("zzz");
  });
});
