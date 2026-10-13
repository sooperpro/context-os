import { z } from "zod";
import { IdSchema, IsoDateTimeSchema, listOf } from "./common.js";

export const FeedbackTargetSchema = z.enum(["context_item", "answer", "overview"]);
export type FeedbackTarget = z.infer<typeof FeedbackTargetSchema>;

export const FeedbackKindSchema = z.enum([
  "correct",
  "incorrect",
  "outdated",
  "missing_context",
  "conflicting",
]);
export type FeedbackKind = z.infer<typeof FeedbackKindSchema>;

export const CreateFeedbackInputSchema = z.object({
  targetType: FeedbackTargetSchema,
  targetId: z.string().min(1).max(200),
  kind: FeedbackKindSchema,
  note: z.string().trim().max(2000).optional(),
});
export type CreateFeedbackInput = z.infer<typeof CreateFeedbackInputSchema>;

export const FeedbackSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  targetType: FeedbackTargetSchema,
  targetId: z.string(),
  kind: FeedbackKindSchema,
  note: z.string().nullable(),
  actorName: z.string(),
  createdAt: IsoDateTimeSchema,
});
export type Feedback = z.infer<typeof FeedbackSchema>;

export const FeedbackListSchema = listOf(FeedbackSchema);
export type FeedbackList = z.infer<typeof FeedbackListSchema>;
