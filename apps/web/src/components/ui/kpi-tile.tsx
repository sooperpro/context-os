import { cn } from "cn";
import type { ReactNode } from "react";

/**
 * KPI tile: label on top, a large emphasized value anchored to the bottom, optional delta.
 * Mini tile: a compact label + value pair for secondary numbers.
 */
interface KpiTileProps extends React.ComponentProps<"div"> {
  label: ReactNode;
  value: ReactNode;
  /** Short comparison, e.g. "+3 this week". Pair with an icon so the direction is not color alone. */
  delta?: ReactNode;
  deltaTone?: "neutral" | "good" | "bad";
}

function KpiTile({
  className,
  label,
  value,
  delta,
  deltaTone = "neutral",
  ...props
}: KpiTileProps) {
  return (
    <div
      data-slot="kpi-tile"
      className={cn("flex min-w-0 flex-col gap-1 rounded-2xl bg-card px-6 py-5", className)}
      {...props}
    >
      <span className="text-sm font-medium text-on-surface-variant">{label}</span>
      <span className="mt-auto font-heading text-5xl leading-[52px] font-semibold tracking-tight tabular-nums">
        {value}
      </span>
      {delta ? (
        <span
          data-tone={deltaTone}
          className={cn(
            "inline-flex items-center gap-0.5 text-sm font-medium text-on-surface-variant [&_svg]:size-4",
            deltaTone === "good" && "text-success",
            deltaTone === "bad" && "text-error",
          )}
        >
          {delta}
        </span>
      ) : null}
    </div>
  );
}

interface MiniTileProps extends React.ComponentProps<"div"> {
  label: ReactNode;
  value: ReactNode;
  tone?: "neutral" | "warning" | "info" | "error";
}

function MiniTile({ className, label, value, tone = "neutral", ...props }: MiniTileProps) {
  return (
    <div
      data-slot="mini-tile"
      data-tone={tone}
      className={cn("flex flex-col gap-1 rounded-lg bg-pane px-4 py-3.5", className)}
      {...props}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium text-on-surface-variant [&_svg]:size-3.5",
          tone === "warning" && "text-warning",
          tone === "info" && "text-primary",
          tone === "error" && "text-error",
        )}
      >
        {label}
      </span>
      <span className="font-heading text-[28px] leading-8 font-semibold tracking-tight tabular-nums">
        {value}
      </span>
    </div>
  );
}

export { KpiTile, MiniTile };
