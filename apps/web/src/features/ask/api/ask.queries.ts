import type { AnswerList, AskInput } from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectKeys } from "@/features/projects/api/keys";
import { askQuestion, listQuestions } from "./ask.api";

export const questionsQuery = (projectId: string) =>
  queryOptions({
    queryKey: projectKeys.questions(projectId),
    queryFn: ({ signal }) => listQuestions(projectId, signal),
  });

export function useAskQuestion(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AskInput) => askQuestion(projectId, input),
    onSuccess: (answer) => {
      queryClient.setQueryData<AnswerList>(projectKeys.questions(projectId), (current) => ({
        items: [answer, ...(current?.items ?? [])],
      }));
      return queryClient.invalidateQueries({ queryKey: projectKeys.hub(projectId) });
    },
  });
}
