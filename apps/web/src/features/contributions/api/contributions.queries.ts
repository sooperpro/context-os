import type { ContributionInput, KnowledgeSection, ReviewDecisionInput } from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createContribution,
  decideReview,
  draftContribution,
  fetchReviewQueue,
  listMyContributions,
  listMyKnowledgeGaps,
  resubmitContribution,
  searchSources,
  suggestReviewer,
} from "./contributions.api";

export const contributionKeys = {
  all: ["contributions"] as const,
  mine: () => [...contributionKeys.all, "mine"] as const,
  gaps: () => [...contributionKeys.all, "gaps"] as const,
  sources: (query: string) => [...contributionKeys.all, "sources", query] as const,
  reviewer: (section: KnowledgeSection, title: string) =>
    [...contributionKeys.all, "reviewer", section, title] as const,
  reviews: () => [...contributionKeys.all, "reviews"] as const,
};

/** Contributions waiting for the caller to review. */
export const reviewQueueQuery = () =>
  queryOptions({ queryKey: contributionKeys.reviews(), queryFn: ({ signal }) => fetchReviewQueue(signal) });

export function useDecideReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReviewDecisionInput }) => decideReview(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contributionKeys.reviews() }),
  });
}

/** The caller's contributions; Home's "Your contributions" card reads the same query. */
export const myContributionsQuery = () =>
  queryOptions({
    queryKey: contributionKeys.mine(),
    queryFn: ({ signal }) => listMyContributions(signal),
  });

export const myKnowledgeGapsQuery = () =>
  queryOptions({
    queryKey: contributionKeys.gaps(),
    queryFn: ({ signal }) => listMyKnowledgeGaps(signal),
  });

export const sourceSearchQuery = (query: string) =>
  queryOptions({
    queryKey: contributionKeys.sources(query),
    queryFn: ({ signal }) => searchSources(query, signal),
    staleTime: 60_000,
  });

export const suggestedReviewerQuery = (section: KnowledgeSection, title: string) =>
  queryOptions({
    queryKey: contributionKeys.reviewer(section, title),
    queryFn: ({ signal }) => suggestReviewer(section, title, signal),
    staleTime: 5 * 60_000,
  });

export function useDraftContribution() {
  return useMutation({ mutationFn: draftContribution });
}

/** Save a draft or submit for review; refreshes the lists (and Home) and the gaps it may close. */
export function useCreateContribution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ContributionInput) => createContribution(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contributionKeys.all }),
  });
}

export function useResubmitContribution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resubmitContribution(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contributionKeys.mine() }),
  });
}
