import type { CreateFeedbackInput, FlagInput } from "@contextos/shared";
import { useMutation } from "@tanstack/react-query";
import { createFeedback, createFlag } from "./feedback.api";

export function useCreateFeedback(projectId: string) {
  return useMutation({
    mutationFn: (input: CreateFeedbackInput) => createFeedback(projectId, input),
  });
}

export function useCreateFlag() {
  return useMutation({ mutationFn: (input: FlagInput) => createFlag(input) });
}
