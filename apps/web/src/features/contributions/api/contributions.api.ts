import {
  ContributionDraftInputSchema,
  ContributionDraftSchema,
  ContributionInputSchema,
  ContributionListSchema,
  ContributionResubmitInputSchema,
  ContributionSchema,
  KnowledgeGapListSchema,
  ReviewDecisionInputSchema,
  ReviewDecisionSchema,
  ReviewQueueSchema,
  SourcePickListSchema,
  SuggestedReviewerSchema,
  type Contribution,
  type ContributionDraft,
  type ContributionDraftInput,
  type ContributionInput,
  type KnowledgeGap,
  type KnowledgeSection,
  type ReviewDecisionInput,
  type ReviewQueue,
  type SourcePick,
  type SuggestedReviewer,
} from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

/**
 * The contributions endpoints. The API serves the review queue (`/v1/me/reviews`: Ask answers
 * proposed for the Hub, routed to the domain owner or the author's manager); the rest are not
 * served yet, so in development the mock layer answers them (src/mocks/contributions.ts) and
 * screens show "Preview data". Contracts: packages/shared/src/schemas/contributions.ts.
 */
export const CONTRIBUTION_ENDPOINTS = {
  mine: { path: "/v1/me/contributions", schema: ContributionListSchema },
  gaps: { path: "/v1/me/knowledge-gaps", schema: KnowledgeGapListSchema },
  sources: { path: "/v1/sources/search", schema: SourcePickListSchema },
  reviewer: { path: "/v1/contributions/reviewer", schema: SuggestedReviewerSchema },
  draft: {
    path: "/v1/contributions/draft",
    schema: ContributionDraftSchema,
    input: ContributionDraftInputSchema,
  },
  create: { path: "/v1/contributions", schema: ContributionSchema, input: ContributionInputSchema },
  resubmit: {
    path: "/v1/contributions/:id/resubmit",
    schema: ContributionSchema,
    input: ContributionResubmitInputSchema,
  },
  reviews: { path: "/v1/me/reviews", schema: ReviewQueueSchema },
  decide: { path: "/v1/me/reviews/:id/decision", schema: ReviewDecisionSchema, input: ReviewDecisionInputSchema },
} as const;

const E = CONTRIBUTION_ENDPOINTS;

export async function listMyContributions(signal?: AbortSignal): Promise<Contribution[]> {
  return (await apiRequest(E.mine.path, { schema: E.mine.schema, signal })).items;
}

export async function listMyKnowledgeGaps(signal?: AbortSignal): Promise<KnowledgeGap[]> {
  return (await apiRequest(E.gaps.path, { schema: E.gaps.schema, signal })).items;
}

export async function searchSources(query: string, signal?: AbortSignal): Promise<SourcePick[]> {
  return (
    await apiRequest(E.sources.path, {
      query: { q: query, limit: 20 },
      schema: E.sources.schema,
      signal,
    })
  ).items;
}

export function suggestReviewer(
  section: KnowledgeSection,
  title: string,
  signal?: AbortSignal,
): Promise<SuggestedReviewer> {
  return apiRequest(E.reviewer.path, {
    query: { section, title },
    schema: E.reviewer.schema,
    signal,
  });
}

export function draftContribution(input: ContributionDraftInput): Promise<ContributionDraft> {
  return apiRequest(E.draft.path, { method: "POST", body: input, schema: E.draft.schema });
}

export function createContribution(input: ContributionInput): Promise<Contribution> {
  return apiRequest(E.create.path, { method: "POST", body: input, schema: E.create.schema });
}

export function resubmitContribution(id: string): Promise<Contribution> {
  return apiRequest(E.resubmit.path.replace(":id", encodeURIComponent(id)), {
    method: "POST",
    body: {},
    schema: E.resubmit.schema,
  });
}

export function fetchReviewQueue(signal?: AbortSignal): Promise<ReviewQueue> {
  return apiRequest(E.reviews.path, { schema: E.reviews.schema, signal });
}

export function decideReview(id: string, input: ReviewDecisionInput) {
  return apiRequest(E.decide.path.replace(":id", encodeURIComponent(id)), {
    method: "POST",
    body: input,
    schema: E.decide.schema,
  });
}
