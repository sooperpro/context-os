import type {
  NewOnboardingInput,
  NewTemplateInput,
  OnboardingAssignmentInput,
  OnboardingFilter,
  ProbationDecisionInput,
  ReminderInput,
  SetupStepId,
  TemplateDraftInput,
  TemplatePublishInput,
} from "@contextos/shared";
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { homeKeys } from "@/features/home/api/home.queries";
import {
  completeSetupStep,
  createOnboarding,
  createTemplate,
  decideProbation,
  fetchOnboarding,
  fetchOnboardingOptions,
  fetchOnboardings,
  fetchProbation,
  fetchTemplate,
  fetchTemplateLibrary,
  publishTemplate,
  remindManagers,
  saveTemplateDraft,
  updateOnboarding,
} from "./people-ops.api";

export const peopleOpsKeys = {
  all: ["people-ops"] as const,
  onboardings: (q: string, team: string, filter: OnboardingFilter) =>
    [...peopleOpsKeys.all, "onboardings", q, team, filter] as const,
  onboarding: (id: string) => [...peopleOpsKeys.all, "onboarding", id] as const,
  options: () => [...peopleOpsKeys.all, "options"] as const,
  probation: (id: string) => [...peopleOpsKeys.all, "probation", id] as const,
  template: (id: string) => [...peopleOpsKeys.all, "template", id] as const,
  library: () => [...peopleOpsKeys.all, "library"] as const,
};

export const onboardingsQuery = (q: string, team: string, filter: OnboardingFilter) =>
  queryOptions({
    queryKey: peopleOpsKeys.onboardings(q, team, filter),
    queryFn: ({ signal }) => fetchOnboardings({ q, team, filter }, signal),
    placeholderData: keepPreviousData,
  });

export const onboardingQuery = (id: string) =>
  queryOptions({
    queryKey: peopleOpsKeys.onboarding(id),
    queryFn: ({ signal }) => fetchOnboarding(id, signal),
  });

export const onboardingOptionsQuery = () =>
  queryOptions({
    queryKey: peopleOpsKeys.options(),
    queryFn: ({ signal }) => fetchOnboardingOptions(signal),
    staleTime: 5 * 60_000,
  });

export const probationQuery = (id: string) =>
  queryOptions({
    queryKey: peopleOpsKeys.probation(id),
    queryFn: ({ signal }) => fetchProbation(id, signal),
  });

export const templateQuery = (id: string) =>
  queryOptions({
    queryKey: peopleOpsKeys.template(id),
    queryFn: ({ signal }) => fetchTemplate(id, signal),
  });

export const templateLibraryQuery = () =>
  queryOptions({
    queryKey: peopleOpsKeys.library(),
    queryFn: ({ signal }) => fetchTemplateLibrary(signal),
    staleTime: 5 * 60_000,
  });

/** HR changes show on these pages and on HR Home. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: peopleOpsKeys.all }),
      queryClient.invalidateQueries({ queryKey: homeKeys.all }),
    ]);
}

export function useUpdateOnboarding(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: OnboardingAssignmentInput) => updateOnboarding(id, input),
    onSuccess: () => refresh(),
  });
}

export function useCompleteSetupStep(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (step: SetupStepId) => completeSetupStep(id, step),
    onSuccess: () => refresh(),
  });
}

export function useCreateOnboarding() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: NewOnboardingInput) => createOnboarding(input),
    onSuccess: () => refresh(),
  });
}

export function useDecideProbation(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: ProbationDecisionInput) => decideProbation(id, input),
    onSuccess: () => refresh(),
  });
}

export function useRemindManagers() {
  return useMutation({ mutationFn: (input: ReminderInput) => remindManagers(input) });
}

export function useSaveTemplateDraft(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: TemplateDraftInput) => saveTemplateDraft(id, input),
    onSuccess: () => refresh(),
  });
}

export function usePublishTemplate(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: TemplatePublishInput) => publishTemplate(id, input),
    onSuccess: () => refresh(),
  });
}

export function useCreateTemplate() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: NewTemplateInput) => createTemplate(input),
    onSuccess: () => refresh(),
  });
}
