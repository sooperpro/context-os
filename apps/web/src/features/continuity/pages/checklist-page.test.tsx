import type { ContinuityChecklist } from "@contextos/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { ChecklistPage } from "@/features/continuity/pages/checklist-page";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const area = {
  key: "domain_owner:project:p1",
  type: "Domain owner",
  scope: "Billing",
  status: "unowned" as const,
  assignee: null,
  granted: false,
};
const checklist = (overrides: Partial<ContinuityChecklist> = {}): ContinuityChecklist => ({
  id: "c1",
  version: 1,
  status: "open",
  leaver: { id: "leah", name: "Leah Doe", title: null },
  createdAt: "2026-10-15T09:00:00.000Z",
  areas: [area],
  canGrant: false,
  ...overrides,
});

function serve(initial: ContinuityChecklist) {
  const sent: unknown[] = [];
  mockServer.use(
    http.get(buildApiUrl("/v1/continuity/checklists/c1"), () => HttpResponse.json(initial)),
    http.patch(buildApiUrl("/v1/continuity/checklists/c1"), async ({ request }) => {
      sent.push(await request.json());
      return HttpResponse.json({ ...initial, version: initial.version + 1 });
    }),
    http.get(buildApiUrl("/v1/users"), () =>
      HttpResponse.json({
        items: [
          { id: "leah", name: "Leah Doe", role: "member", status: "offboarded" },
          { id: "sam", name: "Sam Okafor", role: "member", status: "active" },
        ],
      }),
    ),
  );
  renderWithProviders(
    <Routes>
      <Route path="/continuity/checklists/:checklistId" element={<ChecklistPage />} />
    </Routes>,
    { route: "/continuity/checklists/c1" },
  );
  return sent;
}

describe("Hand-over checklist", () => {
  it("lets the manager pick a new owner, for an admin to apply", async () => {
    const user = userEvent.setup();
    const sent = serve(checklist());
    expect(
      await screen.findByRole("heading", { name: "Hand over Leah Doe's responsibilities" }),
    ).toBeInTheDocument();
    expect(screen.getByText("An admin applies your picks")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save picks" });
    expect(save).toBeDisabled();

    const picker = screen.getByRole("combobox", { name: "New domain owner for Billing" });
    await waitFor(() => expect(picker).toBeEnabled());
    await user.click(picker);
    // The leaver isn't offered.
    expect(screen.queryByRole("option", { name: "Leah Doe" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "Sam Okafor" }));
    await user.click(save);
    await waitFor(() =>
      expect(sent).toEqual([
        { version: 1, areas: [{ key: area.key, status: "reassigned", assigneeId: "sam" }] },
      ]),
    );
  });

  it("lets an admin apply a pick the manager left waiting", async () => {
    const user = userEvent.setup();
    const sent = serve(
      checklist({
        canGrant: true,
        areas: [
          {
            ...area,
            status: "reassigned",
            assignee: { id: "sam", name: "Sam Okafor", title: null },
          },
        ],
      }),
    );
    expect(await screen.findByText("1 pick is waiting for you")).toBeInTheDocument();
    expect(screen.getByText("Billing · Waiting for an admin")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hand over" }));
    await waitFor(() =>
      expect(sent).toEqual([
        { version: 1, areas: [{ key: area.key, status: "reassigned", assigneeId: "sam" }] },
      ]),
    );
  });
});
