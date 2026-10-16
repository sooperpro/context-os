import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ManagerOnly } from "@/features/team/components/manager-only";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

function asRole(role: string) {
  mockServer.use(
    http.get(buildApiUrl("/v1/workspaces/current"), () =>
      HttpResponse.json({ id: "ws", name: "Tessellate", role, authentication: "development" }),
    ),
  );
}

describe("ManagerOnly", () => {
  it("shows a team page to a manager", async () => {
    asRole("manager");
    renderWithProviders(
      <ManagerOnly>
        <p>Team onboarding</p>
      </ManagerOnly>,
    );
    expect(await screen.findByText("Team onboarding")).toBeInTheDocument();
  });

  it.each(["hr", "owner", "admin", "member", "guest"])(
    "shows the not found page to the %s, not the team page",
    async (role) => {
      asRole(role);
      renderWithProviders(
        <ManagerOnly>
          <p>Team onboarding</p>
        </ManagerOnly>,
      );
      expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
      expect(screen.queryByText("Team onboarding")).not.toBeInTheDocument();
    },
  );

  it("lets People Ops open a member page, as the API lets them read it", async () => {
    asRole("hr");
    renderWithProviders(
      <ManagerOnly hrMayRead>
        <p>Leah Doe</p>
      </ManagerOnly>,
    );
    expect(await screen.findByText("Leah Doe")).toBeInTheDocument();
  });

  it("keeps members out of a member page even when People Ops is let in", async () => {
    asRole("member");
    renderWithProviders(
      <ManagerOnly hrMayRead>
        <p>Leah Doe</p>
      </ManagerOnly>,
    );
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});
