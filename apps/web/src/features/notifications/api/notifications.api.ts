import { NotificationListSchema, NotificationSchema, type Notification } from "@contextos/shared";
import { apiRequest } from "@/lib/api-client";

export async function listNotifications(signal?: AbortSignal): Promise<Notification[]> {
  const result = await apiRequest("/v1/notifications", { schema: NotificationListSchema, signal });
  return result.items;
}

export function markNotificationRead(id: string): Promise<Notification> {
  return apiRequest(`/v1/notifications/${id}/read`, { method: "PATCH", schema: NotificationSchema });
}
