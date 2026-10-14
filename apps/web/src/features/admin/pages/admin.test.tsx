import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  AssistantContext,
  type AssistantContextValue,
} from "@/components/layout/assistant-context";
import { AccessPage } from "@/features/admin/pages/access-page";
import { AiSettingsPage } from "@/features/admin/pages/ai-settings-page";
import { AuditPage } from "@/features/admin/pages/audit-page";
import { ConnectorsPage } from "@/features/admin/pages/connectors-page";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

function renderAt(route: string) {
  const assistant: AssistantContextValue = {
    open: false,
    openAssistant: vi.fn(),
    closeAssistant: vi.fn(),
    toggleAssistant: vi.fn(),
    wide: false,
    toggleWide: vi.fn(),
    showBotDemo: vi.fn(),
    subscribeToRequests: () => () => undefined,
  };
  renderWithProviders(
    <AssistantContext value={assistant}>
      <Routes>
        <Route path="/connectors" element={<ConnectorsPage />} />
        <Route path="/access" element={<AccessPage />} />
        <Route path="/ai" element={<AiSettingsPage />} />
        <Route path="/audit" element={<AuditPage />} />
      </Routes>
    </AssistantContext>,
    { route },
  );
}

describe("Connectors", () => {
  it("summarizes connections and connects a new source through the wizard", async () => {
    const user = userEvent.setup();
    renderAt("/connectors");

    const connected = await screen.findByRole("list", { name: "Connected sources" });
    expect(within(connected).getAllByRole("article")).toHaveLength(5);
    expect(within(connected).getByRole("article", { name: "Jira" })).toHaveTextContent("Failing");
    expect(screen.getByRole("group", { name: "Summary" })).toHaveTextContent("Connected5");

    await user.click(screen.getByRole("button", { name: "Connect Notion" }));
    const wizard = await screen.findByRole("dialog", { name: "Connect Notion" });
    expect(within(wizard).getByText("Read sharing permissions")).toBeInTheDocument();
    await user.click(within(wizard).getByRole("button", { name: "Continue with Notion" }));
    expect(await within(wizard).findByText("Connected as tom@tessellate.io")).toBeInTheDocument();
    await user.click(within(wizard).getByRole("checkbox", { name: /Design/ }));
    await user.click(within(wizard).getByRole("button", { name: "Next" }));
    await user.click(within(wizard).getByRole("button", { name: "Daily" }));
    expect(
      within(wizard).getByText("2 teamspaces · syncs daily · permissions mirrored"),
    ).toBeInTheDocument();
    await user.click(within(wizard).getByRole("button", { name: "Connect and start sync" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const notion = await within(screen.getByRole("list", { name: "Connected sources" })).findByRole(
      "article",
      { name: "Notion" },
    );
    expect(notion).toHaveTextContent("Syncing");
  });

  it("reconnects a failing source and filters the catalog", async () => {
    const user = userEvent.setup();
    renderAt("/connectors");

    const jira = await within(
      await screen.findByRole("list", { name: "Connected sources" }),
    ).findByRole("article", { name: "Jira" });
    await user.click(within(jira).getByRole("button", { name: "Fix" }));
    expect(
      await within(screen.getByRole("list", { name: "Connected sources" })).findByText(
        "Re-syncing 3 projects",
      ),
    ).toBeInTheDocument();

    const catalog = screen.getByRole("list", { name: "Catalog" });
    await user.click(screen.getByRole("button", { name: "Design" }));
    expect(
      within(catalog)
        .getAllByRole("article")
        .map((card) => card.getAttribute("aria-label")),
    ).toEqual(["Figma"]);
    await user.click(screen.getByRole("button", { name: "All" }));
    await user.type(screen.getByRole("searchbox", { name: "Search connectors" }), "sharepoint");
    expect(await screen.findByText("No connectors match “sharepoint”")).toBeInTheDocument();
  });
});

describe("Access policies", () => {
  it("resolves the conflict and the preview follows", async () => {
    const user = userEvent.setup();
    renderAt("/access");

    expect(
      await screen.findByText("Two policies disagree about the Comp bands folder"),
    ).toBeInTheDocument();
    expect(screen.getByText("14 policies · 8 shown")).toBeInTheDocument();
    const preview = screen.getByRole("region", { name: /Preview access/ });
    await user.click(await within(preview).findByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /Priya Nair/ }));
    expect(
      await within(preview).findByText("Finance · Restricted (conflicts with HR · Confidential)"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Resolve" }));
    const dialog = await screen.findByRole("dialog", { name: "Resolve the conflict" });
    expect(within(dialog).getByRole("radio", { name: /Keep it People Ops only/ })).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Two policies disagree about the Comp bands folder"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Conflict")).not.toBeInTheDocument();
    const row = (await within(preview).findAllByText("HR shared drive / Comp bands"))[0]!.closest(
      "li",
    )!;
    await waitFor(() => expect(row).toHaveTextContent("No access"));
  });

  it("creates a policy", async () => {
    const user = userEvent.setup();
    renderAt("/access");

    expect(await screen.findByText("14 policies · 8 shown")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New policy" }));
    const dialog = await screen.findByRole("dialog", { name: "New policy" });
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Board materials");
    await user.click(within(dialog).getByRole("button", { name: "Leadership" }));
    await user.click(within(dialog).getByRole("button", { name: "Create policy" }));
    expect(await screen.findByText("Board materials")).toBeInTheDocument();
    expect(screen.getByText("15 policies · 9 shown")).toBeInTheDocument();
  });
});

describe("AI settings", () => {
  it("changes answer rules and strictness", async () => {
    const user = userEvent.setup();
    renderAt("/ai");

    const rule = await screen.findByRole("switch", { name: /Cite sources in every answer/ });
    expect(rule).toBeChecked();
    // Base UI marks a disabled switch with aria-disabled.
    expect(
      screen.getByRole("switch", { name: /Answer only from sources the person can access/ }),
    ).toHaveAttribute("aria-disabled", "true");
    await user.click(rule);
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: /Cite sources in every answer/ }),
      ).not.toBeChecked(),
    );

    await user.click(screen.getByRole("button", { name: "Strict" }));
    expect(await screen.findByText(/two or more sources agree/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Strict" })).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("list", { name: "Reasons, share of unhelpful ratings" }),
    ).toHaveTextContent("Out of date41%");
  });
});

describe("Audit log", () => {
  it("lists the newest events first, filters them and shows details", async () => {
    const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
    mockServer.use(
      http.get(buildApiUrl("/v1/audit"), () =>
        HttpResponse.json({
          items: [
            {
              id: "a1",
              projectId: null,
              actorId: "u2",
              actorName: "Tom Becker",
              action: "connector.connect",
              targetType: "connector",
              targetId: "c1",
              metadata: { provider: "google-drive" },
              createdAt: at(30),
            },
            {
              id: "a2",
              projectId: null,
              actorId: "u2",
              actorName: "Tom Becker",
              action: "user.update",
              targetType: "user",
              targetId: "u1",
              metadata: { role: "manager" },
              createdAt: at(2),
            },
            {
              id: "a3",
              projectId: null,
              actorId: "u4",
              actorName: "Elena Brooks",
              action: "onboarding.outcome",
              targetType: "plan",
              targetId: "p1",
              metadata: null,
              createdAt: at(24 * 20),
            },
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    renderAt("/audit");

    const events = await screen.findByRole("region", { name: /Events/ });
    const rows = await within(events).findAllByRole("button", { expanded: false });
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Changed someone's role or status"),
      expect.stringContaining("Connected a knowledge source"),
    ]);

    await user.click(screen.getByRole("button", { name: "30 days" }));
    expect(await within(events).findByText("Recorded a probation outcome")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Connectors" }));
    expect(within(events).getAllByRole("button", { expanded: false })).toHaveLength(1);

    await user.click(within(events).getByRole("button", { name: /Connected a knowledge source/ }));
    expect(within(events).getByText("google-drive")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search the audit log" }), "elena");
    expect(await within(events).findByText("No events match these filters.")).toBeInTheDocument();
  });
});
