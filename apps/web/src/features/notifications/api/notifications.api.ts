import { NotificationListSchema, NotificationSchema, type Notification } from "@contextos/shared";
import { z } from "zod";
import { apiRequest } from "@/lib/api-client";

export async function listNotifications(
  signal?: AbortSignal,
  limit?: number,
): Promise<Notification[]> {
  const result = await apiRequest("/v1/notifications", {
    query: { limit },
    schema: NotificationListSchema,
    signal,
  });
  return result.items;
}

export function markNotificationRead(id: string): Promise<Notification> {
  return apiRequest(`/v1/notifications/${id}/read`, {
    method: "PATCH",
    schema: NotificationSchema,
  });
}

const ReadAllResultSchema = z.object({ updated: z.number().int().nonnegative() });

export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return apiRequest("/v1/notifications/read-all", {
    method: "POST",
    body: {},
    schema: ReadAllResultSchema,
  });
}
