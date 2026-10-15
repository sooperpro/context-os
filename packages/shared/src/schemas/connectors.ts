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
/**
 * How often a selected scope re-syncs its files on its own: every two days, or only when someone
 * presses "Sync now" (always available). Syncing is a background job; nothing syncs on page load.
 */
export const SyncFrequencySchema = z.enum(["2d", "manual"]);
export type SyncFrequency = z.infer<typeof SyncFrequencySchema>;
/** Who can read what a scope imports: everyone in the workspace, or only people whose own account opens it in the tool. */
export const ScopeVisibilitySchema = z.enum(["workspace", "restricted"]);
export type ScopeVisibility = z.infer<typeof ScopeVisibilitySchema>;
export const ScopeSelectionSchema = z
  .object({
    scopeType: ScopeTypeSchema,
    externalId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/),
    name: z.string().trim().min(1).max(300),
    excluded: z.boolean().default(false),
    backfillFrom: IsoDateSchema.optional(),
    /** Defaults to permission mirroring (fail closed); the web app offers workspace sharing explicitly. */
    visibility: ScopeVisibilitySchema.default("restricted"),
    /** Omitted: a new scope syncs hourly and an existing one keeps its schedule. */
    frequency: SyncFrequencySchema.optional(),
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
