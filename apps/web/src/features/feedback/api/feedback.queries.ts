import type { CreateFeedbackInput } from "@contextos/shared";
import { useMutation } from "@tanstack/react-query";
import { createFeedback } from "./feedback.api";

export function useCreateFeedback(projectId: string) {
  return useMutation({
    mutationFn: (input: CreateFeedbackInput) => createFeedback(projectId, input),
  });
}
