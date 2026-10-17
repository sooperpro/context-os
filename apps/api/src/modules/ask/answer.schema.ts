import { AnswerConfidenceSchema } from "@contextos/shared";
import { z } from "zod";

export const ANSWER_PROMPT_VERSION = "ask-v2";

export const AnswerOutputSchema = z.object({
  answer: z
    .string()
    .describe(
      "Direct answer formatted in Markdown: short paragraphs, bullet or numbered lists for steps and options, **bold** for key terms, `code` for system names, a small table when comparing. No headings for short answers. Reference evidence inline as [n] and directory facts as [Dn]. If the evidence is insufficient, say so plainly.",
    ),
  confidence: AnswerConfidenceSchema.describe(
    "high = directly stated by evidence; medium = well supported; low = partial/indirect; insufficient = the evidence does not establish an answer",
  ),
  rationale: z.string().describe("Why the evidence supports the answer").optional(),
  timelineContext: z
    .string()
    .describe("Relevant chronology or decision history, with dates when available")
    .optional(),
  currentState: z
    .object({
      statement: z.string().describe("What is true now according to the newest evidence"),
      asOf: z.string().describe("Date (YYYY-MM-DD) of the newest supporting evidence").optional(),
    })
    .optional(),
  uncertainties: z
    .array(z.string())
    .describe("Conflicts between sources, stale information, or gaps the reader should know about"),
  citations: z.array(
    z.object({
      ref: z.number().int().describe("Evidence passage number"),
      claim: z.string().describe("The specific claim this passage supports"),
    }),
  ),
  directoryRefs: z
    .array(z.number().int())
    .describe("Numbers of the directory facts (D<n>) the answer relies on")
    .optional(),
  relatedItemRefs: z
    .array(z.number().int())
    .describe("Numbers of the context items (C<n>) that are relevant to this answer"),
});
export type AnswerOutput = z.infer<typeof AnswerOutputSchema>;
