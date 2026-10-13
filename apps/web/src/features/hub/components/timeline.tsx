import type { ContextItem } from "@contextos/shared";
import { CalendarOffIcon } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ContextItemCard } from "@/features/hub/components/context-item-card";
import { formatDate } from "@/lib/format";

interface TimelineProps {
  projectId: string;
  items: ContextItem[];
}

/** Events and dated decisions, newest first; undated entries are listed separately. */
export function Timeline({ projectId, items }: TimelineProps) {
  const entries = items.filter((item) => item.kind === "event" || item.kind === "decision");
  const dated = entries
    .filter((item) => item.eventAt !== null)
    .sort((a, b) => (b.eventAt ?? "").localeCompare(a.eventAt ?? ""));
  const undated = entries.filter((item) => item.eventAt === null);

  if (entries.length === 0) {
    return (
      <Empty className="border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarOffIcon />
          </EmptyMedia>
          <EmptyTitle>No timeline yet</EmptyTitle>
          <EmptyDescription>
            Events and dated decisions appear here once sources that mention them are processed.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-8">
      {dated.length > 0 ? (
        <ol className="relative space-y-6 border-l border-border pl-6">
          {dated.map((item) => (
            <li key={item.id} className="relative">
              <span
                className="absolute top-1.5 -left-[31px] size-2.5 rounded-full border-2 border-primary bg-background"
                aria-hidden
              />
              <time
                dateTime={item.eventAt ?? undefined}
                className="mb-2 block text-xs font-medium text-muted-foreground"
              >
                {item.eventAt ? formatDate(item.eventAt) : ""}
              </time>
              <ContextItemCard projectId={projectId} item={item} />
            </li>
          ))}
        </ol>
      ) : null}
      {undated.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Undated
          </h3>
          {undated.map((item) => (
            <ContextItemCard key={item.id} projectId={projectId} item={item} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
