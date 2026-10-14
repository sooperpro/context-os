import { z } from "zod";
import { IdSchema, IsoDateSchema } from "./common.js";

export const SystemRoleSchema = z.enum(["owner", "admin", "manager", "member", "guest"]);
export type SystemRole = z.infer<typeof SystemRoleSchema>;
export const AssignmentTypeSchema = z.enum([
  "mentor",
  "domain_owner",
  "path_curator",
  "bounty_sponsor",
  "department_head",
  "rewards_approver",
  "review_cycle_admin",
]);
export type AssignmentType = z.infer<typeof AssignmentTypeSchema>;
export const PageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
export const TimezoneSchema = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Invalid IANA timezone");
export const ProfileUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    timezone: TimezoneSchema.optional(),
    /** Symmetric leaderboard opt-out (PRD §8.5 rule 5). */
    leaderboardOptOut: z.boolean().optional(),
    /** Hide tier and reputation from the public profile. */
    hideTier: z.boolean().optional(),
  })
  .strict();
export const UserUpdateSchema = z
  .object({
    role: SystemRoleSchema.optional(),
    status: z.enum(["active", "suspended", "offboarded"]).optional(),
    managerId: z.string().min(1).max(200).nullable().optional(),
    guestExpiresAt: z.iso.datetime().nullable().optional(),
    /** Optional future last day; enables the "capture before you go" flow (PRD §8.11). */
    lastDay: IsoDateSchema.optional(),
  })
  .strict();
export const UserDirectoryQuerySchema = PageQuerySchema.extend({
  /** Empty strings are treated as "no filter" so form inputs can be sent as-is. */
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value === undefined || value === "" ? undefined : value)),
  role: SystemRoleSchema.optional(),
  status: z.enum(["active", "suspended", "offboarded"]).optional(),
  departmentId: IdSchema.optional(),
  teamId: IdSchema.optional(),
});
export const InvitationSchema = z
  .object({
    email: z.email(),
    role: z.enum(["admin", "manager", "member", "guest"]).default("member"),
    name: z.string().trim().max(200).optional(),
    departmentId: IdSchema.optional(),
    teamId: IdSchema.optional(),
    managerId: z.string().min(1).max(200).optional(),
    startDate: IsoDateSchema.optional(),
    isNewHire: z.boolean().default(false),
  })
  .strict();
/** Single invitation or a bulk list (CSV rows parsed client-side). */
export const InviteInputSchema = z.union([
  InvitationSchema,
  z.object({ invitations: z.array(InvitationSchema).min(1).max(200) }).strict(),
]);
export const WorkspaceCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug: z
      .string()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    primaryDomain: z
      .string()
      .toLowerCase()
      .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)
      .max(253)
      .optional(),
    region: z.enum(["us-east-1", "ap-south-1", "eu-central-1"]).default("us-east-1"),
  })
  .strict();

// ----- workspace settings (PRD §7.17 policies, §8.2 overrides, §8.5, §7.12, §7.13) -----

export const GamificationSettingsSchema = z.object({
  /** When false RP is still recorded silently for evidence but not displayed (FR-GAM-011). */
  enabled: z.boolean().default(true),
  leaderboardsEnabled: z.boolean().default(true),
  leaderboardDisabledDepartmentIds: z.array(IdSchema).max(500).default([]),
  /** Guests earn reputation only when enabled (§6.4). */
  guestsCanEarn: z.boolean().default(false),
  /** Multiplier applied to the base point table; admins may override ±50% (§8.2.2). */
  basePointScale: z.number().min(0.5).max(1.5).default(1),
  /** Daily cap on maintenance RP per user (AG-3). */
  dailyMaintenanceCapRp: z.number().int().min(0).max(10000).default(150),
  /** Max concurrent mentees per mentor (FR-MEN-001). */
  maxConcurrentMentees: z.number().int().min(1).max(50).default(3),
  /** Org reward pool reserved by open bounties; 0 disables the budget check. */
  bountyBudgetRp: z.number().int().min(0).default(0),
  /** Auto-created bounties are published without sponsor review (§8.1.3). */
  autoPublishBounties: z.boolean().default(false),
});
export const RewardsSettingsSchema = z.object({
  /** Rewards catalog and Kudos Credits are off by default (decision D3). */
  enabled: z.boolean().default(false),
  /** KC issued per RP earned, default 1 KC per 10 RP (FR-GAM-002). */
  kcPerRp: z.number().min(0).max(1).default(0.1),
  /** Months after which earned credits expire; 0 disables expiry (FR-RWD-006). */
  kcExpiryMonths: z.number().int().min(0).max(120).default(12),
  /** Monthly org-wide KC issuance cap; 0 = unlimited (FR-RWD-003). */
  monthlyIssuanceCapKc: z.number().int().min(0).default(0),
  /** Per-person monthly redemption cap; 0 = unlimited (FR-RWD-003). */
  perPersonMonthlyRedemptionCapKc: z.number().int().min(0).default(0),
});
export const NudgeSettingsSchema = z.object({
  stuckHours: z.number().int().min(1).max(720).default(48),
  inactivityBusinessDays: z.number().int().min(1).max(60).default(5),
  signoffPendingHours: z.number().int().min(1).max(720).default(72),
  maxPerDay: z.number().int().min(0).max(20).default(3),
});
export const RetentionSettingsSchema = z.object({
  askConversationDays: z.number().int().min(1).default(180),
  auditLogDays: z.number().int().min(30).default(365),
  llmLogDays: z.number().int().min(1).default(30),
});
export const PoliciesSettingsSchema = z.object({
  probationDefaultDays: z.number().int().min(1).max(365).default(90),
  /** k-anonymity floor for aggregated Ask gap signals; 3 is the fixed minimum (FR-ASK-014). */
  askKAnonymityThreshold: z.number().int().min(3).max(100).default(3),
  piiRedaction: z.boolean().default(false),
  nudges: NudgeSettingsSchema.prefault({}),
  retention: RetentionSettingsSchema.prefault({}),
});
export const EpmSettingsSchema = z.object({
  /** Phase 2 paid add-on (decision D7). */
  enabled: z.boolean().default(false),
  /** Locations where EPM is disabled for works-council or legal reasons (EP-10). */
  disabledLocations: z.array(z.string().max(200)).max(200).default([]),
  retentionYears: z.number().int().min(1).max(10).default(3),
});
export const TopicTypeSchema = z.enum([
  "architecture",
  "delivery_status",
  "product_requirements",
  "ownership",
  "process",
  "customer_facts",
]);
export type TopicType = z.infer<typeof TopicTypeSchema>;
/** Source kinds ranked highest first per topic (PRD §8.6.2). Canonical sources outrank all. */
export const AuthorityRulesSchema = z.record(
  TopicTypeSchema,
  z.array(z.enum(["ticket", "pull_request", "document", "conversation", "note"])).max(10),
);
export const DEFAULT_AUTHORITY_RULES: z.infer<typeof AuthorityRulesSchema> = {
  architecture: ["pull_request", "document", "ticket", "conversation", "note"],
  delivery_status: ["ticket", "conversation", "document", "note", "pull_request"],
  product_requirements: ["document", "ticket", "conversation", "note", "pull_request"],
  ownership: ["note", "ticket", "pull_request", "document", "conversation"],
  process: ["document", "note", "conversation", "ticket", "pull_request"],
  customer_facts: ["ticket", "conversation", "document", "note", "pull_request"],
};
export const WorkspaceDeletionSchema = z.object({
  scheduledAt: z.iso.datetime(),
  requestedBy: z.string(),
  requestedAt: z.iso.datetime(),
});
/** Resolved workspace settings with every default applied. */
export const WorkspaceSettingsStateSchema = z.object({
  timezone: TimezoneSchema.optional(),
  includeIndirectReports: z.boolean().default(false),
  gamification: GamificationSettingsSchema.prefault({}),
  rewards: RewardsSettingsSchema.prefault({}),
  policies: PoliciesSettingsSchema.prefault({}),
  epm: EpmSettingsSchema.prefault({}),
  authority: AuthorityRulesSchema.default(DEFAULT_AUTHORITY_RULES),
  deletion: WorkspaceDeletionSchema.nullable().default(null),
});
export type WorkspaceSettingsState = z.infer<typeof WorkspaceSettingsStateSchema>;
/** PATCH body: every section is a partial merge; `version` is the optimistic lock. */
export const WorkspaceSettingsSchema = z
  .object({
    version: z.number().int().positive(),
    name: z.string().trim().min(1).max(200).optional(),
    timezone: TimezoneSchema.optional(),
    includeIndirectReports: z.boolean().optional(),
    gamification: GamificationSettingsSchema.partial().optional(),
    rewards: RewardsSettingsSchema.partial().optional(),
    policies: PoliciesSettingsSchema.partial().optional(),
    epm: EpmSettingsSchema.partial().optional(),
    authority: AuthorityRulesSchema.optional(),
  })
  .strict();
export const MemberOrganizationSchema = z
  .object({
    departmentId: z.uuid().nullable().optional(),
    teamId: z.uuid().nullable().optional(),
    jobTitle: z.string().trim().max(200).optional(),
    roleFamily: z
      .enum(["Eng", "Design", "PM", "Sales", "CS", "Ops", "Marketing", "Other"])
      .optional(),
    location: z.string().trim().max(200).optional(),
    timezone: TimezoneSchema.optional(),
    startDate: z.iso.date().nullable().optional(),
    isNewHire: z.boolean().optional(),
  })
  .strict();
export const AssignmentScopeTypeSchema = z.enum(["project", "user", "workspace", "section"]);
export const AssignmentInputSchema = z
  .object({
    userId: z.string().min(1).max(200),
    type: AssignmentTypeSchema,
    /** `section` scope ids use `<projectId>:<sectionKey>` (most specific owner wins, §6.5). */
    scopeType: AssignmentScopeTypeSchema,
    scopeId: z.string().min(1).max(200),
    expiresAt: z.iso.datetime().optional(),
  })
  .strict();
export const SourceAccessInputSchema = z
  .object({
    userId: z.string().min(1).max(200),
    expiresAt: z.iso.datetime().optional(),
  })
  .strict();
export const ThreadInputSchema = z
  .object({
    projectId: z.uuid(),
    sourceId: z.uuid().optional(),
    title: z.string().trim().min(1).max(200).default("New conversation"),
  })
  .strict();
export const CompanionPreferencesSchema = z.object({
  enabled: z.boolean().default(true),
  persona: z.enum(["orbit", "atlas", "minimal_orb"]).default("orbit"),
  tone: z.enum(["encouraging", "concise", "technical"]).default("concise"),
  proactiveNudges: z.boolean().default(false),
  onDemandOnly: z.boolean().default(true),
  snoozedUntil: z.iso.datetime().nullable().default(null),
  excludedDomains: z.array(z.string().max(253)).max(100).default([]),
  /** Sound is off unless explicitly enabled (AA-3). */
  soundEnabled: z.boolean().default(false),
  minimized: z.boolean().default(false),
});
export const FlagTargetTypeSchema = z.enum([
  "context_item",
  "overview",
  "answer",
  "section",
  "path_item",
]);
export const FlagInputSchema = z
  .object({
    projectId: z.uuid(),
    targetType: FlagTargetTypeSchema,
    /** context item id, project id (overview), answer id, section key, or `<pathId>:<itemId>`. */
    targetId: z.string().min(1).max(200),
    kind: z.enum(["stale", "incorrect", "missing_context", "conflicting"]),
    comment: z.string().trim().max(2000).default(""),
    evidenceUrl: z.url().optional(),
  })
  .strict();
export const EventTriggerSchema = z.enum([
  "github.pr.merged",
  "github.pr.review_submitted",
  "jira.issue.transitioned_to_done",
  "jira.issue.created",
  "drive.doc.edited",
  "slack.message.posted_in_channel",
]);
export type EventTrigger = z.infer<typeof EventTriggerSchema>;
export const PathItemInputSchema = z.object({
  id: z.uuid().optional(),
  type: z.enum(["read", "explore", "watch", "meet", "do", "quiz", "reflect", "link"]),
  title: z.string().trim().min(1).max(200),
  objective: z.string().trim().min(1).max(2000),
  /** Optional module / week grouping label (FR-LRN-004). */
  module: z.string().trim().max(100).optional(),
  estMinutes: z.number().int().min(1).max(10080).default(15),
  dueOffsetDays: z.number().int().min(0).max(365).default(0),
  required: z.boolean().default(true),
  prerequisites: z.array(z.uuid()).max(100).default([]),
  verification: z.enum(["engagement", "quiz", "event", "signoff", "self"]).default("signoff"),
  /** Connector event that completes an `event` item (FR-CHK-004). */
  eventTrigger: EventTriggerSchema.optional(),
  sourceId: z.uuid().optional(),
  sourceIds: z.array(z.uuid()).max(1000).optional(),
  url: z.url().optional(),
});
export const PathInputSchema = z
  .object({
    projectId: z.uuid(),
    title: z.string().trim().min(1).max(200),
    roleFamily: z.string().trim().min(1).max(100),
    items: z.array(PathItemInputSchema).min(1).max(200),
  })
  .strict();
export const VersionSchema = z.object({ version: z.number().int().positive() });
export const NotificationCategorySchema = z.enum([
  "onboarding",
  "maintenance",
  "bounties",
  "gamification",
  "system",
  "security",
]);
export type NotificationCategory = z.infer<typeof NotificationCategorySchema>;
const ChannelPrefs = z.object({
  inApp: z.boolean().default(true),
  email: z.boolean().default(false),
  slack: z.boolean().default(false),
});
export const NotificationPreferencesSchema = z.object({
  email: z.boolean().default(false),
  inApp: z.boolean().default(true),
  quietStartHour: z.number().int().min(0).max(23).default(22),
  quietEndHour: z.number().int().min(0).max(23).default(8),
  digestFrequency: z.enum(["daily", "weekly", "off"]).default("weekly"),
  categories: z
    .object({
      onboarding: ChannelPrefs.prefault({}),
      maintenance: ChannelPrefs.prefault({}),
      bounties: ChannelPrefs.prefault({}),
      gamification: ChannelPrefs.prefault({}),
      system: ChannelPrefs.prefault({}),
    })
    .prefault({}),
});
