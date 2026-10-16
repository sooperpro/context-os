import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { ProjectAccessDialog } from "@/features/members/components/project-access-dialog";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const KESTREL = "66666666-6666-4666-8666-666666666666";
const BILLING = "77777777-7777-4777-8777-777777777777";
const project = (id: string, name: string) => ({
  id,
  workspaceId: WORKSPACE,
  name,
  slug: null,
  description: null,
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-01T09:00:00.000Z",
  stats: { sources: 1, readySources: 1, contextItems: 0, questions: 0, lastProcessedAt: null },
});

describe("ProjectAccessDialog", () => {
  it("shows a guest's projects and saves what changed", async () => {
    const calls: string[] = [];
    mockServer.use(
      http.get(buildApiUrl("/v1/projects"), () =>
        HttpResponse.json({
          items: [project(BILLING, "Billing"), project(KESTREL, "Project Kestrel")],
        }),
      ),
      http.get(buildApiUrl("/v1/users/ana/projects"), () =>
        HttpResponse.json({ items: [{ id: KESTREL, name: "Project Kestrel" }] }),
      ),
      http.post(buildApiUrl("/v1/projects/:projectId/memberships"), async ({ params, request }) => {
        calls.push(`add ${String(params.projectId)} ${JSON.stringify(await request.json())}`);
        return HttpResponse.json({}, { status: 201 });
      }),
      http.delete(buildApiUrl("/v1/projects/:projectId/memberships/:userId"), ({ params }) => {
        calls.push(`remove ${String(params.projectId)} ${String(params.userId)}`);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ProjectAccessDialog
        member={{ id: "ana", name: "Ana Ruiz", role: "guest", status: "active" }}
        onOpenChange={onOpenChange}
      />,
    );

    expect(await screen.findByRole("checkbox", { name: "Project Kestrel" })).toBeChecked();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Project Kestrel" }));
    await user.click(screen.getByRole("checkbox", { name: "Billing" }));
    await user.click(save);
    await waitFor(() =>
      expect(calls).toEqual([`add ${BILLING} {"userId":"ana"}`, `remove ${KESTREL} ana`]),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
