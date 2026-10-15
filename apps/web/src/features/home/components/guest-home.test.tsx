import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import {
  AssistantContext,
  type AssistantContextValue,
} from "@/components/layout/assistant-context";
import { GuestHome } from "@/features/home/components/guest-home";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

describe("GuestHome", () => {
  it("shows a guest their projects and when their access ends, without a roadmap", async () => {
    mockServer.use(
      http.get(buildApiUrl("/v1/users/me"), () =>
        HttpResponse.json({
          id: "ana",
          name: "Ana Ruiz",
          email: null,
          role: "guest",
          workspaceId: "w1",
          guestExpiresAt: "2026-12-31T00:00:00.000Z",
          preferences: {},
        }),
      ),
      http.get(buildApiUrl("/v1/projects"), () =>
        HttpResponse.json({
          items: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              workspaceId: "22222222-2222-4222-8222-222222222222",
              name: "Billing",
              slug: "billing",
              description: "Ledger migration",
              createdAt: "2026-10-01T09:00:00.000Z",
              updatedAt: "2026-10-01T09:00:00.000Z",
              stats: {
                sources: 2,
                readySources: 2,
                contextItems: 9,
                questions: 0,
                lastProcessedAt: null,
              },
            },
          ],
        }),
      ),
    );
    renderWithProviders(
      <AssistantContext value={{ openAssistant: vi.fn() } as unknown as AssistantContextValue}>
        <GuestHome />
      </AssistantContext>,
    );
    expect(await screen.findByRole("heading", { name: "Welcome, Ana" })).toBeInTheDocument();
    expect(await screen.findByText("Billing")).toBeInTheDocument();
    expect(screen.getByText(/You can see the projects below until/)).toBeInTheDocument();
    expect(screen.queryByText(/roadmap/i)).not.toBeInTheDocument();
  });
});
