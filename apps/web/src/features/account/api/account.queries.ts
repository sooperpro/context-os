import type { CompanionPreferences, NotificationPreferences, ProfileUpdate } from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceKeys } from "@/features/workspace/api/workspace.queries";
import {
  fetchCompanionPreferences,
  fetchMe,
  fetchNotificationPreferences,
  updateCompanionPreferences,
  updateMe,
  updateNotificationPreferences,
} from "./account.api";

export const accountKeys = {
  all: ["account"] as const,
  me: () => [...accountKeys.all, "me"] as const,
  notifications: () => [...accountKeys.all, "notification-preferences"] as const,
  companion: () => [...accountKeys.all, "companion-preferences"] as const,
};

/** The signed-in person in the current workspace. Changes rarely. */
export const meQuery = () =>
  queryOptions({ queryKey: accountKeys.me(), queryFn: ({ signal }) => fetchMe(signal), staleTime: 5 * 60_000 });

export const notificationPreferencesQuery = () =>
  queryOptions({ queryKey: accountKeys.notifications(), queryFn: ({ signal }) => fetchNotificationPreferences(signal) });

export const companionPreferencesQuery = () =>
  queryOptions({ queryKey: accountKeys.companion(), queryFn: ({ signal }) => fetchCompanionPreferences(signal) });

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
