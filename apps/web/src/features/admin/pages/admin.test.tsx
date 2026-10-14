import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { toast } from "sonner";
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

/* The live connector catalog: Google Drive is implemented, the rest are listed as available. */
const catalogEntry = (id: string, name: string, category: string, state = "available") => ({
  id,
  name,
  category,
  description: `${name} content.`,
  unit: id === "google-drive" ? "Folders" : "Teamspaces",
  scopeOptions: [] as Array<{ id: string; name: string; restricted: boolean }>,
  popular: false,
  needsAdminOf: null,
  state,
  detail: null as string | null,
  lastSyncAt: null as string | null,
  progress: null as number | null,
  error: null as string | null,
});

function liveConnectors() {
  let drive = catalogEntry("google-drive", "Google Drive", "files");
  let granted = false;
  const connectBodies: unknown[] = [];
  const catalog = () => [
    drive,
    catalogEntry("notion", "Notion", "wiki"),
    catalogEntry("figma", "Figma", "design"),
  ];
  mockServer.use(
    http.get(buildApiUrl("/v1/admin/connectors"), () => HttpResponse.json({ items: catalog() })),
    http.post(buildApiUrl("/v1/admin/connectors/:id/authorize"), ({ params }) => {
      if (params.id !== "google-drive")
        return HttpResponse.json(
          {
            error: {
              code: "NOT_CONFIGURED",
              message:
                "Notion isn't available yet. Use “Request a connector” to tell us you need it.",
            },
          },
          { status: 503 },
        );
      granted = true;
      drive = {
        ...drive,
        scopeOptions: [
          { id: "root", name: "My Drive", restricted: false },
          { id: "folder-1", name: "Specs", restricted: false },
        ],
      };
      return HttpResponse.json({ account: "tom@tessellate.io", authorizationUrl: null });
    }),
    http.post(buildApiUrl("/v1/admin/connectors/:id/connect"), async ({ request }) => {
      connectBodies.push(await request.json());
      drive = { ...drive, state: "syncing", detail: "First sync · 0%", progress: null };
      return HttpResponse.json(drive);
    }),
    http.post(buildApiUrl("/v1/admin/connectors/:id/reconnect"), () => {
      drive = { ...drive, state: "syncing", detail: "Syncing · 40%", error: null };
      return HttpResponse.json(drive);
    }),
    http.get(buildApiUrl("/v1/projects"), () =>
      HttpResponse.json({
        items: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            workspaceId: "22222222-2222-4222-8222-222222222222",
            name: "Billing platform",
            slug: "billing-platform",
            description: null,
            createdAt: "2026-10-01T00:00:00.000Z",
            updatedAt: "2026-10-01T00:00:00.000Z",
            stats: {
              sources: 0,
              readySources: 0,
              contextItems: 0,
              questions: 0,
              lastProcessedAt: null,
            },
          },
        ],
      }),
    ),
  );
  return {
    connectBodies,
    granted: () => granted,
    fail: () => {
      drive = {
        ...drive,
        state: "error",
        detail: "0 of 1 folder syncing",
        error: "403 Forbidden on Specs",
      };
    },
  };
}

describe("Connectors", () => {
  it("connects Google Drive into a project through the wizard", async () => {
    const api = liveConnectors();
    const user = userEvent.setup();
    renderAt("/connectors");

    expect(await screen.findByRole("group", { name: "Summary" })).toHaveTextContent("Connected0");
    await user.click(screen.getByRole("button", { name: "Connect Google Drive" }));
    const wizard = await screen.findByRole("dialog", { name: "Connect Google Drive" });
    expect(within(wizard).getByText("Read sharing permissions")).toBeInTheDocument();
    await user.click(within(wizard).getByRole("button", { name: "Continue with Google Drive" }));
    expect(await within(wizard).findByText("Connected as tom@tessellate.io")).toBeInTheDocument();
    expect(api.granted()).toBe(true);
    // The folders arrive with consent; nothing is picked until the admin chooses.
    expect(within(wizard).getByRole("button", { name: "Next" })).toBeDisabled();
    await user.click(await within(wizard).findByRole("checkbox", { name: /Specs/ }));
    await user.click(within(wizard).getByRole("button", { name: "Next" }));
    await user.click(within(wizard).getByRole("button", { name: "Daily" }));
    expect(
      await within(wizard).findByText("1 folders · syncs daily · shared with everyone"),
    ).toBeInTheDocument();
    await user.click(within(wizard).getByRole("button", { name: "Connect and start sync" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.connectBodies).toEqual([
      {
        scopeIds: ["folder-1"],
        frequency: "daily",
        skipOlderThan: "3y",
        projectId: "11111111-1111-4111-8111-111111111111",
        visibility: "workspace",
      },
    ]);
    const drive = await within(screen.getByRole("list", { name: "Connected sources" })).findByRole(
      "article",
      { name: "Google Drive" },
    );
    expect(drive).toHaveTextContent("Syncing");
  });

  it("shows why a listed integration can't connect yet, fixes a failing source and filters", async () => {
    const api = liveConnectors();
    api.fail();
    const error = vi.spyOn(toast, "error");
    const user = userEvent.setup();
    renderAt("/connectors");

    const drive = await within(
      await screen.findByRole("list", { name: "Connected sources" }),
    ).findByRole("article", { name: "Google Drive" });
    expect(drive).toHaveTextContent("403 Forbidden on Specs");
    await user.click(within(drive).getByRole("button", { name: "Fix" }));
    expect(
      await within(screen.getByRole("list", { name: "Connected sources" })).findByText(
        "Syncing · 40%",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Connect Notion" }));
    const wizard = await screen.findByRole("dialog", { name: "Connect Notion" });
    await user.click(within(wizard).getByRole("button", { name: "Continue with Notion" }));
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(expect.stringMatching(/Notion isn't available yet/)),
    );
    await user.click(within(wizard).getByRole("button", { name: "Cancel" }));

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
    const rules = [
      ["cite_sources", "Cite sources in every answer", false],
      ["access_only", "Answer only from sources the person can access", true],
      ["route_unanswered", "Route unanswered questions to knowledge owners", false],
      ["include_dms", "Include Slack direct messages", true],
      ["pause_during_checks", "Pause during knowledge checks", false],
    ] as const;
    let state = {
      stats: { helpfulRate: 0.75, withSources: 0.9, noAnswer: 0.1, ratings: 8, periodDays: 30 },
      rules: rules.map(([id, label, locked]) => ({
        id,
        label,
        detail: "",
        enabled: id !== "include_dms",
        locked,
      })),
      strictness: "balanced",
      staleAfterHours: 2,
      routeAfterAsks: 3,
      weeklyDigest: true,
      excluded: [],
      unhelpfulReasons: [
        { reason: "Out of date", share: 0.5 },
        { reason: "Incorrect", share: 0.5 },
      ],
      unhelpfulNote: null,
      unanswered: [],
    };
    const patches: unknown[] = [];
    mockServer.use(
      http.get(buildApiUrl("/v1/admin/ai-settings"), () => HttpResponse.json(state)),
      http.patch(buildApiUrl("/v1/admin/ai-settings"), async ({ request }) => {
        const input = (await request.json()) as {
          rules?: Record<string, boolean>;
          strictness?: string;
        };
        patches.push(input);
        state = {
          ...state,
          rules: state.rules.map((rule) => ({
            ...rule,
            enabled: input.rules?.[rule.id] ?? rule.enabled,
          })),
          strictness: input.strictness ?? state.strictness,
        };
        return HttpResponse.json(state);
      }),
    );
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
    expect(patches).toEqual([{ rules: { cite_sources: false } }, { strictness: "strict" }]);
    expect(
      screen.getByRole("list", { name: "Reasons, share of unhelpful ratings" }),
    ).toHaveTextContent("Out of date50%");
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
