import { z } from "zod";
import { IdSchema, IsoDateTimeSchema, SlugSchema, listOf } from "./common.js";

export const ProjectSchema = z.object({
  id: IdSchema,
  workspaceId: IdSchema,
  name: z.string(),
  /** URL slug, unique within the workspace. Null only for legacy rows not yet backfilled. */
  slug: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectStatsSchema = z.object({
  sources: z.number().int().nonnegative(),
  readySources: z.number().int().nonnegative(),
  contextItems: z.number().int().nonnegative(),
  questions: z.number().int().nonnegative(),
  /** Last time a source finished processing, or null. */
  lastProcessedAt: IsoDateTimeSchema.nullable(),
});
export type ProjectStats = z.infer<typeof ProjectStatsSchema>;

export const ProjectWithStatsSchema = ProjectSchema.extend({ stats: ProjectStatsSchema });
export type ProjectWithStats = z.infer<typeof ProjectWithStatsSchema>;

export const ProjectListSchema = listOf(ProjectWithStatsSchema);
export type ProjectList = z.infer<typeof ProjectListSchema>;

export const CreateProjectInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  description: z.string().trim().max(2000).optional(),
  /** Optional explicit slug; generated from the name when omitted. */
  slug: SlugSchema.optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const UpdateProjectInputSchema = CreateProjectInputSchema.partial();
export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;
