import type { CheckAttemptInput } from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { homeKeys } from "@/features/home/api/home.queries";
import {
  addCourse,
  completeLesson,
  fetchCheck,
  fetchCourse,
  fetchLesson,
  fetchModule,
  fetchMyLearning,
  fetchRoadmap,
  rateLearning,
  sendLearningRequest,
  submitCheckAttempt,
  takeCourseStep,
} from "./learning.api";

export const learningKeys = {
  all: ["learning"] as const,
  roadmap: () => [...learningKeys.all, "roadmap"] as const,
  module: (id: string) => [...learningKeys.all, "module", id] as const,
  lesson: (id: string) => [...learningKeys.all, "lesson", id] as const,
  check: (id: string) => [...learningKeys.all, "check", id] as const,
  mine: () => [...learningKeys.all, "mine"] as const,
  course: (id: string) => [...learningKeys.all, "course", id] as const,
};

/** "My learning", for people past onboarding. */
export const myLearningQuery = () =>
  queryOptions({ queryKey: learningKeys.mine(), queryFn: ({ signal }) => fetchMyLearning(signal) });

export function useAddCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => addCourse(id),
    onSuccess: (data) => queryClient.setQueryData(learningKeys.mine(), data),
  });
}

/** One assigned course from My learning, with the caller's progress. */
export const courseQuery = (id: string) =>
  queryOptions({
    queryKey: learningKeys.course(id),
    queryFn: ({ signal }) => fetchCourse(id, signal),
  });

export const roadmapQuery = () =>
  queryOptions({ queryKey: learningKeys.roadmap(), queryFn: ({ signal }) => fetchRoadmap(signal) });

export const moduleQuery = (id: string) =>
  queryOptions({
    queryKey: learningKeys.module(id),
    queryFn: ({ signal }) => fetchModule(id, signal),
  });

export const lessonQuery = (id: string) =>
  queryOptions({
    queryKey: learningKeys.lesson(id),
    queryFn: ({ signal }) => fetchLesson(id, signal),
  });

/** The questions only; answers come back with the graded attempt. */
export const checkQuery = (id: string) =>
  queryOptions({
    queryKey: learningKeys.check(id),
    queryFn: ({ signal }) => fetchCheck(id, signal),
    staleTime: Infinity,
  });

/** Progress changes ripple to the roadmap, the module and Home (next up, onboarding, tasks). */
function useRefreshProgress() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: learningKeys.all }),
      queryClient.invalidateQueries({ queryKey: homeKeys.all }),
    ]);
}

export function useCompleteLesson() {
  const refresh = useRefreshProgress();
  return useMutation({
    mutationFn: (id: string) => completeLesson(id),
    onSuccess: () => refresh(),
  });
}

export function useSubmitCheck(id: string) {
  const refresh = useRefreshProgress();
  return useMutation({
    mutationFn: (input: CheckAttemptInput) => submitCheckAttempt(id, input),
    onSuccess: (result) => (result.passed ? refresh() : undefined),
  });
}

export function useRateLearning() {
  return useMutation({ mutationFn: rateLearning });
}

export function useLearningRequest() {
  return useMutation({ mutationFn: sendLearningRequest });
}

export function useCourseStep() {
  const refresh = useRefreshProgress();
  return useMutation({ mutationFn: takeCourseStep, onSuccess: () => refresh() });
}
