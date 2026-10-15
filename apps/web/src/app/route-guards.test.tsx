import type { SystemRole } from "@contextos/shared";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { AdminOnly } from "@/features/admin/components/admin-only";
import { ManagerOnly } from "@/features/team/components/manager-only";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

function renderAs(role: SystemRole, ui: ReactElement) {
  mockServer.use(
    http.get(buildApiUrl("/v1/workspaces/current"), () =>
      HttpResponse.json({ id: "w1", name: "Tessellate", role, authentication: "development" }),
    ),
  );
  return renderWithProviders(ui);
}

const page = <p>Guarded page</p>;

describe("Route guards for admin and manager pages", () => {
  it.each<[SystemRole, boolean]>([
    ["owner", true],
    ["admin", true],
    ["manager", false],
    ["hr", false],
    ["member", false],
    ["guest", false],
  ])("admin pages for %s: shown is %s", async (role, shown) => {
    renderAs(role, <AdminOnly>{page}</AdminOnly>);
    if (shown) expect(await screen.findByText("Guarded page")).toBeInTheDocument();
    else {
      expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
      expect(screen.queryByText("Guarded page")).not.toBeInTheDocument();
    }
  });

  it.each<[SystemRole, boolean, boolean]>([
    ["manager", true, true],
    ["hr", false, true],
    ["admin", false, false],
    ["member", false, false],
  ])(
    "team pages for %s: team and check-in shown is %s, member page shown is %s",
    async (role, team, memberPage) => {
      const first = renderAs(role, <ManagerOnly>{page}</ManagerOnly>);
      expect(
        team
          ? await screen.findByText("Guarded page")
          : await screen.findByRole("heading", { name: "Page not found" }),
      ).toBeInTheDocument();
      first.unmount();
      renderAs(role, <ManagerOnly hrMayRead>{page}</ManagerOnly>);
      expect(
        memberPage
          ? await screen.findByText("Guarded page")
          : await screen.findByRole("heading", { name: "Page not found" }),
      ).toBeInTheDocument();
    },
  );
});
