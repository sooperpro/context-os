import type {
  AnswerStrictness,
  AuditEntry,
  ConnectorCategory,
  ConnectorState,
  PolicyEffect,
  SyncFrequency,
} from "@contextos/shared";
import {
  BlockIcon,
  CableIcon,
  CheckCircleIcon,
  DescriptionIcon,
  DomainIcon,
  ErrorIcon,
  FolderIcon,
  ForumIcon,
  GroupsIcon,
  HistoryIcon,
  HowToRegIcon,
  LinkOffIcon,
  LockIcon,
  ManageAccountsIcon,
  PolicyIcon,
  RouteIcon,
  SyncIcon,
  TuneIcon,
  VerifiedIcon,
  type MaterialIcon,
} from "@/components/ui/icons";

/** How the admin's workspace screens read (Members & roles, Connectors, Access, AI, Audit). Data only. */

export const MEMBERS_PATH = "/members";
export const CONNECTORS_PATH = "/connectors";
export const ACCESS_PATH = "/access";
export const AI_SETTINGS_PATH = "/ai";
export const AUDIT_PATH = "/audit";

type Tone = "success" | "info" | "error" | "neutral" | "warning";

/* ---- Connectors ---------------------------------------------------------------------------- */

export const CONNECTOR_CATEGORY: Record<ConnectorCategory, string> = {
  files: "Files & docs",
  wiki: "Wikis",
  chat: "Chat & meetings",
  eng: "Engineering",
  pm: "Project management",
  design: "Design",
  crm: "CRM & support",
  other: "Other",
};

/** `short` on a connected card, `long` in the catalog (prototype `CON_STATE`). */
export const CONNECTOR_STATE: Record<
  ConnectorState,
  { tone: Tone; icon: MaterialIcon; short: string; long: string }
> = {
  healthy: { tone: "success", icon: CheckCircleIcon, short: "Healthy", long: "Connected" },
  syncing: { tone: "info", icon: SyncIcon, short: "Syncing", long: "Syncing" },
  error: { tone: "error", icon: ErrorIcon, short: "Failing", long: "Needs attention" },
  available: { tone: "neutral", icon: LinkOffIcon, short: "Not connected", long: "Not connected" },
};

/** Sync schedule choices; syncing always runs in the background, never on a page load. */
export const SYNC_FREQUENCY: Record<SyncFrequency, string> = {
  "2d": "Every 2 days",
  manual: "Manual only",
};

/** The schedule in a sentence: "syncs every 2 days". */
export const SYNC_PHRASE: Record<SyncFrequency, string> = {
  "2d": "syncs every 2 days",
  manual: "syncs when you press Sync now",
};

/* ---- Access policies ----------------------------------------------------------------------- */

export const POLICY_EFFECT: Record<
  PolicyEffect,
  { label: string; tone: Tone; icon: MaterialIcon }
> = {
  default: { label: "Default", tone: "success", icon: VerifiedIcon },
  restrict: { label: "Restrict", tone: "info", icon: LockIcon },
  exclude: { label: "Exclude", tone: "error", icon: BlockIcon },
};

/* ---- AI settings ---------------------------------------------------------------------------- */

export const STRICTNESS: Record<AnswerStrictness, { label: string; description: string }> = {
  strict: {
    label: "Strict",
    description: "Answers only when two or more sources agree. Fewer answers, fewer mistakes.",
  },
  balanced: {
    label: "Balanced",
    description: "Answers when at least one verified source supports it. Recommended.",
  },
  lenient: {
    label: "Lenient",
    description: "Answers from any matching source and labels weak ones as unverified.",
  },
};

/* ---- Members & roles ------------------------------------------------------------------------ */

/**
 * What each persona can do in ContextOS (prototype "What each role can do"). Product copy: the API
 * enforces it. HR is the `hr` system role; its audit log holds People Ops events only.
 */
export const CAPABILITY_ROLES = ["Employee", "Manager", "HR", "Admin"] as const;
export const CAPABILITIES: Array<[string, [boolean, boolean, boolean, boolean]]> = [
  ["Own onboarding, Knowledge Hub and Context Bot", [true, true, true, true]],
  ["Contribute and suggest knowledge", [true, true, true, true]],
  ["See their team’s onboarding progress", [false, true, true, false]],
  ["Record check-ins and probation recommendations", [false, true, false, false]],
  ["Manage onboarding templates", [false, false, true, false]],
  ["Record employment status decisions", [false, false, true, false]],
  ["Manage connectors, access policies and AI settings", [false, false, false, true]],
  ["View the audit log", [false, false, true, true]],
];

/* ---- Audit log ------------------------------------------------------------------------------ */

export const AUDIT_CATEGORIES = [
  "Access",
  "Roles",
  "Connectors",
  "AI settings",
  "HR records",
  "Content",
  "Other",
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/** The area of a dotted action ("connector.connect" → Connectors), and its icon. */
export function auditArea(action: AuditEntry["action"]): {
  category: AuditCategory;
  icon: MaterialIcon;
} {
  const area = action.split(".")[0];
  switch (area) {
    case "connector":
      return { category: "Connectors", icon: CableIcon };
    case "user":
    case "assignment":
      return { category: "Roles", icon: ManageAccountsIcon };
    case "team":
    case "department":
      return { category: "Roles", icon: GroupsIcon };
    case "policy":
      return { category: "Access", icon: PolicyIcon };
    case "ai":
      return { category: "AI settings", icon: TuneIcon };
    case "onboarding":
    case "probation":
      return { category: "HR records", icon: HowToRegIcon };
    case "path":
    case "milestone":
    case "checkpoint":
      return { category: "HR records", icon: RouteIcon };
    case "source":
      return {
        category: action.startsWith("source.access") ? "Access" : "Content",
        icon: DescriptionIcon,
      };
    case "project":
      return { category: "Content", icon: FolderIcon };
    case "context_item":
    case "correction":
    case "flag":
    case "hub":
      return { category: "Content", icon: DescriptionIcon };
    case "workspace":
      return { category: "Other", icon: DomainIcon };
    case "conversation":
      return { category: "Access", icon: ForumIcon };
    default:
      return { category: "Other", icon: HistoryIcon };
  }
}
