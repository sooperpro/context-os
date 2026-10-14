import type {
  AccessConflict,
  AccessPolicy,
  AccessPreview,
  PersonRef,
  RoleRequest,
} from "@contextos/shared";
import { ADMIN_ENDPOINTS as E } from "@/features/admin/api/admin.api";
import { MockNotFoundError, mockGet, mockPatch, mockPost } from "@/mocks/define";
import { people } from "@/mocks/fixtures/people";
import { atFromToday } from "@/mocks/fixtures/time";

/*
 * The admin's workspace screens beyond what the API serves: seats and directory sync, role requests
 * and access policies (prototype admin.js). Members, the connector catalog, AI settings, the admin
 * Home cards and the audit log are live. Changes last for the session.
 */

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

/* ---- State ------------------------------------------------------------------------------------- */

let requests = seedRequests();
let lastDirectorySync = atFromToday(0, 8);
let policies = seedPolicies();
let resolution: string | null = null;
let created = 0;

export function resetAdminMocks(): void {
  requests = seedRequests();
  lastDirectorySync = atFromToday(0, 8);
  policies = seedPolicies();
  resolution = null;
  created = 0;
}

function policyList() {
  return {
    total: policies.length + OTHER_POLICIES,
    items: policies,
    conflicts: resolution ? [] : [CONFLICT],
    groups: GROUPS,
    previewPeople: PREVIEW_PEOPLE,
  };
}

/* ---- Endpoints --------------------------------------------------------------------------------- */

export const adminPageMocks = [
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
];
