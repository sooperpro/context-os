import {
  AcknowledgedSchema,
  AssistantAnswerSchema,
  AssistantAskInputSchema,
  AssistantFeedbackInputSchema,
  KnowledgeGapInputSchema,
  KnowledgeGapResultSchema,
  type AssistantAskInput,
  type AssistantFeedbackInput,
} from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

/**
 * Context Bot outside a project. Not served yet; in development the mock layer answers
 * (src/mocks/assistant.ts). Inside a project the bot uses the Ask threads API. Contract:
 * packages/shared/src/schemas/assistant.ts.
 */
export const ASSISTANT_ENDPOINTS = {
  ask: { path: "/v1/assistant/ask", schema: AssistantAnswerSchema, input: AssistantAskInputSchema },
  feedback: {
    path: "/v1/assistant/answers/:id/feedback",
    schema: AcknowledgedSchema,
    input: AssistantFeedbackInputSchema,
  },
  gap: {
    path: "/v1/assistant/gaps",
    schema: KnowledgeGapResultSchema,
    input: KnowledgeGapInputSchema,
  },
} as const;

const E = ASSISTANT_ENDPOINTS;

export const askWorkspace = (input: AssistantAskInput) =>
  apiRequest(E.ask.path, { method: "POST", body: input, schema: E.ask.schema });

export const sendAnswerFeedback = (id: string, input: AssistantFeedbackInput) =>
  apiRequest(E.feedback.path.replace(":id", encodeURIComponent(id)), {
    method: "POST",
    body: input,
    schema: E.feedback.schema,
  });

export const reportKnowledgeGap = (question: string) =>
  apiRequest(E.gap.path, { method: "POST", body: { question }, schema: E.gap.schema });
