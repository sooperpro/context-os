import {
  CompanionPreferencesSchema,
  MeSchema,
  NotificationPreferencesSchema,
  type CompanionPreferences,
  type Me,
  type NotificationPreferences,
  type ProfileUpdate,
} from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

export const fetchMe = (signal?: AbortSignal): Promise<Me> =>
  apiRequest("/v1/users/me", { schema: MeSchema, signal });

export const updateMe = (input: ProfileUpdate): Promise<unknown> =>
  apiRequest("/v1/users/me", { method: "PATCH", body: input, schema: MeSchema.omit({ role: true, workspaceId: true }).passthrough() });

export const fetchNotificationPreferences = (signal?: AbortSignal): Promise<NotificationPreferences> =>
  apiRequest("/v1/notifications/preferences", { schema: NotificationPreferencesSchema, signal });

export const updateNotificationPreferences = (input: NotificationPreferences): Promise<NotificationPreferences> =>
  apiRequest("/v1/notifications/preferences", { method: "PATCH", body: input, schema: NotificationPreferencesSchema });

export const fetchCompanionPreferences = (signal?: AbortSignal): Promise<CompanionPreferences> =>
  apiRequest("/v1/companion/preferences", { schema: CompanionPreferencesSchema, signal });

export const updateCompanionPreferences = (input: CompanionPreferences): Promise<CompanionPreferences> =>
  apiRequest("/v1/companion/preferences", { method: "PATCH", body: input, schema: CompanionPreferencesSchema });
