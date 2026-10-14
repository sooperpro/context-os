import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DoneAllIcon, NotificationsFilledIcon, NotificationsIcon } from "@/components/ui/icons";
import {
  isUnread,
  notificationsQuery,
  useMarkNotificationRead,
} from "@/features/notifications/api/notifications.queries";
import { formatDateTime } from "@/lib/format";

/** Bell with an unread dot (prototype `.has-badge .badge.dot`) and the recent notifications. */
export function NotificationsMenu() {
  const notifications = useQuery(notificationsQuery());
  const markRead = useMarkNotificationRead();
  const items = notifications.data ?? [];
  const unread = items.filter(isUnread);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative text-on-surface-variant"
            aria-label={unread.length > 0 ? `Notifications, ${unread.length} unread` : "Notifications"}
          />
        }
      >
        {unread.length > 0 ? <NotificationsFilledIcon /> : <NotificationsIcon />}
        {unread.length > 0 ? (
          <span aria-hidden className="absolute top-2 right-2 size-1.5 rounded-full bg-error" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notifications
          {unread.length > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => unread.forEach((item) => markRead.mutate(item.id))}
            >
              <DoneAllIcon /> Mark all read
            </Button>
          ) : null}
        </DropdownMenuLabel>
        {notifications.isError ? (
          <p className="px-2 py-3 text-xs text-on-surface-variant">Could not load notifications.</p>
        ) : items.length === 0 ? (
          <p className="px-2 py-3 text-xs text-on-surface-variant">
            Nothing yet. Check-ins, reviews and knowledge gaps routed to you will show up here.
          </p>
        ) : (
          items.slice(0, 8).map((item) => {
            const title = item.data.title ?? "Notification";
            const content = (
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={isUnread(item) ? "font-medium text-on-surface" : "text-on-surface-variant"}>
                  {title}
                </span>
                {item.data.body ? <span className="truncate text-xs text-on-surface-variant">{item.data.body}</span> : null}
                <span className="text-xs text-on-surface-variant">{formatDateTime(item.createdAt)}</span>
              </span>
            );
            return (
              <DropdownMenuItem
                key={item.id}
                className="items-start gap-3 py-2"
                onClick={() => isUnread(item) && markRead.mutate(item.id)}
                render={item.data.link ? <Link to={item.data.link} /> : undefined}
              >
                <span
                  aria-hidden
                  className={isUnread(item) ? "mt-2 size-2 shrink-0 rounded-full bg-primary" : "mt-2 size-2 shrink-0"}
                />
                {content}
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
