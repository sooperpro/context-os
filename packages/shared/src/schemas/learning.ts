import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";
import { KnowledgeOriginSchema, OnboardingStatusSchema, PersonRefSchema } from "./refs.js";

/*
 * Contracts for the learner's side of onboarding: My roadmap, a module, a lesson and a knowledge
 * check (prototype "learn" pages).
 *
 * The API has learning paths, assignments, progress, quizzes and sign-off (`/learning/*`), but they
 * return generic records. These are the views the screens need, built from that data. Until they are
 * served, the web app's development mock layer answers them; docs/api-change-requests.md tracks them.
 */

const Fraction = z.number().min(0).max(1);
const DateOnly = z.iso.date();
const Count = z.number().int().min(0);

export const LessonTypeSchema = z.enum(["article", "video", "slides", "check", "practical"]);
export type LessonType = z.infer<typeof LessonTypeSchema>;

/** What a module is about; the UI picks its icon from this. */
export const ModuleKindSchema = z.enum([
  "company",
  "business",
  "product",
  "process",
  "systems",
  "project",
  "decisions",
  "practical",
  "contribution",
]);
export type ModuleKind = z.infer<typeof ModuleKindSchema>;

export const ModuleStatusSchema = z.enum(["done", "active", "todo", "locked"]);
export type ModuleStatus = z.infer<typeof ModuleStatusSchema>;

export const StageStateSchema = z.enum(["done", "current", "next", "later"]);
export type StageState = z.infer<typeof StageStateSchema>;

/** Where a link into learning goes. A knowledge check is a lesson of type "check"; its id is the check's. */
export const LearningTargetSchema = z.object({
  kind: z.enum(["module", "lesson", "check"]),
  id: z.string(),
});
export type LearningTarget = z.infer<typeof LearningTargetSchema>;

/* ---- My roadmap (`GET /v1/me/roadmap`) --------------------------------------------------- */

export const RoadmapModuleSchema = z.object({
  id: z.string(),
  /** 1-based position in its stage. */
  number: z.number().int().min(1),
  title: z.string(),
  kind: ModuleKindSchema,
  status: ModuleStatusSchema,
  summary: z.string().nullable(),
  lessonCount: Count,
  /** Estimated time; null when `duration` describes it instead. */
  minutes: Count.nullable(),
  /** For long practical tasks: "2 weeks", "1 session". */
  duration: z.string().nullable(),
  progress: Fraction,
  dueOn: DateOnly.nullable(),
  completedOn: DateOnly.nullable(),
  /** How it ended: "Passed 9 of 10", "Approved by Sana Iqbal". */
  result: z.string().nullable(),
  /** Why it is unusual: "Assigned early by Daniel". */
  note: z.string().nullable(),
  owner: PersonRefSchema.nullable(),
});
export type RoadmapModule = z.infer<typeof RoadmapModuleSchema>;

export const RoadmapStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  weekStart: z.number().int().min(1),
  weekEnd: z.number().int().min(1),
  startsOn: DateOnly,
  endsOn: DateOnly,
  state: StageStateSchema,
  goal: z.string(),
  modules: z.array(RoadmapModuleSchema),
});
export type RoadmapStage = z.infer<typeof RoadmapStageSchema>;

export const LearningHistoryEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(["module", "check", "practical"]),
  title: z.string(),
  completedOn: DateOnly,
  result: z.string(),
});
export type LearningHistoryEntry = z.infer<typeof LearningHistoryEntrySchema>;

export const MyRoadmapSchema = z.object({
  template: z.object({ name: z.string(), version: z.string() }),
  /** The manager who adjusted the template for this person, if anyone. */
  adjustedBy: PersonRefSchema.nullable(),
  team: z.string().nullable(),
  startDate: DateOnly,
  totalDays: z.number().int().positive(),
  status: OnboardingStatusSchema,
  progress: Fraction,
  expected: Fraction,
  checks: z.object({ done: Count, total: Count }),
  stages: z.array(RoadmapStageSchema),
  probationReviewOn: DateOnly.nullable(),
  buddy: PersonRefSchema.nullable(),
  /** Completed modules, checks and tasks, newest first. */
  history: z.array(LearningHistoryEntrySchema),
});
export type MyRoadmap = z.infer<typeof MyRoadmapSchema>;

/* ---- Module (`GET /v1/me/modules/:id`) ----------------------------------------------------- */

export const ModuleLessonSchema = z.object({
  id: z.string(),
  number: z.number().int().min(1),
  title: z.string(),
  type: LessonTypeSchema,
  minutes: Count,
  /** Knowledge checks only. */
  questionCount: Count.nullable(),
  done: z.boolean(),
  /** Built on sources the person can't open: they can ask for access (`type: "access"`). */
  restricted: z.boolean().optional(),
  /** Marked by the learner to come back to. */
  revisit: z.boolean().optional(),
});
export type ModuleLesson = z.infer<typeof ModuleLessonSchema>;

export const LearningSourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** What it is: "Slides", "Video · 8 min", "Decision record". */
  label: z.string(),
  origin: KnowledgeOriginSchema,
  owner: z.string().nullable(),
  updatedAt: IsoDateTimeSchema,
  /** Set when the learner cannot open it: "Finance only". */
  restrictedTo: z.string().nullable(),
  url: z.url().nullable(),
  /** Its project, to open it in the app when it has no link of its own. */
  projectId: z.string().nullable().optional(),
});
export type LearningSource = z.infer<typeof LearningSourceSchema>;

export const LearningRatingValueSchema = z.enum(["up", "down"]);
export type LearningRatingValue = z.infer<typeof LearningRatingValueSchema>;

export const ModuleDetailSchema = z.object({
  id: z.string(),
  number: z.number().int().min(1),
  title: z.string(),
  kind: ModuleKindSchema,
  status: ModuleStatusSchema,
  stage: z.object({
    id: z.string(),
    name: z.string(),
    moduleCount: Count,
    /** When the stage opens, for locked modules. */
    opensOn: DateOnly.nullable(),
  }),
  objective: z.string(),
  /** "What you'll be able to do". */
  objectives: z.array(z.string()),
  minutes: Count.nullable(),
  duration: z.string().nullable(),
  owner: PersonRefSchema.nullable(),
  updatedAt: IsoDateTimeSchema.nullable(),
  reviewedBy: z.string().nullable(),
  progress: Fraction,
  completedOn: DateOnly.nullable(),
  result: z.string().nullable(),
  /** Empty for locked modules until their stage opens. */
  lessons: z.array(ModuleLessonSchema),
  sources: z.array(LearningSourceSchema),
  people: z.array(z.object({ person: PersonRefSchema, role: z.string() })),
  suggestedQuestion: z.string().nullable(),
  rating: LearningRatingValueSchema.nullable(),
  /** Marked by the learner to come back to. */
  revisit: z.boolean().optional(),
  /** What to take after this module: the next unlocked one that isn't finished. */
  nextModule: z.object({ id: z.string(), title: z.string() }).nullable().optional(),
});
export type ModuleDetail = z.infer<typeof ModuleDetailSchema>;

/** `GET /v1/me/revisit`: lessons and modules the learner marked to come back to. */
export const RevisitItemSchema = z.object({
  id: z.string(),
  kind: z.enum(["module", "lesson"]),
  title: z.string(),
  module: z.object({ id: z.string(), title: z.string() }),
});
export type RevisitItem = z.infer<typeof RevisitItemSchema>;
export const RevisitListSchema = z.object({ items: z.array(RevisitItemSchema) });
export type RevisitList = z.infer<typeof RevisitListSchema>;
/** `PUT` / `DELETE /v1/me/revisit/:id`: the mark after the change. */
export const RevisitStateSchema = z.object({ revisit: z.boolean() });

/* ---- Lesson (`GET /v1/me/lessons/:id`) ------------------------------------------------------- */

/** Text in ledes, paragraphs and list items may use **bold** and `code`; nothing else is interpreted. */
const FlowNodeSchema = z.object({
  title: z.string(),
  note: z.string().nullable(),
  tone: z.enum(["default", "warning", "accent"]),
});

export const LessonBlockSchema = z.discriminatedUnion("type", [
  /** A tutorial lesson's body: GitHub-flavoured Markdown, rendered as formatted text. */
  z.object({ type: z.literal("markdown"), text: z.string() }),
  z.object({ type: z.literal("lede"), text: z.string() }),
  z.object({ type: z.literal("heading"), text: z.string() }),
  z.object({ type: z.literal("paragraph"), text: z.string() }),
  z.object({ type: z.literal("list"), ordered: z.boolean(), items: z.array(z.string()) }),
  /** A diagram of rows of steps; a step with several nodes shows them stacked. */
  z.object({
    type: z.literal("flow"),
    caption: z.string(),
    rows: z.array(z.object({ label: z.string(), steps: z.array(z.array(FlowNodeSchema).min(1)) })),
  }),
  z.object({
    type: z.literal("decision"),
    reference: z.string(),
    status: z.enum(["accepted", "proposed", "superseded"]),
    decidedOn: DateOnly,
    statement: z.string(),
    decidedBy: z.array(z.string()),
    location: z.string().nullable(),
    origin: KnowledgeOriginSchema,
    url: z.url().nullable(),
  }),
  z.object({
    type: z.literal("milestones"),
    label: z.string(),
    items: z.array(
      z.object({
        title: z.string(),
        detail: z.string(),
        state: z.enum(["done", "current", "todo"]),
      }),
    ),
  }),
  z.object({
    type: z.literal("media"),
    kind: z.enum(["video", "slides"]),
    title: z.string(),
    minutes: Count,
    origin: KnowledgeOriginSchema,
    url: z.url().nullable(),
  }),
  /** Practice question inside a lesson; not graded, so the answer is included. */
  z.object({
    type: z.literal("check"),
    id: z.string(),
    question: z.string(),
    options: z.array(z.object({ id: z.string(), text: z.string() })).min(2),
    correctOptionId: z.string(),
    explanation: z.string(),
  }),
]);
export type LessonBlock = z.infer<typeof LessonBlockSchema>;

export const LessonSchema = z.object({
  id: z.string(),
  number: z.number().int().min(1),
  title: z.string(),
  type: LessonTypeSchema,
  minutes: Count,
  done: z.boolean(),
  module: z.object({
    id: z.string(),
    number: z.number().int().min(1),
    title: z.string(),
    kind: ModuleKindSchema,
    progress: Fraction,
  }),
  stage: z.object({ id: z.string(), name: z.string() }),
  /** The module's lessons, for the outline beside the lesson. */
  outline: z.array(ModuleLessonSchema),
  /** "ADR-042", "the Kestrel rollout plan". */
  basedOn: z.array(z.string()),
  reviewedBy: PersonRefSchema.nullable(),
  reviewedOn: DateOnly.nullable(),
  blocks: z.array(LessonBlockSchema),
  rating: LearningRatingValueSchema.nullable(),
  /** Marked by the learner to come back to. */
  revisit: z.boolean().optional(),
});
export type Lesson = z.infer<typeof LessonSchema>;

/** `POST /v1/me/lessons/:id/complete`: marks it done and says where to go next. */
export const LessonCompletionSchema = z.object({
  moduleProgress: Fraction,
  next: LearningTargetSchema.nullable(),
});
export type LessonCompletion = z.infer<typeof LessonCompletionSchema>;
export const LessonCompletionInputSchema = z.object({}).strict();

/* ---- Knowledge check (`GET /v1/me/checks/:id`, `POST /v1/me/checks/:id/attempts`) ------------ */

export const KnowledgeCheckSchema = z.object({
  id: z.string(),
  module: z.object({ id: z.string(), number: z.number().int().min(1), title: z.string() }),
  stage: z.object({ id: z.string(), name: z.string() }),
  passMark: Count,
  questions: z
    .array(
      z.object({
        id: z.string(),
        prompt: z.string(),
        options: z.array(z.object({ id: z.string(), text: z.string() })).min(2),
      }),
    )
    .min(1),
});
export type KnowledgeCheck = z.infer<typeof KnowledgeCheckSchema>;

export const CheckAttemptInputSchema = z
  .object({ answers: z.array(z.object({ questionId: z.string(), optionId: z.string() })).min(1) })
  .strict();
export type CheckAttemptInput = z.infer<typeof CheckAttemptInputSchema>;

/** Graded on the server: the correct answers are only revealed in the result. */
export const CheckResultSchema = z.object({
  score: Count,
  total: Count,
  passMark: Count,
  passed: z.boolean(),
  review: z.array(
    z.object({
      questionId: z.string(),
      chosenOptionId: z.string(),
      correctOptionId: z.string(),
      explanation: z.string(),
      /** Where the answer comes from: "ADR-042, “Decision”". */
      source: z.string(),
    }),
  ),
  /** What passing changed; null when not passed. */
  progress: z
    .object({
      stageName: z.string(),
      modulesDone: Count,
      moduleCount: Count,
      overallBefore: Fraction,
      overallAfter: Fraction,
      checksPassed: Count,
      checksTotal: Count,
    })
    .nullable(),
  nextModule: z.object({ id: z.string(), title: z.string() }).nullable(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

/* ---- Feedback and requests --------------------------------------------------------------------- */

/** `POST /v1/me/learning-ratings`: "Was this useful/clear?" on a module or lesson. Null clears it. */
export const LearningRatingInputSchema = z
  .object({
    targetType: z.enum(["module", "lesson"]),
    targetId: z.string(),
    value: LearningRatingValueSchema.nullable(),
  })
  .strict();
export type LearningRatingInput = z.infer<typeof LearningRatingInputSchema>;
export const LearningRatingSchema = z.object({ value: LearningRatingValueSchema.nullable() });

/**
 * `POST /v1/me/learning-requests`: "Request clarification" (goes to the module owner) or "Request a
 * roadmap change" (goes to the manager).
 */
export const LearningRequestInputSchema = z
  .object({
    type: z.enum(["clarification", "roadmap_change", "access"]),
    moduleId: z.string().nullable(),
    lessonId: z.string().nullable(),
    changeKind: z.enum(["due_date", "swap_module", "add_topic"]).nullable(),
    message: z.string().trim().min(1, "Say what you need.").max(2000),
  })
  .strict();
export type LearningRequestInput = z.infer<typeof LearningRequestInputSchema>;
export const LearningRequestSchema = z.object({ id: z.string(), recipient: PersonRefSchema });
export type LearningRequest = z.infer<typeof LearningRequestSchema>;
