import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ConversationsPage } from "@/features/conversations/pages/conversations-page";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const PROJECT = "11111111-1111-4111-8111-111111111111";
const answer = (id: string, question: string) => ({
  id,
  projectId: PROJECT,
  question,
  answer: `Answer to ${question}`,
  confidence: "medium",
  rationale: null,
  currentState: null,
  timelineContext: null,
  uncertainties: [],
  citations: [],
  relatedItems: [],
  model: "gemini",
  createdAt: "2026-10-15T10:00:00.000Z",
});

function mockApi() {
  const reads: string[] = [];
  mockServer.use(
    http.get(buildApiUrl("/v1/users"), () =>
      HttpResponse.json({
        total: 2,
        items: [
          { id: "mia", name: "Mia Chen", email: null, role: "member", status: "active" },
          { id: "leo", name: "Leo Park", email: null, role: "member", status: "offboarded" },
        ],
      }),
    ),
    http.get(buildApiUrl("/v1/people/:id/conversations"), ({ params }) => {
      reads.push(String(params.id));
      const q1 = "22222222-2222-4222-8222-222222222222";
      const q2 = "33333333-3333-4333-8333-333333333333";
      return HttpResponse.json({
        person: { id: params.id, name: params.id === "mia" ? "Mia Chen" : "Leo Park" },
        items:
          params.id === "mia"
            ? [
                {
                  id: q1,
                  question: "Who owns billing?",
                  answer: answer(q1, "Who owns billing?"),
                  project: { id: PROJECT, name: "Billing" },
                  thread: { id: "44444444-4444-4444-8444-444444444444", title: "Billing owners" },
                  helpful: false,
                  askedAt: "2026-10-15T10:00:00.000Z",
                },
                {
                  id: q2,
                  question: "What is our refund policy?",
                  answer: answer(q2, "What is our refund policy?"),
                  project: { id: PROJECT, name: "Billing" },
                  thread: null,
                  helpful: null,
                  askedAt: "2026-10-14T10:00:00.000Z",
                },
              ]
            : [],
      });
    }),
  );
  return reads;
}

describe("ConversationsPage", () => {
  it("shows what the chosen person asked, with project, conversation and rating", async () => {
    const reads = mockApi();
    renderWithProviders(<ConversationsPage />, { route: "/conversations?person=mia" });
    const list = await screen.findByRole("list", { name: "Questions" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Who owns billing?");
    expect(items[0]).toHaveTextContent("Answer to Who owns billing?");
    expect(items[0]).toHaveTextContent("Conversation “Billing owners”");
    expect(items[0]).toHaveTextContent("Rated not helpful");
    expect(within(items[0]!).getByRole("link", { name: "Billing" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT}`,
    );
    expect(reads).toEqual(["mia"]);
  });

  it("reads nobody's conversations until a person is chosen, then says when there are none", async () => {
    const reads = mockApi();
    const user = userEvent.setup();
    renderWithProviders(<ConversationsPage />, { route: "/conversations" });
    expect(screen.queryByRole("list", { name: "Questions" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("combobox", { name: "Person" }));
    await user.click(await screen.findByRole("option", { name: "Leo Park" }));
    expect(
      await screen.findByText(/Leo Park hasn’t asked Context Bot anything yet/),
    ).toBeInTheDocument();
    expect(reads).toEqual(["leo"]);
  });
});
