import { z } from "zod";
import {
  CompanionPreferencesSchema,
  MeSchema,
  NotificationPreferencesSchema,
  type CompanionPreferences,
  type Me,
  type NotificationPreferences,
  type ProfileUpdate,
  AssistantPreferencesInputSchema,
  AssistantPreferencesSchema,
  ConnectedAppListSchema,
  ConnectorListSchema,
  DataExportResultSchema,
  type AssistantPreferencesInput,
  type ConnectedApp,
} from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

export const fetchMe = (signal?: AbortSignal): Promise<Me> =>
  apiRequest("/v1/users/me", { schema: MeSchema, signal });

export const updateMe = (input: ProfileUpdate): Promise<unknown> =>
  apiRequest("/v1/users/me", {
    method: "PATCH",
    body: input,
    schema: MeSchema.omit({ role: true, workspaceId: true }).passthrough(),
  });

export const fetchNotificationPreferences = (
  signal?: AbortSignal,
): Promise<NotificationPreferences> =>
  apiRequest("/v1/notifications/preferences", { schema: NotificationPreferencesSchema, signal });

export const updateNotificationPreferences = (
  input: NotificationPreferences,
): Promise<NotificationPreferences> =>
  apiRequest("/v1/notifications/preferences", {
    method: "PATCH",
    body: input,
    schema: NotificationPreferencesSchema,
  });

export const fetchCompanionPreferences = (signal?: AbortSignal): Promise<CompanionPreferences> =>
  apiRequest("/v1/companion/preferences", { schema: CompanionPreferencesSchema, signal });

export const updateCompanionPreferences = (
  input: CompanionPreferences,
): Promise<CompanionPreferences> =>
  apiRequest("/v1/companion/preferences", {
    method: "PATCH",
    body: input,
    schema: CompanionPreferencesSchema,
  });

/* Assistant preferences and personal data export still use the development preview layer.
 * Connected apps are adapted from the live connector API.
 */
export const ACCOUNT_ENDPOINTS = {
  assistantPreferences: {
    path: "/v1/me/assistant-preferences",
    schema: AssistantPreferencesSchema,
  },
  updateAssistantPreferences: {
    path: "/v1/me/assistant-preferences",
    schema: AssistantPreferencesSchema,
    input: AssistantPreferencesInputSchema,
  },
  connectedApps: { path: "/v1/connectors", schema: ConnectedAppListSchema },
  disconnectApp: { path: "/v1/connectors/:id" },
  dataExport: {
    path: "/v1/me/data-export",
    schema: DataExportResultSchema,
    input: z.object({}).strict(),
  },
} as const;

export const fetchAssistantPreferences = (signal?: AbortSignal) =>
  apiRequest(ACCOUNT_ENDPOINTS.assistantPreferences.path, {
    schema: ACCOUNT_ENDPOINTS.assistantPreferences.schema,
    signal,
  });

export const updateAssistantPreferences = (input: AssistantPreferencesInput) =>
  apiRequest(ACCOUNT_ENDPOINTS.updateAssistantPreferences.path, {
    method: "PATCH",
    body: input,
    schema: ACCOUNT_ENDPOINTS.updateAssistantPreferences.schema,
  });

export const fetchConnectedApps = (signal?: AbortSignal) =>
  apiRequest(ACCOUNT_ENDPOINTS.connectedApps.path, { schema: ConnectorListSchema, signal }).then(
    (result) =>
      ConnectedAppListSchema.parse({
        items: result.items.map((connection): ConnectedApp => ({
          id: connection.id,
          name:
            connection.provider === "google_drive"
              ? "Google Drive"
              : connection.provider.replaceAll("_", " "),
          provider: connection.provider.replaceAll("_", "-"),
          description:
            connection.status === "needs_reauth"
              ? "Connection needs to be re-authorized"
              : `Connected as ${connection.accountId ?? "your account"}`,
          connectedAt: connection.createdAt ?? new Date(0).toISOString(),
        })),
      }),
  );

export const disconnectApp = async (id: string) => {
  await apiRequest(ACCOUNT_ENDPOINTS.disconnectApp.path.replace(":id", encodeURIComponent(id)), {
    method: "DELETE",
    query: { mode: "keep_derived" },
    schema: z.undefined(),
  });
  return fetchConnectedApps();
};

export const requestDataExport = () =>
  apiRequest(ACCOUNT_ENDPOINTS.dataExport.path, {
    method: "POST",
    body: {},
    schema: ACCOUNT_ENDPOINTS.dataExport.schema,
  });
