import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { KnowledgeGapsPage } from "@/features/knowledge-gaps/pages/knowledge-gaps-page";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const gap = {
  id: "dnBuIHBhc3N3b3JkIHJlc2V0",
  question: "How do I reset my VPN password?",
  wordings: 3,
  asks: 4,
  askers: 3,
  reports: 1,
  project: { id: "p1", name: "IT help" },
  status: "open",
  firstAskedAt: "2026-10-10T09:00:00.000Z",
  lastAskedAt: "2026-10-16T09:00:00.000Z",
  resolution: null,
};

function mockApi(items: object[] = [gap]) {
  const queries: string[] = [];
  const sent: unknown[] = [];
  mockServer.use(
    http.get(buildApiUrl("/v1/knowledge-gaps"), ({ request }) => {
      queries.push(new URL(request.url).search);
      return HttpResponse.json({
        items,
        counts: { open: items.length, answered: 2, dismissed: 0 },
        privacyFloor: 3,
        scope: "workspace",
      });
    }),
    http.post(buildApiUrl("/v1/knowledge-gaps/:id/status"), async ({ request }) => {
      sent.push(await request.json());
      return HttpResponse.json({ ...gap, status: "answered" });
    }),
  );
  return { queries, sent };
}

describe("KnowledgeGapsPage", () => {
  it("lists open gaps with what they're made of, never who asked", async () => {
    mockApi();
    renderWithProviders(<KnowledgeGapsPage />, { route: "/knowledge-gaps" });
    const list = await screen.findByRole("list", { name: "Knowledge gaps" });
    const [row] = within(list).getAllByRole("listitem");
    expect(row).toHaveTextContent("How do I reset my VPN password?");
    expect(row).toHaveTextContent(
      "Asked 4 times without an answer, by 3 people, reported once, 3 wordings",
    );
    expect(within(row!).getByRole("link", { name: "IT help" })).toHaveAttribute(
      "href",
      "/projects/p1",
    );
    expect(screen.getByRole("button", { name: /Open 1/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Answered 2/ })).toBeInTheDocument();
  });

  it("marks a gap answered with a note", async () => {
    const { sent } = mockApi();
    const user = userEvent.setup();
    renderWithProviders(<KnowledgeGapsPage />, { route: "/knowledge-gaps" });
    await user.click(await screen.findByRole("button", { name: "Mark answered" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Where the answer is/), "Added the VPN guide.");
    await user.click(within(dialog).getByRole("button", { name: "Mark answered" }));
    await waitFor(() =>
      expect(sent).toEqual([{ status: "answered", note: "Added the VPN guide." }]),
    );
  });

  it("filters to a project from a notification link, and explains an empty list", async () => {
    const { queries } = mockApi([]);
    renderWithProviders(<KnowledgeGapsPage />, { route: "/knowledge-gaps?project=p1" });
    expect(
      await screen.findByText(/once 3 different people ask something Context Bot couldn't answer/),
    ).toBeInTheDocument();
    expect(queries[0]).toContain("projectId=p1");
    expect(screen.getByRole("button", { name: "All projects" }).closest("a")).toHaveAttribute(
      "href",
      "/knowledge-gaps",
    );
  });

  it("tells people who aren't domain owners or admins why they can't see gaps", async () => {
    mockServer.use(
      http.get(buildApiUrl("/v1/knowledge-gaps"), () =>
        HttpResponse.json(
          {
            error: {
              code: "FORBIDDEN",
              message: "Knowledge gaps are for domain owners and admins",
            },
          },
          { status: 403 },
        ),
      ),
    );
    renderWithProviders(<KnowledgeGapsPage />, { route: "/knowledge-gaps" });
    expect(
      await screen.findByText(/Knowledge gaps are for domain owners and admins/),
    ).toBeInTheDocument();
  });
});
