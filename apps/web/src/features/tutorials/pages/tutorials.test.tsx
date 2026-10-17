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
  inProgress: 0,
  updatedAt: "2026-10-15T09:00:00.000Z",
  createdBy: { id: "u1", name: "Maya Okafor", title: null },
  review: null,
  state: "draft",
  usedIn: [],
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
    const calls = renderAt(
      "/tutorials",
      tutorial({
        status: "published",
        publishedVersion: 1,
        unpublishedChanges: false,
        staleSources: 2,
        state: "sources_changed",
      }),
    );

    // No template uses it yet, so it's under "Not in any template".
    const section = await screen.findByRole("region", { name: "Not in any template" });
    const row = within(section).getByRole("link", { name: /How billing moves to Kafka/ });
    expect(row).toHaveAttribute("href", "/tutorials/t1");
    expect(within(row).getByText("Sources changed")).toBeInTheDocument();
    const attention = screen.getByRole("group", { name: "Needs attention" });
    expect(
      within(attention).getByRole("button", { name: "1 with changed sources" }),
    ).toBeInTheDocument();

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

    // The visual editor shows what learners read: a heading, bold text and a table.
    const lesson = await screen.findByRole("region", { name: "Lesson" });
    const visual = await within(lesson).findByRole("textbox", { name: "Lesson" });
    expect(
      within(visual).getByRole("heading", { level: 2, name: "Why we changed" }),
    ).toBeInTheDocument();
    expect(within(visual).getByText("too slow").tagName).toBe("STRONG");
    expect(within(visual).getByRole("table")).toBeInTheDocument();
    expect(within(lesson).getByRole("toolbar", { name: "Formatting" })).toBeInTheDocument();
    // Opening a lesson changes nothing.
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();

    await user.click(within(lesson).getByRole("tab", { name: "Markdown" }));
    const editor = within(lesson).getByRole("textbox", { name: "Lesson (Markdown)" });
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

  it("gives each lesson a drag handle, and moves one from its menu", async () => {
    const user = userEvent.setup();
    renderAt("/tutorials/t1", tutorial());
    const lessons = await screen.findByRole("list", { name: "Lessons" });
    const order = () =>
      within(lessons)
        .getAllByRole("button", { name: /^\d\s*/ })
        .map((button) => button.textContent);
    expect(order()).toEqual(["1Why we changed", "2Who owns what"]);
    // Each row has a drag handle and its delete button, and no up and down arrows of its own.
    expect(
      within(lessons).getByRole("button", { name: "Reorder Why we changed" }),
    ).toBeInTheDocument();
    expect(
      within(lessons).getByRole("button", { name: "Remove Why we changed" }),
    ).toBeInTheDocument();
    expect(within(lessons).queryByRole("button", { name: /Move .* up/ })).not.toBeInTheDocument();

    // The menu moves it without dragging.
    await user.click(within(lessons).getByRole("button", { name: "Move Who owns what" }));
    await user.click(await screen.findByRole("menuitem", { name: "Move up" }));
    await waitFor(() => expect(order()).toEqual(["1Who owns what", "2Why we changed"]));
    expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
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

  it("asks before moving people part-way through to an update, and keeps them by default", async () => {
    const user = userEvent.setup();
    const calls = renderAt(
      "/tutorials/t1",
      tutorial({
        status: "published",
        publishedVersion: 1,
        unpublishedChanges: true,
        learners: 3,
        inProgress: 2,
        state: "unpublished_edits",
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Publish update" }));
    const dialog = await screen.findByRole("dialog", { name: "Publish version 2" });
    const move = within(dialog).getByRole("switch", {
      name: /Move the 2 people part-way through to this version/,
    });
    expect(move).not.toBeChecked();
    expect(
      within(dialog).getByText(
        "They each finish version 1, the one they started. Everyone who starts from now gets this version.",
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(calls.find((call) => call.path === "publish")?.body).toEqual({
        updateLearners: false,
      }),
    );
  });

  it("goes back to the template it was opened from", async () => {
    mockServer.use(
      http.get(api("/v1/people-ops/templates/:id"), () =>
        HttpResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 }),
      ),
    );
    renderAt("/tutorials/t1?template=tpl-1", tutorial());
    // Base UI renders the link with role="button"; it still goes to the template.
    const back = await screen.findByRole("button", { name: /Back to template/ });
    expect(back).toHaveAttribute("href", "/templates/tpl-1");
  });
});

describe("Tutorials page with several templates", () => {
  const summary = (
    id: string,
    title: string,
    state: TutorialDetail["state"],
    usedIn: TutorialDetail["usedIn"],
  ) => ({
    ...tutorial({ id, title, state, usedIn, status: state === "draft" ? "draft" : "published" }),
    content: undefined,
    sources: undefined,
  });
  const use = (
    templateId: string,
    templateName: string,
    stage: string,
    weekStart: number,
    position: number,
  ) => ({
    templateId,
    templateName,
    published: true,
    stage,
    weekStart,
    weekEnd: weekStart,
    position,
  });

  const render = () => {
    mockServer.use(
      http.get(api("/v1/workspaces/current"), () =>
        HttpResponse.json({
          id: "w1",
          name: "Tessellate",
          role: "owner",
          authentication: "development",
        }),
      ),
      http.get(api("/v1/tutorials"), () =>
        HttpResponse.json({
          items: [
            summary("t-mission", "Our mission", "published", [
              use("tpl-support", "Support specialist", "Induction", 1, 1),
              use("tpl-sales", "Sales executive", "Induction", 1, 1),
            ]),
            summary("t-tickets", "Handling tickets", "update_ready", [
              use("tpl-support", "Support specialist", "Role training", 2, 2),
            ]),
            summary("t-pricing", "Pricing tiers", "published", [
              use("tpl-sales", "Sales executive", "Role training", 2, 2),
            ]),
            summary("t-kafka", "Billing on Kafka", "draft", []),
          ],
        }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/tutorials" element={<TutorialsPage />} />
      </Routes>,
      { route: "/tutorials" },
    );
  };

  it("groups tutorials by template in stage order, marks shared ones and filters", async () => {
    const user = userEvent.setup();
    render();
    const support = await screen.findByRole("region", { name: "Support specialist" });
    const sales = screen.getByRole("region", { name: "Sales executive" });
    expect(screen.getByRole("region", { name: "Not in any template" })).toBeInTheDocument();

    // Stage by stage, in the template's order; the mission module is shared.
    expect(
      within(support).getByRole("heading", { name: "Week 1 · Induction" }),
    ).toBeInTheDocument();
    expect(
      within(support)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      expect.stringContaining("Our mission"),
      expect.stringContaining("Handling tickets"),
    ]);
    expect(within(support).getByText("Shared by 2 templates")).toBeInTheDocument();
    expect(within(support).getByRole("link", { name: /Handling tickets/ })).toHaveAttribute(
      "href",
      "/tutorials/t-tickets?template=tpl-support",
    );
    expect(within(sales).getByRole("link", { name: /Pricing tiers/ })).toBeInTheDocument();

    // "Needs attention" filters to what's waiting.
    const attention = screen.getByRole("group", { name: "Needs attention" });
    await user.click(within(attention).getByRole("button", { name: "1 update ready to review" }));
    expect(await screen.findByRole("link", { name: /Handling tickets/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Our mission/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sales executive" })).not.toBeInTheDocument();
    await user.click(within(attention).getByRole("button", { name: "1 update ready to review" }));

    // Search, then every tutorial in one list with the templates it's in.
    await user.type(screen.getByRole("searchbox", { name: "Search tutorials" }), "pricing");
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /Our mission/ })).not.toBeInTheDocument(),
    );
    await user.clear(screen.getByRole("searchbox", { name: "Search tutorials" }));
    await user.click(screen.getByRole("button", { name: "All tutorials" }));
    expect(await screen.findByText("In Support specialist, Sales executive")).toBeInTheDocument();
    expect(screen.getByText("Not in any template")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Support specialist" })).not.toBeInTheDocument();
  });
});
