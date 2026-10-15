import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";
import { TemplateFamilySchema } from "./home.js";
import { ModuleKindSchema } from "./learning.js";
import { OnboardingStatusSchema, PersonRefSchema } from "./refs.js";

/*
 * Contracts for People Ops (HR): onboarding records across the company, probation reviews and the
 * onboarding templates (prototype "Onboarding", "Probation reviews", "Templates"). The API has
 * `/probation/plans` and `/learning/paths` as generic records; these are the views and writes the
 * screens need. Until they are served, the web app's development mock layer answers them;
 * docs/api-change-requests.md tracks them. HR Home's cards read some of the same endpoints.
 */

const Fraction = z.number().min(0).max(1);
const DateOnly = z.iso.date();
const Count = z.number().int().min(0);

/* ---- Onboarding records -------------------------------------------------------------------- */

export const OnboardingRecordSummarySchema = z.object({
  /** The person's id. */
  id: z.string(),
  person: PersonRefSchema,
  team: z.string(),
  manager: PersonRefSchema.nullable(),
  buddy: PersonRefSchema.nullable(),
  startDate: DateOnly,
  template: z.object({ id: z.string(), name: z.string() }).nullable(),
  stage: z.string().nullable(),
  progress: Fraction,
  expected: Fraction,
  status: OnboardingStatusSchema,
  /** One line on where it stands: "2 modules overdue · failed billing check twice". */
  note: z.string(),
  setup: z.object({ done: Count, total: Count }),
});
export type OnboardingRecordSummary = z.infer<typeof OnboardingRecordSummarySchema>;

export const OnboardingFilterSchema = z.enum(["all", "attention", "starting", "progress"]);
export type OnboardingFilter = z.infer<typeof OnboardingFilterSchema>;

/** `GET /v1/people-ops/onboardings?q=&team=&filter=`: onboarding across the company, most urgent first. */
export const OnboardingRecordListSchema = z.object({
  /** Everyone onboarding or starting soon, including records not listed (on track, nothing due). */
  total: Count,
  startingNext14Days: Count,
  teams: z.array(z.string()),
  counts: z.record(OnboardingFilterSchema, Count),
  items: z.array(OnboardingRecordSummarySchema),
});
export type OnboardingRecordList = z.infer<typeof OnboardingRecordListSchema>;

export const SetupStepIdSchema = z.enum([
  "account",
  "laptop",
  "roadmap",
  "buddy",
  "welcome",
  "calendar",
]);
export type SetupStepId = z.infer<typeof SetupStepIdSchema>;

/** `GET /v1/people-ops/onboardings/:id`: one record. */
export const OnboardingRecordSchema = OnboardingRecordSummarySchema.extend({
  peoplePartner: PersonRefSchema.nullable(),
  setupSteps: z.array(
    z.object({
      id: SetupStepIdSchema,
      label: z.string(),
      done: z.boolean(),
      /** Who did it, when not People Ops: "Created by SCIM". */
      doneBy: z.string().nullable(),
    }),
  ),
  milestones: z.array(
    z.object({ title: z.string(), on: DateOnly, state: z.enum(["done", "soon", "later"]) }),
  ),
  /** "Last check-in Oct 1 · some concerns". */
  lastCheckin: z.string().nullable(),
  /** Their probation review, once it is in the pipeline. */
  probationReviewId: z.string().nullable(),
});
export type OnboardingRecord = z.infer<typeof OnboardingRecordSchema>;

/** `PATCH /v1/people-ops/onboardings/:id`: change the manager, buddy, template or People partner. */
export const OnboardingAssignmentInputSchema = z
  .object({
    managerId: z.string().optional(),
    buddyId: z.string().optional(),
    templateId: z.string().optional(),
    peoplePartnerId: z.string().optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, { message: "Change something." });
export type OnboardingAssignmentInput = z.infer<typeof OnboardingAssignmentInputSchema>;

/** Who on an onboarding record People Ops can write to. */
export const OnboardingRecipientSchema = z.enum(["person", "manager", "buddy"]);
export type OnboardingRecipient = z.infer<typeof OnboardingRecipientSchema>;

/**
 * `POST /v1/people-ops/onboardings/:id/message`: a short note from People Ops to the new hire, their
 * manager or their buddy, delivered as an in-app notification.
 */
export const OnboardingMessageInputSchema = z
  .object({
    to: z.array(OnboardingRecipientSchema).min(1, "Choose who to message.").max(3),
    message: z
      .string()
      .trim()
      .min(1, "Write a message.")
      .max(1000, "Keep it under 1,000 characters."),
  })
  .strict();
export type OnboardingMessageInput = z.infer<typeof OnboardingMessageInputSchema>;
/** Who got it, and who didn't and why ("Hasn't signed in yet"). */
export const OnboardingMessageResultSchema = z.object({
  delivered: z.array(PersonRefSchema),
  skipped: z.array(z.object({ name: z.string(), reason: z.string() })),
});
export type OnboardingMessageResult = z.infer<typeof OnboardingMessageResultSchema>;

/** `POST /v1/people-ops/onboardings/:id/setup/:step`: mark a setup step done (sends the welcome message). */
export const SetupStepInputSchema = z.object({}).strict();

/** `GET /v1/people-ops/onboarding-options`: who and what can be assigned. */
export const OnboardingOptionsSchema = z.object({
  teams: z.array(z.string()),
  managers: z.array(PersonRefSchema),
  buddies: z.array(PersonRefSchema),
  /** Everyone with the HR role. */
  peoplePartners: z.array(PersonRefSchema),
  templates: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type OnboardingOptions = z.infer<typeof OnboardingOptionsSchema>;

/** `POST /v1/people-ops/onboardings`: start an onboarding for someone joining. */
export const NewOnboardingInputSchema = z
  .object({
    name: z.string().trim().min(2, "Add their full name.").max(200),
    title: z.string().trim().min(2, "Add a job title.").max(200),
    /**
     * Their work email. Links the record to their account: an invitation is sent, and the manager
     * and start date apply on first sign-in. Without it, the record waits for directory sync.
     */
    email: z.email("Add a valid work email.").max(320).nullable().optional(),
    team: z.string().min(1),
    startDate: DateOnly,
    managerId: z.string(),
    buddyId: z.string().nullable(),
    templateId: z.string().nullable(),
  })
  .strict();
export type NewOnboardingInput = z.infer<typeof NewOnboardingInputSchema>;

/* ---- Probation reviews --------------------------------------------------------------------- */

export const ProbationDecisionSchema = z.object({
  outcome: z.enum(["confirmed", "extended"]),
  /** For extensions: "30 days". */
  extension: z.string().nullable(),
  decidedOn: DateOnly,
  effectiveOn: DateOnly,
  decidedBy: PersonRefSchema,
  note: z.string(),
  notified: z.boolean(),
});
export type ProbationDecision = z.infer<typeof ProbationDecisionSchema>;

export const ProbationActivitySchema = z.object({
  id: z.string(),
  on: DateOnly,
  text: z.string(),
  kind: z.enum([
    "started",
    "review",
    "recommended_confirm",
    "recommended_extend",
    "missed",
    "decided",
  ]),
});

/** `GET /v1/people-ops/probation-reviews/:id`: the evidence, the manager's recommendation and the decision. */
export const ProbationDetailSchema = z.object({
  id: z.string(),
  person: PersonRefSchema,
  team: z.string(),
  manager: PersonRefSchema,
  startDate: DateOnly,
  reviewOn: DateOnly,
  /** Same states as the list; `completed` once HR records a decision. */
  state: z.enum([
    "ready_for_approval",
    "awaiting_manager",
    "needs_hr_review",
    "checkins_missing",
    "completed",
  ]),
  recommendation: z.enum(["confirm", "extend", "discuss", "awaiting_manager", "not_started"]),
  recommendedOn: DateOnly.nullable(),
  recommendationDueOn: DateOnly.nullable(),
  readiness: Fraction,
  /** Area → 0 Not yet … 3 Exceeds; null until the manager submits. */
  ratings: z
    .array(z.object({ area: z.string(), level: z.number().int().min(0).max(3) }))
    .nullable(),
  managerNote: z.string().nullable(),
  milestones: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      state: z.enum(["done", "active", "overdue"]),
    }),
  ),
  /** "8 check-ins · last on Oct 6". */
  checkinSummary: z.string(),
  /** Check-ins expected by now (one every 30 days) but not recorded. */
  missingCheckins: Count,
  activity: z.array(ProbationActivitySchema),
  decision: ProbationDecisionSchema.nullable(),
});
export type ProbationDetail = z.infer<typeof ProbationDetailSchema>;

/** `POST /v1/people-ops/probation-reviews/:id/decision`: confirm employment or extend probation. */
export const ProbationDecisionInputSchema = z
  .object({
    outcome: z.enum(["confirm", "extend"]),
    extensionDays: z.union([z.literal(30), z.literal(60), z.literal(90)]).nullable(),
    effectiveOn: DateOnly,
    note: z.string().max(2000),
    notify: z.boolean(),
  })
  .strict()
  .refine((input) => input.outcome !== "extend" || input.extensionDays !== null, {
    message: "Choose how long to extend.",
    path: ["extensionDays"],
  });
export type ProbationDecisionInput = z.infer<typeof ProbationDecisionInputSchema>;

/** `POST /v1/people-ops/probation-reviews/:id/discuss`: ask the manager to talk before deciding. */
export const ProbationDiscussInputSchema = z.object({ note: z.string().trim().max(2000) }).strict();
export type ProbationDiscussInput = z.infer<typeof ProbationDiscussInputSchema>;

/**
 * `POST /v1/probation/employees/:userId/recommendation`: the manager's probation recommendation
 * (a "Probation recommendation" check-in). It goes to HR as ready for approval; HR records the
 * employment status decision.
 */
export const ProbationRecommendationInputSchema = z
  .object({
    recommendation: z.enum(["confirm", "extend", "discuss"]),
    ratings: z
      .array(
        z.object({
          area: z.string().trim().min(1).max(100),
          level: z.number().int().min(0).max(3),
        }),
      )
      .max(20),
    note: z.string().trim().max(4000),
  })
  .strict();
export type ProbationRecommendationInput = z.infer<typeof ProbationRecommendationInputSchema>;

/**
 * `POST /v1/people-ops/reminders`: nudge managers about probation recommendations and missing
 * check-ins, or about overdue onboarding milestones.
 */
export const ReminderInputSchema = z
  .object({
    about: z.enum(["probation_review", "milestone"]),
    ids: z.array(z.string()).min(1),
  })
  .strict();
export type ReminderInput = z.infer<typeof ReminderInputSchema>;
export const ReminderResultSchema = z.object({ reminded: z.array(PersonRefSchema) });
export type ReminderResult = z.infer<typeof ReminderResultSchema>;

/* ---- Templates ----------------------------------------------------------------------------- */

/** Module kinds in templates: the learner's module kinds plus a few role-specific ones. */
export const TemplateModuleKindSchema = z.union([
  ModuleKindSchema,
  z.enum(["check", "sales", "support", "design", "data", "people"]),
]);
export type TemplateModuleKind = z.infer<typeof TemplateModuleKindSchema>;

export const TemplateModuleSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: TemplateModuleKindSchema,
  /** Null for open-ended practical tasks ("Ongoing"). */
  minutes: Count.nullable(),
  owner: z.string().nullable(),
});
export type TemplateModule = z.infer<typeof TemplateModuleSchema>;

/** `GET /v1/people-ops/templates/:id`: a template with its stages and history. */
export const TemplateDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  family: TemplateFamilySchema,
  /** The draft's version while `status` is draft, otherwise the published one: "v4". */
  version: z.string(),
  status: z.enum(["published", "draft"]),
  /** The version active onboardings use; null for a template that was never published. */
  publishedVersion: z.string().nullable(),
  activeCount: Count,
  /** Hidden from new onboardings. People already on it keep their roadmap. */
  archived: z.boolean(),
  /** False when onboardings used it (archive it instead) or it is the workspace's last template. */
  deletable: z.boolean(),
  roles: z.array(z.string()),
  teams: z.array(z.string()),
  weeks: Count,
  passMark: Count,
  updatedAt: IsoDateTimeSchema,
  updatedBy: z.string(),
  stages: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      weekStart: z.number().int().min(1),
      weekEnd: z.number().int().min(1),
      modules: z.array(TemplateModuleSchema),
    }),
  ),
  history: z.array(
    z.object({
      version: z.string(),
      on: DateOnly,
      note: z.string(),
      /** True when a copy of that version was kept, so it can be opened. Older versions have none. */
      saved: z.boolean(),
    }),
  ),
});
export type TemplateDetail = z.infer<typeof TemplateDetailSchema>;

/** `POST /v1/people-ops/templates/:id/archive` and `/restore`: no body. */
export const TemplateArchiveInputSchema = z.object({}).strict();

/** `GET /v1/people-ops/templates/:id/versions/:n`: one published version as it was when published. */
export const TemplateVersionSchema = TemplateDetailSchema.pick({
  id: true,
  name: true,
  roles: true,
  teams: true,
  weeks: true,
  passMark: true,
  stages: true,
}).extend({ version: z.string(), publishedOn: DateOnly, note: z.string() });
export type TemplateVersion = z.infer<typeof TemplateVersionSchema>;

/** `POST /v1/people-ops/templates/:id/draft`: save the stages' modules, in order, as a draft. */
export const TemplateDraftInputSchema = z
  .object({
    stages: z.array(z.object({ id: z.string(), moduleIds: z.array(z.string()) })),
    /** Who it's for. Omit to keep the current lists. */
    roles: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    teams: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  })
  .strict();
export type TemplateDraftInput = z.infer<typeof TemplateDraftInputSchema>;

/** `POST /v1/people-ops/templates/:id/publish`: publish the current stages with a note for the history. */
export const TemplatePublishInputSchema = TemplateDraftInputSchema.extend({
  note: z.string().max(500),
}).strict();
export type TemplatePublishInput = z.infer<typeof TemplatePublishInputSchema>;

/** `POST /v1/people-ops/templates`: a new draft, copied from an existing template. */
export const NewTemplateInputSchema = z
  .object({ name: z.string().trim().max(200), baseId: z.string() })
  .strict();
export type NewTemplateInput = z.infer<typeof NewTemplateInputSchema>;

/** `GET /v1/people-ops/template-library`: modules that can be added to a template. */
export const TemplateLibrarySchema = z.object({ items: z.array(TemplateModuleSchema) });
