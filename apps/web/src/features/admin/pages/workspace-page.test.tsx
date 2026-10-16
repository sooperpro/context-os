import type { SystemRole } from "@contextos/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { WorkspacePage } from "@/features/admin/pages/workspace-page";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

function api(role: SystemRole, deletion?: { scheduledAt: string }) {
  const calls: unknown[] = [];
  mockServer.use(
    http.get(buildApiUrl("/v1/workspaces/current"), () =>
      HttpResponse.json({
        id: "w1",
        name: "Tessellate",
        slug: "tessellate",
        role,
        authentication: "development",
        settings: deletion
          ? { deletion: { ...deletion, requestedBy: "u1", requestedAt: deletion.scheduledAt } }
          : {},
      }),
    ),
    http.get(buildApiUrl("/v1/analytics/overview"), ({ request }) =>
      HttpResponse.json({
        periodDays: Number(new URL(request.url).searchParams.get("days")),
        knowledgeHealth: [{ projectId: "p1", name: "Billing", khs: 72.4 }],
        ask: { volume: 41, helpfulRate: null, insufficientRate: 0.12 },
        contributions: {
          flagsOpened: 3,
          flagsResolved: 2,
          correctionsVerified: 5,
          bountiesCompleted: 1,
        },
      }),
    ),
    http.post(buildApiUrl("/v1/workspaces/current/deletion"), async ({ request }) => {
      calls.push(await request.json());
      return HttpResponse.json({}, { status: 202 });
    }),
    http.delete(buildApiUrl("/v1/workspaces/current/deletion"), () => {
      calls.push("cancel");
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

describe("WorkspacePage", () => {
  it("shows aggregate analytics, saying when there isn't enough data for a rate", async () => {
    api("admin");
    renderWithProviders(<WorkspacePage />);
    expect(await screen.findByText("Questions asked")).toBeInTheDocument();
    expect(screen.getByText("41")).toBeInTheDocument();
    expect(screen.getByText("Not enough data")).toBeInTheDocument();
    expect(screen.getByText("72 / 100")).toBeInTheDocument();
    // Admins export, but only owners delete.
    expect(screen.getByRole("button", { name: /Download export/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete workspace/ })).not.toBeInTheDocument();
  });

  it("lets an owner schedule deletion only after typing the slug", async () => {
    const calls = api("owner");
    const user = userEvent.setup();
    renderWithProviders(<WorkspacePage />);
    await user.click(await screen.findByRole("button", { name: /Delete workspace/ }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Schedule deletion" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Workspace"), "tessellate");
    await user.click(confirm);
    await waitFor(() => expect(calls).toEqual([{ confirm: "tessellate" }]));
  });

  it("shows a scheduled deletion and cancels it", async () => {
    const calls = api("owner", { scheduledAt: "2026-10-23T09:00:00.000Z" });
    const user = userEvent.setup();
    renderWithProviders(<WorkspacePage />);
    expect(await screen.findByText(/Deletion is scheduled for/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel deletion" }));
    await waitFor(() => expect(calls).toEqual(["cancel"]));
  });
});
