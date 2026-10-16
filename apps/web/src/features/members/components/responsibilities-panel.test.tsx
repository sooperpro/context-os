import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ResponsibilitiesPanel } from "@/features/members/components/responsibilities-panel";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const BILLING = "77777777-7777-4777-8777-777777777777";

function api() {
  const calls: unknown[] = [];
  mockServer.use(
    http.get(buildApiUrl("/v1/assignments"), () =>
      HttpResponse.json({
        items: [
          {
            id: "a1",
            userId: "sam",
            type: "domain_owner",
            scopeType: "project",
            scopeId: BILLING,
            expiresAt: null,
          },
        ],
      }),
    ),
    http.get(buildApiUrl("/v1/users"), () =>
      HttpResponse.json({
        items: [
          { id: "sam", name: "Sam Okafor", role: "member", status: "active" },
          { id: "priya", name: "Priya Nair", role: "manager", status: "active" },
          { id: "gail", name: "Gail Guest", role: "guest", status: "active" },
        ],
      }),
    ),
    http.get(buildApiUrl("/v1/projects"), () =>
      HttpResponse.json({
        items: [
          {
            id: BILLING,
            workspaceId: WORKSPACE,
            name: "Billing",
            slug: "billing",
            description: null,
            createdAt: "2026-10-01T09:00:00.000Z",
            updatedAt: "2026-10-01T09:00:00.000Z",
            stats: {
              sources: 1,
              readySources: 1,
              contextItems: 0,
              questions: 0,
              lastProcessedAt: null,
            },
          },
        ],
      }),
    ),
    http.get(buildApiUrl("/v1/workspaces/current"), () =>
      HttpResponse.json({
        id: WORKSPACE,
        name: "Tessellate",
        role: "admin",
        authentication: "development",
      }),
    ),
    http.post(buildApiUrl("/v1/assignments"), async ({ request }) => {
      calls.push(await request.json());
      return HttpResponse.json({}, { status: 201 });
    }),
    http.delete(buildApiUrl("/v1/assignments/:id"), ({ params }) => {
      calls.push(`remove ${String(params.id)}`);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

describe("ResponsibilitiesPanel", () => {
  it("lists who owns what by name and removes a responsibility", async () => {
    const calls = api();
    const user = userEvent.setup();
    renderWithProviders(<ResponsibilitiesPanel />);
    const row = (await screen.findByText("Sam Okafor")).closest("tr")!;
    expect(within(row).getByText("Domain owner")).toBeInTheDocument();
    expect(await within(row).findByText("Billing")).toBeInTheDocument();
    await user.click(
      within(row).getByRole("button", { name: "Remove Sam Okafor as domain owner of Billing" }),
    );
    await waitFor(() => expect(calls).toEqual(["remove a1"]));
  });

  it("grants a domain owner for a project, never to a guest", async () => {
    const calls = api();
    const user = userEvent.setup();
    renderWithProviders(<ResponsibilitiesPanel />);
    await user.click(await screen.findByRole("button", { name: "Grant" }));
    const dialog = await screen.findByRole("dialog");
    const grant = within(dialog).getByRole("button", { name: "Grant" });
    expect(grant).toBeDisabled();

    await user.click(within(dialog).getByRole("combobox", { name: "Person" }));
    expect(screen.queryByRole("option", { name: "Gail Guest" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "Priya Nair" }));
    await user.click(within(dialog).getByRole("combobox", { name: "Project" }));
    await user.click(await screen.findByRole("option", { name: "Billing" }));
    await user.click(grant);
    await waitFor(() =>
      expect(calls).toEqual([
        { userId: "priya", type: "domain_owner", scopeType: "project", scopeId: BILLING },
      ]),
    );
  });
});
