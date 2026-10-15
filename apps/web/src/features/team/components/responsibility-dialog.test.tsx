import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { ResponsibilityDialog } from "@/features/team/components/responsibility-dialog";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

describe("ResponsibilityDialog", () => {
  it("makes a report a mentor for another of the manager's reports", async () => {
    const sent: unknown[] = [];
    mockServer.use(
      http.get(buildApiUrl("/v1/users/me"), () =>
        HttpResponse.json({
          id: "dan",
          name: "Dan",
          email: null,
          role: "manager",
          workspaceId: "w1",
          preferences: {},
        }),
      ),
      http.get(buildApiUrl("/v1/users"), () =>
        HttpResponse.json({
          items: [
            { id: "sana", name: "Sana Ali", role: "member", status: "active", managerId: "dan" },
            { id: "leah", name: "Leah Doe", role: "member", status: "active", managerId: "dan" },
            {
              id: "other",
              name: "Other Person",
              role: "member",
              status: "active",
              managerId: "priya",
            },
          ],
        }),
      ),
      http.get(buildApiUrl("/v1/projects"), () => HttpResponse.json({ items: [] })),
      http.post(buildApiUrl("/v1/assignments"), async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <ResponsibilityDialog
        person={{ id: "sana", name: "Sana Ali", title: null }}
        open
        onOpenChange={vi.fn()}
      />,
    );
    const mentoring = await screen.findByRole("combobox", { name: "Mentoring" });
    await waitFor(() => expect(mentoring).toBeEnabled());
    await user.click(mentoring);
    // Only the manager's own reports, and not the person themselves.
    expect(screen.queryByRole("option", { name: "Other Person" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Sana Ali" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "Leah Doe" }));
    await user.click(screen.getByRole("button", { name: "Give responsibility" }));
    await waitFor(() =>
      expect(sent).toEqual([
        { userId: "sana", type: "mentor", scopeType: "user", scopeId: "leah" },
      ]),
    );
  });
});
