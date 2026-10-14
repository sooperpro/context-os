import { z } from "zod";
import { IdSchema, IsoDateSchema } from "./common.js";

export const ConnectorProviderSchema = z.enum(["google_drive", "slack", "jira", "github"]);
export type ConnectorProvider = z.infer<typeof ConnectorProviderSchema>;
/** Connector / scope sync lifecycle (PRD §8.1.8). */
export const ConnectorStatusSchema = z.enum([
  "connected",
  "needs_reauth",
  "degraded",
  "disconnected",
]);
export const ScopeTypeSchema = z.enum([
  "folder",
  "shared_drive",
  "channel",
  "jira_project",
  "repo",
]);
export type ScopeType = z.infer<typeof ScopeTypeSchema>;
export const ScopeStatusSchema = z.enum([
  "selected",
  "backfilling",
  "live",
  "degraded",
  "needs_reauth",
]);
export const ScopeSelectionSchema = z
  .object({
    scopeType: ScopeTypeSchema,
    externalId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/),
    name: z.string().trim().min(1).max(300),
    excluded: z.boolean().default(false),
    backfillFrom: IsoDateSchema.optional(),
  })
  .strict();
/** Replace the selected scopes a connection feeds into a project (FR-INT-005). */
export const ConnectorScopesInputSchema = z
  .object({ projectId: IdSchema, scopes: z.array(ScopeSelectionSchema).max(200) })
  .strict();
export const ConnectorSyncInputSchema = z.object({ scopeId: IdSchema.optional() }).strict();
/** Disconnect options (PRD §8.12): keep derived claims without updates, or purge. */
export const DisconnectModeSchema = z.enum(["purge", "keep_derived"]);
export const WebhookProviderSchema = z.enum(["slack", "github", "jira", "google_drive"]);
