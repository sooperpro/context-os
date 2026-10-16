import type { ContextItem } from "@contextos/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContextItemCard } from "@/features/hub/components/context-item-card";
import { SourceDrawerContext } from "@/features/sources/components/source-drawer-context";
import { jsonResponse, renderWithProviders } from "@/test/utils";

const decision: ContextItem = {
  id: "4fd5c1b6-3f9a-4a2b-9c6e-2e0b1f1a9c11",
  projectId: "4fd5c1b6-3f9a-4a2b-9c6e-2e0b1f1a9c12",
  kind: "decision",
  title: "Move billing into a dedicated ledger service",
  summary: "Billing moves out of the monolith.",
  data: {
    rationale: "Audit requirements",
    alternatives: ["Keep billing in the monolith"],
    participants: ["Priya Shah"],
    consequences: null,
    decisionStatus: "decided",
  },
  eventAt: "2026-03-04T00:00:00.000Z",
  asOf: null,
  verification: "inferred",
  confidence: "high",
  conflictsWith: [],
  evidence: [
    {
      id: "4fd5c1b6-3f9a-4a2b-9c6e-2e0b1f1a9c13",
      sourceObjectId: "4fd5c1b6-3f9a-4a2b-9c6e-2e0b1f1a9c14",
      chunkId: null,
      sourceTitle: "ADR-0007",
      sourceKind: "document",
      sourceUrl: null,
      sourceCreatedAt: "2026-03-04T10:00:00.000Z",
      quote: "We will move billing into a dedicated ledger service.",
      quoteVerified: true,
    },
  ],
  createdAt: "2026-03-05T00:00:00.000Z",
  updatedAt: "2026-03-05T00:00:00.000Z",
};

describe("ContextItemCard", () => {
  it("shows the claim, its evidence and opens the source drawer from a quote", async () => {
    const open = vi.fn();
    renderWithProviders(
      <SourceDrawerContext value={{ open }}>
        <ContextItemCard projectId={decision.projectId} item={decision} />
      </SourceDrawerContext>,
    );

    expect(screen.getByText("Move billing into a dedicated ledger service")).toBeInTheDocument();
    expect(screen.getByText("Decided")).toBeInTheDocument();
    expect(screen.getByText("Audit requirements")).toBeInTheDocument();
    expect(screen.getByText(/We will move billing/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "ADR-0007" }));
    expect(open).toHaveBeenCalledWith({
      sourceId: decision.evidence[0]?.sourceObjectId,
      evidenceId: decision.evidence[0]?.id,
      quote: decision.evidence[0]?.quote,
    });
  });

  /** Answers by URL: the viewer, their ownership, and the verification change. */
  const api = (owns: Array<{ scopeType: string; scopeId: string }>) =>
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/v1/workspaces/current"))
        return Promise.resolve(
          jsonResponse({
            id: "w1",
            name: "Tessellate",
            role: "member",
            authentication: "development",
          }),
        );
      if (url.includes("/v1/users/me"))
        return Promise.resolve(
          jsonResponse({
            id: "u1",
            name: "Maya Okafor",
            email: null,
            role: "member",
            workspaceId: "w1",
            preferences: {},
          }),
        );
      if (url.includes("/v1/people/u1"))
        return Promise.resolve(
          jsonResponse({
            id: "u1",
            name: "Maya Okafor",
            role: "member",
            assignments: owns.map((scope, index) => ({
              id: `a${index}`,
              type: "domain_owner",
              ...scope,
            })),
          }),
        );
      return Promise.resolve(jsonResponse({ ...decision, verification: "confirmed" }));
    });

  it("lets the project's domain owner send a verification change", async () => {
    const fetchSpy = api([{ scopeType: "project", scopeId: decision.projectId }]);
    renderWithProviders(
      <SourceDrawerContext value={{ open: vi.fn() }}>
        <ContextItemCard projectId={decision.projectId} item={decision} />
      </SourceDrawerContext>,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/v1/projects/${decision.projectId}/context-items/${decision.id}/verification`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ verification: "confirmed" }),
      }),
    );
  });

  it("hides Confirm, Mark stale and Dispute from anyone who doesn't own the project", async () => {
    const fetchSpy = api([{ scopeType: "project", scopeId: "another-project" }]);
    renderWithProviders(
      <SourceDrawerContext value={{ open: vi.fn() }}>
        <ContextItemCard projectId={decision.projectId} item={decision} />
      </SourceDrawerContext>,
    );
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/v1/people/u1"),
        expect.anything(),
      ),
    );
    expect(screen.queryByRole("group", { name: "Verification" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
  });
});
