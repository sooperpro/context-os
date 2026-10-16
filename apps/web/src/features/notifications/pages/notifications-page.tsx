import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { CheckIcon, DoneAllIcon } from "@/components/ui/icons";
import {
  isUnread,
  notificationsPageQuery,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "@/features/notifications/api/notifications.queries";
import { formatDateTime } from "@/lib/format";

/** Every recent notification (the bell shows the latest 8), with an unread filter. */
export function NotificationsPage() {
  const query = useQuery(notificationsPageQuery());
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const all = query.data ?? [];
  const unread = all.filter(isUnread).length;
  const items = unreadOnly ? all.filter(isUnread) : all;

  return (
    <div className="mx-auto flex max-w-240 flex-col gap-3 medium:gap-4">
      <PageHeader
        title="Notifications"
        description="Check-ins, reviews, assignments and knowledge gaps routed to you."
        actions={
          unread ? (
            <Button variant="outline" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
              <DoneAllIcon aria-hidden /> Mark all read
            </Button>
          ) : undefined
        }
      />
      <SectionCard title="Latest" count={all.length} endpoint="/v1/notifications" status={query}>
        <div role="group" aria-label="Filter" className="flex flex-wrap gap-2">
          {([false, true] as const).map((value) => (
            <Chip
              key={String(value)}
              variant="filter"
              selected={unreadOnly === value}
              onClick={() => setUnreadOnly(value)}
            >
              {unreadOnly === value ? <CheckIcon aria-hidden /> : null}
              {value ? `Unread ${unread}` : "All"}
            </Chip>
          ))}
        </div>
        {items.length ? (
          <ul className="flex flex-col divide-y divide-outline-variant" aria-label="Notifications">
            {items.map((item) => {
              const body = (
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={isUnread(item) ? "font-medium" : "text-on-surface-variant"}>
                    {item.data.title ?? "Notification"}
                  </span>
                  {item.data.body ? (
                    <span className="text-sm text-on-surface-variant">{item.data.body}</span>
                  ) : null}
                  <span className="text-xs text-on-surface-variant">
                    {formatDateTime(item.createdAt)}
                  </span>
                </span>
              );
              const read = () => (isUnread(item) ? markRead.mutate(item.id) : undefined);
              return (
                <li key={item.id} className="flex items-start gap-3 py-3">
                  <span
                    aria-hidden
                    className={
                      isUnread(item)
                        ? "mt-2 size-2 shrink-0 rounded-full bg-primary"
                        : "mt-2 size-2 shrink-0"
                    }
                  />
                  {item.data.link && !item.data.link.startsWith("/api/") ? (
                    <Link
                      to={item.data.link}
                      onClick={read}
                      className="min-w-0 flex-1 hover:underline"
                    >
                      {body}
                    </Link>
                  ) : item.data.link ? (
                    // A file from the API (a data export): a real download, not an app route.
                    <a href={item.data.link} download onClick={read} className="min-w-0 flex-1">
                      {body}
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1">{body}</span>
                  )}
                  {isUnread(item) ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      aria-label={`Mark “${item.data.title ?? "notification"}” read`}
                      onClick={read}
                    >
                      Mark read
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : query.data ? (
          <p className="text-sm text-on-surface-variant">
            {unreadOnly ? "Nothing unread." : "Nothing yet."}
          </p>
        ) : null}
      </SectionCard>
    </div>
  );
}
