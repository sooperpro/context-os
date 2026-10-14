import { cn } from "cn";
import type { ReactNode } from "react";
import { Shape, type ShapeKind } from "@/components/ui/shape";

/**
 * Inline empty state (prototype `.empty-mini`): an icon on a shape, a title and a line of help, and
 * an optional action. For empty lists and "nothing yet" inside cards; full-page states use `Empty`.
 */
function EmptyMini({
  icon,
  shape = "cookie6",
  tone = "neutral",
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  shape?: ShapeKind;
  /** `celebrate` is the sunny "all done" look. */
  tone?: "neutral" | "celebrate";
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-4", className)}>
      <span
        aria-hidden
        className={cn(
          "relative grid size-14 shrink-0 place-items-center",
          tone === "celebrate" ? "text-on-primary-container" : "text-on-surface-variant",
        )}
      >
        <Shape
          kind={shape}
          className={cn(
            "absolute inset-0 size-full",
            tone === "celebrate" ? "text-primary-container" : "text-surface-container-highest",
          )}
        />
        <span className="relative z-10 [&_svg]:size-6">{icon}</span>
      </span>
      <div className="flex min-w-0 flex-[1_1_200px] flex-col">
        <b className="text-sm font-medium">{title}</b>
        {description ? <p className="text-xs text-on-surface-variant">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export { EmptyMini };
