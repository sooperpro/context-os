import { z } from "zod";

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
export const ProfileUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    timezone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      })
      .optional(),
    leaderboardOptOut: z.boolean().optional(),
  })
  .strict();
export const UserUpdateSchema = z
  .object({
    role: SystemRoleSchema.optional(),
    status: z.enum(["active", "suspended", "offboarded"]).optional(),
    managerId: z.string().min(1).max(200).nullable().optional(),
    guestExpiresAt: z.iso.datetime().nullable().optional(),
  })
  .strict();
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
export const WorkspaceSettingsSchema = z
  .object({
    version: z.number().int().positive(),
    name: z.string().trim().min(1).max(200).optional(),
    timezone: TimezoneSchema.optional(),
    includeIndirectReports: z.boolean().optional(),
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
export const AssignmentInputSchema = z
  .object({
    userId: z.string().min(1).max(200),
    type: AssignmentTypeSchema,
    scopeType: z.enum(["project", "user", "workspace"]),
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
});
export const FlagInputSchema = z
  .object({
    projectId: z.uuid(),
    targetType: z.enum(["context_item", "overview", "answer"]),
    targetId: z.string().min(1).max(200),
    kind: z.enum(["stale", "incorrect", "missing_context", "conflicting"]),
    comment: z.string().trim().max(2000).default(""),
    evidenceUrl: z.url().optional(),
  })
  .strict();
export const PathItemInputSchema = z.object({
  id: z.uuid().optional(),
  type: z.enum(["read", "explore", "watch", "meet", "do", "quiz", "reflect", "link"]),
  title: z.string().trim().min(1).max(200),
  objective: z.string().trim().min(1).max(2000),
  estMinutes: z.number().int().min(1).max(10080).default(15),
  dueOffsetDays: z.number().int().min(0).max(365).default(0),
  required: z.boolean().default(true),
  prerequisites: z.array(z.uuid()).max(100).default([]),
  verification: z.enum(["engagement", "quiz", "event", "signoff", "self"]).default("signoff"),
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
  authentication: z.enum(["development", "clerk"]),
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

export const InviteRoleSchema = z.enum(["admin", "manager", "member", "guest"]);
export const InviteInputSchema = z
  .object({
    email: z.email("Enter a work email address."),
    role: InviteRoleSchema.default("member"),
  })
  .strict();
export type InviteInput = z.infer<typeof InviteInputSchema>;
export const InviteResultSchema = z.object({
  id: z.string(),
  status: z.string(),
  requestedRole: InviteRoleSchema,
});
export type InviteResult = z.infer<typeof InviteResultSchema>;

/* ---- Connectors (`GET /connectors`, `POST /connectors/google-drive/authorize`) ------------ */

export const ConnectorConnectionSchema = z.object({
  id: z.string(),
  provider: z.string(),
  status: z.enum(["connected", "needs_reauth", "revoked"]).or(z.string()),
  accountId: z.string().nullable().optional(),
  scopes: z.array(z.string()).optional(),
  createdAt: z.string().optional(),
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
    .array(z.object({ displayName: z.string().nullable().optional(), emailAddress: z.string().nullable().optional() }))
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
  })
  .strict();
export type DriveImportInput = z.infer<typeof DriveImportInputSchema>;
