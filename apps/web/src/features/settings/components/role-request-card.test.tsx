import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { RoleRequestCard } from "@/features/settings/components/role-request-card";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

describe("RoleRequestCard", () => {
  it("lets a member ask for a different role and shows it waiting for an admin", async () => {
    const mine: Array<Record<string, unknown>> = [];
    const posted: unknown[] = [];
    mockServer.use(
      http.get(buildApiUrl("/v1/role-requests/mine"), () => HttpResponse.json({ items: mine })),
      http.post(buildApiUrl("/v1/role-requests"), async ({ request }) => {
        const body = (await request.json()) as { role: string; reason: string };
        posted.push(body);
        const entry = {
          id: "rr-1",
          role: body.role,
          reason: body.reason,
          status: "open",
          requestedAt: "2026-10-15T09:00:00.000Z",
          decidedAt: null,
        };
        mine.unshift(entry);
        return HttpResponse.json(entry, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<RoleRequestCard role="member" />);

    await user.click(await screen.findByRole("button", { name: "Request a different role" }));
    const dialog = await screen.findByRole("dialog", { name: "Request a different role" });
    // Their current role isn't offered.
    expect(within(dialog).queryByRole("radio", { name: /^Member/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: /^HR/ }));
    expect(within(dialog).getByRole("button", { name: "Send request" })).toBeDisabled();
    await user.type(
      within(dialog).getByRole("textbox", { name: "Why do you need it?" }),
      "Joining People Ops",
    );
    await user.click(within(dialog).getByRole("button", { name: "Send request" }));

    await waitFor(() => expect(posted).toEqual([{ role: "hr", reason: "Joining People Ops" }]));
    expect(await screen.findByText(/HR requested .* waiting for an admin/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Request a different role" }),
    ).not.toBeInTheDocument();
  });
});
