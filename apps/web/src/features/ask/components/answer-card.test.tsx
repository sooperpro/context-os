import type { Answer } from "@contextos/shared";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AnswerCard } from "@/features/ask/components/answer-card";
import { SourceDrawerContext } from "@/features/sources/components/source-drawer-context";
import { renderWithProviders } from "@/test/utils";

const answer: Answer = {
  id: "55555555-5555-4555-8555-555555555555",
  projectId: "11111111-1111-4111-8111-111111111111",
  question: "Why events?",
  answer: "Nightly exports were too slow [1], and the 2026 tiers depend on real-time usage [2].",
  confidence: "high",
  rationale: null,
  currentState: { statement: "Dual-write is in progress.", asOf: "2026-10-01T00:00:00.000Z" },
  timelineContext: null,
  uncertainties: ["Rollback steps are not documented."],
  citations: [
    {
      ref: 1,
      chunkId: "22222222-2222-4222-8222-222222222222",
      sourceObjectId: "33333333-3333-4333-8333-333333333333",
      sourceTitle: "Kestrel rollout plan",
      sourceKind: "document",
      sourceUrl: null,
      sourceCreatedAt: null,
      excerpt: "exports fail silently",
      claim: "exports were slow",
    },
    {
      ref: 2,
      chunkId: "22222222-2222-4222-8222-222222222223",
      sourceObjectId: "44444444-4444-4444-8444-444444444444",
      sourceTitle: "ADR-042",
      sourceKind: "document",
      sourceUrl: "https://example.test/adr",
      sourceCreatedAt: "2026-03-18T00:00:00.000Z",
      excerpt: "tiers depend on events",
      claim: "tiers depend on it",
    },
  ],
  relatedItems: [
    { id: "66666666-6666-4666-8666-666666666666", kind: "decision", title: "ADR-042" },
  ],
  model: "gemini",
  createdAt: "2026-10-14T00:00:00.000Z",
};

describe("AnswerCard", () => {
  it("shows the confidence with the source count, numbered citations and opens the drawer from a cite", async () => {
    const open = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <SourceDrawerContext value={{ open }}>
        <AnswerCard answer={answer} />
      </SourceDrawerContext>,
    );
    expect(screen.getByText("Verified · 2 sources agree")).toBeInTheDocument();
    expect(screen.getByText("Rollback steps are not documented.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open source 2: ADR-042" }));
    expect(open).toHaveBeenCalledWith({
      sourceId: answer.citations[1]?.sourceObjectId,
      quote: "tiers depend on events",
    });
    // Base UI renders the anchor with role="button"; the href still points at the source.
    expect(screen.getByRole("button", { name: "Open ADR-042 in its source" })).toHaveAttribute(
      "href",
      "https://example.test/adr",
    );
  });

  it("formats Markdown in every part of the answer the model writes", () => {
    const { container } = renderWithProviders(
      <SourceDrawerContext value={{ open: vi.fn() }}>
        <AnswerCard
          answer={{
            ...answer,
            rationale: "Two sources **agree** [1].",
            currentState: { statement: "`Dual-write` is **on** [1].", asOf: null },
            timelineContext: "Started in *March* [2].",
            uncertainties: ["Rollback for `ledger` is **undocumented**."],
            citations: answer.citations.map((citation) => ({
              ...citation,
              claim: `**${citation.claim}** [${citation.ref}]`,
            })),
          }}
        />
      </SourceDrawerContext>,
    );
    expect(screen.getByText("Dual-write").tagName).toBe("CODE");
    expect(screen.getByText("March").tagName).toBe("EM");
    expect(screen.getByText("undocumented").tagName).toBe("STRONG");
    expect(screen.getByText("exports were slow").tagName).toBe("STRONG");
    expect(container).not.toHaveTextContent(/[*`]/);
  });

  it("cites the ContextOS directory: who someone is, with their profile as the source", () => {
    const open = vi.fn();
    renderWithProviders(
      <SourceDrawerContext value={{ open }}>
        <AnswerCard
          answer={{
            ...answer,
            question: "Who is Rahul?",
            answer: "Rahul Agarwal is the Engineering Manager of the Platform team [1].",
            currentState: null,
            uncertainties: [],
            citations: [],
            relatedItems: [],
            directory: [
              {
                ref: 1,
                kind: "person",
                id: "rahul",
                title: "Rahul Agarwal",
                detail: "Engineering Manager · Platform team",
                to: "/people/rahul",
              },
            ],
          }}
        />
      </SourceDrawerContext>,
    );
    expect(screen.getByText("Verified · from the ContextOS directory")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open source 1: Rahul Agarwal" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rahul Agarwal" })).toHaveAttribute(
      "href",
      "/people/rahul",
    );
    expect(
      screen.getByText("ContextOS directory · Engineering Manager · Platform team"),
    ).toBeInTheDocument();
  });
});
