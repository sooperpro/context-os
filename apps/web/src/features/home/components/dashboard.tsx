import { cn } from "cn";

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
