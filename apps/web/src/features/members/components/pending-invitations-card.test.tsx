import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { PendingInvitationsCard } from "@/features/members/components/pending-invitations-card";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const invitation = (id: string, status: string, email: string, expiresAt: string) => ({
  id,
  status,
  createdAt: "2026-10-14T09:00:00.000Z",
  data: { email, role: "guest", expiresAt },
});

describe("PendingInvitationsCard", () => {
  it("lists pending invitations only, and revokes one", async () => {
    const revoked: string[] = [];
    mockServer.use(
      http.get(buildApiUrl("/v1/users/invitations"), () =>
        HttpResponse.json({
          items: [
            invitation("i1", "pending", "ana@partner.test", "2999-01-01T00:00:00.000Z"),
            invitation("i2", "accepted", "sam@tessellate.io", "2999-01-01T00:00:00.000Z"),
            invitation("i3", "pending", "old@partner.test", "2020-01-01T00:00:00.000Z"),
          ],
        }),
      ),
      http.delete(buildApiUrl("/v1/users/invitations/:id"), ({ params }) => {
        revoked.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<PendingInvitationsCard />);
    expect(await screen.findByText("ana@partner.test")).toBeInTheDocument();
    // Accepted and expired invitations aren't pending.
    expect(screen.queryByText("sam@tessellate.io")).not.toBeInTheDocument();
    expect(screen.queryByText("old@partner.test")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Revoke the invitation to ana@partner.test" }),
    );
    await waitFor(() => expect(revoked).toEqual(["i1"]));
  });
});
