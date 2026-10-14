import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common.js";
import { PageQuerySchema } from "./platform.js";

// ----- conflicts (PRD §8.1.4, §8.6) -----
export const ConflictStatusSchema = z.enum([
  "open",
  "under_review",
  "auto_resolved",
  "resolved",
  "accepted_ambiguity",
]);
export type ConflictStatus = z.infer<typeof ConflictStatusSchema>;
export const ConflictResolveInputSchema = z
  .object({
    version: z.number().int().positive(),
    outcome: z.enum(["resolved", "accepted_ambiguity"]),
    /** Required when outcome is `resolved`. */
    canonicalItemId: IdSchema.optional(),
    rationale: z.string().trim().min(3).max(4000),
  })
  .strict();
export const ConflictDisputeInputSchema = z
  .object({ version: z.number().int().positive(), reason: z.string().trim().min(3).max(2000) })
  .strict();
export const CanonicalSourceInputSchema = z
  .object({
    sourceId: IdSchema,
    topicType: z.enum([
      "architecture",
      "delivery_status",
      "product_requirements",
      "ownership",
      "process",
      "customer_facts",
    ]),
  })
  .strict();

// ----- Ask feedback and promotion (FR-ASK-008/009) -----
export const AnswerFeedbackReasonSchema = z.enum([
  "wrong",
  "outdated",
  "missing_source",
  "not_helpful",
  "leaked",
]);
export const AnswerFeedbackInputSchema = z
  .object({
    rating: z.enum(["up", "down"]),
    reason: AnswerFeedbackReasonSchema.optional(),
    comment: z.string().trim().max(2000).optional(),
  })
  .strict();
export type AnswerFeedback = z.infer<typeof AnswerFeedbackInputSchema> & { at: string };
export const PromoteAnswerInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
export const PromotionDecisionSchema = z
  .object({
    version: z.number().int().positive(),
    accepted: z.boolean(),
    reason: z.string().trim().max(2000).default(""),
  })
  .strict();

// ----- flags (PRD §8.1.2) -----
export const FlagStatusSchema = z.enum([
  "open",
  "triaged",
  "in_progress",
  "pending_verification",
  "bounty_created",
  "resolved",
  "rejected",
  "duplicate",
]);
export type FlagStatus = z.infer<typeof FlagStatusSchema>;
export const FlagUpdateInputSchema = z
  .object({
    version: z.number().int().positive(),
    status: z.enum([
      "triaged",
      "in_progress",
      "resolved",
      "rejected",
      "duplicate",
      "bounty_created",
    ]),
    reason: z.string().trim().max(2000).default(""),
    duplicateOfId: IdSchema.optional(),
    /** Reward for a bounty created from this flag; defaults to the base point table. */
    rewardRp: z.number().int().min(10).max(500).optional(),
  })
  .strict();

// ----- bounties (PRD §8.1.3, FR-GAM-005) -----
export const BountyStatusSchema = z.enum([
  "draft",
  "open",
  "claimed",
  "submitted",
  "approved",
  "paid",
  "expired",
  "cancelled",
]);
export type BountyStatus = z.infer<typeof BountyStatusSchema>;
export const BountyOriginSchema = z.enum([
  "manual",
  "conflict",
  "stale",
  "gap",
  "ownership",
  "flag",
]);
export const BountyInputSchema = z
  .object({
    projectId: IdSchema,
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(4000).default(""),
    acceptanceCriteria: z.string().trim().max(4000).default(""),
    rewardRp: z.number().int().min(10).max(500),
    rewardKc: z.number().int().min(0).max(500).default(0),
    deadline: IsoDateTimeSchema.optional(),
    verifierId: z.string().min(1).max(200).optional(),
    targetType: z.enum(["context_item", "section", "overview", "answer"]).optional(),
    targetId: z.string().min(1).max(200).optional(),
    /** Publish immediately (`open`) or keep as a draft. */
    publish: z.boolean().default(true),
  })
  .strict();
export const BountySubmitInputSchema = z
  .object({
    version: z.number().int().positive(),
    note: z.string().trim().min(1).max(4000),
    evidenceUrl: z.url().optional(),
    correctionId: IdSchema.optional(),
  })
  .strict();
export const BountyDecisionSchema = z
  .object({
    version: z.number().int().positive(),
    approved: z.boolean(),
    note: z.string().trim().max(2000).default(""),
  })
  .strict();
export const BountyListQuerySchema = PageQuerySchema.extend({
  status: BountyStatusSchema.optional(),
  projectId: IdSchema.optional(),
  origin: BountyOriginSchema.optional(),
  mine: z.coerce.boolean().optional(),
});

// ----- search (FR-SRCH-002) -----
export const SearchTypeSchema = z.enum([
  "context_item",
  "source",
  "project",
  "path",
  "bounty",
  "person",
]);
export const SearchQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().min(2).max(200),
  projectId: IdSchema.optional(),
  /** Comma-separated type facets; all types when omitted. */
  types: z.string().max(200).optional(),
});
