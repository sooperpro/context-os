import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common.js";
import { ContextItemKindSchema } from "./context.js";
import { ProjectWithStatsSchema } from "./project.js";

/** A synthesized statement plus the context items (and through them, sources) it rests on. */
export const CitedTextSchema = z.object({
  text: z.string(),
  evidenceItemIds: z.array(IdSchema),
});
export type CitedText = z.infer<typeof CitedTextSchema>;

export const HubOverviewSchema = z.object({
  whatItIs: CitedTextSchema,
  problem: CitedTextSchema,
  users: CitedTextSchema,
  howItWorks: CitedTextSchema,
  currentFocus: CitedTextSchema,
  /** Things the sources do not establish. Honest gaps, not guesses. */
  keyUnknowns: z.array(z.string()),
  model: z.string(),
  generatedAt: IsoDateTimeSchema,
  /** True when sources changed after this overview was generated. */
  stale: z.boolean(),
});
export type HubOverview = z.infer<typeof HubOverviewSchema>;

export const SyncStateSchema = z.enum(["idle", "processing", "attention"]);
export const SyncStatusSchema = z.object({
  state: SyncStateSchema,
  queued: z.number().int().nonnegative(),
  running: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  lastCompletedAt: IsoDateTimeSchema.nullable(),
});
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

export const HubSchema = z.object({
  project: ProjectWithStatsSchema,
  overview: HubOverviewSchema.nullable(),
  sync: SyncStatusSchema,
  counts: z.record(ContextItemKindSchema, z.number().int().nonnegative()),
});
export type Hub = z.infer<typeof HubSchema>;
