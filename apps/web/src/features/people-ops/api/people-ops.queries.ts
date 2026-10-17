import type {
  NewOnboardingInput,
  NewTemplateInput,
  RoadmapGenerateInput,
  OnboardingAssignmentInput,
  OnboardingFilter,
  OnboardingMessageInput,
  PersonDetailsInput,
  ProbationDecisionInput,
  ProbationDiscussInput,
  ReminderInput,
  ReviewSendBackInput,
  SetupStepId,
  TemplateDraftInput,
  TemplatePublishInput,
} from "@contextos/shared";
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { homeKeys } from "@/features/home/api/home.queries";
import { membersKeys } from "@/features/members/api/members.queries";
import { peopleKeys } from "@/features/people/api/people.queries";
import {
  archiveTemplate,
  completeSetupStep,
  createOnboarding,
  createTemplate,
  generateTemplate,
  decideProbation,
  deleteTemplate,
  discussProbation,
  fetchOnboarding,
  fetchOnboardingOptions,
  fetchOnboardings,
  fetchPersonDetails,
  fetchPersonOnboarding,
  fetchProbation,
  fetchTemplate,
  fetchTemplateAudience,
  fetchTemplateLibrary,
  fetchTemplateSuggestion,
  fetchTemplateVersion,
  type RoleLookup,
  messageOnboarding,
  publishTemplate,
  remindManagers,
  restoreTemplate,
  saveTemplateDraft,
  sendBackTemplate,
  submitTemplate,
  updateOnboarding,
  updatePersonDetails,
} from "./people-ops.api";
import { ApiClientError } from "@/lib/api-client";

export const peopleOpsKeys = {
  all: ["people-ops"] as const,
  onboardings: (q: string, team: string, filter: OnboardingFilter) =>
    [...peopleOpsKeys.all, "onboardings", q, team, filter] as const,
  onboarding: (id: string) => [...peopleOpsKeys.all, "onboarding", id] as const,
  options: () => [...peopleOpsKeys.all, "options"] as const,
  probation: (id: string) => [...peopleOpsKeys.all, "probation", id] as const,
  template: (id: string) => [...peopleOpsKeys.all, "template", id] as const,
  templateVersion: (id: string, version: number) =>
    [...peopleOpsKeys.all, "template", id, "version", version] as const,
  library: () => [...peopleOpsKeys.all, "library"] as const,
  person: (userId: string) => [...peopleOpsKeys.all, "person", userId] as const,
  details: (userId: string) => [...peopleOpsKeys.all, "details", userId] as const,
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

/** Job titles, teams and departments the organisation already has, to suggest in templates. */
export const templateAudienceQuery = () =>
  queryOptions({
    queryKey: [...peopleOpsKeys.all, "template-audience"] as const,
    queryFn: ({ signal }) => fetchTemplateAudience(signal),
    staleTime: 5 * 60_000,
  });

/** The template to suggest for someone joining; the previous answer stays while typing. */
export const templateSuggestionQuery = (role: RoleLookup) =>
  queryOptions({
    queryKey: [...peopleOpsKeys.all, "template-suggestion", role] as const,
    queryFn: ({ signal }) => fetchTemplateSuggestion(role, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
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

/** A person's onboarding for the card on their profile; null when they are not onboarding. */
export const personOnboardingQuery = (userId: string) =>
  queryOptions({
    queryKey: peopleOpsKeys.person(userId),
    queryFn: ({ signal }) =>
      fetchPersonOnboarding(userId, signal).catch((error: unknown) => {
        if (error instanceof ApiClientError && error.status === 404) return null;
        throw error;
      }),
  });

export const templateQuery = (id: string) =>
  queryOptions({
    queryKey: peopleOpsKeys.template(id),
    queryFn: ({ signal }) => fetchTemplate(id, signal),
  });

/** One published version as it was published; fetched only when someone opens it. */
export const templateVersionQuery = (id: string, version: number) =>
  queryOptions({
    queryKey: peopleOpsKeys.templateVersion(id, version),
    queryFn: ({ signal }) => fetchTemplateVersion(id, version, signal),
    staleTime: Infinity,
  });

/** A person's job title, department, team and manager, for People Ops to change. */
export const personDetailsQuery = (userId: string) =>
  queryOptions({
    queryKey: peopleOpsKeys.details(userId),
    queryFn: ({ signal }) => fetchPersonDetails(userId, signal),
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

/** A note from People Ops to the new hire, manager or buddy. Nothing on the record changes. */
export function useMessageOnboarding(id: string) {
  return useMutation({
    mutationFn: (input: OnboardingMessageInput) => messageOnboarding(id, input),
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

export function useDiscussProbation(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: ProbationDiscussInput) => discussProbation(id, input),
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

export function useSubmitTemplate(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: TemplatePublishInput) => submitTemplate(id, input),
    onSuccess: () => refresh(),
  });
}

export function useSendBackTemplate(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: ReviewSendBackInput) => sendBackTemplate(id, input),
    onSuccess: () => refresh(),
  });
}

/** Saves new job details; the profile, directory, members list and onboarding records reload. */
export function useUpdatePersonDetails(userId: string) {
  const refresh = useRefresh();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PersonDetailsInput) => updatePersonDetails(userId, input),
    onSuccess: async () => {
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: peopleKeys.all }),
        queryClient.invalidateQueries({ queryKey: membersKeys.all() }),
      ]);
    },
  });
}

export function useArchiveTemplate(id: string) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: () => archiveTemplate(id), onSuccess: () => refresh() });
}

export function useRestoreTemplate(id: string) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: () => restoreTemplate(id), onSuccess: () => refresh() });
}

export function useDeleteTemplate(id: string) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: () => deleteTemplate(id), onSuccess: () => refresh() });
}

export function useGenerateTemplate() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: RoadmapGenerateInput) => generateTemplate(input),
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
