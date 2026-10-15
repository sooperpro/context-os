import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";
import { LearningTargetSchema, LessonTypeSchema } from "./learning.js";
import { KnowledgeOriginSchema, OnboardingStatusSchema, PersonRefSchema } from "./refs.js";

/*
 * Contracts for the Home dashboards (one per role in the reference prototype).
 *
 * The API does not serve these yet. The web app answers them with schema-checked mock data in
 * development (apps/web/src/mocks), so the screens can be built first. Each schema names its
 * endpoint; `docs/api-change-requests.md` tracks which ones are live. When an endpoint ships, it
 * must return exactly this shape, and the matching mock handler is deleted.
 *
 * Conventions: fractions are 0..1, dates are `YYYY-MM-DD`, timestamps are ISO 8601. Text the UI
 * shows verbatim (`detail`, `note`) is already written for people; everything the UI formats or
 * acts on is structured.
 */

const Fraction = z.number().min(0).max(1);
const DateOnly = z.iso.date();
const Count = z.number().int().min(0);
const DoneOfTotal = z.object({ done: Count, total: Count });

/* ---- Employee ----------------------------------------------------------------------------- */

export const OnboardingStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  weekStart: z.number().int().min(1),
  weekEnd: z.number().int().min(1),
  state: z.enum(["done", "current", "next", "later"]),
  startsOn: DateOnly,
  modules: DoneOfTotal,
  /** Progress through this stage; meaningful for the current one. */
  progress: Fraction,
});
export type OnboardingStage = z.infer<typeof OnboardingStageSchema>;

/** `GET /v1/me/onboarding`: the caller's onboarding plan at a glance. */
export const MyOnboardingSchema = z.object({
  startDate: DateOnly,
  totalDays: z.number().int().positive(),
  status: OnboardingStatusSchema,
  /** Share of the plan done, and where the plan expects the person to be today. */
  progress: Fraction,
  expected: Fraction,
  modules: DoneOfTotal,
  checks: DoneOfTotal,
  tasks: DoneOfTotal,
  stages: z.array(OnboardingStageSchema),
});
export type MyOnboarding = z.infer<typeof MyOnboardingSchema>;

export const NextUpSchema = z.object({
  assignmentId: z.string(),
  moduleId: z.string(),
  stageName: z.string(),
  /** 1-based position of the module in its stage. */
  moduleIndex: z.number().int().min(1),
  moduleCount: z.number().int().min(1),
  title: z.string(),
  summary: z.string(),
  lessons: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      type: LessonTypeSchema,
      state: z.enum(["done", "current", "todo"]),
    }),
  ),
  /** Where "Resume module" goes: the current lesson, or the knowledge check. */
  resume: LearningTargetSchema,
  progress: Fraction,
  minutesLeft: Count,
  owner: PersonRefSchema.nullable(),
  updatedAt: IsoDateTimeSchema,
  sourceCount: Count,
  /** A question Context Bot can answer about this module, offered as "Ask about this lesson". */
  suggestedQuestion: z.string().nullable(),
});
export type NextUp = z.infer<typeof NextUpSchema>;

/** `GET /v1/me/next-up`: the module to resume, or null when nothing is assigned. */
export const NextUpResponseSchema = z.object({ item: NextUpSchema.nullable() });

export const MyTaskSchema = z.object({
  id: z.string(),
  kind: z.enum(["check", "practical", "reading", "meeting"]),
  title: z.string(),
  /** Short facts shown after the title: "5 questions", "Pair with Sana Iqbal", "~45 min". */
  details: z.array(z.string()),
  dueAt: IsoDateTimeSchema.nullable(),
  state: z.enum(["open", "done"]),
  inProgress: z.boolean(),
  completedAt: IsoDateTimeSchema.nullable(),
  /** The lesson, check or module the task opens, if it is part of the roadmap. */
  target: LearningTargetSchema.nullable(),
});
export type MyTask = z.infer<typeof MyTaskSchema>;

/** `GET /v1/me/tasks?from=&to=`: tasks due in a window (this week by default). Overdue = open and past due. */
export const MyTasksSchema = z.object({
  from: DateOnly,
  to: DateOnly,
  items: z.array(MyTaskSchema),
});
export type MyTasks = z.infer<typeof MyTasksSchema>;

export const MilestoneSchema = z.object({
  id: z.string(),
  kind: z.enum(["checkin", "stage", "review", "readiness", "probation"]),
  title: z.string(),
  detail: z.string(),
  dueOn: DateOnly,
  state: z.enum(["done", "soon", "later"]),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

/** `GET /v1/me/milestones`: upcoming milestones of the caller's plan, soonest first. */
export const MilestoneListSchema = z.object({ items: z.array(MilestoneSchema) });

export const KnowledgeUpdateSchema = z.object({
  id: z.string(),
  title: z.string(),
  origin: KnowledgeOriginSchema,
  author: z.string().nullable(),
  updatedAt: IsoDateTimeSchema,
  /** The collection it belongs to: "Decision", "Process", "Project Kestrel". */
  tag: z.string(),
  /** Why it is shown to this person: "Related to your current module". */
  reason: z.string().nullable(),
  /** Set when only some people can open it: "Platform team only". */
  restrictedTo: z.string().nullable(),
  projectId: z.string().nullable(),
  itemId: z.string().nullable(),
});
export type KnowledgeUpdate = z.infer<typeof KnowledgeUpdateSchema>;

/** `GET /v1/me/knowledge-updates`: recent changes picked for the caller, newest first. */
export const KnowledgeUpdateListSchema = z.object({ items: z.array(KnowledgeUpdateSchema) });

export const TeamActivitySchema = z.object({
  id: z.string(),
  kind: z.enum(["release", "schedule", "joiner", "event", "update"]),
  text: z.string(),
  actor: PersonRefSchema.nullable(),
  /** Where it happened: a channel, a project, "Team event". */
  where: z.string(),
  at: IsoDateTimeSchema,
});
export type TeamActivity = z.infer<typeof TeamActivitySchema>;

/** `GET /v1/me/team-activity`: news from the caller's team. */
export const TeamActivityFeedSchema = z.object({
  team: z.object({ id: z.string(), name: z.string() }).nullable(),
  items: z.array(TeamActivitySchema),
});
export type TeamActivityFeed = z.infer<typeof TeamActivityFeedSchema>;

export const MyPersonSchema = z.object({
  person: PersonRefSchema,
  relation: z.enum(["manager", "buddy", "expert", "people_partner", "mentor"]),
  /** Extra context, e.g. an expert's topics: "Billing & Kestrel". */
  note: z.string().nullable(),
});
export type MyPerson = z.infer<typeof MyPersonSchema>;

/** `GET /v1/me/people`: the people the caller should know first. */
export const MyPeopleSchema = z.object({ items: z.array(MyPersonSchema) });

/* ---- Manager ------------------------------------------------------------------------------ */

export const TeamMemberProgressSchema = z.object({
  person: PersonRefSchema,
  startDate: DateOnly,
  stage: z.string().nullable(),
  progress: Fraction,
  expected: Fraction,
  status: OnboardingStatusSchema,
  /** The next thing on their plan: "Week 2 check-in · Fri". */
  next: z.string().nullable(),
  /** The most important problem, if any: "2 modules are 5 days overdue". */
  issue: z.string().nullable(),
});
export type TeamMemberProgress = z.infer<typeof TeamMemberProgressSchema>;

/** `GET /v1/team/onboarding`: everyone onboarding on the caller's team. */
export const TeamOnboardingSchema = z.object({
  team: z.object({ id: z.string(), name: z.string() }),
  people: z.array(TeamMemberProgressSchema),
});
export type TeamOnboarding = z.infer<typeof TeamOnboardingSchema>;

export const AttentionActionSchema = z.object({
  kind: z.enum([
    "escalate",
    "message",
    "assign_learning",
    "review_progress",
    "assign_roadmap",
    "start_recommendation",
  ]),
  label: z.string(),
});

export const AttentionItemSchema = z.object({
  id: z.string(),
  person: PersonRefSchema,
  severity: z.enum(["error", "warning", "info", "neutral"]),
  /** Short state for the chip: "Blocked · 4 days", "Starts Monday". */
  label: z.string(),
  title: z.string(),
  detail: z.string(),
  actions: z.array(AttentionActionSchema),
});
export type AttentionItem = z.infer<typeof AttentionItemSchema>;

/** `GET /v1/team/attention`: people who need the manager today, most urgent first. */
export const AttentionListSchema = z.object({ items: z.array(AttentionItemSchema) });

export const CheckinSchema = z.object({
  id: z.string(),
  person: PersonRefSchema,
  title: z.string(),
  at: IsoDateTimeSchema,
  note: z.string().nullable(),
});
export type Checkin = z.infer<typeof CheckinSchema>;

/** `GET /v1/team/checkins?upcoming=true`: the manager's next check-ins, soonest first. */
export const CheckinListSchema = z.object({ items: z.array(CheckinSchema) });

/** `GET /v1/team/knowledge`: the team's articles and the contributions waiting for the manager. */
export const TeamKnowledgeSchema = z.object({
  owned: Count,
  needsReview: Count,
  awaitingYou: Count,
  queue: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      kind: z.enum(["glossary_term", "edit", "article"]),
      author: PersonRefSchema,
      submittedAt: IsoDateTimeSchema,
    }),
  ),
});
export type TeamKnowledge = z.infer<typeof TeamKnowledgeSchema>;

/* ---- People Ops (HR) ---------------------------------------------------------------------- */

/** `GET /v1/people-ops/overview`: onboarding across the organization. */
export const PeopleOpsOverviewSchema = z.object({
  activeOnboardings: z.object({ count: Count, changeVsLastMonth: z.number().int() }),
  atRiskOrBlocked: z.object({ count: Count, changeThisWeek: z.number().int() }),
  reviewsNext30Days: z.object({ count: Count, needAction: Count }),
  startingNext14Days: z.object({ count: Count, notReady: Count }),
  teams: z.array(z.object({ team: z.string(), onTrack: Count, atRisk: Count, blocked: Count })),
});
export type PeopleOpsOverview = z.infer<typeof PeopleOpsOverviewSchema>;

export const ProbationReviewSchema = z.object({
  id: z.string(),
  person: PersonRefSchema,
  team: z.string(),
  manager: PersonRefSchema,
  reviewOn: DateOnly,
  recommendation: z.enum(["confirm", "extend", "discuss", "awaiting_manager", "not_started"]),
  readiness: Fraction,
  state: z.enum([
    "ready_for_approval",
    "awaiting_manager",
    "needs_hr_review",
    "checkins_missing",
    "completed",
  ]),
  /** What People Ops recorded; set when `state` is completed. */
  decision: z
    .object({
      outcome: z.enum(["confirmed", "extended"]),
      /** For extensions: "30 days". */
      extension: z.string().nullable(),
      decidedOn: DateOnly,
    })
    .nullable(),
  /** When the manager's recommendation is due. */
  recommendationDueOn: DateOnly.nullable(),
  missingCheckins: Count,
});
export type ProbationReview = z.infer<typeof ProbationReviewSchema>;

/**
 * `GET /v1/people-ops/probation-reviews?within=30`: reviews in the next N days, soonest first, and
 * reviews decided in the last N days whose date has passed.
 */
export const ProbationReviewListSchema = z.object({
  items: z.array(ProbationReviewSchema),
  recentlyCompleted: z.array(ProbationReviewSchema),
});

export const StarterSchema = z.object({
  id: z.string(),
  person: PersonRefSchema,
  team: z.string(),
  startDate: DateOnly,
  accountsReady: z.boolean(),
  buddyAssigned: z.boolean(),
  roadmapAssigned: z.boolean(),
});
export type Starter = z.infer<typeof StarterSchema>;

/** `GET /v1/people-ops/starters?within=14`: people starting in the next N days. */
export const StarterListSchema = z.object({ items: z.array(StarterSchema) });

export const OverdueMilestoneSchema = z.object({
  id: z.string(),
  person: PersonRefSchema,
  team: z.string(),
  milestone: z.string(),
  dueOn: DateOnly,
});
export type OverdueMilestone = z.infer<typeof OverdueMilestoneSchema>;

/** `GET /v1/people-ops/overdue-milestones`: missed onboarding milestones, oldest first. */
export const OverdueMilestoneListSchema = z.object({ items: z.array(OverdueMilestoneSchema) });

/** Which kind of role a template is for; picks its icon. */
export const TemplateFamilySchema = z.enum([
  "engineering",
  "sales",
  "support",
  "design",
  "data",
  "manager",
  "other",
]);
export type TemplateFamily = z.infer<typeof TemplateFamilySchema>;

export const OnboardingTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  family: TemplateFamilySchema,
  version: z.string(),
  activeCount: Count,
  /** Archived templates are hidden from new onboardings; only listed when asked for. */
  archived: z.boolean(),
  updatedAt: IsoDateTimeSchema,
  status: z.enum(["published", "draft"]),
  roles: z.array(z.string()),
  weeks: Count,
  stageCount: Count,
  moduleCount: Count,
  updatedBy: z.string(),
});
export type OnboardingTemplate = z.infer<typeof OnboardingTemplateSchema>;

/** `GET /v1/people-ops/templates`: onboarding plan templates. */
export const OnboardingTemplateListSchema = z.object({ items: z.array(OnboardingTemplateSchema) });

/* ---- Admin -------------------------------------------------------------------------------- */

export const SecurityCheckSchema = z.object({
  id: z.enum(["sso", "scim", "role_requests", "access_policies", "data_retention"]),
  /** What is configured now: "Google Workspace · enforced", "2 pending". */
  value: z.string(),
  state: z.enum(["ok", "attention", "off"]),
});
export type SecurityCheck = z.infer<typeof SecurityCheckSchema>;

/** `GET /v1/admin/security`: the workspace's access and security settings at a glance. */
export const SecurityOverviewSchema = z.object({ items: z.array(SecurityCheckSchema) });

export const SyncRunSchema = z.object({
  id: z.string(),
  connector: z.string(),
  startedAt: IsoDateTimeSchema,
  ok: z.boolean(),
  /** "1,204 items, 37 changed" or the failure reason. */
  detail: z.string(),
  durationMs: Count,
});
export type SyncRun = z.infer<typeof SyncRunSchema>;

/** `GET /v1/admin/sync-runs?since=`: connector sync runs, newest first. */
export const SyncRunListSchema = z.object({ items: z.array(SyncRunSchema) });

export const AiSettingSchema = z.object({
  id: z.enum([
    "cite_sources",
    "access_only",
    "route_unanswered",
    "include_dms",
    "pause_during_checks",
  ]),
  label: z.string(),
  detail: z.string(),
  enabled: z.boolean(),
  /** Fixed by policy; shown but not editable. */
  locked: z.boolean(),
});
export type AiSetting = z.infer<typeof AiSettingSchema>;

/** `GET /v1/admin/ai`: answer quality over the last 30 days and the AI switches. */
export const AiOverviewSchema = z.object({
  helpfulRate: Fraction,
  ratings: Count,
  periodDays: z.number().int().positive(),
  settings: z.array(AiSettingSchema),
  /** The top questions nothing answered (same rules as AI settings). */
  unanswered: z
    .array(z.object({ question: z.string(), asks: Count, routedTo: z.string() }))
    .default([]),
});
export type AiOverview = z.infer<typeof AiOverviewSchema>;
