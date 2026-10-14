import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AskPage } from "@/features/ask/pages/ask-page";
import { jsonResponse, renderWithProviders } from "@/test/utils";

vi.mock("@/features/ask/components/answer-card", () => ({
  AnswerCard: ({ answer }: { answer: { answer: string } }) => <article>{answer.answer}</article>,
}));

const PROJECT = "11111111-1111-4111-8111-111111111111";
const THREAD = "66666666-6666-4666-8666-666666666666";
const thread = { id: THREAD, projectId: PROJECT, sourceId: null, title: "Why events?", createdAt: "2026-10-14T00:00:00.000Z" };
const answer = {
  id: "55555555-5555-4555-8555-555555555555",
  projectId: PROJECT,
  question: "Why events?",
  answer: "Because nightly exports were too slow.",
  confidence: "high",
  rationale: null,
  currentState: null,
  timelineContext: null,
  uncertainties: [],
  citations: [],
  relatedItems: [],
  model: "gemini",
  createdAt: "2026-10-14T00:00:00.000Z",
};

function mockApi() {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    if (url.endsWith("/v1/ask/threads") && method === "GET") return Promise.resolve(jsonResponse({ items: [] }));
    if (url.endsWith("/v1/ask/threads") && method === "POST") return Promise.resolve(jsonResponse(thread, { status: 201 }));
    if (url.endsWith(`/v1/ask/threads/${THREAD}`)) return Promise.resolve(jsonResponse({ ...thread, messages: [] }));
    if (url.endsWith(`/v1/ask/threads/${THREAD}/messages`))
      return Promise.resolve(
        new Response(`event: status\ndata: {"state":"retrieving"}\n\nevent: answer\ndata: ${JSON.stringify(answer)}\n\nevent: done\ndata: {}\n\n`, {
          headers: { "Content-Type": "text/event-stream" },
        }),
      );
    return Promise.resolve(jsonResponse({ error: { code: "NOT_FOUND", message: url } }, { status: 404 }));
  });
  return calls;
}

describe("AskPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates a conversation from the first question and shows the streamed answer", async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/projects/:projectId/ask" element={<AskPage />} />
      </Routes>,
      { route: `/projects/${PROJECT}/ask` },
    );
    expect(await screen.findByText("Start a conversation")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Question"), "Why events?");
    await user.click(screen.getByRole("button", { name: /Ask/ }));

    expect(await screen.findByText("Because nightly exports were too slow.")).toBeInTheDocument();
    expect(calls.find((call) => call.method === "POST" && call.url.endsWith("/v1/ask/threads"))?.body).toEqual({
      projectId: PROJECT,
      title: "Why events?",
    });
    await waitFor(() => expect(document.querySelector('[aria-current="true"]')).toHaveTextContent("Why events?"));
  });
});
