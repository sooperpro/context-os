import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";

/*
 * Personal settings view contracts (prototype Settings). Context Bot preferences and personal data
 * export are preview-backed; connected apps are adapted from the live connector contract. Sign-in
 * methods and sessions come from the identity provider. docs/api-change-requests.md tracks the
 * remaining work.
 */

/** `GET/PATCH /v1/me/assistant-preferences`. */
export const AssistantPreferencesSchema = z.object({
  /** On large screens, open Context Bot beside the lesson being read. */
  openBesideLessons: z.boolean(),
  /** Suggested questions in Context Bot, from the page and the person's stage. */
  showSuggestions: z.boolean(),
});
export type AssistantPreferences = z.infer<typeof AssistantPreferencesSchema>;
export const AssistantPreferencesInputSchema = AssistantPreferencesSchema.partial().strict();
export type AssistantPreferencesInput = z.infer<typeof AssistantPreferencesInputSchema>;

export const ConnectedAppSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Picks the logo: "slack". */
  provider: z.string(),
  /** "Sends your notifications and answers /context questions". */
  description: z.string(),
  connectedAt: IsoDateTimeSchema,
});
export type ConnectedApp = z.infer<typeof ConnectedAppSchema>;

/** Settings view model adapted from `GET /v1/connectors`. */
export const ConnectedAppListSchema = z.object({ items: z.array(ConnectedAppSchema) });

/** `POST /v1/me/data-export`: profile, contributions, check-in notes shared with them, Context Bot history. */
export const DataExportResultSchema = z.object({
  /** Where the download link goes. */
  email: z.string(),
  readyBy: IsoDateTimeSchema,
});
export type DataExportResult = z.infer<typeof DataExportResultSchema>;
