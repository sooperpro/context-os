import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { CreateProjectDialog } from "@/features/projects/components/create-project-dialog";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

function captureCreate() {
  const sent: unknown[] = [];
  mockServer.use(
    http.post(buildApiUrl("/v1/projects"), async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      sent.push(body);
      return HttpResponse.json(
        {
          id: "11111111-1111-4111-8111-111111111111",
          workspaceId: "22222222-2222-4222-8222-222222222222",
          name: body.name,
          slug: "handbook",
          description: null,
          category: body.category,
          createdAt: "2026-10-01T09:00:00.000Z",
          updatedAt: "2026-10-01T09:00:00.000Z",
          stats: {
            sources: 0,
            readySources: 0,
            contextItems: 0,
            questions: 0,
            lastProcessedAt: null,
          },
        },
        { status: 201 },
      );
    }),
  );
  return sent;
}

describe("CreateProjectDialog", () => {
  it("files new projects under Projects unless another collection is picked", async () => {
    const sent = captureCreate();
    const user = userEvent.setup();
    renderWithProviders(<CreateProjectDialog open onOpenChange={() => undefined} />);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("combobox", { name: "Collection" })).toHaveTextContent(
      "Projects",
    );
    await user.type(within(dialog).getByLabelText("Name"), "Handbook");
    await user.click(within(dialog).getByRole("combobox", { name: "Collection" }));
    await user.click(await screen.findByRole("option", { name: "Company" }));
    await user.click(within(dialog).getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(sent).toMatchObject([{ name: "Handbook", category: "company" }]));
  });

  it("preselects the collection it was opened from", async () => {
    const sent = captureCreate();
    const user = userEvent.setup();
    renderWithProviders(
      <CreateProjectDialog open onOpenChange={() => undefined} defaultCategory="product" />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("combobox", { name: "Collection" })).toHaveTextContent(
      "Products",
    );
    await user.type(within(dialog).getByLabelText("Name"), "Track");
    await user.click(within(dialog).getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(sent).toMatchObject([{ name: "Track", category: "product" }]));
  });
});
