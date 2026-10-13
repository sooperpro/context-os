import type { ContextItem } from "@contextos/shared";
import { screen } from "@testing-library/react";
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
      quote: decision.evidence[0]?.quote,
    });
  });

  it("sends a verification change to the API", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ ...decision, verification: "confirmed" }));
    renderWithProviders(
      <SourceDrawerContext value={{ open: vi.fn() }}>
        <ContextItemCard projectId={decision.projectId} item={decision} />
      </SourceDrawerContext>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/v1/projects/${decision.projectId}/context-items/${decision.id}/verification`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ verification: "confirmed" }),
      }),
    );
  });
});
