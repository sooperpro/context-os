import type { TutorialDetail } from "@contextos/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { describe, expect, it } from "vitest";
import { TutorialStudioPage } from "@/features/tutorials/pages/tutorial-studio-page";
import { TutorialsPage } from "@/features/tutorials/pages/tutorials-page";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const PROJECT = "11111111-1111-4111-8111-111111111111";
const api = (path: string) => buildApiUrl(path);

const tutorial = (overrides: Partial<TutorialDetail> = {}): TutorialDetail => ({
  id: "t1",
  title: "How billing moves to Kafka",
  status: "draft",
  generating: false,
  project: { id: PROJECT, name: "Billing" },
  audience: "New engineers",
  lessonCount: 2,
  questionCount: 1,
  minutes: 10,
  publishedVersion: null,
  unpublishedChanges: true,
  staleSources: 0,
  learners: 0,
  updatedAt: "2026-10-15T09:00:00.000Z",
  createdBy: { id: "u1", name: "Maya Okafor", title: null },
  review: null,
  restrictedForYou: false,
  focus: "billing",
  coversModule: null,
  content: {
    title: "How billing moves to Kafka",
    summary: "Billing events move to **Kafka**.",
    kind: "systems",
    objectives: ["Explain why billing moved"],
    lessons: [
      {
        id: "l1",
        title: "Why we changed",
        type: "article",
        minutes: 5,
        body: "## Why we changed\n\nThe batch job was **too slow**.\n\n| Area | Owner |\n| --- | --- |\n| Billing | Platform |",
        basedOn: ["ADR-042"],
        sourceIds: ["s1"],
      },
      {
        id: "l2",
        title: "Who owns what",
        type: "article",
        minutes: 5,
        body: "- Platform owns billing",
        basedOn: [],
        sourceIds: [],
      },
    ],
    check: {
      passMark: 1,
      questions: [
        {
          id: "q1",
          prompt: "Why did billing move?",
          options: [
            { id: "a", text: "Too slow" },
            { id: "b", text: "Cheaper" },
          ],
          correctOptionId: "a",
          explanation: "The batch job was too slow.",
          source: "ADR-042",
          sourceId: "s1",
        },
      ],
    },
  },
  sources: [{ id: "s1", title: "ADR-042", state: "current", restricted: false }],
  generatedAt: "2026-10-15T09:00:00.000Z",
  publishedAt: null,
  publishedBy: null,
  error: null,
  update: null,
  moduleOptions: [{ id: "mod-architecture", title: "Architecture overview" }],
  ...overrides,
});

function renderAt(
  route: string,
  detail: TutorialDetail,
  { role = "owner" }: { role?: "owner" | "member" } = {},
) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  let current = detail;
  const record = async (request: Request, path: string) => {
    calls.push({ method: request.method, path, body: await request.json().catch(() => null) });
  };
  mockServer.use(
    http.get(api("/v1/workspaces/current"), () =>
      HttpResponse.json({
        id: "w1",
        name: "Tessellate",
        role,
        authentication: "development",
      }),
    ),
    http.get(api("/v1/tutorials"), () =>
      HttpResponse.json({
        items: [
          {
            ...current,
            content: undefined,
            sources: undefined,
            restrictedForYou: undefined,
            focus: undefined,
            coversModule: undefined,
            generatedAt: undefined,
            publishedAt: undefined,
            publishedBy: undefined,
            error: undefined,
            moduleOptions: undefined,
          },
        ],
      }),
    ),
    http.get(api("/v1/tutorials/:id"), () => HttpResponse.json(current)),
    http.post(api("/v1/tutorials"), async ({ request }) => {
      await record(request, "create");
      current = { ...detail, id: "t2", status: "generating", generating: true, content: null };
      return HttpResponse.json(current, { status: 202 });
    }),
    http.patch(api("/v1/tutorials/:id"), async ({ request }) => {
      await record(request, "update");
      const body = (calls.at(-1)!.body ?? {}) as { content?: TutorialDetail["content"] };
      current = { ...current, ...(body.content ? { content: body.content } : {}) };
      return HttpResponse.json(current);
    }),
    http.post(api("/v1/tutorials/:id/submit"), async ({ request }) => {
      await record(request, "submit");
      current = {
        ...current,
        review: {
          state: "in_review",
          note: null,
          by: { id: "u1", name: "Maya Okafor", title: null },
          at: new Date().toISOString(),
        },
      };
      return HttpResponse.json(current);
    }),
    http.post(api("/v1/tutorials/:id/publish"), async ({ request }) => {
      await record(request, "publish");
      current = { ...current, status: "published", publishedVersion: 1, unpublishedChanges: false };
      return HttpResponse.json(current);
    }),
    http.get(api("/v1/projects"), () =>
      HttpResponse.json({
        items: [
          {
            id: PROJECT,
            workspaceId: "22222222-2222-4222-8222-222222222222",
            slug: "billing",
            name: "Billing",
            description: null,
            createdAt: "2026-10-01T09:00:00.000Z",
            updatedAt: "2026-10-01T09:00:00.000Z",
            stats: {
              sources: 1,
              readySources: 1,
              contextItems: 4,
              questions: 0,
              lastProcessedAt: null,
            },
          },
        ],
      }),
    ),
  );
  renderWithProviders(
    <>
      <Routes>
        <Route path="/tutorials" element={<TutorialsPage />} />
        <Route path="/tutorials/:tutorialId" element={<TutorialStudioPage />} />
      </Routes>
      <Toaster />
    </>,
    { route },
  );
  return calls;
}

describe("Tutorials", () => {
  it("lists tutorials, flags ones needing an update, and drafts a new one", async () => {
    const user = userEvent.setup();
    const calls = renderAt("/tutorials", tutorial({ staleSources: 2 }));

    const list = await screen.findByRole("list", { name: "Tutorials" });
    const card = within(list).getByRole("link", { name: /How billing moves to Kafka/ });
    expect(card).toHaveAttribute("href", "/tutorials/t1");
    expect(within(card).getByText("Needs update")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New tutorial" }));
    const dialog = await screen.findByRole("dialog", { name: "New tutorial" });
    const project = await within(dialog).findByRole("combobox", { name: "Project" });
    await waitFor(() => expect(project).toHaveTextContent("Billing"));
    await user.type(within(dialog).getByRole("textbox", { name: "Focus (optional)" }), "Ledger");
    await user.click(within(dialog).getByRole("button", { name: "Draft tutorial" }));

    await waitFor(() =>
      expect(calls.find((call) => call.path === "create")?.body).toEqual({
        projectId: PROJECT,
        audience: "New team members",
        focus: "Ledger",
      }),
    );
    expect(
      await screen.findByText("Writing the draft from the project's knowledge"),
    ).toBeInTheDocument();
  });

  it("previews a lesson as formatted Markdown, edits it, saves and publishes", async () => {
    const user = userEvent.setup();
    const calls = renderAt("/tutorials/t1", tutorial());

    expect(
      await screen.findByRole("heading", { level: 1, name: "How billing moves to Kafka" }),
    ).toBeInTheDocument();
    const outline = screen.getByRole("navigation", { name: "Tutorial outline" });
    await user.click(within(outline).getByRole("button", { name: /^1\s*Why we changed$/ }));

    // The preview is what learners read: a heading, bold text and a table.
    const lesson = await screen.findByRole("region", { name: "Lesson" });
    expect(
      within(lesson).getByRole("heading", { level: 2, name: "Why we changed" }),
    ).toBeInTheDocument();
    expect(within(lesson).getByText("too slow").tagName).toBe("STRONG");
    expect(within(lesson).getByRole("table")).toBeInTheDocument();

    await user.click(within(lesson).getByRole("tab", { name: "Edit Markdown" }));
    const editor = within(lesson).getByRole("textbox", { name: "Lesson" });
    await user.clear(editor);
    await user.type(editor, "## Why we changed{enter}{enter}Rewritten.");
    // Publishing waits until the edits are saved.
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(calls.some((call) => call.path === "update")).toBe(true));
    const saved = calls.find((call) => call.path === "update")!.body as {
      content: { lessons: Array<{ body: string }> };
    };
    expect(saved.content.lessons[0]!.body).toBe("## Why we changed\n\nRewritten.");

    await user.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = await screen.findByRole("dialog", { name: "Publish tutorial" });
    await user.click(within(dialog).getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(calls.find((call) => call.path === "publish")?.body).toEqual({
        updateLearners: false,
      }),
    );
  });

  it("explains changed and restricted sources instead of rewriting on sync", async () => {
    renderAt(
      "/tutorials/t1",
      tutorial({
        status: "published",
        publishedVersion: 1,
        unpublishedChanges: false,
        staleSources: 1,
        sources: [{ id: "s1", title: "ADR-042", state: "changed", restricted: true }],
      }),
    );
    expect(await screen.findByText("1 source changed since this was written")).toBeInTheDocument();
    expect(screen.getByText("Some lessons use restricted sources")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Publish update" })).toBeInTheDocument();
  });

  it("has a path curator submit the draft to People Ops instead of publishing it", async () => {
    const user = userEvent.setup();
    const calls = renderAt("/tutorials/t1", tutorial(), { role: "member" });
    await screen.findByRole("heading", { level: 1, name: "How billing moves to Kafka" });
    const submit = await screen.findByRole("button", { name: "Submit for review" });
    expect(screen.queryByRole("button", { name: /^Publish/ })).not.toBeInTheDocument();
    await user.click(submit);
    expect(await screen.findByText("Waiting for People Ops")).toBeInTheDocument();
    expect(screen.getByText("In review")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submitted" })).toBeDisabled();
    expect(calls.map((call) => call.path)).toContain("submit");
  });
});
