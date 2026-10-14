import { z } from "zod";

/** Sources a ContextOS user can be linked to for permission parity and attribution (PRD §6.6). */
export const IdentityProviderSchema = z.enum(["slack", "google", "jira", "github"]);
export type IdentityProvider = z.infer<typeof IdentityProviderSchema>;
export const IdentityLinkStatusSchema = z.enum(["suggested", "confirmed", "rejected"]);
export type IdentityLinkStatus = z.infer<typeof IdentityLinkStatusSchema>;
/** How a link came to exist: provider OAuth, admin suggestion, user assertion or email auto-match. */
export const IdentityLinkSourceSchema = z.enum(["oauth", "admin", "user", "auto_match"]);
export const IdentityLinkInputSchema = z
  .object({
    provider: IdentityProviderSchema,
    externalId: z.string().trim().min(1).max(200).optional(),
    externalLogin: z.string().trim().min(1).max(200).optional(),
    email: z.email().optional(),
  })
  .strict();
export const AdminIdentityLinkInputSchema = IdentityLinkInputSchema.extend({
  externalId: z.string().trim().min(1).max(200),
});
export const IdentityLinkDecisionSchema = z
  .object({ status: z.enum(["confirmed", "rejected"]) })
  .strict();
