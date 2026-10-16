import { z } from "zod";
import { IdSchema, IsoDateTimeSchema, listOf } from "./common.js";

export const JobTypeSchema = z.enum([
  "process_source",
  "refresh_hub",
  "sync_connector",
  /** One Drive file found by a scope sync: download, store as text, queue processing. */
  "import_drive_file",
  /** Work out who may read a scope's files (Drive sharing), in the background. */
  "refresh_access",
  /** Draft a tutorial's lessons and knowledge check from a project's knowledge. */
  "generate_tutorial",
  /** Plan an onboarding template for a job title from the Knowledge Hub. */
  "generate_template",
]);
export type JobType = z.infer<typeof JobTypeSchema>;

export const JobStatusSchema = z.enum(["queued", "running", "done", "failed"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  type: JobTypeSchema,
  status: JobStatusSchema,
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  lastError: z.string().nullable(),
  /** Human-readable subject, e.g. the source title. */
  subject: z.string().nullable(),
  runAfter: IsoDateTimeSchema,
  startedAt: IsoDateTimeSchema.nullable(),
  finishedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type Job = z.infer<typeof JobSchema>;

export const JobListSchema = listOf(JobSchema);
export type JobList = z.infer<typeof JobListSchema>;

export const ListJobsQuerySchema = z.object({
  status: JobStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const JobIdParamSchema = z.object({ projectId: IdSchema, jobId: IdSchema });
