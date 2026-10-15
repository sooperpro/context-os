import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";
import { ContributionKindSchema } from "./contributions.js";
import { KnowledgeSectionSchema, OnboardingStatusSchema, PersonRefSchema } from "./refs.js";

/*
 * Contracts for the manager's side of onboarding (prototype "Team onboarding", member detail,
 * check-in, review queue) and "My learning". The API's `/probation/*` routes hold plans, check-ins
 * and summaries as generic records; these are the views and writes the screens need. Until they are
 * served, the web app's development mock layer answers them; docs/api-change-requests.md tracks them.
 */

const Fraction = z.number().min(0).max(1);
const DateOnly = z.iso.date();
const Count = z.number().int().min(0);

/* ---- Team ---------------------------------------------------------------------------------- */

export const CheckCellSchema = z.enum(["pass", "fail", "todo", "na"]);
export type CheckCell = z.infer<typeof CheckCellSchema>;

/** `GET /v1/team/check-matrix`: knowledge checks by topic for everyone onboarding on the team. */
export const CheckMatrixSchema = z.object({
  topics: z.array(z.string()),
  rows: z.array(z.object({ person: PersonRefSchema, cells: z.array(CheckCellSchema) })),
});
export type CheckMatrix = z.infer<typeof CheckMatrixSchema>;

export const MemberModuleStateSchema = z.enum(["done", "active", "todo", "overdue", "blocked"]);
export type MemberModuleState = z.infer<typeof MemberModuleStateSchema>;

export const CheckinTypeSchema = z.enum(["weekly", "day_30", "readiness_60", "probation"]);
export type CheckinType = z.infer<typeof CheckinTypeSchema>;

export const PulseSchema = z.enum(["on_track", "concerns", "off_track"]);
export type Pulse = z.infer<typeof PulseSchema>;

export const CheckinRecordSchema = z.object({
  id: z.string(),
  type: CheckinTypeSchema,
  on: DateOnly,
  pulse: PulseSchema,
  note: z.string(),
});
export type CheckinRecord = z.infer<typeof CheckinRecordSchema>;

/** A Context Bot suggestion about the person, with one action that would help. */
export const MemberInsightSchema = z.object({
  text: z.string(),
  action: z
    .object({
      kind: z.enum(["assign_learning", "escalate", "start_recommendation", "assign_roadmap"]),
      label: z.string(),
    })
    .nullable(),
});

/** `GET /v1/team/members/:id`: one person's onboarding, as their manager (or HR) sees it. */
export const TeamMemberDetailSchema = z.object({
  person: PersonRefSchema,
  startDate: DateOnly,
  stage: z.string().nullable(),
  status: OnboardingStatusSchema,
  progress: Fraction,
  expected: Fraction,
  buddy: PersonRefSchema.nullable(),
  peoplePartner: PersonRefSchema.nullable(),
  readinessReviewOn: DateOnly.nullable(),
  probationReviewOn: DateOnly.nullable(),
  /** What needs attention, most important first. */
  issues: z.array(z.string()),
  insight: MemberInsightSchema.nullable(),
  /** The current stage of their roadmap; empty until a roadmap is assigned. */
  modules: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      state: MemberModuleStateSchema,
      dueOn: DateOnly.nullable(),
      completedOn: DateOnly.nullable(),
      /** Why it is blocked or what went wrong: "Check failed twice", "Needs warehouse access". */
      note: z.string().nullable(),
      /** Moved by the manager. */
      postponed: z.boolean(),
    }),
  ),
  checks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      state: CheckCellSchema,
      /** "9 of 10", "3 of 5 · 2 attempts", "Due Oct 16". */
      result: z.string(),
      note: z.string().nullable(),
    }),
  ),
  upcoming: z.array(z.object({ id: z.string(), title: z.string(), on: DateOnly })),
  checkins: z.array(CheckinRecordSchema),
});
export type TeamMemberDetail = z.infer<typeof TeamMemberDetailSchema>;

/** `PATCH /v1/team/members/:id/roadmap`: move modules a week or take them off the plan. */
export const RoadmapEditInputSchema = z
  .object({
    changes: z
      .array(z.object({ moduleId: z.string(), action: z.enum(["postpone_week", "remove"]) }))
      .min(1),
  })
  .strict();
export type RoadmapEditInput = z.infer<typeof RoadmapEditInputSchema>;

/* ---- Check-in ------------------------------------------------------------------------------ */

export const ReadinessAreaSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** What ContextOS knows about it: "Architecture check passed; billing check failed twice". */
  evidence: z.string(),
});
export type ReadinessArea = z.infer<typeof ReadinessAreaSchema>;

/** `GET /v1/team/members/:id/checkin-prep?type=`: a suggested agenda and the readiness areas. */
export const CheckinPrepSchema = z.object({
  agenda: z.array(z.string()),
  areas: z.array(ReadinessAreaSchema),
});
export type CheckinPrep = z.infer<typeof CheckinPrepSchema>;

export const BlockerSchema = z.enum(["access", "expectations", "workload", "knowledge", "mentor"]);
export type Blocker = z.infer<typeof BlockerSchema>;

/** `POST /v1/team/members/:id/checkins`: save a check-in (and, for probation, the recommendation). */
export const CheckinInputSchema = z
  .object({
    type: CheckinTypeSchema,
    pulse: PulseSchema,
    agendaCovered: z.array(z.string()),
    /** Area id → 0 Not yet, 1 Developing, 2 Meets, 3 Exceeds. Readiness check-ins only. */
    ratings: z.record(z.string(), z.number().int().min(0).max(3)),
    blockers: z.array(BlockerSchema),
    notes: z.string().max(5000),
    nextSteps: z.string().max(5000),
    recommendation: z.enum(["confirm", "extend", "discuss"]).nullable(),
    /** The person sees notes and next steps; ratings go to People Ops only. */
    shareWithPerson: z.boolean(),
  })
  .strict()
  .refine((input) => input.type !== "probation" || input.recommendation !== null, {
    message: "Choose a recommendation.",
    path: ["recommendation"],
  });
export type CheckinInput = z.infer<typeof CheckinInputSchema>;

/**
 * `GET /v1/me/checkins`: the person's own check-ins. When the next ones are, and the notes their
 * manager chose to share. Never ratings, pulse or the recommendation (role access spec §3).
 */
export const MyCheckinsSchema = z.object({
  upcoming: z.array(z.object({ id: z.string(), title: z.string(), at: IsoDateTimeSchema })),
  shared: z.array(
    z.object({
      id: z.string(),
      /** For replying with `POST /v1/probation/checkins/:id/respond`. */
      version: z.number().int(),
      title: z.string(),
      on: DateOnly,
      by: PersonRefSchema.nullable(),
      notes: z.string(),
      nextSteps: z.string(),
      response: z.string().nullable(),
    }),
  ),
});
export type MyCheckins = z.infer<typeof MyCheckinsSchema>;

/* ---- Assigning ----------------------------------------------------------------------------- */

/** `GET /v1/team/members/:id/assign-options`: what can be assigned, for the two dialogs. */
export const AssignOptionsSchema = z.object({
  learning: z.object({
    /** Why these are suggested: "Leah failed two questions about idempotent consumers…". */
    reason: z.string().nullable(),
    items: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        kind: z.enum(["module", "practical", "check"]),
        /** "Module · 25 min · Owner Priya Nair". */
        detail: z.string(),
        suggested: z.boolean(),
      }),
    ),
  }),
  roadmap: z.object({
    templates: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        version: z.string(),
        moduleCount: Count,
        weeks: Count,
        matchesRole: z.boolean(),
      }),
    ),
    addOns: z.array(z.object({ id: z.string(), label: z.string(), suggested: z.boolean() })),
    buddies: z.array(PersonRefSchema),
  }),
});
export type AssignOptions = z.infer<typeof AssignOptionsSchema>;

/** `POST /v1/team/members/:id/assignments`: one learning task. */
export const LearningAssignmentInputSchema = z
  .object({ itemId: z.string(), dueOn: DateOnly, note: z.string().max(2000) })
  .strict();
export type LearningAssignmentInput = z.infer<typeof LearningAssignmentInputSchema>;

/** `POST /v1/team/members/:id/roadmap`: give someone without a plan a roadmap and a buddy. */
export const RoadmapAssignmentInputSchema = z
  .object({ templateId: z.string(), addOnIds: z.array(z.string()), buddyId: z.string() })
  .strict();
export type RoadmapAssignmentInput = z.infer<typeof RoadmapAssignmentInputSchema>;

/** What a write returns: the id of what was created. */
export const CreatedSchema = z.object({ id: z.string() });

/**
 * `POST /v1/team/members/:id/escalations` (no body): the manager escalates a new hire who is stuck.
 * Waiting on access goes to the workspace admins, anything else to People Ops; once a day per person.
 */
export const EscalationInputSchema = z.object({}).strict();
export const EscalationSchema = z.object({
  id: z.string(),
  to: z.enum(["admins", "people_ops"]),
});
export type Escalation = z.infer<typeof EscalationSchema>;

/* ---- Review queue -------------------------------------------------------------------------- */

export const ReviewItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: ContributionKindSchema,
  section: KnowledgeSectionSchema,
  author: PersonRefSchema,
  submittedAt: IsoDateTimeSchema,
  /** The current page, line by line; null for new pages. */
  before: z.array(z.string()).nullable(),
  after: z.array(z.string()),
  sources: z.array(z.string()),
});
export type ReviewItem = z.infer<typeof ReviewItemSchema>;

/** `GET /v1/me/reviews`: contributions waiting for the caller, oldest first. */
export const ReviewQueueSchema = z.object({
  items: z.array(ReviewItemSchema),
  /** Reviewed by the caller in the last 7 days. */
  reviewedRecently: Count,
});
export type ReviewQueue = z.infer<typeof ReviewQueueSchema>;

/** `POST /v1/me/reviews/:id/decision`: publish it, or send it back with a comment. */
export const ReviewDecisionInputSchema = z
  .object({
    decision: z.enum(["approve", "request_changes"]),
    comment: z.string().max(2000),
  })
  .strict();
export type ReviewDecisionInput = z.infer<typeof ReviewDecisionInputSchema>;
export const ReviewDecisionSchema = z.object({
  id: z.string(),
  status: z.enum(["published", "changes_requested"]),
});

/* ---- My learning (managers, HR, admins) ------------------------------------------------------ */

export const CourseKindSchema = z.enum(["review", "project", "decisions", "coaching", "other"]);

/** `GET /v1/me/learning`: for people past onboarding: what's assigned, suggested and done. */
export const MyLearningSchema = z.object({
  /** "Daniel Reyes · Engineering Manager" and when onboarding ended, for the header. */
  onboardingFinishedOn: DateOnly.nullable(),
  assigned: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      kind: CourseKindSchema,
      reason: z.string(),
      dueOn: DateOnly.nullable(),
      lessonCount: Count,
      lessonsDone: Count,
      minutes: Count,
    }),
  ),
  suggested: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      kind: CourseKindSchema,
      reason: z.string(),
      minutes: Count,
    }),
  ),
  completed: z.array(z.object({ id: z.string(), title: z.string(), completedOn: DateOnly })),
});
export type MyLearning = z.infer<typeof MyLearningSchema>;

/** `POST /v1/me/learning/:id/add`: add a suggested course to "Assigned to you". */
export const AddCourseInputSchema = z.object({}).strict();
