import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";
import { PersonRefSchema } from "./refs.js";

/*
 * Context Bot outside a project (prototype bot.js): questions about the workspace, the person's
 * onboarding, their team or People Ops records, answered from everything they can access. Inside a
 * project the bot uses the Ask threads API instead. The web app's development mock layer answers
 * these until they are served; docs/api-change-requests.md tracks them.
 */

/** Where an answer comes from. `provider` picks the logo; `to` is an in-app page when there is one. */
export const AssistantSourceSchema = z.object({
  title: z.string(),
  /** "Google Drive", "Jira", "ContextOS". */
  system: z.string(),
  provider: z.string().nullable(),
  /** "Daniel Reyes · updated Sep 22". */
  detail: z.string(),
  url: z.string().nullable(),
  to: z.string().nullable(),
  /** "Jira sync is failing: may be out of date". */
  stale: z.string().nullable(),
});
export type AssistantSource = z.infer<typeof AssistantSourceSchema>;

/**
 * A paragraph or a list. Text may carry `**bold**` and `[n]` markers that cite `sources[n - 1]`.
 */
export const AnswerBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string() }),
  z.object({ type: z.literal("list"), ordered: z.boolean(), items: z.array(z.string()) }),
]);
export type AnswerBlock = z.infer<typeof AnswerBlockSchema>;

const SuggestedPersonSchema = z.object({ person: PersonRefSchema, why: z.string() });

export const AssistantAnswerSchema = z.object({
  id: z.string(),
  question: z.string(),
  /** `no_answer`: nothing reliable in reach, so no guess. `restricted`: a topic ContextOS never answers. */
  outcome: z.enum(["answered", "no_answer", "restricted"]),
  /** "Verified · 3 sources agree"; `partial` when a source is a draft or out of date. */
  confidence: z.object({ level: z.enum(["verified", "partial"]), label: z.string() }).nullable(),
  blocks: z.array(AnswerBlockSchema),
  note: z.string().nullable(),
  /** Someone to talk to: the owner in an answer, likely experts when there is no answer. */
  people: z.array(SuggestedPersonSchema),
  sources: z.array(AssistantSourceSchema),
  /** What was searched when nothing answered. */
  searched: z.array(z.string()),
  followups: z.array(z.string()),
  related: z.array(z.object({ kind: z.string(), title: z.string(), to: z.string() })),
  createdAt: IsoDateTimeSchema,
});
export type AssistantAnswer = z.infer<typeof AssistantAnswerSchema>;

/** `POST /v1/assistant/ask`: one question, with the page it was asked from as context. */
export const AssistantAskInputSchema = z
  .object({
    question: z.string().trim().min(3, "Ask a full question.").max(2000),
    /** The app path, so answers can lean on what the person is looking at. */
    page: z.string().max(500),
  })
  .strict();
export type AssistantAskInput = z.infer<typeof AssistantAskInputSchema>;

/** `POST /v1/assistant/answers/:id/feedback`: helpful or not, and why not. */
export const AssistantFeedbackInputSchema = z
  .object({
    helpful: z.boolean(),
    reason: z.enum(["incorrect", "out_of_date", "missing_source", "not_relevant"]).nullable(),
  })
  .strict();
export type AssistantFeedbackInput = z.infer<typeof AssistantFeedbackInputSchema>;

/** `POST /v1/assistant/gaps`: nothing answered this; the knowledge owners are told. */
export const KnowledgeGapInputSchema = z
  .object({ question: z.string().trim().min(3).max(2000) })
  .strict();
export const KnowledgeGapResultSchema = z.object({ id: z.string(), notified: z.string() });
export type KnowledgeGapResult = z.infer<typeof KnowledgeGapResultSchema>;

/* ---- The knowledge gaps list (`/knowledge-gaps`) -------------------------------------------- */

const GapCount = z.number().int().min(0);
export const GapStatusSchema = z.enum(["open", "answered", "dismissed"]);
export type GapStatus = z.infer<typeof GapStatusSchema>;

/**
 * Questions Context Bot couldn't answer, grouped when they mean the same thing ("How do I reset my
 * password?" and "reset password"). A group shows once someone reported it, or once enough
 * different people asked (`privacyFloor`): asking is private until then. Never says who asked.
 */
export const KnowledgeGapEntrySchema = z.object({
  id: z.string(),
  /** The wording asked most often. */
  question: z.string(),
  /** How many different wordings were grouped into this gap. */
  wordings: GapCount,
  asks: GapCount,
  askers: GapCount,
  /** Times someone reported it as a gap (shared on purpose). */
  reports: GapCount,
  project: z.object({ id: z.string(), name: z.string() }).nullable(),
  status: GapStatusSchema,
  firstAskedAt: IsoDateTimeSchema,
  lastAskedAt: IsoDateTimeSchema,
  /** Who marked it answered or dismissed, when and why; null while open. */
  resolution: z
    .object({ by: PersonRefSchema, at: IsoDateTimeSchema, note: z.string().nullable() })
    .nullable(),
});
export type KnowledgeGapEntry = z.infer<typeof KnowledgeGapEntrySchema>;

/** `GET /knowledge-gaps?status=&projectId=`: most asked first. */
export const KnowledgeGapEntryListSchema = z.object({
  items: z.array(KnowledgeGapEntrySchema),
  counts: z.object({ open: GapCount, answered: GapCount, dismissed: GapCount }),
  /** Different people who must ask before an unreported question shows. */
  privacyFloor: GapCount,
  /** "workspace" for admins, owners and workspace-wide domain owners; "projects" otherwise. */
  scope: z.enum(["workspace", "projects"]),
});
export type KnowledgeGapEntryList = z.infer<typeof KnowledgeGapEntryListSchema>;

export const KnowledgeGapQuerySchema = z.object({
  status: GapStatusSchema.default("open"),
  projectId: z.string().min(1).optional(),
});

/** `POST /knowledge-gaps/:id/status`: answered tells the people who reported it. */
export const GapStatusInputSchema = z
  .object({ status: GapStatusSchema, note: z.string().trim().max(500).optional() })
  .strict();
export type GapStatusInput = z.infer<typeof GapStatusInputSchema>;

export const AcknowledgedSchema = z.object({ ok: z.literal(true) });
