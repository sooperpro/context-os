import type { ContextItem } from "@contextos/shared";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { EventIcon } from "@/components/ui/icons";
import { ContextItemCard } from "@/features/hub/components/context-item-card";
import { KIND_ICON } from "@/features/hub/components/kind-icon";

interface TimelineProps {
  projectId: string;
  items: ContextItem[];
}

const DAY = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const YEAR = new Intl.DateTimeFormat(undefined, { year: "numeric" });

/**
 * Events and dated decisions, newest first, on the prototype's rail: date column, a dot with the
 * kind's icon, and the item. Undated entries are listed separately so dates are never invented.
 */
export function Timeline({ projectId, items }: TimelineProps) {
  const entries = items.filter((item) => item.kind === "event" || item.kind === "decision");
  const dated = entries
    .filter((item) => item.eventAt !== null)
    .sort((a, b) => (b.eventAt ?? "").localeCompare(a.eventAt ?? ""));
  const undated = entries.filter((item) => item.eventAt === null);
  const thisYear = YEAR.format(new Date());

  if (entries.length === 0) {
    return (
      <Empty className="border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <EventIcon />
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
        <ol className="flex flex-col" aria-label="Dated entries">
          {dated.map((item, index) => {
            const Icon = KIND_ICON[item.kind];
            const date = new Date(item.eventAt ?? "");
            const year = YEAR.format(date);
            return (
              <li key={item.id} className="grid grid-cols-[52px_32px_minmax(0,1fr)] gap-x-3">
                <time
                  dateTime={item.eventAt ?? undefined}
                  className="flex flex-col items-end pt-1 text-right text-xs leading-tight font-medium whitespace-nowrap text-on-surface-variant tabular-nums"
                >
                  {DAY.format(date)}
                  {year !== thisYear ? <span className="text-[10px]">{year}</span> : null}
                </time>
                <div className="relative flex justify-center">
                  <span
                    aria-hidden
                    className="relative z-10 grid size-8 place-items-center rounded-full bg-surface-container-high text-on-surface-variant [&_svg]:size-4"
                  >
                    <Icon />
                  </span>
                  {index < dated.length - 1 ? (
                    <span aria-hidden className="absolute top-9 bottom-1 w-0.5 rounded-full bg-outline-variant" />
                  ) : null}
                </div>
                <div className="min-w-0 pt-0.5 pb-5">
                  <ContextItemCard projectId={projectId} item={item} />
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      {undated.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-on-surface-variant">
            Undated ({undated.length}): the sources mention these without a date
          </h3>
          {undated.map((item) => (
            <ContextItemCard key={item.id} projectId={projectId} item={item} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
