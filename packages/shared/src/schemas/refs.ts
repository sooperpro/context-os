import { z } from "zod";

/** Building blocks shared by the screen contracts (home, contributions, learning). */

/** A person as dashboards show them: name for the avatar, title for the second line. */
export const PersonRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().nullable(),
});
export type PersonRef = z.infer<typeof PersonRefSchema>;

/** Where someone is against their onboarding plan. */
export const OnboardingStatusSchema = z.enum([
  "ahead",
  "on_track",
  "at_risk",
  "blocked",
  "not_started",
  "needs_setup",
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
