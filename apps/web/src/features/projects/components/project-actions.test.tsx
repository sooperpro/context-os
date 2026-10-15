import type { ProjectWithStats, SystemRole } from "@contextos/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ProjectActions } from "@/features/projects/components/project-actions";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const project = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  name: "Billing",
  slug: "billing",
  description: null,
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-01T09:00:00.000Z",
  stats: { sources: 1, readySources: 1, contextItems: 0, questions: 0, lastProcessedAt: null },
} satisfies ProjectWithStats;

function asRole(role: SystemRole) {
  const sent: unknown[] = [];
  mockServer.use(
    http.get(buildApiUrl("/v1/workspaces/current"), () =>
      HttpResponse.json({ id: "w1", name: "Tessellate", role, authentication: "development" }),
    ),
    http.patch(buildApiUrl(`/v1/projects/${project.id}`), async ({ request }) => {
      sent.push(await request.json());
      return HttpResponse.json({ ...project, name: "Billing platform" });
    }),
  );
  renderWithProviders(<ProjectActions project={project} />);
  return sent;
}

describe("ProjectActions", () => {
  it("lets a manager rename but not delete", async () => {
    const sent = asRole("manager");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Manage Billing" }));
    await user.click(await screen.findByRole("menuitem", { name: /Rename/ }));
    expect(screen.queryByRole("menuitem", { name: /Delete project/ })).not.toBeInTheDocument();
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Billing platform");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent).toEqual([{ name: "Billing platform", description: "" }]));
  });

  it("offers delete to admins, and nothing to members", async () => {
    asRole("admin");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Manage Billing" }));
    expect(await screen.findByRole("menuitem", { name: /Delete project/ })).toBeInTheDocument();
  });

  it("shows members nothing", async () => {
    asRole("member");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Manage Billing" })).not.toBeInTheDocument(),
    );
  });
});
