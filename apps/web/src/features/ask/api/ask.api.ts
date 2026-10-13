import {
  AnswerListSchema,
  AnswerSchema,
  type Answer,
  type AnswerList,
  type AskInput,
} from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

export const askQuestion = (projectId: string, input: AskInput): Promise<Answer> =>
  apiRequest(`/v1/projects/${projectId}/ask`, {
    method: "POST",
    body: input,
    schema: AnswerSchema,
  });

export const listQuestions = (projectId: string, signal?: AbortSignal): Promise<AnswerList> =>
  apiRequest(`/v1/projects/${projectId}/questions`, { schema: AnswerListSchema, signal });
