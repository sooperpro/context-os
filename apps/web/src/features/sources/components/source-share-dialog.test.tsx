import type { SourceObject } from "@contextos/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { SourceShareDialog } from "@/features/sources/components/source-share-dialog";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const PROJECT = "11111111-1111-4111-8111-111111111111";
const source = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Refund policy",
} as SourceObject;

describe("SourceShareDialog", () => {
  it("lists who it's shared with, shares with one more person and stops sharing", async () => {
    const calls: unknown[] = [];
    const access = `/v1/projects/${PROJECT}/sources/${source.id}/access`;
    mockServer.use(
      http.get(buildApiUrl(access), () =>
        HttpResponse.json({ items: [{ userId: "sam", name: "Sam Okafor", expiresAt: null }] }),
      ),
      http.get(buildApiUrl("/v1/users"), () =>
        HttpResponse.json({
          items: [
            { id: "sam", name: "Sam Okafor", role: "member", status: "active" },
            { id: "ana", name: "Ana Ruiz", role: "member", status: "active" },
          ],
        }),
      ),
      http.post(buildApiUrl(access), async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json({}, { status: 201 });
      }),
      http.delete(buildApiUrl(`${access}/:userId`), ({ params }) => {
        calls.push(`remove ${String(params.userId)}`);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <SourceShareDialog projectId={PROJECT} source={source} onOpenChange={vi.fn()} />,
    );
    expect(await screen.findByText("Sam Okafor")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Person" })).toBeEnabled());
    await user.click(screen.getByRole("combobox", { name: "Person" }));
    // Someone it's already shared with isn't offered again.
    expect(screen.queryByRole("option", { name: "Sam Okafor" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "Ana Ruiz" }));
    await user.click(screen.getByRole("button", { name: "Share" }));
    await user.click(screen.getByRole("button", { name: "Stop sharing with Sam Okafor" }));
    await waitFor(() => expect(calls).toEqual([{ userId: "ana" }, "remove sam"]));
  });
});
