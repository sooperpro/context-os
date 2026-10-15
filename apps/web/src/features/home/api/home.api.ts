import {
  AiOverviewSchema,
  AttentionListSchema,
  AuditEntryListSchema,
  CheckinListSchema,
  KnowledgeGapListSchema,
  KnowledgeUpdateListSchema,
  MilestoneListSchema,
  MyOnboardingSchema,
  MyPeopleSchema,
  MyTasksSchema,
  NextUpResponseSchema,
  OnboardingTemplateListSchema,
  OverdueMilestoneListSchema,
  PeopleOpsOverviewSchema,
  ProbationReviewListSchema,
  SecurityOverviewSchema,
  StarterListSchema,
  SyncRunListSchema,
  TeamActivityFeedSchema,
  TeamKnowledgeSchema,
  TeamOnboardingSchema,
} from "@contextos/shared";
import type { z } from "zod";
import { apiRequest } from "@/lib/api-client";

/**
 * Every endpoint the Home dashboards read, with the shared schema of its response. The manager's,
 * People Ops' and admin's are served by the API, as are the employee's knowledge updates, team news
 * and people to know (apps/api/src/modules/platform/employee.routes.ts). The employee's other cards
 * are not yet, so in development the mock layer answers them (see src/mocks) and the cards show a
 * "Preview data" chip. The contracts live in packages/shared/src/schemas/home.ts.
 */
export const HOME_ENDPOINTS = {
  myOnboarding: { path: "/v1/me/onboarding", schema: MyOnboardingSchema },
  nextUp: { path: "/v1/me/next-up", schema: NextUpResponseSchema },
  myTasks: { path: "/v1/me/tasks", schema: MyTasksSchema },
  milestones: { path: "/v1/me/milestones", schema: MilestoneListSchema },
  /** Live (platform/employee.routes.ts), as are `teamActivity` and `myPeople`. */
  knowledgeUpdates: { path: "/v1/me/knowledge-updates", schema: KnowledgeUpdateListSchema },
  teamActivity: { path: "/v1/me/team-activity", schema: TeamActivityFeedSchema },
  myPeople: { path: "/v1/me/people", schema: MyPeopleSchema },
  teamOnboarding: { path: "/v1/team/onboarding", schema: TeamOnboardingSchema },
  attention: { path: "/v1/team/attention", schema: AttentionListSchema },
  checkins: { path: "/v1/team/checkins", schema: CheckinListSchema },
  knowledgeGaps: { path: "/v1/team/knowledge-gaps", schema: KnowledgeGapListSchema },
  teamKnowledge: { path: "/v1/team/knowledge", schema: TeamKnowledgeSchema },
  peopleOpsOverview: { path: "/v1/people-ops/overview", schema: PeopleOpsOverviewSchema },
  probationReviews: { path: "/v1/people-ops/probation-reviews", schema: ProbationReviewListSchema },
  starters: { path: "/v1/people-ops/starters", schema: StarterListSchema },
  overdueMilestones: {
    path: "/v1/people-ops/overdue-milestones",
    schema: OverdueMilestoneListSchema,
  },
  templates: { path: "/v1/people-ops/templates", schema: OnboardingTemplateListSchema },
  /** Live (platform/admin-overview.routes.ts), as are `syncRuns` and `ai`. */
  security: { path: "/v1/admin/security", schema: SecurityOverviewSchema },
  syncRuns: { path: "/v1/admin/sync-runs", schema: SyncRunListSchema },
  ai: { path: "/v1/admin/ai", schema: AiOverviewSchema },
  /** Live. Returns entries oldest first and takes no sort, so the client sorts (see docs/api-change-requests.md). */
  audit: { path: "/v1/audit", schema: AuditEntryListSchema },
} as const;

export type HomeEndpoint = keyof typeof HOME_ENDPOINTS;
type ResponseOf<K extends HomeEndpoint> = z.output<(typeof HOME_ENDPOINTS)[K]["schema"]>;

export function fetchHome<K extends HomeEndpoint>(
  endpoint: K,
  query?: Record<string, string | number | boolean | undefined>,
  signal?: AbortSignal,
): Promise<ResponseOf<K>> {
  const { path, schema } = HOME_ENDPOINTS[endpoint];
  // The lookup by key loses the link between K and its schema; the registry above guarantees it.
  return apiRequest(path, { query, schema: schema as unknown as z.ZodType<ResponseOf<K>>, signal });
}
