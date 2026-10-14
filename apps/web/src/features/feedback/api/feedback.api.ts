import {
  AnswerFeedbackInputSchema,
  type CreateFeedbackInput,
  type Feedback,
  type FeedbackKind,
  FeedbackSchema,
  type FlagInput,
  FlagRecordSchema,
  PromoteAnswerInputSchema,
} from "@contextos/shared";
import { z } from "zod";
import { apiRequest } from "@/lib/api-client";

export const createFeedback = (projectId: string, input: CreateFeedbackInput): Promise<Feedback> =>
  apiRequest(`/v1/projects/${projectId}/feedback`, {
    method: "POST",
    body: input,
    schema: FeedbackSchema,
  });

/** Report a knowledge gap or a problem with an item, the overview or an answer (`POST /flags`). */
export const createFlag = (input: FlagInput) =>
  apiRequest("/v1/flags", { method: "POST", body: input, schema: FlagRecordSchema });

const AnswerFeedbackResultSchema = z.object({
  id: z.string(),
  feedback: AnswerFeedbackInputSchema.extend({ at: z.string() }),
});

const PromotionResultSchema = z
  .object({ id: z.string(), status: z.string(), version: z.number().int() })
  .passthrough();

const ANSWER_REASON: Record<Exclude<FeedbackKind, "correct">, string> = {
  incorrect: "wrong",
  outdated: "outdated",
  missing_context: "missing_source",
  conflicting: "not_helpful",
};

/** Private answer rating, stored on the Ask message rather than as generic project feedback. */
export const createAnswerFeedback = (answerId: string, kind: FeedbackKind) =>
  apiRequest(`/v1/ask/messages/${encodeURIComponent(answerId)}/feedback`, {
    method: "POST",
    body: kind === "correct" ? { rating: "up" } : { rating: "down", reason: ANSWER_REASON[kind] },
    schema: AnswerFeedbackResultSchema,
  });

/** Proposes a cited answer for human review before it becomes Hub content. */
export const promoteAnswer = (answerId: string) =>
  apiRequest(`/v1/ask/messages/${encodeURIComponent(answerId)}/promote`, {
    method: "POST",
    body: PromoteAnswerInputSchema.parse({}),
    schema: PromotionResultSchema,
  });
