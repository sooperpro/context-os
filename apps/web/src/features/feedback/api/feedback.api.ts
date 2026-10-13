import { FeedbackSchema, type CreateFeedbackInput, type Feedback } from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

export const createFeedback = (projectId: string, input: CreateFeedbackInput): Promise<Feedback> =>
  apiRequest(`/v1/projects/${projectId}/feedback`, {
    method: "POST",
    body: input,
    schema: FeedbackSchema,
  });
