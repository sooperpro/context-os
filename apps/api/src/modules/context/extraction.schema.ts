import {
  ComponentTypeSchema,
  ConfidenceSchema,
  DecisionStatusSchema,
  DependencyRelationSchema,
  EventCategorySchema,
  StatusStateSchema,
} from "@contextos/shared";
import { z } from "zod";

/** Keep Gemini-facing schemas simple: objects, arrays, strings, enums, optional fields. */
const quote = z
  .string()
  .describe(
    "Exact verbatim excerpt (one or two sentences) copied from the source that supports this item. Never paraphrase.",
  );
const confidence = ConfidenceSchema.describe(
  "high = stated explicitly; medium = clearly implied; low = indirect or partial support",
);
const date = z
  .string()
  .describe("Date as YYYY-MM-DD when the source states or clearly implies it; omit otherwise")
  .optional();

/** A company fact, product, initiative or process: the subject and what the source says about it. */
const collectionEntry = z.object({
  name: z.string(),
  summary: z.string(),
  evidenceQuote: quote,
  confidence,
});

export const ExtractionOutputSchema = z.object({
  decisions: z.array(
    z.object({
      title: z.string().describe("Short statement of what was decided or proposed"),
      summary: z.string(),
      rationale: z.string().optional(),
      alternatives: z.array(z.string()).describe("Alternatives considered, if mentioned"),
      participants: z.array(z.string()).describe("People involved, as named in the source"),
      consequences: z.string().optional(),
      decisionStatus: DecisionStatusSchema.describe(
        "proposed = suggested but not agreed; decided = agreed/approved; superseded = replaced later; disputed = contested",
      ),
      decidedAt: date,
      evidenceQuote: quote,
      confidence,
    }),
  ),
  events: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      category: EventCategorySchema,
      occurredAt: date,
      evidenceQuote: quote,
      confidence,
    }),
  ),
  statusClaims: z.array(
    z.object({
      title: z.string().describe("The subject the status is about (feature, component, task)"),
      summary: z.string().describe("The status statement itself"),
      state: StatusStateSchema,
      asOf: date,
      evidenceQuote: quote,
      confidence,
    }),
  ),
  people: z.array(
    z.object({
      name: z.string(),
      role: z.string().optional(),
      owns: z.array(z.string()).describe("Areas, components or responsibilities this person owns"),
      evidenceQuote: quote,
      confidence,
    }),
  ),
  components: z.array(
    z.object({
      name: z.string(),
      summary: z.string(),
      componentType: ComponentTypeSchema,
      evidenceQuote: quote,
      confidence,
    }),
  ),
  dependencies: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      relation: DependencyRelationSchema,
      summary: z.string(),
      evidenceQuote: quote,
      confidence,
    }),
  ),
  terms: z.array(
    z.object({
      term: z.string(),
      definition: z.string(),
      evidenceQuote: quote,
      confidence,
    }),
  ),
  companyFacts: z
    .array(collectionEntry)
    .describe("Facts about the company itself: mission, strategy, structure, policies"),
  products: z
    .array(collectionEntry)
    .describe("Products and services the company sells or offers, and how they work"),
  initiatives: z
    .array(collectionEntry)
    .describe("Projects and initiatives in flight or finished, and their history"),
  processes: z
    .array(collectionEntry)
    .describe("How work gets done: workflows, procedures, approvals, routines"),
});
export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;

export const EXTRACTION_PROMPT_VERSION = "extract-v2";
