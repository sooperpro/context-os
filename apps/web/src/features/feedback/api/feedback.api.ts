import {
  type CreateFeedbackInput,
  type Feedback,
  FeedbackSchema,
  type FlagInput,
  FlagRecordSchema,
} from "@contextos/shared";
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
