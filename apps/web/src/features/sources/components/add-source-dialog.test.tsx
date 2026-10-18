import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { AddSourceDialog } from "@/features/sources/components/add-source-dialog";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const PROJECT = "11111111-1111-4111-8111-111111111111";

describe("AddSourceDialog", () => {
  const added = () => {
    const bodies: unknown[] = [];
    mockServer.use(
      http.post(buildApiUrl(`/v1/projects/${PROJECT}/sources`), async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        bodies.push(body);
        return HttpResponse.json(
          {
            id: "22222222-2222-4222-8222-222222222222",
            projectId: PROJECT,
            connector: "manual",
            kind: body.kind,
            externalId: null,
            title: body.title,
            url: null,
            author: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: null,
            ingestedAt: "2026-10-18T09:00:00.000Z",
            processedAt: null,
            status: "pending",
            error: null,
            contentLength: String(body.content).length,
            chunkCount: 0,
          },
          { status: 201 },
        );
      }),
    );
    return bodies;
  };
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText("Title"), "Employee handbook");
    await user.type(screen.getByLabelText("Content"), "Everyone gets 25 days of leave.");
  };

  it("shares a new source with the project by default, and says so", async () => {
    const bodies = added();
    const user = userEvent.setup();
    renderWithProviders(<AddSourceDialog projectId={PROJECT} open onOpenChange={vi.fn()} />);
    const share = screen.getByRole("switch", { name: /Share with everyone in the workspace/ });
    expect(share).toBeChecked();
    expect(screen.getByText(/Everyone who can open this project can read it/)).toBeInTheDocument();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Add source" }));
    await waitFor(() =>
      expect(bodies).toEqual([expect.objectContaining({ visibility: "workspace" })]),
    );
  });

  it("keeps it to the uploader when sharing is turned off", async () => {
    const bodies = added();
    const user = userEvent.setup();
    renderWithProviders(<AddSourceDialog projectId={PROJECT} open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("switch", { name: /Share with everyone in the workspace/ }));
    expect(screen.getByText(/Only you and workspace owners can read it/)).toBeInTheDocument();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Add source" }));
    await waitFor(() =>
      expect(bodies).toEqual([expect.objectContaining({ visibility: "restricted" })]),
    );
  });
});
