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
  it("connects Google Drive through the wizard, into Company knowledge unless a project is chosen", async () => {
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
    // Every two days by default, or only on Sync now.
    expect(within(wizard).getByRole("button", { name: "Every 2 days" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(within(wizard).getByRole("button", { name: "Manual only" }));
    expect(
      await within(wizard).findByText(
        "1 folders · syncs when you press Sync now · shared with everyone",
      ),
    ).toBeInTheDocument();
    await user.click(within(wizard).getByRole("button", { name: "Every 2 days" }));
    expect(
      await within(wizard).findByText("1 folders · syncs every 2 days · shared with everyone"),
    ).toBeInTheDocument();
    // No project needed: company-wide documents go to Company knowledge (N-18).
    expect(within(wizard).getByRole("combobox", { name: "Add to project" })).toHaveTextContent(
      "Company knowledge (no project)",
    );
    await user.click(within(wizard).getByRole("button", { name: "Connect and start sync" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.connectBodies).toEqual([
      {
        scopeIds: ["folder-1"],
        frequency: "2d",
        skipOlderThan: "3y",
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
/* The live access-policy contract: one conflict on a synced folder, and a preview that follows it. */
function livePolicies() {
  const folder = {
    kind: "folder",
    id: "scope-comp",
    provider: "google-drive",
    label: "Comp bands · HR",
  };
  const project = {
    kind: "project",
    id: "p-board",
    provider: "contextos",
    label: "Board (project)",
  };
  const policy = (id: string, name: string, groups: string[], conflict: boolean) => ({
    id,
    name,
    effect: "restrict",
    description: `Only ${groups.join(", ")} can open it.`,
    groups,
    sources: [folder],
    locked: false,
    conflict,
    updatedAt: "2026-10-14T09:00:00.000Z",
  });
  const mirror = {
    id: "mirror",
    name: "Mirror source permissions",
    effect: "default",
    description: "Always on.",
    groups: [],
    sources: [],
    locked: true,
    conflict: false,
    updatedAt: null,
  };
  let resolved = false;
  let created: Record<string, unknown> | null = null;
  const posted: unknown[] = [];
  const state = () => {
    const items = [
      mirror,
      policy("p-hr", "People Ops only", ["People Ops"], !resolved),
      ...(resolved ? [] : [policy("p-fin", "Finance leads", ["Finance"], true)]),
      ...(created ? [created] : []),
    ];
    return {
      total: items.length,
      items,
      conflicts: resolved
        ? []
        : [
            {
              id: "folder:scope-comp",
              title: "2 policies cover Comp bands · HR",
              description: "Until you choose, the more open rule applies.",
              options: [
                { id: "p-hr", label: "Keep “People Ops only”", description: "" },
                { id: "p-fin", label: "Keep “Finance leads”", description: "" },
              ],
            },
          ],
      groups: ["Finance", "Leadership", "People Ops"],
      previewPeople: [
        { person: { id: "u-priya", name: "Priya Nair", title: null }, groups: "Finance" },
      ],
      sourceOptions: [project, folder],
    };
  };
  mockServer.use(
    http.get(buildApiUrl("/v1/admin/access-policies"), () => HttpResponse.json(state())),
    http.post(buildApiUrl("/v1/admin/access-conflicts/:id/resolve"), () => {
      resolved = true;
      return HttpResponse.json(state());
    }),
    http.post(buildApiUrl("/v1/admin/access-policies"), async ({ request }) => {
      const body = (await request.json()) as { name: string; groups: string[]; sources: unknown[] };
      posted.push(body);
      created = {
        ...policy("p-new", body.name, body.groups, false),
        sources: [project],
      };
      return HttpResponse.json(created, { status: 201 });
    }),
    http.get(buildApiUrl("/v1/admin/access-preview"), () =>
      HttpResponse.json({
        person: { id: "u-priya", name: "Priya Nair", title: null },
        items: [
          {
            ...folder,
            allowed: !resolved,
            reason: resolved
              ? "“People Ops only” limits it to People Ops"
              : "Allowed by “Finance leads”",
          },
        ],
      }),
    ),
  );
  return { posted };
}

describe("Connector management", () => {
  it("lists every synced folder, syncs now and stops syncing a folder", async () => {
    const api = liveConnectors();
    api.fail();
    let scopes = [
      {
        id: "s1",
        name: "Specs",
        projectId: "11111111-1111-4111-8111-111111111111",
        projectName: "Billing platform",
        connectedBy: "Tom Becker",
        status: "live",
        itemCount: 12,
        lastSyncedAt: "2026-10-14T09:00:00.000Z",
        lastError: null,
        note: "3 Sheets or Slides skipped",
        frequency: "manual",
        visibility: "workspace",
      },
    ];
    const calls: string[] = [];
    mockServer.use(
      http.get(buildApiUrl("/v1/admin/connectors/:id/scopes"), () =>
        HttpResponse.json({ items: scopes }),
      ),
      http.post(buildApiUrl("/v1/admin/connectors/:id/sync"), () => {
        calls.push("sync");
        return HttpResponse.json({ queued: 1 }, { status: 202 });
      }),
      http.delete(buildApiUrl("/v1/admin/connectors/:id/scopes/:scopeId"), ({ params }) => {
        calls.push(`remove:${String(params.scopeId)}`);
        scopes = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderAt("/connectors");

    const drive = await within(
      await screen.findByRole("list", { name: "Connected sources" }),
    ).findByRole("article", { name: "Google Drive" });
    // A failing card offers Fix; open Manage from the catalog instead.
    expect(within(drive).getByRole("button", { name: "Fix" })).toBeInTheDocument();
    const catalog = screen.getByRole("list", { name: "Catalog" });
    await user.click(
      within(within(catalog).getByRole("article", { name: "Google Drive" })).getByRole("button", {
        name: "Manage",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Manage Google Drive" });
    expect(
      await within(dialog).findByText(
        "Feeds Billing platform · connected by Tom Becker · syncs when you press Sync now · shared with everyone",
      ),
    ).toBeInTheDocument();
    // What the last sync left out, so nobody wonders where a file went.
    expect(within(dialog).getByText("3 Sheets or Slides skipped")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Sync now" }));
    await user.click(within(dialog).getByRole("button", { name: "Stop syncing Specs" }));
    expect(await within(dialog).findByText(/No folders are synced yet/)).toBeInTheDocument();
    expect(calls).toEqual(["sync", "remove:s1"]);
  });
});

describe("Access policies", () => {
  it("resolves the conflict and the preview follows", async () => {
    livePolicies();
    const user = userEvent.setup();
    renderAt("/access");

    expect(await screen.findByText("2 policies cover Comp bands · HR")).toBeInTheDocument();
    expect(screen.getByText("3 policies · 3 shown")).toBeInTheDocument();
    const preview = screen.getByRole("region", { name: /Preview access/ });
    expect(await within(preview).findByText("Allowed by “Finance leads”")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Resolve" }));
    const dialog = await screen.findByRole("dialog", { name: "Resolve the conflict" });
    expect(within(dialog).getByRole("radio", { name: /Keep “People Ops only”/ })).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(screen.queryByText("2 policies cover Comp bands · HR")).not.toBeInTheDocument(),
    );
    expect(
      await within(preview).findByText("“People Ops only” limits it to People Ops"),
    ).toBeInTheDocument();
  });

  it("creates a policy for chosen groups and sources", async () => {
    const api = livePolicies();
    const user = userEvent.setup();
    renderAt("/access");

    await screen.findByText("3 policies · 3 shown");
    await user.click(screen.getByRole("button", { name: "New policy" }));
    const dialog = await screen.findByRole("dialog", { name: "New policy" });
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Board materials");
    await user.click(within(dialog).getByRole("button", { name: "Leadership" }));
    expect(within(dialog).getByRole("button", { name: "Create policy" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Board (project)" }));
    await user.click(within(dialog).getByRole("button", { name: "Create policy" }));
    expect(await screen.findByText("Board materials")).toBeInTheDocument();
    expect(api.posted).toEqual([
      {
        name: "Board materials",
        effect: "restrict",
        groups: ["Leadership"],
        sources: [{ kind: "project", id: "p-board" }],
      },
    ]);
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

  it("shows HR the People Ops trail with its own wording and no area filters", async () => {
    mockServer.use(
      http.get(buildApiUrl("/v1/workspaces/current"), () =>
        HttpResponse.json({
          id: "ws",
          name: "Tessellate",
          role: "hr",
          authentication: "development",
        }),
      ),
      http.get(buildApiUrl("/v1/audit"), () =>
        HttpResponse.json({
          items: [
            {
              id: "h1",
              projectId: null,
              actorId: "u4",
              actorName: "Elena Brooks",
              action: "probation.decision",
              targetType: "onboarding_record",
              targetId: "r1",
              metadata: { outcome: "confirmed" },
              createdAt: new Date(Date.now() - 3_600_000).toISOString(),
            },
            {
              id: "h2",
              projectId: null,
              actorId: "u4",
              actorName: "Elena Brooks",
              action: "onboarding.template.publish",
              targetType: "onboarding_template",
              targetId: "t1",
              metadata: { version: "v2", note: "New security module" },
              createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
            },
          ],
        }),
      ),
    );
    renderAt("/audit");

    const events = await screen.findByRole("region", { name: /Events/ });
    expect(
      await within(events).findByRole("button", { name: /Recorded an employment decision/ }),
    ).toBeInTheDocument();
    expect(
      within(events).getByRole("button", { name: /Published an onboarding template/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Every onboarding, probation and template change/)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filter by category" })).not.toBeInTheDocument();
  });
});
