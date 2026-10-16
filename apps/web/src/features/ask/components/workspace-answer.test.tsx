import type { AssistantAnswer } from "@contextos/shared";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceAnswer } from "@/features/ask/components/workspace-answer";
import { renderWithProviders } from "@/test/utils";

const answer: AssistantAnswer = {
  id: "wa-1",
  question: "How does expense approval work?",
  createdAt: "2026-10-14T09:00:00.000Z",
  outcome: "answered",
  confidence: { level: "verified", label: "Verified · 1 source" },
  blocks: [
    {
      type: "paragraph",
      text: "### Expense approval\n\n* **Submission**: in `Expensify` within 30 days [1].\n* *Finance* approves large claims [1].",
    },
  ],
  note: "Documented in passage [1].",
  people: [],
  sources: [
    {
      title: "Expense approval process",
      system: "ContextOS",
      provider: null,
      detail: "Company handbook",
      url: null,
      to: null,
      stale: null,
    },
  ],
  searched: [],
  followups: [],
  related: [],
};

describe("WorkspaceAnswer", () => {
  it("formats the answer's Markdown and turns citations into chips", () => {
    const { container } = renderWithProviders(
      <WorkspaceAnswer answer={answer} last={false} onAsk={vi.fn()} />,
    );

    expect(screen.getByRole("heading", { name: "Expense approval" })).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Submission: in Expensify within 30 days");
    expect(within(items[0]!).getByText("Submission").tagName).toBe("STRONG");
    expect(within(items[0]!).getByText("Expensify").tagName).toBe("CODE");
    expect(within(items[1]!).getByText("Finance").tagName).toBe("EM");
    // Two chips in the list and one in the note, all opening source 1.
    expect(screen.getAllByRole("button", { name: /Open source 1: Expense approval/ })).toHaveLength(
      3,
    );
    expect(container).not.toHaveTextContent(/[*#`]|\[1\]/);
  });
});
