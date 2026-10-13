import type { ContextItem } from "@contextos/shared";
import { z } from "zod";
import type { ProjectRow } from "../../db/schema.js";
import type { GeminiClient } from "../../lib/gemini.js";

export const OVERVIEW_PROMPT_VERSION = "overview-v1";
const MAX_ITEMS = 150;

const cited = z.object({
  text: z
    .string()
    .describe(
      "One to three sentences. If the evidence does not establish this, say so explicitly.",
    ),
  refs: z
    .array(z.number().int())
    .describe(
      "Numbers of the context items (the N in I<N>) that support the text; empty if unsupported",
    ),
});

export const OverviewOutputSchema = z.object({
  whatItIs: cited.describe("What the project is"),
  problem: cited.describe("The business/user problem it addresses and why it exists"),
  users: cited.describe("Target users or customers"),
  howItWorks: cited.describe("Major components, integrations and how they fit together"),
  currentFocus: cited.describe("What is actively being worked on, blocked or at risk right now"),
  keyUnknowns: z
    .array(z.string())
    .describe("Important things a new joiner would want to know that the sources do not establish"),
});
export type OverviewOutput = z.infer<typeof OverviewOutputSchema>;

const SYSTEM_INSTRUCTION = [
  "You write the overview section of a project knowledge hub for people joining the project.",
  "You are given numbered context items (I1, I2, ...) that were extracted from the project's sources with evidence.",
  "Rules:",
  "1. Use only the context items. Do not add outside knowledge or guesses.",
  "2. Every sentence must be supported by the items you list in refs. If nothing supports an aspect, write that the sources do not establish it and leave refs empty.",
  "3. Separate current state from history: say 'as of <date>' when an item carries a date.",
  "4. Mention conflicts or uncertainty explicitly when items disagree.",
  "5. Be concise and concrete. No marketing language.",
].join("\n");

const KIND_PRIORITY = {
  decision: 0,
  status_claim: 1,
  event: 2,
  component: 3,
  dependency: 4,
  person: 5,
  term: 6,
} as const;

export function selectOverviewItems(items: ContextItem[]): ContextItem[] {
  return [...items]
    .sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind])
    .slice(0, MAX_ITEMS);
}

export function formatItemForPrompt(index: number, item: ContextItem): string {
  const date = item.eventAt ?? item.asOf;
  const when = date ? ` (${date.slice(0, 10)})` : "";
  const flags = [
    item.verification !== "inferred" ? item.verification : null,
    item.conflictsWith.length > 0 ? "CONFLICTING" : null,
    `confidence=${item.confidence}`,
  ]
    .filter(Boolean)
    .join(", ");
  return `I${index}: [${item.kind}] ${item.title}${when} — ${item.summary} [${flags}]`;
}

export async function generateOverview(
  gemini: GeminiClient,
  project: ProjectRow,
  items: ContextItem[],
): Promise<OverviewOutput> {
  const lines = items.map((item, i) => formatItemForPrompt(i + 1, item));
  const prompt = [
    `Project: ${project.name}`,
    project.description ? `Description given by the team: ${project.description}` : null,
    "",
    "Context items:",
    ...lines,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return gemini.generateStructured({
    purpose: "hub_overview",
    schema: OverviewOutputSchema,
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    temperature: 0.2,
  });
}
