import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  AssistantContext,
  type AssistantContextValue,
} from "@/components/layout/assistant-context";
import { SearchPage } from "@/features/search/pages/search-page";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

describe("SearchPage", () => {
  it("lists results by type, opens sources on their project, and offers Context Bot", async () => {
    let types: string | null = null;
    mockServer.use(
      http.get(buildApiUrl("/v1/search"), ({ request }) => {
        types = new URL(request.url).searchParams.get("types");
        return HttpResponse.json({
          total: 2,
          facets: { context_item: 1, source: 1, project: 0, person: 0 },
          items: [
            {
              type: "context_item",
              id: "i1",
              projectId: "p1",
              title: "Move billing to the ledger",
              snippet: "Decided in March",
              link: "/projects/billing/items/i1",
            },
            {
              type: "source",
              id: "s1",
              projectId: "p1",
              title: "ADR-0007",
              snippet: "",
              link: "/projects/billing/sources/s1",
            },
          ],
        });
      }),
    );
    const openAssistant = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <AssistantContext value={{ openAssistant } as unknown as AssistantContextValue}>
        <Routes>
          <Route path="/search" element={<SearchPage />} />
        </Routes>
      </AssistantContext>,
      { route: "/search?q=billing" },
    );
    const source = await screen.findByText("ADR-0007");
    // Only types the app has pages for are asked for.
    expect(types).toBe("context_item,source,project,person");
    expect(source.closest("a")).toHaveAttribute("href", "/projects/billing/sources");
    await user.click(screen.getByRole("button", { name: /^Sources 1/ }));
    expect(screen.queryByText("Move billing to the ledger")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ask Context Bot" }));
    expect(openAssistant).toHaveBeenCalledWith("billing");
  });
});
