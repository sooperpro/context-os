import type {
  AssistantPreferencesInput,
  CompanionPreferences,
  NotificationPreferences,
  ProfileUpdate,
} from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceKeys } from "@/features/workspace/api/workspace.queries";
import {
  disconnectApp,
  fetchAssistantPreferences,
  fetchCompanionPreferences,
  fetchConnectedApps,
  fetchMe,
  fetchNotificationPreferences,
  requestDataExport,
  updateAssistantPreferences,
  updateCompanionPreferences,
  updateMe,
  updateNotificationPreferences,
} from "./account.api";

export const accountKeys = {
  all: ["account"] as const,
  me: () => [...accountKeys.all, "me"] as const,
  notifications: () => [...accountKeys.all, "notification-preferences"] as const,
  companion: () => [...accountKeys.all, "companion-preferences"] as const,
  assistant: () => [...accountKeys.all, "assistant-preferences"] as const,
  apps: () => [...accountKeys.all, "connected-apps"] as const,
};

/** The signed-in person in the current workspace. Changes rarely. */
export const meQuery = () =>
  queryOptions({
    queryKey: accountKeys.me(),
    queryFn: ({ signal }) => fetchMe(signal),
    staleTime: 5 * 60_000,
  });

export const notificationPreferencesQuery = () =>
  queryOptions({
    queryKey: accountKeys.notifications(),
    queryFn: ({ signal }) => fetchNotificationPreferences(signal),
  });

export const companionPreferencesQuery = () =>
  queryOptions({
    queryKey: accountKeys.companion(),
    queryFn: ({ signal }) => fetchCompanionPreferences(signal),
  });

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileUpdate) => updateMe(input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: accountKeys.me() }),
        queryClient.invalidateQueries({ queryKey: workspaceKeys.all }),
      ]),
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NotificationPreferences) => updateNotificationPreferences(input),
    onSuccess: (saved) => queryClient.setQueryData(accountKeys.notifications(), saved),
  });
}

export function useUpdateCompanionPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CompanionPreferences) => updateCompanionPreferences(input),
    onSuccess: (saved) => queryClient.setQueryData(accountKeys.companion(), saved),
  });
}

export const assistantPreferencesQuery = () =>
  queryOptions({
    queryKey: accountKeys.assistant(),
    queryFn: ({ signal }) => fetchAssistantPreferences(signal),
    staleTime: 5 * 60_000,
  });

export const connectedAppsQuery = () =>
  queryOptions({
    queryKey: accountKeys.apps(),
    queryFn: ({ signal }) => fetchConnectedApps(signal),
  });

export function useUpdateAssistantPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssistantPreferencesInput) => updateAssistantPreferences(input),
    onSuccess: (preferences) => queryClient.setQueryData(accountKeys.assistant(), preferences),
  });
}

export function useDisconnectApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => disconnectApp(id),
    onSuccess: (apps) => queryClient.setQueryData(accountKeys.apps(), apps),
  });
}

export function useRequestDataExport() {
  return useMutation({ mutationFn: () => requestDataExport() });
}
