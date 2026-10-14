import { cn } from "cn";
import type { ReactNode } from "react";
import { Shape } from "@/components/ui/shape";

/**
 * Vertical timeline (prototype `.timeline`): a date column, a rail of dots joined by a line, and the
 * entry. `soon` entries get the filled cookie dot; the rest sit on a neutral dot. Used for
 * milestones, roadmaps and activity.
 */
function Timeline({ className, ...props }: React.ComponentProps<"ol">) {
  return <ol data-slot="timeline" className={cn("flex flex-col", className)} {...props} />;
}

interface TimelineItemProps extends Omit<React.ComponentProps<"li">, "title"> {
  /** Small line above the date, e.g. the weekday. */
  dateLabel?: ReactNode;
  date: ReactNode;
  icon: ReactNode;
  state?: "soon" | "later" | "done";
  title: ReactNode;
  detail?: ReactNode;
}

function TimelineItem({
  dateLabel,
  date,
  icon,
  state = "later",
  title,
  detail,
  className,
  ...props
}: TimelineItemProps) {
  return (
    <li
      data-slot="timeline-item"
      data-state={state}
      className={cn("group/timeline grid grid-cols-[52px_32px_minmax(0,1fr)] gap-x-3", className)}
      {...props}
    >
      <div className="flex flex-col items-end pt-0.5 leading-tight whitespace-nowrap">
        {dateLabel ? (
          <span className="text-[11px] font-medium tracking-wide text-on-surface-variant">
            {dateLabel}
          </span>
        ) : null}
        <span className="text-sm font-medium tabular-nums">{date}</span>
      </div>
      <div className="relative flex justify-center">
        <span
          className={cn(
            "relative z-10 grid size-8 place-items-center rounded-full bg-surface-container-high text-on-surface-variant",
            state === "soon" && "rounded-none bg-transparent text-primary-foreground",
            state === "done" && "bg-success-container text-on-success-container",
          )}
        >
          {state === "soon" ? (
            <Shape kind="cookie4" className="absolute inset-0 size-full text-primary" />
          ) : null}
          <span className="relative z-10 grid place-items-center [&_svg]:size-4">{icon}</span>
        </span>
        <span
          aria-hidden
          className="absolute top-9 bottom-1 w-0.5 rounded-full bg-outline-variant group-last/timeline:hidden"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 pt-1 pb-5.5">
        <span className="text-sm font-medium">{title}</span>
        {detail ? <span className="text-xs text-on-surface-variant">{detail}</span> : null}
      </div>
    </li>
  );
}

export { Timeline, TimelineItem };
