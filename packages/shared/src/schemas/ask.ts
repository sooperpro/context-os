import { z } from "zod";
import { IdSchema, IsoDateTimeSchema, listOf } from "./common.js";
import { ContextItemKindSchema } from "./context.js";
import { SourceKindSchema } from "./source.js";

export const AskInputSchema = z.object({
  question: z.string().trim().min(3, "Ask a fuller question.").max(2000),
});
export type AskInput = z.infer<typeof AskInputSchema>;

export const AnswerConfidenceSchema = z.enum(["high", "medium", "low", "insufficient"]);
export type AnswerConfidence = z.infer<typeof AnswerConfidenceSchema>;

export const CitationSchema = z.object({
  ref: z.number().int().positive(),
  chunkId: IdSchema,
  sourceObjectId: IdSchema,
  sourceTitle: z.string(),
  sourceKind: SourceKindSchema,
  sourceUrl: z.string().nullable(),
  sourceCreatedAt: IsoDateTimeSchema.nullable(),
  /** The evidence passage the model was shown. */
  excerpt: z.string(),
  /** The claim in the answer this citation supports. */
  claim: z.string(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const RelatedItemSchema = z.object({
  id: IdSchema,
  kind: ContextItemKindSchema,
  title: z.string(),
});

export const AnswerSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  question: z.string(),
  answer: z.string(),
  confidence: AnswerConfidenceSchema,
  rationale: z.string().nullable(),
  currentState: z.object({ statement: z.string(), asOf: z.string().nullable() }).nullable(),
  timelineContext: z.string().nullable(),
  uncertainties: z.array(z.string()),
  citations: z.array(CitationSchema),
  relatedItems: z.array(RelatedItemSchema),
  model: z.string(),
  createdAt: IsoDateTimeSchema,
});
export type Answer = z.infer<typeof AnswerSchema>;

export const AnswerListSchema = listOf(AnswerSchema);
export type AnswerList = z.infer<typeof AnswerListSchema>;

/* ---- Private Ask conversations (`/ask/threads`) ------------------------------------------ */

export const AskThreadSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  /** When set, answers are built from this one source only. */
  sourceId: IdSchema.nullable(),
  title: z.string(),
  createdAt: IsoDateTimeSchema,
});
export type AskThread = z.infer<typeof AskThreadSchema>;
export const AskThreadListSchema = listOf(AskThreadSchema);

/** `GET /ask/threads/:id`: the thread plus the answers the caller may still see. */
export const AskThreadDetailSchema = AskThreadSchema.extend({ messages: z.array(AnswerSchema) });
export type AskThreadDetail = z.infer<typeof AskThreadDetailSchema>;

/** Server-sent events from `POST /ask/threads/:id/messages`. */
export const ThreadStatusEventSchema = z.object({ state: z.enum(["retrieving"]).or(z.string()) });
export const ThreadErrorEventSchema = z.object({ code: z.string(), message: z.string() });
