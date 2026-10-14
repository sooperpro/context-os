import { cn } from "cn";
import { useId, type ReactNode } from "react";
import { PreviewDataChip } from "@/components/preview-data-chip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshIcon, WarningIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";

/** The parts of a TanStack Query result a card needs to show loading and failure. */
export interface SectionStatus {
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
}

interface SectionCardProps extends Omit<React.ComponentProps<typeof Card>, "title"> {
  title: ReactNode;
  /** Muted figure after the title: "5 people", "3 · 1 in review". */
  count?: ReactNode;
  /** Trailing header control: an arrow link, a segmented filter. */
  action?: ReactNode;
  /** API path(s) the card reads, as passed to `apiRequest`; shows "Preview data" while mocked. */
  endpoint?: string | readonly string[];
  /** The card's query. While pending it shows a skeleton, on failure a retry; otherwise `children`. */
  status?: SectionStatus;
  footer?: ReactNode;
}

/**
 * A dashboard section (prototype `.card` with `.card-header`): title, muted count, preview marker and
 * a trailing action, then the body. Owns the loading and error states so every card behaves the same.
 */
export function SectionCard({
  title,
  count,
  action,
  endpoint,
  status,
  footer,
  children,
  className,
  ...props
}: SectionCardProps) {
  const headingId = useId();
  return (
    <Card
      role="region"
      aria-labelledby={headingId}
      className={cn("gap-4 px-6", className)}
      {...props}
    >
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-[1_1_180px] flex-wrap items-center gap-x-2 gap-y-1">
          <h2 id={headingId} className="font-heading text-xl leading-7 font-medium">
            {title}
          </h2>
          {count !== undefined && count !== null ? (
            <span className="text-base font-medium text-on-surface-variant tabular-nums">
              {count}
            </span>
          ) : null}
          <PreviewDataChip endpoint={endpoint} />
        </div>
        {action}
      </div>
      {status?.isPending ? (
        <div className="flex flex-col gap-0.5" aria-busy="true" aria-label="Loading">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-16 rounded-xs first:rounded-t-xl last:rounded-b-xl" />
          ))}
        </div>
      ) : status?.isError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-pane px-4 py-3 text-sm text-on-surface-variant">
          <WarningIcon className="size-5 text-error" aria-hidden />
          <span className="flex-1">This section could not be loaded.</span>
          <Button variant="outline" size="sm" onClick={() => void status.refetch()}>
            <RefreshIcon aria-hidden /> Retry
          </Button>
        </div>
      ) : (
        children
      )}
      {footer && !status?.isPending && !status?.isError ? (
        <div className="mt-auto flex flex-wrap items-center gap-2">{footer}</div>
      ) : null}
    </Card>
  );
}
