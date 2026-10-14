import { ContextItemKindSchema, SourceKindSchema } from "@contextos/shared";
import { z } from "zod";
import { apiRequest } from "@/lib/api-client";

const EvidenceChunkSchema = z.object({
  id: z.string(),
  ordinal: z.number().int().nonnegative(),
  content: z.string(),
});

export const EvidenceDetailSchema = z.object({
  id: z.string(),
  quote: z.string(),
  quoteVerified: z.boolean(),
  span: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).nullable(),
  item: z.object({
    id: z.string(),
    projectId: z.string(),
    kind: ContextItemKindSchema,
    title: z.string(),
    verification: z.string(),
    confidence: z.string(),
  }),
  source: z.object({
    id: z.string(),
    title: z.string(),
    kind: SourceKindSchema,
    connector: z.string(),
    url: z.string().nullable(),
    author: z.string().nullable(),
    sourceCreatedAt: z.string().nullable(),
    sourceUpdatedAt: z.string().nullable(),
  }),
  chunk: EvidenceChunkSchema.nullable(),
  context: z.object({
    before: EvidenceChunkSchema.nullable(),
    after: EvidenceChunkSchema.nullable(),
  }),
  extractionRunId: z.string().nullable(),
  createdAt: z.string(),
});

export type EvidenceDetail = z.infer<typeof EvidenceDetailSchema>;

export const getEvidence = (evidenceId: string, signal?: AbortSignal): Promise<EvidenceDetail> =>
  apiRequest(`/v1/evidence/${encodeURIComponent(evidenceId)}`, {
    schema: EvidenceDetailSchema,
    signal,
  });
