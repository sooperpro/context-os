import type { CreateFeedbackInput, FlagInput } from "@contextos/shared";
import { useMutation } from "@tanstack/react-query";
import { createAnswerFeedback, createFeedback, createFlag, promoteAnswer } from "./feedback.api";

export function useCreateFeedback(projectId: string) {
  return useMutation({
    mutationFn: (input: CreateFeedbackInput) => createFeedback(projectId, input),
  });
}

export function useCreateFlag() {
  return useMutation({ mutationFn: (input: FlagInput) => createFlag(input) });
}

export function useCreateAnswerFeedback(answerId: string) {
  return useMutation({
    mutationFn: (kind: CreateFeedbackInput["kind"]) => createAnswerFeedback(answerId, kind),
  });
}

export function usePromoteAnswer(answerId: string) {
  return useMutation({ mutationFn: () => promoteAnswer(answerId) });
}
