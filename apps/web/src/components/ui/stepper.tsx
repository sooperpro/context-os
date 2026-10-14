import { cn } from "cn";
import type { ReactNode } from "react";

/**
 * Horizontal wizard stepper: numbered 24px circles joined by 2px lines.
 * - done: tonal secondary container
 * - current: filled primary, aria-current="step"
 * - upcoming: outlined
 * Labels of non-current steps hide on narrow containers.
 */
type StepStatus = "done" | "current" | "upcoming";

function Stepper({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="stepper"
      className={cn("flex items-center gap-2 text-sm text-on-surface-variant", className)}
      {...props}
    />
  );
}

interface StepperItemProps extends React.ComponentProps<"li"> {
  index: number;
  status: StepStatus;
  /** Draw the connector line after this step. Omit on the last step. */
  connector?: boolean;
  children: ReactNode;
}

function StepperItem({
  className,
  index,
  status,
  connector = true,
  children,
  ...props
}: StepperItemProps) {
  return (
    <>
      <li
        data-slot="stepper-item"
        data-status={status}
        aria-current={status === "current" ? "step" : undefined}
        className={cn(
          "flex items-center gap-2 whitespace-nowrap",
          status === "current" && "text-on-surface",
          className,
        )}
        {...props}
      >
        <span
          aria-hidden
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium",
            status === "upcoming" && "shadow-[inset_0_0_0_2px_var(--color-outline-variant)]",
            status === "done" && "bg-secondary-container text-on-secondary-container",
            status === "current" && "bg-primary text-primary-foreground",
          )}
        >
          {index}
        </span>
        <span className={cn("font-medium", status !== "current" && "@max-[520px]:sr-only")}>
          {children}
        </span>
      </li>
      {connector ? (
        <li aria-hidden className="h-0.5 min-w-3 flex-1 rounded-full bg-outline-variant" />
      ) : null}
    </>
  );
}

export { Stepper, StepperItem };
export type { StepStatus };
