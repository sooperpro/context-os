import type { Notification } from "@contextos/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications.api";

export const notificationKeys = {
  all: ["notifications"] as const,
};

export const isUnread = (notification: Notification) => notification.status !== "read";

/** Polled gently; the API has no push channel yet. */
export const notificationsQuery = () =>
  queryOptions({
    queryKey: notificationKeys.all,
    queryFn: ({ signal }) => listNotifications(signal),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: (updated) => {
      queryClient.setQueryData<Notification[]>(notificationKeys.all, (current) =>
        (current ?? []).map((item) => (item.id === updated.id ? updated : item)),
      );
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.setQueryData<Notification[]>(notificationKeys.all, (current) =>
        (current ?? []).map((item) => ({ ...item, status: "read" })),
      );
    },
  });
}
