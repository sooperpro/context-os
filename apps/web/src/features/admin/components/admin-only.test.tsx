import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { AdminOnly } from "@/features/admin/components/admin-only";
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

describe("AdminOnly", () => {
  it.each(["owner", "admin"])("shows an admin page to the %s", async (role) => {
    asRole(role);
    renderWithProviders(
      <AdminOnly>
        <p>Members and roles</p>
      </AdminOnly>,
    );
    expect(await screen.findByText("Members and roles")).toBeInTheDocument();
  });

  it.each(["hr", "manager", "member", "guest"])(
    "shows the not found page to the %s, not the admin page",
    async (role) => {
      asRole(role);
      renderWithProviders(
        <AdminOnly>
          <p>Members and roles</p>
        </AdminOnly>,
      );
      expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
      expect(screen.queryByText("Members and roles")).not.toBeInTheDocument();
    },
  );

  it("lets a named persona in too, as People Ops is for the audit log", async () => {
    asRole("hr");
    renderWithProviders(
      <AdminOnly alsoFor={["people_ops"]}>
        <p>Audit log</p>
      </AdminOnly>,
    );
    expect(await screen.findByText("Audit log")).toBeInTheDocument();
  });

  it("keeps managers out of the audit log even when People Ops is let in", async () => {
    asRole("manager");
    renderWithProviders(
      <AdminOnly alsoFor={["people_ops"]}>
        <p>Audit log</p>
      </AdminOnly>,
    );
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});
