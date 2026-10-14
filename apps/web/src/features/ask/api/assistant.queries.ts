import type { AssistantAskInput, AssistantFeedbackInput } from "@contextos/shared";
import { useMutation } from "@tanstack/react-query";
import { askWorkspace, reportKnowledgeGap, sendAnswerFeedback } from "./assistant.api";

/* Workspace answers live in the panel's conversation, not in the query cache: each ask is a mutation. */

export function useAskWorkspace() {
  return useMutation({ mutationFn: (input: AssistantAskInput) => askWorkspace(input) });
}

export function useAnswerFeedback() {
  return useMutation({
    mutationFn: ({ id, ...input }: AssistantFeedbackInput & { id: string }) =>
      sendAnswerFeedback(id, input),
  });
}

export function useReportKnowledgeGap() {
  return useMutation({ mutationFn: (question: string) => reportKnowledgeGap(question) });
}
