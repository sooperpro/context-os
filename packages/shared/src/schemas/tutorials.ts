import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";
import { ModuleKindSchema } from "./learning.js";
import { PersonRefSchema } from "./refs.js";

/*
 * Tutorials: step-by-step learning built from a project's knowledge (FR-LRN-001/004/005/008/012).
 *
 * The AI drafts a tutorial (lessons in Markdown and a knowledge check) from what the Knowledge Hub
 * already extracted, and it is stored as a draft. A curator reviews and edits it, then publishes a
 * version; learners only ever see published versions. Drive syncs never change a tutorial: when its
 * sources change it shows "Needs update" and the curator decides whether to regenerate.
 */

const Count = z.number().int().min(0);
const DateOnly = z.iso.date();

export const TutorialStatusSchema = z.enum([
  "generating",
  "draft",
  "published",
  "archived",
  "failed",
]);
export type TutorialStatus = z.infer<typeof TutorialStatusSchema>;

/** A lesson: Markdown the learner reads, and the sources it is based on. */
export const TutorialLessonSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1).max(200),
  type: z.enum(["article", "practical"]),
  minutes: z.number().int().min(1).max(600),
  /** GitHub-flavoured Markdown: headings, lists, tables, bold, code, quotes. */
  body: z.string().max(40_000),
  /** Titles of the sources it draws on, shown as "Based on". */
  basedOn: z.array(z.string()),
  sourceIds: z.array(z.string()),
});
export type TutorialLesson = z.infer<typeof TutorialLessonSchema>;

export const TutorialQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string().trim().min(1).max(1000),
  options: z
    .array(z.object({ id: z.string(), text: z.string().trim().min(1).max(500) }))
    .min(2)
    .max(6),
  correctOptionId: z.string(),
  explanation: z.string().max(2000),
  /** Where the answer comes from, for the result review. */
  source: z.string(),
  /** The source behind it; learners who can't open that source don't get the question. */
  sourceId: z.string().nullable().optional(),
});
export type TutorialQuestion = z.infer<typeof TutorialQuestionSchema>;

export const TutorialCheckSchema = z.object({
  passMark: Count,
  questions: z.array(TutorialQuestionSchema).min(1).max(30),
});
export type TutorialCheck = z.infer<typeof TutorialCheckSchema>;

/** What a tutorial teaches: the part curators edit and learners read. */
export const TutorialContentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  /** Markdown: why this matters, shown at the top of the module. */
  summary: z.string().max(4000),
  kind: ModuleKindSchema,
  objectives: z.array(z.string().trim().min(1).max(300)).max(8),
  lessons: z.array(TutorialLessonSchema).max(20),
  check: TutorialCheckSchema.nullable(),
});
export type TutorialContent = z.infer<typeof TutorialContentSchema>;

/** `GET /v1/tutorials`: everything curators can manage, newest first. */
export const TutorialSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: TutorialStatusSchema,
  /** A new draft is being written (first draft or a regenerate). */
  generating: z.boolean(),
  project: z.object({ id: z.string(), name: z.string() }),
  audience: z.string(),
  lessonCount: Count,
  questionCount: Count,
  minutes: Count,
  /** Published version learners see; null until first published. */
  publishedVersion: z.number().int().positive().nullable(),
  /** The draft differs from what learners see. */
  unpublishedChanges: z.boolean(),
  /** Sources changed or removed since it was generated (FR-LRN-008). */
  staleSources: Count,
  learners: Count,
  updatedAt: IsoDateTimeSchema,
  createdBy: PersonRefSchema.nullable(),
});
export type TutorialSummary = z.infer<typeof TutorialSummarySchema>;
export const TutorialListSchema = z.object({ items: z.array(TutorialSummarySchema) });

export const TutorialSourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** changed: edited in its tool since generation; removed: no longer synced. */
  state: z.enum(["current", "changed", "removed"]),
  /** Restricted sources lock the lessons built on them for people who can't open the source. */
  restricted: z.boolean(),
});

/** `GET /v1/tutorials/:id`: the Studio view of one tutorial. */
export const TutorialDetailSchema = TutorialSummarySchema.extend({
  /**
   * The viewer can't open every source behind it: `content` is withheld and `sources` lists only the
   * ones they can open. They can't edit, publish, regenerate or assign it.
   */
  restrictedForYou: z.boolean(),
  focus: z.string().nullable(),
  /** A template module this tutorial teaches ("mod-architecture"); roadmaps use it for that slot. */
  coversModule: z.string().nullable(),
  content: TutorialContentSchema.nullable(),
  sources: z.array(TutorialSourceSchema),
  generatedAt: IsoDateTimeSchema.nullable(),
  publishedAt: IsoDateTimeSchema.nullable(),
  publishedBy: PersonRefSchema.nullable(),
  /** Why generation failed, when status is "failed". */
  error: z.string().nullable(),
  /** Template modules it can stand in for, for the "Teaches template module" picker. */
  moduleOptions: z.array(z.object({ id: z.string(), title: z.string() })),
});
export type TutorialDetail = z.infer<typeof TutorialDetailSchema>;

/** `POST /v1/tutorials` (202): draft one from a project's knowledge, in the background. */
export const TutorialCreateInputSchema = z
  .object({
    projectId: z.string().min(1),
    /** Who it's for: "New engineers", "Everyone". */
    audience: z.string().trim().min(1).max(100),
    /** Optional angle: "How billing works end to end". */
    focus: z.string().trim().max(300).optional(),
    coversModule: z.string().max(100).nullable().optional(),
  })
  .strict();
export type TutorialCreateInput = z.infer<typeof TutorialCreateInputSchema>;

/** `PATCH /v1/tutorials/:id`: curator edits to the draft. */
export const TutorialUpdateInputSchema = z
  .object({
    content: TutorialContentSchema.optional(),
    audience: z.string().trim().min(1).max(100).optional(),
    coversModule: z.string().max(100).nullable().optional(),
  })
  .strict();
export type TutorialUpdateInput = z.infer<typeof TutorialUpdateInputSchema>;

/** `POST /v1/tutorials/:id/regenerate` (202): redraft from the current knowledge. */
export const TutorialRegenerateInputSchema = z
  .object({ focus: z.string().trim().max(300).optional() })
  .strict();

/** `POST /v1/tutorials/:id/publish`. */
export const TutorialPublishInputSchema = z
  .object({
    /** Move people already taking it to this version (FR-LRN-012); otherwise they finish theirs. */
    updateLearners: z.boolean(),
  })
  .strict();
export type TutorialPublishInput = z.infer<typeof TutorialPublishInputSchema>;

/** `POST /v1/tutorials/:id/assign`: give it to someone with an optional due date. */
export const TutorialAssignInputSchema = z
  .object({ userId: z.string().min(1), dueOn: DateOnly.nullable() })
  .strict();
export type TutorialAssignInput = z.infer<typeof TutorialAssignInputSchema>;
export const TutorialAssignmentSchema = z.object({
  /** Where it went: their onboarding roadmap, or My learning. */
  placedIn: z.enum(["roadmap", "my_learning"]),
  moduleId: z.string(),
});
