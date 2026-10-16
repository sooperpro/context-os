import { z } from "zod";
import { IdSchema, IsoDateSchema } from "./common.js";
import { AvatarShapeSchema, PersonalProfileSchema, PROFILE_LIMITS } from "./people.js";
import {
  ScopeStatusSchema,
  ScopeTypeSchema,
  ScopeVisibilitySchema,
  SyncFrequencySchema,
} from "./connectors.js";

export const SystemRoleSchema = z.enum(["owner", "admin", "manager", "hr", "member", "guest"]);
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
    /** What they say about themselves (role access spec §4.9); an empty string clears a field. */
    pronouns: z.string().trim().max(PROFILE_LIMITS.pronouns).optional(),
    location: z.string().trim().max(PROFILE_LIMITS.location).optional(),
    bio: z.string().trim().max(PROFILE_LIMITS.bio).optional(),
    skills: z
      .array(z.string().trim().min(1).max(PROFILE_LIMITS.skill))
      .max(PROFILE_LIMITS.skills)
      .optional(),
    /** Null goes back to the shape picked from their id. */
    avatarShape: AvatarShapeSchema.nullable().optional(),
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
    role: z.enum(["admin", "manager", "hr", "member", "guest"]).default("member"),
    name: z.string().trim().max(200).optional(),
    jobTitle: z.string().trim().max(200).optional(),
    departmentId: IdSchema.optional(),
    teamId: IdSchema.optional(),
    managerId: z.string().min(1).max(200).optional(),
    startDate: IsoDateSchema.optional(),
    isNewHire: z.boolean().default(false),
    /** A guest sees only the projects they're added to: these, once they accept. */
    projectIds: z.array(IdSchema).max(50).optional(),
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
/** `POST /workspaces` body; `region` defaults to us-east-1. */
export type WorkspaceCreateInput = z.input<typeof WorkspaceCreateSchema>;

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
/**
 * How Context Bot answers (`/v1/admin/ai-settings`). `access_only` (always on) and `include_dms`
 * (always off) are fixed by policy and not stored.
 */
export const AiPolicySettingsSchema = z.object({
  rules: z
    .object({
      cite_sources: z.boolean().default(true),
      route_unanswered: z.boolean().default(true),
      pause_during_checks: z.boolean().default(true),
    })
    .prefault({}),
  strictness: z.enum(["strict", "balanced", "lenient"]).default("balanced"),
  staleAfterHours: z.union([z.literal(1), z.literal(2), z.literal(6), z.literal(24)]).default(2),
  routeAfterAsks: z.union([z.literal(2), z.literal(3), z.literal(5)]).default(3),
  weeklyDigest: z.boolean().default(true),
});
export type AiPolicySettings = z.infer<typeof AiPolicySettingsSchema>;
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
  ai: AiPolicySettingsSchema.prefault({}),
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

/** `GET /workspaces/current`: the active workspace, the caller's role in it, and the auth mode. */
export const CurrentWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: SystemRoleSchema,
  /** Same values as `AuthenticationModeSchema` (auth.ts imports this file, so it is not reused). */
  authentication: z.enum(["development", "accounts"]),
  /** Typed to confirm the workspace's deletion (or the name when there is no slug). */
  slug: z.string().nullable().optional(),
  /** A scheduled deletion (owner only, 7-day grace); null or absent when there is none. */
  settings: z
    .object({
      deletion: z
        .object({ scheduledAt: z.string(), requestedBy: z.string(), requestedAt: z.string() })
        .nullable()
        .optional(),
    })
    .optional(),
});
export type CurrentWorkspace = z.infer<typeof CurrentWorkspaceSchema>;

/* ---- Workspace setup wizard (`GET/PATCH /workspaces/current/setup`) ---------------------- */

export const SetupStepSchema = z.enum([
  "connect_source",
  "select_scopes",
  "create_project",
  "invite_team",
  "assign_new_hire",
]);
export type SetupStep = z.infer<typeof SetupStepSchema>;
export const SETUP_STEPS = SetupStepSchema.options;

export const SetupStepStatusSchema = z.enum(["pending", "completed", "skipped"]);
export type SetupStepStatus = z.infer<typeof SetupStepStatusSchema>;

export const SetupUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    step: SetupStepSchema,
    status: SetupStepStatusSchema,
  })
  .strict();
export type SetupUpdate = z.infer<typeof SetupUpdateSchema>;

/** The persisted wizard record. `data.steps` holds only steps that were explicitly set. */
export const SetupRecordSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  status: z.enum(["in_progress", "completed"]),
  data: z.object({
    steps: z.partialRecord(SetupStepSchema, SetupStepStatusSchema).default({}),
  }),
});
export type SetupRecord = z.infer<typeof SetupRecordSchema>;

/** GET also reports what the backend can prove, so steps complete on evidence rather than on a click. */
export const WorkspaceSetupSchema = SetupRecordSchema.extend({
  evidence: z.object({
    completed: z.record(SetupStepSchema, z.boolean()),
    sync: z.object({
      sources: z.number().int().nonnegative(),
      ready: z.number().int().nonnegative(),
      pending: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
    }),
  }),
});
export type WorkspaceSetup = z.infer<typeof WorkspaceSetupSchema>;

/* ---- Invitations (`POST /users/invite`) --------------------------------------------------- */

export const InviteRoleSchema = z.enum(["admin", "manager", "hr", "member", "guest"]);
/** `InviteInputSchema` (above) is the API's body: one invitation or a bulk list. */
export type InviteInput = z.infer<typeof InviteInputSchema>;
/** An optional form field: blank ("" from an empty input or an unset select) is sent as absent. */
const optionalField = <T extends z.ZodType<string>>(schema: T) =>
  z
    .union([z.literal(""), schema])
    .optional()
    .transform((value) => (value === "" ? undefined : value));
/**
 * The web app's single-invite form, a valid `InvitationSchema` body: an email and a role, plus the
 * profile and placement that apply when they first sign in.
 */
export const InviteFormSchema = z
  .object({
    email: z.email("Enter a work email address."),
    role: InviteRoleSchema.default("member"),
    name: optionalField(z.string().trim().max(200)),
    jobTitle: optionalField(z.string().trim().max(200)),
    departmentId: optionalField(IdSchema),
    teamId: optionalField(IdSchema),
    managerId: optionalField(z.string().min(1).max(200)),
    startDate: optionalField(IsoDateSchema),
    isNewHire: z.boolean().default(false),
    /** A guest's projects; left out when none are chosen. */
    projectIds: z
      .array(IdSchema)
      .max(50)
      .default([])
      .transform((ids) => (ids.length ? ids : undefined)),
  })
  .strict()
  .refine((form) => !form.isNewHire || form.startDate, {
    path: ["startDate"],
    message: "Add a start date for a new hire.",
  });
export type InviteForm = z.infer<typeof InviteFormSchema>;
/** A single invite's result. `status` is "pending", or "already_member" (then `id` is null). */
export const InviteResultSchema = z.object({
  id: z.string().nullable(),
  status: z.string(),
  requestedRole: InviteRoleSchema.optional(),
  /** `email`: an invitation email went out. `local`: recorded only (development mode sends none). */
  delivery: z.enum(["email", "local"]).optional(),
});
export type InviteResult = z.infer<typeof InviteResultSchema>;

/* ---- Connectors (`GET /connectors`, `POST /connectors/google-drive/authorize`) ------------ */

/** A folder or shared drive selected to feed a project (`GET/PUT /connectors/:id/scopes`). */
export const ConnectorScopeSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  scopeType: ScopeTypeSchema,
  externalId: z.string(),
  name: z.string(),
  excluded: z.boolean(),
  backfillFrom: z.string().nullable(),
  visibility: ScopeVisibilitySchema,
  frequency: SyncFrequencySchema,
  status: ScopeStatusSchema,
  lastSyncRequestedAt: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  itemCount: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
});
export type ConnectorScope = z.infer<typeof ConnectorScopeSchema>;
export const ConnectorScopeListSchema = z.object({ items: z.array(ConnectorScopeSchema) });
/** A selectable scope in the person's Drive, with the selections already made from it. */
export const ConnectorScopeOptionSchema = z.object({
  scopeType: ScopeTypeSchema,
  externalId: z.string(),
  name: z.string(),
  selections: z.array(ConnectorScopeSchema),
});
export type ConnectorScopeOption = z.infer<typeof ConnectorScopeOptionSchema>;
export const ConnectorScopeOptionListSchema = z.object({
  items: z.array(ConnectorScopeOptionSchema),
  nextPageToken: z.string().nullable(),
});
export type ConnectorScopeOptionList = z.infer<typeof ConnectorScopeOptionListSchema>;
/** `POST /connectors/:id/sync`: how many scopes were queued (synced ones within 10 minutes are skipped). */
export const ConnectorSyncResultSchema = z.object({
  queued: z.number().int().nonnegative(),
  items: z.array(ConnectorScopeSchema),
});
export type ConnectorSyncResult = z.infer<typeof ConnectorSyncResultSchema>;

export const ConnectorConnectionSchema = z.object({
  id: z.string(),
  provider: z.string(),
  status: z.enum(["connected", "needs_reauth", "revoked"]).or(z.string()),
  accountId: z.string().nullable().optional(),
  scopes: z.array(z.string()).optional(),
  createdAt: z.string().optional(),
  selectedScopes: z.array(ConnectorScopeSchema).optional(),
  health: z
    .object({
      lastSuccessfulSyncAt: z.string().nullable(),
      itemsProcessed: z.number().int().nonnegative(),
      errors: z.array(z.object({ scopeId: z.string(), error: z.string().nullable() })),
      tokenStatus: z.string(),
    })
    .optional(),
});
export type ConnectorConnection = z.infer<typeof ConnectorConnectionSchema>;
export const ConnectorListSchema = z.object({ items: z.array(ConnectorConnectionSchema) });
export const ConnectorAuthorizationSchema = z.object({ authorizationUrl: z.url() });

/* ---- Google Drive file browser (`GET /connectors/:id/files`, `POST /connectors/:id/import`) */

export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

export const DriveFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  modifiedTime: z.string().nullable().optional(),
  createdTime: z.string().nullable().optional(),
  webViewLink: z.string().nullable().optional(),
  trashed: z.boolean().nullable().optional(),
  capabilities: z.object({ canDownload: z.boolean().nullable().optional() }).nullable().optional(),
  owners: z
    .array(
      z.object({
        displayName: z.string().nullable().optional(),
        emailAddress: z.string().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
  driveId: z.string().nullable().optional(),
});
export type DriveFile = z.infer<typeof DriveFileSchema>;

export const DriveFileListSchema = z.object({
  items: z.array(DriveFileSchema),
  nextPageToken: z.string().nullable(),
});
export type DriveFileList = z.infer<typeof DriveFileListSchema>;

export const DriveImportInputSchema = z
  .object({
    projectId: z.uuid(),
    fileId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/),
    /** Omitted: permission mirroring, so only people who can open the file in Drive read it. */
    visibility: ScopeVisibilitySchema.optional(),
  })
  .strict();
export type DriveImportInput = z.infer<typeof DriveImportInputSchema>;

/* ---- Members and org structure --------------------------------------------------------- */

export const MembershipStatusSchema = z.enum(["active", "suspended", "offboarded"]);
export type MembershipStatus = z.infer<typeof MembershipStatusSchema>;

/** `GET /users`: the workspace directory (guests may not read it). */
export const WorkspaceMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: SystemRoleSchema,
  status: MembershipStatusSchema,
  /** Who they report to (part of the public reporting line). */
  managerId: z.string().nullable().optional(),
  /*
   * Requested for Members & roles (docs/api-change-requests.md, item 11); optional until served.
   * `invitedAt` is set while the person has not signed in yet.
   */
  email: z.string().nullable().optional(),
  team: z.string().nullable().optional(),
  lastActiveAt: z.string().nullable().optional(),
  invitedAt: z.string().nullable().optional(),
});
export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;
export const WorkspaceMemberListSchema = z.object({ items: z.array(WorkspaceMemberSchema) });

/** `PATCH /users/:id` returns the updated membership row. */
export const MembershipUpdateResultSchema = z.object({
  userId: z.string(),
  role: SystemRoleSchema,
  status: MembershipStatusSchema,
});
export type UserUpdate = z.infer<typeof UserUpdateSchema>;

export const DepartmentSchema = z.object({ id: z.string(), name: z.string() });
export type Department = z.infer<typeof DepartmentSchema>;
export const DepartmentListSchema = z.object({ items: z.array(DepartmentSchema) });

export const TeamSchema = z.object({
  id: z.string(),
  departmentId: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
});
export type Team = z.infer<typeof TeamSchema>;
export const TeamListSchema = z.object({ items: z.array(TeamSchema) });

export const OrgNameInputSchema = z
  .object({ name: z.string().trim().min(1, "Enter a name.").max(200) })
  .strict();
export type OrgNameInput = z.infer<typeof OrgNameInputSchema>;
export const TeamInputSchema = OrgNameInputSchema.extend({
  departmentId: z.uuid(),
  parentId: z.uuid().nullable().default(null),
});
export type TeamInput = z.infer<typeof TeamInputSchema>;
export const TeamUpdateInputSchema = OrgNameInputSchema.partial()
  .extend({ parentId: z.uuid().nullable().optional() })
  .strict();
export type TeamUpdateInput = z.infer<typeof TeamUpdateInputSchema>;

/* ---- Notifications (`GET /notifications`, `PATCH /notifications/:id/read`) --------------- */

/** Platform records of kind "notification"; `data` is what the producing feature stored. */
export const NotificationSchema = z.object({
  id: z.string(),
  status: z.string(),
  version: z.number().int(),
  createdAt: z.string(),
  data: z
    .object({
      title: z.string().optional(),
      body: z.string().optional(),
      link: z.string().optional(),
      kind: z.string().optional(),
    })
    .default({}),
});
export type Notification = z.infer<typeof NotificationSchema>;
export const NotificationListSchema = z.object({ items: z.array(NotificationSchema) });

/* ---- Current user (`GET/PATCH /users/me`) and personal preferences ------------------------ */

export const MeSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  role: SystemRoleSchema,
  workspaceId: z.string(),
  /** When a guest's access ends; null for everyone else. */
  guestExpiresAt: z.string().nullable().optional(),
  /** Their own responsibilities: domain owner, mentor, path curator. */
  assignments: z
    .array(z.object({ type: z.string(), scopeType: z.string(), scopeId: z.string() }))
    .optional(),
  /** Pronouns, location, bio, skills and avatar shape, as Settings › Profile edits them. */
  profile: PersonalProfileSchema.optional(),
  /** Job title, team and the rest of their placement, from the HR system (read-only here). */
  organization: z.record(z.string(), z.unknown()).optional(),
  preferences: z
    .object({
      timezone: z.string().optional(),
      leaderboardOptOut: z.boolean().optional(),
    })
    .passthrough()
    .default({}),
});
export type Me = z.infer<typeof MeSchema>;
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;

/** `GET/PATCH /notifications/preferences`. */
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
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

export type CompanionPreferences = z.infer<typeof CompanionPreferencesSchema>;
export type FlagInput = z.input<typeof FlagInputSchema>;
/** `POST /flags` returns the stored flag record. */
export const FlagRecordSchema = z.object({ id: z.string(), status: z.string() }).passthrough();

/* ---- Audit log (`GET /audit?limit=&offset=`, admins only) -------------------------------- */

export const AuditEntrySchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  actorId: z.string(),
  actorName: z.string(),
  /** Dotted verb, e.g. "connector.connect", "user.role_change". */
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
export const AuditEntryListSchema = z.object({ items: z.array(AuditEntrySchema) });
