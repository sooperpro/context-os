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
