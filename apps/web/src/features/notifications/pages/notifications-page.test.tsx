import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { NotificationsPage } from "@/features/notifications/pages/notifications-page";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const notification = (id: string, title: string, status: string) => ({
  id,
  status,
  version: 1,
  createdAt: "2026-10-15T09:00:00.000Z",
  data: { type: "test", category: "onboarding", title, body: "", link: "/roadmap" },
});

describe("NotificationsPage", () => {
  it("lists the latest 100, filters unread and marks one read", async () => {
    let limit: string | null = null;
    const read: string[] = [];
    mockServer.use(
      http.get(buildApiUrl("/v1/notifications"), ({ request }) => {
        limit = new URL(request.url).searchParams.get("limit");
        return HttpResponse.json({
          unread: 1,
          items: [
            notification("n1", "Your roadmap is ready", "unread"),
            notification("n2", "Dan shared notes", "read"),
          ],
        });
      }),
      http.patch(buildApiUrl("/v1/notifications/:id/read"), ({ params }) => {
        read.push(String(params.id));
        return HttpResponse.json(notification(String(params.id), "Your roadmap is ready", "read"));
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<NotificationsPage />);
    expect(await screen.findByText("Dan shared notes")).toBeInTheDocument();
    expect(limit).toBe("100");
    await user.click(screen.getByRole("button", { name: "Unread 1" }));
    expect(screen.queryByText("Dan shared notes")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark “Your roadmap is ready” read" }));
    await waitFor(() => expect(read).toEqual(["n1"]));
  });
});
