import type {
  AccessConflict,
  AccessPolicy,
  AccessPreview,
  AdminConnector,
  AiSetting,
  AiSettings,
  PersonRef,
  RoleRequest,
} from "@contextos/shared";
import { ADMIN_ENDPOINTS as E } from "@/features/admin/api/admin.api";
import { HOME_ENDPOINTS as H } from "@/features/home/api/home.api";
import { formatTime } from "@/lib/format";
import { MockNotFoundError, mockGet, mockPatch, mockPost } from "@/mocks/define";
import { people } from "@/mocks/fixtures/people";
import { atFromToday, hoursAgo } from "@/mocks/fixtures/time";

/*
 * The admin's workspace screens beyond what the API serves: seats and directory sync, role requests,
 * the connector catalog, access policies and AI settings (prototype admin.js and the Connectors
 * page). Members, connections and the audit log stay live. One store feeds these pages and the
 * admin's Home cards (security, AI answers). Changes last for the session.
 */

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const param = (value: string | readonly string[] | undefined) =>
  typeof value === "string" ? value : "";

/* ---- Members & roles ------------------------------------------------------------------------- */

const seedRequests = (): RoleRequest[] => [
  {
    id: "rr-sana",
    person: people.sana,
    role: "admin",
    reason: "To manage the GitHub and Jira connectors for Platform.",
    requestedAt: atFromToday(-2, 11),
  },
  {
    id: "rr-priya",
    person: people.priya,
    role: "manager",
    reason: "Leading the new Billing team from November 2.",
    requestedAt: atFromToday(-1, 15),
  },
];

/* ---- Connectors ------------------------------------------------------------------------------ */

interface MockConnector extends AdminConnector {
  /** A sync that advances on its own: started at, how long it takes, and what it reads when done. */
  sync: { startedAt: number; durationMs: number; from: number; doneDetail: string } | null;
}

const scope = (...names: Array<string | [string]>) =>
  names.map((entry) => {
    const name = typeof entry === "string" ? entry : entry[0];
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name,
      restricted: typeof entry !== "string",
    };
  });

const available = (
  seed: Pick<AdminConnector, "id" | "name" | "category" | "description" | "unit" | "scopeOptions"> &
    Partial<Pick<AdminConnector, "popular" | "needsAdminOf">>,
): MockConnector => ({
  popular: false,
  needsAdminOf: null,
  state: "available",
  detail: null,
  lastSyncAt: null,
  progress: null,
  error: null,
  sync: null,
  ...seed,
});

const seedConnectors = (): MockConnector[] => [
  {
    ...available({
      id: "google-drive",
      name: "Google Workspace",
      category: "files",
      description: "Drive, Docs, Sheets and Slides, including shared drives.",
      unit: "Shared drives",
      scopeOptions: scope(
        "Engineering",
        "Product",
        "Platform",
        "Sales",
        ["People Ops"],
        ["Finance"],
      ),
      popular: true,
    }),
    state: "healthy",
    detail: "18,204 files indexed",
    lastSyncAt: minutesAgo(4),
  },
  available({
    id: "onedrive",
    name: "Microsoft OneDrive",
    category: "files",
    description: "Files and folders in OneDrive for Business.",
    unit: "Folders",
    scopeOptions: scope("Engineering", "Product", "Customer Success", ["Leadership"]),
    needsAdminOf: "Microsoft 365",
    popular: true,
  }),
  available({
    id: "dropbox",
    name: "Dropbox",
    category: "files",
    description: "Team folders, files and Paper docs.",
    unit: "Team folders",
    scopeOptions: scope("Design assets", "Marketing", "Operations"),
  }),
  available({
    id: "box",
    name: "Box",
    category: "files",
    description: "Folders and files your teams share in Box.",
    unit: "Folders",
    scopeOptions: scope("Partner docs", "Research", ["Contracts"]),
  }),
  {
    ...available({
      id: "confluence",
      name: "Confluence",
      category: "wiki",
      description: "Spaces, pages, blog posts and attachments.",
      unit: "Spaces",
      scopeOptions: scope("ENG", "PLAT", "PROD", "SUP"),
    }),
    state: "syncing",
    detail: "First sync · 62%",
    lastSyncAt: minutesAgo(3),
    progress: 0.62,
  },
  available({
    id: "notion",
    name: "Notion",
    category: "wiki",
    description: "Pages and databases in your teamspaces.",
    unit: "Teamspaces",
    scopeOptions: scope("Product", "Design", "Operations"),
    popular: true,
  }),
  {
    ...available({
      id: "slack",
      name: "Slack",
      category: "chat",
      description: "Public channels, threads and canvases. Never DMs or private channels.",
      unit: "Channels",
      scopeOptions: scope(
        "#general",
        "#platform-team",
        "#platform-releases",
        "#kestrel",
        "#eng-announcements",
      ),
      popular: true,
    }),
    state: "healthy",
    detail: "42 public channels",
    lastSyncAt: minutesAgo(6),
  },
  available({
    id: "teams",
    name: "Microsoft Teams",
    category: "chat",
    description: "Team channels, posts and meeting transcripts.",
    unit: "Teams",
    scopeOptions: scope("Platform", "Product", "Customer Success"),
    needsAdminOf: "Microsoft 365",
  }),
  available({
    id: "zoom",
    name: "Zoom",
    category: "chat",
    description: "Transcripts from cloud recordings, such as all-hands and demos.",
    unit: "Recordings",
    scopeOptions: scope("All-hands", "Demo days", "Onboarding sessions"),
  }),
  available({
    id: "loom",
    name: "Loom",
    category: "chat",
    description: "Video walkthroughs and their transcripts.",
    unit: "Spaces",
    scopeOptions: scope("Engineering", "Onboarding", "Product demos"),
  }),
  {
    ...available({
      id: "github",
      name: "GitHub",
      category: "eng",
      description: "READMEs, docs folders, pull requests and issues.",
      unit: "Repositories",
      scopeOptions: scope(
        "tessellate/architecture",
        "tessellate/ingest-gateway",
        "tessellate/ledger-service",
        "tessellate/web-app",
        "tessellate/infra",
      ),
      popular: true,
    }),
    state: "healthy",
    detail: "128 repositories",
    lastSyncAt: minutesAgo(12),
  },
  available({
    id: "gitlab",
    name: "GitLab",
    category: "eng",
    description: "Repositories, merge requests and wikis.",
    unit: "Groups",
    scopeOptions: scope("platform", "data", "mobile"),
  }),
  available({
    id: "bitbucket",
    name: "Bitbucket",
    category: "eng",
    description: "Repositories and pull requests.",
    unit: "Workspaces",
    scopeOptions: scope("tessellate", "tessellate-labs"),
  }),
  {
    ...available({
      id: "jira",
      name: "Jira",
      category: "pm",
      description: "Projects, epics and issues, with their history.",
      unit: "Projects",
      scopeOptions: scope("KES", "ING", "BIL", "PLAT", "SUP"),
    }),
    state: "error",
    detail: "8 of 11 projects syncing",
    lastSyncAt: hoursAgo(2),
    error: "Lost access to KES, ING and BIL (403 Forbidden)",
  },
  available({
    id: "linear",
    name: "Linear",
    category: "pm",
    description: "Teams, projects, issues and project updates.",
    unit: "Teams",
    scopeOptions: scope("Platform", "Product", "Growth"),
  }),
  available({
    id: "asana",
    name: "Asana",
    category: "pm",
    description: "Projects, tasks and status updates.",
    unit: "Projects",
    scopeOptions: scope("Launch plans", "Hiring", "Quarterly goals"),
  }),
  available({
    id: "figma",
    name: "Figma",
    category: "design",
    description: "Files, comments and FigJam boards.",
    unit: "Teams",
    scopeOptions: scope("Design system", "Product", "Marketing"),
  }),
  available({
    id: "salesforce",
    name: "Salesforce",
    category: "crm",
    description: "Knowledge articles, accounts and opportunities.",
    unit: "Objects",
    scopeOptions: scope("Knowledge articles", "Accounts", "Opportunities"),
  }),
  available({
    id: "zendesk",
    name: "Zendesk",
    category: "crm",
    description: "Help center articles and support macros.",
    unit: "Content",
    scopeOptions: scope("Help center articles", "Macros", "Community posts"),
  }),
  available({
    id: "web",
    name: "Websites",
    category: "other",
    description: "Crawl internal docs sites and public help pages.",
    unit: "Sites",
    scopeOptions: scope("docs.tessellate.io", "status.tessellate.io"),
  }),
];

/** Moves a running sync along by the clock, finishing it when its time is up. */
function advance(connector: MockConnector): MockConnector {
  const sync = connector.sync;
  if (!sync) return connector;
  const share = Math.min(
    1,
    sync.from + ((1 - sync.from) * (Date.now() - sync.startedAt)) / sync.durationMs,
  );
  if (share >= 1) {
    Object.assign(connector, {
      state: "healthy",
      detail: sync.doneDetail,
      progress: null,
      lastSyncAt: new Date().toISOString(),
      error: null,
      sync: null,
    });
  } else {
    connector.progress = share;
    connector.detail = connector.detail?.startsWith("Re-syncing")
      ? connector.detail
      : `First sync · ${Math.round(share * 100)}%`;
  }
  return connector;
}

const publicConnector = ({ sync: _sync, ...connector }: MockConnector): AdminConnector => connector;

/* ---- Access policies ------------------------------------------------------------------------- */

const COMP_BANDS = "HR shared drive / Comp bands";

const seedPolicies = (): AccessPolicy[] => [
  {
    id: "p0",
    name: "Mirror source permissions",
    effect: "default",
    description: "People only see items they can open in the source. Always on.",
    groups: ["Everyone"],
    sources: [{ provider: "google-drive", label: "All connected sources" }],
    locked: true,
    conflict: false,
    updatedAt: null,
  },
  policy(
    "p1",
    "Exclude Slack direct messages",
    "exclude",
    "Never indexed, never used in answers.",
    ["Everyone"],
    [["slack", "Direct messages and private channels"]],
  ),
  {
    ...policy(
      "p2",
      "HR · Confidential",
      "restrict",
      "Only People Ops can see the HR shared drive, including the Comp bands folder.",
      ["People Ops"],
      [["google-drive", "HR shared drive"]],
    ),
    conflict: true,
  },
  {
    ...policy(
      "p3",
      "Finance · Restricted",
      "restrict",
      "Finance can see financial models and, since today, the Comp bands folder.",
      ["finance", "finance-leads"],
      [
        ["google-drive", "Finance shared drive"],
        ["google-drive", COMP_BANDS],
      ],
    ),
    conflict: true,
    updatedAt: atFromToday(0, 10, 12),
  },
  policy(
    "p4",
    "Exclude the Legal Jira project",
    "exclude",
    "Legal matters stay out of search and answers.",
    ["Everyone"],
    [["jira", "LEGAL project"]],
  ),
  policy(
    "p5",
    "Platform on-call handbook",
    "restrict",
    "Escalation contacts and phone numbers stay with the team.",
    ["Platform"],
    [["confluence", "PLAT / On-call"]],
  ),
  policy(
    "p6",
    "Leadership folder",
    "restrict",
    "Board materials and plans.",
    ["Leadership"],
    [["onedrive", "Leadership"]],
  ),
  policy(
    "p7",
    "Customer contracts",
    "restrict",
    "Signed agreements and order forms.",
    ["Sales", "Legal"],
    [["box", "Contracts"]],
  ),
];

function policy(
  id: string,
  name: string,
  effect: AccessPolicy["effect"],
  description: string,
  groups: string[],
  sources: Array<[string, string]>,
): AccessPolicy {
  return {
    id,
    name,
    effect,
    description,
    groups,
    sources: sources.map(([provider, label]) => ({ provider, label })),
    locked: false,
    conflict: false,
    updatedAt: null,
  };
}

const CONFLICT: AccessConflict = {
  id: "comp-bands",
  title: "Two policies disagree about the Comp bands folder",
  description:
    "“Finance · Restricted” lets finance-leads see it, but “HR · Confidential” limits it to People Ops. The more open rule wins until you resolve it.",
  options: [
    {
      id: "hr",
      label: "Keep it People Ops only",
      description: "Remove Comp bands from “Finance · Restricted”",
    },
    {
      id: "finance",
      label: "Allow finance-leads",
      description: "Add finance-leads to “HR · Confidential”",
    },
  ],
};

/** Policies not listed here: per-project rules. */
const OTHER_POLICIES = 6;
const GROUPS = [
  "Everyone",
  "People Ops",
  "finance",
  "finance-leads",
  "Platform",
  "Leadership",
  "Sales",
  "Legal",
];
const PREVIEW_PEOPLE = [
  { person: people.maya, groups: "Platform" },
  { person: people.elena, groups: "People Ops" },
  { person: people.priya, groups: "Billing, finance-leads" },
];

type Row = [provider: string, label: string, allowed: boolean, reason: string];

function previewRows(personId: string, resolution: string | null): Row[] {
  switch (personId) {
    case people.elena.id:
      return [
        ["google-drive", "HR shared drive", true, "HR · Confidential"],
        ["google-drive", "Finance shared drive", false, "Finance · Restricted"],
        ["slack", "Public channels", true, "Mirrored from Slack"],
        ["slack", "Direct messages", false, "Exclude Slack direct messages"],
        ["confluence", "PLAT / On-call", false, "Platform on-call handbook"],
        ["onedrive", "Leadership", false, "Leadership folder"],
      ];
    case people.priya.id:
      return [
        ["google-drive", "Finance shared drive", true, "Finance · Restricted"],
        resolution === "hr"
          ? ["google-drive", COMP_BANDS, false, "HR · Confidential"]
          : resolution === "finance"
            ? ["google-drive", COMP_BANDS, true, "HR · Confidential (finance-leads added)"]
            : [
                "google-drive",
                COMP_BANDS,
                true,
                "Finance · Restricted (conflicts with HR · Confidential)",
              ],
        ["google-drive", "HR shared drive (rest)", false, "HR · Confidential"],
        ["slack", "Public channels", true, "Mirrored from Slack"],
        ["box", "Contracts", false, "Customer contracts"],
      ];
    default:
      return [
        [
          "google-drive",
          "Engineering and Platform shared drives",
          true,
          "Mirrored from Google Workspace",
        ],
        ["google-drive", "HR shared drive", false, "HR · Confidential"],
        ["google-drive", "Finance shared drive", false, "Finance · Restricted"],
        ["slack", "Public channels", true, "Mirrored from Slack"],
        ["slack", "Direct messages", false, "Exclude Slack direct messages"],
        ["confluence", "PLAT / On-call", true, "Platform on-call handbook"],
        ["onedrive", "Leadership", false, "Leadership folder"],
        ["jira", "LEGAL project", false, "Exclude the Legal Jira project"],
      ];
  }
}

/* ---- AI settings ----------------------------------------------------------------------------- */

const seedRules = (): AiSetting[] => [
  {
    id: "cite_sources",
    label: "Cite sources in every answer",
    detail: "Answers without a source are shown as “not found”.",
    enabled: true,
    locked: false,
  },
  {
    id: "access_only",
    label: "Answer only from sources the person can access",
    detail: "Required. Enforced by connector permissions.",
    enabled: true,
    locked: true,
  },
  {
    id: "route_unanswered",
    label: "Route unanswered questions to knowledge owners",
    detail: "Creates knowledge gaps for team owners.",
    enabled: true,
    locked: false,
  },
  {
    id: "include_dms",
    label: "Include Slack direct messages",
    detail: "Off by policy.",
    enabled: false,
    locked: true,
  },
  {
    id: "pause_during_checks",
    label: "Pause during knowledge checks",
    detail: "Context Bot won’t answer while a check is open.",
    enabled: true,
    locked: false,
  },
];

type AiState = Omit<
  AiSettings,
  "stats" | "excluded" | "unhelpfulReasons" | "unhelpfulNote" | "unanswered"
>;

const seedAi = (): AiState => ({
  rules: seedRules(),
  strictness: "balanced",
  staleAfterHours: 2,
  routeAfterAsks: 3,
  weeklyDigest: true,
});

const AI_STATS = {
  helpfulRate: 0.87,
  withSources: 0.94,
  noAnswer: 0.06,
  ratings: 2413,
  periodDays: 30,
};

/* ---- State ------------------------------------------------------------------------------------- */

let requests = seedRequests();
let lastDirectorySync = atFromToday(0, 8);
let connectors = seedConnectors();
let policies = seedPolicies();
let resolution: string | null = null;
let ai = seedAi();
let created = 0;

export function resetAdminMocks(): void {
  requests = seedRequests();
  lastDirectorySync = atFromToday(0, 8);
  connectors = seedConnectors();
  policies = seedPolicies();
  resolution = null;
  ai = seedAi();
  created = 0;
}

const findConnector = (id: string) => {
  const found = connectors.find((entry) => entry.id === id);
  if (!found) throw new MockNotFoundError("Connector");
  return found;
};

function policyList() {
  return {
    total: policies.length + OTHER_POLICIES,
    items: policies,
    conflicts: resolution ? [] : [CONFLICT],
    groups: GROUPS,
    previewPeople: PREVIEW_PEOPLE,
  };
}

function aiSettings(): AiSettings {
  const excluded = policies
    .filter((entry) => entry.effect === "exclude" || entry.id === "p2")
    .map((entry) => ({
      provider: entry.sources[0]?.provider ?? "web",
      label:
        entry.id === "p1"
          ? "Slack direct messages and private channels"
          : entry.id === "p4"
            ? "Jira · LEGAL project"
            : (entry.sources[0]?.label ?? entry.name),
      reason:
        entry.id === "p2"
          ? `Policy: ${entry.name} (People Ops can still search it)`
          : `Policy: ${entry.name}`,
    }));
  return {
    ...ai,
    stats: AI_STATS,
    excluded,
    unhelpfulReasons: [
      { reason: "Out of date", share: 0.41 },
      { reason: "Missing a source", share: 0.27 },
      { reason: "Incorrect", share: 0.19 },
      { reason: "Not relevant", share: 0.13 },
    ],
    unhelpfulNote: "Most “out of date” ratings cite Jira pages from the 2-hour sync outage.",
    unanswered: [
      { question: "How do I roll back a Kestrel deploy?", asks: 7, routedTo: "Platform" },
      { question: "Which service owns carrier webhooks?", asks: 4, routedTo: "Platform" },
      { question: "How do I get staging database access?", asks: 3, routedTo: "IT" },
      {
        question: "What’s the travel policy for customer visits?",
        asks: 3,
        routedTo: "People Ops",
      },
    ],
  };
}

const ROLE_NAME = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  member: "Member",
  guest: "Guest",
} as const;

/* ---- Endpoints --------------------------------------------------------------------------------- */

export const adminPageMocks = [
  // The admin Home's cards, from the same store.
  mockGet(H.security)(() => {
    const conflicts = resolution ? 0 : 1;
    return {
      items: [
        { id: "sso", value: "Google Workspace · enforced", state: "ok" },
        { id: "scim", value: `On · last run ${formatTime(lastDirectorySync)}`, state: "ok" },
        {
          id: "access_policies",
          value: `${policies.length + OTHER_POLICIES} active · ${conflicts ? "1 conflict" : "no conflicts"}`,
          state: conflicts ? "attention" : "ok",
        },
        {
          id: "role_requests",
          value: requests.length
            ? `${requests.map((entry) => ROLE_NAME[entry.role]).join(", ")} · ${requests.length} pending`
            : "None pending",
          state: requests.length ? "attention" : "ok",
        },
      ],
    };
  }),
  mockGet(H.ai)(() => ({
    helpfulRate: AI_STATS.helpfulRate,
    ratings: AI_STATS.ratings,
    periodDays: AI_STATS.periodDays,
    settings: ai.rules.filter((rule) => rule.id !== "pause_during_checks"),
  })),

  mockGet(E.membersOverview)(() => ({
    seats: { used: 412, total: 450 },
    directorySync: { provider: "Google Workspace", enabled: true, lastRunAt: lastDirectorySync },
  })),
  mockPost(E.directorySync)(() => {
    lastDirectorySync = new Date().toISOString();
    return { ranAt: lastDirectorySync, created: 0, updated: 0, deactivated: 0 };
  }),
  mockGet(E.roleRequests)(() => ({ items: requests })),
  mockPost(E.decideRoleRequest)((input, { params }) => {
    const id = param(params.id);
    if (!requests.some((entry) => entry.id === id)) throw new MockNotFoundError("Role request");
    requests = requests.filter((entry) => entry.id !== id);
    return { id, decision: input.decision };
  }),

  mockGet(E.connectors)(() => ({
    items: connectors.map((entry) => publicConnector(advance(entry))),
  })),
  mockPost(E.authorize)((_input, { params }) => {
    findConnector(param(params.id));
    return { account: "tom@tessellate.io" };
  }),
  mockPost(E.connect)((input, { params }) => {
    const connector = findConnector(param(params.id));
    const count = input.scopeIds.filter((id) =>
      connector.scopeOptions.some((option) => option.id === id),
    ).length;
    Object.assign(connector, {
      state: "syncing",
      detail: "First sync · 4%",
      progress: 0.04,
      lastSyncAt: new Date().toISOString(),
      error: null,
      sync: {
        startedAt: Date.now(),
        durationMs: 6000,
        from: 0.04,
        doneDetail: `${count} ${connector.unit.toLowerCase()} indexed`,
      },
    });
    return publicConnector(connector);
  }),
  mockPost(E.reconnect)((_input, { params }) => {
    const connector = findConnector(param(params.id));
    Object.assign(connector, {
      state: "syncing",
      detail: "Re-syncing 3 projects",
      progress: 0.15,
      error: null,
      sync: {
        startedAt: Date.now(),
        durationMs: 2600,
        from: 0.15,
        doneDetail: "11 of 11 projects syncing",
      },
    });
    return publicConnector(connector);
  }),
  mockPost(E.requestConnector)(() => ({ id: `req-${++created}` }), 201),

  mockGet(E.policies)(() => policyList()),
  mockPost(E.createPolicy)((input) => {
    const entry: AccessPolicy = {
      id: `p-new-${++created}`,
      name: input.name,
      effect: input.effect,
      description: "New policy. Choose its sources next.",
      groups: input.groups,
      sources: [],
      locked: false,
      conflict: false,
      updatedAt: new Date().toISOString(),
    };
    policies = [...policies, entry];
    return entry;
  }, 201),
  mockPatch(E.updatePolicy)((input, { params }) => {
    const entry = policies.find((item) => item.id === param(params.id));
    if (!entry || entry.locked) throw new MockNotFoundError("Policy");
    Object.assign(entry, {
      name: input.name,
      effect: input.effect,
      groups: input.groups,
      updatedAt: new Date().toISOString(),
    });
    return entry;
  }),
  mockPost(E.resolveConflict)((input, { params }) => {
    if (param(params.id) !== CONFLICT.id || resolution) throw new MockNotFoundError("Conflict");
    resolution = input.optionId;
    policies = policies.map((entry) => ({ ...entry, conflict: false }));
    const finance = policies.find((entry) => entry.id === "p3");
    const hr = policies.find((entry) => entry.id === "p2");
    if (input.optionId === "hr" && finance) {
      finance.sources = finance.sources.filter((source) => source.label !== COMP_BANDS);
      finance.description = "Finance can see financial models.";
      finance.updatedAt = new Date().toISOString();
    } else if (hr) {
      hr.groups = [...hr.groups, "finance-leads"];
      hr.updatedAt = new Date().toISOString();
    }
    return policyList();
  }),
  mockGet(E.preview)(({ request }) => {
    const personId = new URL(request.url).searchParams.get("personId") ?? people.maya.id;
    const person: PersonRef =
      PREVIEW_PEOPLE.find((entry) => entry.person.id === personId)?.person ?? people.maya;
    const items = previewRows(person.id, resolution).map(([provider, label, allowed, reason]) => ({
      provider,
      label,
      allowed,
      reason,
    }));
    return { person, items } satisfies AccessPreview;
  }),

  mockGet(E.aiSettings)(() => aiSettings()),
  mockPatch(E.updateAiSettings)((input) => {
    ai = {
      ...ai,
      rules: ai.rules.map((rule) => {
        const next = input.rules?.[rule.id];
        return next === undefined || rule.locked ? rule : { ...rule, enabled: next };
      }),
      strictness: input.strictness ?? ai.strictness,
      staleAfterHours: input.staleAfterHours ?? ai.staleAfterHours,
      routeAfterAsks: input.routeAfterAsks ?? ai.routeAfterAsks,
      weeklyDigest: input.weeklyDigest ?? ai.weeklyDigest,
    };
    return aiSettings();
  }),
];
