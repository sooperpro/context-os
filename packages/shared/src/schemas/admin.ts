import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";
import { ScopeVisibilitySchema, SyncFrequencySchema } from "./connectors.js";
import { AiSettingSchema } from "./home.js";
import { SystemRoleSchema } from "./platform.js";
import { PersonRefSchema } from "./refs.js";

/*
 * Contracts for the admin's workspace screens (prototype "Members & roles", "Connectors", "Access
 * policies", "AI settings"). Members, connections and the audit log have live endpoints; these are
 * the views and writes the screens need on top. Until they are served, the web app's development
 * mock layer answers them; docs/api-change-requests.md tracks them.
 */

const Fraction = z.number().min(0).max(1);
const Count = z.number().int().min(0);

/* ---- Members & roles ------------------------------------------------------------------------- */

/** `GET /v1/admin/members/overview`: seats and directory sync, for the Members page header. */
export const MembersOverviewSchema = z.object({
  /** `total` is null when the workspace has no seat limit. */
  seats: z.object({ used: Count, total: Count.nullable() }),
  directorySync: z.object({
    /** "Google Workspace". */
    provider: z.string(),
    enabled: z.boolean(),
    lastRunAt: IsoDateTimeSchema.nullable(),
  }),
});
export type MembersOverview = z.infer<typeof MembersOverviewSchema>;

/** `POST /v1/admin/directory-sync`: run SCIM now. */
export const DirectorySyncResultSchema = z.object({
  ranAt: IsoDateTimeSchema,
  created: Count,
  updated: Count,
  deactivated: Count,
});
export type DirectorySyncResult = z.infer<typeof DirectorySyncResultSchema>;

export const RoleRequestSchema = z.object({
  id: z.string(),
  person: PersonRefSchema,
  role: SystemRoleSchema,
  /** In their words: "To manage the GitHub and Jira connectors for Platform." */
  reason: z.string(),
  requestedAt: IsoDateTimeSchema,
});
export type RoleRequest = z.infer<typeof RoleRequestSchema>;

/** `GET /v1/admin/role-requests`: open requests, oldest first. */
export const RoleRequestListSchema = z.object({ items: z.array(RoleRequestSchema) });

/** `POST /v1/role-requests`: any member asks for a different role; an admin approves or declines. */
export const RoleRequestInputSchema = z
  .object({
    role: z.enum(["admin", "manager", "hr", "member"]),
    reason: z.string().trim().min(3, "Say why you need it.").max(500),
  })
  .strict();
export type RoleRequestInput = z.infer<typeof RoleRequestInputSchema>;

/** `GET /v1/role-requests/mine`: the person's own requests, newest first. */
export const MyRoleRequestSchema = z.object({
  id: z.string(),
  role: SystemRoleSchema,
  reason: z.string(),
  status: z.enum(["open", "approved", "declined"]),
  requestedAt: IsoDateTimeSchema,
  decidedAt: IsoDateTimeSchema.nullable(),
});
export type MyRoleRequest = z.infer<typeof MyRoleRequestSchema>;
export const MyRoleRequestListSchema = z.object({ items: z.array(MyRoleRequestSchema) });

/** `POST /v1/admin/role-requests/:id/decision`: approving changes their role and writes the audit log. */
export const RoleRequestDecisionInputSchema = z
  .object({ decision: z.enum(["approve", "decline"]) })
  .strict();
export const RoleRequestDecisionSchema = z.object({
  id: z.string(),
  decision: z.enum(["approve", "decline"]),
});

/* ---- Connectors ------------------------------------------------------------------------------ */

export const ConnectorCategorySchema = z.enum([
  "files",
  "wiki",
  "chat",
  "eng",
  "pm",
  "design",
  "crm",
  "other",
]);
export type ConnectorCategory = z.infer<typeof ConnectorCategorySchema>;

export const ConnectorStateSchema = z.enum(["healthy", "syncing", "error", "available"]);
export type ConnectorState = z.infer<typeof ConnectorStateSchema>;

/** One integration in the catalog, with its connection when there is one. */
export const AdminConnectorSchema = z.object({
  /** The provider: "google-drive", "slack", "jira"… The web app picks the logo from it. */
  id: z.string(),
  name: z.string(),
  category: ConnectorCategorySchema,
  description: z.string(),
  /** What content is chosen in: "Shared drives", "Spaces", "Channels". */
  unit: z.string(),
  /** What can be indexed; restricted ones answer only their own members. */
  scopeOptions: z.array(z.object({ id: z.string(), name: z.string(), restricted: z.boolean() })),
  popular: z.boolean(),
  /** Whose admin must approve the connection first: "Microsoft 365". */
  needsAdminOf: z.string().nullable(),
  state: ConnectorStateSchema,
  /** "18,204 files indexed", "First sync · 62%", "8 of 11 projects syncing". */
  detail: z.string().nullable(),
  lastSyncAt: IsoDateTimeSchema.nullable(),
  /** While syncing. */
  progress: Fraction.nullable(),
  /** While failing: "403 Forbidden on KES, ING and BIL". */
  error: z.string().nullable(),
});
export type AdminConnector = z.infer<typeof AdminConnectorSchema>;

/** `GET /v1/admin/connectors`: the catalog and what is connected. */
export const AdminConnectorListSchema = z.object({ items: z.array(AdminConnectorSchema) });

/**
 * `POST /v1/admin/connectors/:id/authorize`: the provider's consent (read-only scopes). `account` is
 * set once access is granted; until then `authorizationUrl` is the provider's consent page to open,
 * and the caller asks again after the provider redirects back.
 */
export const ConnectorConsentSchema = z.object({
  account: z.string().nullable(),
  authorizationUrl: z.url().nullable().default(null),
});
export type ConnectorConsent = z.infer<typeof ConnectorConsentSchema>;

/** `POST /v1/admin/connectors/:id/connect`: what to index and how often; starts the first sync. */
export const ConnectInputSchema = z
  .object({
    scopeIds: z.array(z.string()).min(1, "Choose at least one."),
    frequency: SyncFrequencySchema,
    skipOlderThan: z.enum(["never", "3y", "1y"]),
    /** The project the content feeds; every source in ContextOS belongs to one. */
    projectId: z.uuid().optional(),
    /** Who can read the imported content; omitted mirrors the tool's permissions. */
    visibility: ScopeVisibilitySchema.optional(),
  })
  .strict();
export type ConnectInput = z.infer<typeof ConnectInputSchema>;

/** `POST /v1/admin/connectors/:id/reconnect`: renew access and re-sync what failed. */
export const ReconnectInputSchema = z.object({}).strict();

/** A folder or shared drive a connector keeps in sync, as the admin's Manage view lists it. */
export const AdminConnectorScopeSchema = z.object({
  id: z.string(),
  name: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  /** Who connected it. */
  connectedBy: z.string(),
  status: z.string(),
  itemCount: Count,
  lastSyncedAt: IsoDateTimeSchema.nullable(),
  lastError: z.string().nullable(),
  frequency: SyncFrequencySchema,
  visibility: ScopeVisibilitySchema,
});
export type AdminConnectorScope = z.infer<typeof AdminConnectorScopeSchema>;

/** `GET /v1/admin/connectors/:id/scopes`; `POST /v1/admin/connectors/:id/sync` answers `{queued}`. */
export const AdminConnectorScopeListSchema = z.object({
  items: z.array(AdminConnectorScopeSchema),
});
export const AdminConnectorSyncResultSchema = z.object({ queued: Count });

/** `POST /v1/admin/connector-requests`: ask for an integration that isn't in the catalog. */
export const ConnectorRequestInputSchema = z
  .object({
    tool: z.string().trim().min(2, "Name the tool.").max(200),
    notes: z.string().max(2000),
  })
  .strict();
export type ConnectorRequestInput = z.infer<typeof ConnectorRequestInputSchema>;
export const ConnectorRequestResultSchema = z.object({ id: z.string() });

/* ---- Access policies ------------------------------------------------------------------------- */

export const PolicyEffectSchema = z.enum(["default", "restrict", "exclude"]);
export type PolicyEffect = z.infer<typeof PolicyEffectSchema>;

/** Content a policy or a preview row is about: the provider picks the logo. */
const SourceRefSchema = z.object({ provider: z.string(), label: z.string() });

/** What a policy covers: a whole project, or one synced folder (a connector scope). */
export const PolicySourceSchema = z.object({
  kind: z.enum(["project", "folder"]),
  id: z.string().min(1).max(200),
});
export type PolicySource = z.infer<typeof PolicySourceSchema>;
/** A source a policy can name, with its label and logo. */
export const PolicySourceOptionSchema = SourceRefSchema.extend(PolicySourceSchema.shape);
export type PolicySourceOption = z.infer<typeof PolicySourceOptionSchema>;

export const AccessPolicySchema = z.object({
  id: z.string(),
  name: z.string(),
  effect: PolicyEffectSchema,
  description: z.string(),
  groups: z.array(z.string()),
  sources: z.array(SourceRefSchema.extend(PolicySourceSchema.partial().shape)),
  /** The built-in default that mirrors source permissions. */
  locked: z.boolean(),
  /** Part of an unresolved conflict. */
  conflict: z.boolean(),
  updatedAt: IsoDateTimeSchema.nullable(),
});
export type AccessPolicy = z.infer<typeof AccessPolicySchema>;

export const AccessConflictSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string(), description: z.string() })),
});
export type AccessConflict = z.infer<typeof AccessConflictSchema>;

/** `GET /v1/admin/access-policies`: policies, open conflicts, and who the preview can show. */
export const AccessPolicyListSchema = z.object({
  /** Including policies not listed (per-project rules). */
  total: Count,
  items: z.array(AccessPolicySchema),
  conflicts: z.array(AccessConflictSchema),
  /** Groups a policy can name. */
  groups: z.array(z.string()),
  previewPeople: z.array(z.object({ person: PersonRefSchema, groups: z.string() })),
  /** Projects and synced folders a policy can cover. */
  sourceOptions: z.array(PolicySourceOptionSchema).default([]),
});
export type AccessPolicyList = z.infer<typeof AccessPolicyListSchema>;

/** `POST /v1/admin/access-policies` and `PATCH /v1/admin/access-policies/:id`. */
export const AccessPolicyInputSchema = z
  .object({
    name: z.string().trim().min(2, "Name the policy.").max(200),
    effect: z.enum(["restrict", "exclude"]),
    groups: z.array(z.string()).min(1, "Choose at least one group."),
    sources: z.array(PolicySourceSchema).min(1, "Choose at least one source.").max(200),
  })
  .strict();
export type AccessPolicyInput = z.infer<typeof AccessPolicyInputSchema>;

/** `POST /v1/admin/access-conflicts/:id/resolve`: apply one of the conflict's options. */
export const ResolveConflictInputSchema = z.object({ optionId: z.string() }).strict();

/** `GET /v1/admin/access-preview?personId=`: what one person can reach, and which rule decides. */
export const AccessPreviewSchema = z.object({
  person: PersonRefSchema,
  items: z.array(SourceRefSchema.extend({ allowed: z.boolean(), reason: z.string() })),
});
export type AccessPreview = z.infer<typeof AccessPreviewSchema>;

/* ---- AI settings ----------------------------------------------------------------------------- */

export const AnswerStrictnessSchema = z.enum(["strict", "balanced", "lenient"]);
export type AnswerStrictness = z.infer<typeof AnswerStrictnessSchema>;

/** `GET /v1/admin/ai-settings`: how Context Bot answers, and how its answers are rated. */
export const AiSettingsSchema = z.object({
  stats: z.object({
    helpfulRate: Fraction,
    withSources: Fraction,
    noAnswer: Fraction,
    ratings: Count,
    periodDays: z.number().int().positive(),
  }),
  rules: z.array(AiSettingSchema),
  strictness: AnswerStrictnessSchema,
  staleAfterHours: z.union([z.literal(1), z.literal(2), z.literal(6), z.literal(24)]),
  routeAfterAsks: z.union([z.literal(2), z.literal(3), z.literal(5)]),
  weeklyDigest: z.boolean(),
  /** Never used in answers, and the policy that says so. */
  excluded: z.array(SourceRefSchema.extend({ reason: z.string() })),
  unhelpfulReasons: z.array(z.object({ reason: z.string(), share: Fraction })),
  /** What stands out in the ratings: "Most “out of date” ratings cite Jira pages…". */
  unhelpfulNote: z.string().nullable(),
  unanswered: z.array(z.object({ question: z.string(), asks: Count, routedTo: z.string() })),
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;

/** `PATCH /v1/admin/ai-settings`: change one or more settings; each change writes the audit log. */
export const AiSettingsInputSchema = z
  .object({
    rules: z.partialRecord(AiSettingSchema.shape.id, z.boolean()).optional(),
    strictness: AnswerStrictnessSchema.optional(),
    staleAfterHours: AiSettingsSchema.shape.staleAfterHours.optional(),
    routeAfterAsks: AiSettingsSchema.shape.routeAfterAsks.optional(),
    weeklyDigest: z.boolean().optional(),
  })
  .strict()
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "Change something.",
  });
export type AiSettingsInput = z.infer<typeof AiSettingsInputSchema>;
