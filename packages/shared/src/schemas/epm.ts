import { z } from "zod";
import { IdSchema, IsoDateSchema } from "./common.js";

/** Neutral impact themes (FR-EPM-002). */
export const EpmThemeSchema = z.enum([
  "delivery",
  "decisions_direction",
  "knowledge_enablement",
  "collaboration",
  "quality_reliability",
  "customer_impact",
]);
export type EpmTheme = z.infer<typeof EpmThemeSchema>;
export const FootprintQuerySchema = z.object({
  from: IsoDateSchema.optional(),
  to: IsoDateSchema.optional(),
  /** Direct managers may read a report's evidence pack; the employee always sees the same. */
  userId: z.string().min(1).max(200).optional(),
});
export const FootprintAnnotateSchema = z
  .object({
    note: z.string().trim().max(2000).optional(),
    hiddenInShare: z.boolean().optional(),
    highlighted: z.boolean().optional(),
    dispute: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export const BragDocGenerateSchema = z
  .object({
    from: IsoDateSchema,
    to: IsoDateSchema,
    title: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export const BragDocUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    title: z.string().trim().min(1).max(200).optional(),
    narrative: z.string().trim().max(20000).optional(),
    itemSelection: z.array(z.string().max(200)).max(500).optional(),
  })
  .strict();
export const BragDocShareSchema = z
  .object({
    version: z.number().int().positive(),
    withUserId: z.string().min(1).max(200).optional(),
    reviewId: IdSchema.optional(),
  })
  .strict();
/** Review cycle lifecycle (PRD §8.1.7). */
export const ReviewCyclePhaseSchema = z.enum([
  "draft",
  "scheduled",
  "self_review",
  "peer_input",
  "manager_review",
  "calibration",
  "sharing",
  "acknowledgement",
  "closed",
]);
export type ReviewCyclePhase = z.infer<typeof ReviewCyclePhaseSchema>;
export const ReviewCycleInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    periodStart: IsoDateSchema,
    periodEnd: IsoDateSchema,
    participantIds: z.array(z.string().min(1).max(200)).min(1).max(500),
    questions: z.array(z.string().trim().min(1).max(1000)).min(1).max(50),
    calibrationEnabled: z.boolean().default(false),
  })
  .strict();
export const ReviewTypeSchema = z.enum(["self", "manager", "peer"]);
export const ReviewSubmitSchema = z
  .object({
    version: z.number().int().positive(),
    answers: z.record(z.string().max(100), z.string().max(10000)),
    /** Company-defined, entered manually by a human; never generated (EP-1). */
    rating: z.string().trim().max(100).optional(),
  })
  .strict();
export const PeerRequestSchema = z
  .object({
    version: z.number().int().positive(),
    peerIds: z.array(z.string().min(1).max(200)).min(2).max(5),
  })
  .strict();
export const ReviewAcknowledgeSchema = z
  .object({
    version: z.number().int().positive(),
    comment: z.string().trim().max(4000).default(""),
  })
  .strict();
