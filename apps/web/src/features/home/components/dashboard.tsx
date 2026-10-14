import { cn } from "cn";
import type { ReactNode } from "react";

/**
 * The 12-column dashboard grid (prototype `.dash-grid`). Sections take a `span()`; below 940px of
 * content width every section is full width.
 */
export function DashboardGrid({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("grid grid-cols-12 items-stretch gap-3 medium:gap-4", className)}
      {...props}
    />
  );
}

/** Facts joined by the prototype's small dot separator (`.item-meta .sep`). Empty parts are skipped. */
export function DotList({ parts }: { parts: readonly ReactNode[] }) {
  const shown = parts.filter(
    (part) => part !== null && part !== undefined && part !== false && part !== "",
  );
  return (
    <>
      {shown.map((part, index) => (
        // Parts are positional facts with no identity of their own, so the index is the key.
        <span key={index} className="inline-flex items-center gap-2">
          {index > 0 ? (
            <span aria-hidden className="size-0.75 rounded-full bg-current opacity-60" />
          ) : null}
          {part}
        </span>
      ))}
    </>
  );
}
