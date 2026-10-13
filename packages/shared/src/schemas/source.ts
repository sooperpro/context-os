import { z } from "zod";
import { IdSchema, IsoDateTimeSchema, listOf } from "./common.js";

/** Where a source object came from. Only `manual` is implemented in V0. */
export const SourceConnectorSchema = z.enum(["manual", "slack", "jira", "google_drive", "github"]);
export type SourceConnector = z.infer<typeof SourceConnectorSchema>;

export const SourceKindSchema = z.enum([
  "document",
  "conversation",
  "ticket",
  "pull_request",
  "note",
]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const SourceStatusSchema = z.enum(["pending", "processing", "ready", "failed"]);
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

export const SOURCE_CONTENT_MAX_LENGTH = 200_000;

export const SourceObjectSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  connector: SourceConnectorSchema,
  kind: SourceKindSchema,
  externalId: z.string().nullable(),
  title: z.string(),
  url: z.string().nullable(),
  author: z.string().nullable(),
  /** When the source was created in its system of record (source time). */
  sourceCreatedAt: IsoDateTimeSchema.nullable(),
  sourceUpdatedAt: IsoDateTimeSchema.nullable(),
  /** When ContextOS learned about it (ingestion time). */
  ingestedAt: IsoDateTimeSchema,
  processedAt: IsoDateTimeSchema.nullable(),
  status: SourceStatusSchema,
  error: z.string().nullable(),
  contentLength: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
});
export type SourceObject = z.infer<typeof SourceObjectSchema>;

export const SourceObjectDetailSchema = SourceObjectSchema.extend({ content: z.string() });
export type SourceObjectDetail = z.infer<typeof SourceObjectDetailSchema>;

export const SourceListSchema = listOf(SourceObjectSchema);
export type SourceList = z.infer<typeof SourceListSchema>;

export const CreateSourceInputSchema = z.object({
  kind: SourceKindSchema,
  title: z.string().trim().min(1, "Title is required.").max(300),
  content: z
    .string()
    .trim()
    .min(1, "Content is required.")
    .max(
      SOURCE_CONTENT_MAX_LENGTH,
      `Content must be at most ${SOURCE_CONTENT_MAX_LENGTH} characters.`,
    ),
  url: z.url().optional(),
  author: z.string().trim().max(200).optional(),
  sourceCreatedAt: IsoDateTimeSchema.optional(),
  sourceUpdatedAt: IsoDateTimeSchema.optional(),
});
export type CreateSourceInput = z.infer<typeof CreateSourceInputSchema>;

export const SourceIdParamSchema = z.object({ projectId: IdSchema, sourceId: IdSchema });
