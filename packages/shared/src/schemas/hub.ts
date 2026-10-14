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

/** The ten hub sections from PRD FR-HUB-002. */
export const HubSectionKeySchema = z.enum([
  "overview",
  "business_context",
  "architecture",
  "timeline",
  "decisions",
  "people",
  "current_state",
  "dependencies",
  "resources",
  "glossary",
]);
export type HubSectionKey = z.infer<typeof HubSectionKeySchema>;

export const HUB_SECTION_TITLES: Record<HubSectionKey, string> = {
  overview: "Overview",
  business_context: "Business & Product Context",
  architecture: "System / How it works",
  timeline: "Timeline & Milestones",
  decisions: "Decision Log",
  people: "People & Ownership",
  current_state: "Current State",
  dependencies: "Dependencies",
  resources: "Key Resources",
  glossary: "Glossary",
};

/** Display chips for claim status (PRD §8.1.1 / §12.2). */
export const ClaimChipSchema = z.enum(["Inferred", "Verified", "Stale", "Disputed", "Superseded"]);
export type ClaimChip = z.infer<typeof ClaimChipSchema>;

export const SectionDomainOwnerSchema = z.object({
  userId: z.string(),
  name: z.string(),
  /** Which assignment scope matched: section, project or workspace. */
  scope: z.enum(["section", "project", "workspace"]),
});

export const SectionSummarySchema = z.object({
  key: HubSectionKeySchema,
  title: z.string(),
  status: z.enum(["ready", "empty"]),
  claims: z.number().int().nonnegative(),
  lastGeneratedAt: IsoDateTimeSchema.nullable(),
  lastSourceChangeAt: IsoDateTimeSchema.nullable(),
  domainOwner: SectionDomainOwnerSchema.nullable(),
});
export type SectionSummary = z.infer<typeof SectionSummarySchema>;

/** Knowledge Health Score (PRD §8.13). */
export const KhsSchema = z.object({
  score: z.number().min(0).max(100),
  components: z.object({
    verifiedRatio: z.number(),
    staleRatio: z.number(),
    disputedRatio: z.number(),
    ownedRatio: z.number(),
    coverageRatio: z.number(),
    flagSlaRatio: z.number(),
  }),
  weights: z.object({
    verified: z.number(),
    fresh: z.number(),
    undisputed: z.number(),
    owned: z.number(),
    coverage: z.number(),
    flagSla: z.number(),
  }),
  /** Top improvement actions, each linking to a filtered queue. */
  improvements: z.array(z.object({ action: z.string(), count: z.number(), link: z.string() })),
  computedAt: IsoDateTimeSchema,
});
export type Khs = z.infer<typeof KhsSchema>;

export const HubTeamMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  role: z.string(),
  assignments: z.array(z.string()),
});

export const HubSchema = z.object({
  project: ProjectWithStatsSchema,
  overview: HubOverviewSchema.nullable(),
  sync: SyncStatusSchema,
  counts: z.record(ContextItemKindSchema, z.number().int().nonnegative()),
  khs: KhsSchema.nullable().optional(),
  sections: z.array(SectionSummarySchema).optional(),
  team: z.array(HubTeamMemberSchema).optional(),
});
export type Hub = z.infer<typeof HubSchema>;
