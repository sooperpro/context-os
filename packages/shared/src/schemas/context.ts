import { z } from "zod";
import { ConfidenceSchema, IdSchema, IsoDateTimeSchema, listOf } from "./common.js";
import { SourceKindSchema } from "./source.js";

export const ContextItemKindSchema = z.enum([
  "decision",
  "event",
  "status_claim",
  "person",
  "component",
  "dependency",
  "term",
  "company",
  "product",
  "initiative",
  "process",
]);
export type ContextItemKind = z.infer<typeof ContextItemKindSchema>;

/** Human/temporal verification state of a derived item. */
export const VerificationSchema = z.enum([
  "inferred",
  "confirmed",
  "stale",
  "disputed",
  "superseded",
]);
export type Verification = z.infer<typeof VerificationSchema>;

export const EvidenceSchema = z.object({
  id: IdSchema,
  sourceObjectId: IdSchema,
  chunkId: IdSchema.nullable(),
  sourceTitle: z.string(),
  sourceKind: SourceKindSchema,
  sourceUrl: z.string().nullable(),
  sourceCreatedAt: IsoDateTimeSchema.nullable(),
  /** Verbatim quote from the source supporting the item. */
  quote: z.string(),
  /** True when the quote was found in the source text. */
  quoteVerified: z.boolean(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const DecisionStatusSchema = z.enum(["proposed", "decided", "superseded", "disputed"]);
export const DecisionDataSchema = z.object({
  rationale: z.string().nullable(),
  alternatives: z.array(z.string()),
  participants: z.array(z.string()),
  consequences: z.string().nullable(),
  decisionStatus: DecisionStatusSchema,
});
export type DecisionData = z.infer<typeof DecisionDataSchema>;

export const EventCategorySchema = z.enum(["release", "incident", "milestone", "change", "other"]);
export const EventDataSchema = z.object({ category: EventCategorySchema });

export const StatusStateSchema = z.enum([
  "active",
  "blocked",
  "done",
  "planned",
  "risk",
  "open_question",
]);
export type StatusState = z.infer<typeof StatusStateSchema>;
export const StatusClaimDataSchema = z.object({ state: StatusStateSchema });

export const PersonDataSchema = z.object({
  role: z.string().nullable(),
  owns: z.array(z.string()),
});

export const ComponentTypeSchema = z.enum([
  "service",
  "library",
  "database",
  "integration",
  "external",
  "other",
]);
export const ComponentDataSchema = z.object({ componentType: ComponentTypeSchema });

export const DependencyRelationSchema = z.enum(["depends_on", "blocks", "integrates_with"]);
export const DependencyDataSchema = z.object({
  from: z.string(),
  to: z.string(),
  relation: DependencyRelationSchema,
});

export const TermDataSchema = z.object({ definition: z.string() });

/** Company, product, initiative (a project as the Hub's Projects collection means it) and process
 * items carry only their title and summary. */
export const CollectionEntryDataSchema = z.object({});

const base = {
  id: IdSchema,
  projectId: IdSchema,
  title: z.string(),
  summary: z.string(),
  /** When the described thing happened (event time), if known. */
  eventAt: IsoDateTimeSchema.nullable(),
  /** The point in time a status claim refers to, if known. */
  asOf: IsoDateTimeSchema.nullable(),
  verification: VerificationSchema,
  confidence: ConfidenceSchema,
  /** Ids of items making an incompatible claim about the same subject. */
  conflictsWith: z.array(IdSchema),
  /** Successor item when this claim was superseded (PRD §8.1.1); null otherwise. */
  supersededBy: IdSchema.nullable().optional(),
  evidence: z.array(EvidenceSchema),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
};

export const ContextItemSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("decision"), data: DecisionDataSchema }),
  z.object({ ...base, kind: z.literal("event"), data: EventDataSchema }),
  z.object({ ...base, kind: z.literal("status_claim"), data: StatusClaimDataSchema }),
  z.object({ ...base, kind: z.literal("person"), data: PersonDataSchema }),
  z.object({ ...base, kind: z.literal("component"), data: ComponentDataSchema }),
  z.object({ ...base, kind: z.literal("dependency"), data: DependencyDataSchema }),
  z.object({ ...base, kind: z.literal("term"), data: TermDataSchema }),
  z.object({ ...base, kind: z.literal("company"), data: CollectionEntryDataSchema }),
  z.object({ ...base, kind: z.literal("product"), data: CollectionEntryDataSchema }),
  z.object({ ...base, kind: z.literal("initiative"), data: CollectionEntryDataSchema }),
  z.object({ ...base, kind: z.literal("process"), data: CollectionEntryDataSchema }),
]);
export type ContextItem = z.infer<typeof ContextItemSchema>;
export type ContextItemOfKind<K extends ContextItemKind> = Extract<ContextItem, { kind: K }>;

export const ContextItemListSchema = listOf(ContextItemSchema);
export type ContextItemList = z.infer<typeof ContextItemListSchema>;

export const ListContextItemsQuerySchema = z.object({
  kind: ContextItemKindSchema.optional(),
});
export type ListContextItemsQuery = z.infer<typeof ListContextItemsQuerySchema>;

export const ContextItemIdParamSchema = z.object({ projectId: IdSchema, itemId: IdSchema });

export const SetVerificationInputSchema = z.object({
  verification: VerificationSchema,
});
export type SetVerificationInput = z.infer<typeof SetVerificationInputSchema>;
