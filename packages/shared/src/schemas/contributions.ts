import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";
import { FlagTargetTypeSchema } from "./platform.js";
import { KnowledgeOriginSchema, KnowledgeSectionSchema, PersonRefSchema } from "./refs.js";

/*
 * Contracts for contributions: knowledge people write or fix, reviewed by an owner, then published
 * for Context Bot to cite (prototype "Contributions" and "New contribution").
 *
 * Only flags (`POST /flags`) exist in the API today. The endpoints below are answered by the web app's
 * development mock layer until they ship; docs/api-change-requests.md tracks them.
 */

const Count = z.number().int().min(0);

export const ContributionKindSchema = z.enum(["article", "edit", "glossary_term", "flag"]);
export type ContributionKind = z.infer<typeof ContributionKindSchema>;

/** Kinds a person can write in the editor (flags are raised from the item itself). */
export const WritableContributionKindSchema = z.enum(["article", "edit", "glossary_term"]);
export type WritableContributionKind = z.infer<typeof WritableContributionKindSchema>;

/** Where a contribution sits on draft → submitted → in review → published (or resolved for flags). */
export const ContributionStatusSchema = z.enum([
  "draft",
  "submitted",
  "in_review",
  "changes_requested",
  "published",
  "resolved",
  "rejected",
]);
export type ContributionStatus = z.infer<typeof ContributionStatusSchema>;

export const ContributionVisibilitySchema = z.enum(["workspace", "team"]);
export type ContributionVisibility = z.infer<typeof ContributionVisibilitySchema>;

export const ContributionCommentSchema = z.object({
  id: z.string(),
  author: PersonRefSchema,
  at: IsoDateTimeSchema,
  text: z.string(),
});
export type ContributionComment = z.infer<typeof ContributionCommentSchema>;

export const ContributionSchema = z.object({
  id: z.string(),
  kind: ContributionKindSchema,
  title: z.string(),
  section: KnowledgeSectionSchema,
  status: ContributionStatusSchema,
  visibility: ContributionVisibilitySchema,
  reviewer: PersonRefSchema.nullable(),
  /** Shown next to the reviewer: "usually 2 working days", "resubmitted today". */
  reviewNote: z.string().nullable(),
  submittedAt: IsoDateTimeSchema.nullable(),
  publishedAt: IsoDateTimeSchema.nullable(),
  updatedAt: IsoDateTimeSchema,
  /** What happened after publishing: "Viewed by 6 people · 2 marked it helpful", "Fixed by Tom Becker". */
  impact: z.string().nullable(),
  comments: z.array(ContributionCommentSchema),
  /** The knowledge gap this answers, if it was started from one. */
  gapId: z.string().nullable(),
  sourceCount: Count,
});
export type Contribution = z.infer<typeof ContributionSchema>;

/** `GET /v1/me/contributions`: the caller's contributions, newest first. Home shows the first few. */
export const ContributionListSchema = z.object({ items: z.array(ContributionSchema) });

/** A question Context Bot answered badly: no answer, sources that disagree, or an old source. */
export const KnowledgeGapSchema = z.object({
  id: z.string(),
  question: z.string(),
  reason: z.enum(["no_answer", "conflict", "stale"]),
  /** Why it is a gap, for people: "Asked 7 times in Context Bot. No page answers it." */
  detail: z.string(),
  askedCount: Count,
  section: KnowledgeSectionSchema.nullable(),
  /** Pages and projects it touches: "Project Kestrel", "Release process". */
  related: z.array(z.string()),
  suggestedKind: z.enum(["article", "edit"]),
  /**
   * The page a stale or conflict gap is about (from a flag someone on the team raised): "Review
   * sources" opens it and "Request update" flags it again. Null for unanswered questions.
   */
  target: z
    .object({
      projectId: z.string(),
      targetType: FlagTargetTypeSchema,
      targetId: z.string(),
    })
    .nullable()
    .optional(),
});
export type KnowledgeGap = z.infer<typeof KnowledgeGapSchema>;

/**
 * `GET /v1/me/knowledge-gaps`: gaps the caller could fill. `GET /v1/team/knowledge-gaps`: gaps from
 * the manager's team this month. Most asked first.
 */
export const KnowledgeGapListSchema = z.object({ items: z.array(KnowledgeGapSchema) });

/** A source the caller can access, as the editor's source picker lists it. */
export const SourcePickSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  /** What it is: "Doc", "Slack thread · 14 replies", "Jira issue". */
  label: z.string(),
  origin: KnowledgeOriginSchema,
  owner: z.string().nullable(),
  /** The connector it came from is failing, so it may be out of date. */
  stale: z.boolean(),
});
export type SourcePick = z.infer<typeof SourcePickSchema>;

/** `GET /v1/sources/search?q=&limit=`: sources the caller can access, best match first. */
export const SourcePickListSchema = z.object({ items: z.array(SourcePickSchema) });

/** `GET /v1/contributions/reviewer?section=&title=`: who would review a contribution like this. */
export const SuggestedReviewerSchema = z.object({
  reviewer: PersonRefSchema,
  /** Why them: "Owns Kestrel technical docs". */
  reason: z.string(),
});
export type SuggestedReviewer = z.infer<typeof SuggestedReviewerSchema>;

/** `POST /v1/contributions/draft`: Context Bot drafts the body from sources. */
export const ContributionDraftInputSchema = z
  .object({
    kind: WritableContributionKindSchema,
    title: z.string().trim().max(200),
    /** Empty asks the server to pick matching sources. */
    sourceIds: z.array(z.string()).max(10),
  })
  .strict();
export type ContributionDraftInput = z.infer<typeof ContributionDraftInputSchema>;

export const ContributionDraftSchema = z.object({
  body: z.string(),
  /** The sources the draft is based on; the editor adds them to the contribution. */
  sources: z.array(SourcePickSchema),
});
export type ContributionDraft = z.infer<typeof ContributionDraftSchema>;

/** A contribution can be submitted with a title, enough text to check, and a source. */
export const CONTRIBUTION_MIN_TITLE = 4;
export const CONTRIBUTION_MIN_WORDS = 40;

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** `POST /v1/contributions`: save a draft (`submit: false`) or submit it for review. */
export const ContributionInputSchema = z
  .object({
    kind: WritableContributionKindSchema,
    title: z.string().trim().max(200),
    section: KnowledgeSectionSchema,
    visibility: ContributionVisibilitySchema,
    body: z.string().max(50_000),
    sourceIds: z.array(z.string()).max(20),
    gapId: z.string().nullable(),
    submit: z.boolean(),
  })
  .strict()
  .superRefine((input, context) => {
    if (!input.submit) return;
    if (input.title.length < CONTRIBUTION_MIN_TITLE)
      context.addIssue({ code: "custom", path: ["title"], message: "Add a title." });
    if (countWords(input.body) < CONTRIBUTION_MIN_WORDS)
      context.addIssue({
        code: "custom",
        path: ["body"],
        message: `Write at least ${CONTRIBUTION_MIN_WORDS} words.`,
      });
    if (input.sourceIds.length === 0)
      context.addIssue({
        code: "custom",
        path: ["sourceIds"],
        message: "Add at least one source.",
      });
  });
export type ContributionInput = z.infer<typeof ContributionInputSchema>;

/** `POST /v1/contributions/:id/resubmit`: send a contribution back after addressing review comments. */
export const ContributionResubmitInputSchema = z.object({}).strict();
