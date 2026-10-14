import { z } from "zod";
import { IdSchema } from "./common.js";

export const LedgerCurrencySchema = z.enum(["rp", "kc"]);
export type LedgerCurrency = z.infer<typeof LedgerCurrencySchema>;
export const LedgerStatusSchema = z.enum(["posted", "held", "clawed_back"]);
export type LedgerStatus = z.infer<typeof LedgerStatusSchema>;
/** Tiers by rolling 365-day Active RP (PRD §8.4.1). */
export const TierSchema = z.enum(["explorer", "contributor", "keeper", "steward", "sage"]);
export type Tier = z.infer<typeof TierSchema>;
export const TIER_THRESHOLDS: Record<Tier, number> = {
  explorer: 0,
  contributor: 100,
  keeper: 500,
  steward: 1500,
  sage: 4000,
};
export const LeaderboardQuerySchema = z.object({
  scope: z.enum(["company", "department", "team", "rising_stars"]).default("company"),
  window: z.enum(["month", "quarter", "all_time"]).default("month"),
  departmentId: IdSchema.optional(),
  teamId: IdSchema.optional(),
});
export const KudosArtifactTypeSchema = z.enum([
  "flag",
  "correction",
  "answer",
  "path",
  "bounty",
  "source",
  "context_item",
  "url",
]);
export const KudosInputSchema = z
  .object({
    toUserId: z.string().min(1).max(200),
    message: z.string().trim().min(3).max(1000),
    artifact: z
      .object({ type: KudosArtifactTypeSchema, ref: z.string().min(1).max(500) })
      .optional(),
  })
  .strict();
export const PointsAdjustmentInputSchema = z
  .object({
    userId: z.string().min(1).max(200),
    amount: z
      .number()
      .int()
      .min(-10000)
      .max(10000)
      .refine((value) => value !== 0, "Amount cannot be zero"),
    currency: LedgerCurrencySchema.default("rp"),
    reason: z.string().trim().min(3).max(2000),
  })
  .strict();
export const ClawbackInputSchema = z
  .object({ reason: z.string().trim().min(3).max(2000) })
  .strict();
export const AnomalyDecisionSchema = z
  .object({
    version: z.number().int().positive(),
    decision: z.enum(["release", "reject"]),
    note: z.string().trim().max(2000).default(""),
  })
  .strict();
export const BadgeKeySchema = z.enum([
  "first_flag",
  "myth_buster",
  "time_traveller",
  "peacemaker",
  "pathfinder",
  "curator_gold",
  "mentor_bronze",
  "mentor_silver",
  "mentor_gold",
  "fast_starter",
  "curious_mind",
  "checkpoint_champ",
  "orbit_copilot",
  "first_kudos",
  "kudos_magnet",
  "bounty_hunter",
  "context_champion",
]);
export type BadgeKey = z.infer<typeof BadgeKeySchema>;

// ----- rewards catalog (PRD §7.12) -----
export const RewardItemTypeSchema = z.enum([
  "swag",
  "gift_card",
  "experience",
  "time_off",
  "charity",
]);
export const RewardItemInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).default(""),
    imageUrl: z.url().optional(),
    itemType: RewardItemTypeSchema.default("swag"),
    kcCost: z.number().int().min(1).max(100000),
    /** Remaining stock; null means unlimited. */
    stock: z.number().int().min(0).nullable().default(null),
    eligibility: z
      .object({
        departmentIds: z.array(IdSchema).max(200).default([]),
        minTier: TierSchema.optional(),
      })
      .prefault({}),
    approvalRequired: z.boolean().default(true),
    fulfilmentNotes: z.string().trim().max(4000).default(""),
    isActive: z.boolean().default(true),
  })
  .strict();
export const RewardItemUpdateSchema = RewardItemInputSchema.partial()
  .extend({ version: z.number().int().positive() })
  .strict();
export const RedeemInputSchema = z
  .object({
    itemId: IdSchema,
    note: z.string().trim().max(2000).default(""),
    /** Stored encrypted; requires the connector token encryption key. */
    shipping: z.record(z.string().max(50), z.string().max(500)).optional(),
  })
  .strict();
export const RedemptionStatusSchema = z.enum([
  "pending_approval",
  "fulfilment_pending",
  "fulfilled",
  "rejected",
]);
export const RedemptionDecisionSchema = z
  .object({
    version: z.number().int().positive(),
    decision: z.enum(["approve", "reject", "fulfil"]),
    note: z.string().trim().max(2000).default(""),
  })
  .strict();
