import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";

/** Building blocks shared by the screen contracts (home, contributions, learning). */

/** A person as dashboards show them: name for the avatar, title for the second line. */
export const PersonRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().nullable(),
});
export type PersonRef = z.infer<typeof PersonRefSchema>;

/**
 * A manager's or path curator's draft waiting for People Ops (N-18): Owner, Admin and HR publish
 * directly; everyone else submits, and a reviewer publishes it or sends it back with a note.
 */
export const ReviewStateSchema = z.object({
  state: z.enum(["in_review", "changes_requested"]),
  /** The reviewer's note when it was sent back. */
  note: z.string().nullable(),
  /** Who submitted it (in review), or who sent it back. */
  by: PersonRefSchema.nullable(),
  at: IsoDateTimeSchema,
});
export type ReviewState = z.infer<typeof ReviewStateSchema>;

/** `POST …/send-back`: what the submitter should change. */
export const ReviewSendBackInputSchema = z
  .object({ note: z.string().trim().min(1).max(1000) })
  .strict();
export type ReviewSendBackInput = z.infer<typeof ReviewSendBackInputSchema>;

/** Where someone is against their onboarding plan. */
export const OnboardingStatusSchema = z.enum([
  "ahead",
  "on_track",
  "at_risk",
  "blocked",
  "not_started",
  "needs_setup",
  /** Starting soon with everything set up. */
  "ready",
]);
export type OnboardingStatus = z.infer<typeof OnboardingStatusSchema>;

export const KnowledgeOriginSchema = z.enum([
  "google_drive",
  "github",
  "slack",
  "jira",
  "confluence",
  "knowledge_hub",
  "loom",
]);
export type KnowledgeOrigin = z.infer<typeof KnowledgeOriginSchema>;

/** The Knowledge Hub collection a page belongs to (the hub's filters, minus "All"). */
export const KnowledgeSectionSchema = z.enum([
  "company",
  "product",
  "project",
  "system",
  "process",
  "decision",
  "glossary",
]);
export type KnowledgeSection = z.infer<typeof KnowledgeSectionSchema>;
