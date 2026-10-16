import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AssistantContext,
  type AssistantContextValue,
} from "@/components/layout/assistant-context";
import { AssistantPanel } from "@/features/ask/components/assistant-panel";
import { SourceDrawerContext } from "@/features/sources/components/source-drawer-context";
import { jsonResponse, renderWithProviders } from "@/test/utils";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const THREAD = "66666666-6666-4666-8666-666666666666";
const hub = {
  project: {
    id: PROJECT,
    workspaceId: "99999999-9999-4999-8999-999999999999",
    slug: null,
    name: "Kestrel",
    description: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    stats: { sources: 4, readySources: 4, contextItems: 9, questions: 0, lastProcessedAt: null },
  },
  overview: null,
  sync: { state: "idle", queued: 0, running: 0, failed: 0, lastCompletedAt: null },
  counts: {
    decision: 0,
    event: 0,
    status_claim: 0,
    person: 0,
    component: 0,
    dependency: 0,
    term: 0,
    company: 0,
    product: 0,
    initiative: 0,
    process: 0,
  },
};
const answer = (id: string, confidence: string, text: string) => ({
  id,
  projectId: PROJECT,
  question: "Why events?",
  answer: text,
  confidence,
  rationale: null,
  currentState: null,
  timelineContext: null,
  uncertainties: [],
  citations: [],
  relatedItems: [],
  model: "gemini",
  createdAt: "2026-10-14T00:00:00.000Z",
});

function mockApi(streamed: object | "error") {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  let messages: object[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    if (url.endsWith("/v1/users/me"))
      return Promise.resolve(
        jsonResponse({
          id: "u1",
          name: "Maya Okafor",
          email: null,
          role: "member",
          workspaceId: "w",
          preferences: {},
        }),
      );
    if (url.endsWith(`/v1/projects/${PROJECT}/hub`)) return Promise.resolve(jsonResponse(hub));
    if (url.endsWith("/v1/ask/threads") && method === "POST")
      return Promise.resolve(
        jsonResponse(
          {
            id: THREAD,
            projectId: PROJECT,
            sourceId: null,
            title: "Why events?",
            createdAt: "2026-10-14T00:00:00.000Z",
          },
          { status: 201 },
        ),
      );
    if (url.endsWith(`/v1/ask/threads/${THREAD}`))
      return Promise.resolve(
        jsonResponse({
          id: THREAD,
          projectId: PROJECT,
          sourceId: null,
          title: "Why events?",
          createdAt: "2026-10-14T00:00:00.000Z",
          messages,
        }),
      );
    if (url.endsWith(`/v1/ask/threads/${THREAD}/messages`)) {
      if (streamed === "error")
        return Promise.resolve(
          new Response(
            `event: error\ndata: {"code":"ANSWER_UNAVAILABLE","message":"The answer could not be generated."}\n\n`,
            { headers: { "Content-Type": "text/event-stream" } },
          ),
        );
      messages = [streamed];
      return Promise.resolve(
        new Response(
          `event: answer\ndata: ${JSON.stringify(streamed)}\n\nevent: done\ndata: {}\n\n`,
          { headers: { "Content-Type": "text/event-stream" } },
        ),
      );
    }
    if (url.endsWith("/v1/flags"))
      return Promise.resolve(jsonResponse({ id: "f1", status: "open" }, { status: 201 }));
    return Promise.resolve(
      jsonResponse({ error: { code: "NOT_FOUND", message: url } }, { status: 404 }),
    );
  });
  return calls;
}

const assistant: AssistantContextValue = {
  open: true,
  openAssistant: vi.fn(),
  closeAssistant: vi.fn(),
  toggleAssistant: vi.fn(),
  wide: false,
  toggleWide: vi.fn(),
  showBotDemo: vi.fn(),
  subscribeToRequests: () => () => undefined,
};

function renderPanel() {
  return renderWithProviders(
    <AssistantContext value={assistant}>
      <SourceDrawerContext value={{ open: vi.fn() }}>
        <Routes>
          <Route path="/projects/:projectId" element={<AssistantPanel />} />
        </Routes>
      </SourceDrawerContext>
    </AssistantContext>,
    { route: `/projects/${PROJECT}` },
  );
}

describe("AssistantPanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("greets by name with project prompts and the trust line, then answers in a new thread", async () => {
    const calls = mockApi(
      answer("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "high", "Nightly exports were too slow."),
    );
    const user = userEvent.setup();
    renderPanel();
    expect(
      await screen.findByRole("heading", { name: "Hi Maya, what would you like to understand?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Only sources you can access are searched/)).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Who owns what in Kestrel?" }));
    expect(await screen.findByText("Nightly exports were too slow.")).toBeInTheDocument();
    expect(
      calls.find((call) => call.method === "POST" && call.url.endsWith("/v1/ask/threads"))?.body,
    ).toEqual({
      projectId: PROJECT,
      title: "Who owns what in Kestrel?",
    });
    expect(screen.getByRole("button", { name: "Helpful" })).toBeInTheDocument();
  });

  it("shows the honest no-answer state and reports the gap to the project's owners", async () => {
    const calls = mockApi(
      answer("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", "insufficient", "The sources do not say."),
    );
    const user = userEvent.setup();
    renderPanel();
    await user.type(await screen.findByLabelText("Ask Context Bot"), "How do I roll back?{Enter}");
    expect(await screen.findByText("No reliable answer found")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Report a knowledge gap" }));
    expect(
      await screen.findByText("Reported to this project's knowledge owners"),
    ).toBeInTheDocument();
    expect(calls.find((call) => call.url.endsWith("/v1/flags"))?.body).toMatchObject({
      projectId: PROJECT,
      targetType: "answer",
      targetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      kind: "missing_context",
    });
  });

  it("keeps the question and offers a retry when the answer fails", async () => {
    mockApi("error");
    const user = userEvent.setup();
    renderPanel();
    await user.type(await screen.findByLabelText("Ask Context Bot"), "Why events?{Enter}");
    expect(await screen.findByText("Couldn't get an answer")).toBeInTheDocument();
    expect(screen.getAllByText("Why events?").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled());
  });
});
