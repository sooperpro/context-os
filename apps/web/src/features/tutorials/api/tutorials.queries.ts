import type {
  ReviewSendBackInput,
  TutorialAssignInput,
  TutorialCreateInput,
  TutorialPublishInput,
  TutorialUpdateInput,
} from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  archiveTutorial,
  assignTutorial,
  createTutorial,
  fetchTutorial,
  fetchTutorials,
  publishTutorial,
  regenerateTutorial,
  sendBackTutorial,
  submitTutorial,
  updateTutorial,
} from "./tutorials.api";

export const tutorialKeys = {
  all: ["tutorials"] as const,
  list: () => [...tutorialKeys.all, "list"] as const,
  detail: (id: string) => [...tutorialKeys.all, "detail", id] as const,
};

/** While a draft is being written the list and the Studio check back every few seconds. */
const POLL_MS = 4000;

export const tutorialsQuery = () =>
  queryOptions({
    queryKey: tutorialKeys.list(),
    queryFn: ({ signal }) => fetchTutorials(signal),
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.generating) ? POLL_MS : false,
  });

export const tutorialQuery = (id: string) =>
  queryOptions({
    queryKey: tutorialKeys.detail(id),
    queryFn: ({ signal }) => fetchTutorial(id, signal),
    refetchInterval: (query) => (query.state.data?.generating ? POLL_MS : false),
  });

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: tutorialKeys.all });
}

export function useCreateTutorial() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: TutorialCreateInput) => createTutorial(input),
    onSuccess: () => refresh(),
  });
}

export function useUpdateTutorial(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TutorialUpdateInput) => updateTutorial(id, input),
    onSuccess: (detail) => {
      queryClient.setQueryData(tutorialKeys.detail(id), detail);
      void queryClient.invalidateQueries({ queryKey: tutorialKeys.list() });
    },
  });
}

export function useRegenerateTutorial(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (focus: string | undefined) => regenerateTutorial(id, focus ? { focus } : {}),
    onSuccess: () => refresh(),
  });
}

export function usePublishTutorial(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: TutorialPublishInput) => publishTutorial(id, input),
    onSuccess: () => refresh(),
  });
}

export function useSubmitTutorial(id: string) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: () => submitTutorial(id), onSuccess: () => refresh() });
}

export function useSendBackTutorial(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: ReviewSendBackInput) => sendBackTutorial(id, input),
    onSuccess: () => refresh(),
  });
}

export function useArchiveTutorial(id: string) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: () => archiveTutorial(id), onSuccess: () => refresh() });
}

export function useAssignTutorial(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: TutorialAssignInput) => assignTutorial(id, input),
    onSuccess: () => refresh(),
  });
}
